import React, { useState, useEffect, useRef } from 'react';
import { ClientProvider } from '../../sidebar/src/contexts/ClientProvider';
import { InputPanel, type QueryEntry, type QueryEntryAnalysis } from './InputPanel';
import { AnalysisView } from './AnalysisView';
import { setTicketId } from './mock-zaf-client';

// ── Theme tokens ───────────────────────────────────────────────────────────────
export type Theme = 'dark' | 'light';

export interface Tokens {
  bg: string;
  surface: string;
  elevated: string;
  border: string;
  accent: string;
  accentHover: string;
  text: string;
  textSub: string;
  muted: string;
  shimmerFrom: string;
  shimmerTo: string;
  fontMono: string;
  fontBody: string;
}

export const DARK: Tokens = {
  bg: '#020617',
  surface: '#0F172A',
  elevated: '#1E293B',
  border: '#1E293B',
  accent: '#00FBEC',      // Reap teal
  accentHover: '#00DDD0',
  text: '#F8FAFC',
  textSub: '#CBD5E1',
  muted: '#64748B',
  shimmerFrom: '#1E293B',
  shimmerTo: '#293548',
  fontMono: "'Fira Code', monospace",
  fontBody: "'Fira Sans', system-ui, sans-serif",
};

export const LIGHT: Tokens = {
  bg: '#F1F5F9',
  surface: '#FFFFFF',
  elevated: '#F8FAFC',
  border: '#E2E8F0',
  accent: '#00857E',      // Darkened Reap teal for WCAG contrast on white
  accentHover: '#006B65',
  text: '#0F172A',
  textSub: '#334155',
  muted: '#94A3B8',
  shimmerFrom: '#E2E8F0',
  shimmerTo: '#F1F5F9',
  fontMono: "'Fira Code', monospace",
  fontBody: "'Fira Sans', system-ui, sans-serif",
};

// ── BeaconLogo ─────────────────────────────────────────────────────────────────
function BeaconLogo({ accent }: { accent: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="3" fill={accent} />
      <path d="M12 2v4M12 18v4M2 12h4M18 12h4" stroke={accent} strokeWidth="2" strokeLinecap="round" opacity="0.6" />
      <path d="M5.636 5.636l2.828 2.828M15.536 15.536l2.828 2.828M5.636 18.364l2.828-2.828M15.536 8.464l2.828-2.828"
        stroke={accent} strokeWidth="1.5" strokeLinecap="round" opacity="0.35" />
    </svg>
  );
}

// ── ThemeToggle ────────────────────────────────────────────────────────────────
function ThemeToggle({ theme, onToggle, T }: { theme: Theme; onToggle: () => void; T: Tokens }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button onClick={onToggle} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 32, height: 32, borderRadius: 8,
        border: `1px solid ${T.border}`,
        background: hovered ? T.elevated : 'transparent',
        cursor: 'pointer', transition: 'all 0.15s ease', color: T.muted,
      }}>
      {theme === 'dark'
        ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
          </svg>
        : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
      }
    </button>
  );
}

// ── StatusDot ──────────────────────────────────────────────────────────────────
function StatusDot({ active, accent, muted }: { active: boolean; accent: string; muted: string }) {
  return (
    <span style={{
      display: 'inline-block', width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
      background: active ? accent : muted,
      boxShadow: active ? `0 0 6px ${accent}` : 'none',
    }} />
  );
}

// ── AnalysisProgress ───────────────────────────────────────────────────────────
const STEPS = [
  { label: 'Classifying ticket', detail: 'Extracting category, urgency, sentiment & compliance signals', endAt: 8 },
  { label: 'Retrieving KB articles', detail: 'Semantic search across help center documentation', endAt: 30 },
  { label: 'Drafting response', detail: 'Generating KB-grounded reply with jurisdiction context', endAt: Infinity },
];

