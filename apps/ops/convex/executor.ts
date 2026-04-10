"use node";
import { v } from "convex/values";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { internal } from "./_generated/api";
import {
  simulateMockCardApi,
  MAX_RETRIES,
  isRetryExhausted,
  backoffMs,
} from "../src/lib/executor-logic";

// ─── Queries ──────────────────────────────────────────────────────────────────

export const getItem = internalQuery({
  args: { itemId: v.id("job_items") },
  handler: async (ctx, args) => ctx.db.get(args.itemId),
});

// ─── State-transition mutations ───────────────────────────────────────────────

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

// ─── Main executor action ─────────────────────────────────────────────────────

export const executeItem = internalAction({
  args: {
    itemId: v.id("job_items"),
    jobId: v.id("jobs"),
  },
  handler: async (ctx, args) => {
    const item = await ctx.runQuery(internal.executor.getItem, { itemId: args.itemId });
    if (!item) return;

    // Idempotency: already terminal, skip
    if (item.status === "succeeded" || item.status === "failed_permanent" || item.status === "cancelled") {
      return;
    }

    await ctx.runMutation(internal.executor.setItemInProgress, { itemId: args.itemId });

    // Simulate network latency (100–600ms)
    await new Promise((r) => setTimeout(r, 100 + Math.random() * 500));

    const result = simulateMockCardApi(item.cardId, item.retryCount);

    if (result.success) {
      await ctx.runMutation(internal.executor.setItemSucceeded, {
        itemId: args.itemId,
        jobId: args.jobId,
      });
      return;
    }

    const newRetryCount = item.retryCount + 1;
    const isPermanent = result.failureType === "permanent" || newRetryCount >= MAX_RETRIES;

    await ctx.runMutation(internal.executor.setItemFailed, {
      itemId: args.itemId,
      jobId: args.jobId,
      status: isPermanent ? "failed_permanent" : "failed_retryable",
      failureCode: result.failureCode ?? "UNKNOWN",
      failureDetail: result.failureDetail ?? "Unknown error",
      retryCount: newRetryCount,
    });

    if (!isPermanent) {
      // Exponential backoff: 2s, 4s, 8s
      const backoffMs = Math.pow(2, newRetryCount) * 1000;
      await ctx.scheduler.runAfter(backoffMs, internal.executor.executeItem, {
        itemId: args.itemId,
        jobId: args.jobId,
      });
    }
  },
});
