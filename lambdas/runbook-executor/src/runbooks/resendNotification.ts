import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

/**
 * RUN-05: Resend payment notification — write operation via Reap notification API stub.
 * Accepts { paymentId, channel: 'email' | 'whatsapp' }.
 * Queues a notification resend for the given payment.
 */
export async function runResendNotification(
  params: Record<string, unknown>,
  _dynamoClient: DynamoDBDocumentClient,
  _auditTableName: string,
): Promise<Record<string, unknown>> {
  const paymentId = String(params.paymentId ?? 'UNKNOWN');
  const channel = params.channel === 'whatsapp' ? 'whatsapp' : 'email';
  return {
    paymentId,
    channel,
    status: 'queued',
    queuedAt: new Date().toISOString(),
    note: 'Reap notification API sandbox pending (CHG-03) — mock response',
  };
}
