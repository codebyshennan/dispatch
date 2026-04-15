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
  const colors = {
    info: T.accent,
    warn: "#F59E0B",
    ok:   "#22C55E",
  };
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

function Pill({ children, color, bg }: { children: React.ReactNode; color: string; bg: string }) {
  return (
    <span style={{
      display: "inline-block",
      fontSize: 11, fontWeight: 600, padding: "2px 8px",
      borderRadius: 20, background: bg, color,
    }}>
      {children}
    </span>
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
      <div style={{ fontSize: 12, fontWeight: 700, color: isAccent ? T.accent : T.text, marginBottom: 3 }}>
        {label}
      </div>
      <div style={{ fontSize: 11, color: T.muted }}>{sub}</div>
    </div>
  );
}

function Flow({ steps, T }: {
  steps: { label: string; sub: string; variant?: "accent" | "default" }[];
  T: ReturnType<typeof useTheme>["T"];
}) {
  return (
    <div style={{
      display: "flex", alignItems: "stretch", gap: 0,
      overflowX: "auto", padding: "4px 0 12px", marginBottom: 16,
    }}>
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

// ── table ────────────────────────────────────────────────────────────────────

function Table({ headers, rows, T }: {
  headers: string[];
  rows: string[][];
  T: ReturnType<typeof useTheme>["T"];
}) {
  return (
    <div style={{
      borderRadius: 10,
      border: `1px solid ${T.border}`,
      overflow: "hidden",
      margin: "12px 0",
      fontSize: 12,
    }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th key={i} style={{
                background: T.elevated, border: `1px solid ${T.border}`,
                padding: "7px 12px", textAlign: "left",
                fontWeight: 700, color: T.textSub,
                fontFamily: T.fontMono, fontSize: 11,
              }}>
                {h}
              </th>
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
                }}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── circuit breaker state machine ────────────────────────────────────────────

function StateMachine({ T }: { T: ReturnType<typeof useTheme>["T"] }) {
  const stateStyle = (border: string, bg: string, color: string) => ({
    border: `2px solid ${border}`,
    borderRadius: 50,
    padding: "8px 16px",
    fontWeight: 700,
    fontSize: 12,
    textAlign: "center" as const,
    background: bg,
    color,
    minWidth: 90,
  });
  const arrow = (color: string) => (
    <div style={{ display: "flex", flexDirection: "column" as const, alignItems: "center", padding: "0 8px", minWidth: 80, textAlign: "center" as const }}>
      <div style={{ fontSize: 11, color: T.muted, marginBottom: 2 }}></div>
      <svg width="36" height="14" viewBox="0 0 36 14">
        <path d="M2 7 L34 7" stroke={color} strokeWidth="1.5" />
        <path d="M28 3 L34 7 L28 11" stroke={color} strokeWidth="1.5" fill="none" />
      </svg>
    </div>
  );
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 0, flexWrap: "wrap", margin: "16px 0", padding: "16px", background: T.elevated, borderRadius: 10, border: `1px solid ${T.border}` }}>
      <div>
        <div style={stateStyle("#22C55E", "#14532D22", "#22C55E")}>CLOSED</div>
        <div style={{ fontSize: 10, color: T.muted, textAlign: "center", marginTop: 3 }}>Normal</div>
      </div>
      <div>
        {arrow("#EF4444")}
        <div style={{ fontSize: 10, color: T.muted, textAlign: "center" }}>5 failures / 60s</div>
      </div>
      <div>
        <div style={stateStyle("#EF4444", "#7F1D1D22", "#EF4444")}>OPEN</div>
        <div style={{ fontSize: 10, color: T.muted, textAlign: "center", marginTop: 3 }}>Fail-fast</div>
      </div>
      <div>
        {arrow("#F59E0B")}
        <div style={{ fontSize: 10, color: T.muted, textAlign: "center" }}>60s cooldown</div>
      </div>
      <div>
        <div style={stateStyle("#F59E0B", "#78350F22", "#F59E0B")}>HALF-OPEN</div>
        <div style={{ fontSize: 10, color: T.muted, textAlign: "center", marginTop: 3 }}>Probe</div>
      </div>
      <div>
        {arrow("#22C55E")}
        <div style={{ fontSize: 10, color: T.muted, textAlign: "center" }}>Probe succeeds</div>
      </div>
      <div>
        <div style={stateStyle("#22C55E", "#14532D22", "#22C55E")}>CLOSED</div>
        <div style={{ fontSize: 10, color: T.muted, textAlign: "center", marginTop: 3 }}>Recovered</div>
      </div>
    </div>
  );
}

