"use client";
import { useQuery, useMutation } from "convex/react";
import { useParams } from "next/navigation";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  confirmed: "Confirmed",
  in_progress: "Running",
  completed: "Completed",
  completed_with_failures: "Completed with failures",
  cancelled: "Cancelled",
  failed: "Failed",
};

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  confirmed: "bg-blue-100 text-blue-700",
  in_progress: "bg-yellow-100 text-yellow-800",
  completed: "bg-green-100 text-green-700",
  completed_with_failures: "bg-orange-100 text-orange-800",
  cancelled: "bg-gray-100 text-gray-500",
  failed: "bg-red-100 text-red-700",
};

const ITEM_STATUS_COLORS: Record<string, string> = {
  queued: "text-gray-400",
  in_progress: "text-yellow-600",
  succeeded: "text-green-600",
  failed_retryable: "text-orange-500",
  failed_permanent: "text-red-600",
  cancelled: "text-gray-400 line-through",
  skipped: "text-gray-400",
};

export default function JobPage() {
  const { id } = useParams<{ id: string }>();
  const jobId = id as Id<"jobs">;

  // Real-time subscription — updates automatically as items complete
  const data = useQuery(api.queries.getJobWithItems, { jobId });
  const retryFailed = useMutation(api.jobs.retryFailed);
  const cancelJob = useMutation(api.jobs.cancelJob);

  if (data === undefined) return <LoadingShell />;
  if (data === null) return <div className="p-8 text-red-600">Job not found</div>;

  const { job, items } = data;
  const isRunning = job.status === "in_progress" || job.status === "confirmed";
  const hasRetryable = items.some((i) => i.status === "failed_retryable");
  const progress =
    job.eligibleItems > 0
      ? Math.round(((job.succeededCount + job.failedCount) / job.eligibleItems) * 100)
      : 0;

  return (
    <main className="max-w-3xl mx-auto px-4 py-10">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">
            Bulk limit update — {job.normalizedPlan.targetGroup}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {job.normalizedPlan.newLimit.currency} {job.normalizedPlan.newLimit.amount.toLocaleString()} new limit
          </p>
        </div>
        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[job.status] ?? "bg-gray-100 text-gray-700"}`}>
          {STATUS_LABELS[job.status] ?? job.status}
        </span>
      </div>

      {/* Progress bar */}
      {isRunning && (
        <div className="mb-6">
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>Progress</span>
            <span>{progress}%</span>
          </div>
          <div className="h-2 w-full bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-2 bg-blue-500 rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Counts */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        <CountCard label="Succeeded" value={job.succeededCount} color="green" />
        <CountCard label="Failed" value={job.failedCount} color="red" />
        <CountCard label="Skipped" value={job.skippedCount} color="gray" />
        <CountCard label="Cancelled" value={job.cancelledCount} color="gray" />
      </div>

      {/* Actions */}
      <div className="flex gap-2 mb-6">
        {hasRetryable && (
          <button
            onClick={() => retryFailed({ jobId })}
            className="rounded-lg border border-orange-300 bg-orange-50 px-3 py-1.5 text-xs font-medium text-orange-700 hover:bg-orange-100 transition-colors"
          >
            Retry failed ({items.filter((i) => i.status === "failed_retryable").length})
          </button>
        )}
        {isRunning && (
          <button
            onClick={() => cancelJob({ jobId })}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Cancel remaining
          </button>
        )}
      </div>

      {/* Item list */}
      <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-sm font-medium text-gray-700">Card-level status</h2>
          <span className="text-xs text-gray-400">{items.length} items</span>
        </div>
        <div className="divide-y divide-gray-50 max-h-96 overflow-y-auto">
          {items.map((item) => (
            <div key={item._id} className="flex items-center justify-between px-4 py-2.5">
              <div>
                <span className="text-sm font-medium text-gray-800">{item.cardholderName}</span>
                <span className="ml-2 text-xs font-mono text-gray-400">{item.cardId}</span>
              </div>
              <div className="flex items-center gap-3">
                {item.failureCode && (
                  <span className="text-xs text-gray-400" title={item.failureDetail ?? ""}>
                    {item.failureCode}
                  </span>
                )}
                {item.retryCount > 0 && (
                  <span className="text-xs text-gray-400">×{item.retryCount}</span>
                )}
                <span className={`text-xs font-medium capitalize ${ITEM_STATUS_COLORS[item.status] ?? "text-gray-500"}`}>
                  {item.status.replace(/_/g, " ")}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Final summary */}
      {!isRunning && (
        <div className={`mt-6 rounded-xl border p-5 text-sm ${job.status === "completed" ? "bg-green-50 border-green-200 text-green-800" : "bg-orange-50 border-orange-200 text-orange-800"}`}>
          <strong>
            {job.status === "completed"
              ? `All ${job.succeededCount} cards updated successfully.`
              : `Completed: ${job.succeededCount} succeeded, ${job.failedCount} failed, ${job.skippedCount} skipped.`}
          </strong>
          {job.failedCount > 0 && (
            <p className="mt-1 text-xs opacity-75">
              Permanently failed cards require manual review. Retryable failures can be re-queued above.
            </p>
          )}
        </div>
      )}
    </main>
  );
}

function CountCard({ label, value, color }: { label: string; value: number; color: "green" | "red" | "gray" }) {
  const colors = {
    green: "text-green-600",
    red: "text-red-600",
    gray: "text-gray-400",
  };
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3 text-center">
      <div className={`text-xl font-bold ${colors[color]}`}>{value}</div>
      <div className="text-xs text-gray-500 mt-0.5">{label}</div>
    </div>
  );
}

function LoadingShell() {
  return (
    <main className="max-w-3xl mx-auto px-4 py-10">
      <div className="animate-pulse space-y-4">
        <div className="h-6 w-48 bg-gray-200 rounded" />
        <div className="h-4 w-full bg-gray-100 rounded" />
        <div className="grid grid-cols-4 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-gray-100 rounded-lg" />
          ))}
        </div>
        <div className="h-64 bg-gray-100 rounded-xl" />
      </div>
    </main>
  );
}
