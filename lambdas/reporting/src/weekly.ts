import {
  DynamoDBClient,
  QueryCommand,
  ScanCommand,
  PutItemCommand,
  GetItemCommand,
} from '@aws-sdk/client-dynamodb';
import { S3Client, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';

// ---------------------------------------------------------------------------
// Report data interfaces
// ---------------------------------------------------------------------------

export interface TicketVolumeSection {
  total: number;
  byCategory: Record<string, number>;
  weekOf: string;
}

export interface AutomationRateSection {
  automationRate: number;  // percentage (0-100)
  totalSent: number;
  autoAccepted: number;
  weekOf: string;
}

export interface ReContactTrendSection {
  perCategoryRates: Record<string, number>;  // category → rate (0-1)
  weekOf: string;
}

export interface KbGapItem {
  category: string;
  gapDescription: string;
  detectedAt: string;
}

export interface KbGapSection {
  gaps: KbGapItem[];
  weekOf: string;
}

export interface VocPlatformStats {
  platform: string;
  averageRating: number;
  oneStarCount: number;
  totalCount: number;
}

export interface VocSummarySection {
  platforms: VocPlatformStats[];
  weekOf: string;
}

export interface PromptPerformanceRow {
  category: string;
  accuracy: number;         // percentage (0-100)
  meanEditDistance: number; // 0-1
  complianceFlagRate: number; // 0-1
  sampleSize: number;
}

export interface PromptPerformanceSection {
  rows: PromptPerformanceRow[];
  weekOf: string;
}

export interface ReportData {
  weekOf: string;                         // ISO date string — Monday start of the report week
  ticketVolume: TicketVolumeSection;
  automationRate: AutomationRateSection;
  reContactTrend: ReContactTrendSection;
  kbGaps: KbGapSection;
  vocSummary: VocSummarySection;
  promptPerformance: PromptPerformanceSection;
  generatedAt: string;                    // ISO timestamp
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const CATEGORIES = [
  'crypto_deposit',
  'payment_failure',
  'kyc',
  'card',
  'general',
  'feedback',
] as const;

/** Returns ISO date string 7 days ago (YYYY-MM-DD) for Zendesk query. */
function sevenDaysAgoDate(): string {
  const d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  return d.toISOString().split('T')[0]!;
}

/** Returns the ISO date string of the most recent Monday (start of current report week). */
function currentWeekOf(): string {
  const now = new Date();
  const day = now.getUTCDay(); // 0=Sun, 1=Mon, …, 6=Sat
  const daysToMonday = day === 0 ? 6 : day - 1;
  const monday = new Date(now.getTime() - daysToMonday * 24 * 60 * 60 * 1000);
  return monday.toISOString().split('T')[0]!;
}

/** 200ms delay between Zendesk Search API calls to avoid rate limit 429s. */
function delay200ms(): Promise<void> {
  return new Promise((r) => setTimeout(r, 200));
}

/** Fetches Zendesk search/count.json for a given query string. */
async function zendeskSearchCount(
  subdomain: string,
  apiToken: string,
  query: string,
): Promise<number> {
  const url = `https://${subdomain}.zendesk.com/api/v2/search/count.json?query=${encodeURIComponent(query)}`;
  const credentials = Buffer.from(`${subdomain}/token:${apiToken}`).toString('base64');

  const resp = await fetch(url, {
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/json',
    },
  });

  if (!resp.ok) {
    throw new Error(`Zendesk search/count failed: ${resp.status} ${resp.statusText}`);
  }

  const data = (await resp.json()) as { count: number };
  return data.count;
}

// ---------------------------------------------------------------------------
// Section 1 — Ticket Volume (Zendesk Search API with DynamoDB cache)
// ---------------------------------------------------------------------------

async function fetchTicketVolume(
  dynamo: DynamoDBClient,
  tableName: string,
  weekOf: string,
  subdomain: string,
  apiToken: string,
): Promise<TicketVolumeSection> {
  // Check DynamoDB cache first — if record exists, skip Zendesk calls (handles Lambda retry)
  const cacheKey = await dynamo.send(new GetItemCommand({
    TableName: tableName,
    Key: {
      pk: { S: 'REPORT#weekly' },
      sk: { S: `VOLUME#${weekOf}` },
    },
  }));

  if (cacheKey.Item) {
    const cached = cacheKey.Item;
    return {
      total: parseInt(cached['total']?.N ?? '0', 10),
      byCategory: JSON.parse(cached['byCategory']?.S ?? '{}') as Record<string, number>,
      weekOf,
    };
  }

  // Cache miss — query Zendesk Search API
  const sevenDaysAgo = sevenDaysAgoDate();
  const totalQuery = `type:ticket created>${sevenDaysAgo}`;
  const total = await zendeskSearchCount(subdomain, apiToken, totalQuery);

  const byCategory: Record<string, number> = {};

  for (const category of CATEGORIES) {
    await delay200ms();
    const catQuery = `type:ticket created>${sevenDaysAgo} tags:${category}`;
    byCategory[category] = await zendeskSearchCount(subdomain, apiToken, catQuery);
  }

  // Cache result in DynamoDB with 8-day TTL
  const ttl = Math.floor(Date.now() / 1000) + 8 * 24 * 60 * 60;
  await dynamo.send(new PutItemCommand({
    TableName: tableName,
    Item: {
      pk: { S: 'REPORT#weekly' },
      sk: { S: `VOLUME#${weekOf}` },
      total: { N: String(total) },
      byCategory: { S: JSON.stringify(byCategory) },
      weekOf: { S: weekOf },
      ttl: { N: String(ttl) },
      createdAt: { S: new Date().toISOString() },
    },
  }));

  return { total, byCategory, weekOf };
}

// ---------------------------------------------------------------------------
// Section 2 — Automation Rate (METRICS#acceptance records)
// ---------------------------------------------------------------------------

async function fetchAutomationRate(
  dynamo: DynamoDBClient,
  tableName: string,
  weekOf: string,
): Promise<AutomationRateSection> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const result = await dynamo.send(new QueryCommand({
    TableName: tableName,
    KeyConditionExpression: 'pk = :pk AND sk > :since',
    ExpressionAttributeValues: {
      ':pk': { S: 'METRICS#acceptance' },
      ':since': { S: `ACCEPTANCE#${sevenDaysAgo}` },
    },
  }));

  const items = result.Items ?? [];
  const sentItems = items.filter((item) => item['sent']?.BOOL === true);
  const autoAccepted = sentItems.filter(
    (item) => parseFloat(item['editDistancePct']?.N ?? '1') < 0.20,
  ).length;

  const automationRate = sentItems.length > 0
    ? (autoAccepted / sentItems.length) * 100
    : 0;

  return {
    automationRate: parseFloat(automationRate.toFixed(2)),
    totalSent: sentItems.length,
    autoAccepted,
    weekOf,
  };
}

