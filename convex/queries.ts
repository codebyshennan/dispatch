import { v } from "convex/values";
import { query } from "./_generated/server";

export const getJob = query({
  args: { jobId: v.id("jobs") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.jobId);
  },
});

export const listJobs = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("jobs").order("desc").take(20);
  },
});

export const getJobWithItems = query({
  args: {
    jobId: v.id("jobs"),
    statusFilter: v.optional(
      v.union(
        v.literal("queued"),
        v.literal("in_progress"),
        v.literal("succeeded"),
        v.literal("failed_retryable"),
        v.literal("failed_permanent"),
        v.literal("cancelled"),
        v.literal("skipped")
      )
    ),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) return null;

    const items = args.statusFilter
      ? await ctx.db
          .query("job_items")
          .withIndex("by_job_status", (q) =>
            q.eq("jobId", args.jobId).eq("status", args.statusFilter!)
          )
          .collect()
      : await ctx.db
          .query("job_items")
          .withIndex("by_job", (q) => q.eq("jobId", args.jobId))
          .collect();

    return { job, items };
  },
});

export const getJobStatusSummary = query({
  args: { jobId: v.id("jobs") },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) return null;

    return {
      jobId: args.jobId,
      status: job.status,
      operationType: job.operationType,
      targetGroup: job.normalizedPlan.targetGroup,
      newLimit:
        job.normalizedPlan.intent === "bulk_update_card_limit"
          ? job.normalizedPlan.newLimit
          : null,
      reason:
        job.normalizedPlan.intent === "bulk_freeze_cards"
          ? job.normalizedPlan.reason ?? null
          : null,
      notifyCardholders: job.normalizedPlan.notifyCardholders,
      totalItems: job.totalItems,
      eligibleItems: job.eligibleItems,
      succeededCount: job.succeededCount,
      failedCount: job.failedCount,
      skippedCount: job.skippedCount,
      cancelledCount: job.cancelledCount,
      approvalRequired: job.approvalRequired,
      excludedCards: job.excludedCards,
      policyNotes: job.policyNotes,
    };
  },
});
