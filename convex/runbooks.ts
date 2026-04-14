import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// ── freeze_card ───────────────────────────────────────────────────────────────
export const freezeCard = mutation({
  args: { cardId: v.string(), freeze: v.boolean() },
  handler: async (ctx, args) => {
    const card = await ctx.db
      .query("mock_cards")
      .withIndex("by_card_id", (q) => q.eq("cardId", args.cardId))
      .unique();
    if (!card) throw new Error(`Card ${args.cardId} not found`);
    if (card.status === "cancelled") throw new Error("Cannot freeze a cancelled card");

    const newStatus = args.freeze ? "frozen" : "active";
    await ctx.db.patch(card._id, { status: newStatus });

    return {
      id: args.cardId,
      status: newStatus,
      last4: args.cardId.slice(-4),
      message: `Card successfully ${args.freeze ? "frozen" : "unfrozen"}`,
    };
  },
});

// ── block_card ────────────────────────────────────────────────────────────────
export const blockCard = mutation({
  args: { cardId: v.string() },
  handler: async (ctx, args) => {
    const card = await ctx.db
      .query("mock_cards")
      .withIndex("by_card_id", (q) => q.eq("cardId", args.cardId))
      .unique();
    if (!card) throw new Error(`Card ${args.cardId} not found`);

    await ctx.db.patch(card._id, { status: "cancelled" });

    return {
      id: args.cardId,
      status: "blocked",
      last4: args.cardId.slice(-4),
      message: "Card permanently blocked. A replacement card can be issued via the card API.",
    };
  },
});

// ── list_transactions ─────────────────────────────────────────────────────────
export const listTransactions = query({
  args: { cardId: v.string() },
  handler: async (_ctx, args) => {
    return {
      cardId: args.cardId,
      data: [
        { id: "txn_8821c3d1", merchantName: "INTL TECH SVC",   amount: -8400,  currency: "HKD", status: "disputed", createdAt: "2024-03-21T09:14:22Z" },
        { id: "txn_2291a4f0", merchantName: "AWS Asia Pacific", amount: -3200,  currency: "HKD", status: "cleared",  createdAt: "2024-03-20T15:30:01Z" },
        { id: "txn_4417d9c8", merchantName: "Stripe HK Ltd",    amount: -18900, currency: "HKD", status: "cleared",  createdAt: "2024-03-15T11:05:44Z" },
      ],
      total: 3,
    };
  },
});

// ── get_transaction ───────────────────────────────────────────────────────────
export const getTransaction = query({
  args: { transactionId: v.string() },
  handler: async (_ctx, args) => {
    return {
      id: args.transactionId,
      merchantName: "INTL TECH SVC",
      merchantCategory: "7372",
      amount: -8400,
      currency: "HKD",
      status: "disputed",
      cardId: "crd_4821a8e3f2",
      cardLast4: "4821",
      authCode: "A48291",
      createdAt: "2024-03-21T09:14:22Z",
      settledAt: "2024-03-22T00:00:00Z",
    };
  },
});

// ── report_fraud ──────────────────────────────────────────────────────────────
export const reportFraud = mutation({
  args: { transactionId: v.string(), reason: v.optional(v.string()) },
  handler: async (_ctx, args) => {
    return {
      id: `frd_${Date.now().toString(36)}`,
      transactionId: args.transactionId,
      status: "open",
      reason: args.reason ?? "Unauthorized charge",
      createdAt: new Date().toISOString(),
      message: "Fraud alert created. Transaction flagged for review.",
    };
  },
});

// ── get_balance ───────────────────────────────────────────────────────────────
export const getBalance = query({
  args: {},
  handler: async (_ctx) => {
    return {
      availableBalance: 215250,
      totalBalance: 500000,
      currency: "HKD",
    };
  },
});

// ── update_spend_control ──────────────────────────────────────────────────────
export const updateSpendControl = mutation({
  args: {
    cardId: v.string(),
    perTransactionLimit: v.number(),
    monthlyLimit: v.number(),
  },
  handler: async (_ctx, args) => {
    return {
      id: args.cardId,
      spendControl: {
        perTransactionLimit: args.perTransactionLimit,
        monthlyLimit: args.monthlyLimit,
        currency: "HKD",
      },
      updatedAt: new Date().toISOString(),
      message: "Spend controls updated successfully.",
    };
  },
});
