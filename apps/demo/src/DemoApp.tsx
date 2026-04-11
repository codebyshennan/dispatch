import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ClientProvider } from '../../sidebar/src/contexts/ClientProvider';
import { AnalysisView } from './AnalysisView';
import { InboxList } from './InboxList';
import { TicketThread } from './TicketThread';
import { NewTicketModal } from './NewTicketModal';
import { useSimulation } from './useSimulation';
import { SEED_TICKETS, type InboxTicket, type QueryEntryAnalysis } from './inbox-data';
import { setTicketId } from './mock-zaf-client';

// ── Theme tokens ────────────────────────────────────────────────────────────────
export type Theme = 'dark' | 'light';

export interface Tokens {
  bg: string; surface: string; elevated: string; border: string;
  accent: string; accentHover: string; text: string; textSub: string;
  muted: string; shimmerFrom: string; shimmerTo: string;
  fontMono: string; fontBody: string;
}

export const DARK: Tokens = {
  bg: '#020617', surface: '#0F172A', elevated: '#1E293B', border: '#1E293B',
  accent: '#00FBEC', accentHover: '#00DDD0', text: '#F8FAFC', textSub: '#CBD5E1',
  muted: '#64748B', shimmerFrom: '#1E293B', shimmerTo: '#293548',
  fontMono: "'Fira Code', monospace", fontBody: "'Fira Sans', system-ui, sans-serif",
};

export const LIGHT: Tokens = {
  bg: '#F1F5F9', surface: '#FFFFFF', elevated: '#F8FAFC', border: '#E2E8F0',
  accent: '#00857E', accentHover: '#006B65', text: '#0F172A', textSub: '#334155',
  muted: '#94A3B8', shimmerFrom: '#E2E8F0', shimmerTo: '#F1F5F9',
  fontMono: "'Fira Code', monospace", fontBody: "'Fira Sans', system-ui, sans-serif",
};

// ── BeaconLogo ──────────────────────────────────────────────────────────────────
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

