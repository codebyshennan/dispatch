import { z } from "zod";

export const BulkJobIntentSchema = z.object({
  intent: z.enum([
    "bulk_update_card_limit",
    "bulk_freeze_cards",
    "bulk_notify_cardholders",
  ]),
  targetGroup: z.string().min(1),
  targetCountEstimate: z.number().int().positive().optional(),
  newLimit: z
    .object({
      currency: z.enum(["SGD", "USD", "EUR", "GBP"]),
      amount: z.number().positive(),
    })
    .optional(),
  notifyCardholders: z.boolean().default(false),
});

export type BulkJobIntent = z.infer<typeof BulkJobIntentSchema>;

export const SUPPORTED_INTENTS = ["bulk_update_card_limit"] as const;
