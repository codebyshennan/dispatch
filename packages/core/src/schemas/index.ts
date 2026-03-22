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