// ── ThemeToggle ──────────────────────────────────────────────────────────────────
function ThemeToggle({ theme, onToggle, T }: { theme: Theme; onToggle: () => void; T: Tokens }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button onClick={onToggle} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 32, height: 32, borderRadius: 8, border: `1px solid ${T.border}`,
        background: hovered ? T.elevated : 'transparent', cursor: 'pointer',
        transition: 'all 0.15s ease', color: T.muted,
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

// ── AnalysisProgress ────────────────────────────────────────────────────────────
const STEPS = [
  { label: 'Classifying ticket',    detail: 'Extracting category, urgency, sentiment & compliance signals', endAt: 8 },
  { label: 'Retrieving KB articles', detail: 'Semantic search across help center documentation',            endAt: 30 },
  { label: 'Drafting response',      detail: 'Generating KB-grounded reply with jurisdiction context',      endAt: Infinity },
];

function AnalysisProgress({ T }: { T: Tokens }) {
  const startRef = useRef(Date.now());
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - startRef.current) / 1000)), 500);
    return () => clearInterval(id);
  }, []);
  const activeStep = STEPS.findIndex((s, i) => elapsed < s.endAt && (i === 0 || elapsed >= STEPS[i - 1].endAt));
  const currentStep = activeStep === -1 ? STEPS.length - 1 : activeStep;
  return (
    <div style={{ padding: '32px 24px' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } } @keyframes beacon-pulse { 0% { transform: scale(1); opacity: 0.3; } 100% { transform: scale(1.8); opacity: 0; } }`}</style>
      <div style={{ marginBottom: 28, textAlign: 'center' }}>
        <div style={{ position: 'relative', width: 48, height: 48, margin: '0 auto 12px' }}>
          <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: `2px solid ${T.accent}`, opacity: 0.2, animation: 'beacon-pulse 2s ease-out infinite' }} />
          <div style={{ position: 'absolute', inset: 8, borderRadius: '50%', border: `2px solid ${T.accent}`, opacity: 0.4 }} />
          <div style={{ position: 'absolute', inset: 16, borderRadius: '50%', background: T.accent, opacity: 0.9 }} />
        </div>
        <div style={{ fontFamily: T.fontMono, fontSize: 13, fontWeight: 600, color: T.text }}>Analyzing ticket</div>
        <div style={{ fontSize: 12, color: T.muted, marginTop: 4 }}>{elapsed}s elapsed</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {STEPS.map((step, i) => {
          const done = i < currentStep; const active = i === currentStep;
          return (
            <div key={step.label} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', opacity: i > currentStep ? 0.35 : 1 }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: done ? T.accent : active ? 'transparent' : T.elevated, border: active ? `2px solid ${T.accent}` : done ? 'none' : `2px solid ${T.border}` }}>
                {done
                  ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.surface} strokeWidth="3" strokeLinecap="round" aria-hidden="true"><path d="M20 6L9 17l-5-5" /></svg>
                  : active
                    ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ animation: 'spin 0.9s linear infinite' }}><circle cx="12" cy="12" r="10" stroke={T.accent} strokeWidth="3" strokeDasharray="40 20" opacity="0.3" /><path d="M12 2a10 10 0 0 1 10 10" stroke={T.accent} strokeWidth="3" strokeLinecap="round" /></svg>
                    : <div style={{ width: 8, height: 8, borderRadius: '50%', background: T.muted }} />}
              </div>
              <div style={{ paddingTop: 4 }}>
                <div style={{ fontSize: 13, fontWeight: active ? 600 : 400, color: active ? T.text : done ? T.textSub : T.muted }}>{step.label}</div>
                {active && <div style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>{step.detail}</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── EmptyState ──────────────────────────────────────────────────────────────────
function EmptyState({ T }: { T: Tokens }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 16, padding: 32, textAlign: 'center' }}>
      <style>{`@keyframes beacon-pulse { 0% { transform: scale(1); opacity: 0.3; } 100% { transform: scale(1.8); opacity: 0; } }`}</style>
      <div style={{ position: 'relative', width: 56, height: 56 }}>
        <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: `2px solid ${T.accent}`, opacity: 0.2, animation: 'beacon-pulse 2s ease-out infinite' }} />
        <div style={{ position: 'absolute', inset: 8, borderRadius: '50%', border: `2px solid ${T.accent}`, opacity: 0.4 }} />
        <div style={{ position: 'absolute', inset: 16, borderRadius: '50%', background: T.accent, opacity: 0.8 }} />
      </div>
      <div>
        <div style={{ fontFamily: T.fontMono, fontSize: 13, fontWeight: 600, color: T.text, marginBottom: 6 }}>Awaiting selection</div>
        <div style={{ fontSize: 13, color: T.muted, maxWidth: 240, lineHeight: 1.6 }}>
          Select a ticket from the inbox to see Beacon's analysis.
        </div>
      </div>
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────────
const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

function routingToStatus(routing: string): InboxTicket['status'] {
  if (routing === 'auto_send') return 'sent';
  if (routing === 'escalate') return 'escalated';
  return 'triaged';
}

// ── Seed classification cache ────────────────────────────────────────────────────
const SEED_CACHE_KEY = 'beacon-seed-cache-v1';

interface SeedCacheEntry {
  originalId: string;          // seed-001 … seed-012
  serverId: string;            // server-assigned UUID
  classification: QueryEntryAnalysis;
  payload: unknown;            // full SidebarPayload for /restore
}

function loadSeedCache(): Map<string, SeedCacheEntry> {
  try {
    const raw = localStorage.getItem(SEED_CACHE_KEY);
    if (!raw) return new Map();
    const entries: SeedCacheEntry[] = JSON.parse(raw);
    return new Map(entries.map(e => [e.originalId, e]));
  } catch {
    return new Map();
  }
}

function appendSeedCache(entry: SeedCacheEntry, current: SeedCacheEntry[]) {
  try {
    localStorage.setItem(SEED_CACHE_KEY, JSON.stringify([...current, entry]));
  } catch { /* storage full — ignore */ }
}

function makeTmpId(): string {
  return `tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// ── DemoApp ──────────────────────────────────────────────────────────────────────
export function DemoApp() {
  const [inbox, setInbox] = useState<InboxTicket[]>([]);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [simRunning, setSimRunning] = useState(false);
  const [simSpeed, setSimSpeed] = useState<'slow' | 'med' | 'fast'>('med');
  const [modalOpen, setModalOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>('dark');

  const T = theme === 'dark' ? DARK : LIGHT;

  // ── ZAF wiring ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (selectedTicketId) setTicketId(selectedTicketId);
  }, [selectedTicketId]);

  // ── Core ticket helper ───────────────────────────────────────────────────────
  const analyzeTicket = useCallback(async (
    ticket: InboxTicket,
    onComplete?: (serverId: string, classification: QueryEntryAnalysis) => void,
  ) => {
    const tmpId = ticket.ticketId;
    setInbox(prev => [{ ...ticket, ticketId: tmpId, status: 'processing' }, ...prev]);
    try {
      const res = await fetch(`${API_URL}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject: ticket.subject, body: ticket.body }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const { ticketId: serverId, classification } = await res.json() as {
        ticketId: string;
        classification: QueryEntryAnalysis;
      };
      const status = routingToStatus(classification.routing);
      setInbox(prev => prev.map(t =>
        t.ticketId === tmpId ? { ...t, ticketId: serverId, status, analysis: classification } : t
      ));
      setSelectedTicketId(prev => prev === tmpId ? serverId : prev);
      onComplete?.(serverId, classification);
    } catch {
      // leave as processing on error
    }
  }, []);

  // ── Seed on mount (with localStorage cache) ──────────────────────────────────
  const seededRef = useRef(false);
  const seedCacheRef = useRef<SeedCacheEntry[]>([]);

  useEffect(() => {
    if (seededRef.current) return;
    seededRef.current = true;

    const cacheMap = loadSeedCache();
    const toRestore: Array<{ ticketId: string; payload: unknown; subject: string; body: string }> = [];
    const immediateTickets: InboxTicket[] = [];
    const toAnalyze: InboxTicket[] = [];

    for (const t of SEED_TICKETS) {
      const hit = cacheMap.get(t.ticketId);
      if (hit) {
        immediateTickets.push({
          ...t,
          ticketId: hit.serverId,
          status: routingToStatus(hit.classification.routing),
          analysis: hit.classification,
        });
        toRestore.push({ ticketId: hit.serverId, payload: hit.payload, subject: t.subject, body: t.body });
        seedCacheRef.current.push(hit);
      } else {
        toAnalyze.push(t);
      }
    }

    // Populate inbox instantly from cache
    if (immediateTickets.length > 0) {
      setInbox(immediateTickets);
      // Restore full payloads to server so AnalysisView can fetch /context/:id
      fetch(`${API_URL}/restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(toRestore),
      }).catch(() => {});
    }

    // Analyze any uncached tickets and cache the results
    toAnalyze.forEach(t => {
      analyzeTicket(t, (serverId, classification) => {
        fetch(`${API_URL}/context/${serverId}`)
          .then(r => r.json())
          .then(payload => {
            const entry: SeedCacheEntry = { originalId: t.ticketId, serverId, classification, payload };
            appendSeedCache(entry, seedCacheRef.current);
            seedCacheRef.current.push(entry);
          })
          .catch(() => {});
      });
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Simulation ───────────────────────────────────────────────────────────────
  useSimulation({
    speed: simSpeed,
    isRunning: simRunning,
    onTick: analyzeTicket,
  });

  // ── Analysis ready callback ───────────────────────────────────────────────────
  const handleAnalysisReady = useCallback((ticketId: string, analysis: QueryEntryAnalysis) => {
    setInbox(prev => prev.map(t =>
      t.ticketId === ticketId ? { ...t, analysis } : t
    ));
  }, []);

  // ── Modal submit ──────────────────────────────────────────────────────────────
  const handleModalAnalyze = useCallback((subject: string, body: string) => {
    const ticket: InboxTicket = {
      ticketId: makeTmpId(),
      subject: subject || body.slice(0, 60),
      body,
      from: 'agent@demo.local',
      submittedAt: new Date().toISOString(),
      status: 'processing',
    };
    analyzeTicket(ticket);
  }, [analyzeTicket]);

  // ── Derived values ────────────────────────────────────────────────────────────
  const processingCount = inbox.filter(t => t.status === 'processing').length;
  const selectedTicket = inbox.find(t => t.ticketId === selectedTicketId) ?? null;

  return (
    <ClientProvider>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', background: T.bg, fontFamily: T.fontBody, color: T.text, transition: 'background 0.2s ease' }}>
        <style>{`@keyframes beacon-pulse { 0% { transform: scale(1); opacity: 0.3; } 100% { transform: scale(1.8); opacity: 0; } }`}</style>

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <header style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px', height: 48, flexShrink: 0, borderBottom: `1px solid ${T.border}`, background: T.surface }}>
          <BeaconLogo accent={T.accent} />
          <span style={{ fontFamily: T.fontMono, fontWeight: 600, fontSize: 14, color: T.text, letterSpacing: '0.02em' }}>Beacon</span>
          <span style={{ color: T.muted, fontSize: 12, marginLeft: 2 }}>/ demo</span>

          {/* Simulation controls — center */}
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            {/* Speed presets */}
            <div style={{ display: 'flex', borderRadius: 6, overflow: 'hidden', border: `1px solid ${T.border}` }}>
              {(['slow', 'med', 'fast'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setSimSpeed(s)}
                  style={{
                    padding: '4px 10px', border: 'none', fontSize: 11, fontFamily: T.fontBody,
                    background: simSpeed === s ? T.accent : T.elevated,
                    color: simSpeed === s ? '#0F172A' : T.muted,
                    fontWeight: simSpeed === s ? 700 : 400,
                    cursor: 'pointer', transition: 'all 0.15s ease',
                  }}
                >
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
            {/* Start / Stop */}
            <button
              onClick={() => setSimRunning(r => !r)}
              style={{
                padding: '4px 14px', borderRadius: 6, border: 'none', fontSize: 12,
                fontFamily: T.fontBody, fontWeight: 600, cursor: 'pointer',
                background: simRunning ? '#ef4444' : T.accent,
                color: simRunning ? '#fff' : '#0F172A',
                transition: 'all 0.15s ease',
              }}
            >
              {simRunning ? 'Stop' : 'Start'} Simulation
            </button>
            {/* Counter */}
            <span style={{ fontSize: 12, color: T.muted, fontFamily: T.fontMono, minWidth: 120 }}>
              {inbox.length} tickets{processingCount > 0 ? ` · ${processingCount} processing` : ''}
            </span>
          </div>

          {/* Right controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={() => setModalOpen(true)}
              style={{
                padding: '5px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                border: 'none', background: T.accent, color: '#0F172A',
                fontFamily: T.fontBody, cursor: 'pointer', letterSpacing: '0.02em',
              }}
            >
              + New Ticket
            </button>
            <ThemeToggle theme={theme} onToggle={() => setTheme(t => t === 'dark' ? 'light' : 'dark')} T={T} />
            <button
              onClick={() => { localStorage.setItem('beaconTheme', theme); window.location.hash = '#/dashboard'; }}
              style={{ background: 'transparent', border: `1px solid ${T.border}`, borderRadius: 8, padding: '4px 12px', fontSize: 12, color: T.textSub, cursor: 'pointer', fontFamily: T.fontBody }}
            >
              Dashboard →
            </button>
          </div>
        </header>

        {/* ── Body ────────────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

          {/* Left: inbox list */}
          <div style={{ width: 280, flexShrink: 0, borderRight: `1px solid ${T.border}`, overflowY: 'auto', background: T.surface }}>
            <InboxList
              inbox={inbox}
              selectedTicketId={selectedTicketId}
              T={T}
              onSelect={ticket => setSelectedTicketId(ticket.ticketId)}
            />
          </div>

          {/* Right: thread + analysis split */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {selectedTicket ? (
              <>
                {/* Top ~45%: ticket thread */}
                <div style={{ flex: '0 0 45%', borderBottom: `1px solid ${T.border}`, overflow: 'hidden' }}>
                  <TicketThread ticket={selectedTicket} T={T} />
                </div>
                {/* Bottom ~55%: analysis or progress */}
                <div style={{ flex: 1, overflowY: 'auto', padding: selectedTicket.status === 'processing' ? 0 : 16 }}>
                  {selectedTicket.status === 'processing'
                    ? <AnalysisProgress T={T} />
                    : <AnalysisView
                        key={selectedTicket.ticketId}
                        ticketId={selectedTicket.ticketId}
                        theme={theme}
                        subject={selectedTicket.subject}
                        body={selectedTicket.body}
                        onAnalysisReady={handleAnalysisReady}
                      />
                  }
                </div>
              </>
            ) : (
              <EmptyState T={T} />
            )}
          </div>
        </div>

        {/* ── Modal ────────────────────────────────────────────────────────── */}
        <NewTicketModal
          open={modalOpen}
          T={T}
          onClose={() => setModalOpen(false)}
          onAnalyze={handleModalAnalyze}
        />
      </div>
    </ClientProvider>
  );
}
