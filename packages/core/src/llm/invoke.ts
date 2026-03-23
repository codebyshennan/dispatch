import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { createHash } from 'crypto';
import type { z } from 'zod';
import type { LLMOptions, LLMProvider, AuditLogEntry } from '../types/index.js';

/**
 * Result returned by llm.invoke() — carries both the parsed data and the audit entry.
 * The caller is responsible for persisting the auditEntry to DynamoDB when available.
 */
export interface LLMResult<T> {
  data: T;
  latencyMs: number;
  estimatedCostUsd: number;
  promptHash: string;
  model: string;
  provider: LLMProvider;
  auditEntry: AuditLogEntry;
}

/**
 * Structured error thrown by invoke() after retries are exhausted.
 * The `auditEntry` field carries a complete AuditLogEntry for the failed call;
 * callers that catch this error can persist it to DynamoDB for a full audit trail.
 */
export class MeridianLLMError extends Error {
  readonly code: string;
  readonly provider: LLMProvider;
  readonly model: string;
  readonly promptHash: string;
  readonly originalError: unknown;
  readonly auditEntry: AuditLogEntry;

  constructor(opts: {
    code: string;
    provider: LLMProvider;
    model: string;
    promptHash: string;
    originalError: unknown;
    auditEntry: AuditLogEntry;
  }) {
    const message =
      opts.originalError instanceof Error
        ? opts.originalError.message
        : String(opts.originalError);
    super(`[MeridianLLMError] ${opts.code}: ${message}`);
    this.name = 'MeridianLLMError';
    this.code = opts.code;
    this.provider = opts.provider;
    this.model = opts.model;
    this.promptHash = opts.promptHash;
    this.originalError = opts.originalError;
    this.auditEntry = opts.auditEntry;
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function buildPromptHash(system: string | undefined, userContent: string): string {
  const raw = (system ?? '') + userContent;
  return createHash('sha256').update(raw).digest('hex').slice(0, 16);
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callAnthropic<T>(
  userContent: string,
  options: LLMOptions<T>,
): Promise<{ rawText: string; inputTokens: number; outputTokens: number }> {
  const client = new Anthropic();
  const response = await client.messages.create({
    model: options.model,
    max_tokens: options.maxTokens ?? 1024,
    ...(options.system ? { system: options.system } : {}),
    messages: [{ role: 'user', content: userContent }],
    ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
  });

  const block = response.content[0];
  if (!block || block.type !== 'text') {
    throw new Error('Anthropic response contained no text block');
  }

  return {
    rawText: block.text,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}

async function callOpenAI<T>(
  userContent: string,
  options: LLMOptions<T>,
): Promise<{ rawText: string; inputTokens: number; outputTokens: number }> {
  const client = new OpenAI();
  const response = await client.chat.completions.create({
    model: options.model,
    messages: [
      ...(options.system ? [{ role: 'system' as const, content: options.system }] : []),
      { role: 'user' as const, content: userContent },
    ],
    max_tokens: options.maxTokens ?? 1024,
    ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
  });

  const content = response.choices[0]?.message?.content;
  if (typeof content !== 'string') {
    throw new Error('OpenAI response contained no content');
  }

  const usage = response.usage;
  return {
    rawText: content,
    inputTokens: usage?.prompt_tokens ?? 0,
    outputTokens: usage?.completion_tokens ?? 0,
  };
}

async function callOpenRouter<T>(
  userContent: string,
  options: LLMOptions<T>,
): Promise<{ rawText: string; inputTokens: number; outputTokens: number }> {
  const client = new OpenAI({
    baseURL: 'https://openrouter.ai/api/v1',
    apiKey: process.env.OPENROUTER_API_KEY,
  });
  const response = await client.chat.completions.create({
    model: options.model,
    messages: [
      ...(options.system ? [{ role: 'system' as const, content: options.system }] : []),
      { role: 'user' as const, content: userContent },
    ],
    max_tokens: options.maxTokens ?? 1024,
    ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
  });

  const content = response.choices[0]?.message?.content;
  if (typeof content !== 'string') {
    throw new Error('OpenRouter response contained no content');
  }

  const usage = response.usage;
  return {
    rawText: content,
    inputTokens: usage?.prompt_tokens ?? 0,
    outputTokens: usage?.completion_tokens ?? 0,
  };
}

function estimateCost(
  provider: LLMProvider,
  inputTokens: number,
  outputTokens: number,
): number {
  if (provider === 'anthropic') {
    // Claude Sonnet approximate rates — good enough for audit logging
    return inputTokens * 0.000003 + outputTokens * 0.000015;
  }
  // GPT-4o approximate rates
  return inputTokens * 0.000005 + outputTokens * 0.000015;
}

// ---------------------------------------------------------------------------
// Main invoke function
// ---------------------------------------------------------------------------

const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 1000;

/**
 * Core LLM invocation function. Single entry point for every Lambda in the system.
 *
 * Model tiering is caller-delegated (INFRA-04): pass the exact model string in
 * `options.model`. Convention:
 *   - Complex tasks (classification, response draft): `claude-opus-4-5`
 *   - Routine / high-volume tasks (intent detection, simple extraction): `claude-haiku-3-5`
 *
 * Retry policy: 3 attempts with exponential backoff starting at 1s (1s, 2s, 4s).
 * On permanent failure, throws MeridianLLMError with structured metadata.
 *
 * The returned `auditEntry` must be written to DynamoDB by the caller when available.
 * invoke() itself has no DynamoDB dependency — safe to run locally without AWS credentials.
 */
export async function invoke<T>(
  userContent: string,
  options: LLMOptions<T>,
): Promise<LLMResult<T>> {
  const promptHash = buildPromptHash(options.system, userContent);
  const startMs = Date.now();
  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      await sleep(BASE_BACKOFF_MS * Math.pow(2, attempt - 1));
    }

    try {
      const { rawText, inputTokens, outputTokens } =
        options.provider === 'anthropic'
          ? await callAnthropic(userContent, options)
          : options.provider === 'openrouter'
            ? await callOpenRouter(userContent, options)
            : await callOpenAI(userContent, options);

      const latencyMs = Date.now() - startMs;
      const estimatedCostUsd = estimateCost(options.provider, inputTokens, outputTokens);

      // Zod validation — caller provides the schema; parse throws on mismatch
      let parsed: T;
      try {
        const raw: unknown = JSON.parse(rawText);
        parsed = options.schema.parse(raw);
      } catch {
        // Try parsing the rawText directly if it's not JSON (for string schemas)
        parsed = options.schema.parse(rawText);
      }

      const now = new Date().toISOString();
      const auditEntry: AuditLogEntry = {
        pk: `AUDIT#${promptHash}`,
        sk: now,
        type: 'llm_call',
        model: options.model,
        promptHash,
        latencyMs,
        estimatedCostUsd,
        success: true,
        payload: { provider: options.provider, attempt: attempt + 1 },
        createdAt: now,
      };

      return {
        data: parsed,
        latencyMs,
        estimatedCostUsd,
        promptHash,
        model: options.model,
        provider: options.provider,
        auditEntry,
      };
    } catch (err) {
      lastError = err;
      // Continue to next retry attempt
    }
  }

  // All retries exhausted — build failure audit entry and throw structured error
  const latencyMs = Date.now() - startMs;
  const now = new Date().toISOString();
  const _failureAuditEntry: AuditLogEntry = {
    pk: `AUDIT#${promptHash}`,
    sk: now,
    type: 'llm_call',
    model: options.model,
    promptHash,
    latencyMs,
    estimatedCostUsd: 0,
    success: false,
    error: lastError instanceof Error ? lastError.message : String(lastError),
    payload: { provider: options.provider, attempts: MAX_ATTEMPTS },
    createdAt: now,
  };

  throw new MeridianLLMError({
    code: 'LLM_CALL_FAILED',
    provider: options.provider,
    model: options.model,
    promptHash,
    originalError: lastError,
    auditEntry: _failureAuditEntry,
  });
}
