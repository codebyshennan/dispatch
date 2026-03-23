import { Hono } from 'hono';
import { dynamoClient } from '../dynamo.js';
import { PutItemCommand } from '@aws-sdk/client-dynamodb';

const app = new Hono();

/**
 * POST /nps — Store agent NPS score for the current month (CHG-04).
 *
 * Body: { agentId: string; score: number; month: string; comment?: string }
 *
 * Stores to DynamoDB:
 *   pk = METRICS#nps
 *   sk = NPS#{month}#{agentId}
 */
app.post('/', async (c) => {
  const body = await c.req.json<{
    agentId: string;
    score: number;
    month: string;
    comment?: string;
  }>();

  // Validate score is an integer between 1 and 10
  const score = body.score;
  if (
    typeof score !== 'number' ||
    !Number.isInteger(score) ||
    score < 1 ||
    score > 10
  ) {
    return c.json({ error: 'score must be an integer between 1 and 10' }, 400);
  }

  if (!body.agentId || typeof body.agentId !== 'string') {
    return c.json({ error: 'agentId is required' }, 400);
  }

  if (!body.month || typeof body.month !== 'string') {
    return c.json({ error: 'month is required (YYYY-MM format)' }, 400);
  }

  const createdAt = new Date().toISOString();

  await dynamoClient.send(new PutItemCommand({
    TableName: process.env.AUDIT_TABLE_NAME!,
    Item: {
      pk: { S: 'METRICS#nps' },
      sk: { S: `NPS#${body.month}#${body.agentId}` },
      agentId: { S: body.agentId },
      score: { N: String(score) },
      month: { S: body.month },
      comment: body.comment ? { S: body.comment } : { NULL: true },
      createdAt: { S: createdAt },
    },
  }));

  return c.json({ recorded: true }, 201);
});

export { app as npsRouter };
