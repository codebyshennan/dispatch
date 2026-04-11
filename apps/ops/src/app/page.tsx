"use client";
import { useRef, useState } from "react";
import { useAction, useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useTheme } from "./theme";

// ── Examples ─────────────────────────────────────────────────────────────────
const EXAMPLES = [
  "Update the spending limits for all Marketing team cards to SGD 2,000 and notify the cardholders.",
  "Set new card limits for the Engineering team to SGD 3,500.",
  "What's the maximum card limit I can set?",
  "When does a bulk operation require approval?",
  "Can I update limits for frozen cards?",
];

// ── Thread entry types ────────────────────────────────────────────────────────
type Entry =
  | { id: string; kind: "user"; text: string }
  | { id: string; kind: "answer"; text: string }
  | { id: string; kind: "bulk_op"; jobId: Id<"jobs">; targetGroup: string; newLimit: { currency: string; amount: number }; notifyCardholders: boolean }
  | { id: string; kind: "loading" }
  | { id: string; kind: "unsupported"; intent: string };

function uid() {
  return Math.random().toString(36).slice(2);
}

// ── Entry renderers ───────────────────────────────────────────────────────────
function UserBubble({ text, T }: { text: string; T: ReturnType<typeof useTheme>["T"] }) {
  return (
    <div style={{ display: "flex", justifyContent: "flex-end" }}>
      <div style={{
        maxWidth: "80%", borderRadius: "12px 12px 4px 12px",
        padding: "10px 14px", fontSize: 13, lineHeight: 1.6,
        background: T.accent, color: "#0F172A",
        whiteSpace: "pre-wrap",
      }}>
        {text}
      </div>
    </div>
  );
}

function AnswerBubble({ text, T }: { text: string; T: ReturnType<typeof useTheme>["T"] }) {
  return (
    <div style={{ display: "flex", justifyContent: "flex-start" }}>
      <div style={{
        maxWidth: "80%", borderRadius: "12px 12px 12px 4px",
        padding: "10px 14px", fontSize: 13, lineHeight: 1.6,
        background: T.surface, color: T.text,
        border: `1px solid ${T.border}`,
        whiteSpace: "pre-wrap",
      }}>
        {text}
      </div>
    </div>
  );
}

function BulkOpCard({
  entry, T,
}: {
  entry: Extract<Entry, { kind: "bulk_op" }>;
  T: ReturnType<typeof useTheme>["T"];
}) {
  const router = useRouter();
  return (
    <div style={{ display: "flex", justifyContent: "flex-start" }}>
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
            <span style={{ color: T.muted }}>New limit</span>
            <span style={{ color: T.text, fontWeight: 500 }}>
              {entry.newLimit.currency} {entry.newLimit.amount.toLocaleString()}
            </span>
          </div>
          {entry.notifyCardholders && (
            <div style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>
              Cardholders will be notified
            </div>
          )}
        </div>
        <button
          onClick={() => router.push(`/preview/${entry.jobId}`)}
          style={{
            borderRadius: 8, border: "none",
            background: T.accent, color: "#0F172A",
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
    </div>
  );
}

function UnsupportedBubble({ intent, T }: { intent: string; T: ReturnType<typeof useTheme>["T"] }) {
  return (
    <div style={{ display: "flex", justifyContent: "flex-start" }}>
      <div style={{
        maxWidth: "80%", borderRadius: "12px 12px 12px 4px",
        padding: "10px 14px", fontSize: 13, lineHeight: 1.6,
        background: T.surface, color: T.muted,
        border: `1px solid ${T.border}`,
      }}>
        <span style={{ fontStyle: "italic" }}>{intent}</span> isn&apos;t automated in v1.
        Try: <span style={{ color: T.textSub }}>&quot;Update [team] card limits to SGD [amount]&quot;</span>
      </div>
    </div>
  );
}

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

  const processRequest = useAction(api.interpreter.processRequest);
  const createDraft = useMutation(api.jobs.createDraft);

  function scrollToBottom() {
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || submitting) return;

    setInput("");
    setSubmitting(true);

    const userEntryId = uid();
    const loadingId = uid();

    setThread((prev) => [
      ...prev,
      { id: userEntryId, kind: "user", text },
      { id: loadingId, kind: "loading" },
    ]);
    scrollToBottom();

    try {
      const result = await processRequest({ rawRequest: text });

      if (result.type === "question") {
        setThread((prev) => prev.map((e) =>
          e.id === loadingId
            ? { id: loadingId, kind: "answer", text: result.answer }
            : e
        ));
      } else {
        // bulk_op
        const { intent } = result;

        if (intent.intent !== "bulk_update_card_limit" || !intent.newLimit) {
          setThread((prev) => prev.map((e) =>
            e.id === loadingId
              ? { id: loadingId, kind: "unsupported", intent: intent.intent }
              : e
          ));
        } else {
          const idempotencyKey = `${intent.targetGroup}:${intent.intent}:${intent.newLimit.currency}${intent.newLimit.amount}:${Date.now()}`;
          const jobId = await createDraft({
            rawRequest: text,
            intent: {
              targetGroup: intent.targetGroup,
              newLimit: intent.newLimit,
              notifyCardholders: intent.notifyCardholders,
            },
            idempotencyKey,
          });

          setThread((prev) => prev.map((e) =>
            e.id === loadingId
              ? {
                  id: loadingId, kind: "bulk_op",
                  jobId, targetGroup: intent.targetGroup,
                  newLimit: intent.newLimit!,
                  notifyCardholders: intent.notifyCardholders,
                }
              : e
          ));
        }
      }
    } catch (err) {
      setThread((prev) => prev.filter((e) => e.id !== loadingId));
      toast.error("Something went wrong", {
        description: err instanceof Error ? err.message : "Please try again.",
      });
    } finally {
      setSubmitting(false);
      scrollToBottom();
    }
  }

  const isEmpty = thread.length === 0;

  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: "48px 24px", display: "flex", flexDirection: "column", gap: 0 }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600, color: T.text, margin: 0, fontFamily: T.fontMono }}>
          CX Operations Assistant
        </h1>
        <p style={{ marginTop: 6, fontSize: 13, color: T.muted, lineHeight: 1.6 }}>
          Ask about card policies or describe a bulk operation — the system will answer inline or build an execution plan.
        </p>
      </div>

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
            if (entry.kind === "user") return <UserBubble key={entry.id} text={entry.text} T={T} />;
            if (entry.kind === "answer") return <AnswerBubble key={entry.id} text={entry.text} T={T} />;
            if (entry.kind === "bulk_op") return <BulkOpCard key={entry.id} entry={entry} T={T} />;
            if (entry.kind === "unsupported") return <UnsupportedBubble key={entry.id} intent={entry.intent} T={T} />;
            if (entry.kind === "loading") return <LoadingBubble key={entry.id} T={T} />;
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
              onClick={() => setThread([])}
              style={{
                background: "transparent", border: "none",
                fontSize: 12, color: T.muted, cursor: "pointer",
                padding: 0, fontFamily: T.fontBody,
              }}
            >
              Clear thread
            </button>
          )}
          <div style={{ flex: 1 }} />
          <button
            type="submit"
            disabled={submitting || !input.trim()}
            style={{
              borderRadius: 10, border: "none",
              background: submitting || !input.trim() ? T.elevated : T.accent,
              color: submitting || !input.trim() ? T.muted : "#0F172A",
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
