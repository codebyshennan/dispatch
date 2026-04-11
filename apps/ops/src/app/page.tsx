"use client";
import { useState, useRef, useEffect } from "react";
import { useAction, useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { api } from "../../convex/_generated/api";
import { useTheme } from "./theme";

// ── Bulk operation examples ──────────────────────────────────────────────────
const BULK_EXAMPLES = [
  "Update the spending limits for all Marketing team cards to SGD 2,000 and notify the cardholders once done.",
  "Set new card limits for the Engineering team to SGD 3,500.",
  "Increase card limits for the Finance team to SGD 1,000.",
  "Update Marketing team card limits to SGD 4,500.",
];

// ── Policy Q&A quick questions ───────────────────────────────────────────────
const POLICY_QUICK_QUESTIONS = [
  "What's the maximum card limit I can set?",
  "When does a bulk operation require approval?",
  "Can I update limits for frozen cards?",
  "How many cards can I update in one operation?",
  "What bulk operations are supported?",
];

// ── Types ────────────────────────────────────────────────────────────────────
type Mode = "bulk" | "qa";

interface QaMessage {
  role: "user" | "assistant";
  text: string;
}

// ── PolicyQA component ───────────────────────────────────────────────────────
function PolicyQA() {
  const { T } = useTheme();
  const [messages, setMessages] = useState<QaMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const answerPolicyQuestion = useAction(api.interpreter.answerPolicyQuestion);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function ask(question: string) {
    if (!question.trim() || loading) return;
    const q = question.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", text: q }]);
    setLoading(true);
    try {
      const { answer } = await answerPolicyQuestion({ question: q });
      setMessages((prev) => [...prev, { role: "assistant", text: answer }]);
    } catch (err) {
      toast.error("Failed to get answer", {
        description: err instanceof Error ? err.message : "Please try again.",
      });
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Quick questions */}
      {messages.length === 0 && (
        <div>
          <p
            style={{
              fontSize: 11,
              fontWeight: 500,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: T.muted,
              marginBottom: 10,
              marginTop: 0,
            }}
          >
            Common questions
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {POLICY_QUICK_QUESTIONS.map((q) => (
              <button
                key={q}
                onClick={() => ask(q)}
                style={{
                  width: "100%",
                  textAlign: "left",
                  fontSize: 13,
                  color: T.textSub,
                  background: T.surface,
                  border: `1px solid ${T.border}`,
                  borderRadius: 10,
                  padding: "10px 16px",
                  cursor: "pointer",
                  fontFamily: T.fontBody,
                  transition: "border-color 0.15s ease, color 0.15s ease",
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
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Conversation */}
      {messages.length > 0 && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 12,
            maxHeight: 360,
            overflowY: "auto",
            padding: "4px 0",
          }}
        >
          {messages.map((msg, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                flexDirection: msg.role === "user" ? "row-reverse" : "row",
                gap: 10,
              }}
            >
              <div
                style={{
                  maxWidth: "82%",
                  borderRadius: msg.role === "user" ? "12px 12px 4px 12px" : "12px 12px 12px 4px",
                  padding: "10px 14px",
                  fontSize: 13,
                  lineHeight: 1.6,
                  background: msg.role === "user" ? T.accent : T.surface,
                  color: msg.role === "user" ? "#0F172A" : T.text,
                  border: msg.role === "assistant" ? `1px solid ${T.border}` : "none",
                  whiteSpace: "pre-wrap",
                }}
              >
                {msg.text}
              </div>
            </div>
          ))}
          {loading && (
            <div style={{ display: "flex", gap: 10 }}>
              <div
                style={{
                  borderRadius: "12px 12px 12px 4px",
                  padding: "10px 14px",
                  background: T.surface,
                  border: `1px solid ${T.border}`,
                  display: "flex",
                  gap: 4,
                  alignItems: "center",
                }}
              >
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: T.muted,
                      animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
                    }}
                  />
                ))}
                <style>{`@keyframes pulse { 0%, 100% { opacity: 0.3; } 50% { opacity: 1; } }`}</style>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      )}

      {/* Input */}
      <form
        onSubmit={(e) => { e.preventDefault(); ask(input); }}
        style={{ display: "flex", gap: 8 }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about policies, limits, approvals…"
          disabled={loading}
          style={{
            flex: 1,
            borderRadius: 10,
            border: `1px solid ${T.border}`,
            background: T.surface,
            color: T.text,
            padding: "10px 14px",
            fontSize: 13,
            fontFamily: T.fontBody,
            outline: "none",
            transition: "border-color 0.15s ease",
          }}
          onFocus={(e) => (e.target.style.borderColor = T.accent)}
          onBlur={(e) => (e.target.style.borderColor = T.border)}
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          style={{
            borderRadius: 10,
            border: "none",
            background: loading || !input.trim() ? T.elevated : T.accent,
            color: loading || !input.trim() ? T.muted : "#0F172A",
            padding: "10px 18px",
            fontSize: 13,
            fontWeight: 600,
            fontFamily: T.fontBody,
            cursor: loading || !input.trim() ? "not-allowed" : "pointer",
            transition: "all 0.15s ease",
            flexShrink: 0,
          }}
        >
          Ask
        </button>
      </form>

      {messages.length > 0 && (
        <button
          onClick={() => setMessages([])}
          style={{
            alignSelf: "flex-start",
            background: "transparent",
            border: "none",
            fontSize: 12,
            color: T.muted,
            cursor: "pointer",
            padding: 0,
            fontFamily: T.fontBody,
          }}
        >
          Clear conversation
        </button>
      )}
    </div>
  );
}

