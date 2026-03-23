import { z } from 'zod';

/**
 * Zod schema matching the Ticket interface.
 */
export const TicketSchema = z.object({
  id: z.string(),
  subject: z.string(),
  body: z.string(),
  requesterEmail: z.string(),
  jurisdiction: z.string().optional(),
  language: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

/**
 * Zod schema matching the AuditLogEntry interface.
 */
export const AuditLogEntrySchema = z.object({
  pk: z.string(),
  sk: z.string(),
  type: z.enum(['llm_call', 'runbook_execution', 'routing_decision']),
  model: z.string().optional(),
  promptHash: z.string().optional(),
  latencyMs: z.number().optional(),
  estimatedCostUsd: z.number().optional(),
  success: z.boolean(),
  error: z.string().optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
  createdAt: z.string(),
});

/**
 * Zod schema for the structured classification output produced by the classifier Lambda.
 * This is the canonical definition — shared by @meridian/lambda-eval and @meridian/lambda-classifier.
 */
export const ClassificationSchema = z.object({
  category: z.string(),
  sub_category: z.string(),
  urgency: z.enum(['P1', 'P2', 'P3', 'P4']),
  sentiment: z.number().min(-1).max(1),
  language: z.string(),
  confidence: z.number().min(0).max(1),
  compliance_flags: z.array(z.string()),
  crypto_specific_tags: z.array(z.string()),
});

export type Classification = z.infer<typeof ClassificationSchema>;

/**
 * Factory function that wraps any caller-provided schema in the LLMResponse envelope.
 * Usage: const schema = makeLLMResponseSchema(MyOutputSchema);
 */
export function makeLLMResponseSchema<T>(dataSchema: z.ZodType<T>) {
  return z.object({
    data: dataSchema,
    latencyMs: z.number(),
    estimatedCostUsd: z.number(),
    promptHash: z.string(),
    model: z.string(),
    provider: z.enum(['anthropic', 'openai']),
  });
}
