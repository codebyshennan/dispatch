import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { classify, type ClassifyInput } from './classify.js';
import { writeShadowNote } from './shadow.js';
import type { Classification } from '@beacon/core';

// Re-export classify function and types for workspace consumers
// (e.g. @beacon/lambda-batch-classifier) so they can import via
// '@beacon/lambda-classifier' without reaching into internal source paths.
export { classify, type ClassifyInput, type ClassifyOutput } from './classify.js';

// DynamoDB client — module-level singleton, reused across Lambda warm invocations
const dynamoClient = new DynamoDBClient({});

// Handler for the "Classify Ticket" Step Functions task
export async function classifyHandler(event: ClassifyInput) {
  const result = await classify(event);

  const auditTable = process.env.AUDIT_TABLE_NAME;

  if (auditTable) {
    const now = new Date().toISOString();
    const { ticketId, classification } = result;

    // Write CLASSIFICATION# record so sidebar-api can read pre-computed results by ticket ID
    try {
      await dynamoClient.send(new PutItemCommand({
        TableName: auditTable,
        Item: {
          pk: { S: `TICKET#${ticketId}` },
          sk: { S: `CLASSIFICATION#${now}` },
          ticketId: { S: ticketId },
          type: { S: 'ticket_classification' },
          classification: { S: JSON.stringify(classification) },
          createdAt: { S: now },
        },
      }));
    } catch (err) {
      // Graceful degradation per INFRA-09 — pipeline must not fail on audit write failure
      console.error('[classifier] Failed to write CLASSIFICATION# record:', err);
    }

    // Write SIMILAR# record for the sidebar IntelligencePanel similar-ticket section.
    // TODO(Phase 5): populate similarTickets via a secondary query after a GSI on `category`
    // is added to beacon-dev-audit-log (currently no GSI — Scan not viable in real-time path).
    // For now, write an empty array as a placeholder so sidebar-api can detect the record exists.
    try {
      await dynamoClient.send(new PutItemCommand({
        TableName: auditTable,
        Item: {
          pk: { S: `TICKET#${ticketId}` },
          sk: { S: `SIMILAR#${classification.category}` },
          ticketId: { S: ticketId },
          type: { S: 'similar_tickets' },
          category: { S: classification.category },
          // Empty array placeholder — Phase 5 resolver Lambda will backfill via category GSI query
          similarTickets: { S: JSON.stringify([]) },
          createdAt: { S: now },
        },
      }));
    } catch (err) {
      // Graceful degradation per INFRA-09 — pipeline must not fail on audit write failure
      console.error('[classifier] Failed to write SIMILAR# record:', err);
    }
  }

  return result;
}

// Handler for the "Write Shadow Note" Step Functions task
export async function shadowHandler(event: {
  ticketId: string;
  classification: Classification;
}) {
  const subdomain = process.env.ZENDESK_SUBDOMAIN;
  const apiToken = process.env.ZENDESK_API_TOKEN;

  if (!subdomain || !apiToken) {
    throw new Error('ZENDESK_SUBDOMAIN and ZENDESK_API_TOKEN env vars required');
  }

  await writeShadowNote(event.ticketId, event.classification, subdomain, apiToken);
  return { ticketId: event.ticketId, shadowWritten: true };
}
