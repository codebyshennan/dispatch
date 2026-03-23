import { type Classification, type KBResult, type ResponseDraft } from '@meridian/core';
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

/**
 * Step Functions task handler for the GenerateResponse step.
 *
 * Extracts classification and KB articles from Step Functions Payload wrappers,
 * calls generateResponse(), and returns the full state enriched with responseDraft.
 */
export async function handler(
  event: ResponseGenInput,
): Promise<ResponseGenInput & { responseDraft: ResponseDraft }> {
  // CRITICAL: Step Functions wraps Lambda results in a Payload field
  const classification = event.classificationResult.Payload;
  const kbArticles = event.kbResult.Payload.kbArticles;

  const responseDraft = await generateResponse({
    ticketId: event.ticketId,
    subject: event.subject,
    body: event.body,
    jurisdiction: event.jurisdiction,
    classification,
    kbArticles,
  });

  return { ...event, responseDraft };
}
