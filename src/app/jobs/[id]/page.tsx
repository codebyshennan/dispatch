"use client";
export const dynamic = "force-dynamic";
import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { useTheme } from "../../theme";

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  confirmed: "Confirmed",
  in_progress: "Running",
  completed: "Completed",
  completed_with_failures: "Completed with failures",
  cancelled: "Cancelled",
  failed: "Failed",
};

// accent colors per status using token-like values
const STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  draft:                   { bg: "#1E293B", color: "#94A3B8" },
  confirmed:               { bg: "#0C2340", color: "#60A5FA" },
  in_progress:             { bg: "#2D2A0F", color: "#FCD34D" },
  completed:               { bg: "#052E16", color: "#4ADE80" },
  completed_with_failures: { bg: "#431407", color: "#FB923C" },
  cancelled:               { bg: "#1E293B", color: "#64748B" },
  failed:                  { bg: "#3B0000", color: "#F87171" },
};

const ITEM_STATUS_COLOR: Record<string, string> = {
  queued:           "#64748B",
  in_progress:      "#EAB308",
  succeeded:        "#4ADE80",
  failed_retryable: "#FB923C",
  failed_permanent: "#F87171",
  cancelled:        "#64748B",
  skipped:          "#64748B",
};

// ── CardActionsPanel ──────────────────────────────────────────────────────────
function CardActionsPanel({ cardId, T }: { cardId: string; T: ReturnType<typeof useTheme>["T"] }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const freezeCard = useMutation(api.runbooks.freezeCard);
  const blockCard = useMutation(api.runbooks.blockCard);
  const reportFraud = useMutation(api.runbooks.reportFraud);
  const transactions = useQuery(api.runbooks.listTransactions, { cardId });

  async function run(label: string, fn: () => Promise<unknown>) {
    setBusy(label);
    setResult(null);
    try {
      const res = await fn();
      setResult(JSON.stringify(res, null, 2));
      toast.success(`${label} completed`);
    } catch (err) {
      toast.error(`${label} failed`, { description: err instanceof Error ? err.message : "Unknown error" });
    } finally {
      setBusy(null);
    }
  }

  const actions = [
    {
      label: "Freeze card",
      fn: () => run("Freeze card", () => freezeCard({ cardId, freeze: true })),
    },
    {
      label: "Unfreeze card",
      fn: () => run("Unfreeze card", () => freezeCard({ cardId, freeze: false })),
    },
    {
      label: "Block card",
      fn: () => {
        if (!confirm(`Permanently block ${cardId}? This cannot be undone.`)) return;
        run("Block card", () => blockCard({ cardId }));
      },
    },
    {
      label: "Report fraud",
      fn: () => run("Report fraud", () => reportFraud({ transactionId: "txn_8821c3d1", reason: "Unauthorized charge" })),
    },
  ];

  return (
    <div style={{
      padding: "12px 20px",
      borderTop: `1px solid ${T.border}`,
      background: T.elevated,
      display: "flex", flexDirection: "column", gap: 10,
    }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {actions.map((a) => (
          <button
            key={a.label}
            onClick={a.fn}
            disabled={busy !== null}
            style={{
              borderRadius: 7,
              border: `1px solid ${T.border}`,
              background: busy === a.label ? T.elevated : "transparent",
              color: busy === a.label ? T.muted : T.textSub,
              padding: "4px 12px", fontSize: 12,
              fontFamily: "inherit", cursor: busy !== null ? "not-allowed" : "pointer",
              opacity: busy !== null && busy !== a.label ? 0.5 : 1,
              transition: "all 0.15s ease",
            }}
          >
            {busy === a.label ? "Running…" : a.label}
          </button>
        ))}
      </div>

      {transactions && (
        <div>
          <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: T.muted, margin: "0 0 6px" }}>
            Recent transactions
          </p>
          {transactions.data.map((tx) => (
            <div key={tx.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, padding: "3px 0", borderBottom: `1px solid ${T.border}` }}>
              <span style={{ color: T.textSub }}>{tx.merchantName}</span>
              <div style={{ display: "flex", gap: 8 }}>
                <span style={{ fontFamily: "monospace", color: tx.amount < 0 ? "#F87171" : "#4ADE80" }}>
                  {tx.currency} {(Math.abs(tx.amount) / 100).toFixed(2)}
                </span>
                <span style={{ color: tx.status === "disputed" ? "#FB923C" : T.muted }}>{tx.status}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {result && (
        <pre style={{
          margin: 0, fontSize: 10, color: T.muted,
          background: T.surface, borderRadius: 6,
          padding: "8px 10px", overflowX: "auto",
          maxHeight: 140, border: `1px solid ${T.border}`,
        }}>
          {result}
        </pre>
      )}
    </div>
  );
}

export default function JobPage() {
  const { T } = useTheme();
  const { id } = useParams<{ id: string }>();
  const jobId = id as Id<"jobs">;

  const [retrying, setRetrying] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  const prevStatusRef = useRef<string | undefined>(undefined);

  const data = useQuery(api.queries.getJobWithItems, { jobId });
  const retryFailed = useMutation(api.jobs.retryFailed);
  const cancelJob = useMutation(api.jobs.cancelJob);

  // Fire toasts on status transitions (skip initial load)
  useEffect(() => {
    if (!data?.job) return;
    const { status, succeededCount, failedCount, normalizedPlan } = data.job;
    const prev = prevStatusRef.current;
    prevStatusRef.current = status;

    if (prev === undefined || prev === status) return;

    const verb = normalizedPlan.intent === "bulk_freeze_cards" ? "frozen" : "updated";
    if (status === "completed") {
      toast.success(`All ${succeededCount} cards ${verb} successfully.`);
    } else if (status === "completed_with_failures") {
      toast.warning(`Completed with failures — ${failedCount} card${failedCount === 1 ? "" : "s"} failed.`);
    } else if (status === "cancelled") {
      toast.info("Job cancelled.");
    } else if (status === "failed") {
      toast.error("Job failed. Please contact support.");
    }
  }, [data]);

  if (data === undefined) return <LoadingShell />;
  if (data === null) {
    return (
      <main style={{ maxWidth: 720, margin: "0 auto", padding: "48px 24px" }}>
        <div
          style={{
            borderRadius: 12,
            border: "1px solid #7f1d1d",
            background: "#1a0505",
            padding: "24px",
            textAlign: "center",
          }}
        >
          <p style={{ fontSize: 13, color: "#fca5a5", margin: "0 0 12px" }}>Job not found</p>
          <Link
            href="/"
            style={{ fontSize: 13, color: "#00FBEC", textDecoration: "none" }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLAnchorElement).style.textDecoration = "underline")}
            onMouseLeave={(e) => ((e.currentTarget as HTMLAnchorElement).style.textDecoration = "none")}
          >
            ← Back to thread
          </Link>
        </div>
      </main>
    );
  }

  const { job, items } = data;
  const isRunning = job.status === "in_progress" || job.status === "confirmed";
  const retryableItems = items.filter((i) => i.status === "failed_retryable");
  const hasRetryable = retryableItems.length > 0;
  const progress =
    job.eligibleItems > 0
      ? Math.round(((job.succeededCount + job.failedCount) / job.eligibleItems) * 100)
      : 0;

  const statusStyle = STATUS_STYLE[job.status] ?? { bg: "#1E293B", color: "#94A3B8" };

  async function handleRetry() {
    setRetrying(true);
    try {
      await retryFailed({ jobId });
      toast.success(`${retryableItems.length} card${retryableItems.length === 1 ? "" : "s"} re-queued for retry.`);
    } catch (err) {
      toast.error("Failed to retry", {
        description: err instanceof Error ? err.message : "Please try again.",
      });
    } finally {
      setRetrying(false);
    }
  }

  async function handleCancel() {
    setCancelling(true);
    try {
      await cancelJob({ jobId });
      toast.info("Cancellation requested.");
    } catch (err) {
      toast.error("Failed to cancel", {
        description: err instanceof Error ? err.message : "Please try again.",
      });
    } finally {
      setCancelling(false);
    }
  }

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "40px 24px" }}>
      {/* Breadcrumb */}
      <div style={{ marginBottom: 20 }}>
        <Link
          href="/"
          style={{ fontSize: 13, color: T.muted, textDecoration: "none" }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLAnchorElement).style.color = T.textSub)}
          onMouseLeave={(e) => ((e.currentTarget as HTMLAnchorElement).style.color = T.muted)}
        >
          ← Back to thread
        </Link>
      </div>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, color: T.text, fontFamily: T.fontMono, margin: 0 }}>
            {job.normalizedPlan.intent === "bulk_update_card_limit"
              ? "Bulk limit update"
              : "Bulk freeze cards"}{" "}
            — {job.normalizedPlan.targetGroup}
          </h1>
          <p style={{ fontSize: 13, color: T.muted, marginTop: 4 }}>
            {job.normalizedPlan.intent === "bulk_update_card_limit"
              ? `${job.normalizedPlan.newLimit.currency} ${job.normalizedPlan.newLimit.amount.toLocaleString()} new limit`
              : job.normalizedPlan.reason
                ? `Reason: ${job.normalizedPlan.reason}`
                : "Cards will be set to frozen"}
          </p>
        </div>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            borderRadius: 9999,
            padding: "3px 10px",
            fontSize: 11,
            fontWeight: 500,
            background: statusStyle.bg,
            color: statusStyle.color,
            flexShrink: 0,
            marginLeft: 12,
          }}
        >
          {STATUS_LABELS[job.status] ?? job.status}
        </span>
      </div>

      {/* Progress bar */}
      {isRunning && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: T.muted, marginBottom: 6 }}>
            <span>Progress</span>
            <span>{progress}%</span>
          </div>
          <div style={{ height: 4, width: "100%", background: T.elevated, borderRadius: 4, overflow: "hidden" }}>
            <div
              style={{
                height: "100%",
                width: `${progress}%`,
                background: T.accent,
                borderRadius: 4,
                transition: "width 0.5s ease",
              }}
            />
          </div>
        </div>
      )}

      {/* Counts */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 20 }}>
        <CountCard label="Succeeded" value={job.succeededCount} color="#4ADE80" T={T} />
        <CountCard label="Failed" value={job.failedCount} color="#F87171" T={T} />
        <CountCard label="Skipped" value={job.skippedCount} color={T.muted} T={T} />
        <CountCard label="Cancelled" value={job.cancelledCount} color={T.muted} T={T} />
      </div>

      {/* Actions */}
      {(hasRetryable || isRunning) && (
        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          {hasRetryable && (
            <button
              onClick={handleRetry}
              disabled={retrying}
              style={{
                borderRadius: 8,
                border: "1px solid #7C2D12",
                background: retrying ? T.elevated : "#1c0900",
                color: retrying ? T.muted : "#FB923C",
                padding: "6px 14px",
                fontSize: 12,
                fontWeight: 500,
                fontFamily: T.fontBody,
                cursor: retrying ? "not-allowed" : "pointer",
                opacity: retrying ? 0.7 : 1,
                transition: "all 0.15s ease",
              }}
            >
              {retrying ? "Retrying…" : `Retry failed (${retryableItems.length})`}
            </button>
          )}
          {isRunning && (
            <button
              onClick={handleCancel}
              disabled={cancelling}
              style={{
                borderRadius: 8,
                border: `1px solid ${T.border}`,
                background: "transparent",
                color: cancelling ? T.muted : T.textSub,
                padding: "6px 14px",
                fontSize: 12,
                fontWeight: 500,
                fontFamily: T.fontBody,
                cursor: cancelling ? "not-allowed" : "pointer",
                opacity: cancelling ? 0.6 : 1,
                transition: "all 0.15s ease",
              }}
            >
              {cancelling ? "Cancelling…" : "Cancel remaining"}
            </button>
          )}
        </div>
      )}

      {/* Item list */}
      <div
        style={{
          borderRadius: 12,
          border: `1px solid ${T.border}`,
          background: T.surface,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "12px 20px",
            borderBottom: `1px solid ${T.border}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <h2 style={{ fontSize: 13, fontWeight: 500, color: T.textSub, margin: 0 }}>
            Card-level status
          </h2>
          <span style={{ fontSize: 11, color: T.muted }}>{items.length} items</span>
        </div>
        <div style={{ maxHeight: 480, overflowY: "auto" }}>
          {items.map((item) => {
            const isExpanded = expandedCard === item.cardId;
            return (
              <div key={item._id} style={{ borderBottom: `1px solid ${T.border}` }}>
                <div
                  onClick={() => setExpandedCard(isExpanded ? null : item.cardId)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "10px 20px",
                    cursor: "pointer",
                    background: isExpanded ? T.elevated : "transparent",
                    transition: "background 0.15s ease",
                  }}
                >
                  <div>
                    <span style={{ fontSize: 13, fontWeight: 500, color: T.text }}>
                      {item.cardholderName}
                    </span>
                    <span style={{ marginLeft: 8, fontSize: 11, fontFamily: T.fontMono, color: T.muted }}>
                      {item.cardId}
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    {item.failureCode && (
                      <span
                        title={item.failureDetail ?? ""}
                        style={{ fontSize: 11, color: T.muted, cursor: "help" }}
                      >
                        {item.failureCode}
                      </span>
                    )}
                    {item.retryCount > 0 && (
                      <span style={{ fontSize: 11, color: T.muted }}>×{item.retryCount}</span>
                    )}
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 500,
                        textTransform: "capitalize",
                        color: ITEM_STATUS_COLOR[item.status] ?? T.muted,
                      }}
                    >
                      {item.status.replace(/_/g, " ")}
                    </span>
                    <svg
                      width="10" height="10" viewBox="0 0 24 24" fill="none"
                      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
                      style={{ color: T.muted, transition: "transform 0.15s ease", transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)" }}
                      aria-hidden="true"
                    >
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </div>
                </div>
                {isExpanded && <CardActionsPanel cardId={item.cardId} T={T} />}
              </div>
            );
          })}
        </div>
      </div>

      {/* Final summary */}
      {!isRunning && (
        <div
          style={{
            marginTop: 20,
            borderRadius: 12,
            border: `1px solid ${job.status === "completed" ? "#14532d" : "#431407"}`,
            background: job.status === "completed" ? "#052E16" : "#1c0900",
            padding: "16px 20px",
            fontSize: 13,
          }}
        >
          <strong style={{ color: job.status === "completed" ? "#4ADE80" : "#FB923C" }}>
            {job.status === "completed"
              ? `All ${job.succeededCount} cards updated successfully.`
              : `Completed: ${job.succeededCount} succeeded, ${job.failedCount} failed, ${job.skippedCount} skipped.`}
          </strong>
          {job.failedCount > 0 && (
            <p style={{ marginTop: 6, fontSize: 12, color: T.muted, margin: "6px 0 0" }}>
              Permanently failed cards require manual review. Retryable failures can be re-queued above.
            </p>
          )}
        </div>
      )}
    </main>
  );
}

function CountCard({
  label, value, color, T,
}: {
  label: string;
  value: number;
  color: string;
  T: ReturnType<typeof useTheme>["T"];
}) {
  return (
    <div
      style={{
        borderRadius: 10,
        border: `1px solid ${T.border}`,
        background: T.surface,
        padding: "12px",
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 20, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>{label}</div>
    </div>
  );
}

function LoadingShell() {
  const { T } = useTheme();
  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "40px 24px" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ height: 16, width: 64, borderRadius: 6, background: T.elevated }} />
        <div style={{ height: 28, width: 240, borderRadius: 6, background: T.elevated }} />
        <div style={{ height: 4, borderRadius: 4, background: T.elevated }} />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} style={{ height: 64, borderRadius: 10, background: T.elevated }} />
          ))}
        </div>
        <div style={{ height: 256, borderRadius: 12, background: T.elevated }} />
      </div>
    </main>
  );
}
