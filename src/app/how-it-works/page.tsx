"use client";
import React from "react";
import { useTheme } from "../theme";

// ── syntax highlighting ───────────────────────────────────────────────────────

const KEYWORDS = new Set([
  "export", "const", "let", "var", "function", "return", "if", "else",
  "type", "interface", "import", "from", "async", "await", "new", "throw",
  "true", "false", "null", "undefined", "class", "extends", "of", "for",
  "while", "break", "continue", "switch", "case", "default", "try", "catch",
]);

const SYN = {
  keyword: "#8B5CF6",
  string:  "#10B981",
  comment: "#6B7280",
  number:  "#F59E0B",
  punct:   "#94A3B8",
};

type Token = { t: "keyword" | "string" | "comment" | "number" | "punct" | "plain"; v: string };

function tokenizeLine(line: string): Token[] {
  const tokens: Token[] = [];

  // Full-line comment
  const stripped = line.trimStart();
  if (stripped.startsWith("//")) {
    tokens.push({ t: "comment", v: line });
    return tokens;
  }

  let i = 0;
  while (i < line.length) {
    // String literal (double or single quote)
    if (line[i] === '"' || line[i] === "'") {
      const q = line[i];
      let j = i + 1;
      while (j < line.length && line[j] !== q) {
        if (line[j] === "\\") j++;
        j++;
      }
      tokens.push({ t: "string", v: line.slice(i, j + 1) });
      i = j + 1;
      continue;
    }

    // Number
    if (/[0-9]/.test(line[i]) && (i === 0 || !/[a-zA-Z_$]/.test(line[i - 1]))) {
      let j = i;
      while (j < line.length && /[0-9.]/.test(line[j])) j++;
      tokens.push({ t: "number", v: line.slice(i, j) });
      i = j;
      continue;
    }

    // Identifier / keyword
    if (/[a-zA-Z_$]/.test(line[i])) {
      let j = i;
      while (j < line.length && /[a-zA-Z0-9_$]/.test(line[j])) j++;
      const word = line.slice(i, j);
      tokens.push({ t: KEYWORDS.has(word) ? "keyword" : "plain", v: word });
      i = j;
      continue;
    }

    // Punctuation
    if (/[{}()[\]:;,.<>|&=+\-*/%!~^?@]/.test(line[i])) {
      tokens.push({ t: "punct", v: line[i] });
      i++;
      continue;
    }

    // Whitespace / other — accumulate plain runs
    const last = tokens[tokens.length - 1];
    if (last?.t === "plain") {
      last.v += line[i];
    } else {
      tokens.push({ t: "plain", v: line[i] });
    }
    i++;
  }

  return tokens;
}

function CodeBlock({ children, lang, T }: {
  children: string;
  lang?: string;
  T: ReturnType<typeof useTheme>["T"];
}) {
  const lines = children.trimEnd().split("\n");

  const colorFor = (t: Token["t"]): string => {
    if (t === "keyword") return SYN.keyword;
    if (t === "string")  return SYN.string;
    if (t === "comment") return SYN.comment;
    if (t === "number")  return SYN.number;
    if (t === "punct")   return SYN.punct;
    return T.textSub;
  };

  return (
    <div style={{
      background: T.bg,
      border: `1px solid ${T.border}`,
      borderRadius: 8,
      margin: "10px 0 16px",
      overflow: "hidden",
    }}>
      {lang && (
        <div style={{
          padding: "4px 12px",
          borderBottom: `1px solid ${T.border}`,
          fontSize: 10,
          fontFamily: T.fontMono,
          color: T.muted,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
        }}>
          {lang}
        </div>
      )}
      <pre style={{
        margin: 0,
        padding: "14px 16px",
        fontFamily: T.fontMono,
        fontSize: 12,
        lineHeight: 1.7,
        overflowX: "auto",
      }}>
        <code>
          {lines.map((line, li) => {
            const tokens = tokenizeLine(line);
            return (
              <React.Fragment key={li}>
                {tokens.map((tok, ti) => (
                  <span key={ti} style={{ color: colorFor(tok.t) }}>{tok.v}</span>
                ))}
                {li < lines.length - 1 && "\n"}
              </React.Fragment>
            );
          })}
        </code>
      </pre>
    </div>
  );
}

// ── shared primitives ────────────────────────────────────────────────────────

