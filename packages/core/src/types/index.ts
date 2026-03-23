import type { z } from 'zod';

/**
 * A support ticket from Zendesk.
 */
export interface Ticket {
  id: string;
  subject: string;
  body: string;
  requesterEmail: string;
  jurisdiction?: string;
  language?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Supported LLM providers.
 */
export type LLMProvider = 'anthropic' | 'openai';

/**
 * Wrapper around every LLM response, capturing cost and observability data.
 */
export interface LLMResponse<T> {
  data: T;
  latencyMs: number;
  estimatedCostUsd: number;
  promptHash: string;
  model: string;
  provider: LLMProvider;
}

/**
 * Options passed to llm.invoke() at the call site.
 */
export interface LLMOptions<T> {
  provider: LLMProvider;
  model: string;
  system?: string;
  schema: z.ZodType<T>;
  maxTokens?: number;
  temperature?: number;
}

/**
 * A single entry in the DynamoDB audit log for LLM calls and automated actions.
 */
export interface AuditLogEntry {
  pk: string;
  sk: string;
  type: 'llm_call' | 'runbook_execution' | 'routing_decision';
  model?: string;
  promptHash?: string;
  latencyMs?: number;
  estimatedCostUsd?: number;
  success: boolean;
  error?: string;
  payload?: Record<string, unknown>;
  createdAt: string;
}

/**
 * State record for a circuit breaker protecting an external service.
 */
export interface CircuitBreakerState {
  pk: string;
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  failureCount: number;
  lastFailureAt?: string;
  openUntil?: string;
}