// ---------------------------------------------------------------------------
// Section 3 — Re-contact Trend (MONITOR#recontact records from MonitoringLambda)
// ---------------------------------------------------------------------------

async function fetchReContactTrend(
  dynamo: DynamoDBClient,
  tableName: string,
  weekOf: string,
): Promise<ReContactTrendSection> {
  // Read most recent MONITOR#recontact record for this week
  const result = await dynamo.send(new QueryCommand({
    TableName: tableName,
    KeyConditionExpression: 'pk = :pk AND begins_with(sk, :skPrefix)',
    ExpressionAttributeValues: {
      ':pk': { S: 'MONITOR#recontact' },
      ':skPrefix': { S: 'RECONTACT#' },
    },
    ScanIndexForward: false,  // most recent first
    Limit: 1,
  }));

  const item = result.Items?.[0];
  if (!item) {
    return { perCategoryRates: {}, weekOf };
  }

  const categoryBreakdown = JSON.parse(item['categoryBreakdown']?.S ?? '{}') as Record<string, number>;
  const totalTickets = parseInt(item['totalTickets']?.N ?? '0', 10);

  // Convert counts to rates
  const perCategoryRates: Record<string, number> = {};
  for (const [category, count] of Object.entries(categoryBreakdown)) {
    perCategoryRates[category] = totalTickets > 0 ? count / totalTickets : 0;
  }

  return { perCategoryRates, weekOf };
}

// ---------------------------------------------------------------------------
// Section 4 — KB Gaps (KB#GAP# records from KbMaintenanceLambda)
// ---------------------------------------------------------------------------

async function fetchKbGaps(
  dynamo: DynamoDBClient,
  tableName: string,
  weekOf: string,
): Promise<KbGapSection> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const result = await dynamo.send(new ScanCommand({
    TableName: tableName,
    FilterExpression: 'begins_with(pk, :prefix) AND createdAt > :since',
    ExpressionAttributeValues: {
      ':prefix': { S: 'KB#GAP#' },
      ':since': { S: sevenDaysAgo },
    },
    Limit: 100,
  }));

  const items = result.Items ?? [];
  const gaps: KbGapItem[] = items.map((item) => ({
    category: item['category']?.S ?? item['pk']?.S?.replace('KB#GAP#', '') ?? 'unknown',
    gapDescription: item['description']?.S ?? item['missingTopics']?.S ?? 'No KB articles for category',
    detectedAt: item['createdAt']?.S ?? '',
  }));

  return { gaps, weekOf };
}

// ---------------------------------------------------------------------------
// Section 5 — VoC Summary (S3 review JSON files)
// ---------------------------------------------------------------------------

interface ReviewFile {
  rating: number;
  createdAt?: string;
  date?: string;
  timestamp?: string;
}

