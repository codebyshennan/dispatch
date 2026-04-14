import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { type Classification, type KBResult, type ResponseDraft } from '@dispatch/core';
import { generateResponse } from './generate.js';

/**
 * Shape of the Step Functions state passed to the GenerateResponse task.
 * After the KBRetrieval step, Step Functions wraps Lambda results in a Payload field.
 */
interface ResponseGenInput {
  ticketId: string;
  subject: string;
  body: string;
  jurisdiction?: string;
  /** Step Functions wraps Lambda result in Payload */
  classificationResult: { Payload: Classification };
  /** Step Functions wraps Lambda result in Payload */
  kbResult: { Payload: { kbArticles: KBResult[]; kbHits: number } };
}

// DynamoDB client — module-level singleton, reused across Lambda warm invocations
const dynamoClient = new DynamoDBClient({});

/**
 * Step Functions task handler for the GenerateResponse step.
 *
 * Extracts classification and KB articles from Step Functions Payload wrappers,
 * calls generateResponse(), and returns the full state enriched with responseDraft.
 * Also writes a RESPONSE# DynamoDB record (with variantId) so sidebar-api can read
 * pre-computed results and send.ts can propagate variantId to METRICS#acceptance.
 */
export async function handler(
  event: ResponseGenInput,
): Promise<ResponseGenInput & { responseDraft: ResponseDraft }> {
  // CRITICAL: Step Functions wraps Lambda results in a Payload field
  const classification = event.classificationResult.Payload;
  const kbArticles = event.kbResult.Payload.kbArticles;

  const { responseDraft, variantId } = await generateResponse({
    ticketId: event.ticketId,
    subject: event.subject,
    body: event.body,
    jurisdiction: event.jurisdiction,
    classification,
    kbArticles,
  });

  const auditTable = process.env.AUDIT_TABLE_NAME;

  if (auditTable) {
    const now = new Date().toISOString();

    // Write RESPONSE# record so sidebar-api can read pre-computed response draft by ticket ID.
    // variantId is stored here so send.ts can include it in METRICS#acceptance writes
    // for MonitoringLambda A/B comparison (EVAL-06).
    try {
      await dynamoClient.send(new PutItemCommand({
        TableName: auditTable,
        Item: {
          pk: { S: `TICKET#${event.ticketId}` },
          sk: { S: `RESPONSE#${now}` },
          ticketId: { S: event.ticketId },
          type: { S: 'ticket_response' },
          responseDraft: { S: JSON.stringify(responseDraft) },
          kbArticles: { S: JSON.stringify(kbArticles ?? []) },
          variantId: { S: variantId },
          processedAt: { S: now },
          createdAt: { S: now },
        },
      }));
    } catch (err) {
      // Graceful degradation per INFRA-09 — pipeline must not fail on audit write failure
      console.error('[response-generator] Failed to write RESPONSE# record:', err);
    }
  }

  return { ...event, responseDraft };
}
