import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { internal } from "./_generated/api";

export const submitFeedback = mutation({
  args: {
    responseId: v.string(),
    kind: v.union(v.literal("answer"), v.literal("bulk_op")),
    rating: v.union(v.literal("up"), v.literal("down")),
  },
  handler: async (ctx, args) => {
    // Upsert — replace if already rated
    const existing = await ctx.db
      .query("feedback")
      .withIndex("by_response_id", (q) => q.eq("responseId", args.responseId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, { rating: args.rating });
    } else {
      await ctx.db.insert("feedback", {
        responseId: args.responseId,
        kind: args.kind,
        rating: args.rating,
      });
    }

    await ctx.runMutation(internal.metrics.recordMetricEvent, {
      type: "feedback",
      payload: { rating: args.rating, kind: args.kind },
    });
  },
});

export const getRating = mutation({
  args: { responseId: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("feedback")
      .withIndex("by_response_id", (q) => q.eq("responseId", args.responseId))
      .unique();
    return row?.rating ?? null;
  },
});
