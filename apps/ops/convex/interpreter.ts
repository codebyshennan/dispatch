"use node";
import { v } from "convex/values";
import { action } from "./_generated/server";
import OpenAI from "openai";
import { z } from "zod";
import { BulkJobIntentSchema } from "../src/lib/schemas";

const UNIFIED_SYSTEM_PROMPT = `You are a CX operations assistant for Reap's card management team.

Determine whether the user's message is a QUESTION or a BULK OPERATION REQUEST, then respond with JSON only.

POLICY KNOWLEDGE — each rule has an ID you must cite as a source when relevant:
[P1] Maximum card spending limit: SGD 5,000 | Minimum: SGD 0
[P2] Supported currencies: SGD, USD, EUR, GBP
[P3] Supported bulk operations: bulk_update_card_limit (fully automated), bulk_freeze_cards, bulk_notify_cardholders
[P4] Operations affecting more than 25 eligible cards require manager approval
[P5] Maximum cards per bulk operation: 200
[P6] Frozen and cancelled cards are automatically excluded from all bulk ops

RESPONSE FORMAT — return valid JSON only, no markdown:

If the user is asking a question about policies, limits, approvals, or supported operations:
{ "type": "question", "answer": "<concise direct answer>", "sources": [{ "id": "P1", "title": "<short rule title>", "snippet": "<exact policy text from the rule>" }] }
Only include sources that directly support the answer. Omit sources array entries for rules that were not used.

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
  args: { rawRequest: v.string() },
  handler: async (_ctx, args) => {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) throw new Error("OPENROUTER_API_KEY not set");

    const client = new OpenAI({
      baseURL: "https://openrouter.ai/api/v1",
      apiKey,
    });

    const response = await client.chat.completions.create({
      model: "openai/gpt-4o-mini",
      messages: [
        { role: "system", content: UNIFIED_SYSTEM_PROMPT },
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
