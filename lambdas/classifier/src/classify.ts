import { invoke, ClassificationSchema, type Classification } from '@meridian/core';
import * as fs from 'fs';
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

function readPromptFile(relativePath: string): string {
  // prompts/ is at the workspace root, two levels above lambdas/classifier/
  const promptPath = path.resolve(__dirname, '../../../prompts', relativePath);
  if (!fs.existsSync(promptPath)) {
    throw new Error(`Prompt not found: ${promptPath}`);
  }
  const raw = fs.readFileSync(promptPath, 'utf-8');
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
}

export async function classify(input: ClassifyInput): Promise<ClassifyOutput> {
  const systemPrompt = readPromptFile('system/classification.md');
  const classificationPrompt = readPromptFile('classification/v1.md');

  const userMessage = `${classificationPrompt}\n\nTicket ID: ${input.ticketId}\nSubject: ${input.subject}\n\n${input.body}`;

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
  };
}
