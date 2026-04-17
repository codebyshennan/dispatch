"use node";
import { v } from "convex/values";
import { action } from "./_generated/server";
import { api } from "./_generated/api";
import OpenAI from "openai";
import { z } from "zod";
import { BulkJobIntentSchema } from "../src/lib/schemas";
import type { RouterResult } from "./router";
import { READ_SYSTEM_PROMPT, WRITE_SYSTEM_PROMPT, UNIFIED_SYSTEM_PROMPT } from "./prompts";

// Trust the router's lane decision (and switch to the per-lane prompt) only
// when it is at least this confident. Below the threshold we fall back to the
// unified prompt so accuracy never regresses.
const ROUTER_CONFIDENCE_THRESHOLD = 0.8;
const MODEL = "openai/gpt-5.4-mini";

const SourceSchema = z.object({
  id: z.string(),
  title: z.string(),
  snippet: z.string(),
});

const QuestionShape = z.object({
  type: z.literal("question"),
  answer: z.string(),
  sources: z.array(SourceSchema).default([]),
});

const BulkOpShape = z.object({
  type: z.literal("bulk_op"),
  intent: BulkJobIntentSchema,
});

const UnifiedShape = z.discriminatedUnion("type", [QuestionShape, BulkOpShape]);

export type ProcessResult = z.infer<typeof UnifiedShape>;

export const processRequest = action({
  args: {
    rawRequest: v.string(),
    conversationHistory: v.optional(v.array(v.object({
      role: v.union(v.literal("user"), v.literal("assistant")),
      content: v.string(),
    }))),
    recentJobId: v.optional(v.id("jobs")),
  },
  handler: async (ctx, args): Promise<ProcessResult> => {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) throw new Error("OPENROUTER_API_KEY not set");

    const client = new OpenAI({
      baseURL: "https://openrouter.ai/api/v1",
      apiKey,
    });

    // Cheap upfront router classifies intent. Best-effort — failures fall
    // through to the unified prompt below.
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

    // Lane resolves to one of: "read", "write", or "unified" (fallback).
    // "clarify" intentionally routes to unified — the unified prompt handles
    // ambiguity better than either single-shape prompt.
    const lane: "read" | "write" | "unified" =
      trustRouter && routerResult!.lane === "read"  ? "read"  :
      trustRouter && routerResult!.lane === "write" ? "write" :
      "unified";

    // KB retrieval. Skipped on the write lane — bulk_op intent extraction
    // does not benefit from KB context.
    let kbContext = "";
    if (lane !== "write") {
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

    // Recent job result, when supplied.
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

    const basePrompt =
      lane === "read"  ? READ_SYSTEM_PROMPT  :
      lane === "write" ? WRITE_SYSTEM_PROMPT :
      UNIFIED_SYSTEM_PROMPT;

    const systemPrompt = basePrompt + kbContext + jobContext;

    const response = await client.chat.completions.create({
      model: MODEL,
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

    // Validate against the lane-specific schema. The single-shape lanes can
    // only produce one valid type — unified accepts either.
    const schema =
      lane === "read"  ? QuestionShape :
      lane === "write" ? BulkOpShape   :
      UnifiedShape;
    return schema.parse(raw) as ProcessResult;
  },
});
