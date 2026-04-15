"use client";
import { useTheme } from "../theme";

// ── shared primitives ────────────────────────────────────────────────────────

function SectionHeading({ num, title, sub, T }: {
  num: number;
  title: string;
  sub: string;
  T: ReturnType<typeof useTheme>["T"];
}) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
        <span style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          width: 26, height: 26, borderRadius: "50%",
          background: T.accent, color: T.bg,
          fontFamily: T.fontMono, fontWeight: 700, fontSize: 12, flexShrink: 0,
        }}>
          {num}
        </span>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: T.text, margin: 0 }}>{title}</h2>
      </div>
      <p style={{ fontSize: 13, color: T.muted, margin: 0, paddingLeft: 36 }}>{sub}</p>
    </div>
  );
}

function Card({ title, children, T }: {
  title: string;
  children: React.ReactNode;
  T: ReturnType<typeof useTheme>["T"];
}) {
  return (
    <div style={{
      borderRadius: 10,
      border: `1px solid ${T.border}`,
      background: T.surface,
      padding: "14px 16px",
    }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: T.accent, marginBottom: 6, fontFamily: T.fontMono }}>
        {title}
      </div>
      <div style={{ fontSize: 13, color: T.textSub, lineHeight: 1.6 }}>
        {children}
      </div>
    </div>
  );
}

function SubHeading({ children, T }: { children: React.ReactNode; T: ReturnType<typeof useTheme>["T"] }) {
  return (
    <h3 style={{ fontSize: 14, fontWeight: 700, color: T.text, margin: "24px 0 10px", fontFamily: T.fontMono }}>
      {children}
    </h3>
  );
}

function Note({ children, T, variant = "info" }: {
  children: React.ReactNode;
  T: ReturnType<typeof useTheme>["T"];
  variant?: "info" | "warn" | "ok";
}) {
  const colors = { info: T.accent, warn: "#F59E0B", ok: "#22C55E" };
  return (
    <div style={{
      borderLeft: `3px solid ${colors[variant]}`,
      background: T.elevated,
      borderRadius: "0 8px 8px 0",
      padding: "10px 14px",
      fontSize: 12,
      color: T.textSub,
      margin: "12px 0",
      lineHeight: 1.6,
    }}>
      {children}
    </div>
  );
}

function CodeBlock({ children, T }: { children: string; T: ReturnType<typeof useTheme>["T"] }) {
  return (
    <pre style={{
      background: T.bg,
      border: `1px solid ${T.border}`,
      borderRadius: 8,
      padding: "12px 14px",
      fontFamily: T.fontMono,
      fontSize: 12,
      color: T.textSub,
      overflowX: "auto",
      lineHeight: 1.6,
      margin: "10px 0",
    }}>
      <code>{children}</code>
    </pre>
  );
}

