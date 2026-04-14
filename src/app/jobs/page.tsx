"use client";
export const dynamic = "force-dynamic";
import { useQuery } from "convex/react";
import Link from "next/link";
import { api } from "../../../convex/_generated/api";
import { useTheme } from "../theme";

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  confirmed: "Confirmed",
  in_progress: "Running",
  completed: "Completed",
  completed_with_failures: "Completed w/ failures",
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

function StatusBadge({ status }: { status: string }) {
  const colors = STATUS_COLORS[status] ?? STATUS_COLORS.draft;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        borderRadius: 9999,
        padding: "2px 10px",
        fontSize: 11,
        fontWeight: 500,
        background: colors.bg,
        color: colors.text,
        whiteSpace: "nowrap",
      }}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

function ProgressBar({ succeeded, total }: { succeeded: number; total: number }) {
  const { T } = useTheme();
  const pct = total > 0 ? Math.round((succeeded / total) * 100) : 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div
        style={{
          flex: 1,
          height: 4,
          borderRadius: 2,
          background: T.elevated,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: T.accent,
            borderRadius: 2,
            transition: "width 0.3s ease",
          }}
        />
      </div>
      <span style={{ fontSize: 11, color: T.muted, minWidth: 32, textAlign: "right" }}>
        {pct}%
      </span>
    </div>
  );
}

export default function JobsPage() {
  const { T } = useTheme();
  const jobs = useQuery(api.queries.listJobs);

  if (jobs === undefined) {
    return (
      <main style={{ maxWidth: 768, margin: "0 auto", padding: "48px 24px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              style={{
                height: 72,
                borderRadius: 12,
                background: T.elevated,
                opacity: 0.6,
                animation: "pulse 1.5s ease-in-out infinite",
              }}
            />
          ))}
        </div>
        <style>{`@keyframes pulse { 0%,100%{opacity:.6} 50%{opacity:.3} }`}</style>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 768, margin: "0 auto", padding: "48px 24px" }}>
      {/* Page header */}
      <div style={{ marginBottom: 28 }}>
        <h1
          style={{
            fontSize: 20,
            fontWeight: 600,
            color: T.text,
            margin: 0,
            fontFamily: T.fontMono,
          }}
        >
          Job history
        </h1>
        <p style={{ fontSize: 13, color: T.muted, marginTop: 4 }}>
          {jobs.length === 0 ? "No jobs yet." : `${jobs.length} recent job${jobs.length !== 1 ? "s" : ""}`}
        </p>
      </div>

      {jobs.length === 0 ? (
        <div
          style={{
            borderRadius: 12,
            border: `1px solid ${T.border}`,
            background: T.surface,
            padding: "48px 24px",
            textAlign: "center",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 12,
          }}
        >
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: T.muted }} aria-hidden="true">
            <rect x="3" y="3" width="18" height="18" rx="3" />
            <path d="M3 9h18M9 21V9" />
          </svg>
          <p style={{ fontSize: 14, color: T.muted, margin: 0 }}>
            No jobs yet.{" "}
            <Link href="/" style={{ color: T.accent, textDecoration: "none" }}>
              Create one →
            </Link>
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {jobs.map((job) => {
            const isRunning = job.status === "in_progress" || job.status === "confirmed";
            return (
              <Link
                key={job._id}
                href={`/jobs/${job._id}`}
                style={{ textDecoration: "none" }}
              >
                <div
                  style={{
                    borderRadius: 12,
                    border: `1px solid ${T.border}`,
                    background: T.surface,
                    padding: "16px 20px",
                    cursor: "pointer",
                    transition: "border-color 0.15s ease, background 0.15s ease",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLDivElement).style.borderColor = T.accent;
                    (e.currentTarget as HTMLDivElement).style.background = T.elevated;
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLDivElement).style.borderColor = T.border;
                    (e.currentTarget as HTMLDivElement).style.background = T.surface;
                  }}
                >
                  {/* Top row */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 12,
                      marginBottom: isRunning ? 10 : 0,
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <span
                        style={{
                          fontSize: 14,
                          fontWeight: 500,
                          color: T.text,
                          display: "block",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {job.normalizedPlan.targetGroup} —{" "}
                        {job.normalizedPlan.newLimit.currency}{" "}
                        {job.normalizedPlan.newLimit.amount.toLocaleString()}
                      </span>
                      <span
                        style={{
                          fontSize: 12,
                          color: T.muted,
                          display: "block",
                          marginTop: 2,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {job.rawRequest}
                      </span>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        flexShrink: 0,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 12,
                          color: T.muted,
                          fontFamily: T.fontMono,
                        }}
                      >
                        {job.succeededCount}/{job.eligibleItems} cards
                      </span>
                      <StatusBadge status={job.status} />
                    </div>
                  </div>

                  {/* Progress bar for running jobs */}
                  {isRunning && (
                    <ProgressBar succeeded={job.succeededCount} total={job.eligibleItems} />
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* New job CTA */}
      <div style={{ marginTop: 24, textAlign: "center" }}>
        <Link
          href="/"
          style={{
            fontSize: 13,
            color: T.accent,
            textDecoration: "none",
            fontFamily: T.fontMono,
          }}
        >
          + New job
        </Link>
      </div>
    </main>
  );
}
