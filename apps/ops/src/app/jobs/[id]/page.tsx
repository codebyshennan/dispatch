"use client";
import { useQuery, useMutation } from "convex/react";
import { useParams } from "next/navigation";
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

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  draft: { bg: "#1E293B", text: "#94A3B8" },
  confirmed: { bg: "#1E3A5F", text: "#60A5FA" },
  in_progress: { bg: "#2D2A0F", text: "#FCD34D" },
  completed: { bg: "#0D2818", text: "#4ADE80" },
  completed_with_failures: { bg: "#2D1A0F", text: "#FB923C" },
  cancelled: { bg: "#1E293B", text: "#64748B" },
  failed: { bg: "#2D0F0F", text: "#F87171" },
};

const ITEM_STATUS_COLOR: Record<string, string> = {
  queued: "#64748B",
  in_progress: "#FCD34D",
  succeeded: "#4ADE80",
  failed_retryable: "#FB923C",
  failed_permanent: "#F87171",
  cancelled: "#475569",
  skipped: "#475569",
};

export default function JobPage() {
  const { T } = useTheme();
  const { id } = useParams<{ id: string }>();
  const jobId = id as Id<"jobs">;

  const data = useQuery(api.queries.getJobWithItems, { jobId });
  const retryFailed = useMutation(api.jobs.retryFailed);
  const cancelJob = useMutation(api.jobs.cancelJob);

  if (data === undefined) return <LoadingShell />;
  if (data === null) {
    return (
      <main style={{ maxWidth: 768, margin: "0 auto", padding: "48px 24px" }}>
        <p style={{ color: "#f87171", fontSize: 14 }}>Job not found</p>
      </main>
    );
  }

  const { job, items } = data;
  const isRunning = job.status === "in_progress" || job.status === "confirmed";
  const hasRetryable = items.some((i) => i.status === "failed_retryable");
  const progress =
    job.eligibleItems > 0
      ? Math.round(((job.succeededCount + job.failedCount) / job.eligibleItems) * 100)
      : 0;

  const statusColors = STATUS_COLORS[job.status] ?? STATUS_COLORS.draft;

  return (
    <main style={{ maxWidth: 768, margin: "0 auto", padding: "40px 24px" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          marginBottom: 24,
          gap: 16,
        }}
      >
        <div>
          <h1
            style={{
              fontSize: 20,
              fontWeight: 600,
              color: T.text,
              margin: 0,
              fontFamily: T.fontMono,
            }}
          >
            {job.normalizedPlan.targetGroup} — {job.normalizedPlan.newLimit.currency}{" "}
            {job.normalizedPlan.newLimit.amount.toLocaleString()}
          </h1>
          <p style={{ fontSize: 13, color: T.muted, marginTop: 4 }}>{job.rawRequest}</p>
        </div>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            borderRadius: 9999,
            padding: "3px 12px",
            fontSize: 11,
            fontWeight: 500,
            background: statusColors.bg,
            color: statusColors.text,
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          {STATUS_LABELS[job.status] ?? job.status}
        </span>
      </div>

      {/* Progress bar */}
      {isRunning && (
        <div style={{ marginBottom: 24 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 12,
              color: T.muted,
              marginBottom: 6,
            }}
          >
            <span>Progress</span>
            <span style={{ fontFamily: T.fontMono }}>{progress}%</span>
          </div>
          <div
            style={{
              height: 6,
              width: "100%",
              background: T.elevated,
              borderRadius: 3,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${progress}%`,
                height: "100%",
                background: T.accent,
                borderRadius: 3,
                transition: "width 0.5s ease",
              }}
            />
          </div>
        </div>
      )}

      {/* Count cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 10,
          marginBottom: 20,
        }}
      >
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
              onClick={() => retryFailed({ jobId })}
              style={{
                borderRadius: 8,
                border: "1px solid #78350f",
                background: "#1c0d00",
                padding: "6px 14px",
                fontSize: 12,
                fontWeight: 500,
                color: "#fb923c",
                fontFamily: T.fontBody,
                cursor: "pointer",
                transition: "opacity 0.15s ease",
              }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.opacity = "0.75")}
              onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.opacity = "1")}
            >
              Retry failed ({items.filter((i) => i.status === "failed_retryable").length})
            </button>
          )}
          {isRunning && (
            <button
              onClick={() => cancelJob({ jobId })}
              style={{
                borderRadius: 8,
                border: `1px solid ${T.border}`,
                background: "transparent",
                padding: "6px 14px",
                fontSize: 12,
                fontWeight: 500,
                color: T.textSub,
                fontFamily: T.fontBody,
                cursor: "pointer",
                transition: "border-color 0.15s ease",
              }}
              onMouseEnter={(e) =>
                ((e.currentTarget as HTMLButtonElement).style.borderColor = T.muted)
              }
              onMouseLeave={(e) =>
                ((e.currentTarget as HTMLButtonElement).style.borderColor = T.border)
              }
            >
              Cancel remaining
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
          <span style={{ fontSize: 12, color: T.muted, fontFamily: T.fontMono }}>
            {items.length} items
          </span>
        </div>
        <div style={{ maxHeight: 400, overflowY: "auto" }}>
          {items.map((item) => (
            <div
              key={item._id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "10px 20px",
                borderBottom: `1px solid ${T.border}`,
              }}
            >
              <div>
                <span style={{ fontSize: 13, fontWeight: 500, color: T.text }}>
                  {item.cardholderName}
                </span>
                <span
                  style={{
                    marginLeft: 10,
                    fontSize: 12,
                    fontFamily: T.fontMono,
                    color: T.muted,
                  }}
                >
                  {item.cardId}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                {item.failureCode && (
                  <span style={{ fontSize: 11, color: T.muted }} title={item.failureDetail ?? ""}>
                    {item.failureCode}
                  </span>
                )}
                {item.retryCount > 0 && (
                  <span style={{ fontSize: 11, color: T.muted, fontFamily: T.fontMono }}>
                    ×{item.retryCount}
                  </span>
                )}
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 500,
                    color: ITEM_STATUS_COLOR[item.status] ?? T.muted,
                    textTransform: "capitalize",
                  }}
                >
                  {item.status.replace(/_/g, " ")}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Final summary */}
      {!isRunning && (
        <div
          style={{
            marginTop: 20,
            borderRadius: 12,
            border: `1px solid ${job.status === "completed" ? "#14532d" : "#78350f"}`,
            background: job.status === "completed" ? "#0d2818" : "#1c0d00",
            padding: "18px 20px",
            fontSize: 13,
            color: job.status === "completed" ? "#4ade80" : "#fb923c",
          }}
        >
          <strong>
            {job.status === "completed"
              ? `All ${job.succeededCount} cards updated successfully.`
              : `Completed: ${job.succeededCount} succeeded, ${job.failedCount} failed, ${job.skippedCount} skipped.`}
          </strong>
          {job.failedCount > 0 && (
            <p style={{ marginTop: 4, fontSize: 12, opacity: 0.75 }}>
              Permanently failed cards require manual review. Retryable failures can be re-queued
              above.
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
      <div style={{ fontSize: 22, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>{label}</div>
    </div>
  );
}

function LoadingShell() {
  const { T } = useTheme();
  return (
    <main style={{ maxWidth: 768, margin: "0 auto", padding: "40px 24px" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ height: 28, width: 256, borderRadius: 6, background: T.elevated }} />
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 10,
          }}
        >
          {[0, 1, 2, 3].map((i) => (
            <div key={i} style={{ height: 64, borderRadius: 10, background: T.elevated }} />
          ))}
        </div>
        <div style={{ height: 280, borderRadius: 12, background: T.elevated }} />
      </div>
      <style>{`@keyframes pulse { 0%,100%{opacity:.6} 50%{opacity:.3} }`}</style>
    </main>
  );
}
