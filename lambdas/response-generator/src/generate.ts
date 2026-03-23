import { invoke, ResponseDraftSchema, type ResponseDraft, type Classification, type KBResult } from '@meridian/core';
import * as fs from 'node:fs';
import * as path from 'node:path';

// ---------------------------------------------------------------------------
// Prohibited terms map (RESP-03) — deterministic replacement, not prompt-only
// Word-boundary regex prevents 'monetary' matching 'money', etc.
// ---------------------------------------------------------------------------
const PROHIBITED_TERMS: Array<[string, string]> = [
  ['currencies',      'digital assets'],
  ['currency',        'digital asset'],
  ['cryptocurrencies','digital assets'],
  ['cryptocurrency',  'digital asset'],
  ['money',           'digital asset'],
  ['coin',            'digital asset'],
];

// ---------------------------------------------------------------------------
// Jurisdiction regulatory footers (RESP-04) — appended in code, not by LLM
// ---------------------------------------------------------------------------
const JURISDICTION_FOOTERS: Record<string, string> = {
  HK: 'Reap is regulated by the Securities and Futures Commission (SFC) of Hong Kong.',
  SG: 'Reap is regulated by the Monetary Authority of Singapore (MAS).',
  MY: 'Reap is regulated by Bank Negara Malaysia (BNM).',
  TW: 'Reap is regulated by the Financial Supervisory Commission (FSC) of Taiwan.',
  PH: 'Reap is regulated by the Bangko Sentral ng Pilipinas (BSP).',
};

/**
 * Replace prohibited terms in the draft using word-boundary regex.
 * CRITICAL: word-boundary (\b) prevents 'monetary' matching 'money'.
 * Applied deterministically after LLM generation — not prompt-dependent.
 */
export function applyTermSubstitution(draft: string): string {
  let result = draft;
  for (const [prohibited, replacement] of PROHIBITED_TERMS) {
    const regex = new RegExp(`\\b${prohibited}\\b`, 'gi');
    result = result.replace(regex, replacement);
  }
  return result;
}

/**
 * Get the jurisdiction-specific regulatory footer.
 * Returns empty string if jurisdiction is unknown or not provided.
 */
export function getJurisdictionFooter(jurisdiction?: string): string {
  return JURISDICTION_FOOTERS[jurisdiction?.toUpperCase() ?? ''] ?? '';
}

/**
 * Compute deterministic routing decision based on the Classification output.
 * CRITICAL: Takes Classification (from classify() output), NOT the LLM ResponseDraft.
 * This prevents routing being influenced by LLM self-assessment (RESP-05).
 *
 * Rules:
 * - Any compliance_flags or P1/P2 urgency → escalate
 * - P3/P4 + confidence >= 0.90 + zero flags → auto_send
 * - Otherwise → agent_assisted
 */
export function routingDecision(classification: Classification): 'auto_send' | 'agent_assisted' | 'escalate' {
  const hasFlags = classification.compliance_flags.length > 0;

  if (hasFlags || ['P1', 'P2'].includes(classification.urgency)) {
    return 'escalate';
  }

  if (
    ['P3', 'P4'].includes(classification.urgency) &&
    classification.confidence >= 0.90 &&
    !hasFlags
  ) {
    return 'auto_send';
  }

  return 'agent_assisted';
}

/**
 * Read a prompt file relative to the prompts/ directory at the workspace root.
 * Same pattern as classify.ts in lambdas/classifier.
 */
function readPromptFile(relativePath: string): string {
  const promptPath = path.join(process.cwd(), 'prompts', relativePath);
  if (!fs.existsSync(promptPath)) {
    throw new Error(`Prompt not found: ${promptPath}`);
  }
  const raw = fs.readFileSync(promptPath, 'utf-8');
  // Strip YAML frontmatter (--- ... ---)
  return raw.replace(/^---[\s\S]*?---\n/, '').trim();
}

export interface GenerateInput {
  ticketId: string;
  subject: string;
  body: string;
  jurisdiction?: string;
  classification: Classification;
  kbArticles: KBResult[];
}

/**
 * Generate a KB-grounded draft response for a classified ticket.
 *
 * Post-processing (deterministic, always runs after LLM):
 * 1. applyTermSubstitution — replace prohibited terms in code
 * 2. getJurisdictionFooter — append regulatory footer in code
 * 3. routingDecision — compute routing from Classification, NOT LLM output
 */
export async function generateResponse(input: GenerateInput): Promise<ResponseDraft> {
  // Load prompts — fallback if system prompt file not present
  let systemPrompt: string;
  try {
    systemPrompt = readPromptFile('system/response-generation.md');
  } catch {
    systemPrompt =
      'You are a CX agent assistant for Reap, a financial technology company. ' +
      'Generate professional, accurate, and compliant customer service responses.';
  }

  const genPrompt = readPromptFile('response-generation/v1.md');

  // Build KB context block for the prompt
  const kbContext = input.kbArticles
    .map(
      (a, i) =>
        `[KB${i + 1}] ${a.title}\n${a.text}\nSource: ${a.html_url} (relevance: ${(a.similarity * 100).toFixed(0)}%)`,
    )
    .join('\n\n---\n\n');

  const citations = input.kbArticles.map(a => a.html_url);

  const userMessage = [
    genPrompt,
    '',
    `Ticket ID: ${input.ticketId}`,
    `Subject: ${input.subject}`,
    `Body: ${input.body}`,
    `Jurisdiction: ${input.jurisdiction ?? 'unknown'}`,
    '',
    'Classification:',
    JSON.stringify(input.classification, null, 2),
    '',
    'KB Articles:',
    kbContext,
  ].join('\n');

  // CRITICAL: model 'claude-opus-4-5' per INFRA-04 model tiering — complex drafting requires Opus tier
  const response = await invoke<ResponseDraft>(userMessage, {
    provider: 'anthropic',
    model: 'claude-opus-4-5',
    system: systemPrompt,
    schema: ResponseDraftSchema,
    maxTokens: 1024,
    temperature: 0.3,
  });

  // ---------------------------------------------------------------------------
  // Deterministic post-processing (MUST run after LLM, not prompt-dependent)
  // ---------------------------------------------------------------------------
  const cleanedDraft = applyTermSubstitution(response.data.draft);
  const footer = getJurisdictionFooter(input.jurisdiction);
  const routing = routingDecision(input.classification); // Use Classification, NOT response.data
  const finalDraft = footer ? `${cleanedDraft}\n\n${footer}` : cleanedDraft;

  return {
    draft: finalDraft,
    citations,
    requires_review: routing !== 'auto_send',
    requires_review_reason:
      routing === 'escalate'
        ? `Escalated: ${input.classification.compliance_flags.join(', ') || input.classification.urgency}`
        : undefined,
    routing,
    jurisdiction_footer: footer || undefined,
  };
}
