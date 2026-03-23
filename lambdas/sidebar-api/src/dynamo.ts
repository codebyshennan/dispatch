import { DynamoDBClient, QueryCommand } from '@aws-sdk/client-dynamodb';

const client = new DynamoDBClient({});

const TABLE = process.env.AUDIT_TABLE_NAME!;

/** Query the latest record with a given pk and sk prefix. Returns the raw DynamoDB item or null. */
export async function queryLatest(ticketId: string, skPrefix: string) {
  const res = await client.send(new QueryCommand({
    TableName: TABLE,
    KeyConditionExpression: 'pk = :pk AND begins_with(sk, :prefix)',
    ExpressionAttributeValues: {
      ':pk': { S: `TICKET#${ticketId}` },
      ':prefix': { S: skPrefix },
    },
    ScanIndexForward: false, // newest first
    Limit: 1,
  }));
  return res.Items?.[0] ?? null;
}

export { client as dynamoClient };