// ── page ─────────────────────────────────────────────────────────────────────

export default function HowItWorksPage() {
  const { T } = useTheme();
  const divider = <div style={{ height: 1, background: T.border, margin: "40px 0" }} />;

  return (
    <main style={{ maxWidth: 760, margin: "0 auto", padding: "48px 24px 80px" }}>
      {/* Header */}
      <div style={{ marginBottom: 40 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: T.text, margin: 0, fontFamily: T.fontMono }}>
          How Dispatch works
        </h1>
        <p style={{ fontSize: 13, color: T.muted, marginTop: 6 }}>
          AI-powered CX triage for Reap — data capture, inference pipeline, and resilience model.
        </p>
      </div>

      {/* ── 1. Data capture ── */}
      <section>
        <SectionHeading num={1} title="Data capture" sub="How inbound Zendesk tickets reach the processing pipeline." T={T} />

        <Flow steps={[
          { label: "Zendesk", sub: "Trigger on create / update", variant: "default" },
          { label: "Webhook", sub: "POST ticket JSON", variant: "default" },
          { label: "EventBridge", sub: "Custom event bus", variant: "accent" },
          { label: "SQS", sub: "dispatch-{env}-tickets-queue", variant: "accent" },
          { label: "Classifier Lambda", sub: "Step Functions task", variant: "default" },
        ]} T={T} />

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10, marginBottom: 16 }}>
          <Card title="Zendesk trigger" T={T}>
            A Zendesk automation fires on ticket creation. It POSTs the ticket ID, subject, body, requester email, tags, and custom fields to an HTTPS EventBridge endpoint secured with an API key.
          </Card>
          <Card title="EventBridge → SQS" T={T}>
            EventBridge routes ticket events to an SQS queue. The queue decouples ingestion from processing — bursts queue up rather than overwhelming Lambda concurrency limits.
          </Card>
          <Card title="Idempotency" T={T}>
            Each ticket ID is checked against a DynamoDB idempotency table before processing starts. Duplicate webhook deliveries from Zendesk retries are silently dropped, guaranteeing exactly-once processing.
          </Card>
          <Card title="Sidebar telemetry" T={T}>
            When an agent opens the sidebar, a <code style={{ fontFamily: T.fontMono, fontSize: 11 }}>sidebar_viewed</code> event fires via ZAF's <code style={{ fontFamily: T.fontMono, fontSize: 11 }}>client.request()</code> to <code style={{ fontFamily: T.fontMono, fontSize: 11 }}>/telemetry</code>. Non-blocking — failures are swallowed.
          </Card>
        </div>

        <Note T={T}>
          <strong>DynamoDB key pattern for tickets:</strong>{" "}
          <code style={{ fontFamily: T.fontMono }}>pk: TICKET#&lt;ticketId&gt;</code> /{" "}
          <code style={{ fontFamily: T.fontMono }}>sk: CLASSIFICATION#&lt;ISO timestamp&gt;</code> —
          the sidebar API queries this to serve the Intelligence panel.
        </Note>
      </section>

      {divider}

      {/* ── 2. Inference ── */}
      <section>
        <SectionHeading num={2} title="Inference" sub="How tickets are classified and draft responses generated using LLMs." T={T} />

        <Flow steps={[
          { label: "Ticket payload", sub: "subject + body + metadata", variant: "default" },
          { label: "Classifier Lambda", sub: "Loads versioned prompt", variant: "accent" },
          { label: "invoke()", sub: "@dispatch/core", variant: "accent" },
          { label: "Claude Opus 4.5", sub: "Structured output", variant: "default" },
          { label: "Response Generator", sub: "KB grounding + draft", variant: "default" },
        ]} T={T} />

        <SubHeading T={T}>The invoke() function</SubHeading>
        <p style={{ fontSize: 13, color: T.textSub, marginBottom: 12, lineHeight: 1.6 }}>
          All LLM calls go through a single{" "}
          <code style={{ fontFamily: T.fontMono, fontSize: 12 }}>invoke&lt;T&gt;(userContent, options)</code>{" "}
          in <code style={{ fontFamily: T.fontMono, fontSize: 12 }}>@dispatch/core</code>. Provider SDKs are never called directly from Lambda code. The wrapper provides:
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10, marginBottom: 16 }}>
          <Card title="Retry with backoff" T={T}>
            Three attempts maximum. Delays: <strong>1 s → 2 s → 4 s</strong>. Non-retryable errors (auth failures, bad requests) are thrown immediately without burning the retry budget.
          </Card>
          <Card title="Zod schema validation" T={T}>
            Every LLM response is parsed against a typed Zod schema. If parsing fails, the response is repaired and re-parsed before consuming a retry.
          </Card>
          <Card title="JSON repair" T={T}>
            LLMs occasionally wrap JSON in code fences or emit control characters. The repair step strips{" "}
            <code style={{ fontFamily: T.fontMono, fontSize: 11 }}>```json</code> wrappers and sanitises Unicode control chars before Zod sees the string.
          </Card>
          <Card title="Cost estimation" T={T}>
            Each call estimates cost from token counts and appends it to the audit entry (~$0.000003/input, $0.000015/output). Stored in DynamoDB for per-ticket cost attribution.
          </Card>
          <Card title="Provider abstraction" T={T}>
            The <code style={{ fontFamily: T.fontMono, fontSize: 11 }}>provider</code> field selects the backend:{" "}
            <code style={{ fontFamily: T.fontMono, fontSize: 11 }}>'anthropic'</code>,{" "}
            <code style={{ fontFamily: T.fontMono, fontSize: 11 }}>'openrouter'</code>, or{" "}
            <code style={{ fontFamily: T.fontMono, fontSize: 11 }}>'openai'</code>. Switching providers requires no Lambda code change.
          </Card>
          <Card title="Audit log entry" T={T}>
            Every invocation produces an <code style={{ fontFamily: T.fontMono, fontSize: 11 }}>auditEntry</code> with promptHash, provider, model, latency, token counts, and cost. The caller persists it to DynamoDB — audit failures never block the pipeline.
          </Card>
        </div>

        <SubHeading T={T}>Model tiering</SubHeading>
        <Table
          headers={["Task", "Model", "Reason"]}
          rows={[
            ["Classification, response drafts", "claude-opus-4-5", "High-stakes, complex reasoning required"],
            ["Eval runner, intent detection", "claude-haiku-3-5", "High-volume, latency-sensitive"],
            ["Fallback (Anthropic circuit open)", "gpt-4o via OpenRouter", "Provider redundancy"],
          ]}
          T={T}
        />

        <SubHeading T={T}>Classification output</SubHeading>
        <p style={{ fontSize: 13, color: T.textSub, marginBottom: 8, lineHeight: 1.6 }}>
          The classifier returns a structured object validated by <code style={{ fontFamily: T.fontMono, fontSize: 12 }}>ClassificationSchema</code> (Zod):
        </p>
        <CodeBlock T={T}>{`{
  category:             string,       // e.g. "Card Issues"
  sub_category:         string,       // e.g. "Card Declined"
  urgency:              "P1"|"P2"|"P3"|"P4",
  sentiment:            number,       // -1.0 to 1.0
  language:             string,       // BCP-47 code
  confidence:           number,       // 0.0 to 1.0
  compliance_flags:     string[],     // e.g. ["legal action", "refund"]
  crypto_specific_tags: string[]      // e.g. ["kyc", "wallet_issue"]
}`}</CodeBlock>

        <SubHeading T={T}>KB grounding</SubHeading>
        <p style={{ fontSize: 13, color: T.textSub, lineHeight: 1.6 }}>
          After classification, the Response Generator Lambda embeds the ticket using Cohere and queries Aurora pgvector for the top-3 most similar knowledge base articles. These are injected as grounding context before the draft is generated. The sidebar shows each source with its cosine similarity score and an expandable excerpt.
        </p>

        <SubHeading T={T}>A/B prompt variants</SubHeading>
        <p style={{ fontSize: 13, color: T.textSub, lineHeight: 1.6 }}>
          The classifier supports deterministic 80/20 prompt splits. The variant is selected by hashing the{" "}
          <code style={{ fontFamily: T.fontMono, fontSize: 12 }}>ticketId</code> — no randomness — so re-processing a ticket always uses the same variant. This makes evals reproducible. Variant configs live in DynamoDB at{" "}
          <code style={{ fontFamily: T.fontMono, fontSize: 12 }}>pk: SYSTEM#prompt_variant</code>.
        </p>

        <SubHeading T={T}>Compliance guardrails (post-LLM)</SubHeading>
        <p style={{ fontSize: 13, color: T.textSub, marginBottom: 8, lineHeight: 1.6 }}>
          After the LLM returns, a keyword scanner enforces compliance flags regardless of model output. Any match appends to <code style={{ fontFamily: T.fontMono, fontSize: 12 }}>compliance_flags</code> and surfaces a sticky red banner in the Intelligence panel. Keywords scanned:
        </p>
        <CodeBlock T={T}>{`refund · legal action · regulatory complaint · ombudsman