function Table({ headers, rows, T }: {
  headers: string[];
  rows: (string | React.ReactNode)[][];
  T: ReturnType<typeof useTheme>["T"];
}) {
  return (
    <div style={{ borderRadius: 10, border: `1px solid ${T.border}`, overflow: "hidden", margin: "12px 0", fontSize: 12 }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th key={i} style={{
                background: T.elevated, border: `1px solid ${T.border}`,
                padding: "7px 12px", textAlign: "left",
                fontWeight: 700, color: T.textSub,
                fontFamily: T.fontMono, fontSize: 11,
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri}>
              {row.map((cell, ci) => (
                <td key={ci} style={{
                  border: `1px solid ${T.border}`,
                  padding: "7px 12px",
                  color: T.textSub,
                  background: ri % 2 === 1 ? T.elevated : "transparent",
                }}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── flow diagram ─────────────────────────────────────────────────────────────

function FlowStep({ label, sub, variant, T }: {
  label: string;
  sub: string;
  variant?: "accent" | "default";
  T: ReturnType<typeof useTheme>["T"];
}) {
  const isAccent = variant === "accent";
  return (
    <div style={{
      flex: 1,
      border: `1.5px solid ${isAccent ? T.accent : T.border}`,
      borderRadius: 8,
      padding: "10px 12px",
      textAlign: "center",
      background: isAccent ? `${T.accent}14` : T.surface,
      minWidth: 110,
    }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: isAccent ? T.accent : T.text, marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 11, color: T.muted }}>{sub}</div>
    </div>
  );
}

function Flow({ steps, T }: {
  steps: { label: string; sub: string; variant?: "accent" | "default" }[];
  T: ReturnType<typeof useTheme>["T"];
}) {
  return (
    <div style={{ display: "flex", alignItems: "stretch", gap: 0, overflowX: "auto", padding: "4px 0 12px", marginBottom: 16 }}>
      {steps.map((s, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", flex: 1 }}>
          <FlowStep {...s} T={T} />
          {i < steps.length - 1 && (
            <div style={{ padding: "0 6px", color: T.muted, fontSize: 16, flexShrink: 0 }}>→</div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── page ─────────────────────────────────────────────────────────────────────

export default function HowItWorksPage() {
  const { T } = useTheme();
  const mono = (s: string) => (
    <code style={{ fontFamily: T.fontMono, fontSize: 12, color: T.accent }}>{s}</code>
  );
  const divider = <div style={{ height: 1, background: T.border, margin: "40px 0" }} />;

  return (
    <main style={{ maxWidth: 760, margin: "0 auto", padding: "48px 24px 80px" }}>
      <div style={{ marginBottom: 40 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: T.text, margin: 0, fontFamily: T.fontMono }}>
          How Dispatch works
        </h1>
        <p style={{ fontSize: 13, color: T.muted, marginTop: 6 }}>
          Implementation details — data capture, inference pipeline, and exception handling.
        </p>
      </div>

      {/* ── 1. Data capture ── */}
      <section>
        <SectionHeading num={1} title="Data capture" sub="How user requests become structured job records." T={T} />

        <Flow steps={[
          { label: "Chat input", sub: "rawRequest string", variant: "default" },
          { label: "processRequest", sub: "Convex action", variant: "accent" },
          { label: "gpt-5.4-mini", sub: "via OpenRouter", variant: "default" },
          { label: "createDraft", sub: "Convex mutation", variant: "accent" },
          { label: "jobs table", sub: "draft status", variant: "default" },
        ]} T={T} />

        <p style={{ fontSize: 13, color: T.textSub, marginBottom: 12, lineHeight: 1.6 }}>
          The user types a natural language request. The frontend calls {mono("processRequest")} — a Convex action — passing the raw string and the full conversation history. The action calls OpenRouter (gpt-5.4-mini) and returns one of two discriminated types:
        </p>

        <CodeBlock T={T}>{`// Discriminated union returned by processRequest
{ type: "question", answer: string, sources: PolicySource[] }
// or
{ type: "bulk_op", intent: BulkJobIntent }`}</CodeBlock>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10, margin: "16px 0" }}>
          <Card title="question path" T={T}>
            The answer and KB sources are rendered inline in the chat thread. No job is created. Thumbs up/down feedback is captured via the {mono("feedback")} table using a stable {mono("responseId")}.
          </Card>
          <Card title="bulk_op path" T={T}>
            The {mono("intent")} (targetGroup, newLimit, notifyCardholders) is passed to {mono("createDraft")}. A job record is written with status {mono('"draft"')}, policy output, and excluded cards. No cards are touched yet.
          </Card>
          <Card title="Idempotency" T={T}>
            Before inserting, {mono("createDraft")} queries the {mono("by_idempotency_key")} index. If a job with the same key already exists, it returns the existing ID rather than creating a duplicate. The key is a hash of actor + operation + target group + limit.
          </Card>
          <Card title="Conversation context" T={T}>
            {mono("processRequest")} accepts {mono("conversationHistory")} (prior turns) and {mono("recentJobId")}. If a job ID is provided, its result summary is appended to the system prompt so the model can answer follow-up questions like "how did that job go?".
          </Card>
        </div>

        <SubHeading T={T}>KB grounding</SubHeading>
        <p style={{ fontSize: 13, color: T.textSub, marginBottom: 8, lineHeight: 1.6 }}>
          Before calling the LLM, {mono("processRequest")} runs a semantic KB search against {mono("searchKB")}. The query is embedded with OpenAI {mono("text-embedding-3-small")} (1536-dim, via OpenRouter), then Convex vector search finds the top-4 most similar articles. Their titles and body excerpts are injected into the system prompt as grounding context.
        </p>
        <Note T={T}>
          If the KB hasn't been seeded yet, {mono("searchKB")} throws and the error is silently caught — the LLM call proceeds without KB context rather than failing the whole request.
        </Note>

        <SubHeading T={T}>KB seed</SubHeading>
        <p style={{ fontSize: 13, color: T.textSub, lineHeight: 1.6 }}>
          Articles come from {mono("datasets/reap-help-center.jsonl")}. The seed script reads them in batches of 20, embeds each {mono("title + body")} string (truncated to 8000 chars), and writes {mono("kb_articles")} records with the embedding vector. The vector index ({mono("by_embedding")}, 1536-dim) is defined in the Convex schema and queried at runtime.
        </p>
      </section>

      {divider}

      {/* ── 2. Inference ── */}
      <section>
        <SectionHeading num={2} title="Inference" sub="How the LLM classifies intent and the policy engine validates it." T={T} />

        <SubHeading T={T}>Intent classification</SubHeading>
        <p style={{ fontSize: 13, color: T.textSub, marginBottom: 8, lineHeight: 1.6 }}>
          {mono("processRequest")} sends the user message to {mono("gpt-5.4-mini")} via OpenRouter with temperature 0. The system prompt instructs the model to respond with JSON only — no markdown, no prose. The model returns one of two shapes:
        </p>
        <CodeBlock T={T}>{`// Question (policy Q&A)
{ "type": "question", "answer": "...", "sources": [{ "id": "42", "title": "...", "snippet": "..." }] }

// Bulk operation request
{ "type": "bulk_op", "intent": {
  "intent": "bulk_update_card_limit",
  "targetGroup": "Marketing",
  "targetCountEstimate": 12,
  "newLimit": { "currency": "SGD", "amount": 2000 },
  "notifyCardholders": true
} }`}</CodeBlock>

        <p style={{ fontSize: 13, color: T.textSub, marginBottom: 8, lineHeight: 1.6 }}>
          The raw response string is cleaned (markdown fences stripped), JSON-parsed, then validated with Zod ({mono("ProcessResultSchema")} — a discriminated union). An unsupported intent type surfaces an {mono('"unsupported"')} entry in the chat thread rather than throwing.
        </p>

        <SubHeading T={T}>Policy engine</SubHeading>
        <p style={{ fontSize: 13, color: T.textSub, marginBottom: 8, lineHeight: 1.6 }}>
          Once intent is confirmed as {mono("bulk_op")}, {mono("createDraft")} runs {mono("checkPolicy")} inline before writing any records. Policy runs synchronously inside the Convex mutation:
        </p>
        <Table
          headers={["Rule", "Behaviour", "Threshold"]}
          rows={[
            [mono("MAX_LIMIT_SGD"), "Hard block — job not created", "SGD 5,000"],
            [mono("MAX_BULK_ITEMS"), "Hard block — job not created", "200 eligible cards"],
            [mono("EXCLUDED_STATUSES"), "Cards silently excluded from job", "frozen, cancelled"],
            [mono("APPROVAL_THRESHOLD_ITEMS"), "Job created but approval flagged", "> 25 eligible cards"],
          ]}
          T={T}
        />
        <p style={{ fontSize: 13, color: T.textSub, lineHeight: 1.6 }}>
          Hard blocks throw inside the mutation, which surfaces as an error bubble in the chat. Soft gates (approval required) allow the job to proceed to draft status with {mono("approvalRequired: true")} set on the record — the UI renders an approval warning before the confirm button.
        </p>

        <SubHeading T={T}>Draft → confirm → fan-out</SubHeading>
        <Flow steps={[
          { label: "createDraft", sub: "status: draft", variant: "accent" },
          { label: "User confirms", sub: "UI confirm button", variant: "default" },
          { label: "confirmJob", sub: "Convex mutation", variant: "accent" },
          { label: "job_items created", sub: "one per eligible card", variant: "default" },
          { label: "ctx.scheduler", sub: "staggered fan-out", variant: "accent" },
        ]} T={T} />
        <p style={{ fontSize: 13, color: T.textSub, lineHeight: 1.6 }}>
          {mono("confirmJob")} transitions the job to {mono('"in_progress"')}, inserts a {mono("job_items")} record for every card (excluded cards are inserted as {mono('"skipped"')} immediately), then calls {mono("ctx.scheduler.runAfter")} for each eligible item with a random stagger (500–3500ms) to simulate realistic async fan-out. The frontend subscribes to the job via {mono("useQuery")} and renders live progress as items complete.
        </p>
      </section>

      {divider}

      {/* ── 3. Exception handling ── */}
      <section>
        <SectionHeading num={3} title="Exception handling" sub="Retries, permanent failures, and graceful degradation across all layers." T={T} />

        <SubHeading T={T}>Card executor — per-item retry</SubHeading>
        <p style={{ fontSize: 13, color: T.textSub, marginBottom: 8, lineHeight: 1.6 }}>
          {mono("executeItem")} is a Convex internalAction. Each invocation simulates a card API call, determines the outcome, and either marks the item terminal or re-schedules itself with exponential backoff:
        </p>
        <CodeBlock T={T}>{`// executor-logic.ts
export const MAX_RETRIES = 3;

export function backoffMs(retryCount: number): number {
  return Math.pow(2, retryCount) * 1000;  // 2s, 4s, 8s
}

export function isRetryExhausted(retryCount: number): boolean {
  return retryCount >= MAX_RETRIES;
}`}</CodeBlock>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10, margin: "16px 0" }}>
          <Card title="Retryable failure" T={T}>
            Outcome {mono('"failed_retryable"')} (e.g. {mono("UPSTREAM_TIMEOUT")}). The item is re-scheduled via {mono("ctx.scheduler.runAfter(backoffMs(retryCount), ...)")}. After {mono("MAX_RETRIES")} (3) attempts it is promoted to permanent.
          </Card>
          <Card title="Permanent failure" T={T}>
            Outcome {mono('"failed_permanent"')} — either the mock API returns {mono("CARD_LOCKED")} (compliance-locked card IDs containing 019, 033, 047) or retry count is exhausted. No further scheduling.
          </Card>
          <Card title="Idempotent re-entry" T={T}>
            {mono("executeItem")} checks the item status on entry. If it's already terminal ({mono("succeeded")}, {mono("failed_permanent")}, {mono("cancelled")}), it returns immediately. Convex's at-least-once delivery is safe.
          </Card>
          <Card title="Job count sync" T={T}>
            After each terminal outcome, {mono("updateJobCounts")} (internalMutation) patches the parent job's {mono("succeededCount")} / {mono("failedCount")} / {mono("skippedCount")} atomically. When eligible items are fully resolved, the job status transitions to {mono('"completed"')} or {mono('"completed_with_failures"')}.
          </Card>
        </div>

        <SubHeading T={T}>Retry failed items</SubHeading>
        <p style={{ fontSize: 13, color: T.textSub, lineHeight: 1.6 }}>
          {mono("retryFailed")} mutation lets operators re-queue all {mono('"failed_retryable"')} items on a completed-with-failures job. It resets their status to {mono('"queued"')}, clears {mono("failureCode")} / {mono("failureDetail")}, re-opens the job to {mono('"in_progress"')}, and schedules new {mono("executeItem")} calls with a fresh stagger. {mono('"failed_permanent"')} items are intentionally excluded — they cannot be retried.
        </p>

        <SubHeading T={T}>LLM error handling</SubHeading>
        <p style={{ fontSize: 13, color: T.textSub, marginBottom: 8, lineHeight: 1.6 }}>
          {mono("processRequest")} handles three distinct failure modes before surfacing an error to the frontend:
        </p>
        <Table
          headers={["Failure", "Detection", "Behaviour"]}
          rows={[
            ["Empty / refused response", mono("choice?.message?.content") + " is falsy", "Throws with finish_reason or refusal text"],
            ["Malformed JSON", mono("JSON.parse") + " throws", "Throws with first 120 chars of raw content"],
            ["Schema mismatch", mono("ProcessResultSchema.parse") + " throws", "Zod error propagates to frontend"],
          ]}
          T={T}
        />
        <p style={{ fontSize: 13, color: T.textSub, lineHeight: 1.6 }}>
          All three cases surface as error toasts in the UI (via Sonner). The conversation history is not poisoned — the failed turn is discarded and the user can retry.
        </p>

        <SubHeading T={T}>Cancel</SubHeading>
        <p style={{ fontSize: 13, color: T.textSub, lineHeight: 1.6 }}>
          {mono("cancelJob")} finds all {mono('"queued"')} items and marks them {mono('"cancelled"')} before patching the job status. In-flight items ({mono('"in_progress"')}) finish naturally — they check {mono("cancelled")} on entry via the idempotency guard and return early. There is no force-kill of running Convex scheduled functions.
        </p>

        <SubHeading T={T}>Graceful degradation</SubHeading>
        <Note T={T} variant="ok">
          KB unavailability (not seeded, embedding API down) is caught silently inside {mono("processRequest")} — the LLM call proceeds without KB context. Policy failures throw and are surfaced as user-readable error messages. Audit write failures are not applicable here: Convex mutations are transactional, so partial writes cannot occur.
        </Note>
      </section>
    </main>
  );
}
