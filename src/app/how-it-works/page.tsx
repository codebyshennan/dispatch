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

const CodeBlock = React.memo(function CodeBlock({ children, lang, T }: {
  children: string;
  lang?: string;
  T: ReturnType<typeof useTheme>["T"];
}) {
  const lines = React.useMemo(
    () => children.trimEnd().split("\n").map(line => ({ raw: line, tokens: tokenizeLine(line) })),
    [children],
  );

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
          {lines.map(({ raw, tokens }, li) => (
              <React.Fragment key={raw + li}>
                {tokens.map((tok, ti) => (
                  <span key={ti} style={{ color: colorFor(tok.t) }}>{tok.v}</span>
                ))}
                {li < lines.length - 1 && "\n"}
              </React.Fragment>
            ))}
        </code>
      </pre>
    </div>
  );
});

// ── image modal ───────────────────────────────────────────────────────────────

function ImageModal({ src, alt, caption, T, onClose }: {
  src: string; alt: string; caption: string;
  T: ReturnType<typeof useTheme>["T"];
  onClose: () => void;
}) {
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(0,0,0,0.82)",
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        padding: 24,
        backdropFilter: "blur(4px)",
      }}
    >
      <button
        onClick={onClose}
        aria-label="Close image"
        style={{
          position: "absolute", top: 16, right: 16,
          background: "rgba(255,255,255,0.1)", border: "none", borderRadius: 8,
          color: "#fff", cursor: "pointer", fontSize: 18, lineHeight: 1,
          padding: "6px 10px",
        }}
      >
        ✕
      </button>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: "#fff", borderRadius: 14,
          boxShadow: "0 24px 80px rgba(0,0,0,0.6)",
          padding: 16, display: "flex",
        }}
      >
        <img
          src={src}
          alt={alt}
          style={{
            maxWidth: "88vw", maxHeight: "84vh",
            borderRadius: 6,
            objectFit: "contain", display: "block",
          }}
        />
      </div>
      {caption && (
        <p style={{
          marginTop: 14, fontSize: 12, color: "rgba(255,255,255,0.6)",
          fontStyle: "italic", textAlign: "center", maxWidth: 600, lineHeight: 1.5,
        }}>
          {caption}
        </p>
      )}
    </div>
  );
}

// ── figure + caption ─────────────────────────────────────────────────────────

