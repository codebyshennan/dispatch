import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb';
import type { RoutingMode } from '@dispatch/core';

const dynamo = new DynamoDBClient({});

/**
 * EventBridge scheduled event shape (simplified — only fields we need).
 */
interface ScheduledEvent {
  'detail-type': string;
  source: string;
  time: string;
}

/**
 * ProactiveNotificationLambda — ROUTE-05 infrastructure skeleton.
 *
 * Runs on a 4-hour EventBridge schedule to detect delayed payment transactions
 * and send proactive notifications to affected customers.
 *
 * CURRENT STATUS: Stub implementation pending Reap Pay internal API access.
 * - Mode gate is implemented: only active when SYSTEM#config ROUTING_MODE === 'auto_send'
 * - Reap Pay API polling logic is NOT implemented — blocked on internal API access
 *   (auth model, endpoints, rate limits unconfirmed). See STATE.md blockers.
 * - No SES emails are sent by this handler.
 *
 * When Reap Pay API access is confirmed:
 * 1. Add REAP_API_BASE_URL and REAP_API_TOKEN env vars to CDK stack
 * 2. Add SES grant (ses:SendEmail) to lambdaExecutionRole
 * 3. Implement pollDelayedTransactions() using Reap Pay delayed transactions endpoint
 * 4. Implement sendNotificationEmail() using AWS SES SendEmailCommand
 */
export async function handler(event: ScheduledEvent): Promise<void> {
  console.log('ProactiveNotificationLambda invoked', { time: event.time });

  const auditTableName = process.env.AUDIT_TABLE_NAME;

  // --- Mode gate: proactive notifications only active in auto_send mode ---
  let systemMode: RoutingMode = 'shadow';

  if (auditTableName) {
    try {
      const result = await dynamo.send(new GetItemCommand({
        TableName: auditTableName,
        Key: {
          pk: { S: 'SYSTEM#config' },
          sk: { S: 'ROUTING_MODE' },
        },
      }));

      if (result.Item?.value?.S) {
        const rawMode = result.Item.value.S;
        if (rawMode === 'shadow' || rawMode === 'agent_assisted' || rawMode === 'auto_send') {
          systemMode = rawMode;
        }
      }
    } catch (err) {
      console.error('Failed to read SYSTEM#config ROUTING_MODE, defaulting to shadow:', err);
    }
  }

  if (systemMode !== 'auto_send') {
    console.log(`ProactiveNotificationLambda: system mode is '${systemMode}', skipping proactive notifications (auto_send mode required)`);
    return;
  }

  // --- Stub: Reap Pay API polling not yet implemented ---
  console.log(
    'ProactiveNotificationLambda invoked — Reap Pay API polling not yet implemented (blocked on internal API access)',
  );
}
