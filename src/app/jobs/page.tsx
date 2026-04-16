"use client";
export const dynamic = "force-dynamic";
import { useState } from "react";
import { useQuery } from "convex/react";
import Link from "next/link";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
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
  draft:                   { bg: "#1E293B", text: "#94A3B8" },
  confirmed:               { bg: "#1E3A5F", text: "#60A5FA" },
  in_progress:             { bg: "#2D2A0F", text: "#FCD34D" },
  completed:               { bg: "#0D2818", text: "#4ADE80" },
  completed_with_failures: { bg: "#2D1A0F", text: "#FB923C" },
  cancelled:               { bg: "#1E293B", text: "#64748B" },
  failed:                  { bg: "#2D0F0F", text: "#F87171" },
};

function StatusBadge({ status }: { status: string }) {
  const colors = STATUS_COLORS[status] ?? STATUS_COLORS.draft;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center",
      borderRadius: 9999, padding: "2px 10px",
      fontSize: 11, fontWeight: 500,
      background: colors.bg, color: colors.text,
      whiteSpace: "nowrap",
    }}>
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

type ThreadMsg = {
  role: "user" | "assistant";
  content: string;
  kind?: string;
  jobId?: string;
};

function JobRow({ jobId, T }: { jobId: string; T: ReturnType<typeof useTheme>["T"] }) {
  const job = useQuery(api.queries.getJob, { jobId: jobId as Id<"jobs"> });
  if (!job) return null;
  return (
    <Link href={`/jobs/${jobId}`} style={{ textDecoration: "none", display: "block" }}>
      <div
        style={{
          borderRadius: 8, border: `1px solid ${T.border}`,
          background: T.elevated, padding: "10px 14px",
          marginTop: 8, cursor: "pointer",
          transition: "border-color 0.15s ease",
        }}
        onMouseEnter={(e) => ((e.currentTarget as HTMLDivElement).style.borderColor = T.accent)}
        onMouseLeave={(e) => ((e.currentTarget as HTMLDivElement).style.borderColor = T.border)}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <span style={{ fontSize: 13, color: T.text, fontWeight: 500 }}>
            {job.normalizedPlan.targetGroup} — {job.normalizedPlan.newLimit.currency} {job.normalizedPlan.newLimit.amount.toLocaleString()}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            <span style={{ fontSize: 12, color: T.muted, fontFamily: T.fontMono }}>
              {job.succeededCount}/{job.eligibleItems} cards
            </span>
            <StatusBadge status={job.status} />
          </div>
        </div>
      </div>
    </Link>
  );
}