function Figure({ src, alt, caption, T }: {
  src: string; alt: string; caption: string;
  T: ReturnType<typeof useTheme>["T"];
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <figure style={{ margin: "8px 0 20px", cursor: "zoom-in" }} onClick={() => setOpen(true)}>
        <img
          src={src}
          alt={alt}
          style={{ width: "100%", borderRadius: 10, border: `1px solid ${T.border}`, display: "block" }}
        />
        <figcaption style={{
          fontSize: 11, color: T.muted, textAlign: "center",
          marginTop: 6, fontStyle: "italic", lineHeight: 1.5,
        }}>
          {caption}
        </figcaption>
      </figure>
      {open && (
        <ImageModal src={src} alt={alt} caption={caption} T={T} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

// ── shared primitives ────────────────────────────────────────────────────────

function SectionHeading({ id, num, icon, title, sub, T }: {
  id?: string; num: number; icon?: string; title: string; sub: string;
  T: ReturnType<typeof useTheme>["T"];
}) {
  return (
    <div id={id} style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
        <span style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          width: 26, height: 26, borderRadius: "50%",
          background: T.accent, color: T.bg,
          fontFamily: T.fontMono, fontWeight: 700, fontSize: 12, flexShrink: 0,
        }}>
          {num}
        </span>
        {icon && (
          <span style={{
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            width: 26, height: 26, borderRadius: 6,
            background: T.elevated, border: `1px solid ${T.border}`, flexShrink: 0,
          }}>
            <Icon name={icon} size={14} color={T.accent} />
          </span>
        )}
        <h2 style={{ fontSize: 18, fontWeight: 700, color: T.text, margin: 0 }}>{title}</h2>
      </div>
      <p style={{ fontSize: 13, color: T.muted, margin: 0, paddingLeft: 36 }}>{sub}</p>
    </div>
  );
}

function SubHeading({ id, icon, children, T }: { id?: string; icon?: string; children: React.ReactNode; T: ReturnType<typeof useTheme>["T"] }) {
  return (
    <h3 id={id} style={{
      fontSize: 14, fontWeight: 700, color: T.text,
      margin: "28px 0 10px", fontFamily: T.fontMono,
      display: "flex", alignItems: "center", gap: 8,
    }}>
      {icon && <Icon name={icon} size={13} color={T.accent} />}
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
              <th key={i} scope="col" style={{
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

// ── icons ─────────────────────────────────────────────────────────────────────

const ICONS: Record<string, string> = {
  "search":        "M6 1a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM10 10L14 14",
  "type":          "M4 4h8M8 4v8M5 12h6",
  "funnel":        "M2.5 4h11L9 10v4.5l-2-1.5V10L2.5 4z",
  "cpu":           "M5 4h6v8H5zM3 7h2M3 10h2M11 7h2M11 10h2M7 2v2M10 2v2M7 12v2M10 12v2M7 7h2v2H7z",
  "shield":        "M8 2L2 5v4c0 3 2.5 5 6 6.5C11.5 14 14 12 14 9V5L8 2z",
  "file":          "M4 2h5l5 5v9H4V2zM9 2v5h5M6 9h4M6 12h4",
  "check":         "M3 8l4 4 6-8",
  "link":          "M5.5 10.5l-2 2a2 2 0 1 0 2.83 2.83l2-2M10.5 5.5l2-2a2 2 0 0 0-2.83-2.83l-2 2M6 10l4-4",
  "message":       "M2 3h12v8H7L2 14V3z",
  "database":      "M2 6c0-1.66 2.69-3 6-3s6 1.34 6 3v4c0 1.66-2.69 3-6 3s-6-1.34-6-3V6zM2 8.5c0 1.66 2.69 3 6 3s6-1.34 6-3",
  "arrow-left":    "M10 8H4M4 8l3-3M4 8l3 3",
  "settings":      "M8 10.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM8 2v1.5M8 12.5V14M2 8h1.5M12.5 8H14M3.64 3.64l1.06 1.06M11.3 11.3l1.06 1.06M3.64 12.36l1.06-1.06M11.3 4.7l1.06-1.06",
  "chevron-down":  "M4 6l4 4 4-4",
  "chevron-right": "M6 4l4 4-4 4",
  "layers":        "M8 2L2 5l6 3 6-3-6-3zM2 8l6 3 6-3M2 11l6 3 6-3",
};

function Icon({ name, size = 14, color = "currentColor" }: {
  name: string; size?: number; color?: string;
}) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 16 16"
      fill="none" stroke={color} strokeWidth={1.5}
      strokeLinecap="round" strokeLinejoin="round"
      style={{ flexShrink: 0, display: "block" }}
    >
      <path d={ICONS[name] ?? ""} />
    </svg>
  );
}

// ── nav rail ──────────────────────────────────────────────────────────────────

const NAV_SECTIONS = [
  { id: "guided-examples", icon: "layers", label: "Guided examples", children: [
    { id: "example-bulk", label: "Execute card orders" },
    { id: "example-question", label: "Search for information" },
  ]},
  { id: "data-capture", icon: "database", label: "Data capture", children: [
    { id: "ops-chat-input", label: "Ops chat input" },
    { id: "kb-ingestion", label: "KB ingestion" },
    { id: "rag-pipeline", label: "RAG pipeline" },
  ]},
  { id: "inference", icon: "cpu", label: "Inference", children: [
    { id: "router", label: "Pre-classifier router" },
    { id: "intent-classification", label: "Intent classification" },
    { id: "policy-engine", label: "Policy engine" },
    { id: "draft-confirm-fanout", label: "Draft → confirm" },
  ]},
  { id: "exception-handling", icon: "shield", label: "Exception handling", children: [
    { id: "per-item-retry", label: "Per-item retry" },
    { id: "retry-failed-items", label: "Retry failed items" },
    { id: "llm-error-handling", label: "LLM error handling" },
    { id: "cancel", label: "Cancel" },
    { id: "graceful-degradation", label: "Graceful degradation" },
  ]},
];

function NavRail({ T }: { T: ReturnType<typeof useTheme>["T"] }) {
  const [active, setActive] = React.useState("");

  React.useEffect(() => {
    const reverseIds = NAV_SECTIONS.flatMap(s => [s.id, ...s.children.map(c => c.id)]).reverse();
    const handleScroll = () => {
      for (const id of reverseIds) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= 100) {
          setActive(id);
          return;
        }
      }
      setActive("");
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <nav
      aria-label="Page sections"
      style={{
        width: 152, flexShrink: 0,
        position: "sticky", top: 48, alignSelf: "flex-start",
        maxHeight: "calc(100vh - 80px)", overflowY: "auto",
        paddingBottom: 24,
      }}
    >
      {NAV_SECTIONS.map((section, si) => (
        <div key={section.id} style={{ marginBottom: 18 }}>
          <a
            href={`#${section.id}`}
            aria-current={active === section.id ? "true" : undefined}
            style={{
              display: "flex", alignItems: "center", gap: 6, textDecoration: "none",
              fontSize: 10, fontWeight: 700, letterSpacing: "0.08em",
              textTransform: "uppercase", fontFamily: T.fontMono,
              color: active === section.id ? T.accent : T.text,
              marginBottom: 5,
            }}
          >
            <Icon name={section.icon} size={12} color={active === section.id ? T.accent : T.muted} />
            {section.label}
          </a>
          {section.children.map(child => (
            <a
              key={child.id}
              href={`#${child.id}`}
              aria-current={active === child.id ? "true" : undefined}
              style={{
                display: "block", textDecoration: "none",
                fontSize: 11, lineHeight: 1.5, marginBottom: 3,
                paddingLeft: 8,
                borderLeft: `2px solid ${active === child.id ? T.accent : "transparent"}`,
                color: active === child.id ? T.accent : T.muted,
              }}
            >
              {child.label}
            </a>
          ))}
          {si < NAV_SECTIONS.length - 1 && (
            <div style={{ height: 1, background: T.border, margin: "12px 0 0" }} />
          )}
        </div>
      ))}
    </nav>
  );
}

// ── guided example ────────────────────────────────────────────────────────────

function ExampleStep({ icon, label, sub, T }: {
  icon: string; label: string; sub: string;
  T: ReturnType<typeof useTheme>["T"];
}) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 10 }}>
      <div style={{
        width: 22, height: 22, borderRadius: 6, flexShrink: 0,
        background: T.elevated, border: `1px solid ${T.border}`,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <Icon name={icon} size={12} color={T.muted} />
      </div>
      <div style={{ paddingTop: 3 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: T.text, lineHeight: 1.4 }}>{label}</div>
        <div style={{ fontSize: 11, color: T.muted, lineHeight: 1.5 }}>{sub}</div>
      </div>
    </div>
  );
}

function ExampleConnector({ T }: { T: ReturnType<typeof useTheme>["T"] }) {
  return (
    <div style={{ width: 22, display: "flex", justifyContent: "center", margin: "-4px 0", flexShrink: 0 }}>
      <div style={{ width: 1, height: 14, background: T.border }} />
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
        display: "flex", alignItems: "center", gap: 6,
        fontSize: 11, fontWeight: 700, color: T.muted, marginBottom: 8,
        fontFamily: T.fontMono, textTransform: "uppercase", letterSpacing: "0.08em",
      }}>
        <Icon name="database" size={11} color={T.muted} />
        KB articles retrieved
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

function ExampleBlock({ id, badge, badgeColor, title, sub, steps, retrieved, retrievedAfterStep, inputPrompt, outputJson, T }: {
  id: string; badge: string; badgeColor: string; title: string; sub: string;
  steps: { icon: string; label: string; sub: string }[];
  retrieved?: RetrievedArticle[];
  retrievedAfterStep?: number;
  inputPrompt: string; outputJson: string;
  T: ReturnType<typeof useTheme>["T"];
}) {
  const insertAt = retrieved && retrievedAfterStep !== undefined ? retrievedAfterStep : -1;

  return (
    <div id={id} style={{ border: `1px solid ${T.border}`, borderRadius: 12, overflow: "hidden", marginBottom: 12 }}>
      {/* header */}
      <div style={{
        background: T.elevated, padding: "12px 16px",
        display: "flex", alignItems: "center", gap: 10,
        borderBottom: `1px solid ${T.border}`,
      }}>
        <span style={{
          fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase",
          padding: "2px 8px", borderRadius: 4,
          background: `${badgeColor}20`, color: badgeColor,
          fontFamily: T.fontMono, flexShrink: 0,
        }}>{badge}</span>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{title}</div>
          <div style={{ fontSize: 11, color: T.muted }}>{sub}</div>
        </div>
      </div>

      {/* content — always visible */}
      <div style={{ padding: "16px 16px 4px" }}>
        {/* input */}
        <div style={{
          display: "flex", alignItems: "center", gap: 6,
          fontSize: 11, fontWeight: 700, color: T.muted, marginBottom: 6,
          fontFamily: T.fontMono, textTransform: "uppercase", letterSpacing: "0.08em",
        }}>
          <Icon name="message" size={11} color={T.muted} />
          Operator types
        </div>
        <CodeBlock lang="text" T={T}>{inputPrompt}</CodeBlock>

        {/* trace */}
        <div style={{
          display: "flex", alignItems: "center", gap: 6,
          fontSize: 11, fontWeight: 700, color: T.muted, margin: "16px 0 10px",
          fontFamily: T.fontMono, textTransform: "uppercase", letterSpacing: "0.08em",
        }}>
          <Icon name="settings" size={11} color={T.muted} />
          What Dispatch does
        </div>
        <div style={{ paddingLeft: 4 }}>
          {steps.map((s, i) => (
            <React.Fragment key={i}>
              <ExampleStep icon={s.icon} label={s.label} sub={s.sub} T={T} />
              {i === insertAt ? (
                <>
                  <ExampleConnector T={T} />
                  <RetrievedArticles articles={retrieved!} T={T} />
                  {i < steps.length - 1 && <ExampleConnector T={T} />}
                </>
              ) : (
                i < steps.length - 1 && <ExampleConnector T={T} />
              )}
            </React.Fragment>
          ))}
          {retrieved && insertAt === -1 && (
            <>
              <ExampleConnector T={T} />
              <RetrievedArticles articles={retrieved} T={T} />
            </>
          )}
          <ExampleConnector T={T} />
          <div style={{
            display: "flex", alignItems: "center", gap: 6,
            fontSize: 11, fontWeight: 700, color: T.muted, margin: "8px 0 6px",
            fontFamily: T.fontMono, textTransform: "uppercase", letterSpacing: "0.08em",
          }}>
            <Icon name="arrow-left" size={11} color={T.muted} />
            Model response
          </div>
          <CodeBlock lang="json" T={T}>{outputJson}</CodeBlock>
        </div>
      </div>
    </div>
  );
}

// ── rag + inference pipeline diagram ─────────────────────────────────────────

function PipelineDiagram({ T }: { T: ReturnType<typeof useTheme>["T"] }) {
  const stages: { icon: string; label: string; detail: string; notes?: string[]; accent?: boolean }[] = [
    {
      icon: "message",
      label: "Operator input",
      detail: "raw natural language string typed into chat",
      notes: ["full conversation history passed for context", "optional recent job ID for follow-up Q&A"],
    },
    {
      icon: "layers",
      label: "Pre-classifier router",
      detail: "claude-haiku-4-5 → { lane: read | write | clarify, confidence }",
      notes: [
        "best-effort: router failure falls through to unified pipeline",
        "trust threshold: confidence ≥ 0.80 — below that, retrieval still runs",
        "on confident write: skip embed + vector search (saves ~150–200ms)",
      ],
    },
    {
      icon: "type",
      label: "Embed query",
      detail: "text-embedding-3-small → 1,536-dim float64[] vector · skipped on confident write lane",
    },
    {
      icon: "search",
      label: "ANN vector search",
      detail: "cosine similarity over kb_articles vectorIndex",
      notes: ["top-4 candidates retrieved", "115 Reap help-centre articles indexed"],
    },
    {
      icon: "funnel",
      label: "Trim & inject",
      detail: "format KB context block → prepend to system prompt",
      notes: ["each article body: 2,000-char stored → 200-char snippet", "format: [id] title\\nsnippet per article"],
    },
    {
      icon: "cpu",
      label: "LLM — gpt-5.4-mini",
      detail: "temperature 0 · JSON only · via OpenRouter",
      notes: [
        "lane-specific system prompt: READ (question-only), WRITE (bulk_op-only), or UNIFIED (fallback)",
        "read lane reads all 4 KB candidates and acts as reranker — cites only articles actually used",
        "single-shape lanes can only emit one valid JSON shape; unified emits the discriminated union",
      ],
      accent: true,
    },
    {
      icon: "shield",
      label: "Parse & validate",
      detail: "strip markdown fences → JSON.parse → Zod schema",
      notes: [
        "empty/refused response → throws with finish reason",
        "malformed JSON → throws with first 120 chars",
        "schema mismatch → Zod error surfaces as toast",
      ],
    },
  ];

  const connector = (
    <div style={{ display: "flex", justifyContent: "center", height: 18, alignItems: "center" }}>
      <div style={{ width: 1.5, height: "100%", background: T.border }} />
    </div>
  );

  const BranchStep = ({ label, sub, color }: { label: string; sub: string; color: string }) => (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 11, color: T.muted, lineHeight: 1.5 }}>{sub}</div>
    </div>
  );

  const BranchDivider = ({ color }: { color: string }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 6, margin: "6px 0" }}>
      <div style={{ flex: 1, height: 1, background: color + "30" }} />
      <div style={{ width: 4, height: 4, borderRadius: "50%", background: color + "60" }} />
      <div style={{ flex: 1, height: 1, background: color + "30" }} />
    </div>
  );

  return (
    <div style={{ margin: "16px 0 24px" }}>
      {stages.map((s, i) => (
        <React.Fragment key={i}>
          <div style={{
            display: "flex", alignItems: "flex-start", gap: 12,
            padding: "10px 14px", borderRadius: 8,
            border: `1px solid ${s.accent ? T.accent + "60" : T.border}`,
            background: s.accent ? T.accent + "0d" : T.surface,
          }}>
            <div style={{
              width: 28, height: 28, borderRadius: 7, flexShrink: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
              background: s.accent ? T.accent + "20" : T.elevated,
              border: `1px solid ${s.accent ? T.accent + "40" : T.border}`,
              marginTop: 1,
            }}>
              <Icon name={s.icon} size={13} color={s.accent ? T.accent : T.muted} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: s.accent ? T.accent : T.text, fontFamily: T.fontMono }}>{s.label}</div>
              <div style={{ fontSize: 11, color: T.muted, marginTop: 1 }}>{s.detail}</div>
              {s.notes && (
                <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 3 }}>
                  {s.notes.map((n, ni) => (
                    <div key={ni} style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
                      <div style={{ width: 3, height: 3, borderRadius: "50%", background: s.accent ? T.accent : T.border, flexShrink: 0, marginTop: 5 }} />
                      <span style={{ fontSize: 11, color: s.accent ? T.accent + "cc" : T.textSub, lineHeight: 1.5 }}>{n}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          {i < stages.length - 1 && connector}
        </React.Fragment>
      ))}

      {/* fork */}
      <div style={{ display: "flex", justifyContent: "center", height: 18, alignItems: "center" }}>
        <div style={{ width: 1.5, height: "100%", background: T.border }} />
      </div>
      <div style={{
        textAlign: "center", fontSize: 10, fontWeight: 700, letterSpacing: "0.08em",
        textTransform: "uppercase", color: T.muted, fontFamily: T.fontMono, marginBottom: 8,
      }}>
        discriminated union on <code style={{ fontFamily: T.fontMono, color: T.textSub }}>type</code>
      </div>

      <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
        {/* question branch */}
        <div style={{ flex: 1, borderRadius: 8, border: `1.5px solid #10B98140`, background: "#10B98108", padding: "12px 14px" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#10B981", marginBottom: 10, fontFamily: T.fontMono }}>&quot;question&quot;</div>
          <BranchStep color="#10B981" label="Rerank" sub="LLM cites only the articles it used — low-relevance candidates silently dropped" />
          <BranchDivider color="#10B981" />
          <BranchStep color="#10B981" label="Map citations" sub="article IDs in response mapped back to retrieved docs → rendered as inline source cards" />
          <BranchDivider color="#10B981" />
          <BranchStep color="#10B981" label="Render inline" sub="answer + source cards displayed in chat thread — no job created" />
          <BranchDivider color="#10B981" />
          <BranchStep color="#10B981" label="Capture feedback" sub="thumbs up/down stored in feedback table, keyed by stable response ID" />
        </div>

        {/* bulk_op branch */}
        <div style={{ flex: 1, borderRadius: 8, border: `1.5px solid ${T.accent}40`, background: `${T.accent}08`, padding: "12px 14px" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.accent, marginBottom: 10, fontFamily: T.fontMono }}>&quot;bulk_op&quot;</div>
          <BranchStep color={T.accent} label="Policy checks" sub="SGD 5,000 cap → hard block · 200 cards max → hard block · >25 eligible → approval flag · frozen/cancelled → skipped items" />
          <BranchDivider color={T.accent} />
          <BranchStep color={T.accent} label="Idempotency check" sub="key = actor + operation + group + limit — existing job returned rather than duplicated" />
          <BranchDivider color={T.accent} />
          <BranchStep color={T.accent} label="Create draft" sub="job record written with status: draft, capturing intent and excluded cards — no cards touched yet" />
          <BranchDivider color={T.accent} />
          <BranchStep color={T.accent} label="Confirm → fan-out" sub="job → in-progress · one item per eligible card · 500–3,500 ms random stagger · frontend live query re-renders as items complete" />
        </div>
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
    <div style={{ maxWidth: 960, margin: "0 auto", padding: "48px 24px 80px", display: "flex", gap: 56, alignItems: "flex-start" }}>
      <main style={{ flex: 1, minWidth: 0 }}>
      <div style={{ marginBottom: 40 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: T.text, margin: 0, fontFamily: T.fontMono }}>
          How Dispatch works
        </h1>
        <p style={{ fontSize: 13, color: T.muted, marginTop: 6 }}>
          Guided examples, data capture, inference pipeline, and exception handling.
          <span style={{ marginLeft: 10, paddingLeft: 10, borderLeft: `1px solid ${T.border}` }}>~5 min read</span>
        </p>
        <Note T={T}>
          <strong>Scope:</strong> This page documents the <strong>ops app</strong> — a Convex-backed chat interface used by Reap&apos;s CX operations team to bulk-update cards and look up policy. It is a separate system from the Zendesk ticket-classification pipeline.
          <br /><br />
          <strong>Audience:</strong> Engineers onboarding to the ops app codebase. <em>Operators</em> are members of Reap&apos;s CX ops team who use the app to manage customer support and card operations.
        </Note>
        <Figure
          src="/diagrams/dispatch-how-it-works.png"
          alt="How Dispatch Works — full pipeline diagram"
          caption="Full request pipeline — operator input flows through RAG retrieval and LLM classification before forking into either an inline answer or a bulk card operation."
          T={T}
        />
      </div>

      {/* ── 0. Guided examples ── */}
      <section>
        <SectionHeading
          id="guided-examples"
          num={0} icon="layers" title="Guided examples"
          sub="Two end-to-end traces showing how a single operator message becomes a card operation or a grounded answer. Both traces show the happy path; failure behaviour is covered in Section 3."
          T={T}
        />

        <ExampleBlock
          id="example-bulk"
          badge="bulk op"
          badgeColor={T.accent}
          title="Execute card orders"
          sub="Operator raises card limits for an entire team"
          inputPrompt={`Set Marketing team card limits to SGD 2,000`}
          steps={[
            { icon: "type",     label: "Embed query",    sub: "\"Set Marketing team card limits to SGD 2,000\" → 1,536-dim vector via text-embedding-3-small" },
            { icon: "search",   label: "Vector search",  sub: "ANN (Approximate Nearest Neighbor) search over kb_articles · top-4 candidates by cosine similarity" },
            { icon: "funnel",   label: "Trim & inject",  sub: "Each article truncated to 200-char snippet · formatted as KB context block in system prompt" },
            { icon: "cpu",      label: "Classify intent",sub: "gpt-5.4-mini reads KB context · identifies bulk_op · extracts target group + limit" },
            { icon: "shield",   label: "Policy check",   sub: "SGD 2,000 < 5,000 cap · ~12 cards < 25 threshold · no approval required · frozen/cancelled cards marked skipped" },
            { icon: "file",     label: "Create draft",   sub: "Job record written with status: draft · idempotency key checked before insert" },
            { icon: "check",    label: "Confirm & fan-out", sub: "Job transitions to in-progress · one item per eligible card · 500–3,500 ms stagger" },
          ]}
          retrieved={[
            { title: "Reap Card Pricing and Fees", score: 0.88, snippet: "Reap Card is a secured corporate credit card with no annual or hidden fees. This article outlines what fees to expect, how repayments work, and important terms related to card usage." },
            { title: "Differences Between USD and HKD Reap Cards", score: 0.79, snippet: "When you apply for a Reap Card, you can choose to settle your account in either HKD or USD. This settlement currency determines how your card repayments are made." },
            { title: "Restricted MCC Codes for Reap Cards", score: 0.71, snippet: "Certain merchant categories are blocked from Reap Card usage due to security and compliance requirements. MCCs are four-digit codes assigned by credit card networks to classify merchants." },
            { title: "Team Permissions User Level Comparisons - Reap Card", score: 0.60, snippet: "Admins can view all transactions, manage cards and spend limits across all groups. Group Owners manage within their group. Team Members view their own transactions only." },
          ]}
          retrievedAfterStep={1}
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
          id="example-question"
          badge="question"
          badgeColor="#10B981"
          title="Search for information"
          sub="Operator asks about policy limits — answered inline from the KB"
          inputPrompt={`What is the maximum spending limit I can set per card?`}
          steps={[
            { icon: "type",     label: "Embed query",    sub: "\"What is the maximum spending limit...\" → 1,536-dim vector via text-embedding-3-small" },
            { icon: "search",   label: "Vector search",  sub: "ANN (Approximate Nearest Neighbor) search over kb_articles · top-4 candidates by cosine similarity" },
            { icon: "funnel",   label: "Trim & inject",  sub: "Snippets formatted as KB context block · injected at the top of the system prompt" },
            { icon: "cpu",      label: "Answer + rerank",sub: "gpt-5.4-mini reads all 4 candidates · acts as a reranker (filters to only the articles it actually cites) · article 1 selected" },
            { icon: "link",     label: "Map citations",  sub: "Article ID in response mapped back to retrieved doc · rendered as inline source card" },
            { icon: "message",  label: "Render inline",  sub: "Answer + source card displayed in chat · no job created · feedback captured by response ID" },
          ]}
          retrieved={[
            { title: "How can I increase my card's daily spending limit?", score: 0.93, snippet: "Your card daily Spending Limit is the maximum card transaction ceiling set by Reap for security reasons. The baseline is 100,000 USD per card per day for USD cards and 780,000 HKD per card per day for HKD cards.", cited: true },
            { title: "Why is My Card Showing as \"Capped\"?", score: 0.74, snippet: "If you see the term \"capped\" associated with your card, it means the spending limit on your card is currently lower than the amount stated, typically because your company's remaining balance is insufficient." },
            { title: "Understanding Reap Card Transaction Declines", score: 0.62, snippet: "If a Reap Card transaction fails, you can find the reason in your dashboard, mobile app, or email. This guide explains where to find decline details and what each decline code means." },
            { title: "How to use Spend restrictions on Reap Card?", score: 0.55, snippet: "To allow or block certain types of transactions on a Reap Card, go to the Cards tab after logging into the Reap dashboard, select the card, and configure Category or Time-based restrictions." },
          ]}
          retrievedAfterStep={1}
          outputJson={`{
  "type": "question",
  "answer": "The daily spending limit is set by Reap for security reasons. The baseline is 100,000 USD per card per day for USD cards and 780,000 HKD per card per day for HKD cards. To request an increase, contact Reap support with your justification.",
  "sources": [
    {
      "id": "13939502996879",
      "title": "How can I increase my card's daily spending limit?",
      "snippet": "Your card daily Spending Limit is the maximum card transaction ceiling set by Reap for security reasons..."
    }
  ]
}`}
          T={T}
        />

        <Note T={T}>
          Both paths share the same request handler. The response is a discriminated union — the shape of the object differs based on a {mono("type")} field ({mono('"question"')} vs {mono('"bulk_op"')}). The frontend switches on that field to decide what to render; there are no separate routes or endpoints. Section 1 shows the TypeScript types; Section 2 covers how the model produces them.
        </Note>
      </section>

      {divider}

      {/* ── 1. Data capture ── */}
      <section>
        <SectionHeading
          id="data-capture"
          num={1} icon="database" title="Data capture"
          sub="How ops requests are captured and how the KB is ingested."
          T={T}
        />

        <SubHeading id="ops-chat-input" icon="message" T={T}>Ops chat input</SubHeading>
        <p style={body}>
          In the ops app, input arrives as a natural language string typed into the chat interface. The frontend invokes a Convex action, passing the raw string and the full conversation history for context. The handler returns one of two discriminated types which the frontend renders differently:
        </p>
        <CodeBlock lang="typescript" T={T}>{`// Discriminated union returned by processRequest
{ type: "question", answer: string, sources: PolicySource[] }
// or
{ type: "bulk_op", intent: BulkJobIntent }`}</CodeBlock>

        <p style={body}>
          On the {mono('"question"')} path, the answer and KB sources render inline in the chat thread — no job is created. Thumbs up/down feedback is captured in the feedback table, keyed by a stable response ID. On the {mono('"bulk_op"')} path, the extracted intent (target group, new limit, notify flag) is used to create a draft job record capturing policy output and excluded cards; no cards are touched yet. The diagram below traces that bulk-op path end to end.
        </p>

        <Flow steps={[
          { label: "Chat input", sub: "rawRequest string", variant: "default" },
          { label: "processRequest", sub: "Convex action", variant: "accent" },
          { label: "gpt-5.4-mini", sub: "via OpenRouter", variant: "default" },
          { label: "createDraft", sub: "Convex mutation", variant: "accent" },
          { label: "jobs table", sub: "status: draft", variant: "default" },
        ]} T={T} />
        <p style={body}>
          Before inserting, we check the idempotency index. If a matching job already exists, we return that ID rather than creating a duplicate — the key is derived from actor + operation + target group + limit.
        </p>
        <p style={body}>
          The request handler also accepts conversation history (prior turns) and an optional recent job ID. When supplied, the job&apos;s result summary (team, status, counts) is appended to the system prompt so the model can answer follow-ups like &quot;how did that job go?&quot;.
        </p>

        <SubHeading id="kb-ingestion" icon="database" T={T}>KB ingestion</SubHeading>
        <Figure
          src="/diagrams/dispatch-kb-ingestion.png"
          alt="KB Ingestion Pipeline diagram"
          caption="Seed action — 115 articles streamed from JSONL in batches of 20, embedded at full length (8,000 chars), then stored truncated (2,000 chars) alongside the float64[] vector."
          T={T}
        />
        <Note T={T} variant="warn">
          The KB is scraped from Reap's public help centre — articles written for cardholders, not for the ops team. For the question path this is the right source: the ops team is answering customer queries and needs the same reference material. For the bulk op path, KB retrieval provides policy context (fee structures, currency rules, MCC restrictions) rather than procedural guidance — the ops team already knows how to run the operation.
        </Note>
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
          The schema declares a {mono("vectorIndex")} on the embedding field, which tells Convex to build an optimised ANN index over that field — enabling fast cosine-similarity lookups at query time without a full table scan:
        </p>
        <CodeBlock lang="typescript" T={T}>{`// convex/schema.ts
kb_articles: defineTable({
  articleId: v.string(), title: v.string(),
  url: v.string(),       body: v.string(),
  updatedAt: v.string(), embedding: v.array(v.float64()),
})
  .index("by_article_id", ["articleId"])
  .vectorIndex("by_embedding", { vectorField: "embedding", dimensions: 1536 })`}</CodeBlock>

        <SubHeading id="rag-pipeline" icon="search" T={T}>RAG pipeline</SubHeading>
        <p style={body}>
          The diagram below traces the full request pipeline end-to-end — retrieval, classification, and the final fork into a question answer or a bulk job. The four RAG stages run before and around the LLM call; Section 2 drills into everything after the LLM.
        </p>
        <PipelineDiagram T={T} />
        <div style={body}>
          The retrieval path has four stages that wrap the LLM call:
          <ol style={{ margin: "8px 0 8px 0", paddingLeft: 20, lineHeight: 1.8 }}>
            <li><strong>Embed</strong> — the operator&apos;s message is converted to a 1,536-dim vector via text-embedding-3-small.</li>
            <li><strong>Retrieve</strong> — the top-4 candidates are fetched by ANN (Approximate Nearest Neighbor) cosine similarity.</li>
            <li><strong>Inject</strong> — each article body is truncated to a 200-char snippet and formatted into a KB context block prepended to the system prompt.</li>
            <li><strong>Rerank</strong> — at generation time, the LLM reads all four candidates but cites only the articles it actually used, filtering out low-relevance results.</li>
          </ol>
          See the guided examples above for a concrete trace of both paths.
        </div>
        <CodeBlock lang="typescript" T={T}>{`// convex/kb.ts — searchKB action
const [embedding] = await embedTexts(client, [args.query]);
const hits = await ctx.vectorSearch("kb_articles", "by_embedding", {
  vector: embedding,
  limit: args.limit ?? 5,    // interpreter passes 4 → top-4 candidates by cosine similarity
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
          id="inference"
          num={2} icon="cpu" title="Inference"
          sub="Intent classification, policy validation, and the draft → confirm → fan-out job lifecycle."
          T={T}
        />

        <SubHeading id="router" icon="funnel" T={T}>Pre-classifier router</SubHeading>
        <p style={body}>
          A cheap haiku-4-5 router runs <em>before</em> retrieval and classifies the request into one of three lanes: {mono('"read"')} (a question), {mono('"write"')} (a bulk operation), or {mono('"clarify"')} (ambiguous, missing info). When the router returns ≥0.80 confidence on {mono('"write"')}, the embed + vector-search round-trip is skipped — bulk-op intent extraction does not benefit from KB context. Below the threshold (or on router failure) the unified pipeline runs unchanged, so accuracy never regresses.
        </p>
        <CodeBlock lang="typescript" T={T}>{`// convex/router.ts
{ "lane": "read" | "write" | "clarify", "confidence": <0.0-1.0> }

// convex/interpreter.ts — lane resolution
const trustRouter = routerResult && routerResult.confidence >= 0.80;
const lane =
  trustRouter && routerResult.lane === "read"  ? "read"  :
  trustRouter && routerResult.lane === "write" ? "write" :
  "unified";  // clarify, low-confidence, and router-failure all fall here

// → read    lane: READ_SYSTEM_PROMPT  + KB context + question-only schema
// → write   lane: WRITE_SYSTEM_PROMPT + no KB     + bulk_op-only schema
// → unified lane: UNIFIED_SYSTEM_PROMPT + KB context + full union schema (legacy)`}</CodeBlock>

        <SubHeading id="router-tradeoffs" icon="layers" T={T}>Why split routing from retrieval?</SubHeading>
        <p style={body}>
          The original design fused intent classification, KB reranking, and answer/extraction into a single LLM call. That kept the system simple at low volume but made every request pay for embedding and vector search even when the answer was a pure write. As the operation catalog grows (today: limit updates; tomorrow: freezes, refunds, group changes, transaction lookups), separating the routing decision from execution lets each lane evolve independently.
        </p>
        <Table
          headers={["Dimension", "Unified call (original)", "Router-first (current)"]}
          rows={[
            ["Latency — write",   "embed + search + LLM ≈ 800–1500ms",     "router + LLM ≈ 500–800ms"],
            ["Latency — read",    "embed + search + LLM ≈ 800–1500ms",     "router + embed + search + LLM ≈ 900–1600ms"],
            ["Cost / request",    "1 LLM call",                            "1 router call + 1 LLM call"],
            ["KB on bulk_op",     "always retrieved (policy grounding)",    "skipped at high confidence"],
            ["Quality",           "single pass — best for ambiguous text", "router commits early; fallback preserves the unified path"],
            ["Extensibility",     "every new op edits the central prompt", "router is the only seam — handlers can be swapped per lane"],
          ]}
          T={T}
        />
        <Note T={T}>
          <strong>Why router-first wins long-term:</strong> the router is cheap and stays cheap as volume grows (could later be a fine-tuned classifier, not even an LLM). Each lane gets its own prompt, eval suite, and model tier. New operations are added by registering a tool in the write lane rather than editing a monolithic prompt. The unified call remains as a fallback, so the migration is incremental — not a rewrite.
        </Note>
        <Note T={T} variant="warn">
          <strong>What we trade:</strong> on the read lane, we pay one extra LLM call (the router) per request. At low volume this is invisible; at high volume it&apos;s amortized by router prompt caching. We also commit to a lane earlier — if the router mis-classifies, the downstream call may produce the wrong shape. The 0.80 confidence threshold and unified-pipeline fallback exist to bound this risk.
        </Note>
        <Note T={T} variant="ok">
          <strong>Migration path:</strong> (1) router in front, unified pipeline as fallback ✓ done. (2) split the unified system prompt into READ + WRITE, each with its own eval set ({mono("datasets/eval/read.jsonl")}, {mono("datasets/eval/write.jsonl")}, suite at {mono("src/lib/__tests__/prompts-eval.test.ts")}) ✓ done. (3) ship a second bulk operation through the existing seam ({mono("bulk_freeze_cards")} ✓ done) — confirms the schema, executor, and UI extend cleanly via discriminated unions before adding indirection. (4) introduce a tool registry once a third operation arrives, so adding new ops becomes a registration rather than a prompt + executor branch edit. (5) optimize per-lane: caching, model tiering, hybrid retrieval.
        </Note>

        <SubHeading id="intent-classification" icon="type" T={T}>Intent classification</SubHeading>
        <p style={body}>
          The lane decided above selects which prompt is sent to gpt-5.4-mini. The READ and WRITE prompts each emit a single JSON shape; the UNIFIED prompt (used for {mono('"clarify"')}, low confidence, or router failure) preserves the original discriminated-union behavior.
        </p>
        <CodeBlock lang="typescript" T={T}>{`// convex/prompts.ts — three named prompts, all share POLICY_RULES
export const READ_SYSTEM_PROMPT    = \`...answer-only, expects KB context...\`;
export const WRITE_SYSTEM_PROMPT   = \`...intent extraction only, no KB...\`;
export const UNIFIED_SYSTEM_PROMPT = \`...full discriminated union (fallback)...\`;`}</CodeBlock>
        <p style={body}>
          The model&apos;s output is parsed against a lane-specific Zod schema — {mono("QuestionShape")}, {mono("BulkOpShape")}, or the full {mono("UnifiedShape")}. Single-shape lanes can only emit one valid type, so a wrong-shape response surfaces as a Zod error rather than a silent mismatch.
        </p>
        <p style={body}>
          The model produces one of these two shapes (depending on lane):
        </p>
        <CodeBlock lang="json" T={T}>{`// Question (policy Q&A)
{ "type": "question", "answer": "...", "sources": [{ "id": "42", "title": "...", "snippet": "..." }] }

// Bulk operation request — limit update
{ "type": "bulk_op", "intent": {
  "intent": "bulk_update_card_limit",
  "targetGroup": "Marketing",
  "targetCountEstimate": 12,
  "newLimit": { "currency": "SGD", "amount": 2000 },
  "notifyCardholders": true
} }

// Bulk operation request — freeze
{ "type": "bulk_op", "intent": {
  "intent": "bulk_freeze_cards",
  "targetGroup": "Operations",
  "notifyCardholders": false
} }`}</CodeBlock>
        <p style={body}>
          The raw response is cleaned (markdown fences stripped), JSON-parsed, then validated with Zod against a discriminated union schema. An unsupported intent type surfaces as an error entry in the chat thread rather than throwing.
        </p>

        <SubHeading id="policy-engine" icon="shield" T={T}>Policy engine</SubHeading>
        <p style={body}>
          Once intent is confirmed as a bulk operation, policy checks run synchronously inside the Convex mutation before writing any records:
        </p>
        <Table
          headers={["Rule", "Behaviour", "Threshold"]}
          rows={[
            ["Max limit",           "Hard block — job not created",          "SGD 5,000"],
            ["Max bulk items",      "Hard block — job not created",          "200 eligible cards"],
            ["Excluded statuses",   "Cards inserted as skipped items — not executed", "frozen, cancelled"],
            ["Approval threshold",  "Job created but approval flagged",      "> 25 eligible cards"],
          ]}
          T={T}
        />
        <p style={body}>
          Hard blocks surface as error bubbles in the chat. Soft gates allow the job to proceed to draft status with an approval flag — the UI renders a warning before the confirm button is enabled.
        </p>

        <SubHeading id="draft-confirm-fanout" icon="file" T={T}>Draft → confirm → fan-out</SubHeading>
        <Figure
          src="/diagrams/dispatch-job-state-machine.png"
          alt="Job State Machine diagram"
          caption="Job states — the dashed arc from completed_with_failures back to in-progress is operator-triggered via the retry failed items action."
          T={T}
        />
        <Figure
          src="/diagrams/dispatch-fanout-timing.png"
          alt="Fan-out timing diagram"
          caption="10 cards spread across a ~3,000ms window — Card 4 fails on first attempt and retries 2s later via exponential backoff."
          T={T}
        />
        <p style={body}>
          Confirming the job transitions it to in-progress and inserts one item per card — frozen and cancelled cards are inserted as skipped immediately. The frontend subscribes via a live query and re-renders as items complete.
        </p>
        <p style={body}>
          Once items are in flight, failures become the primary concern. Section 3 covers how the executor retries individual items, how operators can re-queue permanent failures, and what happens when the LLM or a card operation goes wrong.
        </p>
      </section>

      {divider}

      {/* ── 3. Exception handling ── */}
      <section>
        <SectionHeading
          id="exception-handling"
          num={3} icon="shield" title="Exception handling"
          sub="Retries, permanent failures, and graceful degradation across all layers."
          T={T}
        />

        <SubHeading id="per-item-retry" icon="settings" T={T}>Card executor — per-item retry</SubHeading>
        <Figure
          src="/diagrams/dispatch-retry-flow.png"
          alt="Per-item retry flowchart"
          caption="Each item runs in its own Convex action. The terminal-status guard at entry makes duplicate invocations a no-op — safe under Convex's at-least-once delivery."
          T={T}
        />
        <CodeBlock lang="typescript" T={T}>{`// src/lib/executor-logic.ts
export const MAX_RETRIES = 3;

export function backoffMs(retryCount: number): number {
  return Math.pow(2, retryCount) * 1000;  // 2s → 4s → 8s
}

export function isRetryExhausted(retryCount: number): boolean {
  return retryCount >= MAX_RETRIES;
}`}</CodeBlock>
        <p style={body}>
          After each terminal outcome a count mutation atomically patches the parent job&apos;s succeeded / failed / skipped tallies; once all eligible items are resolved, the job transitions to completed or completed with failures.
        </p>

        <SubHeading id="retry-failed-items" icon="link" T={T}>Retry failed items</SubHeading>
        <p style={body}>
          Operators can re-queue all retryable failed items on a completed-with-failures job. This resets their status, clears failure codes, re-opens the job to in-progress, and schedules fresh execution with a new stagger. Permanently failed items are intentionally excluded and cannot be retried.
        </p>

        <SubHeading id="llm-error-handling" T={T}>LLM error handling</SubHeading>
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

        <SubHeading id="cancel" T={T}>Cancel</SubHeading>
        <p style={body}>
          Cancelling a job finds all queued items and marks them cancelled before patching the job status. In-flight items finish naturally — they hit the terminal-status guard on entry and return early. There is no force-kill of running scheduled functions.
        </p>

        <SubHeading id="graceful-degradation" T={T}>Graceful degradation</SubHeading>
        <Note T={T} variant="ok">
          KB unavailability is caught silently — the LLM call proceeds without KB context. Policy failures surface as user-readable error messages in the chat. Partial write failures are not possible: Convex mutations are transactional.
        </Note>
      </section>
      </main>
      <NavRail T={T} />
    </div>
  );
}
