// Prompt evals — one suite per lane. Skipped when OPENROUTER_API_KEY is unset
// so CI doesn't spend money on every PR. Run locally with:
//   OPENROUTER_API_KEY=... pnpm test prompts-eval
//
// These evals validate the per-lane prompts in isolation (no KB injection,
// no router). They check that:
//   - The model produces the correct discriminated-union shape for the lane
//   - For write: the intent's structured fields match the expected values
//   - For read: the answer contains expected substrings
//
// They do NOT validate KB citation quality — that requires a live KB and is
// a separate evaluation problem.

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import OpenAI from "openai";
import { READ_SYSTEM_PROMPT, WRITE_SYSTEM_PROMPT } from "../../../convex/prompts";

const HAS_KEY = Boolean(process.env.OPENROUTER_API_KEY);
const MODEL = "openai/gpt-5.4-mini";

function loadJsonl<T>(relativePath: string): T[] {
  const full = resolve(process.cwd(), relativePath);
  return readFileSync(full, "utf-8")
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as T);
}

function makeClient(): OpenAI {
  return new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: process.env.OPENROUTER_API_KEY!,
  });
}

async function callLLM(systemPrompt: string, userMessage: string): Promise<unknown> {
  const client = makeClient();
  const response = await client.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
    temperature: 0,
    max_tokens: 512,
  });
  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("empty response");
  return JSON.parse(content.replace(/```json\n?|```/g, "").trim());
}

// ── read lane ────────────────────────────────────────────────────────────────

interface ReadCase {
  id: string;
  query: string;
  mustContain: string[];
  minSources: number;
}

describe.skipIf(!HAS_KEY)("read prompt evals", () => {
  const cases = loadJsonl<ReadCase>("datasets/eval/read.jsonl");

  it.each(cases)("$id — $query", async (c) => {
    const out = (await callLLM(READ_SYSTEM_PROMPT, c.query)) as {
      type: string;
      answer?: string;
      sources?: unknown[];
    };
    expect(out.type).toBe("question");
    expect(typeof out.answer).toBe("string");
    const lower = (out.answer ?? "").toLowerCase();
    for (const term of c.mustContain) {
      expect(lower).toContain(term.toLowerCase());
    }
    expect((out.sources ?? []).length).toBeGreaterThanOrEqual(c.minSources);
  }, 30_000);
});

// ── write lane ───────────────────────────────────────────────────────────────

interface WriteCase {
  id: string;
  query: string;
  expectedIntent: string;
  expectedTargetGroup: string;
  expectedLimit?: { currency: string; amount: number };
  expectedNotify?: boolean;
}

describe.skipIf(!HAS_KEY)("write prompt evals", () => {
  const cases = loadJsonl<WriteCase>("datasets/eval/write.jsonl");

  it.each(cases)("$id — $query", async (c) => {
    const out = (await callLLM(WRITE_SYSTEM_PROMPT, c.query)) as {
      type: string;
      intent?: {
        intent: string;
        targetGroup: string;
        newLimit?: { currency: string; amount: number };
        notifyCardholders?: boolean;
      };
    };
    expect(out.type).toBe("bulk_op");
    expect(out.intent?.intent).toBe(c.expectedIntent);
    expect(out.intent?.targetGroup).toBe(c.expectedTargetGroup);
    if (c.expectedLimit) {
      expect(out.intent?.newLimit?.currency).toBe(c.expectedLimit.currency);
      expect(out.intent?.newLimit?.amount).toBe(c.expectedLimit.amount);
    }
    if (c.expectedNotify !== undefined) {
      expect(out.intent?.notifyCardholders).toBe(c.expectedNotify);
    }
  }, 30_000);
});
