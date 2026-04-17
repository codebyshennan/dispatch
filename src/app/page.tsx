"use client";
export const dynamic = "force-dynamic";
import { useRef, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { toast } from "sonner";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
type ThreadId = Id<"threads">;
import { useTheme } from "./theme";

// ── ThumbsRow ─────────────────────────────────────────────────────────────────
function ThumbsRow({
  responseId, kind, T,
}: {
  responseId: string;
  kind: "answer" | "bulk_op";
  T: ReturnType<typeof useTheme>["T"];
}) {
  const [rated, setRated] = useState<"up" | "down" | null>(null);
  const submitFeedback = useMutation(api.feedback.submitFeedback);

  async function rate(rating: "up" | "down") {
    if (rated === rating) return;
    setRated(rating);
    try {
      await submitFeedback({ responseId, kind, rating });
    } catch {
      setRated(null);
    }
  }

  return (
    <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
      {(["up", "down"] as const).map((r) => (
        <button
          key={r}
          onClick={() => rate(r)}
          title={r === "up" ? "Helpful" : "Not helpful"}
          aria-label={r === "up" ? "Helpful" : "Not helpful"}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            width: 24, height: 24, borderRadius: 6,
            border: `1px solid ${rated === r ? T.accent : T.border}`,
            background: rated === r ? `${T.accent}22` : "transparent",
            color: rated === r ? T.accent : T.muted,
            cursor: "pointer", transition: "all 0.15s ease",
            padding: 0,
          }}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
            style={{ transform: r === "down" ? "scaleY(-1)" : undefined }}>
            <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z" />
            <path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
          </svg>
        </button>
      ))}
    </div>
  );
}

// ── Examples ─────────────────────────────────────────────────────────────────
const EXAMPLES = [
  "Update the spending limits for all Marketing team cards to SGD 2,000 and notify the cardholders.",
  "Set new card limits for the Engineering team to SGD 3,500.",
  "What's the maximum card limit I can set?",
  "When does a bulk operation require approval?",
  "Can I update limits for frozen cards?",
];

// ── Thread entry types ────────────────────────────────────────────────────────
// Every pair of (user msg + response) shares a pairId.
// Response entries carry userText so Retry can re-run the original request.
type PolicySource = { id: string; title: string; snippet: string };

type Entry =
  | { id: string; pairId: string; kind: "user"; text: string }
  | { id: string; pairId: string; kind: "answer"; text: string; sources: PolicySource[]; userText: string }
  | { id: string; pairId: string; kind: "bulk_op"; jobId: Id<"jobs">; intent: "bulk_update_card_limit" | "bulk_freeze_cards"; targetGroup: string; newLimit?: { currency: string; amount: number }; reason?: string; notifyCardholders: boolean; userText: string }
  | { id: string; pairId: string; kind: "job_preview"; jobId: Id<"jobs"> }
  | { id: string; pairId: string; kind: "job_progress"; jobId: Id<"jobs"> }
  | { id: string; pairId: string; kind: "loading"; userText: string }
  | { id: string; pairId: string; kind: "unsupported"; intent: string; userText: string };

function uid() {
  return Math.random().toString(36).slice(2);
}

// ── Icon buttons ──────────────────────────────────────────────────────────────
function IconBtn({
  onClick, title, children, T,
}: {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
  T: ReturnType<typeof useTheme>["T"];
}) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        flexShrink: 0, alignSelf: "center",
        display: "flex", alignItems: "center", justifyContent: "center",
        width: 28, height: 28, borderRadius: 7,
        border: `1px solid ${T.border}`,
        background: hov ? T.elevated : "transparent",
        color: hov ? T.textSub : T.muted,
        cursor: "pointer", transition: "all 0.15s ease",
      }}
    >
      {children}
    </button>
  );
}

function EditIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

function RetryIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
    </svg>
  );
}

