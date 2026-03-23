import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

/**
 * RUN-01: Payment status lookup — read-only Reap Pay API stub.
 * Reap Pay API sandbox not yet available (CHG-03 dependency).
 * Returns realistic mock data so the sidebar can render real UI.
 */
export async function runPaymentStatus(
  params: Record<string, unknown>,
  _dynamoClient: DynamoDBDocumentClient,
  _auditTableName: string,
): Promise<Record<string, unknown>> {
  const paymentId = String(params.paymentId ?? 'UNKNOWN');
  return {
    paymentId,
    status: 'processing',
    estimatedArrival: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
    blockchainConfirmations: 8,
    requiredConfirmations: 12,
    chain: 'ethereum',
    note: 'Reap Pay API sandbox pending (CHG-03) — mock response',
  };
}
