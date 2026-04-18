"use client";
export const dynamic = "force-dynamic";
import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { useTheme } from "../../theme";

export default function PreviewPage() {
  const { T } = useTheme();
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editAmount, setEditAmount] = useState<string>("");
  const [editReason, setEditReason] = useState<string>("");
  const [rerunning, setRerunning] = useState(false);

  const summary = useQuery(api.queries.getJobStatusSummary, {
    jobId: id as Id<"jobs">,
  });

  const confirmJob = useMutation(api.jobs.confirmJob);
  const createDraft = useMutation(api.jobs.createDraft);
  const discardDraft = useMutation(api.jobs.discardDraft);

  if (summary === undefined) return <LoadingShell />;
  if (summary === null) return <ErrorShell message="Job not found" />;

  async function handleConfirm() {
    setConfirming(true);
    try {
      await confirmJob({ jobId: id as Id<"jobs"> });
      router.push(`/jobs/${id}`);
    } catch (err) {
      toast.error("Failed to confirm job", {
        description: err instanceof Error ? err.message : "Please try again.",
      });
      setConfirming(false);
    }
  }

  function handleCancel() {
    router.push("/");
  }

  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: "48px 24px" }}>
      {/* Breadcrumb */}
      <div style={{ marginBottom: 24 }}>
        <Link
          href="/"
          style={{ fontSize: 13, color: T.muted, textDecoration: "none" }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLAnchorElement).style.color = T.textSub)}
          onMouseLeave={(e) => ((e.currentTarget as HTMLAnchorElement).style.color = T.muted)}
        >
          ← New job
        </Link>
      </div>

      {/* Status badge + heading */}
      <div style={{ marginBottom: 24 }}>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            borderRadius: 9999,
            padding: "2px 10px",
            fontSize: 11,
            fontWeight: 500,
            background: "#2D2A0F",
            color: "#FCD34D",
          }}
        >
          Awaiting confirmation
        </span>
        <h1
          style={{
            marginTop: 12,
            fontSize: 20,
            fontWeight: 600,
            color: T.text,
            fontFamily: T.fontMono,
          }}
        >
          Execution Plan
        </h1>
        <p style={{ marginTop: 4, fontSize: 13, color: T.muted }}>
          Review the plan below. Nothing runs until you confirm.
        </p>
      </div>

      {/* Operation summary */}
      <div
        style={{
          borderRadius: 12,
          border: `1px solid ${T.border}`,
          background: T.surface,
          padding: "20px 24px",
          marginBottom: 16,
        }}
      >
        <Row
          label="Operation"
          value={
            summary.operationType === "bulk_update_card_limit"
              ? "Bulk card spending-limit update"
              : "Bulk freeze cards"
          }
          T={T}
        />
        <div style={{ borderTop: `1px solid ${T.border}`, marginTop: 12, paddingTop: 12 }}>
          <Row label="Target group" value={summary.targetGroup} T={T} />
        </div>
        {summary.operationType === "bulk_update_card_limit" && summary.newLimit && (
          <div style={{ borderTop: `1px solid ${T.border}`, marginTop: 12, paddingTop: 12 }}>
            <Row
              label="New limit"
              value={`${summary.newLimit.currency} ${summary.newLimit.amount.toLocaleString()}`}
              T={T}
            />
          </div>
        )}
        {summary.operationType === "bulk_freeze_cards" && summary.reason && (
          <div style={{ borderTop: `1px solid ${T.border}`, marginTop: 12, paddingTop: 12 }}>
            <Row label="Reason" value={summary.reason} T={T} />
          </div>
        )}
        <div
          style={{
            borderTop: `1px solid ${T.border}`,
            marginTop: 16,
            paddingTop: 16,
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: 16,
            textAlign: "center",
          }}
        >
          <Stat label="Total cards" value={summary.totalItems} T={T} />
          <Stat label="Eligible" value={summary.eligibleItems} color={T.accent} T={T} />
          <Stat
            label="Excluded"
            value={summary.totalItems - summary.eligibleItems}
            color={T.muted}
            T={T}
          />
        </div>
      </div>

      {/* Approval gate */}
      {summary.approvalRequired && (
        <div
          style={{
            borderRadius: 12,
            border: "1px solid #78350f",
            background: "#1c0d00",
            padding: "14px 18px",
            fontSize: 13,
            color: "#fcd34d",
            marginBottom: 16,
          }}
        >
          <p style={{ margin: "0 0 10px" }}>
            <strong>Approval required.</strong> This operation affects more than 25 cards. Proceed
            only if you have authority to approve operations at this scale.
          </p>
          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", color: "#fcd34d" }}>
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
              style={{ width: 14, height: 14, cursor: "pointer", accentColor: "#fcd34d" }}
            />
            I have authority to approve this operation
          </label>
        </div>
      )}

      {/* Exclusions */}
      {summary.excludedCards.length > 0 && (
        <div
          style={{
            borderRadius: 12,
            border: `1px solid ${T.border}`,
            background: T.surface,
            padding: "16px 20px",
            marginBottom: 16,
          }}
        >
          <h2 style={{ fontSize: 13, fontWeight: 500, color: T.textSub, margin: "0 0 12px" }}>
            Excluded cards ({summary.excludedCards.length})
          </h2>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
            {summary.excludedCards.map((e) => (
              <li key={e.cardId} style={{ fontSize: 13, color: T.textSub, display: "flex", gap: 8 }}>
                <span style={{ fontFamily: T.fontMono, color: T.muted }}>{e.cardId}</span>
                <span style={{ color: T.muted }}>—</span>
                <span style={{ textTransform: "capitalize" }}>{e.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Policy notes */}
      {summary.policyNotes.filter((n) => !n.includes("excluded")).length > 0 && (
        <div
          style={{
            borderRadius: 12,
            border: `1px solid ${T.border}`,
            background: T.surface,
            padding: "16px 20px",
            marginBottom: 16,
          }}
        >
          <h2 style={{ fontSize: 13, fontWeight: 500, color: T.textSub, margin: "0 0 8px" }}>
            Policy notes
          </h2>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 4 }}>
            {summary.policyNotes
              .filter((n) => !n.includes("excluded"))
              .map((note, i) => (
                <li key={i} style={{ fontSize: 13, color: T.textSub }}>
                  {note}
                </li>
              ))}
          </ul>
        </div>
      )}

      {/* Actions */}
      <div style={{ display: "flex", gap: 10 }}>
        <button
          onClick={handleConfirm}
          disabled={confirming || (summary.approvalRequired && !acknowledged)}
          style={{
            flex: 1,
            borderRadius: 10,
            border: "none",
            background: confirming || (summary.approvalRequired && !acknowledged) ? T.elevated : T.accent,
            color: confirming || (summary.approvalRequired && !acknowledged) ? T.muted : T.onAccent,
            padding: "11px 16px",
            fontSize: 14,
            fontWeight: 600,
            fontFamily: T.fontBody,
            cursor: confirming || (summary.approvalRequired && !acknowledged) ? "not-allowed" : "pointer",
            opacity: confirming || (summary.approvalRequired && !acknowledged) ? 0.5 : 1,
            transition: "all 0.15s ease",
          }}
        >
          {confirming ? "Confirming…" : `Confirm — run for ${summary.eligibleItems} cards`}
        </button>
        <button
          onClick={handleCancel}
          disabled={confirming}
          style={{
            borderRadius: 10,
            border: `1px solid ${T.border}`,
            background: "transparent",
            color: T.textSub,
            padding: "11px 20px",
            fontSize: 14,
            fontWeight: 500,
            fontFamily: T.fontBody,
            cursor: confirming ? "not-allowed" : "pointer",
            opacity: confirming ? 0.5 : 1,
            transition: "border-color 0.15s ease",
          }}
          onMouseEnter={(e) => {
            if (!confirming) (e.currentTarget as HTMLButtonElement).style.borderColor = T.muted;
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.borderColor = T.border;
          }}
        >
          Cancel
        </button>
      </div>

      <p style={{ marginTop: 12, fontSize: 11, color: T.muted, textAlign: "center" }}>
        This action will be logged to the audit trail and cannot be rolled back automatically.
      </p>
    </main>
  );
}

function Row({ label, value, T }: { label: string; value: string; T: ReturnType<typeof useTheme>["T"] }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
      <span style={{ color: T.muted }}>{label}</span>
      <span style={{ fontWeight: 500, color: T.text }}>{value}</span>
    </div>
  );
}

