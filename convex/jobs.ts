import { v } from "convex/values";
import { mutation, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { checkPolicy } from "../src/lib/policy";
import { applyOutcomeToJobCounts } from "../src/lib/job-counter-logic";

// ─── createDraft ──────────────────────────────────────────────────────────────
// Resolves target cards, runs policy, returns a preview — does NOT execute yet.

const limitArgV = v.object({ currency: v.string(), amount: v.number() });

const intentArgV = v.union(
  v.object({
    intent: v.literal("bulk_update_card_limit"),
    targetGroup: v.string(),
    newLimit: limitArgV,
    notifyCardholders: v.boolean(),
  }),
  v.object({
    intent: v.literal("bulk_freeze_cards"),
    targetGroup: v.string(),
    reason: v.optional(v.string()),
    notifyCardholders: v.boolean(),
  })
);

export const createDraft = mutation({
  args: {
    rawRequest: v.string(),
    intent: intentArgV,
    idempotencyKey: v.string(),
  },
  handler: async (ctx, args) => {
    // Idempotency: return existing draft for same key
    const existing = await ctx.db
      .query("jobs")
      .withIndex("by_idempotency_key", (q) =>
        q.eq("idempotencyKey", args.idempotencyKey)
      )
      .unique();
    if (existing) return existing._id;

    // Resolve target cards
    const cards = await ctx.db
      .query("mock_cards")
      .withIndex("by_team", (q) => q.eq("team", args.intent.targetGroup))
      .collect();

    if (cards.length === 0) {
      throw new Error(`No cards found for team: ${args.intent.targetGroup}`);
    }

    // Policy check — limit cap only applies to limit-update operations
    const newLimit =
      args.intent.intent === "bulk_update_card_limit" ? args.intent.newLimit : undefined;
    const policy = checkPolicy(cards, newLimit);

    if (!policy.allowed) {
      throw new Error(`Policy blocked: ${policy.notes[0]}`);
    }

    const excludedSet = new Set(policy.excludedCardIds);
    const eligible = cards.filter((c) => !excludedSet.has(c.cardId));

    const normalizedPlan =
      args.intent.intent === "bulk_update_card_limit"
        ? {
            intent: "bulk_update_card_limit" as const,
            targetGroup: args.intent.targetGroup,
            newLimit: args.intent.newLimit,
            notifyCardholders: args.intent.notifyCardholders,
          }
        : {
            intent: "bulk_freeze_cards" as const,
            targetGroup: args.intent.targetGroup,
            reason: args.intent.reason,
            notifyCardholders: args.intent.notifyCardholders,
          };

    const jobId = await ctx.db.insert("jobs", {
      status: "draft",
      operationType: args.intent.intent,
      rawRequest: args.rawRequest,
      normalizedPlan,
      totalItems: cards.length,
      eligibleItems: eligible.length,
      succeededCount: 0,
      failedCount: 0,
      skippedCount: cards.length - eligible.length,
      cancelledCount: 0,
      approvalRequired: policy.approvalRequired,
      excludedCards: policy.excludedCardIds.map((cardId) => {
        const note = policy.notes.find((n) => n.includes(cardId)) ?? "";
        const reason = note.split("status is ")[1] ?? "excluded by policy";
        return { cardId, reason };
      }),
      policyNotes: policy.notes,
      idempotencyKey: args.idempotencyKey,
    });

    await ctx.runMutation(internal.metrics.recordMetricEvent, {
      type: "job_created",
      payload: { targetGroup: args.intent.targetGroup, eligibleItems: eligible.length },
    });

    return jobId;
  },
});

// ─── confirmJob ───────────────────────────────────────────────────────────────
// Transitions draft → in_progress and fans out per-item execution tasks.

export const confirmJob = mutation({
  args: { jobId: v.id("jobs") },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) throw new Error("Job not found");
    if (job.status !== "draft") throw new Error(`Cannot confirm job in status: ${job.status}`);

    await ctx.db.patch(args.jobId, { status: "in_progress" });

    // Fetch eligible cards
    const cards = await ctx.db
      .query("mock_cards")
      .withIndex("by_team", (q) => q.eq("team", job.normalizedPlan.targetGroup))
      .collect();

    const excludedIds = new Set(job.excludedCards.map((e) => e.cardId));
    const requestedLimit =
      job.operationType === "bulk_update_card_limit"
        ? (job.normalizedPlan as { newLimit?: { currency: string; amount: number } }).newLimit
        : undefined;

    for (const card of cards) {
      if (excludedIds.has(card.cardId)) {
        // Insert as skipped — no execution
        await ctx.db.insert("job_items", {
          jobId: args.jobId,
          cardId: card.cardId,
          cardholderName: card.cardholderName,
          currentLimit: card.currentLimit,
          requestedLimit,
          status: "skipped",
          retryCount: 0,
          idempotencyKey: `${args.jobId}:${card.cardId}`,
        });
        continue;
      }

      const itemId = await ctx.db.insert("job_items", {
        jobId: args.jobId,
        cardId: card.cardId,
        cardholderName: card.cardholderName,
        currentLimit: card.currentLimit,
        requestedLimit,
        status: "queued",
        retryCount: 0,
        idempotencyKey: `${args.jobId}:${card.cardId}`,
      });

      // Schedule execution with staggered delay to simulate realistic async fan-out
      const delayMs = Math.floor(Math.random() * 3000) + 500;
      await ctx.scheduler.runAfter(delayMs, internal.executor.executeItem, {
        itemId,
        jobId: args.jobId,
      });
    }
  },
});

