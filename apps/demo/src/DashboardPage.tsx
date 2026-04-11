import React, { useState, useEffect } from 'react';
import { DARK, LIGHT, type Theme, type Tokens } from './DemoApp';

interface KbGapEntry {
  category: string;
  maxSimilarity: number;
  ticketCount: number;
  detectedAt: string;
}

interface VocTheme {
  theme: string;
  severity: 'high' | 'medium';
}

interface Metrics {
  ticketsProcessed: number;
  deflectionRate: number;
  draftAcceptanceRate: number;
  routingCounts: { auto_send: number; agent_assisted: number; escalate: number };
  kbGaps: KbGapEntry[];
  vocThemes: VocTheme[];
  sessionStartedAt: string;
}

function formatCategory(cat: string): string {
  const map: Record<string, string> = {
    card_freeze: 'Card Freeze', kyc: 'KYC Verification',
    transaction_dispute: 'Transaction Dispute', fx_inquiry: 'FX / Payments',
    legal_complaint: 'Legal Complaint', general_inquiry: 'General Inquiry',
    account_issue: 'Account Issue', stablecoin: 'Stablecoin',
  };
  return map[cat] ?? cat.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

// ── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({
  label, value, sub, color, T,
}: { label: string; value: string; sub: string; color: string; T: Tokens }) {
  return (
    <div style={{
      background: T.surface, borderRadius: 12, padding: '20px 24px',
      border: `1px solid ${T.border}`, textAlign: 'center', flex: 1,
    }}>
      <div style={{ fontSize: 36, fontWeight: 700, color, fontFamily: T.fontMono, lineHeight: 1 }}>
        {value}
      </div>
      <div style={{ fontSize: 13, color: T.muted, marginTop: 6, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
        {label}
      </div>
      <div style={{ fontSize: 12, color: T.textSub, marginTop: 4 }}>{sub}</div>
    </div>
  );
}

// ── Routing Bar ───────────────────────────────────────────────────────────────
function RoutingBar({ counts, total, T }: { counts: Metrics['routingCounts']; total: number; T: Tokens }) {
  const segments = [
    { key: 'auto_send', label: 'Auto-send', color: '#4ade80' },
    { key: 'agent_assisted', label: 'Agent-assisted', color: '#3b82f6' },
    { key: 'escalate', label: 'Escalated', color: '#ef4444' },
  ] as const;

  const safeTotal = Math.max(total, 1);

  return (
    <div style={{ background: T.surface, borderRadius: 12, padding: '20px 24px', border: `1px solid ${T.border}` }}>
      <div style={{ fontSize: 11, color: T.muted, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 12 }}>
        Routing — {total} ticket{total !== 1 ? 's' : ''} this session
      </div>
      <div style={{ display: 'flex', height: 24, borderRadius: 6, overflow: 'hidden', marginBottom: 10 }}>
        {segments.map(({ key, color }) => {
          const w = (counts[key] / safeTotal) * 100;
          if (w === 0) return null;
          return (
            <div key={key} style={{ width: `${w}%`, background: color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: key === 'auto_send' ? '#052e16' : '#fff' }}>
                {Math.round(w)}%
              </span>
            </div>
          );
        })}
        {total === 0 && (
          <div style={{ flex: 1, background: T.elevated, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 11, color: T.muted }}>No tickets yet</span>
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        {segments.map(({ key, label, color }) => (
          <span key={key} style={{ fontSize: 12, color: T.textSub, display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: color, display: 'inline-block' }} />
            {label} ({counts[key]})
          </span>
        ))}
      </div>
    </div>
  );
}

// ── KB Gaps Table ─────────────────────────────────────────────────────────────
function KbGapsTable({ gaps, T }: { gaps: KbGapEntry[]; T: Tokens }) {
  return (
    <div style={{ background: T.surface, borderRadius: 12, padding: '20px 24px', border: `1px solid ${T.border}` }}>
      <div style={{ fontSize: 11, color: T.muted, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 12 }}>
        KB Gaps — categories with weak coverage
      </div>
      {gaps.length === 0 ? (
        <div style={{ fontSize: 13, color: T.muted, padding: '8px 0' }}>No gaps detected yet</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['Category', 'Tickets', 'Max Similarity', 'Suggested Action'].map((h) => (
                <th key={h} style={{ fontSize: 11, color: T.muted, textAlign: 'left', padding: '4px 8px 8px 0', fontWeight: 500, letterSpacing: '0.03em' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {gaps.map((gap) => (
              <tr key={gap.category} style={{ borderTop: `1px solid ${T.border}` }}>
                <td style={{ padding: '8px 8px 8px 0', fontSize: 13, color: '#f59e0b', fontFamily: 'monospace' }}>
                  {formatCategory(gap.category)}
                </td>
                <td style={{ padding: '8px 8px 8px 0', fontSize: 13, color: T.text }}>
                  {gap.ticketCount}
                </td>
                <td style={{ padding: '8px 8px 8px 0', fontSize: 13, color: gap.maxSimilarity < 0.30 ? '#ef4444' : '#f59e0b' }}>
                  {gap.maxSimilarity === 0 ? 'No articles' : `${Math.round(gap.maxSimilarity * 100)}%`}
                </td>
                <td style={{ padding: '8px 0', fontSize: 12, color: T.textSub }}>
                  Add KB article for this topic
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ── VoC Themes Strip ──────────────────────────────────────────────────────────
function VocStrip({ themes, T }: { themes: VocTheme[]; T: Tokens }) {
  return (
    <div style={{ background: T.surface, borderRadius: 12, padding: '20px 24px', border: `1px solid ${T.border}` }}>
      <div style={{ fontSize: 11, color: T.muted, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 12 }}>
        VoC Themes — monthly correlation (static in demo)
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {themes.map((t) => (
          <div key={t.theme} style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: T.elevated, borderRadius: 8, padding: '8px 14px',
            border: `1px solid ${T.border}`,
          }}>
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
                <circle cx="5" cy="5" r="5" fill={t.severity === 'high' ? '#ef4444' : '#f59e0b'} />
              </svg>
            <span style={{ fontSize: 13, color: T.text }}>{t.theme}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── DashboardPage ─────────────────────────────────────────────────────────────
export function DashboardPage() {
  const savedTheme = (localStorage.getItem('beaconTheme') as Theme | null) ?? 'dark';
  const [theme] = useState<Theme>(savedTheme);
  const T = theme === 'dark' ? DARK : LIGHT;

  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    const fetchMetrics = () => {
      fetch('/api/metrics')
        .then((r) => r.json())
        .then((data: Metrics) => {
          setMetrics(data);
          setLastUpdated(new Date());
        })
        .catch(() => {/* server not running — ignore */});
    };

    fetchMetrics();
    const interval = setInterval(fetchMetrics, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{
      minHeight: '100vh', background: T.bg, color: T.text,
      fontFamily: T.fontBody, display: 'flex', flexDirection: 'column',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '14px 32px',
        borderBottom: `1px solid ${T.border}`,
        background: T.surface,
      }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="3" fill={T.accent} />
          <path d="M12 2v4M12 18v4M2 12h4M18 12h4" stroke={T.accent} strokeWidth="2" strokeLinecap="round" opacity="0.6" />
          <path d="M5.636 5.636l2.828 2.828M15.536 15.536l2.828 2.828M5.636 18.364l2.828-2.828M15.536 8.464l2.828-2.828"
            stroke={T.accent} strokeWidth="1.5" strokeLinecap="round" opacity="0.35" />
        </svg>
        <span style={{ fontWeight: 700, color: T.accent, fontSize: 15 }}>Beacon</span>
        <span style={{ color: T.muted, fontSize: 15 }}>/</span>
        <span style={{ color: T.textSub, fontSize: 15 }}>dashboard</span>
        <div style={{ flex: 1 }} />
        {lastUpdated && (
          <span style={{ fontSize: 11, color: T.muted }}>
            Updated {lastUpdated.toLocaleTimeString()}
          </span>
        )}
        <button
          onClick={() => { window.location.hash = ''; }}
          style={{
            background: 'transparent', border: `1px solid ${T.border}`, borderRadius: 8,
            padding: '6px 14px', fontSize: 13, color: T.textSub, cursor: 'pointer',
            marginLeft: 12,
          }}
        >
          ← Back to demo
        </button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, padding: '32px', maxWidth: 1100, width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>
        {!metrics ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* KPI row skeleton */}
            <div style={{ display: 'flex', gap: 16 }}>
              {[0, 1, 2].map((i) => (
                <div key={i} style={{ flex: 1, background: T.surface, borderRadius: 12, padding: '20px 24px', border: `1px solid ${T.border}` }}>
                  <div style={{ height: 36, width: 64, borderRadius: 6, background: T.elevated, margin: '0 auto 10px' }} />
                  <div style={{ height: 10, width: 80, borderRadius: 4, background: T.elevated, margin: '0 auto 6px' }} />
                  <div style={{ height: 10, width: 56, borderRadius: 4, background: T.elevated, margin: '0 auto' }} />
                </div>
              ))}
            </div>
            {/* Routing bar skeleton */}
            <div style={{ background: T.surface, borderRadius: 12, padding: '20px 24px', border: `1px solid ${T.border}` }}>
              <div style={{ height: 10, width: 120, borderRadius: 4, background: T.elevated, marginBottom: 16 }} />
              <div style={{ height: 24, borderRadius: 6, background: T.elevated, marginBottom: 10 }} />
              <div style={{ display: 'flex', gap: 20 }}>
                {[0, 1, 2].map((i) => <div key={i} style={{ height: 10, width: 80, borderRadius: 4, background: T.elevated }} />)}
              </div>
            </div>
            {/* Table skeleton */}
            <div style={{ background: T.surface, borderRadius: 12, padding: '20px 24px', border: `1px solid ${T.border}` }}>
              <div style={{ height: 10, width: 140, borderRadius: 4, background: T.elevated, marginBottom: 16 }} />
              {[0, 1, 2].map((i) => (
                <div key={i} style={{ height: 12, borderRadius: 4, background: T.elevated, marginBottom: 10, opacity: 1 - i * 0.2 }} />
              ))}
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* KPI row */}
            <div style={{ display: 'flex', gap: 16 }}>
              <KpiCard
                label="Deflection Rate"
                value={pct(metrics.deflectionRate)}
                sub="tickets handled by AI"
                color={T.accent}
                T={T}
              />
              <KpiCard
                label="Draft Acceptance"
                value={pct(metrics.draftAcceptanceRate)}
                sub="drafts used near-verbatim"
                color="#4ade80"
                T={T}
              />
              <KpiCard
                label="KB Gaps Detected"
                value={String(metrics.kbGaps.length)}
                sub={metrics.kbGaps.length > 0 ? 'needs attention' : 'all good'}
                color={metrics.kbGaps.length > 0 ? '#f59e0b' : '#4ade80'}
                T={T}
              />
            </div>

            {/* Routing bar */}
            <RoutingBar counts={metrics.routingCounts} total={metrics.ticketsProcessed} T={T} />

            {/* KB gaps */}
            <KbGapsTable gaps={metrics.kbGaps} T={T} />

            {/* VoC themes */}
            <VocStrip themes={metrics.vocThemes} T={T} />
          </div>
        )}
      </div>
    </div>
  );
}
