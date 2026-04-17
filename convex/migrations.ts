import { internalMutation } from "./_generated/server";

/**
 * Backfill `normalizedPlan.intent` for legacy job documents that were written
 * before the intent field was added to the schema.
 */
export const backfillJobIntent = internalMutation({
  args: {},
  handler: async (ctx) => {
    const jobs = await ctx.db.query("jobs").collect();
    let patched = 0;

    for (const job of jobs) {
      if ((job.normalizedPlan as { intent?: string }).intent !== undefined) continue;

      const plan = job.normalizedPlan as {
        targetGroup: string;
        newLimit?: { currency: string; amount: number };
        notifyCardholders: boolean;
        reason?: string;
      };

      const updated =
        job.operationType === "bulk_update_card_limit"
          ? {
              intent: "bulk_update_card_limit" as const,
              targetGroup: plan.targetGroup,
              newLimit: plan.newLimit!,
              notifyCardholders: plan.notifyCardholders,
            }
          : {
              intent: "bulk_freeze_cards" as const,
              targetGroup: plan.targetGroup,
              notifyCardholders: plan.notifyCardholders,
              ...(plan.reason !== undefined && { reason: plan.reason }),
            };

      await ctx.db.patch(job._id, { normalizedPlan: updated });
      patched++;
    }

    return { patched };
  },
});
