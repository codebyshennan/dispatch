"use node";
import { v } from "convex/values";
import { action } from "./_generated/server";
import OpenAI from "openai";
import { z } from "zod";

const ROUTER_MODEL = "anthropic/claude-haiku-4-5";

const ROUTER_PROMPT = `You are an intent router for Reap's CX ops assistant. Classify the user's most recent message into one lane.

LANES:
- "read"    — user is asking a question (policies, limits, supported operations, job status, KB lookup). No state change.
- "write"   — user is requesting a bulk operation on cards (set/update limits, freeze, notify). State-mutating.
- "clarify" — request is ambiguous or missing required info (no team named, no amount given for a limit change, unclear referent).

OUTPUT — return JSON only, no markdown:
{ "lane": "read" | "write" | "clarify", "confidence": <0.0-1.0> }

confidence reflects how certain you are. Use ≤0.7 when the message could plausibly be in another lane.`;

const RouterResultSchema = z.object({
  lane: z.enum(["read", "write", "clarify"]),
  confidence: z.number().min(0).max(1),
});

export type RouterResult = z.infer<typeof RouterResultSchema>;

export const route = action({
  args: {
    rawRequest: v.string(),
    conversationHistory: v.optional(v.array(v.object({
      role: v.union(v.literal("user"), v.literal("assistant")),
      content: v.string(),
    }))),
  },
  handler: async (_ctx, args): Promise<RouterResult> => {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) throw new Error("OPENROUTER_API_KEY not set");

    const client = new OpenAI({
      baseURL: "https://openrouter.ai/api/v1",
      apiKey,
    });

    const response = await client.chat.completions.create({
      model: ROUTER_MODEL,
      messages: [
        { role: "system", content: ROUTER_PROMPT },
        ...(args.conversationHistory ?? []),
        { role: "user", content: args.rawRequest },
      ],
      temperature: 0,
      max_tokens: 64,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("router returned empty response");

    const cleaned = content.replace(/```json\n?|```/g, "").trim();
    const raw: unknown = JSON.parse(cleaned);
    return RouterResultSchema.parse(raw);
  },
});
