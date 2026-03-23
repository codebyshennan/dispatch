import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

/**
 * RUN-02: Transaction search — read-only Reap Pay API stub.
 * Accepts { referenceNumber?, amount?, dateFrom?, dateTo? }.
 * Returns array of mock transaction objects.
 */
export async function runTransactionSearch(
  params: Record<string, unknown>,
  _dynamoClient: DynamoDBDocumentClient,
  _auditTableName: string,
): Promise<Record<string, unknown>> {
  const referenceNumber = params.referenceNumber ? String(params.referenceNumber) : undefined;
  const amount = params.amount ? Number(params.amount) : undefined;

  const mockTransactions = [
    {
      txId: 'TX-' + Math.random().toString(36).slice(2, 10).toUpperCase(),
      referenceNumber: referenceNumber ?? 'REF-MOCK-001',
      amount: amount ?? 500.0,
      currency: 'HKD',
      status: 'completed',
      createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      fxRate: 7.82,
    },
    {
      txId: 'TX-' + Math.random().toString(36).slice(2, 10).toUpperCase(),
      referenceNumber: referenceNumber ?? 'REF-MOCK-002',
      amount: amount ? amount * 0.5 : 250.0,
      currency: 'HKD',
      status: 'processing',
      createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      fxRate: 7.82,
    },
  ];

  return {
    transactions: mockTransactions,
    totalCount: mockTransactions.length,
    query: { referenceNumber, amount, dateFrom: params.dateFrom, dateTo: params.dateTo },
    note: 'Reap Pay API sandbox pending (CHG-03) — mock response',
  };
}
