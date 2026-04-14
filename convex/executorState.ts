import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";

export const getItem = internalQuery({
  args: { itemId: v.id("job_items") },
  handler: async (ctx, args) => ctx.db.get(args.itemId),
});

export const setItemInProgress = internalMutation({
  args: { itemId: v.id("job_items") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.itemId, { status: "in_progress" });
  },
});

export const setItemSucceeded = internalMutation({
  args: { itemId: v.id("job_items"), jobId: v.id("jobs") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.itemId, { status: "succeeded" });
    await ctx.runMutation(internal.jobs.updateJobCounts, {
      jobId: args.jobId,
      outcomeStatus: "succeeded",
    });
  },
});

export const setItemFailed = internalMutation({
  args: {
    itemId: v.id("job_items"),
    jobId: v.id("jobs"),
    status: v.union(v.literal("failed_retryable"), v.literal("failed_permanent")),
    failureCode: v.string(),
    failureDetail: v.string(),
    retryCount: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.itemId, {
      status: args.status,
      failureCode: args.failureCode,
      failureDetail: args.failureDetail,
      retryCount: args.retryCount,
    });
    if (args.status === "failed_permanent") {
      await ctx.runMutation(internal.jobs.updateJobCounts, {
        jobId: args.jobId,
        outcomeStatus: "failed_permanent",
      });
    }
  },
});
