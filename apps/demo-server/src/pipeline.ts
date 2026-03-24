import { randomUUID } from 'node:crypto';
import { classify } from '../../../lambdas/classifier/src/classify';
import { generateResponse } from '../../../lambdas/response-generator/src/generate';
import { searchKB } from './kb-index';
import { computeQAScore } from './qa-score.js';
import { sessionStore } from './session-store.js';
import { invoke } from '@beacon/core';
import { z } from 'zod';
import type { SidebarPayload, Classification, KBResult } from '@beacon/core';

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

  // KB gap detection — flag categories with no strong KB coverage
  const maxSimilarity = kbArticles.length > 0 ? Math.max(...kbArticles.map((a) => a.similarity)) : 0;
  if (maxSimilarity < 0.60) {
    sessionStore.recordKbGap(classification.category, maxSimilarity);
  }

  // Step 3: generate draft response
  const { responseDraft } = await generateResponse({
    ticketId,
    subject,
    body,
    classification,
    kbArticles,
  });

  // QA scoring — deterministic, no LLM call
  const draft = (responseDraft as { draft?: string } | undefined)?.draft ?? '';
  const qaScore = computeQAScore(classification, kbArticles, draft);

  const payload: SidebarPayload = {
    ticketId,
    status: 'ready',
    classification,
    responseDraft,
    kbArticles,
    similarTickets: [],
    qaScore,
    processedAt: new Date().toISOString(),
  };

  return { ticketId, payload };
}

export interface RegenerateInput {
  ticketId: string;
  subject: string;
  body: string;
  classification: Classification;
  kbArticles: KBResult[];
  currentDraft: string;
  instruction: string;
}

export async function regenerateDraft(input: RegenerateInput): Promise<string> {
  const kbContext = input.kbArticles
    .slice(0, 3)
    .map((a, i) => `[KB${i + 1}] ${a.title}\n${a.text.slice(0, 300)}`)
    .join('\n\n---\n\n');

  const userMessage = [
    `Subject: ${input.subject}`,
    `Body: ${input.body}`,
    '',
    'KB sources used in the original draft:',
    kbContext,
    '',
    'Current draft:',
    input.currentDraft,
    '',
    `Agent instruction: ${input.instruction}`,
    '',
    'Revise the draft according to the instruction. Return JSON: { "draft": "..." }',
  ].join('\n');

  const result = await invoke(userMessage, {
    provider: 'openrouter',
    model: 'anthropic/claude-3-5-haiku',
    system:
      'You are a CX agent assistant for Reap, a fintech company. ' +
      'Revise the draft response per the agent instruction. ' +
      'Keep it professional and accurate. Return only JSON with a "draft" field.',
    schema: z.object({ draft: z.string() }),
    maxTokens: 1500,
    temperature: 0.5,
  });

  return result.data.draft;
}
