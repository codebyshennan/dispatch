"use client";
import { useQuery, useMutation } from "convex/react";
import { useRouter, useParams } from "next/navigation";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { useTheme } from "../../theme";

export default function PreviewPage() {
  const { T } = useTheme();
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const summary = useQuery(api.queries.getJobStatusSummary, {
    jobId: id as Id<"jobs">,
  });

  const confirmJob = useMutation(api.jobs.confirmJob);
  const cancelJob = useMutation(api.jobs.cancelJob);

  if (summary === undefined) return <LoadingShell />;
  if (summary === null) return <ErrorShell message="Job not found" />;

  async function handleConfirm() {
    await confirmJob({ jobId: id as Id<"jobs"> });
    router.push(`/jobs/${id}`);
  }

  async function handleCancel() {
    await cancelJob({ jobId: id as Id<"jobs"> });
    router.push("/");
  }

  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: "48px 24px" }}>
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
        <Row label="Operation" value="Bulk card spending-limit update" T={T} />
        <div style={{ borderTop: `1px solid ${T.border}`, marginTop: 12, paddingTop: 12 }}>
          <Row label="Target group" value={summary.targetGroup} T={T} />
        </div>
        <div style={{ borderTop: `1px solid ${T.border}`, marginTop: 12, paddingTop: 12 }}>
          <Row
            label="New limit"
            value={`${summary.newLimit.currency} ${summary.newLimit.amount.toLocaleString()}`}
            T={T}
          />
        </div>
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
          <strong>Approval required.</strong> This operation affects more than 25 cards. Proceed
          only if you have authority to approve operations at this scale.
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
          style={{
            flex: 1,
            borderRadius: 10,
            border: "none",
            background: T.accent,
            color: "#0F172A",
            padding: "11px 16px",
            fontSize: 14,
            fontWeight: 600,
            fontFamily: T.fontBody,
            cursor: "pointer",
            transition: "opacity 0.15s ease",
          }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.opacity = "0.85")}
          onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.opacity = "1")}
        >
          Confirm — run for {summary.eligibleItems} cards
        </button>
        <button
          onClick={handleCancel}
          style={{
            borderRadius: 10,
            border: `1px solid ${T.border}`,
            background: "transparent",
            color: T.textSub,
            padding: "11px 20px",
            fontSize: 14,
            fontWeight: 500,
            fontFamily: T.fontBody,
            cursor: "pointer",
            transition: "border-color 0.15s ease",
          }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.borderColor = T.muted)}
          onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.borderColor = T.border)}
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
        <div style={{ height: 24, width: 128, borderRadius: 6, background: T.elevated }} />
        <div style={{ height: 180, borderRadius: 12, background: T.elevated }} />
      </div>
      <style>{`@keyframes pulse { 0%,100%{opacity:.6} 50%{opacity:.3} }`}</style>
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
          fontSize: 13,
          color: "#fca5a5",
        }}
      >
        {message}
      </div>
    </main>
  );
}
