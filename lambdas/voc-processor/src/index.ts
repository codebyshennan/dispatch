import {
  DynamoDBClient,
  PutItemCommand,
  QueryCommand,
} from '@aws-sdk/client-dynamodb';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { invoke } from '@dispatch/core';
import { z } from 'zod';
import type { S3Event } from 'aws-lambda';
import { createZendeskTicketFromReview } from './zendesk.js';
import type { VocReview } from './zendesk.js';
import {
  generateAndStageReplyDraft,
  updateProcessedRecord,
} from './replies.js';

const dynamo = new DynamoDBClient({});
const s3 = new S3Client({});

/** EventBridge monthly-correlation trigger shape */
interface EventBridgeCorrelationEvent {
  type: 'monthly-correlation';
  source: 'eventbridge';
}

type HandlerEvent = S3Event | EventBridgeCorrelationEvent;

function isEventBridgeCorrelation(
  event: HandlerEvent,
): event is EventBridgeCorrelationEvent {
  return (event as EventBridgeCorrelationEvent).type === 'monthly-correlation';
}

/** Zod schema for the LLM correlation analysis JSON output */
const InsightsSchema = z.object({
  top_themes: z.array(z.string()),
  sentiment_shift: z.enum(['improving', 'worsening', 'stable']),
  correlation_note: z.string(),
  action_items: z.array(z.string()),
});

type Insights = z.infer<typeof InsightsSchema>;

/**
 * Reads the last 50 VOC#draft records via a draft-index aggregation record
 * and runs cross-correlation LLM analysis.
 * Writes a VOC#insight#${yearMonth} record to DynamoDB (VOC-04).
 */
async function runMonthlyCorrelationAnalysis(tableName: string): Promise<void> {
  const yearMonth = new Date().toISOString().slice(0, 7); // e.g. "2026-03"

  // Fetch last 50 VOC#draft records.
  // Without a GSI the most practical approach is to query a draft-index aggregation pk.
  // If no index records exist, we fall back to empty context and still write the insight.
  const draftsResult = await dynamo.send(
    new QueryCommand({
      TableName: tableName,
      KeyConditionExpression: 'pk = :pk',
      ExpressionAttributeValues: {
        ':pk': { S: 'VOC#draft-index' },
      },
      Limit: 50,
      ScanIndexForward: false,
    }),
  );

  const draftTexts: string[] = [];
  for (const item of draftsResult.Items ?? []) {
    if (item.reviewText?.S) {
      draftTexts.push(item.reviewText.S);
    }
  }

  // Fetch acceptance rate to correlate with VoC themes (best-effort)
  let acceptanceRate: number | null = null;
  try {
    const metricsResult = await dynamo.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: 'pk = :pk AND begins_with(sk, :prefix)',
        ExpressionAttributeValues: {
          ':pk': { S: 'METRICS#acceptance' },
          ':prefix': { S: 'ACCEPTANCE#' },
        },
        Limit: 100,
        ScanIndexForward: false,
      }),
    );
    const items = metricsResult.Items ?? [];
    if (items.length >= 10) {
      const accepted = items.filter(
        (i) => parseFloat(i.editRatio?.N ?? '1') < 0.2,
      ).length;
      acceptanceRate = accepted / items.length;
    }
  } catch (err) {
    console.error('Failed to fetch acceptance metrics for correlation:', err);
  }

  const contextSummary =
    draftTexts.length > 0
      ? `Recent 1-star review themes from ${draftTexts.length} reviews:\n${draftTexts.slice(0, 50).join('\n---\n')}`
      : 'No recent 1-star review drafts found.';

  const prompt = [
    `You are a CX analytics AI. Analyze the following 1-star customer review data.`,
    ``,
    contextSummary,
    ``,
    acceptanceRate !== null
      ? `Current draft acceptance rate: ${(acceptanceRate * 100).toFixed(1)}%`
      : `Draft acceptance rate: not yet available.`,
    ``,
    `Return a JSON object with exactly these fields:`,
    `{`,
    `  "top_themes": ["theme1", "theme2", "theme3"],`,
    `  "sentiment_shift": "improving" or "worsening" or "stable",`,
    `  "correlation_note": "brief note on correlation between themes and acceptance rate",`,
    `  "action_items": ["action1", "action2"]`,
    `}`,
    ``,
    `Reply ONLY with the JSON object.`,
  ].join('\n');

  let insights: Insights = {
    top_themes: [],
    sentiment_shift: 'stable',
    correlation_note: 'Insufficient data for analysis.',
    action_items: [],
  };

  try {
    const result = await invoke<Insights>(prompt, {
      provider: 'openrouter',
      model: 'google/gemma-3-27b-it:free',
      schema: InsightsSchema,
    });
    insights = result.data;
  } catch (err) {
    console.error('LLM correlation analysis failed:', err);
  }

  await dynamo.send(
    new PutItemCommand({
      TableName: tableName,
      Item: {
        pk: { S: `VOC#insight#${yearMonth}` },
        sk: { S: 'INSIGHT' },
        yearMonth: { S: yearMonth },
        insights: { S: JSON.stringify(insights) },
        draftCount: { N: String(draftTexts.length) },
        acceptanceRate:
          acceptanceRate !== null
            ? { N: String(acceptanceRate) }
            : { NULL: true },
        generatedAt: { S: new Date().toISOString() },
      },
    }),
  );

  console.info(
    `Monthly VoC correlation analysis written for ${yearMonth}`,
  );
}