// ── BulkOperation component ──────────────────────────────────────────────────
function BulkOperation() {
  const { T } = useTheme();
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const interpretIntent = useAction(api.interpreter.interpretIntent);
  const createDraft = useMutation(api.jobs.createDraft);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim()) return;

    setLoading(true);
    try {
      const intent = await interpretIntent({ rawRequest: input });

      if (intent.intent !== "bulk_update_card_limit" || !intent.newLimit) {
        toast.error(`"${intent.intent}" is not supported in v1`, {
          description: 'Try: "Update Marketing team card limits to SGD 2,000"',
        });
        return;
      }

      const idempotencyKey = `${intent.targetGroup}:${intent.intent}:${intent.newLimit.currency}${intent.newLimit.amount}:${Date.now()}`;

      const jobId = await createDraft({
        rawRequest: input,
        intent: {
          targetGroup: intent.targetGroup,
          newLimit: intent.newLimit,
          notifyCardholders: intent.notifyCardholders,
        },
        idempotencyKey,
      });

      router.push(`/preview/${jobId}`);
    } catch (err) {
      toast.error("Failed to create execution plan", {
        description: err instanceof Error ? err.message : "Something went wrong. Please try again.",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="e.g. Update the spending limits for all Marketing team cards to SGD 2,000 and notify the cardholders."
          rows={4}
          disabled={loading}
          style={{
            width: "100%",
            borderRadius: 10,
            border: `1px solid ${T.border}`,
            background: T.surface,
            color: T.text,
            padding: "12px 16px",
            fontSize: 14,
            fontFamily: T.fontBody,
            resize: "none",
            outline: "none",
            boxSizing: "border-box",
            transition: "border-color 0.15s ease",
          }}
          onFocus={(e) => (e.target.style.borderColor = T.accent)}
          onBlur={(e) => (e.target.style.borderColor = T.border)}
        />

        <button
          type="submit"
          disabled={loading || !input.trim()}
          style={{
            width: "100%",
            borderRadius: 10,
            border: "none",
            background: loading || !input.trim() ? T.elevated : T.accent,
            color: loading || !input.trim() ? T.muted : "#0F172A",
            padding: "11px 16px",
            fontSize: 14,
            fontWeight: 600,
            fontFamily: T.fontBody,
            cursor: loading || !input.trim() ? "not-allowed" : "pointer",
            transition: "all 0.15s ease",
          }}
        >
          {loading ? "Interpreting request…" : "Create execution plan →"}
        </button>
      </form>

      <div style={{ marginTop: 8 }}>
        <p
          style={{
            fontSize: 11,
            fontWeight: 500,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: T.muted,
            marginBottom: 10,
            marginTop: 0,
          }}
        >
          Example requests
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {BULK_EXAMPLES.map((req) => (
            <button
              key={req}
              onClick={() => setInput(req)}
              style={{
                width: "100%",
                textAlign: "left",
                fontSize: 13,
                color: T.textSub,
                background: T.surface,
                border: `1px solid ${T.border}`,
                borderRadius: 10,
                padding: "10px 16px",
                cursor: "pointer",
                fontFamily: T.fontBody,
                transition: "border-color 0.15s ease, color 0.15s ease",
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
              {req}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── OpsPage ──────────────────────────────────────────────────────────────────
export default function OpsPage() {
  const { T } = useTheme();
  const [mode, setMode] = useState<Mode>("bulk");

  const tabs: { id: Mode; label: string; description: string }[] = [
    {
      id: "bulk",
      label: "Bulk Operation",
      description:
        "Describe a bulk operation in plain English. The system will interpret it, validate it against policy, and show you a safe execution plan before anything runs.",
    },
    {
      id: "qa",
      label: "Policy Q&A",
      description:
        "Ask questions about card management policies — limits, approval thresholds, eligible cards, and supported operations.",
    },
  ];

  const activeTab = tabs.find((t) => t.id === mode)!;

  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: "64px 24px" }}>
      <div style={{ marginBottom: 32 }}>
        <h1
          style={{
            fontSize: 22,
            fontWeight: 600,
            color: T.text,
            margin: 0,
            fontFamily: T.fontMono,
          }}
        >
          CX Operations Assistant
        </h1>
        <p style={{ marginTop: 6, fontSize: 13, color: T.muted, lineHeight: 1.6 }}>
          {activeTab.description}
        </p>
      </div>

      {/* Tab switcher */}
      <div
        style={{
          display: "flex",
          borderRadius: 10,
          border: `1px solid ${T.border}`,
          background: T.elevated,
          padding: 4,
          marginBottom: 24,
          gap: 4,
        }}
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setMode(tab.id)}
            style={{
              flex: 1,
              padding: "7px 16px",
              borderRadius: 7,
              border: "none",
              background: mode === tab.id ? T.surface : "transparent",
              color: mode === tab.id ? T.text : T.muted,
              fontSize: 13,
              fontWeight: mode === tab.id ? 600 : 400,
              fontFamily: T.fontBody,
              cursor: "pointer",
              transition: "all 0.15s ease",
              boxShadow: mode === tab.id ? `0 1px 3px rgba(0,0,0,0.15)` : "none",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {mode === "bulk" ? <BulkOperation /> : <PolicyQA />}
    </main>
  );
}
