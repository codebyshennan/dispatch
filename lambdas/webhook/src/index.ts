import { Hono } from 'hono';
import { handle } from 'hono/aws-lambda';
import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { verifyZendeskSignature } from './verify.js';

const app = new Hono();
const ebClient = new EventBridgeClient({});
const ddbClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

app.post('/webhook/zendesk', async (c) => {
  // Step 1: Read raw body BEFORE any JSON parsing (required for HMAC)
  const rawBody = await c.req.text();
  const signature = c.req.header('x-zendesk-webhook-signature') ?? '';
  const timestamp = c.req.header('x-zendesk-webhook-signature-timestamp') ?? '';
  const secret = process.env.WEBHOOK_SIGNING_SECRET ?? '';

  // Step 2: Verify HMAC signature
  if (!verifyZendeskSignature(rawBody, signature, timestamp, secret)) {
    console.warn('Webhook signature verification failed');
    return c.json({ error: 'Invalid signature' }, 401);
  }

  // Step 3: Parse payload after verification
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const ticketData = payload.ticket as Record<string, unknown> | undefined;
  if (!ticketData) {
    return c.json({ error: 'Missing ticket in payload' }, 400);
  }

  const ticketId = String(ticketData.id ?? '');
  const updatedAt = String(ticketData.updated_at ?? new Date().toISOString());
  const eventType = (payload.type as string) === 'ticket.created' ? 'ticket.created' : 'ticket.updated';

  // Step 4: Idempotency check — prevent duplicate processing (INFRA-06)
  const deduplicationKey = `${ticketId}#${updatedAt}`;
  try {
    await ddbClient.send(new PutCommand({
      TableName: process.env.IDEMPOTENCY_TABLE_NAME!,
      Item: {
        deduplicationKey,
        ttl: Math.floor(Date.now() / 1000) + 86400, // 24h TTL
      },
      ConditionExpression: 'attribute_not_exists(deduplicationKey)',
    }));
  } catch (err: unknown) {
    // ConditionalCheckFailedException = duplicate event, silently skip
    if ((err as { name?: string }).name === 'ConditionalCheckFailedException') {
      console.info(`Duplicate webhook skipped: ${deduplicationKey}`);
      return c.json({ status: 'duplicate_skipped' }, 200);
    }
    throw err;
  }

  // Step 5: Forward to EventBridge
  const eventBusName = process.env.EVENT_BUS_NAME!;
  await ebClient.send(new PutEventsCommand({
    Entries: [{
      EventBusName: eventBusName,
      Source: 'beacon.webhook',
      DetailType: eventType,
      Detail: JSON.stringify({ ticket: ticketData }),
    }],
  }));

  return c.json({ status: 'accepted', ticketId }, 200);
});

app.get('/health', (c) => c.json({ status: 'ok' }));

export const handler = handle(app);