/**
 * S3-triggered Lambda handler.
 * Processes ingested review JSON files and creates Zendesk tickets + reply drafts
 * for 1-star reviews. Deduplicates via DynamoDB conditional write (attribute_not_exists).
 *
 * Also handles EventBridge monthly-correlation events (VOC-04).
 */
export async function handler(event: HandlerEvent): Promise<void> {
  const tableName = process.env.AUDIT_TABLE_NAME!;
  const zendeskSubdomain = process.env.ZENDESK_SUBDOMAIN ?? '';
  const zendeskApiToken = process.env.ZENDESK_API_TOKEN ?? '';

  // EventBridge monthly-correlation path (VOC-04)
  if (isEventBridgeCorrelation(event)) {
    console.info('Monthly correlation analysis triggered via EventBridge');
    await runMonthlyCorrelationAnalysis(tableName);
    return;
  }

  // S3 event path
  const s3Event = event as S3Event;

  for (const record of s3Event.Records) {
    const bucket = record.s3.bucket.name;
    const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));

    console.info(`Processing S3 object: s3://${bucket}/${key}`);

    // Load JSON from S3
    let reviews: VocReview[] = [];
    try {
      const s3Response = await s3.send(
        new GetObjectCommand({ Bucket: bucket, Key: key }),
      );
      const body = await s3Response.Body?.transformToString();
      if (!body) {
        console.warn(`Empty S3 object: ${key}`);
        continue;
      }
      const parsed = JSON.parse(body) as unknown;
      reviews = Array.isArray(parsed) ? (parsed as VocReview[]) : [];
    } catch (err) {
      console.error(`Failed to load/parse S3 object ${key}:`, err);
      continue;
    }

    // Filter 1-star reviews
    const oneStarReviews = reviews.filter((r) => r.rating <= 1);
    console.info(
      `Found ${oneStarReviews.length} 1-star reviews out of ${reviews.length} total`,
    );

    for (const review of oneStarReviews) {
      // Step 1: Deduplication via conditional PutItem (attribute_not_exists(pk))
      try {
        await dynamo.send(
          new PutItemCommand({
            TableName: tableName,
            Item: {
              pk: { S: `VOC#processed#${review.reviewId}` },
              sk: { S: 'PROCESSED' },
              reviewId: { S: review.reviewId },
              platform: { S: review.platform },
              processedAt: { S: new Date().toISOString() },
            },
            ConditionExpression: 'attribute_not_exists(pk)',
          }),
        );
      } catch (err: unknown) {
        // ConditionalCheckFailedException means already processed — skip
        if (
          err instanceof Error &&
          err.name === 'ConditionalCheckFailedException'
        ) {
          console.info(
            `Review ${review.reviewId} already processed — skipping`,
          );
          continue;
        }
        // Other DynamoDB errors: log and skip to avoid duplicate tickets
        console.error(
          `DynamoDB deduplication check failed for ${review.reviewId}:`,
          err,
        );
        continue;
      }

      // Step 2: Create Zendesk ticket
      let zendeskTicketId: string | null = null;
      try {
        zendeskTicketId = await createZendeskTicketFromReview(
          review,
          zendeskSubdomain,
          zendeskApiToken,
        );
        console.info(
          `Created Zendesk ticket ${zendeskTicketId} for review ${review.reviewId}`,
        );
      } catch (err) {
        console.error(
          `Failed to create Zendesk ticket for review ${review.reviewId}:`,
          err,
        );
        // Do not block reply draft staging if ticket creation fails
      }

      // Step 3: Generate and stage reply draft — fire-and-forget (reply failure must not block)
      if (zendeskTicketId) {
        try {
          await generateAndStageReplyDraft(review, zendeskTicketId, tableName);
        } catch (err) {
          console.error(
            `Failed to stage reply draft for review ${review.reviewId}:`,
            err,
          );
          // Non-fatal — ticket was created, reply staging failure is logged only
        }

        // Step 4: Update VOC#processed record with zendeskTicketId for traceability
        try {
          await updateProcessedRecord(
            review.reviewId,
            zendeskTicketId,
            tableName,
          );
        } catch (err) {
          console.error(
            `Failed to update processed record with ticketId for ${review.reviewId}:`,
            err,
          );
        }
      }
    }

    // Monthly cross-correlation: if S3 key contains 'monthly-correlation' prefix, run analysis
    if (key.includes('monthly-correlation')) {
      console.info(
        `S3 key contains monthly-correlation prefix — running analysis`,
      );
      try {
        await runMonthlyCorrelationAnalysis(tableName);
      } catch (err) {
        console.error('Monthly correlation analysis failed:', err);
      }
    }
  }
}