// ─── retryFailed ──────────────────────────────────────────────────────────────
// Re-queues failed_retryable items only.

export const retryFailed = mutation({
  args: { jobId: v.id("jobs") },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) throw new Error("Job not found");

    const retryable = await ctx.db
      .query("job_items")
      .withIndex("by_job_status", (q) =>
        q.eq("jobId", args.jobId).eq("status", "failed_retryable")
      )
      .collect();

    if (retryable.length === 0) return 0;

    for (const item of retryable) {
      await ctx.db.patch(item._id, { status: "queued", failureCode: undefined, failureDetail: undefined });
      const delayMs = Math.floor(Math.random() * 2000) + 300;
      await ctx.scheduler.runAfter(delayMs, internal.executor.executeItem, {
        itemId: item._id,
        jobId: args.jobId,
      });
    }

    // Re-open job if it was completed_with_failures
    if (job.status === "completed_with_failures") {
      await ctx.db.patch(args.jobId, { status: "in_progress" });
    }

    return retryable.length;
  },
});

// ─── discardDraft ─────────────────────────────────────────────────────────────
// Deletes a draft job that was superseded by a modification before confirmation.

export const discardDraft = mutation({
  args: { jobId: v.id("jobs") },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) return; // already gone, idempotent
    if (job.status !== "draft") throw new Error("Can only discard draft jobs");
    await ctx.db.delete(args.jobId);
  },
});

// ─── cancelJob ────────────────────────────────────────────────────────────────
// Cancels all queued items (in-flight items finish naturally).

export const cancelJob = mutation({
  args: { jobId: v.id("jobs") },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) throw new Error("Job not found");
    if (!["in_progress", "confirmed"].includes(job.status)) {
      throw new Error(`Cannot cancel job in status: ${job.status}`);
    }

    const queued = await ctx.db
      .query("job_items")
      .withIndex("by_job_status", (q) =>
        q.eq("jobId", args.jobId).eq("status", "queued")
      )
      .collect();

    let cancelledCount = 0;
    for (const item of queued) {
      await ctx.db.patch(item._id, { status: "cancelled" });
      cancelledCount++;
    }

    await ctx.db.patch(args.jobId, {
      status: "cancelled",
      cancelledCount: (job.cancelledCount ?? 0) + cancelledCount,
    });

    return cancelledCount;
  },
});

// ─── updateJobCounts (internal) ───────────────────────────────────────────────
// Called by executor after each item completes to keep job totals in sync.

export const updateJobCounts = internalMutation({
  args: {
    jobId: v.id("jobs"),
    outcomeStatus: v.union(
      v.literal("succeeded"),
      v.literal("failed_retryable"),
      v.literal("failed_permanent"),
      v.literal("cancelled"),
      v.literal("skipped")
    ),
  },
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId);
    if (!job) return;

    const patch = applyOutcomeToJobCounts(job, args.outcomeStatus);
    await ctx.db.patch(args.jobId, patch);
  },
});
