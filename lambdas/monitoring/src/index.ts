import { DynamoDBClient, QueryCommand, PutItemCommand, ScanCommand } from '@aws-sdk/client-dynamodb';

const dynamo = new DynamoDBClient({});

export interface MonitoringOutput {
  spotCheckCount: number;
  editDistanceAlerts: string[];   // categories with >30% edit rate
  reContactAlerts: string[];      // categories with rising re-contact rate
  runbookUsage: Record<string, number>;  // runbookId → count this week
  runAt: string;
}

// ---------------------------------------------------------------------------
// Job 1 — Spot-check sampling (EVAL-03)
// Queries METRICS#acceptance records from last 7 days, samples 5%, and writes
// MONITOR#spotcheck records for CX lead review.
// ---------------------------------------------------------------------------

async function runSpotCheckSampling(tableName: string): Promise<number> {
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
  // 5% random sample — minimum 1 if any items exist
  const sampleSize = Math.max(items.length > 0 ? 1 : 0, Math.ceil(items.length * 0.05));
  const shuffled = items.sort(() => Math.random() - 0.5).slice(0, sampleSize);

  const now = new Date().toISOString();
  for (const item of shuffled) {
    await dynamo.send(new PutItemCommand({
      TableName: tableName,
      Item: {
        pk: { S: 'MONITOR#spotcheck' },
        sk: { S: `SPOTCHECK#${now}#${item['ticketId']?.S ?? 'unknown'}` },
        ticketId: { S: item['ticketId']?.S ?? 'unknown' },
        agentId: { S: item['agentId']?.S ?? 'unknown' },
        editRatio: { N: item['editRatio']?.N ?? '0' },
        status: { S: 'pending_review' },  // CX lead sets to 'reviewed' | 'flagged'
        createdAt: { S: now },
      },
    }));
  }

  return shuffled.length;
}

// ---------------------------------------------------------------------------
// Job 2 — Edit distance alerts by category (EVAL-04)
// Queries METRICS#acceptance records for last 7 days, groups by urgency (category
// proxy). If mean editRatio > 0.30 with >= 10 samples, writes a MONITOR#editdistance
// alert record and returns the category.
// ---------------------------------------------------------------------------

async function runEditDistanceTracking(tableName: string): Promise<string[]> {
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
  const byUrgency: Record<string, number[]> = {};

  for (const item of items) {
    const urgency = item['urgency']?.S ?? 'unknown';
    const ratio = parseFloat(item['editRatio']?.N ?? '0');
    byUrgency[urgency] = byUrgency[urgency] ?? [];
    byUrgency[urgency].push(ratio);
  }

  const alerts: string[] = [];
  const now = new Date().toISOString();

  for (const [urgency, ratios] of Object.entries(byUrgency)) {
    if (ratios.length < 10) continue;  // insufficient data
    const meanRatio = ratios.reduce((a, b) => a + b, 0) / ratios.length;
    if (meanRatio > 0.30) {
      alerts.push(urgency);
      await dynamo.send(new PutItemCommand({
        TableName: tableName,
        Item: {
          pk: { S: 'MONITOR#editdistance' },
          sk: { S: `ALERT#${now}#${urgency}` },
          urgency: { S: urgency },
          meanEditRatio: { N: String(meanRatio.toFixed(4)) },
          sampleCount: { N: String(ratios.length) },
          threshold: { N: '0.30' },
          action: { S: 'queue_for_prompt_tuning' },
          createdAt: { S: now },
        },
      }));
    }
  }

  return alerts;
}

// ---------------------------------------------------------------------------
// Job 3 — Re-contact rate tracking (EVAL-05)
// Scans CLASSIFICATION# records in the last 48h window. Groups by category.
// Flags categories with > 15% of total ticket volume as high re-contact risk.
//
// Note: CLASSIFICATION# records do not currently store requesterEmail.
// This implementation uses category ticket-volume as a proxy for re-contact risk.
// Exact per-customer re-contact tracking requires adding requesterEmail to the
// CLASSIFICATION# record schema — tracked as a Phase 6 gap.
// ---------------------------------------------------------------------------