media enquiry · journalist · solicitor · court · sue · lawsuit`}</CodeBlock>

        <SubHeading T={T}>QA scoring</SubHeading>
        <p style={{ fontSize: 13, color: T.textSub, marginBottom: 8, lineHeight: 1.6 }}>
          Every generated response is scored out of 100 using four signals. The final grade —{" "}
          <Pill children="high" color="#166534" bg="#dcfce7" />{" "}
          <Pill children="medium" color="#92400e" bg="#fef3c7" />{" "}
          <Pill children="low" color="#991b1b" bg="#fef2f2" /> — is shown as a pill next to the urgency tag.
        </p>
        <Table
          headers={["Signal", "Max pts", "What it measures"]}
          rows={[
            ["KB Coverage", "40", "Proportion of draft claims backed by a KB article"],
            ["Confidence", "30", "Classifier confidence × 30"],
            ["Compliance Clean", "20", "20 pts if no compliance flags, 0 if any"],
            ["Draft Length", "10", "10 pts if 80–400 chars, scaled otherwise"],
          ]}
          T={T}
        />

        <SubHeading T={T}>Prompt versioning and CI eval gate</SubHeading>
        <p style={{ fontSize: 13, color: T.textSub, lineHeight: 1.6 }}>
          Every prompt lives as a versioned Markdown file in <code style={{ fontFamily: T.fontMono, fontSize: 12 }}>prompts/</code> with YAML frontmatter specifying model, temperature, and token budget. On every PR touching <code style={{ fontFamily: T.fontMono, fontSize: 12 }}>prompts/**</code>, the GitHub Actions eval pipeline runs against <code style={{ fontFamily: T.fontMono, fontSize: 12 }}>datasets/golden/classification-v1.jsonl</code>. Merges are blocked if accuracy drops below <strong style={{ color: T.text }}>85%</strong>.
        </p>
      </section>

      {divider}

      {/* ── 3. Exception handling ── */}
      <section>
        <SectionHeading num={3} title="Exception handling" sub="How failures are contained, retried, and surfaced without blocking the pipeline." T={T} />

        <SubHeading T={T}>Circuit breaker</SubHeading>
        <p style={{ fontSize: 13, color: T.textSub, marginBottom: 8, lineHeight: 1.6 }}>
          A DynamoDB-backed circuit breaker is shared across all Lambda instances, protecting outbound calls to Anthropic, OpenAI, and Zendesk from cascading failures.
        </p>
        <StateMachine T={T} />

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10, margin: "16px 0" }}>
          <Card title="Shared state" T={T}>
            Circuit state is written to DynamoDB at <code style={{ fontFamily: T.fontMono, fontSize: 11 }}>pk: CB#&lt;service&gt;</code>. All Lambda instances share the same view — one Lambda opening the circuit protects all.
          </Card>
          <Card title="Fail-fast" T={T}>
            When OPEN, calls return immediately with a <code style={{ fontFamily: T.fontMono, fontSize: 11 }}>CircuitOpenError</code> — no network round trip. The ticket is re-queued onto the DLQ for retry after the cooldown window.
          </Card>
          <Card title="Provider fallback" T={T}>
            If the Anthropic breaker opens, <code style={{ fontFamily: T.fontMono, fontSize: 11 }}>invoke()</code> automatically retries the same prompt against <code style={{ fontFamily: T.fontMono, fontSize: 11 }}>gpt-4o</code> via OpenRouter before giving up.
          </Card>
        </div>

        <SubHeading T={T}>DispatchLLMError</SubHeading>
        <p style={{ fontSize: 13, color: T.textSub, marginBottom: 8, lineHeight: 1.6 }}>
          When all retry attempts are exhausted, <code style={{ fontFamily: T.fontMono, fontSize: 12 }}>invoke()</code> throws a structured <code style={{ fontFamily: T.fontMono, fontSize: 12 }}>DispatchLLMError</code> containing everything needed to log and diagnose the failure:
        </p>
        <CodeBlock T={T}>{`{
  code:          string,        // e.g. "LLM_VALIDATION_FAILED"
  provider:      string,        // "anthropic" | "openrouter" | "openai"
  model:         string,        // e.g. "claude-opus-4-5"
  promptHash:    string,        // SHA-256 of prompt content
  originalError: Error,         // underlying SDK error
  auditEntry:    AuditLogEntry  // ready to write to DynamoDB
}`}</CodeBlock>
        <p style={{ fontSize: 13, color: T.textSub, lineHeight: 1.6 }}>
          The Lambda catch block writes <code style={{ fontFamily: T.fontMono, fontSize: 12 }}>auditEntry</code> to DynamoDB before re-throwing for Step Functions. Every failure is recorded even when the Lambda itself fails.
        </p>

        <SubHeading T={T}>Retry and dead-letter queue</SubHeading>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10, marginBottom: 16 }}>
          <Card title="SQS → Lambda retries" T={T}>
            <ul style={{ paddingLeft: 16, margin: 0 }}>
              <li>SQS visibility timeout: 5 minutes</li>
              <li>Max receive count: 3 before DLQ</li>
              <li>Each Lambda invocation has its own <code style={{ fontFamily: T.fontMono, fontSize: 11 }}>invoke()</code> retry budget (3 attempts × 4 s backoff) inside the Lambda</li>
            </ul>
          </Card>
          <Card title="Dead-letter queue" T={T}>
            Tickets that exhaust SQS retries move to <code style={{ fontFamily: T.fontMono, fontSize: 11 }}>dispatch-{"{env}"}-tickets-dlq</code>. A CloudWatch alarm fires when DLQ depth exceeds <strong>10 messages</strong>.
          </Card>
          <Card title="Graceful degradation" T={T}>
            Audit log write failures never block the processing pipeline (INFRA-09). The ticket's classification and draft are still returned to the sidebar even if the audit write times out.
          </Card>
        </div>

        <SubHeading T={T}>Audit log access patterns</SubHeading>
        <Table
          headers={["pk", "sk", "Contents"]}
          rows={[
            ["AUDIT#<promptHash>", "<ISO timestamp>", "LLM call: provider, model, tokens, cost, latency"],
            ["TICKET#<ticketId>", "CLASSIFICATION#<ts>", "Classifier output, urgency, compliance flags"],
            ["TICKET#<ticketId>", "SIMILAR#<category>", "Similar resolved ticket references"],
            ["CB#<service>", "—", "Circuit breaker state (CLOSED / OPEN / HALF_OPEN)"],
          ]}
          T={T}
        />

        <Note T={T} variant="ok">
          <strong>Design principle:</strong> every failure surface has a corresponding observability surface. Retries are logged to the audit table. DLQ depth is alarmed. Circuit state is queryable. No failure mode is silent.
        </Note>
      </section>

      {divider}

      {/* ── 4. Component map ── */}
      <section>
        <SectionHeading num={4} title="Component map" sub="What each package in the monorepo is responsible for." T={T} />

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
          <Card title="apps/sidebar" T={T}>
            React 19 + Vite ZAF app. Three Zendesk Garden tabs: <strong>Context</strong> (customer info), <strong>Intelligence</strong> (classification, QA score, draft), <strong>Actions</strong> (runbook triggers).
          </Card>
          <Card title="lambdas/classifier" T={T}>
            Step Functions task handler. Loads the versioned prompt, calls <code style={{ fontFamily: T.fontMono, fontSize: 11 }}>invoke()</code>, enforces compliance keyword guardrails, writes classification to DynamoDB.
          </Card>
          <Card title="lambdas/response-generator" T={T}>
            Step Functions task handler. Embeds ticket with Cohere, queries Aurora pgvector for KB articles, generates draft, scores QA, writes <code style={{ fontFamily: T.fontMono, fontSize: 11 }}>SidebarPayload</code> to DynamoDB.
          </Card>
          <Card title="lambdas/sidebar-api" T={T}>
            Hono router serving the ZAF sidebar. Routes: <code style={{ fontFamily: T.fontMono, fontSize: 11 }}>/context</code>, <code style={{ fontFamily: T.fontMono, fontSize: 11 }}>/feedback</code>, <code style={{ fontFamily: T.fontMono, fontSize: 11 }}>/send</code>, <code style={{ fontFamily: T.fontMono, fontSize: 11 }}>/runbooks</code>, <code style={{ fontFamily: T.fontMono, fontSize: 11 }}>/mode</code>, <code style={{ fontFamily: T.fontMono, fontSize: 11 }}>/telemetry</code>.
          </Card>
          <Card title="packages/core (@dispatch/core)" T={T}>
            Shared by all Lambdas. Exports <code style={{ fontFamily: T.fontMono, fontSize: 11 }}>invoke()</code>, <code style={{ fontFamily: T.fontMono, fontSize: 11 }}>DispatchLLMError</code>, circuit breaker utilities, and all Zod schemas.
          </Card>
          <Card title="infra (AWS CDK)" T={T}>
            Single <code style={{ fontFamily: T.fontMono, fontSize: 11 }}>DispatchStack</code> defines all resources: SQS, EventBridge, Step Functions, Lambda, Aurora v2, DynamoDB. All named <code style={{ fontFamily: T.fontMono, fontSize: 11 }}>dispatch-{"{env}"}-{"{resource}"}</code>.
          </Card>
        </div>

        <Note T={T} variant="warn">
          <strong>Convention:</strong> Never call Anthropic / OpenAI / OpenRouter SDKs directly from Lambda code. All LLM calls must go through <code style={{ fontFamily: T.fontMono }}>@dispatch/core</code>'s <code style={{ fontFamily: T.fontMono }}>invoke()</code> so retries, validation, and audit logging are always applied.
        </Note>
      </section>
    </main>
  );
}