function SectionHeading({ num, title, sub, T }: {
  num: number; title: string; sub: string;
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

function SubHeading({ children, T }: { children: React.ReactNode; T: ReturnType<typeof useTheme>["T"] }) {
  return (
    <h3 style={{ fontSize: 14, fontWeight: 700, color: T.text, margin: "28px 0 10px", fontFamily: T.fontMono }}>
      {children}
    </h3>
  );
}

function Card({ title, children, T }: {
  title: string; children: React.ReactNode;
  T: ReturnType<typeof useTheme>["T"];
}) {
  return (
    <div style={{
      borderRadius: 10,
      border: `1px solid ${T.border}`,
      background: T.surface,
      padding: "14px 16px",
      marginBottom: 10,
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
      margin: "12px 0 20px",
      lineHeight: 1.6,
    }}>
      {children}
    </div>
  );
}

function Table({ headers, rows, T }: {
  headers: string[];
  rows: (string | React.ReactNode)[][];
  T: ReturnType<typeof useTheme>["T"];
}) {
  return (
    <div style={{ borderRadius: 10, border: `1px solid ${T.border}`, overflow: "hidden", margin: "12px 0 20px", fontSize: 12 }}>
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

function Flow({ steps, T }: {
  steps: { label: string; sub: string; variant?: "accent" | "default" }[];
  T: ReturnType<typeof useTheme>["T"];
}) {
  return (
    <div style={{ display: "flex", alignItems: "stretch", gap: 0, overflowX: "auto", padding: "4px 0 16px" }}>
      {steps.map((s, i) => {
        const isAccent = s.variant === "accent";
        return (
          <div key={i} style={{ display: "flex", alignItems: "center", flex: 1 }}>
            <div style={{
              flex: 1, border: `1.5px solid ${isAccent ? T.accent : T.border}`,
              borderRadius: 8, padding: "10px 12px", textAlign: "center",
              background: isAccent ? `${T.accent}14` : T.surface, minWidth: 100,
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: isAccent ? T.accent : T.text, marginBottom: 3 }}>{s.label}</div>
              <div style={{ fontSize: 11, color: T.muted }}>{s.sub}</div>
            </div>
            {i < steps.length - 1 && (
              <div style={{ padding: "0 6px", color: T.muted, fontSize: 16, flexShrink: 0 }}>→</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── guided example ────────────────────────────────────────────────────────────

function ExampleStep({ icon, label, sub, T }: {
  icon: string; label: string; sub: string;
  T: ReturnType<typeof useTheme>["T"];
}) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 10 }}>
      <span style={{
        fontSize: 16, lineHeight: "22px", flexShrink: 0, width: 22, textAlign: "center",
      }}>{icon}</span>
      <div>
        <div style={{ fontSize: 12, fontWeight: 700, color: T.text, lineHeight: 1.4 }}>{label}</div>
        <div style={{ fontSize: 11, color: T.muted, lineHeight: 1.5 }}>{sub}</div>
      </div>
    </div>
  );
}

function ExampleConnector({ T }: { T: ReturnType<typeof useTheme>["T"] }) {
  return (
    <div style={{ width: 22, display: "flex", justifyContent: "center", margin: "-4px 0 -4px 0", flexShrink: 0 }}>
      <div style={{ width: 1, height: 16, background: T.border }} />
    </div>
  );
}

type RetrievedArticle = { title: string; score: number; snippet: string; cited?: boolean };

function RetrievedArticles({ articles, T }: {
  articles: RetrievedArticle[];
  T: ReturnType<typeof useTheme>["T"];
}) {
  const scoreColor = (s: number) =>
    s >= 0.85 ? "#10B981" : s >= 0.65 ? "#F59E0B" : T.muted;

  return (
    <div style={{ margin: "14px 0 16px" }}>
      <div style={{
        fontSize: 11, fontWeight: 700, color: T.muted, marginBottom: 8,
        fontFamily: T.fontMono, textTransform: "uppercase", letterSpacing: "0.08em",
      }}>
        📚 KB articles retrieved
      </div>
      {articles.map((a, i) => (
        <div key={i} style={{
          display: "flex", alignItems: "flex-start", gap: 10,
          padding: "8px 10px", borderRadius: 6, marginBottom: 5,
          border: `1px solid ${a.cited ? T.accent + "50" : T.border}`,
          background: a.cited ? T.accent + "0a" : T.surface,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3, flexWrap: "wrap" }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: a.cited ? T.accent : T.text }}>{a.title}</span>
              {a.cited && (
                <span style={{
                  fontSize: 9, fontWeight: 700, letterSpacing: "0.06em",
                  color: T.accent, background: T.accent + "20",
                  padding: "1px 5px", borderRadius: 3, fontFamily: T.fontMono,
                }}>CITED</span>
              )}
            </div>
            <div style={{ fontSize: 11, color: T.muted, lineHeight: 1.5 }}>{a.snippet}</div>
          </div>
          <div style={{ flexShrink: 0, textAlign: "right", paddingTop: 1 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: scoreColor(a.score), fontFamily: T.fontMono }}>{a.score.toFixed(2)}</div>
            <div style={{ fontSize: 10, color: T.muted }}>score</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ExampleBlock({ badge, badgeColor, title, sub, steps, retrieved, inputPrompt, outputJson, T }: {
  badge: string; badgeColor: string; title: string; sub: string;
  steps: { icon: string; label: string; sub: string }[];
  retrieved?: RetrievedArticle[];
  inputPrompt: string; outputJson: string;
  T: ReturnType<typeof useTheme>["T"];
}) {
  return (
    <div style={{
      border: `1px solid ${T.border}`,
      borderRadius: 12,
      overflow: "hidden",
      marginBottom: 20,
    }}>
      {/* header */}
      <div style={{
        background: T.elevated,
        borderBottom: `1px solid ${T.border}`,
        padding: "12px 16px",
        display: "flex", alignItems: "center", gap: 10,
      }}>
        <span style={{
          fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase",
          padding: "2px 8px", borderRadius: 4,
          background: `${badgeColor}20`, color: badgeColor,
          fontFamily: T.fontMono,
        }}>{badge}</span>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{title}</div>
          <div style={{ fontSize: 11, color: T.muted }}>{sub}</div>
        </div>
      </div>

      <div style={{ padding: "16px 16px 4px" }}>
        {/* input */}
        <div style={{ fontSize: 11, fontWeight: 700, color: T.muted, marginBottom: 6, fontFamily: T.fontMono, textTransform: "uppercase", letterSpacing: "0.08em" }}>
          💬 Operator types
        </div>
        <CodeBlock lang="text" T={T}>{inputPrompt}</CodeBlock>

        {/* trace */}
        <div style={{ fontSize: 11, fontWeight: 700, color: T.muted, margin: "16px 0 10px", fontFamily: T.fontMono, textTransform: "uppercase", letterSpacing: "0.08em" }}>
          ⚙ What Dispatch does
        </div>
        <div style={{ paddingLeft: 4 }}>
          {steps.map((s, i) => (
            <React.Fragment key={i}>
              <ExampleStep icon={s.icon} label={s.label} sub={s.sub} T={T} />
              {i < steps.length - 1 && <ExampleConnector T={T} />}
            </React.Fragment>
          ))}
        </div>

        {/* retrieved articles */}
        {retrieved && <RetrievedArticles articles={retrieved} T={T} />}

        {/* output */}
        <div style={{ fontSize: 11, fontWeight: 700, color: T.muted, marginBottom: 6, fontFamily: T.fontMono, textTransform: "uppercase", letterSpacing: "0.08em" }}>
          ↩ Model response
        </div>
        <CodeBlock lang="json" T={T}>{outputJson}</CodeBlock>
      </div>
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
  const body = { fontSize: 13, color: T.textSub, lineHeight: 1.7, marginBottom: 12 } as const;

  return (
    <main style={{ maxWidth: 700, margin: "0 auto", padding: "48px 24px 80px" }}>
      <div style={{ marginBottom: 40 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: T.text, margin: 0, fontFamily: T.fontMono }}>
          How Dispatch works
        </h1>
        <p style={{ fontSize: 13, color: T.muted, marginTop: 6 }}>
          Implementation details — data capture, inference pipeline, and exception handling.
        </p>
      </div>

      {/* ── 0. Guided examples ── */}
      <section>
        <SectionHeading
          num={0} title="Guided examples"
          sub="Two end-to-end traces showing how a single operator message becomes a card operation or a grounded answer."
          T={T}
        />

        <ExampleBlock
          badge="bulk op"
          badgeColor={T.accent}
          title="Execute card orders"
          sub="Operator raises card limits for an entire team"
          inputPrompt={`Set Marketing team card limits to SGD 2,000`}
          steps={[
            { icon: "🔤", label: "Embed query", sub: "\"Set Marketing team card limits to SGD 2,000\" → 1,536-dim vector via text-embedding-3-small" },
            { icon: "🔍", label: "Vector search", sub: "ANN search over kb_articles · top-4 candidates returned by cosine similarity" },
            { icon: "✂️", label: "Trim & inject", sub: "Each article truncated to 200-char snippet · formatted as KB context block in system prompt" },
            { icon: "🤖", label: "Classify intent", sub: "gpt-5.4-mini reads KB context · identifies bulk_op · extracts target group + limit" },
            { icon: "🛡", label: "Policy check", sub: "SGD 2,000 < 5,000 cap · ~12 cards < 25 threshold · no approval required · frozen/cancelled excluded" },
            { icon: "📋", label: "Create draft", sub: "Job record written with status: draft · idempotency key checked before insert" },
            { icon: "✅", label: "Confirm & fan-out", sub: "Job transitions to in-progress · one item per eligible card · 500–3,500 ms stagger" },
          ]}
          retrieved={[
            { title: "Card Spending Limits & Bulk Operations", score: 0.91, snippet: "Individual card limits are capped at SGD 5,000. Bulk operations affecting more than 25 eligible cards require manager approval before execution." },
            { title: "Managing Team Card Permissions", score: 0.79, snippet: "Admins can view and update card limits from the Cards tab. Changes apply immediately and are logged for audit." },
            { title: "Bulk Operations & Approval Workflows", score: 0.73, snippet: "Operations affecting more than 25 eligible cards are subject to an approval workflow. The requester must confirm before execution begins." },
            { title: "Card Status Management", score: 0.58, snippet: "Cards in frozen or cancelled status are automatically excluded from bulk operations and counted as skipped." },
          ]}
          outputJson={`{
  "type": "bulk_op",
  "intent": {
    "intent": "bulk_update_card_limit",
    "targetGroup": "Marketing",
    "targetCountEstimate": 12,
    "newLimit": { "currency": "SGD", "amount": 2000 },
    "notifyCardholders": false
  }
}`}
          T={T}
        />

        <ExampleBlock
          badge="question"
          badgeColor="#10B981"
          title="Search for information"
          sub="Operator asks about policy limits — answered inline from the KB"
          inputPrompt={`What is the maximum spending limit I can set per card?`}
          steps={[
            { icon: "🔤", label: "Embed query", sub: "\"What is the maximum spending limit...\" → 1,536-dim vector via text-embedding-3-small" },
            { icon: "🔍", label: "Vector search", sub: "ANN search over kb_articles · top-4 candidates returned by cosine similarity" },
            { icon: "✂️", label: "Trim & inject", sub: "Snippets formatted as KB context block · injected at the top of the system prompt" },
            { icon: "🤖", label: "Answer + rerank", sub: "gpt-5.4-mini reads all 4 candidates · selects only article 1 as relevant · cites its ID" },
            { icon: "📎", label: "Map citations", sub: "Article ID in response mapped back to retrieved doc · rendered as inline source card" },
            { icon: "💬", label: "Render inline", sub: "Answer + source card displayed in chat · no job created · feedback captured by response ID" },
          ]}
          retrieved={[
            { title: "Card Spending Limits & Bulk Operations", score: 0.93, snippet: "Individual card limits are capped at SGD 5,000. Bulk operations affecting more than 25 eligible cards require manager approval before execution.", cited: true },
            { title: "Managing Team Card Permissions", score: 0.74, snippet: "Admins can view and update card limits from the Cards tab. Changes apply immediately and are logged for audit." },
            { title: "Payment Processing & Settlement", score: 0.62, snippet: "Reap processes card payments in real-time against the card's configured spending limit. Declined transactions are returned with a reason code." },
            { title: "Understanding Card Statuses", score: 0.55, snippet: "Cards can be active, frozen, or cancelled. Only active cards participate in spending limit checks and bulk operations." },
          ]}
          outputJson={`{
  "type": "question",
  "answer": "The maximum card spending limit you can set is SGD 5,000 per card. Operations that would exceed this cap are hard-blocked and will not be created.",
  "sources": [
    {
      "id": "card-limits-policy",
      "title": "Card Spending Limits & Bulk Operations",
      "snippet": "Individual card limits are capped at SGD 5,000. Bulk operations affecting more than 25 eligible cards require manager approval..."
    }
  ]
}`}
          T={T}
        />

        <Note T={T}>
          Both paths share the same request handler. The discriminated union return type (question vs bulk_op) determines what the frontend renders — no separate routes or endpoints.
        </Note>
      </section>

      {divider}

      {/* ── 1. Data capture ── */}
      <section>
        <SectionHeading
          num={1} title="Data capture"
          sub="How ops requests are captured and how the KB is ingested."
          T={T}
        />

        <SubHeading T={T}>Ops chat input</SubHeading>
        <p style={body}>
          In the ops app, input arrives as a natural language string typed into the chat interface. The frontend calls {mono("processRequest")} — a Convex action — passing the raw string and the full conversation history for context.
        </p>

        <Flow steps={[
          { label: "Chat input", sub: "rawRequest string", variant: "default" },
          { label: "processRequest", sub: "Convex action", variant: "accent" },
          { label: "gpt-5.4-mini", sub: "via OpenRouter", variant: "default" },
          { label: "createDraft", sub: "Convex mutation", variant: "accent" },
          { label: "jobs table", sub: "status: draft", variant: "default" },
        ]} T={T} />

        <p style={body}>
          The request handler returns one of two discriminated types which the frontend renders differently:
        </p>
        <CodeBlock lang="typescript" T={T}>{`// Discriminated union returned by processRequest
{ type: "question", answer: string, sources: PolicySource[] }
// or
{ type: "bulk_op", intent: BulkJobIntent }`}</CodeBlock>

        <Card title="question path" T={T}>
          The answer and KB sources render inline in the chat thread. No job is created. Thumbs up/down feedback is captured in the feedback table, keyed by a stable response ID.
        </Card>
        <Card title="bulk_op path" T={T}>
          The extracted intent (target group, new limit, notify flag) is used to create a draft job record, capturing policy output and excluded cards. No cards are touched yet.
        </Card>
        <Card title="Idempotency" T={T}>
          Before inserting, we check the idempotency index. If a matching job already exists, we return that ID rather than creating a duplicate. The key is derived from actor + operation + target group + limit.
        </Card>
        <Card title="Conversation context" T={T}>
          The request handler accepts conversation history (prior turns) and an optional recent job ID. When a job ID is supplied, its result summary (team, status, counts) is appended to the system prompt so the model can answer follow-ups like "how did that job go?".
        </Card>

        <SubHeading T={T}>KB ingestion</SubHeading>
        <p style={body}>
          The ops app seeds its own vector index from 115 Reap help-centre articles (cards, payments, onboarding, accounting integrations, team permissions) stored in a JSONL file. The seed action streams the file line-by-line and processes articles in batches of 20.
        </p>
        <CodeBlock lang="typescript" T={T}>{`// convex/kb.ts — seed pipeline (batched 20 articles at a time)
const texts = batch.map(a => \`\${a.title}\\n\\n\${a.body}\`.slice(0, 8000));
const embeddings = await embedTexts(client, texts);   // text-embedding-3-small, 1536-dim

await ctx.runMutation(internal.kb_queries.insertArticles, {
  articles: batch.map((a, j) => ({
    ...a,
    body: a.body.slice(0, 2000),   // truncated for storage; full text used for embedding only
    embedding: embeddings[j],       // float64[] stored as v.array(v.float64())
  })),
});`}</CodeBlock>
        <p style={body}>
          The schema declares a vector index on the embedding field, which Convex uses for approximate nearest-neighbour search at query time:
        </p>
        <CodeBlock lang="typescript" T={T}>{`// convex/schema.ts
kb_articles: defineTable({
  articleId: v.string(), title: v.string(),
  url: v.string(),       body: v.string(),
  updatedAt: v.string(), embedding: v.array(v.float64()),
})
  .index("by_article_id", ["articleId"])
  .vectorIndex("by_embedding", { vectorField: "embedding", dimensions: 1536 })`}</CodeBlock>

        <SubHeading T={T}>RAG pipeline</SubHeading>
        <p style={body}>
          Retrieval is multi-stage. Each stage runs before the LLM is called so that the model receives grounded context rather than generating from memory alone.
        </p>

        <Card title="1 · Chunking" T={T}>
          Each article is treated as a single chunk. The title and body are concatenated and truncated to 8,000 chars for embedding; only the first 2,000 chars of the body are stored in the database, keeping document payloads lean without affecting embedding quality.
        </Card>
        <Card title="2 · Embedding" T={T}>
          Each chunk is encoded into a 1,536-dimensional vector using text-embedding-3-small via OpenRouter. The same model and dimensionality are used at both ingestion and query time, keeping the embedding space consistent.
        </Card>
        <Card title="3 · Retrieval" T={T}>
          The operator's message is embedded with the same model. Convex's vector search performs approximate nearest-neighbour search against the stored embeddings, returning the top-5 candidates by cosine similarity.
        </Card>
        <Card title="4 · Reranking" T={T}>
          The top-5 candidates are passed to the LLM as a grounding block. The model acts as an implicit reranker — it selects which articles are actually relevant and cites only those in its response, filtering out low-signal hits before they surface in the UI.
        </Card>

        <CodeBlock lang="typescript" T={T}>{`// convex/kb.ts — searchKB action
const [embedding] = await embedTexts(client, [args.query]);
const hits = await ctx.vectorSearch("kb_articles", "by_embedding", {
  vector: embedding,
  limit: args.limit ?? 5,    // top-5 candidates by cosine similarity
});

return docs.map(doc => ({
  id:      doc.articleId,
  title:   doc.title,
  snippet: doc.body.slice(0, 200),   // first 200 chars surfaced as snippet
}));`}</CodeBlock>
        <CodeBlock lang="typescript" T={T}>{`// convex/interpreter.ts — KB context block injected into system prompt
kbContext =
  "\\n\\nKNOWLEDGE BASE ARTICLES (cite these as sources when relevant):\\n" +
  kbResults.map(r => \`[\${r.id}] \${r.title}\\n\${r.snippet}\`).join("\\n\\n");

const systemPrompt = BASE_SYSTEM_PROMPT + kbContext + jobContext;`}</CodeBlock>

        <Note T={T}>
          If the KB hasn't been seeded yet or the embedding API is down, the error is silently caught — the LLM call proceeds without KB context rather than failing the whole request.
        </Note>
      </section>

      {divider}

      {/* ── 2. Inference ── */}
      <section>
        <SectionHeading
          num={2} title="Inference"
          sub="How the LLM classifies intent and the policy engine validates it."
          T={T}
        />

        <SubHeading T={T}>Intent classification</SubHeading>
        <p style={body}>
          The request handler sends the user message to gpt-5.4-mini via OpenRouter at temperature 0, with the KB context block prepended to the system prompt. The model must return JSON only. The response is one of two discriminated shapes:
        </p>
        <CodeBlock lang="json" T={T}>{`// Question (policy Q&A)
{ "type": "question", "answer": "...", "sources": [{ "id": "42", "title": "...", "snippet": "..." }] }

// Bulk operation request
{ "type": "bulk_op", "intent": {
  "intent": "bulk_update_card_limit",
  "targetGroup": "Marketing",
  "targetCountEstimate": 12,
  "newLimit": { "currency": "SGD", "amount": 2000 },
  "notifyCardholders": true
} }`}</CodeBlock>
        <p style={body}>
          The raw response is cleaned (markdown fences stripped), JSON-parsed, then validated with Zod against a discriminated union schema. An unsupported intent type surfaces as an error entry in the chat thread rather than throwing.
        </p>

        <SubHeading T={T}>Policy engine</SubHeading>
        <p style={body}>
          Once intent is confirmed as a bulk operation, policy checks run synchronously inside the Convex mutation before writing any records:
        </p>
        <Table
          headers={["Rule", "Behaviour", "Threshold"]}
          rows={[
            ["Max limit",           "Hard block — job not created",          "SGD 5,000"],
            ["Max bulk items",      "Hard block — job not created",          "200 eligible cards"],
            ["Excluded statuses",   "Cards silently excluded from job",      "frozen, cancelled"],
            ["Approval threshold",  "Job created but approval flagged",      "> 25 eligible cards"],
          ]}
          T={T}
        />
        <p style={body}>
          Hard blocks surface as error bubbles in the chat. Soft gates allow the job to proceed to draft status with an approval flag — the UI renders a warning before the confirm button is enabled.
        </p>

        <SubHeading T={T}>Draft → confirm → fan-out</SubHeading>
        <Flow steps={[
          { label: "Create draft", sub: "status: draft", variant: "accent" },
          { label: "User confirms", sub: "confirm button", variant: "default" },
          { label: "Confirm job", sub: "Convex mutation", variant: "accent" },
          { label: "Job items", sub: "one per eligible card", variant: "default" },
          { label: "Scheduler", sub: "staggered fan-out", variant: "accent" },
        ]} T={T} />
        <p style={body}>
          Confirming the job transitions it to in-progress, inserts a job item record for every card — excluded cards are inserted as skipped immediately — then schedules each eligible item with a random stagger of 500–3,500 ms to simulate realistic async fan-out. The frontend subscribes via a live query and re-renders as items complete.
        </p>
      </section>

      {divider}

      {/* ── 3. Exception handling ── */}
      <section>
        <SectionHeading
          num={3} title="Exception handling"
          sub="Retries, permanent failures, and graceful degradation across all layers."
          T={T}
        />

        <SubHeading T={T}>Card executor — per-item retry</SubHeading>
        <p style={body}>
          Each card item runs in its own Convex internal action. Each invocation simulates a card API call, determines the outcome, and either marks the item terminal or re-schedules itself with exponential backoff:
        </p>
        <CodeBlock lang="typescript" T={T}>{`// src/lib/executor-logic.ts
export const MAX_RETRIES = 3;

export function backoffMs(retryCount: number): number {
  return Math.pow(2, retryCount) * 1000;  // 2s → 4s → 8s
}

export function isRetryExhausted(retryCount: number): boolean {
  return retryCount >= MAX_RETRIES;
}`}</CodeBlock>

        <Card title="Retryable failure" T={T}>
          The item is re-scheduled with exponential backoff (2 s → 4 s → 8 s). After 3 attempts it is promoted to permanent failure and no further scheduling occurs.
        </Card>
        <Card title="Permanent failure" T={T}>
          Either the card API returns a locked status (compliance-locked card IDs) or the retry count is exhausted. The item is written terminal immediately.
        </Card>
        <Card title="Idempotent re-entry" T={T}>
          The executor checks item status on entry. If it is already terminal (succeeded, permanently failed, or cancelled), it returns immediately. This makes Convex's at-least-once delivery safe.
        </Card>
        <Card title="Job count sync" T={T}>
          After each terminal outcome, a count mutation atomically patches the parent job's succeeded / failed / skipped tallies. Once all eligible items are resolved, the job transitions to completed or completed with failures.
        </Card>

        <SubHeading T={T}>Retry failed items</SubHeading>
        <p style={body}>
          Operators can re-queue all retryable failed items on a completed-with-failures job. This resets their status, clears failure codes, re-opens the job to in-progress, and schedules fresh execution with a new stagger. Permanently failed items are intentionally excluded and cannot be retried.
        </p>

        <SubHeading T={T}>LLM error handling</SubHeading>
        <p style={body}>
          The request handler covers three distinct failure modes before surfacing an error to the UI:
        </p>
        <Table
          headers={["Failure", "Detection", "Behaviour"]}
          rows={[
            ["Empty / refused response", "Response content is falsy",    "Throws with finish reason or refusal text"],
            ["Malformed JSON",           "JSON parse throws",             "Throws with first 120 chars of raw content"],
            ["Schema mismatch",          "Zod validation throws",         "Zod error propagates to the frontend"],
          ]}
          T={T}
        />
        <p style={body}>
          All three surface as error toasts via Sonner. The conversation history is not poisoned — the failed turn is discarded and the user can retry.
        </p>

        <SubHeading T={T}>Cancel</SubHeading>
        <p style={body}>
          Cancelling a job finds all queued items and marks them cancelled before patching the job status. In-flight items finish naturally — they hit the terminal-status guard on entry and return early. There is no force-kill of running scheduled functions.
        </p>

        <SubHeading T={T}>Graceful degradation</SubHeading>
        <Note T={T} variant="ok">
          KB unavailability is caught silently — the LLM call proceeds without KB context. Policy failures surface as user-readable error messages in the chat. Partial write failures are not possible: Convex mutations are transactional.
        </Note>
      </section>
    </main>
  );
}