async function runReContactTracking(tableName: string): Promise<string[]> {
  const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  const now = new Date().toISOString();

  // Scan for recent CLASSIFICATION# records (weekly job — Scan acceptable)
  const result = await dynamo.send(new ScanCommand({
    TableName: tableName,
    FilterExpression: '#type = :type AND createdAt > :since',
    ExpressionAttributeNames: { '#type': 'type' },
    ExpressionAttributeValues: {
      ':type': { S: 'ticket_classification' },
      ':since': { S: fortyEightHoursAgo },
    },
    Limit: 1000,  // cap scan cost
  }));

  const items = result.Items ?? [];

  // Group by category to proxy re-contact rate
  // Note: requesterEmail not stored in classification record — use category volume as proxy
  // Real implementation needs requesterEmail in the CLASSIFICATION# record (Phase 6 gap)
  const ticketCategory: Record<string, string> = {};

  for (const item of items) {
    const ticketId = item['ticketId']?.S ?? '';
    const classJson = item['classification']?.S ?? '{}';
    try {
      const cls = JSON.parse(classJson) as { category?: string; language?: string };
      ticketCategory[ticketId] = cls.category ?? 'unknown';
    } catch { /* skip unparseable */ }
  }

  // Compute re-contact rate by category: categories with >15% of total ticket volume
  const categoryCount: Record<string, number> = {};
  for (const cat of Object.values(ticketCategory)) {
    categoryCount[cat] = (categoryCount[cat] ?? 0) + 1;
  }

  const alerts: string[] = [];
  const totalTickets = items.length;

  for (const [category, count] of Object.entries(categoryCount)) {
    // Flag categories with high volume for re-contact review
    if (totalTickets > 0 && count / totalTickets > 0.15) {
      alerts.push(category);
    }
  }

  await dynamo.send(new PutItemCommand({
    TableName: tableName,
    Item: {
      pk: { S: 'MONITOR#recontact' },
      sk: { S: `RECONTACT#${now}` },
      windowHours: { N: '48' },
      totalTickets: { N: String(totalTickets) },
      categoryBreakdown: { S: JSON.stringify(categoryCount) },
      alertCategories: { S: JSON.stringify(alerts) },
      createdAt: { S: now },
    },
  }));

  return alerts;
}

// ---------------------------------------------------------------------------
// Job 4 — Runbook usage metrics (CHG-05)
// Scans RUNBOOK# records from the last 7 days, groups by runbookId, writes a
// MONITOR#runbook_usage record with per-runbook weekly execution counts.
// ---------------------------------------------------------------------------

async function runRunbookUsageMetrics(tableName: string): Promise<Record<string, number>> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const now = new Date().toISOString();

  const result = await dynamo.send(new ScanCommand({
    TableName: tableName,
    FilterExpression: 'begins_with(pk, :prefix) AND createdAt > :since',
    ExpressionAttributeValues: {
      ':prefix': { S: 'RUNBOOK#' },
      ':since': { S: sevenDaysAgo },
    },
    Limit: 5000,
  }));

  const items = result.Items ?? [];
  const usage: Record<string, number> = {};

  for (const item of items) {
    const runbookId = item['runbookId']?.S ?? 'unknown';
    usage[runbookId] = (usage[runbookId] ?? 0) + 1;
  }

  await dynamo.send(new PutItemCommand({
    TableName: tableName,
    Item: {
      pk: { S: 'MONITOR#runbook_usage' },
      sk: { S: `USAGE#${now}` },
      weekOf: { S: sevenDaysAgo },
      usageCounts: { S: JSON.stringify(usage) },
      totalExecutions: { N: String(items.length) },
      createdAt: { S: now },
    },
  }));

  return usage;
}

// ---------------------------------------------------------------------------
// Lambda handler — weekly monitoring entry point
// Runs all 4 monitoring jobs in parallel and returns a MonitoringOutput.
// ---------------------------------------------------------------------------

export async function handler(): Promise<MonitoringOutput> {
  const tableName = process.env.AUDIT_TABLE_NAME!;

  const [spotCheckCount, editDistanceAlerts, reContactAlerts, runbookUsage] = await Promise.all([
    runSpotCheckSampling(tableName),
    runEditDistanceTracking(tableName),
    runReContactTracking(tableName),
    runRunbookUsageMetrics(tableName),
  ]);

  const result: MonitoringOutput = {
    spotCheckCount,
    editDistanceAlerts,
    reContactAlerts,
    runbookUsage,
    runAt: new Date().toISOString(),
  };

  console.log('Monitoring complete:', JSON.stringify(result, null, 2));
  return result;
}
