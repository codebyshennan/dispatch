"use client";
export const dynamic = "force-dynamic";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useTheme } from "../theme";

function StatCard({ label, value, sub, accent, T }: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: boolean;
  T: ReturnType<typeof useTheme>["T"];
}) {
  return (
    <div style={{
      borderRadius: 12,
      border: `1px solid ${accent ? T.accent + "40" : T.border}`,
      background: accent ? T.accent + "0a" : T.surface,
      padding: "16px 20px",
    }}>
      <div style={{
        fontSize: 11, fontWeight: 500, letterSpacing: "0.06em",
        textTransform: "uppercase", color: T.muted, marginBottom: 6,
      }}>
        {label}
      </div>
      <div style={{
        fontSize: 28, fontWeight: 700, fontFamily: T.fontMono,
        color: accent ? T.accent : T.text,
      }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 11, color: T.muted, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function SectionLabel({ children, T }: { children: string; T: ReturnType<typeof useTheme>["T"] }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 700, letterSpacing: "0.1em",
      textTransform: "uppercase", color: T.muted,
      fontFamily: T.fontMono, marginBottom: 10,
    }}>
      {children}
    </div>
  );
}

function pct(n: number | null, fallback = "—") {
  return n === null ? fallback : `${Math.round(n * 100)}%`;
}

export default function MetricsPage() {
  const { T } = useTheme();
  const m = useQuery(api.metrics.getMetrics);

  if (m === undefined) {
    return (
      <main style={{ maxWidth: 680, margin: "0 auto", padding: "48px 24px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} style={{ height: 88, borderRadius: 12, background: T.elevated, opacity: 0.6, animation: "pulse 1.5s ease-in-out infinite" }} />
          ))}
        </div>
        <style>{`@keyframes pulse { 0%,100%{opacity:.6} 50%{opacity:.3} }`}</style>
      </main>
    );
  }

  const isEmpty = m.jobsCreated === 0 && m.feedbackUp === 0 && m.threadCount === 0;

  return (
    <main style={{ maxWidth: 680, margin: "0 auto", padding: "48px 24px" }}>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: T.text, margin: 0, fontFamily: T.fontMono }}>
          Metrics
        </h1>
        <p style={{ fontSize: 13, color: T.muted, marginTop: 4 }}>
          Aggregate usage across all sessions
        </p>
      </div>

      {isEmpty ? (
        <div style={{
          borderRadius: 12, border: `1px solid ${T.border}`,
          background: T.surface, padding: "48px 24px",
          textAlign: "center", color: T.muted, fontSize: 13,
        }}>
          No data yet. Start a thread to see metrics here.
        </div>
      ) : (
        <>
          {/* ── Operations ── */}
          <div style={{ marginBottom: 28 }}>
            <SectionLabel T={T}>Operations</SectionLabel>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
              <StatCard
                label="Cards updated"
                value={m.totalCardsUpdated.toLocaleString()}
                sub="total succeeded across all jobs"
                accent
                T={T}
              />
              <StatCard
                label="Completion rate"
                value={pct(m.completionRate)}
                sub={`${m.jobsCompleted} of ${m.jobsCreated} jobs confirmed`}
                T={T}
              />
              <StatCard
                label="Card success rate"
                value={pct(m.cardSuccessRate)}
                sub="succeeded / eligible in completed jobs"
                T={T}
              />
              <StatCard
                label="Jobs created"
                value={m.jobsCreated}
                sub={`${m.jobsCompleted} completed`}
                T={T}
              />
              <StatCard
                label="Avg cards / job"
                value={m.avgCardsPerJob}
                sub="eligible cards per operation"
                T={T}
              />
              <StatCard
                label="Threads"
                value={m.threadCount}
                sub={`${m.bulkOpThreads} ops · ${m.questionThreads} Q&A`}
                T={T}
              />
            </div>
          </div>

          {/* ── AI Quality ── */}
          <div style={{ marginBottom: 28 }}>
            <SectionLabel T={T}>AI quality</SectionLabel>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
              <StatCard
                label="Acceptance rate"
                value={pct(m.aiAcceptanceRate)}
                sub={`${m.feedbackUp} up · ${m.feedbackDown} down`}
                accent={m.aiAcceptanceRate !== null && m.aiAcceptanceRate >= 0.8}
                T={T}
              />
              <StatCard label="Thumbs up" value={m.feedbackUp} T={T} />
              <StatCard label="Thumbs down" value={m.feedbackDown} T={T} />
            </div>
          </div>

          {/* ── KB Gaps ── */}
          {m.topKbGaps.length > 0 && (
            <div>
              <SectionLabel T={T}>Top KB gaps</SectionLabel>
              <div style={{
                borderRadius: 12, border: `1px solid ${T.border}`,
                background: T.surface, overflow: "hidden",
              }}>
                {m.topKbGaps.map((gap, i) => (
                  <div key={gap.query} style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "11px 20px",
                    borderBottom: i < m.topKbGaps.length - 1 ? `1px solid ${T.border}` : undefined,
                    fontSize: 13,
                  }}>
                    <span style={{
                      color: T.textSub, overflow: "hidden",
                      textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "85%",
                    }}>
                      {gap.query}
                    </span>
                    <span style={{ color: T.muted, fontFamily: T.fontMono, flexShrink: 0, marginLeft: 12 }}>
                      ×{gap.count}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </main>
  );
}