// ── UserBubble ────────────────────────────────────────────────────────────────
function UserBubble({
  entry, onEditSubmit, T,
}: {
  entry: Extract<Entry, { kind: "user" }>;
  onEditSubmit: (newText: string) => void;
  T: ReturnType<typeof useTheme>["T"];
}) {
  const [hov, setHov] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(entry.text);
  const taRef = useRef<HTMLTextAreaElement>(null);

  function startEdit() {
    setDraft(entry.text);
    setEditing(true);
    setTimeout(() => {
      const ta = taRef.current;
      if (ta) { ta.focus(); ta.selectionStart = ta.value.length; }
    }, 0);
  }

  function cancel() {
    setEditing(false);
    setDraft(entry.text);
  }

  function submit() {
    const text = draft.trim();
    if (!text) return;
    setEditing(false);
    onEditSubmit(text);
  }

  if (editing) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, width: "100%" }}>
        <textarea
          ref={taRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
            if (e.key === "Escape") cancel();
          }}
          rows={Math.max(2, draft.split("\n").length)}
          style={{
            width: "80%", borderRadius: 10,
            border: `1.5px solid ${T.accent}`,
            background: T.surface, color: T.text,
            padding: "10px 14px", fontSize: 13,
            fontFamily: T.fontBody, resize: "none",
            outline: "none", lineHeight: 1.6,
            boxSizing: "border-box",
          }}
        />
        <div style={{ display: "flex", gap: 6 }}>
          <button
            onClick={cancel}
            style={{
              borderRadius: 7, border: `1px solid ${T.border}`,
              background: "transparent", color: T.muted,
              padding: "4px 12px", fontSize: 12,
              fontFamily: T.fontBody, cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!draft.trim()}
            style={{
              borderRadius: 7, border: "none",
              background: draft.trim() ? T.accent : T.elevated,
              color: draft.trim() ? T.onAccent : T.muted,
              padding: "4px 12px", fontSize: 12, fontWeight: 600,
              fontFamily: T.fontBody,
              cursor: draft.trim() ? "pointer" : "not-allowed",
            }}
          >
            Send
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{ display: "flex", flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 6 }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
    >
      {hov && <IconBtn onClick={startEdit} title="Edit message" T={T}><EditIcon /></IconBtn>}
      <div style={{
        maxWidth: "80%", borderRadius: "12px 12px 4px 12px",
        padding: "10px 14px", fontSize: 13, lineHeight: 1.6,
        background: T.accent, color: T.onAccent,
        whiteSpace: "pre-wrap",
      }}>
        {entry.text}
      </div>
    </div>
  );
}

// ── PolicySourceRow ───────────────────────────────────────────────────────────
function PolicySourceRow({ source, index, T }: { source: PolicySource; index: number; T: ReturnType<typeof useTheme>["T"] }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderBottom: index > 0 ? `1px solid ${T.border}` : undefined }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: 8,
          background: "transparent", border: "none", padding: "7px 0",
          cursor: "pointer", textAlign: "left",
        }}
      >
        <span style={{
          fontSize: 9, fontWeight: 700, color: "#fff",
          background: "#3b82f6", borderRadius: 3, padding: "1px 5px",
          flexShrink: 0, letterSpacing: "0.03em",
        }}>
          {source.id}
        </span>
        <span style={{ flex: 1, fontSize: 11, color: T.textSub, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {source.title}
        </span>
        <svg
          width="10" height="10" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          style={{ color: T.muted, flexShrink: 0, transition: "transform 0.15s ease", transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
          aria-hidden="true"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <p style={{ margin: "0 0 8px", fontSize: 11, color: T.muted, lineHeight: 1.6, paddingLeft: 28 }}>
          {source.snippet}
        </p>
      )}
    </div>
  );
}

// ── AnswerBubble ──────────────────────────────────────────────────────────────
function AnswerBubble({
  entry, onRetry, T,
}: {
  entry: Extract<Entry, { kind: "answer" }>;
  onRetry: () => void;
  T: ReturnType<typeof useTheme>["T"];
}) {
  const [hov, setHov] = useState(false);
  const hasSources = entry.sources.length > 0;
  return (
    <div
      style={{ display: "flex", flexDirection: "row", alignItems: "flex-start", gap: 6 }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
    >
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{
          maxWidth: "80%", borderRadius: "12px 12px 12px 4px",
          background: T.surface, color: T.text,
          border: `1px solid ${T.border}`,
          overflow: "hidden",
        }}>
          <div style={{ padding: "10px 14px", fontSize: 13, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
            {entry.text}
          </div>
          {hasSources && (
            <div style={{ borderTop: `1px solid ${T.border}`, padding: "6px 14px 4px" }}>
              <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: T.muted, margin: "0 0 4px" }}>
                Policy sources
              </p>
              {entry.sources.map((src, i) => (
                <PolicySourceRow key={src.id} source={src} index={i} T={T} />
              ))}
            </div>
          )}
        </div>
        {hov && <ThumbsRow responseId={entry.id} kind="answer" T={T} />}
      </div>
      {hov && <IconBtn onClick={onRetry} title="Retry" T={T}><RetryIcon /></IconBtn>}
    </div>
  );
}

