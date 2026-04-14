"use client";
export const dynamic = "force-dynamic";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useTheme } from "../theme";

function StatCard({ label, value, sub, T }: {
  label: string;
  value: string | number;
  sub?: string;
  T: ReturnType<typeof useTheme>["T"];
}) {
  return (
    <div style={{
      borderRadius: 12,
      border: `1px solid ${T.border}`,
      background: T.surface,
      padding: "16px 20px",
    }}>
      <div style={{ fontSize: 11, fontWeight: 500, letterSpacing: "0.06em", textTransform: "uppercase", color: T.muted, marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, color: T.text, fontFamily: T.fontMono }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: 11, color: T.muted, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

export default function MetricsPage() {
  const { T } = useTheme();
  const metrics = useQuery(api.metrics.getMetrics);

  if (metrics === undefined) {
    return (
      <main style={{ maxWidth: 640, margin: "0 auto", padding: "48px 24px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} style={{ height: 88, borderRadius: 12, background: T.elevated, opacity: 0.6 }} />
          ))}
        </div>
        <style>{`@keyframes pulse { 0%,100%{opacity:.6} 50%{opacity:.3} }`}</style>
      </main>
    );
  }

  const acceptanceRate = metrics.draftAcceptanceRate !== null
    ? `${Math.round(metrics.draftAcceptanceRate * 100)}%`
    : "—";

  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: "48px 24px" }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: T.text, margin: 0, fontFamily: T.fontMono }}>
          Metrics
        </h1>
        <p style={{ fontSize: 13, color: T.muted, marginTop: 4 }}>
          Aggregate usage across all sessions
        </p>
      </div>

      {/* Stat grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10, marginBottom: 28 }}>
        <StatCard label="Jobs created" value={metrics.jobsCreated} T={T} />
        <StatCard label="AI acceptance rate" value={acceptanceRate}
          sub={`${metrics.feedbackUp} up · ${metrics.feedbackDown} down`} T={T} />
        <StatCard label="Thumbs up" value={metrics.feedbackUp} T={T} />
        <StatCard label="Thumbs down" value={metrics.feedbackDown} T={T} />
      </div>

      {/* KB gap table */}
      {metrics.topKbGaps.length > 0 && (
        <div style={{
          borderRadius: 12,
          border: `1px solid ${T.border}`,
          background: T.surface,
          overflow: "hidden",
        }}>
          <div style={{
            padding: "12px 20px",
            borderBottom: `1px solid ${T.border}`,
          }}>
            <h2 style={{ fontSize: 13, fontWeight: 500, color: T.textSub, margin: 0 }}>
              Top KB gaps
            </h2>
          </div>
          {metrics.topKbGaps.map((gap) => (
            <div key={gap.query} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "10px 20px",
              borderBottom: `1px solid ${T.border}`,
              fontSize: 13,
            }}>
              <span style={{ color: T.textSub, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "80%" }}>
                {gap.query}
              </span>
              <span style={{ color: T.muted, fontFamily: T.fontMono, flexShrink: 0, marginLeft: 12 }}>
                ×{gap.count}
              </span>
            </div>
          ))}
        </div>
      )}

      {metrics.jobsCreated === 0 && metrics.feedbackUp === 0 && (
        <div style={{
          borderRadius: 12,
          border: `1px solid ${T.border}`,
          background: T.surface,
          padding: "48px 24px",
          textAlign: "center",
          color: T.muted,
          fontSize: 13,
        }}>
          No data yet. Create a job and submit feedback to see metrics here.
        </div>
      )}
    </main>
  );
}