function Stat({
  label, value, color, T,
}: {
  label: string;
  value: number;
  color?: string;
  T: ReturnType<typeof useTheme>["T"];
}) {
  return (
    <div>
      <div style={{ fontSize: 24, fontWeight: 700, color: color ?? T.text }}>{value}</div>
      <div style={{ fontSize: 11, color: T.muted, marginTop: 2 }}>{label}</div>
    </div>
  );
}

function LoadingShell() {
  const { T } = useTheme();
  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: "48px 24px" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ height: 16, width: 64, borderRadius: 6, background: T.elevated }} />
        <div style={{ height: 24, width: 128, borderRadius: 6, background: T.elevated }} />
        <div style={{ height: 180, borderRadius: 12, background: T.elevated }} />
      </div>
    </main>
  );
}

function ErrorShell({ message }: { message: string }) {
  const { T } = useTheme();
  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: "48px 24px" }}>
      <div
        style={{
          borderRadius: 12,
          border: "1px solid #7f1d1d",
          background: "#1a0505",
          padding: "24px",
          textAlign: "center",
        }}
      >
        <p style={{ fontSize: 13, color: "#fca5a5", margin: "0 0 12px" }}>{message}</p>
        <Link
          href="/"
          style={{ fontSize: 13, color: T.accent, textDecoration: "none" }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLAnchorElement).style.textDecoration = "underline")}
          onMouseLeave={(e) => ((e.currentTarget as HTMLAnchorElement).style.textDecoration = "none")}
        >
          ← Back to new job
        </Link>
      </div>
    </main>
  );
}