// ── BulkOpCard ────────────────────────────────────────────────────────────────
function BulkOpCard({
  entry, onReview, onRetry, T,
}: {
  entry: Extract<Entry, { kind: "bulk_op" }>;
  onReview: () => void;
  onRetry: () => void;
  T: ReturnType<typeof useTheme>["T"];
}) {
  const [hov, setHov] = useState(false);
  return (
    <div
      style={{ display: "flex", flexDirection: "row", alignItems: "flex-start", gap: 6 }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{
          borderRadius: 12, border: `1px solid ${T.border}`,
          background: T.surface, padding: "14px 18px",
          display: "flex", flexDirection: "column", gap: 10,
          minWidth: 260,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{
              display: "inline-flex", alignItems: "center",
              borderRadius: 9999, padding: "2px 8px",
              fontSize: 10, fontWeight: 600,
              background: "#2D2A0F", color: "#FCD34D",
            }}>
              Draft ready
            </span>
            <span style={{ fontSize: 12, color: T.muted }}>Awaiting review</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
              <span style={{ color: T.muted }}>Team</span>
              <span style={{ color: T.text, fontWeight: 500 }}>{entry.targetGroup}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
              <span style={{ color: T.muted }}>Operation</span>
              <span style={{ color: T.text, fontWeight: 500 }}>
                {entry.intent === "bulk_update_card_limit" && entry.newLimit
                  ? `Set limit → ${entry.newLimit.currency} ${entry.newLimit.amount.toLocaleString()}`
                  : "Freeze cards"}
              </span>
            </div>
            {entry.intent === "bulk_freeze_cards" && entry.reason && (
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                <span style={{ color: T.muted }}>Reason</span>
                <span style={{ color: T.text, fontWeight: 500 }}>{entry.reason}</span>
              </div>
            )}
            {entry.notifyCardholders && (
              <div style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>
                Cardholders will be notified
              </div>
            )}
          </div>
          <button
            onClick={onReview}
            style={{
              borderRadius: 8, border: "none",
              background: T.accent, color: T.onAccent,
              padding: "7px 14px", fontSize: 13, fontWeight: 600,
              fontFamily: T.fontBody, cursor: "pointer",
              transition: "opacity 0.15s ease",
            }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.opacity = "0.85")}
            onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.opacity = "1")}
          >
            Review plan →
          </button>
        </div>
        {hov && <ThumbsRow responseId={entry.id} kind="bulk_op" T={T} />}
      </div>
      {hov && <IconBtn onClick={onRetry} title="Retry" T={T}><RetryIcon /></IconBtn>}
    </div>
  );
}

