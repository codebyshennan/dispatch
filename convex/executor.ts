"use node";
import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  simulateMockCardApi,
  isRetryExhausted,
  backoffMs,
} from "../src/lib/executor-logic";

export const executeItem = internalAction({
  args: {
    itemId: v.id("job_items"),
    jobId: v.id("jobs"),
  },
  handler: async (ctx, args) => {
    const item = await ctx.runQuery(internal.executorState.getItem, { itemId: args.itemId });
    if (!item) return;

    // Idempotency: already terminal, skip
    if (item.status === "succeeded" || item.status === "failed_permanent" || item.status === "cancelled") {
      return;
    }

    await ctx.runMutation(internal.executorState.setItemInProgress, { itemId: args.itemId });

    // Simulate network latency (100–600ms)
    await new Promise((r) => setTimeout(r, 100 + Math.random() * 500));

    const result = simulateMockCardApi(item.cardId, item.retryCount);

    if (result.success) {
      // Freeze ops actually mutate mock_cards.status so subsequent ops see the change.
      // Limit updates remain simulated for demo purposes.
      const intent = await ctx.runQuery(internal.executorState.getJobIntent, {
        jobId: args.jobId,
      });
      if (intent === "bulk_freeze_cards") {
        await ctx.runMutation(internal.executorState.freezeMockCard, {
          cardId: item.cardId,
        });
      }
      await ctx.runMutation(internal.executorState.setItemSucceeded, {
        itemId: args.itemId,
        jobId: args.jobId,
      });
      return;
    }

    const newRetryCount = item.retryCount + 1;
    const isPermanent = result.failureType === "permanent" || isRetryExhausted(newRetryCount);

    await ctx.runMutation(internal.executorState.setItemFailed, {
      itemId: args.itemId,
      jobId: args.jobId,
      status: isPermanent ? "failed_permanent" : "failed_retryable",
      failureCode: result.failureCode ?? "UNKNOWN",
      failureDetail: result.failureDetail ?? "Unknown error",
      retryCount: newRetryCount,
    });

    if (!isPermanent) {
      await ctx.scheduler.runAfter(backoffMs(newRetryCount), internal.executor.executeItem, {
        itemId: args.itemId,
        jobId: args.jobId,
      });
    }
  },
});
