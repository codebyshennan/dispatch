"use node";
import { v } from "convex/values";
import { action } from "./_generated/server";
import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { BulkJobIntentSchema } from "../src/lib/schemas";

const SYSTEM_PROMPT = `You are a CX operations assistant that converts natural language requests into structured bulk operation plans.

Extract the following from the user's request:
- intent: the type of bulk operation (must be one of: bulk_update_card_limit, bulk_freeze_cards, bulk_notify_cardholders)
- targetGroup: the team or group name (e.g. "Marketing", "Engineering")
- targetCountEstimate: estimated number of cards if mentioned
- newLimit: spending limit with currency and amount (for bulk_update_card_limit)
- notifyCardholders: whether to notify affected cardholders

If the request is ambiguous or missing required fields, return your best interpretation.
Always return valid JSON matching the schema exactly.`;

export const interpretIntent = action({
  args: { rawRequest: v.string() },
  handler: async (_ctx, args) => {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) throw new Error("OPENROUTER_API_KEY not set");

    const client = new OpenAI({
      baseURL: "https://openrouter.ai/api/v1",
      apiKey,
    });

    const response = await client.chat.completions.create({
      model: "google/gemma-3-27b-it:free",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content: `${args.rawRequest}\n\nRespond with valid JSON only, no markdown.`,
        },
      ],
      temperature: 0,
      max_tokens: 256,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error("LLM returned empty response");

    const raw = JSON.parse(content.replace(/```json\n?|```/g, "").trim());
    const parsed = BulkJobIntentSchema.parse(raw);
    if (!parsed) throw new Error("LLM did not return a valid intent");

    return parsed;
  },
});