function ThreadRow({ thread, T }: {
  thread: { _id: string; _creationTime: number; messages: ThreadMsg[] };
  T: ReturnType<typeof useTheme>["T"];
}) {
  const [expanded, setExpanded] = useState(false);

  const firstUser = thread.messages.find((m) => m.role === "user");
  const title = firstUser ? firstUser.content.slice(0, 80) + (firstUser.content.length > 80 ? "…" : "") : "Empty thread";
  const jobIds = thread.messages
    .filter((m) => m.role === "assistant" && m.kind === "bulk_op" && m.jobId)
    .map((m) => m.jobId as string);
  const msgCount = thread.messages.length;
  const ts = new Date(thread._creationTime);
  const timeStr = ts.toLocaleDateString(undefined, { month: "short", day: "numeric" }) + " " +
    ts.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

  return (
    <div style={{
      borderRadius: 12, border: `1px solid ${T.border}`,
      background: T.surface, overflow: "hidden",
    }}>
      <button
        onClick={() => setExpanded((v) => !v)}
        style={{
          width: "100%", display: "flex", alignItems: "flex-start",
          justifyContent: "space-between", gap: 12,
          padding: "14px 18px", background: "transparent", border: "none",
          cursor: "pointer", textAlign: "left",
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 13, fontWeight: 500, color: T.text,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {title}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4 }}>
            <span style={{ fontSize: 11, color: T.muted }}>{timeStr}</span>
            <span style={{ fontSize: 11, color: T.muted }}>·</span>
            <span style={{ fontSize: 11, color: T.muted }}>{msgCount} message{msgCount !== 1 ? "s" : ""}</span>
            {jobIds.length > 0 && (
              <>
                <span style={{ fontSize: 11, color: T.muted }}>·</span>
                <span style={{
                  fontSize: 10, fontWeight: 600, letterSpacing: "0.06em",
                  color: T.accent, background: `${T.accent}18`,
                  padding: "1px 6px", borderRadius: 4,
                }}>
                  {jobIds.length} job{jobIds.length !== 1 ? "s" : ""}
                </span>
              </>
            )}
          </div>
        </div>
        <svg
          width="14" height="14" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round"
          style={{
            color: T.muted, flexShrink: 0, marginTop: 2,
            transition: "transform 0.15s ease",
            transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
          }}
          aria-hidden="true"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {expanded && (
        <div style={{ borderTop: `1px solid ${T.border}`, padding: "12px 18px 16px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {thread.messages.map((msg, i) => (
              <div key={i} style={{
                display: "flex",
                justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
              }}>
                <div style={{
                  maxWidth: "85%", borderRadius: msg.role === "user"
                    ? "12px 12px 4px 12px"
                    : "12px 12px 12px 4px",
                  padding: "8px 12px", fontSize: 12, lineHeight: 1.6,
                  background: msg.role === "user" ? T.accent : T.elevated,
                  color: msg.role === "user" ? T.onAccent : T.textSub,
                  border: msg.role === "user" ? "none" : `1px solid ${T.border}`,
                }}>
                  {msg.content}
                  {msg.kind === "bulk_op" && msg.jobId && (
                    <Link
                      href={`/jobs/${msg.jobId}`}
                      onClick={(e) => e.stopPropagation()}
                      style={{ display: "block", marginTop: 6, fontSize: 11, color: T.accent, textDecoration: "none" }}
                    >
                      View job →
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>

          {jobIds.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: T.muted, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Linked jobs
              </div>
              {jobIds.map((id) => <JobRow key={id} jobId={id} T={T} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ThreadHistoryPage() {
  const { T } = useTheme();
  const threads = useQuery(api.threads.listThreads);

  if (threads === undefined) {
    return (
      <main style={{ maxWidth: 768, margin: "0 auto", padding: "48px 24px" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {[1, 2, 3].map((i) => (
            <div key={i} style={{ height: 72, borderRadius: 12, background: T.elevated, opacity: 0.6, animation: "pulse 1.5s ease-in-out infinite" }} />
          ))}
        </div>
        <style>{`@keyframes pulse { 0%,100%{opacity:.6} 50%{opacity:.3} }`}</style>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 768, margin: "0 auto", padding: "48px 24px" }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: T.text, margin: 0, fontFamily: T.fontMono }}>
          Thread history
        </h1>
        <p style={{ fontSize: 13, color: T.muted, marginTop: 4 }}>
          {threads.length === 0 ? "No threads yet." : `${threads.length} recent thread${threads.length !== 1 ? "s" : ""}`}
        </p>
      </div>

      {threads.length === 0 ? (
        <div style={{
          borderRadius: 12, border: `1px solid ${T.border}`,
          background: T.surface, padding: "48px 24px",
          textAlign: "center", display: "flex", flexDirection: "column",
          alignItems: "center", gap: 12,
        }}>
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: T.muted }} aria-hidden="true">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          <p style={{ fontSize: 14, color: T.muted, margin: 0 }}>
            No threads yet.{" "}
            <Link href="/" style={{ color: T.accent, textDecoration: "none" }}>
              Start one →
            </Link>
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {threads.map((thread) => (
            <ThreadRow key={thread._id} thread={thread} T={T} />
          ))}
        </div>
      )}

      <div style={{ marginTop: 24, textAlign: "center" }}>
        <Link href="/" style={{ fontSize: 13, color: T.accent, textDecoration: "none", fontFamily: T.fontMono }}>
          + New thread
        </Link>
      </div>
    </main>
  );
}
