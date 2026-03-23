import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

/**
 * RUN-03: KYC status check — read-only Reap compliance API stub.
 * Accepts { customerId }.
 * Returns KYC state and tier information.
 */
export async function runKycStatus(
  params: Record<string, unknown>,
  _dynamoClient: DynamoDBDocumentClient,
  _auditTableName: string,
): Promise<Record<string, unknown>> {
  const customerId = String(params.customerId ?? 'UNKNOWN');
  return {
    customerId,
    kycState: 'verified',
    verifiedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
    tier: 'standard',
    jurisdictions: ['HK'],
    note: 'Reap compliance API sandbox pending (CHG-03) — mock response',
  };
}
