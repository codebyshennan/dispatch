import { DynamoDBClient, GetItemCommand, PutItemCommand } from '@aws-sdk/client-dynamodb';
import type { Classification, ResponseDraft, RoutingMode } from '@dispatch/core';

const dynamo = new DynamoDBClient({});

/**
 * DynamoDB audit record written for every auto-send decision.
 * Supports full auditability: support leads can query by ticketId and see
 * routing, mode, and outcome recorded at decision time.
 */
export interface AutoSendRecord {
  pk: string;           // AUTOSEND#${ticketId}
  sk: string;           // SENT#${timestamp} | WITHHELD#${timestamp}
  ticketId: string;
  routing: string;
  mode: RoutingMode;
  sent: boolean;
  confidence: number;
  urgency: string;
  timestamp: string;
}

/**
 * Input shape from Step Functions LambdaInvoke — the payload wraps the Lambda
 * output in a Payload envelope when invoked via Step Functions SDK integration.
 */
export interface AutoSenderInput {
  ticketId: string;
  responseResult: {
    Payload: {
      responseDraft: ResponseDraft;
    };
  };
  classificationResult: {
    Payload: Classification;
  };
}

export interface AutoSenderOutput {
  sent: boolean;
  mode: string;
  ticketId: string;
}

/**
 * AutoSenderLambda — core auto-send routing handler for ROUTE-03.
 *
 * Decision logic:
 * 1. Read SYSTEM#config / ROUTING_MODE from DynamoDB at runtime — never rely
 *    solely on responseDraft.routing. Per STATE.md decision: "routingDecision()
 *    reflects ticket characteristics, not operational mode."
 * 2. Only post a public reply when BOTH conditions are true:
 *    - system mode === 'auto_send'
 *    - responseDraft.routing === 'auto_send'
 * 3. Any other combination writes an internal (private) Zendesk note instead.
 * 4. Every decision (sent or withheld) is written to DynamoDB as an AUTOSEND# record.
 */
export async function handler(event: AutoSenderInput): Promise<AutoSenderOutput> {
  const { ticketId } = event;
  const responseDraft = event.responseResult.Payload.responseDraft;
  const classification = event.classificationResult.Payload;

  const auditTableName = process.env.AUDIT_TABLE_NAME;
  const zendeskSubdomain = process.env.ZENDESK_SUBDOMAIN ?? '';
  const zendeskApiToken = process.env.ZENDESK_API_TOKEN ?? '';

  // --- Step 1: Read system routing mode from DynamoDB ---
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
        // Validate the mode is a known RoutingMode value before using it
        if (rawMode === 'shadow' || rawMode === 'agent_assisted' || rawMode === 'auto_send') {
          systemMode = rawMode;
        }
      }
    } catch (err) {
      // Default to 'shadow' on read error — fail safe, never auto-send on config errors
      console.error('Failed to read SYSTEM#config ROUTING_MODE, defaulting to shadow:', err);
    }
  }

  // --- Step 2: Decide send vs. withhold ---
  const shouldAutoSend =
    systemMode === 'auto_send' && responseDraft.routing === 'auto_send';

  const timestamp = new Date().toISOString();

  // --- Step 3: Post to Zendesk ---
  try {
    const commentBody = responseDraft.draft;
    const isPublic = shouldAutoSend;

    await fetch(
      `https://${zendeskSubdomain}.zendesk.com/api/v2/tickets/${ticketId}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${zendeskApiToken}`,
        },
        body: JSON.stringify({
          ticket: {
            comment: { body: commentBody, public: isPublic },
          },
        }),
      },
    );
  } catch (err) {
    // Log but don't re-throw — we still write the audit record
    console.error(`Zendesk ${shouldAutoSend ? 'public reply' : 'internal note'} write failed for ticket ${ticketId}:`, err);
  }

  // --- Step 4: Write AUTOSEND# audit record to DynamoDB ---
  if (auditTableName) {
    const sk = shouldAutoSend ? `SENT#${timestamp}` : `WITHHELD#${timestamp}`;
    const record: AutoSendRecord = {
      pk: `AUTOSEND#${ticketId}`,
      sk,
      ticketId,
      routing: responseDraft.routing,
      mode: systemMode,
      sent: shouldAutoSend,
      confidence: classification.confidence,
      urgency: classification.urgency,
      timestamp,
    };

    try {
      await dynamo.send(new PutItemCommand({
        TableName: auditTableName,
        Item: {
          pk: { S: record.pk },
          sk: { S: record.sk },
          ticketId: { S: record.ticketId },
          routing: { S: record.routing },
          mode: { S: record.mode },
          sent: { BOOL: record.sent },
          confidence: { N: String(record.confidence) },
          urgency: { S: record.urgency },
          timestamp: { S: record.timestamp },
        },
      }));
    } catch (err) {
      // Fire-and-forget audit write — don't fail the handler if DynamoDB write fails
      console.error('Failed to write AUTOSEND# audit record:', err);
    }
  }

  return {
    sent: shouldAutoSend,
    mode: systemMode,
    ticketId,
  };
}
