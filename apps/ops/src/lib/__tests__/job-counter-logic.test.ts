import { describe, it, expect } from "vitest";
import { applyOutcomeToJobCounts, type JobCountSnapshot } from "../job-counter-logic";

function makeJob(overrides: Partial<JobCountSnapshot> = {}): JobCountSnapshot {
  return {
    totalItems: 10,
    eligibleItems: 10,
    succeededCount: 0,
    failedCount: 0,
    skippedCount: 0,
    cancelledCount: 0,
    status: "in_progress",
    ...overrides,
  };
}

describe("applyOutcomeToJobCounts — counter increments", () => {
  it("increments succeededCount on 'succeeded'", () => {
    const patch = applyOutcomeToJobCounts(makeJob({ succeededCount: 2 }), "succeeded");
    expect(patch.succeededCount).toBe(3);
    expect(patch.failedCount).toBeUndefined();
  });

  it("increments failedCount on 'failed_retryable'", () => {
    const patch = applyOutcomeToJobCounts(makeJob({ failedCount: 1 }), "failed_retryable");
    expect(patch.failedCount).toBe(2);
    expect(patch.succeededCount).toBeUndefined();
  });

  it("increments failedCount on 'failed_permanent'", () => {
    const patch = applyOutcomeToJobCounts(makeJob(), "failed_permanent");
    expect(patch.failedCount).toBe(1);
  });

  it("increments cancelledCount on 'cancelled'", () => {
    const patch = applyOutcomeToJobCounts(makeJob({ cancelledCount: 4 }), "cancelled");
    expect(patch.cancelledCount).toBe(5);
  });

  it("increments skippedCount on 'skipped'", () => {
    const patch = applyOutcomeToJobCounts(makeJob({ skippedCount: 3 }), "skipped");
    expect(patch.skippedCount).toBe(4);
  });
});

describe("applyOutcomeToJobCounts — job completion detection", () => {
  it("does not set status while items are still pending", () => {
    // 10 total, only 5 done → not complete
    const job = makeJob({ totalItems: 10, succeededCount: 4 });
    const patch = applyOutcomeToJobCounts(job, "succeeded");
    expect(patch.status).toBeUndefined();
  });

  it("sets status to 'completed' when last item succeeds", () => {
    const job = makeJob({ totalItems: 5, succeededCount: 4 });
    const patch = applyOutcomeToJobCounts(job, "succeeded");
    expect(patch.succeededCount).toBe(5);
    expect(patch.status).toBe("completed");
  });

  it("sets status to 'completed_with_failures' when all done and some failed", () => {
    const job = makeJob({ totalItems: 5, succeededCount: 3, failedCount: 1 });
    const patch = applyOutcomeToJobCounts(job, "succeeded");
    expect(patch.succeededCount).toBe(4);
    expect(patch.status).toBe("completed_with_failures");
  });

  it("sets status to 'completed_with_failures' when last item fails permanently", () => {
    const job = makeJob({ totalItems: 5, succeededCount: 4 });
    const patch = applyOutcomeToJobCounts(job, "failed_permanent");
    expect(patch.failedCount).toBe(1);
    expect(patch.status).toBe("completed_with_failures");
  });

  it("does NOT set status to completed on failed_retryable (item may be retried)", () => {
    // Even if counts add up, a retryable failure doesn't close the job —
    // the item will be re-queued and come back as succeeded or failed_permanent.
    // The total won't sum to totalItems while there are still queued/in-progress items.
    const job = makeJob({ totalItems: 5, succeededCount: 3, failedCount: 0, skippedCount: 0, cancelledCount: 0 });
    const patch = applyOutcomeToJobCounts(job, "failed_retryable");
    // 4 done out of 5 — not complete yet
    expect(patch.status).toBeUndefined();
  });

  it("handles mixed outcomes reaching completion with cancellations", () => {
    // 10 total: 5 succeeded, 2 failed, 1 skipped, 1 cancelled = 9 done; one more cancellation completes it
    const job = makeJob({
      totalItems: 10,
      succeededCount: 5,
      failedCount: 2,
      skippedCount: 1,
      cancelledCount: 1,
    });
    const patch = applyOutcomeToJobCounts(job, "cancelled");
    expect(patch.cancelledCount).toBe(2);
    expect(patch.status).toBe("completed_with_failures"); // failedCount=2 > 0
  });

  it("handles all-skipped completion as 'completed' (no failures)", () => {
    const job = makeJob({ totalItems: 3, skippedCount: 2 });
    const patch = applyOutcomeToJobCounts(job, "skipped");
    expect(patch.skippedCount).toBe(3);
    expect(patch.status).toBe("completed");
  });
});

describe("applyOutcomeToJobCounts — patch is minimal (only changed fields)", () => {
  it("only contains the incremented counter and possibly status", () => {
    const job = makeJob();
    const patch = applyOutcomeToJobCounts(job, "succeeded");
    const keys = Object.keys(patch);
    expect(keys).toContain("succeededCount");
    expect(keys).not.toContain("failedCount");
    expect(keys).not.toContain("skippedCount");
    expect(keys).not.toContain("cancelledCount");
  });
});