function AnalysisProgress({ T }: { T: Tokens }) {
  const startRef = useRef(Date.now());
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - startRef.current) / 1000)), 500);
    return () => clearInterval(id);
  }, []);

  const activeStep = STEPS.findIndex((s, i) =>
    elapsed < s.endAt && (i === 0 || elapsed >= STEPS[i - 1].endAt)
  );
  const currentStep = activeStep === -1 ? STEPS.length - 1 : activeStep;

  return (
    <div style={{ padding: '32px 24px' }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes beacon-pulse { 0% { transform: scale(1); opacity: 0.3; } 100% { transform: scale(1.8); opacity: 0; } }
      `}</style>

      {/* Header */}
      <div style={{ marginBottom: 28, textAlign: 'center' }}>
        <div style={{ position: 'relative', width: 48, height: 48, margin: '0 auto 12px' }}>
          <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: `2px solid ${T.accent}`, opacity: 0.2, animation: 'beacon-pulse 2s ease-out infinite' }} />
          <div style={{ position: 'absolute', inset: 8, borderRadius: '50%', border: `2px solid ${T.accent}`, opacity: 0.4 }} />
          <div style={{ position: 'absolute', inset: 16, borderRadius: '50%', background: T.accent, opacity: 0.9 }} />
        </div>
        <div style={{ fontFamily: T.fontMono, fontSize: 13, fontWeight: 600, color: T.text }}>Analyzing ticket</div>
        <div style={{ fontSize: 12, color: T.muted, marginTop: 4 }}>{elapsed}s elapsed</div>
      </div>

      {/* Steps */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {STEPS.map((step, i) => {
          const done = i < currentStep;
          const active = i === currentStep;
          return (
            <div key={step.label} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', opacity: i > currentStep ? 0.35 : 1 }}>
              {/* Icon */}
              <div style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: done ? T.accent : active ? 'transparent' : T.elevated,
                border: active ? `2px solid ${T.accent}` : done ? 'none' : `2px solid ${T.border}`,
              }}>
                {done
                  ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.surface} strokeWidth="3" strokeLinecap="round" aria-hidden="true"><path d="M20 6L9 17l-5-5" /></svg>
                  : active
                    ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"
                        style={{ animation: 'spin 0.9s linear infinite' }}>
                        <circle cx="12" cy="12" r="10" stroke={T.accent} strokeWidth="3" strokeDasharray="40 20" opacity="0.3" />
                        <path d="M12 2a10 10 0 0 1 10 10" stroke={T.accent} strokeWidth="3" strokeLinecap="round" />
                      </svg>
                    : <div style={{ width: 8, height: 8, borderRadius: '50%', background: T.muted }} />
                }
              </div>
              {/* Text */}
              <div style={{ paddingTop: 4 }}>
                <div style={{ fontSize: 13, fontWeight: active ? 600 : 400, color: active ? T.text : done ? T.textSub : T.muted }}>
                  {step.label}
                </div>
                {active && (
                  <div style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>{step.detail}</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── QueueView helpers ──────────────────────────────────────────────────────────
function queueSentimentInfo(score: number): { label: string; color: string } {
  if (score < -0.5) return { label: 'Distressed', color: '#dc2626' };
  if (score < -0.2) return { label: 'Frustrated',  color: '#f59e0b' };
  if (score <  0.2) return { label: 'Neutral',     color: '#64748b' };
  if (score <  0.5) return { label: 'Satisfied',   color: '#3b82f6' };
  return               { label: 'Positive',    color: '#22c55e' };
}

const URGENCY_COLOR: Record<string, string> = {
  P1: '#dc2626', P2: '#f59e0b', P3: '#3b82f6', P4: '#64748b',
};

const ROUTING_META: Record<string, { label: string; darkColor: string; lightColor: string; bg: string }> = {
  auto_send:      { label: 'Auto Send',      darkColor: '#4ade80', lightColor: '#166534', bg: 'rgba(34,197,94,0.12)' },
  agent_assisted: { label: 'Agent Assisted', darkColor: '#60a5fa', lightColor: '#1e40af', bg: 'rgba(59,130,246,0.12)' },
  escalate:       { label: 'Escalate',       darkColor: '#f87171', lightColor: '#991b1b', bg: 'rgba(220,38,38,0.12)' },
};

function formatQueueCategory(cat: string): string {
  const map: Record<string, string> = {
    card_freeze: 'Card Freeze', kyc: 'KYC',
    transaction_dispute: 'Dispute', fx_inquiry: 'FX / Payments',
    legal_complaint: 'Legal', general_inquiry: 'General',
    account_issue: 'Account', stablecoin: 'Stablecoin',
  };
  return map[cat] ?? cat.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// ── QueueView ─────────────────────────────────────────────────────────────────
function QueueView({
  history, activeTicketId, T,
  onSelect,
}: {
  history: QueryEntry[];
  activeTicketId: string | null;
  T: Tokens;
  onSelect: (entry: QueryEntry) => void;
}) {
  if (history.length === 0) {
    return (
      <div style={{ padding: '48px 24px', textAlign: 'center', color: T.muted, fontSize: 13 }}>
        No tickets analyzed yet.
      </div>
    );
  }

  return (
    <div style={{ padding: '8px 0' }}>
      {[...history].reverse().map((entry) => {
        const isActive = entry.ticketId === activeTicketId;
        const a = entry.analysis;
        const sentiment = a ? queueSentimentInfo(a.sentiment) : null;
        const routing = a ? ROUTING_META[a.routing] : null;
        return (
          <button
            key={entry.ticketId}
            onClick={() => onSelect(entry)}
            style={{
              display: 'block', width: '100%', textAlign: 'left',
              padding: '10px 14px',
              background: isActive ? (T === DARK ? '#1D3461' : '#EFF6FF') : 'transparent',
              border: 'none', borderBottom: `1px solid ${T.border}`,
              cursor: 'pointer', fontFamily: T.fontBody,
              borderLeft: `3px solid ${isActive ? '#3B82F6' : 'transparent'}`,
              transition: 'background 0.15s ease',
            }}
          >
            {/* Row 1: subject + time */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginBottom: a ? 5 : 4 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {entry.subject}
              </span>
              <span style={{ fontSize: 11, color: T.muted, fontFamily: T.fontMono, flexShrink: 0 }}>
                {new Date(entry.submittedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>

            {/* Row 2: badges (only when analysis is ready) */}
            {a && routing && sentiment && (
              <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap', marginBottom: 5 }}>
                {/* Urgency */}
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: '1px 5px', borderRadius: 3,
                  background: `${URGENCY_COLOR[a.urgency]}22`, color: URGENCY_COLOR[a.urgency],
                }}>
                  {a.urgency}
                </span>
                {/* Category */}
                <span style={{
                  fontSize: 10, fontWeight: 500, padding: '1px 5px', borderRadius: 3,
                  background: T === DARK ? 'rgba(100,116,139,0.15)' : 'rgba(100,116,139,0.1)',
                  color: T.muted,
                }}>
                  {formatQueueCategory(a.category)}
                </span>
                {/* Routing */}
                <span style={{
                  fontSize: 10, fontWeight: 600, padding: '1px 5px', borderRadius: 3,
                  background: routing.bg,
                  color: T === DARK ? routing.darkColor : routing.lightColor,
                }}>
                  {routing.label}
                </span>
                {/* Sentiment dot */}
                <span style={{
                  display: 'inline-block', width: 6, height: 6, borderRadius: '50%',
                  background: sentiment.color,
                  boxShadow: `0 0 4px ${sentiment.color}`,
                  marginLeft: 2, flexShrink: 0,
                }} title={sentiment.label} />
              </div>
            )}

            {/* Row 3: body snippet */}
            <div style={{ fontSize: 12, color: T.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {entry.body.slice(0, 90)}
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ── EmptyState ─────────────────────────────────────────────────────────────────
function EmptyState({ T }: { T: Tokens }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 16, padding: 32, textAlign: 'center' }}>
      <div style={{ position: 'relative', width: 56, height: 56 }}>
        <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: `2px solid ${T.accent}`, opacity: 0.2, animation: 'beacon-pulse 2s ease-out infinite' }} />
        <div style={{ position: 'absolute', inset: 8, borderRadius: '50%', border: `2px solid ${T.accent}`, opacity: 0.4 }} />
        <div style={{ position: 'absolute', inset: 16, borderRadius: '50%', background: T.accent, opacity: 0.8 }} />
        <style>{`
          @keyframes beacon-pulse { 0% { transform: scale(1); opacity: 0.3; } 100% { transform: scale(1.8); opacity: 0; } }
        `}</style>
      </div>
      <div>
        <div style={{ fontFamily: T.fontMono, fontSize: 13, fontWeight: 600, color: T.text, marginBottom: 6 }}>Awaiting ticket</div>
        <div style={{ fontSize: 13, color: T.muted, maxWidth: 240, lineHeight: 1.6 }}>
          Select an example or paste a customer message, then click Analyze to see AI triage results.
        </div>
      </div>
    </div>
  );
}

// ── DemoApp ────────────────────────────────────────────────────────────────────
export function DemoApp() {
  const [currentTicketId, setCurrentTicketId] = useState<string | null>(null);
  const [history, setHistory] = useState<QueryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [theme, setTheme] = useState<Theme>('dark');
  const [rightTab, setRightTab] = useState<'analysis' | 'queue'>('analysis');

  const T = theme === 'dark' ? DARK : LIGHT;

  const handleAnalyze = (ticketId: string, entry: QueryEntry) => {
    setTicketId(ticketId);
    setCurrentTicketId(ticketId);
    setLoading(false);
    setRightTab('analysis');
    setHistory(prev => {
      const exists = prev.find(e => e.ticketId === ticketId);
      return exists ? prev : [...prev, entry];
    });
  };

  const handleSubmitStart = () => {
    setLoading(true);
    setRightTab('analysis');
  };

  const handleQueueSelect = (entry: QueryEntry) => {
    handleAnalyze(entry.ticketId, entry);
  };

  const handleAnalysisReady = (ticketId: string, analysis: QueryEntryAnalysis) => {
    setHistory(prev => prev.map(e => e.ticketId === ticketId ? { ...e, analysis } : e));
  };

  const showTabs = !loading && (currentTicketId !== null || history.length > 0);

  const rightContent = () => {
    if (rightTab === 'queue') {
      return <QueueView history={history} activeTicketId={currentTicketId} T={T} onSelect={handleQueueSelect} />;
    }
    if (loading) return <AnalysisProgress T={T} />;
    if (!currentTicketId) return <EmptyState T={T} />;
    const entry = history.find(e => e.ticketId === currentTicketId);
    return <AnalysisView key={currentTicketId} ticketId={currentTicketId} theme={theme} subject={entry?.subject} body={entry?.body} onAnalysisReady={handleAnalysisReady} />;
  };

  return (
    <ClientProvider>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', background: T.bg, fontFamily: T.fontBody, transition: 'background 0.2s ease', color: T.text }}>

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <header style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 20px', height: 48, flexShrink: 0, borderBottom: `1px solid ${T.border}`, background: T.surface }}>
          <BeaconLogo accent={T.accent} />
          <span style={{ fontFamily: T.fontMono, fontWeight: 600, fontSize: 14, color: T.text, letterSpacing: '0.02em' }}>Beacon</span>
          <span style={{ color: T.muted, fontSize: 12, marginLeft: 2 }}>/ demo</span>
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <StatusDot active={!!currentTicketId || loading} accent={loading ? '#F59E0B' : T.accent} muted={T.muted} />
              <span style={{ fontSize: 12, color: T.muted, fontFamily: T.fontMono }}>
                {loading ? 'analyzing…' : currentTicketId ? `#${currentTicketId.slice(-6)}` : 'idle'}
              </span>
            </div>
            <ThemeToggle theme={theme} onToggle={() => setTheme(t => t === 'dark' ? 'light' : 'dark')} T={T} />
            <button
              onClick={() => {
                localStorage.setItem('beaconTheme', theme);
                window.location.hash = '#/dashboard';
              }}
              style={{
                background: 'transparent', border: `1px solid ${T.border}`, borderRadius: 8,
                padding: '4px 12px', fontSize: 12, color: T.textSub, cursor: 'pointer',
                fontFamily: T.fontBody,
              }}
            >
              Dashboard →
            </button>
          </div>
        </header>

        {/* ── Body ────────────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

          {/* Left: input panel */}
          <div style={{ width: 340, flexShrink: 0, borderRight: `1px solid ${T.border}`, overflowY: 'auto', background: T.surface }}>
            <InputPanel
              onAnalyze={handleAnalyze}
              onSubmitStart={handleSubmitStart}
              history={history}
              activeTicketId={currentTicketId}
              loading={loading}
              theme={theme}
            />
          </div>

          {/* Right: content + optional tab bar */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Tab bar (only when there's something to show) */}
            {showTabs && (
              <div style={{ display: 'flex', borderBottom: `1px solid ${T.border}`, background: T.surface, flexShrink: 0 }}>
                {(['analysis', 'queue'] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setRightTab(tab)}
                    style={{
                      padding: '10px 20px', border: 'none', background: 'transparent',
                      borderBottom: `2px solid ${rightTab === tab ? T.accent : 'transparent'}`,
                      color: rightTab === tab ? T.text : T.muted,
                      fontFamily: T.fontBody, fontSize: 13, fontWeight: rightTab === tab ? 600 : 400,
                      cursor: 'pointer', transition: 'all 0.15s ease',
                    }}
                  >
                    {tab === 'analysis' ? 'Analysis' : `Queue (${history.length})`}
                  </button>
                ))}
              </div>
            )}
            <div style={{ flex: 1, overflowY: 'auto', padding: rightTab === 'queue' ? 0 : 16 }}>
              {rightContent()}
            </div>
          </div>
        </div>
      </div>
    </ClientProvider>
  );
}
