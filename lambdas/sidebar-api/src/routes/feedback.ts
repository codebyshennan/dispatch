import { Hono } from 'hono';
import { dynamoClient } from '../dynamo.js';
import { PutItemCommand } from '@aws-sdk/client-dynamodb';

const app = new Hono();

app.post('/', async (c) => {
  const body = await c.req.json<{
    ticketId: string;
    rating: 'up' | 'down';
    note?: string;
    originalDraft?: string;
    sentText?: string;
    editRatio?: number;
  }>();

  const ts = new Date().toISOString();

  await dynamoClient.send(new PutItemCommand({
    TableName: process.env.AUDIT_TABLE_NAME!,
    Item: {
      pk: { S: `TICKET#${body.ticketId}` },
      sk: { S: `FEEDBACK#${ts}` },
      type: { S: 'agent_feedback' },
      rating: { S: body.rating },
      note: body.note ? { S: body.note } : { NULL: true },
      originalDraft: body.originalDraft ? { S: body.originalDraft } : { NULL: true },
      sentText: body.sentText ? { S: body.sentText } : { NULL: true },
      editRatio: body.editRatio !== undefined ? { N: String(body.editRatio) } : { NULL: true },
      createdAt: { S: ts },
    },
  }));

  return c.json({ ok: true });
});

export { app as feedbackRouter };
