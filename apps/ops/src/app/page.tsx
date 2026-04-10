"use client";
import { useState } from "react";
import { useAction, useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { api } from "../../convex/_generated/api";

const EXAMPLE_REQUESTS = [
  "Update the spending limits for all Marketing team cards to SGD 2,000 and notify the cardholders once done.",
  "Please freeze all cards for the Marketing team.",
  "Increase card limits for Marketing to SGD 1,500.",
];

export default function OpsPage() {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const interpretIntent = useAction(api.interpreter.interpretIntent);
  const createDraft = useMutation(api.jobs.createDraft);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const intent = await interpretIntent({ rawRequest: input });

      // Only bulk_update_card_limit is implemented in v1
      if (intent.intent !== "bulk_update_card_limit" || !intent.newLimit) {
        setError(
          `"${intent.intent}" is not supported in v1. Try: "Update Marketing team card limits to SGD 2,000"`
        );
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
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="max-w-2xl mx-auto px-4 py-16">
      <div className="mb-10">
        <h1 className="text-2xl font-semibold text-gray-900">CX Operations Assistant</h1>
        <p className="mt-1 text-sm text-gray-500">
          Describe a bulk operation in plain English. The system will interpret it,
          validate it against policy, and show you a safe execution plan before anything runs.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="e.g. Update the spending limits for all Marketing team cards to SGD 2,000 and notify the cardholders."
          rows={4}
          className="w-full rounded-lg border border-gray-300 px-4 py-3 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
          disabled={loading}
        />

        {error && (
          <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? "Interpreting request…" : "Create execution plan →"}
        </button>
      </form>

      <div className="mt-10">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-400 mb-3">
          Example requests
        </p>
        <div className="space-y-2">
          {EXAMPLE_REQUESTS.map((req) => (
            <button
              key={req}
              onClick={() => setInput(req)}
              className="w-full text-left text-sm text-gray-600 bg-white border border-gray-200 rounded-lg px-4 py-2.5 hover:border-blue-300 hover:text-blue-700 transition-colors"
            >
              {req}
            </button>
          ))}
        </div>
      </div>
    </main>
  );
}
