import { randomUUID } from 'node:crypto';
import { classify } from '../../../lambdas/classifier/src/classify.js';
import { generateResponse } from '../../../lambdas/response-generator/src/generate.js';
import { searchKB } from './kb-index.js';
import type { SidebarPayload } from '@beacon/core';

export interface AnalyzeInput {
  subject: string;
  body: string;
}

export async function analyze(input: AnalyzeInput): Promise<{ ticketId: string; payload: SidebarPayload }> {
  const ticketId = randomUUID();
  const { subject, body } = input;

  // Step 1: classify
  const { classification } = await classify({ ticketId, subject, body });

  // Step 2: KB retrieval — search on subject + body excerpt
  const query = `${subject}\n${body.slice(0, 500)}`;
  const kbArticles = await searchKB(query, 5);

  // Step 3: generate draft response
  const { responseDraft } = await generateResponse({
    ticketId,
    subject,
    body,
    classification,
    kbArticles,
  });

  const payload: SidebarPayload = {
    ticketId,
    status: 'ready',
    classification,
    responseDraft,
    kbArticles,
    similarTickets: [],
    processedAt: new Date().toISOString(),
  };

  return { ticketId, payload };
}
