"use node";
import { v } from "convex/values";
import { action } from "./_generated/server";
import { api } from "./_generated/api";
import OpenAI from "openai";
import { z } from "zod";
import { BulkJobIntentSchema } from "../src/lib/schemas";
import type { RouterResult } from "./router";

// Trust the router's lane decision (and skip KB on `write`) only when it is
// at least this confident. Below the threshold we fall back to the unified
// pipeline so accuracy never regresses.
const ROUTER_CONFIDENCE_THRESHOLD = 0.8;

const BASE_SYSTEM_PROMPT = `You are a CX operations assistant for Reap's card management team.

Determine whether the user's message is a QUESTION or a BULK OPERATION REQUEST, then respond with JSON only.

CORE POLICY RULES (always apply):
[P4] Operations affecting more than 25 eligible cards require manager approval
[P5] Maximum cards per bulk operation: 200
[P6] Frozen and cancelled cards are automatically excluded from all bulk ops
[P7] Supported bulk operations: bulk_update_card_limit (fully automated), bulk_freeze_cards, bulk_notify_cardholders

RESPONSE FORMAT — return valid JSON only, no markdown:

If the user is asking a question about policies, limits, approvals, or supported operations:
{ "type": "question", "answer": "<concise direct answer>", "sources": [{ "id": "<article id>", "title": "<article title>", "snippet": "<relevant excerpt from the article>" }] }
Only include sources that directly support the answer.

If the user is requesting a bulk operation:
{ "type": "bulk_op", "intent": {
  "intent": "bulk_update_card_limit" | "bulk_freeze_cards" | "bulk_notify_cardholders",
  "targetGroup": "<team name>",
  "targetCountEstimate": <number or null>,
  "newLimit": { "currency": "SGD" | "USD" | "EUR" | "GBP", "amount": <positive number> } | null,
  "notifyCardholders": <boolean>
} }`;

const SourceSchema = z.object({
  id: z.string(),
  title: z.string(),
  snippet: z.string(),
});

const ProcessResultSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("question"),
    answer: z.string(),
    sources: z.array(SourceSchema).default([]),
  }),
  z.object({ type: z.literal("bulk_op"), intent: BulkJobIntentSchema }),
]);

export const processRequest = action({
  args: {
    rawRequest: v.string(),
    conversationHistory: v.optional(v.array(v.object({
      role: v.union(v.literal("user"), v.literal("assistant")),
      content: v.string(),
    }))),
    recentJobId: v.optional(v.id("jobs")),
  },
  handler: async (ctx, args) => {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) throw new Error("OPENROUTER_API_KEY not set");

    const client = new OpenAI({
      baseURL: "https://openrouter.ai/api/v1",
      apiKey,
    });

    // Cheap upfront router classifies intent so we can short-circuit retrieval
    // for pure write operations. Best-effort — failures fall through to the
    // unified pipeline.
    let routerResult: RouterResult | null = null;
    try {
      routerResult = await ctx.runAction(api.router.route, {
        rawRequest: args.rawRequest,
        conversationHistory: args.conversationHistory,
      });
    } catch {
      // Router unavailable — proceed with unified pipeline
    }

    const trustRouter =
      routerResult !== null && routerResult.confidence >= ROUTER_CONFIDENCE_THRESHOLD;
    const skipKB = trustRouter && routerResult!.lane === "write";

    // Search KB for relevant articles to ground the response.
    // Skipped when the router is confident the request is a pure write op —
    // bulk_op intent extraction does not benefit from KB context.
    let kbContext = "";
    if (!skipKB) {
      try {
        const kbResults = await ctx.runAction(api.kb.searchKB, { query: args.rawRequest, limit: 4 });
        if (kbResults.length > 0) {
          kbContext = "\n\nKNOWLEDGE BASE ARTICLES (cite these as sources when relevant):\n" +
            kbResults.map((r) => `[${r.id}] ${r.title}\n${r.snippet}`).join("\n\n");
        }
      } catch {
        // KB unavailable (not seeded yet) — fall back gracefully
      }
    }

    // Include most recent job result if available
    let jobContext = "";
    if (args.recentJobId) {
      try {
        const jobData = await ctx.runQuery(api.queries.getJobWithItems, { jobId: args.recentJobId });
        if (jobData) {
          const { job } = jobData;
          jobContext = `\n\nMOST RECENT JOB RESULT (reference this when the user asks how a job went):
Team: ${job.normalizedPlan.targetGroup}
Operation: Update card limits to ${job.normalizedPlan.newLimit.currency} ${job.normalizedPlan.newLimit.amount.toLocaleString()}
Status: ${job.status}
Results: ${job.succeededCount} cards updated, ${job.failedCount} failed, ${job.skippedCount} excluded by policy`;
        }
      } catch {
        // ignore — best-effort context
      }
    }

    const systemPrompt = BASE_SYSTEM_PROMPT + kbContext + jobContext;

    const response = await client.chat.completions.create({
      model: "openai/gpt-5.4-mini",
      messages: [
        { role: "system", content: systemPrompt },
        ...(args.conversationHistory ?? []),
        { role: "user", content: args.rawRequest },
      ],
      temperature: 0,
      max_tokens: 512,
    });

    const choice = response.choices[0];
    const content = choice?.message?.content;
    if (!content) {
      const reason = choice?.finish_reason ?? "no choices returned";
      const refusal = (choice?.message as { refusal?: string } | undefined)?.refusal;
      throw new Error(
        refusal
          ? `LLM refused: ${refusal}`
          : `LLM returned empty response (finish_reason: ${reason})`
      );
    }

    const cleaned = content.replace(/```json\n?|```/g, "").trim();
    let raw: unknown;
    try {
      raw = JSON.parse(cleaned);
    } catch {
      throw new Error(`LLM returned malformed JSON: ${cleaned.slice(0, 120)}`);
    }
    return ProcessResultSchema.parse(raw);
  },
});
