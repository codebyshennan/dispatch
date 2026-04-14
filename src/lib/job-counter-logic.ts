// Pure counter logic extracted from convex/jobs.ts updateJobCounts for unit testing.

export type JobStatus =
  | "draft"
  | "confirmed"
  | "in_progress"
  | "completed"
  | "completed_with_failures"
  | "cancelled"
  | "failed";

export type ItemOutcome =
  | "succeeded"
  | "failed_retryable"
  | "failed_permanent"
  | "cancelled"
  | "skipped";

export type JobCountSnapshot = {
  totalItems: number;
  eligibleItems: number;
  succeededCount: number;
  failedCount: number;
  skippedCount: number;
  cancelledCount: number;
  status: JobStatus;
};

export type JobCountPatch = {
  succeededCount?: number;
  failedCount?: number;
  skippedCount?: number;
  cancelledCount?: number;
  status?: JobStatus;
};

/**
 * Given the current job snapshot and an item outcome, returns the DB patch
 * that should be applied. Pure function — no side effects.
 */
export function applyOutcomeToJobCounts(
  job: JobCountSnapshot,
  outcomeStatus: ItemOutcome
): JobCountPatch {
  const patch: JobCountPatch = {};

  if (outcomeStatus === "succeeded") {
    patch.succeededCount = job.succeededCount + 1;
  } else if (outcomeStatus === "failed_retryable" || outcomeStatus === "failed_permanent") {
    patch.failedCount = job.failedCount + 1;
  } else if (outcomeStatus === "cancelled") {
    patch.cancelledCount = job.cancelledCount + 1;
  } else if (outcomeStatus === "skipped") {
    patch.skippedCount = job.skippedCount + 1;
  }

  const updatedSucceeded = patch.succeededCount ?? job.succeededCount;
  const updatedFailed = patch.failedCount ?? job.failedCount;
  const updatedSkipped = patch.skippedCount ?? job.skippedCount;
  const updatedCancelled = patch.cancelledCount ?? job.cancelledCount;
  const done = updatedSucceeded + updatedFailed + updatedSkipped + updatedCancelled;

  if (done >= job.totalItems) {
    patch.status = updatedFailed > 0 ? "completed_with_failures" : "completed";
  }

  return patch;
}
