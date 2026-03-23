import { invoke, ClassificationSchema, type Classification, type PromptVariantConfig } from '@meridian/core';
import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb';
import { readFileSync } from 'fs';
import * as path from 'path';

// Deterministic compliance keywords (CLASS-04)
// Must NOT rely on LLM alone — keyword scan runs after every LLM call
const COMPLIANCE_KEYWORDS = [
  'refund', 'legal action', 'regulatory complaint', 'ombudsman',
  'media enquiry', 'journalist', 'solicitor', 'court', 'sue', 'lawsuit',
] as const;

function enforceComplianceFlags(ticketBody: string, llmFlags: string[]): string[] {
  const bodyLower = ticketBody.toLowerCase();
  const detected = COMPLIANCE_KEYWORDS.filter(kw => bodyLower.includes(kw));
  return [...new Set([...llmFlags, ...detected])];
}

/**
 * Deterministic 80/20 A/B variant-aware prompt loader (EVAL-06).
 *
 * 1. Reads SYSTEM#prompt_variant from DynamoDB to check if a variant is active.
 * 2. Uses ticketId hash (not Math.random!) for deterministic variant assignment.
 * 3. Falls back to control prompt on ENOENT — zero CLASSIFICATION# step failures.
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
  //    e.g. classification/v1-variant-v2-shorter-tone.md
  const promptPath = isVariantB
    ? basePath.replace(/\.md$/, `-variant-${variantConfig!.variantId}.md`)
    : basePath;

  // 4. Read file with ENOENT fallback (prevents CLASSIFICATION# step failures)
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

function readPromptFile(relativePath: string): string {
  // prompts/ is at the workspace root, two levels above lambdas/classifier/
  const promptPath = path.resolve(__dirname, '../../../prompts', relativePath);
  const raw = readFileSync(promptPath, 'utf-8');
  // Strip YAML frontmatter (--- ... ---)
  return raw.replace(/^---[\s\S]*?---\n/, '').trim();
}

export interface ClassifyInput {
  ticketId: string;
  subject: string;
  body: string;
  requesterEmail?: string;
  language?: string;
}

export interface ClassifyOutput {
  ticketId: string;
  classification: Classification;
  variantId: string;
}

export async function classify(input: ClassifyInput): Promise<ClassifyOutput> {
  const tableName = process.env.AUDIT_LOG_TABLE_NAME ?? '';
  const dynamo = new DynamoDBClient({});

  const systemPrompt = readPromptFile('system/classification.md');

  // Build full absolute path for the classification prompt
  const classificationPromptBasePath = path.resolve(
    __dirname,
    '../../../prompts/classification/v1.md',
  );

  const { promptContent: classificationPrompt, variantId } = await loadPromptWithVariant(
    classificationPromptBasePath,
    tableName,
    input.ticketId,
    dynamo,
  );

  // Strip frontmatter from variant-loaded prompt
  const cleanedPrompt = classificationPrompt.replace(/^---[\s\S]*?---\n/, '').trim();

  const userMessage = `${cleanedPrompt}\n\nTicket ID: ${input.ticketId}\nSubject: ${input.subject}\n\n${input.body}`;

  const response = await invoke<Classification>(userMessage, {
    provider: 'anthropic',
    model: 'claude-3-5-haiku-20241022', // routine classification — haiku tier
    system: systemPrompt,
    schema: ClassificationSchema,
    maxTokens: 512,
    temperature: 0,
  });

  // Deterministic post-processing: enforce compliance flags regardless of LLM output (CLASS-04)
  const enrichedFlags = enforceComplianceFlags(input.body, response.data.compliance_flags);

  return {
    ticketId: input.ticketId,
    classification: {
      ...response.data,
      compliance_flags: enrichedFlags,
    },
    variantId,
  };
}
