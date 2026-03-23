import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { RDSDataClient, ExecuteStatementCommand } from '@aws-sdk/client-rds-data';

// ---------------------------------------------------------------------------
// Environment variables
// ---------------------------------------------------------------------------
const AUDIT_LOG_TABLE_NAME = process.env.AUDIT_LOG_TABLE_NAME!;
const DB_CLUSTER_ARN = process.env.DB_CLUSTER_ARN!;
const DB_SECRET_ARN = process.env.DB_SECRET_ARN!;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GapRecord {
  category: string;
  ticketCount: number;
  lastSeen: string;
}

interface StaleRecord {
  article_id: number;
  title: string;
  html_url: string;
  updated_at: string;
  indexed_at: string;
  days_since_index: number;
}

interface AuditLogItem {
  pk: string;
  sk: string;
  type?: string;
  kbHits?: number;
  category?: string;
  timestamp?: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Gap analysis — find ticket categories with zero KB hits in the past 7 days
// ---------------------------------------------------------------------------

async function findKBGaps(dynamo: DynamoDBDocumentClient): Promise<GapRecord[]> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();

  let items: AuditLogItem[] = [];

  try {
    // Scan audit log for entries where kbHits = 0
    // We filter in-memory for the 7-day window since sk/timestamp structure
    // may vary; DynamoDB scan with FilterExpression handles the kbHits=0 filter
    const result = await dynamo.send(new ScanCommand({
      TableName: AUDIT_LOG_TABLE_NAME,
      FilterExpression: '#t = :llm AND #kbHits = :zero',
      ExpressionAttributeNames: {
        '#t': 'type',
        '#kbHits': 'kbHits',
      },
      ExpressionAttributeValues: {
        ':llm': 'kb_retrieval',
        ':zero': 0,
      },
    }));

    items = (result.Items ?? []) as AuditLogItem[];
  } catch (err) {
    // If no kb_retrieval records exist yet (pipeline not yet deployed), return []
    console.warn('findKBGaps: scan error (pipeline may not be deployed yet):', err);
    return [];
  }

  // Filter to past 7 days and group by category
  const categoryMap = new Map<string, { count: number; lastSeen: string }>();

  for (const item of items) {
    const itemTimestamp: string = (item.timestamp as string | undefined) ?? (item.sk as string) ?? '';
    // Only include items from the past 7 days
    if (itemTimestamp < sevenDaysAgo) {
      continue;
    }

    const category: string = (item.category as string | undefined) ?? 'unknown';
    const existing = categoryMap.get(category);
    if (!existing) {
      categoryMap.set(category, { count: 1, lastSeen: itemTimestamp });
    } else {
      existing.count += 1;
      if (itemTimestamp > existing.lastSeen) {
        existing.lastSeen = itemTimestamp;
      }
    }
  }

  return Array.from(categoryMap.entries()).map(([category, data]) => ({
    category,
    ticketCount: data.count,
    lastSeen: data.lastSeen,
  }));
}

// ---------------------------------------------------------------------------
// Stale article detection — articles not re-indexed in 90+ days
// ---------------------------------------------------------------------------

async function findStaleArticles(rds: RDSDataClient): Promise<StaleRecord[]> {
  const result = await rds.send(new ExecuteStatementCommand({
    resourceArn: DB_CLUSTER_ARN,
    secretArn: DB_SECRET_ARN,
    database: 'meridian',
    sql: `
      SELECT DISTINCT article_id, title, html_url, updated_at, indexed_at
      FROM kb_articles
      WHERE indexed_at < NOW() - INTERVAL '90 days'
      ORDER BY indexed_at ASC
      LIMIT 50
    `,
    formatRecordsAs: 'JSON',
  }));

  const rows = JSON.parse(result.formattedRecords ?? '[]') as Array<{
    article_id: number;
    title: string;
    html_url: string;
    updated_at: string;
    indexed_at: string;
  }>;

  return rows.map(row => ({
    article_id: row.article_id,
    title: row.title,
    html_url: row.html_url,
    updated_at: row.updated_at,
    indexed_at: row.indexed_at,
    days_since_index: Math.floor((Date.now() - new Date(row.indexed_at).getTime()) / 86400000),
  }));
}

// ---------------------------------------------------------------------------
// Write gap + stale results to DynamoDB for Phase 4 sidebar retrieval
// ---------------------------------------------------------------------------

async function writeResults(
  dynamo: DynamoDBDocumentClient,
  gaps: GapRecord[],
  stale: StaleRecord[],
): Promise<void> {
  const date = new Date().toISOString().split('T')[0]; // e.g. 2026-03-23
  const generatedAt = new Date().toISOString();
  const ttl = Math.floor(Date.now() / 1000) + 90 * 24 * 3600; // 90-day TTL

  // Write gap summary: PK KB#GAP#{date}, SK SUMMARY
  await dynamo.send(new PutCommand({
    TableName: AUDIT_LOG_TABLE_NAME,
    Item: {
      pk: `KB#GAP#${date}`,
      sk: 'SUMMARY',
      gaps: JSON.stringify(gaps),
      generatedAt,
      ttl,
    },
  }));

  // Write stale summary: PK KB#STALE#{date}, SK SUMMARY
  await dynamo.send(new PutCommand({
    TableName: AUDIT_LOG_TABLE_NAME,
    Item: {
      pk: `KB#STALE#${date}`,
      sk: 'SUMMARY',
      articles: JSON.stringify(stale),
      generatedAt,
      ttl,
    },
  }));
}

// ---------------------------------------------------------------------------
// Lambda handler — weekly KB maintenance entry point
// ---------------------------------------------------------------------------

export async function handler(): Promise<{ gaps: number; staleArticles: number }> {
  const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
  const rds = new RDSDataClient({});

  let gaps: GapRecord[] = [];
  let stale: StaleRecord[] = [];

  // Gap analysis — non-fatal: pipeline may not yet have kb_retrieval records
  try {
    gaps = await findKBGaps(dynamo);
  } catch (err) {
    console.error('findKBGaps failed:', err);
    gaps = [];
  }

  // Stale article detection — non-fatal: kb_articles table may be empty
  try {
    stale = await findStaleArticles(rds);
  } catch (err) {
    console.error('findStaleArticles failed:', err);
    stale = [];
  }

  await writeResults(dynamo, gaps, stale);

  console.log(`KB maintenance complete: ${gaps.length} gaps, ${stale.length} stale articles`);

  return { gaps: gaps.length, staleArticles: stale.length };
}
