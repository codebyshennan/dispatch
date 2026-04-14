import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const limitV = v.object({ currency: v.string(), amount: v.number() });

const jobStatusV = v.union(
  v.literal("draft"),
  v.literal("confirmed"),
  v.literal("in_progress"),
  v.literal("completed"),
  v.literal("completed_with_failures"),
  v.literal("cancelled"),
  v.literal("failed")
);

const itemStatusV = v.union(
  v.literal("queued"),
  v.literal("in_progress"),
  v.literal("succeeded"),
  v.literal("failed_retryable"),
  v.literal("failed_permanent"),
  v.literal("cancelled"),
  v.literal("skipped")
);

export default defineSchema({
  /**
   * Parent job record — one per bulk operation request.
   */
  jobs: defineTable({
    status: jobStatusV,
    operationType: v.literal("bulk_update_card_limit"),
    rawRequest: v.string(),
    normalizedPlan: v.object({
      targetGroup: v.string(),
      newLimit: limitV,
      notifyCardholders: v.boolean(),
    }),
    // Counts (updated as items complete)
    totalItems: v.number(),
    eligibleItems: v.number(),
    succeededCount: v.number(),
    failedCount: v.number(),
    skippedCount: v.number(),
    cancelledCount: v.number(),
    approvalRequired: v.boolean(),
    // Policy output
    excludedCards: v.array(v.object({ cardId: v.string(), reason: v.string() })),
    policyNotes: v.array(v.string()),
    // Idempotency: actor + operation_type + target_group + new_limit hash
    idempotencyKey: v.string(),
  })
    .index("by_idempotency_key", ["idempotencyKey"])
    .index("by_status", ["status"]),

  /**
   * Per-card execution record — one per card per job.
   */
  job_items: defineTable({
    jobId: v.id("jobs"),
    cardId: v.string(),
    cardholderName: v.string(),
    currentLimit: limitV,
    requestedLimit: limitV,
    status: itemStatusV,
    retryCount: v.number(),
    failureCode: v.optional(v.string()),
    failureDetail: v.optional(v.string()),
    // Convex scheduled function ID so we can cancel queued items
    scheduledFnId: v.optional(v.string()),
    idempotencyKey: v.string(),
  })
    .index("by_job", ["jobId"])
    .index("by_job_status", ["jobId", "status"])
    .index("by_idempotency_key", ["idempotencyKey"]),

  /**
   * Seeded mock cards — simulates the internal card API.
   */
  mock_cards: defineTable({
    cardId: v.string(),
    cardholderName: v.string(),
    team: v.string(),
    currentLimit: limitV,
    status: v.union(v.literal("active"), v.literal("frozen"), v.literal("cancelled")),
    email: v.string(),
  })
    .index("by_team", ["team"])
    .index("by_card_id", ["cardId"]),

  /**
   * Feedback on AI chat responses — thumbs up/down from ops users.
   */
  feedback: defineTable({
    responseId: v.string(),
    kind: v.union(v.literal("answer"), v.literal("bulk_op")),
    rating: v.union(v.literal("up"), v.literal("down")),
  }).index("by_response_id", ["responseId"]),

  /**
   * Append-only event log for metrics aggregation.
   */
  metrics_events: defineTable({
    type: v.union(
      v.literal("job_created"),
      v.literal("job_completed"),
      v.literal("feedback"),
      v.literal("kb_gap")
    ),
    payload: v.any(),
  }).index("by_type", ["type"]),

  /**
   * KB help-center articles with OpenAI embeddings for semantic search.
   */
  kb_articles: defineTable({
    articleId: v.string(),
    title: v.string(),
    url: v.string(),
    body: v.string(),
    updatedAt: v.string(),
    embedding: v.array(v.float64()),
  })
    .index("by_article_id", ["articleId"])
    .vectorIndex("by_embedding", {
      vectorField: "embedding",
      dimensions: 1536,
    }),
});
