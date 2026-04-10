"use node";
import { internalMutation } from "./_generated/server";
import { MOCK_CARDS } from "../src/lib/mock-cards";

/**
 * Seed mock_cards table — idempotent (skips existing cards by cardId).
 * Run: `npx convex run seed:seedMockCards`
 */
export const seedMockCards = internalMutation({
  args: {},
  handler: async (ctx) => {
    let inserted = 0;
    let skipped = 0;

    for (const card of MOCK_CARDS) {
      const existing = await ctx.db
        .query("mock_cards")
        .withIndex("by_card_id", (q) => q.eq("cardId", card.cardId))
        .unique();

      if (existing) {
        skipped++;
        continue;
      }

      await ctx.db.insert("mock_cards", {
        cardId: card.cardId,
        cardholderName: card.cardholderName,
        team: card.team,
        currentLimit: card.currentLimit,
        status: card.status,
        email: card.email,
      });
      inserted++;
    }

    return { inserted, skipped };
  },
});
