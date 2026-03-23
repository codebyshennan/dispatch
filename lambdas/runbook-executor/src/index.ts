import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';
import { runPaymentStatus } from './runbooks/paymentStatus.js';
import { runTransactionSearch } from './runbooks/transactionSearch.js';
import { runKycStatus } from './runbooks/kycStatus.js';
import { runCardFreeze } from './runbooks/cardFreeze.js';
import { runResendNotification } from './runbooks/resendNotification.js';
import { runEscalate } from './runbooks/escalate.js';
import { runStablecoinTracker } from './runbooks/stablecoinTracker.js';

// ---------------------------------------------------------------------------
// DynamoDB clients — module-level for warm reuse across Lambda invocations
// ---------------------------------------------------------------------------
const dynamoRawClient = new DynamoDBClient({});
const dynamoDocClient = DynamoDBDocumentClient.from(dynamoRawClient);

const AUDIT_TABLE_NAME = process.env.AUDIT_TABLE_NAME ?? '';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RunbookInput {
  runbookId:
    | 'payment_status'
    | 'transaction_search'
    | 'kyc_status'
    | 'card_freeze'
    | 'resend_notification'
    | 'escalate'
    | 'stablecoin_tracker';
  ticketId: string;
  agentId?: string;
  params: Record<string, unknown>;
}

export interface RunbookOutput {
  executionId: string;
  runbookId: string;
  success: boolean;
  result?: Record<string, unknown>;
  error?: string;
  durationMs: number;
}

// ---------------------------------------------------------------------------
// Runbook dispatch
// ---------------------------------------------------------------------------

const VALID_RUNBOOK_IDS: ReadonlySet<string> = new Set([
  'payment_status',
  'transaction_search',
  'kyc_status',
  'card_freeze',
  'resend_notification',
  'escalate',
  'stablecoin_tracker',
]);

async function dispatchRunbook(event: RunbookInput): Promise<Record<string, unknown>> {
  switch (event.runbookId) {
    case 'payment_status':
      return runPaymentStatus(event.params, dynamoDocClient, AUDIT_TABLE_NAME);
    case 'transaction_search':
      return runTransactionSearch(event.params, dynamoDocClient, AUDIT_TABLE_NAME);
    case 'kyc_status':
      return runKycStatus(event.params, dynamoDocClient, AUDIT_TABLE_NAME);
    case 'card_freeze':
      return runCardFreeze(event.params, dynamoDocClient, AUDIT_TABLE_NAME);
    case 'resend_notification':
      return runResendNotification(event.params, dynamoDocClient, AUDIT_TABLE_NAME);
    case 'escalate':
      return runEscalate(event.params, dynamoDocClient, AUDIT_TABLE_NAME);
    case 'stablecoin_tracker':
      return runStablecoinTracker(event.params, dynamoDocClient, AUDIT_TABLE_NAME);
    default:
      throw new Error(`Unknown runbookId: ${event.runbookId}`);
  }
}

function createTimeout(ms: number): Promise<never> {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`Runbook timed out after ${ms}ms`)), ms),
  );
}

// ---------------------------------------------------------------------------
// Lambda handler
// ---------------------------------------------------------------------------

export async function handler(event: RunbookInput): Promise<RunbookOutput> {
  const executionId = randomUUID();
  const startMs = Date.now();

  // Validate runbookId
  if (!VALID_RUNBOOK_IDS.has(event.runbookId)) {
    const durationMs = Date.now() - startMs;
    return {
      executionId,
      runbookId: event.runbookId,
      success: false,
      error: `Unknown runbookId: ${event.runbookId}. Valid IDs: ${[...VALID_RUNBOOK_IDS].join(', ')}`,
      durationMs,
    };
  }

  let result: Record<string, unknown> | undefined;
  let errorMessage: string | undefined;
  let success = false;

  try {
    // Race the runbook against a 5-second timeout guard (RUN-08)
    result = await Promise.race([dispatchRunbook(event), createTimeout(5000)]);
    success = true;
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err);
  }

  const durationMs = Date.now() - startMs;

  // Write DynamoDB audit record (INFRA-09: graceful degradation — runbook result
  // must not fail if the audit write fails)
  if (AUDIT_TABLE_NAME) {
    try {
      await dynamoRawClient.send(
        new PutItemCommand({
          TableName: AUDIT_TABLE_NAME,
          Item: {
            pk: { S: `RUNBOOK#${executionId}` },
            sk: { S: `EXECUTION#${new Date().toISOString()}` },
            type: { S: 'runbook_execution' },
            executionId: { S: executionId },
            runbookId: { S: event.runbookId },
            ticketId: { S: event.ticketId },
            ...(event.agentId ? { agentId: { S: event.agentId } } : {}),
            input: { S: JSON.stringify(event.params) },
            output: { S: JSON.stringify(result ?? {}) },
            success: { BOOL: success },
            durationMs: { N: String(durationMs) },
            ...(errorMessage ? { error: { S: errorMessage } } : {}),
            createdAt: { S: new Date().toISOString() },
          },
        }),
      );
    } catch (auditErr) {
      // Audit write failure is non-fatal — log but don't fail the runbook
      console.error('[runbook-executor] DynamoDB audit write failed:', auditErr);
    }
  }

  return {
    executionId,
    runbookId: event.runbookId,
    success,
    result,
    error: errorMessage,
    durationMs,
  };
}