async function fetchVocSummary(
  s3: S3Client,
  bucketName: string,
  weekOf: string,
): Promise<VocSummarySection> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const platformPrefixes = [
    { prefix: 'reviews/trustpilot', platform: 'trustpilot' },
    { prefix: 'reviews/app_store', platform: 'app_store' },
    { prefix: 'reviews/google_play', platform: 'google_play' },
  ];

  const platforms: VocPlatformStats[] = [];

  for (const { prefix, platform } of platformPrefixes) {
    // List most recent 3 objects for this prefix
    const listResult = await s3.send(new ListObjectsV2Command({
      Bucket: bucketName,
      Prefix: prefix,
      MaxKeys: 3,
    }));

    const objects = listResult.Contents ?? [];
    // Sort by LastModified descending, take 3 most recent
    const sortedObjects = objects
      .filter((o) => o.Key)
      .sort((a, b) => (b.LastModified?.getTime() ?? 0) - (a.LastModified?.getTime() ?? 0))
      .slice(0, 3);

    let totalRating = 0;
    let totalCount = 0;
    let oneStarCount = 0;

    for (const obj of sortedObjects) {
      try {
        const getResult = await s3.send(new GetObjectCommand({
          Bucket: bucketName,
          Key: obj.Key!,
        }));

        const body = await getResult.Body?.transformToString();
        if (!body) continue;

        // Parse JSONL (one review per line)
        const lines = body.trim().split('\n').filter(Boolean);
        for (const line of lines) {
          try {
            const review = JSON.parse(line) as ReviewFile;
            const reviewDate = new Date(
              review.createdAt ?? review.date ?? review.timestamp ?? 0,
            );
            if (reviewDate >= sevenDaysAgo) {
              totalCount++;
              totalRating += review.rating ?? 0;
              if (review.rating === 1) oneStarCount++;
            }
          } catch { /* skip unparseable lines */ }
        }
      } catch { /* skip unreadable S3 objects */ }
    }

    platforms.push({
      platform,
      averageRating: totalCount > 0 ? parseFloat((totalRating / totalCount).toFixed(2)) : 0,
      oneStarCount,
      totalCount,
    });
  }

  return { platforms, weekOf };
}

// ---------------------------------------------------------------------------
// Section 6 — Prompt Performance (MONITOR#prompt# records from MonitoringLambda)
// ---------------------------------------------------------------------------

async function fetchPromptPerformance(
  dynamo: DynamoDBClient,
  tableName: string,
  weekOf: string,
): Promise<PromptPerformanceSection> {
  const result = await dynamo.send(new QueryCommand({
    TableName: tableName,
    KeyConditionExpression: 'pk = :pk AND begins_with(sk, :skPrefix)',
    ExpressionAttributeValues: {
      ':pk': { S: 'MONITOR#prompt' },
      ':skPrefix': { S: `PROMPT#` },
    },
  }));

  const items = result.Items ?? [];
  // Filter to current weekOf only
  const weekItems = items.filter((item) => item['weekOf']?.S === weekOf);

  const rows: PromptPerformanceRow[] = weekItems.map((item) => ({
    category: item['category']?.S ?? 'unknown',
    accuracy: parseFloat(item['accuracy']?.N ?? '0'),
    meanEditDistance: parseFloat(item['meanEditDistance']?.N ?? '0'),
    complianceFlagRate: parseFloat(item['complianceFlagRate']?.N ?? '0'),
    sampleSize: parseInt(item['sampleSize']?.N ?? '0', 10),
  }));

  return { rows, weekOf };
}

// ---------------------------------------------------------------------------
// Main export — buildWeeklyCxReport()
// ---------------------------------------------------------------------------

export async function buildWeeklyCxReport(): Promise<ReportData> {
  const tableName = process.env.AUDIT_TABLE_NAME!;
  const bucketName = process.env.S3_ASSETS_BUCKET!;
  const subdomain = process.env.ZENDESK_SUBDOMAIN!;
  const apiToken = process.env.ZENDESK_API_TOKEN!;

  const weekOf = currentWeekOf();
  const generatedAt = new Date().toISOString();

  const dynamo = new DynamoDBClient({});
  const s3 = new S3Client({});

  // Fetch all sections (ticket volume has rate limiting, others are parallel-safe but
  // we run sequentially to keep DynamoDB read pressure low)
  const ticketVolume = await fetchTicketVolume(dynamo, tableName, weekOf, subdomain, apiToken);
  const automationRate = await fetchAutomationRate(dynamo, tableName, weekOf);
  const reContactTrend = await fetchReContactTrend(dynamo, tableName, weekOf);
  const kbGaps = await fetchKbGaps(dynamo, tableName, weekOf);
  const vocSummary = await fetchVocSummary(s3, bucketName, weekOf);
  const promptPerformance = await fetchPromptPerformance(dynamo, tableName, weekOf);

  return {
    weekOf,
    ticketVolume,
    automationRate,
    reContactTrend,
    kbGaps,
    vocSummary,
    promptPerformance,
    generatedAt,
  };
}
