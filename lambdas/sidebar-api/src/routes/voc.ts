import { Hono } from 'hono';
import { QueryCommand } from '@aws-sdk/client-dynamodb';
import { dynamoClient } from '../dynamo.js';

export const vocRouter = new Hono();

/**
 * GET /voc/summary — VoC dashboard query surface (VOC-02).
 *
 * Returns:
 * - pending_count: number of reply drafts awaiting CX lead approval
 * - unresponded: up to 20 draft records from the last 7 days that have not been responded to
 * - sentiment_trend: count of 1-star reviews processed per platform in the last 30 days
 */
vocRouter.get('/', async (c) => {
  const tableName = process.env.AUDIT_TABLE_NAME!;

  try {
    const sevenDaysAgo = new Date(
      Date.now() - 7 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const thirtyDaysAgo = new Date(
      Date.now() - 30 * 24 * 60 * 60 * 1000,
    ).toISOString();

    // --- pending_count + unresponded ---
    // Query VOC#draft-index for pending_approval records
    // The draft index pk aggregates records written by voc-processor for queryability
    const draftResult = await dynamoClient.send(
      new QueryCommand({
        TableName: tableName,
        KeyConditionExpression: 'pk = :pk',
        FilterExpression: '#status = :status',
        ExpressionAttributeNames: {
          '#status': 'status',
        },
        ExpressionAttributeValues: {
          ':pk': { S: 'VOC#draft-index' },
          ':status': { S: 'pending_approval' },
        },
        ScanIndexForward: false,
      }),
    );

    const pendingItems = draftResult.Items ?? [];
    const pending_count = pendingItems.length;

    // Unresponded: pending_approval drafts created in the last 7 days
    const unresponded = pendingItems
      .filter((item) => {
        const createdAt = item.createdAt?.S ?? '';
        return createdAt >= sevenDaysAgo;
      })
      .slice(0, 20)
      .map((item) => ({
        reviewId: item.reviewId?.S ?? '',
        platform: item.platform?.S ?? '',
        reviewText: item.reviewText?.S ?? '',
        zendeskTicketId: item.zendeskTicketId?.S ?? '',
        createdAt: item.createdAt?.S ?? '',
      }));

    // --- sentiment_trend ---
    // Count VOC#processed records per platform from the last 30 days.
    // Queried individually per platform from the processed-index aggregation pk.
    const platforms = ['trustpilot', 'app_store', 'google_play'] as const;
    const sentimentCounts: Record<string, number> = {
      trustpilot: 0,
      app_store: 0,
      google_play: 0,
    };

    for (const platform of platforms) {
      try {
        const processedResult = await dynamoClient.send(
          new QueryCommand({
            TableName: tableName,
            KeyConditionExpression: 'pk = :pk AND sk >= :since',
            FilterExpression: '#platform = :platform',
            ExpressionAttributeNames: {
              '#platform': 'platform',
            },
            ExpressionAttributeValues: {
              ':pk': { S: 'VOC#processed-index' },
              ':since': { S: thirtyDaysAgo },
              ':platform': { S: platform },
            },
          }),
        );
        sentimentCounts[platform] = (processedResult.Items ?? []).length;
      } catch (err) {
        console.error(`Failed to query processed records for ${platform}:`, err);
      }
    }

    return c.json(
      {
        pending_count,
        unresponded,
        sentiment_trend: {
          trustpilot: sentimentCounts.trustpilot,
          app_store: sentimentCounts.app_store,
          google_play: sentimentCounts.google_play,
        },
      },
      200,
    );
  } catch (err) {
    console.error('Failed to load VoC summary:', err);
    return c.json({ error: 'Failed to load VoC summary' }, 500);
  }
});
