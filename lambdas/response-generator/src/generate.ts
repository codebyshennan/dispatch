import { invoke, ResponseDraftSchema, type ResponseDraft, type Classification, type KBResult, type PromptVariantConfig } from '@beacon/core';
import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb';
import { readFileSync } from 'node:fs';
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
 * Deterministic 80/20 A/B variant-aware prompt loader (EVAL-06).
 *
 * Duplicated from lambdas/classifier/src/classify.ts intentionally —
 * each Lambda is independently deployed and must not import from the other.
 *
 * 1. Reads SYSTEM#prompt_variant from DynamoDB to check if a variant is active.
 * 2. Uses ticketId hash (not Math.random!) for deterministic variant assignment.
 * 3. Falls back to control prompt on ENOENT — zero step failures.
 *
 * CRITICAL: Never use Math.random() — different assignments across retries.
 */
async function loadPromptWithVariant(
  basePath: string,
  tableName: string,
  ticketId: string,
  dynamo: DynamoDBClient,
): Promise<{ promptContent: string; variantId: string }> {
  // 1. Read variant config from DynamoDB
  const result = await dynamo.send(new GetItemCommand({
    TableName: tableName,
    Key: { pk: { S: 'SYSTEM#prompt_variant' }, sk: { S: 'ACTIVE' } },
  })).catch(() => null);

  const item = result?.Item;
  const variantConfig: PromptVariantConfig | null = item?.enabled?.BOOL
    ? {
        enabled: true,
        variantId: item.variantId.S!,
        startedAt: item.startedAt.S!,
        splitPercent: Number(item.splitPercent?.N ?? 20),
      }
    : null;

  // 2. Deterministic 80/20 assignment via ticket ID hash
  function hashCode(s: string): number {
    return Array.from(s).reduce((h, c) => (Math.imul(31, h) + c.charCodeAt(0)) | 0, 0);
  }
  const isVariantB = variantConfig?.enabled === true &&
    Math.abs(hashCode(ticketId)) % 5 === 0;

  const variantId = isVariantB ? variantConfig!.variantId : 'control';

  // 3. Build file path — variant file expected alongside control:
  //    e.g. response-generation/v1-variant-v2-shorter-tone.md
  const promptPath = isVariantB
    ? basePath.replace(/\.md$/, `-variant-${variantConfig!.variantId}.md`)
    : basePath;

  // 4. Read file with ENOENT fallback (prevents step failures if variant file missing)
  let promptContent: string;
  try {
    promptContent = readFileSync(promptPath, 'utf-8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT' && isVariantB) {
      console.warn(`[VariantPrompt] Variant file not found: ${promptPath}. Falling back to control.`);
      promptContent = readFileSync(basePath, 'utf-8');
      return { promptContent, variantId: 'control' };
    }
    throw e;
  }

  return { promptContent, variantId };
}

/**
 * Read a prompt file relative to the prompts/ directory at the workspace root.
 * Same pattern as classify.ts in lambdas/classifier.
 */
function readPromptFile(relativePath: string): string {
  const promptPath = path.join(process.cwd(), 'prompts', relativePath);
  const raw = readFileSync(promptPath, 'utf-8');
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

export interface GenerateOutput {
  responseDraft: ResponseDraft;
  variantId: string;
}

/**
 * Generate a KB-grounded draft response for a classified ticket.
 *
 * Post-processing (deterministic, always runs after LLM):
 * 1. applyTermSubstitution — replace prohibited terms in code
 * 2. getJurisdictionFooter — append regulatory footer in code
 * 3. routingDecision — compute routing from Classification, NOT LLM output
 *
 * Returns variantId for propagation to TICKET# DynamoDB record so
 * send.ts can include it in METRICS#acceptance writes.
 */
export async function generateResponse(input: GenerateInput): Promise<GenerateOutput> {
  const tableName = process.env.AUDIT_LOG_TABLE_NAME ?? '';
  const dynamo = new DynamoDBClient({});

  // Load system prompt — fallback if system prompt file not present
  let systemPrompt: string;
  try {
    systemPrompt = readPromptFile('system/response-generation.md');
  } catch {
    systemPrompt =
      'You are a CX agent assistant for Reap, a financial technology company. ' +
      'Generate professional, accurate, and compliant customer service responses.';
  }

  // Build full absolute path for the response-generation prompt
  const genPromptBasePath = path.join(process.cwd(), 'prompts/response-generation/v1.md');

  const { promptContent: rawGenPrompt, variantId } = await loadPromptWithVariant(
    genPromptBasePath,
    tableName,
    input.ticketId,
    dynamo,
  );

  // Strip frontmatter from variant-loaded prompt
  const genPrompt = rawGenPrompt.replace(/^---[\s\S]*?---\n/, '').trim();

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

  const response = await invoke<ResponseDraft>(userMessage, {
    provider: 'openrouter',
    model: 'google/gemma-3-27b-it:free',
    system: systemPrompt,
    schema: ResponseDraftSchema,
    maxTokens: 2048,
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
    responseDraft: {
      draft: finalDraft,
      citations,
      requires_review: routing !== 'auto_send',
      requires_review_reason:
        routing === 'escalate'
          ? `Escalated: ${input.classification.compliance_flags.join(', ') || input.classification.urgency}`
          : undefined,
      routing,
      jurisdiction_footer: footer || undefined,
    },
    variantId,
  };
}
