import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { CircuitBreaker } from '@dispatch/core';

/**
 * RUN-04: Card freeze/unfreeze — write operation with circuit-breaker protection.
 * The CircuitBreaker trips OPEN after 5 consecutive Reap API failures,
 * blocking all calls for 60 seconds (OPEN_DURATION_MS in CircuitBreaker class).
 * Accepts { cardId, action: 'freeze' | 'unfreeze' }.
 */
export async function runCardFreeze(
  params: Record<string, unknown>,
  dynamoClient: DynamoDBDocumentClient,
  auditTableName: string,
): Promise<Record<string, unknown>> {
  const cb = new CircuitBreaker('reap-card-api', dynamoClient, auditTableName);

  if (await cb.isOpen()) {
    throw new Error(
      'Reap Card API circuit breaker OPEN — too many recent failures. Try again in 60 seconds.',
    );
  }

  try {
    // Reap Card API sandbox pending (CHG-03)
    const cardId = String(params.cardId ?? 'UNKNOWN');
    const action = params.action === 'unfreeze' ? 'unfreeze' : 'freeze';
    const result = {
      cardId,
      action,
      status: 'success',
      processedAt: new Date().toISOString(),
      note: 'Reap Card API sandbox pending (CHG-03) — mock response',
    };
    await cb.recordSuccess();
    return result;
  } catch (err) {
    await cb.recordFailure();
    throw err;
  }
}
