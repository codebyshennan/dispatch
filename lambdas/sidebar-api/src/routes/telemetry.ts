import { Hono } from 'hono';
import { dynamoClient } from '../dynamo.js';
import { PutItemCommand } from '@aws-sdk/client-dynamodb';

const app = new Hono();

app.post('/', async (c) => {
  const body = await c.req.json<{
    ticketId: string;
    event: string;
    ts?: string;
  }>();

  const ts = body.ts ?? new Date().toISOString();

  await dynamoClient.send(new PutItemCommand({
    TableName: process.env.AUDIT_TABLE_NAME!,
    Item: {
      pk: { S: `TICKET#${body.ticketId}` },
      sk: { S: `TELEMETRY#${ts}` },
      type: { S: 'sidebar_telemetry' },
      event: { S: body.event },        // 'sidebar_viewed'
      createdAt: { S: ts },
    },
  }));

  return c.json({ ok: true });
});

export { app as telemetryRouter };
