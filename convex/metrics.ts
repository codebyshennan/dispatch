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
    const [events, jobs, threads] = await Promise.all([
      ctx.db.query("metrics_events").take(1000),
      ctx.db.query("jobs").take(1000),
      ctx.db.query("threads").take(1000),
    ]);

    // ── feedback + KB gaps ────────────────────────────────────────────────────
    let feedbackUp = 0;
    let feedbackDown = 0;
    const kbGaps: Record<string, number> = {};

    for (const e of events) {
      if (e.type === "feedback") {
        if (e.payload?.rating === "up") feedbackUp++;
        if (e.payload?.rating === "down") feedbackDown++;
      }
      if (e.type === "kb_gap" && typeof e.payload?.query === "string") {
        const q = e.payload.query as string;
        kbGaps[q] = (kbGaps[q] ?? 0) + 1;
      }
    }

    // ── job stats (source of truth: jobs table) ───────────────────────────────
    const jobsCreated = jobs.length;
    const terminalStatuses = new Set(["completed", "completed_with_failures", "cancelled", "failed"]);
    const completedJobs = jobs.filter((j) =>
      j.status === "completed" || j.status === "completed_with_failures"
    );
    const cancelledOrFailed = jobs.filter((j) =>
      j.status === "cancelled" || j.status === "failed"
    );

    const totalCardsUpdated = jobs.reduce((sum, j) => sum + j.succeededCount, 0);
    const totalEligible = jobs.reduce((sum, j) => sum + j.eligibleItems, 0);
    const avgCardsPerJob = jobsCreated > 0 ? Math.round(totalEligible / jobsCreated) : 0;

    const resolvedJobs = completedJobs.length + cancelledOrFailed.length;
    const completionRate = resolvedJobs > 0
      ? completedJobs.length / resolvedJobs
      : null;

    // overall card success rate across all completed jobs
    const completedEligible = completedJobs.reduce((sum, j) => sum + j.eligibleItems, 0);
    const completedSucceeded = completedJobs.reduce((sum, j) => sum + j.succeededCount, 0);
    const cardSuccessRate = completedEligible > 0
      ? completedSucceeded / completedEligible
      : null;

    // ── thread stats ──────────────────────────────────────────────────────────
    const threadCount = threads.length;
    let questionThreads = 0;
    let bulkOpThreads = 0;
    for (const t of threads) {
      const hasJob = t.messages.some((m) => m.kind === "bulk_op");
      const hasAnswer = t.messages.some((m) => m.kind === "answer");
      if (hasJob) bulkOpThreads++;
      else if (hasAnswer) questionThreads++;
    }

    // ── feedback ─────────────────────────────────────────────────────────────
    const totalFeedback = feedbackUp + feedbackDown;

    return {
      // operations
      jobsCreated,
      jobsCompleted: completedJobs.length,
      completionRate,
      totalCardsUpdated,
      avgCardsPerJob,
      cardSuccessRate,
      // threads
      threadCount,
      questionThreads,
      bulkOpThreads,
      // AI quality
      feedbackUp,
      feedbackDown,
      aiAcceptanceRate: totalFeedback > 0 ? feedbackUp / totalFeedback : null,
      // KB
      topKbGaps: Object.entries(kbGaps)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([query, count]) => ({ query, count })),
    };
  },
});
