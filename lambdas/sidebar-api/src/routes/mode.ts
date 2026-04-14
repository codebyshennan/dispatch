import { Hono } from 'hono';
import { GetItemCommand, PutItemCommand, QueryCommand } from '@aws-sdk/client-dynamodb';
import { dynamoClient } from '../dynamo.js';
import type { ModeStatus } from '@dispatch/core';

export const modeRouter = new Hono();

// Routing mode is stored in a single DynamoDB record:
// pk=SYSTEM#config, sk=ROUTING_MODE, value={ mode: 'shadow' | 'agent_assisted' }
// Defaults to 'shadow' if no record exists.

modeRouter.get('/', async (c) => {
  const tableName = process.env.AUDIT_TABLE_NAME!;

  // Fetch current mode
  const modeResult = await dynamoClient.send(new GetItemCommand({
    TableName: tableName,
    Key: { pk: { S: 'SYSTEM#config' }, sk: { S: 'ROUTING_MODE' } },
  }));
  const mode = (modeResult.Item?.mode?.S ?? 'shadow') as 'shadow' | 'agent_assisted';

  // Compute draft acceptance rate: query ACCEPTANCE# records (last 100)
  // ACCEPTANCE# records are written by the /send route when agent sends a draft
  // Each record has: editRatio (< 0.20 = accepted)
  const acceptanceResult = await dynamoClient.send(new QueryCommand({
    TableName: tableName,
    KeyConditionExpression: 'pk = :pk AND begins_with(sk, :prefix)',
    ExpressionAttributeValues: {
      ':pk': { S: 'METRICS#acceptance' },
      ':prefix': { S: 'ACCEPTANCE#' },
    },
    Limit: 100,
    ScanIndexForward: false,
  }));

  const acceptanceItems = acceptanceResult.Items ?? [];
  let draftAcceptanceRate: number | null = null;
  if (acceptanceItems.length >= 10) {  // need at least 10 data points
    const accepted = acceptanceItems.filter(i => parseFloat(i.editRatio?.N ?? '1') < 0.20).length;
    draftAcceptanceRate = accepted / acceptanceItems.length;
  }

  // Classification accuracy: stored by eval CI in METRICS#classification record
  // Falls back to null if no eval run exists yet
  const evalResult = await dynamoClient.send(new GetItemCommand({
    TableName: tableName,
    Key: { pk: { S: 'METRICS#classification' }, sk: { S: 'LATEST' } },
  }));
  const classificationAccuracy = evalResult.Item?.accuracy?.N
    ? parseFloat(evalResult.Item.accuracy.N)
    : null;

  const THRESHOLDS = { classificationAccuracy: 0.92, draftAcceptanceRate: 0.70 };

  const transitionReady = (
    classificationAccuracy !== null && classificationAccuracy >= THRESHOLDS.classificationAccuracy &&
    draftAcceptanceRate !== null && draftAcceptanceRate >= THRESHOLDS.draftAcceptanceRate
  );

  const status: ModeStatus = {
    mode,
    transitionReady,
    classificationAccuracy,
    draftAcceptanceRate,
    thresholds: THRESHOLDS,
    evaluatedAt: new Date().toISOString(),
  };

  return c.json(status);
});

// POST /mode — transition shadow → agent_assisted (only if transitionReady)
modeRouter.post('/', async (c) => {
  const tableName = process.env.AUDIT_TABLE_NAME!;
  const body = await c.req.json<{ mode: 'shadow' | 'agent_assisted' }>();

  if (body.mode !== 'shadow' && body.mode !== 'agent_assisted') {
    return c.json({ error: 'mode must be shadow or agent_assisted' }, 400);
  }

  await dynamoClient.send(new PutItemCommand({
    TableName: tableName,
    Item: {
      pk: { S: 'SYSTEM#config' },
      sk: { S: 'ROUTING_MODE' },
      mode: { S: body.mode },
      updatedAt: { S: new Date().toISOString() },
    },
  }));

  return c.json({ mode: body.mode, updatedAt: new Date().toISOString() });
});
