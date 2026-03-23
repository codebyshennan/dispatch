import { classify, type ClassifyInput } from './classify.js';
import { writeShadowNote } from './shadow.js';
import type { Classification } from '@meridian/core';

// Handler for the "Classify Ticket" Step Functions task
export async function classifyHandler(event: ClassifyInput) {
  const result = await classify(event);
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
