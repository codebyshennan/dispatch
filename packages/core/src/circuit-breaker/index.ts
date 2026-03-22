import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
} from '@aws-sdk/lib-dynamodb';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CBState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

interface CBRecord {
  PK: string;
  SK: string;
  state: CBState;
  failureCount: number;
  lastFailureAt?: string;
  openUntil?: string;
  ttl?: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Number of consecutive failures required to trip the breaker OPEN. */
const FAILURE_THRESHOLD = 5;

/** How long (ms) the breaker stays OPEN before transitioning to HALF_OPEN. */
const OPEN_DURATION_MS = 60_000;

/** Auto-cleanup TTL: stale records expire 5 minutes after openUntil. */
const TTL_BUFFER_MS = 5 * 60_000;

// ---------------------------------------------------------------------------
// CircuitBreaker class
// ---------------------------------------------------------------------------

/**
 * DynamoDB-backed circuit breaker protecting an external service.
 *
 * State is stored in DynamoDB so all Lambda instances share the same view
 * (Lambda instances do not share in-process memory across invocations).
 *
 * States:
 *   CLOSED     — normal operation, failures are counted
 *   OPEN       — short-circuit active, all calls are rejected for OPEN_DURATION_MS
 *   HALF_OPEN  — trial state after OPEN expires; one success closes the breaker
 *
 * Usage:
 * ```ts
 * const cb = new CircuitBreaker('anthropic-llm', dynamoClient, tableName);
 * if (await cb.isOpen()) throw new Error('Circuit breaker OPEN');
 * try {
 *   await doWork();
 *   await cb.recordSuccess();
 * } catch (err) {
 *   await cb.recordFailure();
 *   throw err;
 * }
 * ```
 */
export class CircuitBreaker {
  constructor(
    private readonly key: string,
    private readonly dynamoClient: DynamoDBDocumentClient,
    private readonly tableName: string,
  ) {}

  private get pk(): string {
    return `CB#${this.key}`;
  }

  private async getRecord(): Promise<CBRecord | undefined> {
    const result = await this.dynamoClient.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { PK: this.pk, SK: 'STATE' },
      }),
    );
    return result.Item as CBRecord | undefined;
  }

  private async putRecord(record: CBRecord): Promise<void> {
    await this.dynamoClient.send(
      new PutCommand({
        TableName: this.tableName,
        Item: record,
      }),
    );
  }

  /**
   * Returns true if the circuit breaker is OPEN (calls should be short-circuited).
   * Automatically transitions OPEN -> HALF_OPEN when the open window expires.
   */
  async isOpen(): Promise<boolean> {
    const record = await this.getRecord();
    if (!record || record.state === 'CLOSED') {
      return false;
    }

    if (record.state === 'OPEN') {
      const now = new Date();
      const openUntil = record.openUntil ? new Date(record.openUntil) : now;

      if (now >= openUntil) {
        // Transition to HALF_OPEN — allow one trial request through
        await this.putRecord({ ...record, state: 'HALF_OPEN' });
        return false;
      }

      return true; // Still within open window
    }

    // HALF_OPEN — let the call through; caller will record success or failure
    return false;
  }

  /**
   * Record a successful call. If in HALF_OPEN, closes the breaker.
   * No-op when CLOSED.
   */
  async recordSuccess(): Promise<void> {
    const record = await this.getRecord();
    if (!record || record.state === 'CLOSED') {
      return; // Already closed, nothing to do
    }

    if (record.state === 'HALF_OPEN') {
      await this.putRecord({
        ...record,
        state: 'CLOSED',
        failureCount: 0,
        lastFailureAt: undefined,
        openUntil: undefined,
        ttl: undefined,
      });
    }
    // If somehow OPEN and we record success — do nothing (isOpen() should have been called first)
  }

  /**
   * Record a failed call. Increments the failure counter.
   * If failures reach FAILURE_THRESHOLD while CLOSED, transitions to OPEN.
   */
  async recordFailure(): Promise<void> {
    const now = new Date();
    const existing = await this.getRecord();

    const currentState: CBState = existing?.state ?? 'CLOSED';
    const failureCount = (existing?.failureCount ?? 0) + 1;
    const lastFailureAt = now.toISOString();

    if (currentState === 'CLOSED' && failureCount >= FAILURE_THRESHOLD) {
      // Trip the breaker OPEN
      const openUntil = new Date(now.getTime() + OPEN_DURATION_MS);
      const ttlEpoch = Math.floor((openUntil.getTime() + TTL_BUFFER_MS) / 1000);

      await this.putRecord({
        PK: this.pk,
        SK: 'STATE',
        state: 'OPEN',
        failureCount,
        lastFailureAt,
        openUntil: openUntil.toISOString(),
        ttl: ttlEpoch,
      });
      return;
    }

    // Stay in current state, just increment counter
    await this.putRecord({
      PK: this.pk,
      SK: 'STATE',
      state: currentState,
      failureCount,
      lastFailureAt,
      openUntil: existing?.openUntil,
      ttl: existing?.ttl,
    });
  }
}
