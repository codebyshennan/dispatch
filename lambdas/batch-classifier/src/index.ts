import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { classify } from '@beacon/lambda-classifier';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const NINETY_DAYS_AGO_UNIX = Math.floor((Date.now() - 90 * 24 * 60 * 60 * 1000) / 1000);
// Rate limit: 10 requests/minute = 6s between requests
const RATE_LIMIT_DELAY_MS = 6000;

interface ZendeskTicket {
  id: number;
  subject: string;
  description: string;
  updated_at: string;
  requester_id?: number;
}

interface IncrementalExportPage {
  tickets: ZendeskTicket[];
  after_cursor: string | null;
  end_of_stream: boolean;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchPage(
  subdomain: string,
  apiToken: string,
  cursor: string | null,
): Promise<IncrementalExportPage> {
  const url = cursor
    ? `https://${subdomain}.zendesk.com/api/v2/incremental/tickets/cursor.json?cursor=${encodeURIComponent(cursor)}`
    : `https://${subdomain}.zendesk.com/api/v2/incremental/tickets/cursor.json?start_time=${NINETY_DAYS_AGO_UNIX}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${apiToken}` },
  });

  if (res.status === 429) {
    // Rate limited — wait 60s and retry
    console.warn('Rate limited by Zendesk incremental export API, waiting 60s...');
    await sleep(60000);
    return fetchPage(subdomain, apiToken, cursor);
  }

  if (!res.ok) {
    throw new Error(`Zendesk Incremental Export error: ${res.status}`);
  }

  return res.json() as Promise<IncrementalExportPage>;
}

async function getCursor(tableName: string, batchRunId: string): Promise<string | null> {
  const result = await ddb.send(new GetCommand({
    TableName: tableName,
    Key: { pk: `BATCH#cursor`, sk: batchRunId },
  }));
  return (result.Item?.cursor as string | undefined) ?? null;
}

async function saveCursor(tableName: string, batchRunId: string, cursor: string): Promise<void> {
  await ddb.send(new PutCommand({
    TableName: tableName,
    Item: { pk: `BATCH#cursor`, sk: batchRunId, cursor, updatedAt: new Date().toISOString() },
  }));
}

async function saveResult(
  tableName: string,
  batchRunId: string,
  ticketId: number,
  classification: unknown,
): Promise<void> {
  await ddb.send(new PutCommand({
    TableName: tableName,
    Item: {
      pk: `BATCH#${batchRunId}`,
      sk: `TICKET#${ticketId}`,
      ticketId,
      classification,
      classifiedAt: new Date().toISOString(),
    },
  }));
}

export async function handler(event: { batchRunId?: string } = {}): Promise<{
  total: number;
  classified: number;
  skipped: number;
  errors: number;
}> {
  const subdomain = process.env.ZENDESK_SUBDOMAIN!;
  const apiToken = process.env.ZENDESK_API_TOKEN!;
  const tableName = process.env.AUDIT_LOG_TABLE_NAME!;
  const batchRunId = event.batchRunId ?? new Date().toISOString().replace(/[:.]/g, '-');

  let cursor = await getCursor(tableName, batchRunId);
  const seenKeys = new Set<string>();

  let total = 0;
  let classified = 0;
  let skipped = 0;
  let errors = 0;

  console.info(`Starting batch classification run: ${batchRunId}`);
  if (cursor) {
    console.info(`Resuming from cursor: ${cursor}`);
  }

  let pageCount = 0;
  let endOfStream = false;

  while (!endOfStream) {
    const page = await fetchPage(subdomain, apiToken, cursor);

    for (const ticket of page.tickets) {
      total++;
      const deduplicationKey = `${ticket.id}#${ticket.updated_at}`;

      // Dedup within page (Zendesk incremental can return same ticket at same timestamp)
      if (seenKeys.has(deduplicationKey)) {
        skipped++;
        continue;
      }
      seenKeys.add(deduplicationKey);

      try {
        const result = await classify({
          ticketId: String(ticket.id),
          subject: ticket.subject ?? '',
          body: ticket.description ?? '',
        });
        await saveResult(tableName, batchRunId, ticket.id, result.classification);
        classified++;
      } catch (err) {
        console.error(`Failed to classify ticket ${ticket.id}:`, err);
        errors++;
      }
    }

    // Save cursor after each page for resume support
    if (page.after_cursor) {
      cursor = page.after_cursor;
      await saveCursor(tableName, batchRunId, cursor);
    }

    endOfStream = page.end_of_stream;
    pageCount++;

    console.info(`Page ${pageCount}: ${page.tickets.length} tickets, classified: ${classified}, errors: ${errors}`);

    // Rate limit: 10 requests/minute — wait between pages
    if (!endOfStream) {
      await sleep(RATE_LIMIT_DELAY_MS);
    }
  }

  const summary = { total, classified, skipped, errors };
  console.info(`Batch run complete: ${batchRunId}`, summary);
  return summary;
}