// ── JobPreviewCard ────────────────────────────────────────────────────────────
function JobPreviewCard({
  entry, onConfirmed, onDismiss, T,
}: {
  entry: Extract<Entry, { kind: "job_preview" }>;
  onConfirmed: () => void;
  onDismiss: () => void;
  T: ReturnType<typeof useTheme>["T"];
}) {
  const [confirming, setConfirming] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [showAllExclusions, setShowAllExclusions] = useState(false);
  const summary = useQuery(api.queries.getJobStatusSummary, { jobId: entry.jobId });
  const confirmJob = useMutation(api.jobs.confirmJob);

  async function handleConfirm() {
    setConfirming(true);
    try {
      await confirmJob({ jobId: entry.jobId });
      onConfirmed();
    } catch (err) {
      toast.error("Failed to confirm", {
        description: err instanceof Error ? err.message : "Please try again.",
      });
      setConfirming(false);
    }
  }

  if (!summary) return <LoadingBubble T={T} />;

  const isBlocked = confirming || (summary.approvalRequired && !acknowledged);
  const excluded = summary.excludedCards;
  const shownExclusions = showAllExclusions ? excluded : excluded.slice(0, 3);

  return (
    <div style={{
      borderRadius: 12, border: `1px solid ${T.border}`,
      background: T.surface, padding: "16px 20px",
      display: "flex", flexDirection: "column", gap: 12,
      maxWidth: "80%",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: T.textSub }}>Execution plan</span>
        <span style={{ fontSize: 11, color: T.muted }}>Nothing runs until you confirm</span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {[
          { label: "Team", value: summary.targetGroup },
          {
            label: "Operation",
            value:
              summary.operationType === "bulk_update_card_limit" && summary.newLimit
                ? `Set limit → ${summary.newLimit.currency} ${summary.newLimit.amount.toLocaleString()}`
                : "Freeze cards",
          },
          ...(summary.reason ? [{ label: "Reason", value: summary.reason }] : []),
        ].map(({ label, value }) => (
          <div key={label} style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
            <span style={{ color: T.muted }}>{label}</span>
            <span style={{ fontWeight: 500, color: T.text }}>{value}</span>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, borderTop: `1px solid ${T.border}`, paddingTop: 12 }}>
        {[
          { label: "Total", value: summary.totalItems, color: T.text },
          { label: "Eligible", value: summary.eligibleItems, color: T.accent },
          { label: "Excluded", value: summary.totalItems - summary.eligibleItems, color: T.muted },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ textAlign: "center" }}>
            <div style={{ fontSize: 20, fontWeight: 700, color }}>{value}</div>
            <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {summary.approvalRequired && (
        <div style={{ borderRadius: 8, border: "1px solid #78350f", background: "#1c0d00", padding: "10px 14px" }}>
          <p style={{ margin: "0 0 8px", fontSize: 12, color: "#fcd34d" }}>
            <strong>Approval required</strong> — affects more than 25 cards.
          </p>
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", color: "#fcd34d", fontSize: 12 }}>
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
              style={{ width: 13, height: 13, cursor: "pointer", accentColor: "#fcd34d" }}
            />
            I have authority to approve this operation
          </label>
        </div>
      )}

      {excluded.length > 0 && (
        <div style={{ borderRadius: 8, border: `1px solid ${T.border}`, padding: "10px 14px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 500, color: T.textSub }}>Excluded ({excluded.length})</span>
            {excluded.length > 3 && (
              <button onClick={() => setShowAllExclusions((v) => !v)} style={{ background: "none", border: "none", fontSize: 11, color: T.muted, cursor: "pointer", padding: 0 }}>
                {showAllExclusions ? "Show less" : `+${excluded.length - 3} more`}
              </button>
            )}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {shownExclusions.map((e) => (
              <div key={e.cardId} style={{ display: "flex", gap: 8, fontSize: 12 }}>
                <span style={{ fontFamily: T.fontMono, color: T.muted }}>{e.cardId}</span>
                <span style={{ color: T.muted }}>—</span>
                <span style={{ color: T.textSub, textTransform: "capitalize" }}>{e.reason}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={handleConfirm}
          disabled={isBlocked}
          style={{
            flex: 1, borderRadius: 8, border: "none",
            background: isBlocked ? T.elevated : T.accent,
            color: isBlocked ? T.muted : T.onAccent,
            padding: "8px 14px", fontSize: 13, fontWeight: 600,
            fontFamily: T.fontBody,
            cursor: isBlocked ? "not-allowed" : "pointer",
            opacity: confirming ? 0.7 : 1,
            transition: "all 0.15s ease",
          }}
        >
          {confirming ? "Confirming…" : `Confirm — run for ${summary.eligibleItems} cards`}
        </button>
        <button
          onClick={onDismiss}
          disabled={confirming}
          style={{
            borderRadius: 8, border: `1px solid ${T.border}`,
            background: "transparent", color: T.textSub,
            padding: "8px 14px", fontSize: 13,
            fontFamily: T.fontBody, cursor: "pointer",
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── JobProgressCard ───────────────────────────────────────────────────────────
const JOB_STATUS_STYLE: Record<string, { bg: string; color: string }> = {
  draft:                   { bg: "#1E293B", color: "#94A3B8" },
  confirmed:               { bg: "#0C2340", color: "#60A5FA" },
  in_progress:             { bg: "#2D2A0F", color: "#FCD34D" },
  completed:               { bg: "#052E16", color: "#4ADE80" },
  completed_with_failures: { bg: "#431407", color: "#FB923C" },
  cancelled:               { bg: "#1E293B", color: "#64748B" },
  failed:                  { bg: "#3B0000", color: "#F87171" },
};
const JOB_STATUS_LABELS: Record<string, string> = {
  draft: "Draft", confirmed: "Confirmed", in_progress: "Running",
  completed: "Completed", completed_with_failures: "Completed with failures",
  cancelled: "Cancelled", failed: "Failed",
};

function JobProgressCard({
  entry, T,
}: {
  entry: Extract<Entry, { kind: "job_progress" }>;
  T: ReturnType<typeof useTheme>["T"];
}) {
  const data = useQuery(api.queries.getJobWithItems, { jobId: entry.jobId });
  const retryFailed = useMutation(api.jobs.retryFailed);
  const [retrying, setRetrying] = useState(false);

  if (!data) return <LoadingBubble T={T} />;

  const { job, items } = data;
  const isRunning = job.status === "in_progress" || job.status === "confirmed";
  const isDone = ["completed", "completed_with_failures", "cancelled", "failed"].includes(job.status);
  // skippedCount includes pre-excluded cards; progress and remaining are relative to eligible only
  const progress = job.eligibleItems > 0
    ? Math.round(((job.succeededCount + job.failedCount) / job.eligibleItems) * 100)
    : 0;
  const remaining = Math.max(0, job.eligibleItems - job.succeededCount - job.failedCount - job.cancelledCount);
  const retryableCount = items.filter((i) => i.status === "failed_retryable").length;
  const canRetry = job.status === "completed_with_failures" && retryableCount > 0;

  async function handleRetry() {
    setRetrying(true);
    try {
      await retryFailed({ jobId: entry.jobId });
    } catch {
      // ignore — jobs/[id] page shows detailed errors
    } finally {
      setRetrying(false);
    }
  }
  const statusStyle = JOB_STATUS_STYLE[job.status] ?? JOB_STATUS_STYLE.draft;

  return (
    <div style={{
      borderRadius: 12, border: `1px solid ${T.border}`,
      background: T.surface, padding: "14px 18px",
      display: "flex", flexDirection: "column", gap: 10,
      maxWidth: "80%",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 12, color: T.muted }}>
          {job.normalizedPlan.targetGroup} — {job.normalizedPlan.newLimit.currency} {job.normalizedPlan.newLimit.amount.toLocaleString()}
        </span>
        <span style={{
          display: "inline-flex", alignItems: "center",
          borderRadius: 9999, padding: "2px 8px",
          fontSize: 10, fontWeight: 500,
          background: statusStyle.bg, color: statusStyle.color,
        }}>
          {JOB_STATUS_LABELS[job.status] ?? job.status}
        </span>
      </div>

      {(isRunning || isDone) && (
        <div style={{ height: 4, background: T.elevated, borderRadius: 4, overflow: "hidden" }}>
          <div style={{
            height: "100%", width: `${progress}%`,
            background: job.status === "completed" ? "#4ADE80" : T.accent,
            borderRadius: 4, transition: "width 0.5s ease",
          }} />
        </div>
      )}

      <div style={{ display: "flex", gap: 16 }}>
        {[
          { label: "Succeeded", value: job.succeededCount, color: "#4ADE80" },
          { label: "Failed", value: job.failedCount, color: "#F87171" },
          ...(isRunning
            ? [{ label: "Remaining", value: remaining, color: T.muted }]
            : [{ label: "Skipped", value: job.skippedCount, color: T.muted }]
          ),
        ].map(({ label, value, color }) => (
          <div key={label}>
            <span style={{ fontSize: 16, fontWeight: 700, color }}>{value}</span>
            <span style={{ fontSize: 11, color: T.muted, marginLeft: 5 }}>{label}</span>
          </div>
        ))}
      </div>

      {isDone && (
        <p style={{ fontSize: 12, margin: 0, color: job.status === "completed" ? "#4ADE80" : "#FB923C" }}>
          {job.status === "completed"
            ? `All ${job.succeededCount} cards updated successfully.`
            : `${job.succeededCount} succeeded, ${job.failedCount} failed.`}
        </p>
      )}

      {canRetry && (
        <button
          onClick={handleRetry}
          disabled={retrying}
          style={{
            borderRadius: 7, border: `1px solid #FB923C44`,
            background: "transparent", color: "#FB923C",
            padding: "4px 12px", fontSize: 12,
            fontFamily: "inherit", cursor: retrying ? "not-allowed" : "pointer",
            alignSelf: "flex-start", opacity: retrying ? 0.6 : 1,
            transition: "all 0.15s ease",
          }}
        >
          {retrying ? "Retrying…" : `Retry ${retryableCount} failed card${retryableCount === 1 ? "" : "s"}`}
        </button>
      )}

      <Link href={`/jobs/${entry.jobId}`} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: T.muted, textDecoration: "none", alignSelf: "flex-end" }}>
        View full details →
      </Link>
    </div>
  );
}

// ── UnsupportedBubble ─────────────────────────────────────────────────────────
function UnsupportedBubble({
  entry, onRetry, T,
}: {
  entry: Extract<Entry, { kind: "unsupported" }>;
  onRetry: () => void;
  T: ReturnType<typeof useTheme>["T"];
}) {
  const [hov, setHov] = useState(false);
  return (
    <div
      style={{ display: "flex", flexDirection: "row", alignItems: "center", gap: 6 }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
    >
      <div style={{
        maxWidth: "80%", borderRadius: "12px 12px 12px 4px",
        padding: "10px 14px", fontSize: 13, lineHeight: 1.6,
        background: T.surface, color: T.muted,
        border: `1px solid ${T.border}`,
      }}>
        <span style={{ fontStyle: "italic" }}>{entry.intent}</span> isn&apos;t automated in v1.
        Try: <span style={{ color: T.textSub }}>&quot;Update [team] card limits to SGD [amount]&quot;</span>
      </div>
      {hov && <IconBtn onClick={onRetry} title="Retry" T={T}><RetryIcon /></IconBtn>}
    </div>
  );
}

// ── LoadingBubble ─────────────────────────────────────────────────────────────
function LoadingBubble({ T }: { T: ReturnType<typeof useTheme>["T"] }) {
  return (
    <div style={{ display: "flex", justifyContent: "flex-start" }}>
      <div style={{
        borderRadius: "12px 12px 12px 4px",
        padding: "10px 14px", background: T.surface,
        border: `1px solid ${T.border}`,
        display: "flex", gap: 4, alignItems: "center",
      }}>
        <style>{`@keyframes qa-pulse { 0%,100%{opacity:.3} 50%{opacity:1} }`}</style>
        {[0, 1, 2].map((i) => (
          <div key={i} style={{
            width: 6, height: 6, borderRadius: "50%", background: T.muted,
            animation: `qa-pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
          }} />
        ))}
      </div>
    </div>
  );
}

// ── OpsPage ───────────────────────────────────────────────────────────────────
export default function OpsPage() {
  const { T } = useTheme();
  const [thread, setThread] = useState<Entry[]>([]);
  const [input, setInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const [threadId, setThreadId] = useState<ThreadId | null>(null);
  const createThread = useMutation(api.threads.createThread);
  const appendMessage = useMutation(api.threads.appendMessage);

  const processRequest = useAction(api.interpreter.processRequest);
  const createDraft = useMutation(api.jobs.createDraft);

  function scrollToBottom() {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  }

  // Build conversation history and extract the most recent jobId for context.
  function buildRequestContext(currentThread: Entry[]) {
    const history: Array<{ role: "user" | "assistant"; content: string }> = [];
    let recentJobId: (typeof currentThread[number] & { kind: "job_progress" })["jobId"] | undefined;

    for (const e of currentThread) {
      if (e.kind === "user") {
        history.push({ role: "user", content: e.text });
      } else if (e.kind === "answer") {
        history.push({ role: "assistant", content: e.text });
      } else if (e.kind === "bulk_op") {
        const opDesc =
          e.intent === "bulk_update_card_limit" && e.newLimit
            ? `Update ${e.targetGroup} card limits to ${e.newLimit.currency} ${e.newLimit.amount.toLocaleString()}`
            : `Freeze all ${e.targetGroup} cards`;
        history.push({
          role: "assistant",
          content: `Planned bulk operation: ${opDesc}`,
        });
      } else if (e.kind === "job_progress") {
        recentJobId = e.jobId;
      }
    }

    return { conversationHistory: history.slice(-8), recentJobId };
  }

  // Core processing logic — used by both initial submit and retry.
  // targetPairId: if set, replaces the response for that pair; if null, appends a new pair.
  async function process(userText: string, targetPairId: string | null) {
    const pairId = targetPairId ?? uid();
    const responseId = uid();
    // Capture context before thread update (setThread is async)
    const { conversationHistory, recentJobId } = buildRequestContext(thread);

    // Persist user message — create thread on first message, append on subsequent
    let activeThreadId = threadId;
    if (!activeThreadId) {
      activeThreadId = await createThread({ firstMessage: userText });
      setThreadId(activeThreadId);
    } else if (!targetPairId) {
      await appendMessage({ threadId: activeThreadId, role: "user", content: userText });
    }

    if (targetPairId) {
      setThread((prev) => prev.map((e) =>
        e.pairId === targetPairId && e.kind !== "user"
          ? { id: responseId, pairId, kind: "loading", userText }
          : e
      ));
    } else {
      setThread((prev) => [
        ...prev,
        { id: uid(), pairId, kind: "user", text: userText },
        { id: responseId, pairId, kind: "loading", userText },
      ]);
    }
    scrollToBottom();

    try {
      const result = await processRequest({ rawRequest: userText, conversationHistory, recentJobId });

      if (result.type === "question") {
        setThread((prev) => prev.map((e) =>
          e.id === responseId
            ? { id: responseId, pairId, kind: "answer", text: result.answer, sources: result.sources, userText }
            : e
        ));
        if (activeThreadId) {
          await appendMessage({
            threadId: activeThreadId,
            role: "assistant",
            content: result.answer,
            kind: "answer",
          });
        }
      } else {
        const { intent } = result;

        if (intent.intent !== "bulk_update_card_limit" || !intent.newLimit) {
          setThread((prev) => prev.map((e) =>
            e.id === responseId
              ? { id: responseId, pairId, kind: "unsupported", intent: intent.intent, userText }
              : e
          ));
          if (activeThreadId) {
            await appendMessage({
              threadId: activeThreadId,
              role: "assistant",
              content: `Unsupported intent: ${intent.intent}`,
              kind: "unsupported",
            });
          }
        } else {
          const idempotencyKey = `${intent.targetGroup}:${intent.intent}:${intent.newLimit.currency}${intent.newLimit.amount}:${Date.now()}`;
          const jobId = await createDraft({
            rawRequest: userText,
            intent: {
              targetGroup: intent.targetGroup,
              newLimit: intent.newLimit,
              notifyCardholders: intent.notifyCardholders,
            },
            idempotencyKey,
          });

          setThread((prev) => prev.map((e) =>
            e.id === responseId
              ? {
                  id: responseId, pairId, kind: "bulk_op",
                  jobId, targetGroup: intent.targetGroup,
                  newLimit: intent.newLimit!,
                  notifyCardholders: intent.notifyCardholders,
                  userText,
                }
              : e
          ));
          if (activeThreadId) {
            await appendMessage({
              threadId: activeThreadId,
              role: "assistant",
              content: `Planned bulk operation: ${intent.targetGroup} → ${intent.newLimit.currency} ${intent.newLimit.amount.toLocaleString()}`,
              kind: "bulk_op",
              jobId,
            });
          }
        }
      }
    } catch (err) {
      setThread((prev) => prev.filter((e) => e.id !== responseId));
      toast.error("Something went wrong", {
        description: err instanceof Error ? err.message : "Please try again.",
      });
    } finally {
      scrollToBottom();
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || submitting) return;
    setInput("");
    setSubmitting(true);
    try {
      await process(text, null);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleEditSubmit(pairId: string, newText: string) {
    // Update the stored user message text, then re-process its response.
    setThread((prev) => prev.map((e) =>
      e.pairId === pairId && e.kind === "user" ? { ...e, text: newText } : e
    ));
    if (submitting) return;
    setSubmitting(true);
    try {
      await process(newText, pairId);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRetry(pairId: string, userText: string) {
    if (submitting) return;
    setSubmitting(true);
    try {
      await process(userText, pairId);
    } finally {
      setSubmitting(false);
    }
  }

  function handleReview(jobId: Id<"jobs">, pairId: string) {
    setThread((prev) => [
      ...prev,
      { id: uid(), pairId, kind: "job_preview" as const, jobId },
    ]);
    scrollToBottom();
  }

  function handleConfirmed(previewEntryId: string, jobId: Id<"jobs">, pairId: string) {
    setThread((prev) => prev.map((e) =>
      e.id === previewEntryId
        ? { id: previewEntryId, pairId, kind: "job_progress" as const, jobId }
        : e
    ));
    scrollToBottom();
  }

  const isEmpty = thread.length === 0;

  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: "48px 24px", display: "flex", flexDirection: "column", gap: 0 }}>
      {/* Examples — shown when thread is empty */}
      {isEmpty && (
        <div style={{ marginBottom: 28 }}>
          <p style={{
            fontSize: 11, fontWeight: 500, letterSpacing: "0.06em",
            textTransform: "uppercase", color: T.muted, marginBottom: 10, marginTop: 0,
          }}>
            Try asking
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                onClick={() => setInput(ex)}
                style={{
                  width: "100%", textAlign: "left", fontSize: 13, color: T.textSub,
                  background: T.surface, border: `1px solid ${T.border}`,
                  borderRadius: 10, padding: "10px 16px", cursor: "pointer",
                  fontFamily: T.fontBody, transition: "border-color 0.15s ease, color 0.15s ease",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.borderColor = T.accent;
                  (e.currentTarget as HTMLButtonElement).style.color = T.text;
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.borderColor = T.border;
                  (e.currentTarget as HTMLButtonElement).style.color = T.textSub;
                }}
              >
                {ex}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Thread */}
      {!isEmpty && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
          {thread.map((entry) => {
            if (entry.kind === "user") {
              return (
                <UserBubble
                  key={entry.id}
                  entry={entry}
                  onEditSubmit={(newText) => handleEditSubmit(entry.pairId, newText)}
                  T={T}
                />
              );
            }
            if (entry.kind === "answer") {
              return (
                <AnswerBubble
                  key={entry.id}
                  entry={entry}
                  onRetry={() => handleRetry(entry.pairId, entry.userText)}
                  T={T}
                />
              );
            }
            if (entry.kind === "bulk_op") {
              return (
                <BulkOpCard
                  key={entry.id}
                  entry={entry}
                  onReview={() => handleReview(entry.jobId, entry.pairId)}
                  onRetry={() => handleRetry(entry.pairId, entry.userText)}
                  T={T}
                />
              );
            }
            if (entry.kind === "job_preview") {
              return (
                <JobPreviewCard
                  key={entry.id}
                  entry={entry}
                  onConfirmed={() => handleConfirmed(entry.id, entry.jobId, entry.pairId)}
                  onDismiss={() => setThread((prev) => prev.filter((e) => e.id !== entry.id))}
                  T={T}
                />
              );
            }
            if (entry.kind === "job_progress") {
              return <JobProgressCard key={entry.id} entry={entry} T={T} />;
            }
            if (entry.kind === "unsupported") {
              return (
                <UnsupportedBubble
                  key={entry.id}
                  entry={entry}
                  onRetry={() => handleRetry(entry.pairId, entry.userText)}
                  T={T}
                />
              );
            }
            if (entry.kind === "loading") {
              return <LoadingBubble key={entry.id} T={T} />;
            }
          })}
          <div ref={bottomRef} />
        </div>
      )}

      {/* Input */}
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(e as unknown as React.FormEvent); }
          }}
          placeholder="Ask a policy question or describe a bulk operation…"
          rows={3}
          disabled={submitting}
          style={{
            width: "100%", borderRadius: 10,
            border: `1px solid ${T.border}`, background: T.surface,
            color: T.text, padding: "12px 16px", fontSize: 14,
            fontFamily: T.fontBody, resize: "none", outline: "none",
            boxSizing: "border-box", transition: "border-color 0.15s ease",
          }}
          onFocus={(e) => (e.target.style.borderColor = T.accent)}
          onBlur={(e) => (e.target.style.borderColor = T.border)}
        />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          {!isEmpty && (
            <button
              type="button"
              onClick={() => { setThread([]); setThreadId(null); }}
              style={{
                background: "transparent", border: "none",
                fontSize: 12, color: T.muted, cursor: "pointer",
                padding: 0, fontFamily: T.fontBody,
              }}
            >
              New thread
            </button>
          )}
          <div style={{ flex: 1 }} />
          <button
            type="submit"
            disabled={submitting || !input.trim()}
            style={{
              borderRadius: 10, border: "none",
              background: submitting || !input.trim() ? T.elevated : T.accent,
              color: submitting || !input.trim() ? T.muted : T.onAccent,
              padding: "10px 20px", fontSize: 14, fontWeight: 600,
              fontFamily: T.fontBody,
              cursor: submitting || !input.trim() ? "not-allowed" : "pointer",
              transition: "all 0.15s ease",
            }}
          >
            {submitting ? "Thinking…" : "Send"}
          </button>
        </div>
      </form>
      {!isEmpty && (
        <p style={{ marginTop: 8, fontSize: 11, color: T.muted }}>
          Enter ↵ to send · Shift+Enter for new line
        </p>
      )}
    </main>
  );
}
