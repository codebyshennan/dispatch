"use client";
import { useState } from "react";
import { useAction, useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { api } from "../../convex/_generated/api";
import { useTheme } from "./theme";

const EXAMPLE_REQUESTS = [
  "Update the spending limits for all Marketing team cards to SGD 2,000 and notify the cardholders once done.",
  "Please freeze all cards for the Marketing team.",
  "Increase card limits for Marketing to SGD 1,500.",
];

export default function OpsPage() {
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
    <main style={{ maxWidth: 640, margin: "0 auto", padding: "64px 24px" }}>
      <div style={{ marginBottom: 40 }}>
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
          Describe a bulk operation in plain English. The system will interpret it, validate it
          against policy, and show you a safe execution plan before anything runs.
        </p>
      </div>

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

      <div style={{ marginTop: 40 }}>
        <p
          style={{
            fontSize: 11,
            fontWeight: 500,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: T.muted,
            marginBottom: 10,
          }}
        >
          Example requests
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {EXAMPLE_REQUESTS.map((req) => (
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
    </main>
  );
}
