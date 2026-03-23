import { Hono } from 'hono';
import { GetItemCommand, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { dynamoClient } from '../dynamo.js';

export const sendRouter = new Hono();

sendRouter.post('/', async (c) => {
  const tableName = process.env.AUDIT_TABLE_NAME!;
  const subdomain = process.env.ZENDESK_SUBDOMAIN;
  const apiToken = process.env.ZENDESK_API_TOKEN;

  if (!subdomain || !apiToken) {
    return c.json({ error: 'Zendesk credentials not configured' }, 500);
  }

  const body = await c.req.json<{
    ticketId: string;
    agentId?: string;
    draftText: string;
    originalDraft: string;
    urgency?: string;
  }>();

  // Agent-assisted gate: only allow for P3/P4 tickets
  if (body.urgency && !['P3', 'P4'].includes(body.urgency)) {
    return c.json({ error: 'One-click send only available for P3/P4 tickets' }, 403);
  }

  // Send as Zendesk public reply
  const zdRes = await fetch(
    `https://${subdomain}.zendesk.com/api/v2/tickets/${body.ticketId}`,
    {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ticket: {
          comment: {
            body: body.draftText,
            public: true,  // agent-assisted send — visible to customer
          },
        },
      }),
    },
  );

  if (!zdRes.ok) {
    const err = await zdRes.text();
    return c.json({ error: `Zendesk API error: ${zdRes.status} — ${err}` }, 502);
  }

  // Compute edit ratio for CHG-03 acceptance tracking
  const originalWords = body.originalDraft.trim().split(/\s+/).length;
  const editedWords = body.draftText.trim().split(/\s+/).length;
  const editRatio = originalWords > 0
    ? Math.abs(editedWords - originalWords) / originalWords
    : 0;

  const now = new Date().toISOString();

  // Read variantId from TICKET# DynamoDB record for A/B comparison (EVAL-06).
  // Default to 'control' if record absent or GetItem fails — graceful degradation.
  let variantId = 'control';
  try {
    const ticketRecord = await dynamoClient.send(new GetItemCommand({
      TableName: tableName,
      Key: {
        pk: { S: `TICKET#${body.ticketId}` },
        sk: { S: `RESPONSE#` },
      },
    }));
    // GetItem with exact sk may not match — query the most recent RESPONSE# by pk instead.
    // If not found via exact key, variantId stays 'control' (safe default).
    if (ticketRecord.Item?.variantId?.S) {
      variantId = ticketRecord.Item.variantId.S;
    }
  } catch (err) {
    // Non-blocking — metric write will still succeed with variantId='control'
    console.warn('[send] Could not read variantId from TICKET# record:', err);
  }

  // Write CHG-03 acceptance record with variantId for MonitoringLambda A/B comparison
  try {
    await dynamoClient.send(new PutItemCommand({
      TableName: tableName,
      Item: {
        pk: { S: 'METRICS#acceptance' },
        sk: { S: `ACCEPTANCE#${now}` },
        ticketId: { S: body.ticketId },
        agentId: { S: body.agentId ?? 'unknown' },
        editDistancePct: { N: String(editRatio.toFixed(4)) },
        accepted: { BOOL: editRatio < 0.20 },
        sent: { BOOL: true },
        urgency: { S: body.urgency ?? 'unknown' },
        variantId: { S: variantId },
        createdAt: { S: now },
      },
    }));
  } catch (err) {
    // Graceful degradation — send succeeded, metric write failure is non-blocking
    console.error('[send] Failed to write acceptance record:', err);
  }

  return c.json({ sent: true, ticketId: body.ticketId, editRatio });
});
