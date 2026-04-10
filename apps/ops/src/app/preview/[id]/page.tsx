"use client";
import { useQuery, useMutation } from "convex/react";
import { useRouter, useParams } from "next/navigation";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

export default function PreviewPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const summary = useQuery(api.queries.getJobStatusSummary, {
    jobId: id as Id<"jobs">,
  });

  const confirmJob = useMutation(api.jobs.confirmJob);
  const cancelJob = useMutation(api.jobs.cancelJob);

  if (summary === undefined) {
    return <LoadingShell />;
  }

  if (summary === null) {
    return <ErrorShell message="Job not found" />;
  }

  async function handleConfirm() {
    await confirmJob({ jobId: id as Id<"jobs"> });
    router.push(`/jobs/${id}`);
  }

  async function handleCancel() {
    router.push("/");
  }

  return (
    <main className="max-w-2xl mx-auto px-4 py-12">
      <div className="mb-6">
        <span className="inline-flex items-center rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-medium text-yellow-800">
          Awaiting confirmation
        </span>
        <h1 className="mt-3 text-xl font-semibold text-gray-900">Execution Plan</h1>
        <p className="mt-1 text-sm text-gray-500">
          Review the plan below. Nothing runs until you confirm.
        </p>
      </div>

      {/* Operation summary */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 space-y-4 mb-6">
        <Row label="Operation" value="Bulk card spending-limit update" />
        <Row label="Target group" value={summary.targetGroup} />
        <Row
          label="New limit"
          value={`${summary.newLimit.currency} ${summary.newLimit.amount.toLocaleString()}`}
        />
        <div className="border-t pt-4 grid grid-cols-3 gap-4 text-center">
          <Stat label="Total cards" value={summary.totalItems} />
          <Stat label="Eligible" value={summary.eligibleItems} color="green" />
          <Stat label="Excluded" value={summary.totalItems - summary.eligibleItems} color="gray" />
        </div>
      </div>

      {/* Approval gate */}
      {summary.approvalRequired && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 mb-6 text-sm text-amber-800">
          <span className="font-medium">Approval required.</span> This operation affects more than 25 cards.
          Proceed only if you have the authority to approve operations at this scale.
        </div>
      )}

      {/* Exclusions */}
      {summary.excludedCards.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-5 mb-6">
          <h2 className="text-sm font-medium text-gray-700 mb-3">
            Excluded cards ({summary.excludedCards.length})
          </h2>
          <ul className="space-y-1">
            {summary.excludedCards.map((e) => (
              <li key={e.cardId} className="text-sm text-gray-600 flex gap-2">
                <span className="font-mono text-gray-400">{e.cardId}</span>
                <span>—</span>
                <span className="capitalize">{e.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Policy notes */}
      {summary.policyNotes.filter((n) => !n.includes("excluded")).length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-5 mb-6">
          <h2 className="text-sm font-medium text-gray-700 mb-2">Policy notes</h2>
          <ul className="space-y-1">
            {summary.policyNotes
              .filter((n) => !n.includes("excluded"))
              .map((note, i) => (
                <li key={i} className="text-sm text-gray-600">
                  {note}
                </li>
              ))}
          </ul>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={handleConfirm}
          className="flex-1 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
        >
          Confirm — run for {summary.eligibleItems} cards
        </button>
        <button
          onClick={handleCancel}
          className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          Cancel
        </button>
      </div>

      <p className="mt-3 text-xs text-gray-400 text-center">
        This action will be logged to the audit trail and cannot be rolled back automatically.
      </p>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-gray-500">{label}</span>
      <span className="font-medium text-gray-900">{value}</span>
    </div>
  );
}

function Stat({ label, value, color = "blue" }: { label: string; value: number; color?: "blue" | "green" | "gray" }) {
  const colors = { blue: "text-blue-600", green: "text-green-600", gray: "text-gray-400" };
  return (
    <div>
      <div className={`text-2xl font-bold ${colors[color]}`}>{value}</div>
      <div className="text-xs text-gray-500 mt-0.5">{label}</div>
    </div>
  );
}

function LoadingShell() {
  return (
    <main className="max-w-2xl mx-auto px-4 py-12">
      <div className="animate-pulse space-y-4">
        <div className="h-6 w-32 bg-gray-200 rounded" />
        <div className="h-48 bg-gray-100 rounded-xl" />
      </div>
    </main>
  );
}

function ErrorShell({ message }: { message: string }) {
  return (
    <main className="max-w-2xl mx-auto px-4 py-12">
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center text-sm text-red-700">
        {message}
      </div>
    </main>
  );
}
