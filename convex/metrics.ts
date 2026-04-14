import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";

export const recordMetricEvent = internalMutation({
  args: {
    type: v.union(
      v.literal("job_created"),
      v.literal("job_completed"),
      v.literal("feedback"),
      v.literal("kb_gap")
    ),
    payload: v.any(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("metrics_events", { type: args.type, payload: args.payload });
  },
});

export const getMetrics = query({
  args: {},
  handler: async (ctx) => {
    const events = await ctx.db.query("metrics_events").take(1000);

    let jobsCreated = 0;
    let jobsCompleted = 0;
    let feedbackUp = 0;
    let feedbackDown = 0;
    const kbGaps: Record<string, number> = {};

    for (const e of events) {
      if (e.type === "job_created") jobsCreated++;
      if (e.type === "job_completed") jobsCompleted++;
      if (e.type === "feedback") {
        if (e.payload?.rating === "up") feedbackUp++;
        if (e.payload?.rating === "down") feedbackDown++;
      }
      if (e.type === "kb_gap" && typeof e.payload?.query === "string") {
        const q = e.payload.query as string;
        kbGaps[q] = (kbGaps[q] ?? 0) + 1;
      }
    }

    const totalFeedback = feedbackUp + feedbackDown;
    return {
      jobsCreated,
      jobsCompleted,
      feedbackUp,
      feedbackDown,
      draftAcceptanceRate: totalFeedback > 0 ? feedbackUp / totalFeedback : null,
      topKbGaps: Object.entries(kbGaps)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([query, count]) => ({ query, count })),
    };
  },
});
