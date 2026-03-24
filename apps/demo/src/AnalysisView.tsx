import React, { useState, useEffect } from 'react';
import type { SidebarPayload, KBResult, QAScore } from '@beacon/core';
import { type Theme, type Tokens, DARK, LIGHT } from './DemoApp';
import { REAP_MOCK } from './mock-zaf-client';

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

// ── Helpers ───────────────────────────────────────────────────────────────────

function sentimentInfo(score: number): { label: string; color: string } {
  if (score < -0.5) return { label: 'Distressed', color: '#dc2626' };
  if (score < -0.2) return { label: 'Frustrated',  color: '#f59e0b' };
  if (score <  0.2) return { label: 'Neutral',     color: '#64748b' };
  if (score <  0.5) return { label: 'Satisfied',   color: '#3b82f6' };
  return               { label: 'Positive',    color: '#22c55e' };
}

const URGENCY_COLOR: Record<string, string> = {
  P1: '#dc2626', P2: '#f59e0b', P3: '#3b82f6', P4: '#64748b',
};

const ROUTING_META: Record<string, { label: string; color: string; bg: string }> = {
  auto_send:      { label: 'Auto Send',      color: '#166534', bg: 'rgba(34,197,94,0.12)' },
  agent_assisted: { label: 'Agent Assisted', color: '#1e40af', bg: 'rgba(59,130,246,0.12)' },
  escalate:       { label: 'Escalate',       color: '#991b1b', bg: 'rgba(220,38,38,0.12)' },
};

function formatCategory(cat: string): string {
  const map: Record<string, string> = {
    card_freeze: 'Card Freeze', kyc: 'KYC Verification',
    transaction_dispute: 'Transaction Dispute', fx_inquiry: 'FX / Payments',
    legal_complaint: 'Legal Complaint', general_inquiry: 'General Inquiry',
    account_issue: 'Account Issue', stablecoin: 'Stablecoin',
  };
  return map[cat] ?? cat.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function fmtHKD(n: number | undefined) {
  if (n == null) return 'HKD —';
  return 'HKD ' + n.toLocaleString();
}

// ── QABadge ──────────────────────────────────────────────────────────────────
const QA_GRADE_COLOR = { high: '#4ade80', medium: '#f59e0b', low: '#ef4444' };

function QABadge({ qaScore, T }: { qaScore: QAScore; T: Tokens }) {
  const [expanded, setExpanded] = useState(false);
  const color = QA_GRADE_COLOR[qaScore.grade];

  const signals = [
    { label: 'KB Coverage',    earned: qaScore.signals.kbCoverage,    max: 40 },
    { label: 'Confidence',     earned: qaScore.signals.confidence,     max: 30 },
    { label: 'Compliance',     earned: qaScore.signals.complianceClean, max: 20 },
    { label: 'Draft Length',   earned: qaScore.signals.draftLength,    max: 10 },
  ];

  return (
    <div style={{ display: 'inline-block' }}>
      <button
        onClick={() => setExpanded((e) => !e)}
        style={{
          background: `${color}1a`, border: `1px solid ${color}55`, borderRadius: 5,
          padding: '2px 8px', fontSize: 11, fontWeight: 600, color, cursor: 'pointer',
          fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4,
        }}
        aria-label={`QA score ${qaScore.score} — ${qaScore.grade}`}
      >
        QA {Math.round(qaScore.score)}
        <span style={{ opacity: 0.7 }}>{qaScore.grade.toUpperCase()}</span>
        <span style={{ fontSize: 9, opacity: 0.6 }}>{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div style={{
          position: 'absolute', zIndex: 10, marginTop: 4,
          background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8,
          padding: '10px 14px', minWidth: 220,
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        }}>
          <div style={{ fontSize: 11, color: T.muted, marginBottom: 8, letterSpacing: '0.04em' }}>QA SIGNAL BREAKDOWN</div>
          {signals.map(({ label, earned, max }) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 5 }}>
              <span style={{ color: T.textSub }}>{label}</span>
              <span style={{ color: Math.round(earned) > 0 ? T.text : T.muted, fontFamily: 'monospace' }}>
                {Math.round(earned)} / {max}
              </span>
            </div>
          ))}
          <div style={{ borderTop: `1px solid ${T.border}`, marginTop: 6, paddingTop: 6, display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 600 }}>
            <span style={{ color: T.textSub }}>Total</span>
            <span style={{ color }}>{Math.round(qaScore.score)} / 100</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Actions config (mapped to real Reap CaaS API endpoints) ──────────────────

const ACTIONS = [
  {
    id: 'freeze_card',
    label: 'Freeze / Unfreeze Card',
    endpoint: 'PUT /cards/{cardId}/status',
    desc: 'Toggle freeze state on a Reap Card. Reversible. Logged to audit trail.',
  },
  {
    id: 'block_card',
    label: 'Block Card',
    endpoint: 'PUT /cards/{cardId}/block',
    desc: 'Permanently block a card. Use for confirmed fraud. Irreversible.',
  },
  {
    id: 'list_transactions',
    label: 'List Card Transactions',
    endpoint: 'GET /cards/{cardId}/transactions',
    desc: 'Retrieve recent transaction history for a specific card.',
  },
  {
    id: 'get_transaction',
    label: 'Get Transaction Details',
    endpoint: 'GET /transactions/{transactionId}',
    desc: 'Full detail on a single transaction including merchant, MCC, and status.',
  },
  {
    id: 'report_fraud',
    label: 'Report Fraudulent Transaction',
    endpoint: 'POST /transactions/{transactionId}/fraud-alert',
    desc: 'Flag a transaction for fraud review. Triggers internal alert workflow.',
  },
  {
    id: 'get_balance',
    label: 'Get Account Balance',
    endpoint: 'GET /account/balance',
    desc: 'Retrieve current master account available and total balance.',
  },
  {
    id: 'update_spend_control',
    label: 'Update Spend Control',
    endpoint: 'PUT /cards/{cardId}/spend-control',
    desc: 'Adjust per-transaction or monthly spend limits on a card.',
  },
];

// Base priority by category
const CATEGORY_BASE: Record<string, string[]> = {
  card_freeze:         ['freeze_card', 'block_card', 'list_transactions', 'get_balance'],
  transaction_dispute: ['report_fraud', 'get_transaction', 'list_transactions', 'block_card'],
  fx_inquiry:          ['list_transactions', 'get_balance', 'get_transaction'],
  legal_complaint:     ['report_fraud', 'list_transactions', 'get_transaction', 'block_card'],
  account_issue:       ['get_balance', 'list_transactions', 'update_spend_control'],
  stablecoin:          ['list_transactions', 'get_transaction', 'report_fraud'],
};

// Score actions against the full classification — category + urgency + compliance + crypto + sentiment
function deriveActions(cls: import('@beacon/core').Classification | undefined) {
  const scores: Record<string, number> = Object.fromEntries(ACTIONS.map(a => [a.id, 0]));

  if (cls) {
    // Category base scores
    (CATEGORY_BASE[cls.category] ?? []).forEach((id, i) => { scores[id] += 10 - i * 2; });

    // High urgency → push blocking actions up
    if (cls.urgency === 'P1') { scores['freeze_card'] += 5; scores['block_card'] += 3; }
    if (cls.urgency === 'P2') { scores['freeze_card'] += 2; }

    // Compliance flags → fraud / legal signals
    const flags = cls.compliance_flags.map(f => f.toLowerCase());
    if (flags.some(f => f.includes('fraud') || f.includes('unauthori'))) {
      scores['report_fraud'] += 8; scores['block_card'] += 5; scores['list_transactions'] += 3;
    }
    if (flags.some(f => f.includes('legal') || f.includes('regulat') || f.includes('complaint'))) {
      scores['list_transactions'] += 5; scores['get_transaction'] += 4; scores['report_fraud'] += 3;
    }

    // Crypto tags → transaction tracing
    if (cls.crypto_specific_tags.length > 0) {
      scores['list_transactions'] += 5; scores['get_transaction'] += 5;
    }

    // High distress → freeze/block more urgent
    if (cls.sentiment < -0.5) { scores['freeze_card'] += 2; scores['block_card'] += 1; }
  }

  return [...ACTIONS].sort((a, b) => (scores[b.id] ?? 0) - (scores[a.id] ?? 0));
}

// ── Action param fields ────────────────────────────────────────────────────────

function ActionParams({
  actionId, params, onChange, T,
}: {
  actionId: string;
  params: Record<string, string>;
  onChange: (k: string, v: string) => void;
  T: Tokens;
}) {
  const inp = (key: string, label: string, placeholder: string) => (
    <div style={{ marginBottom: 8 }}>
      <label style={{ display: 'block', fontSize: 11, color: T.textSub, marginBottom: 4 }}>{label}</label>
      <input
        value={params[key] ?? ''}
        onChange={e => onChange(key, e.target.value)}
        placeholder={placeholder}
        style={{ width: '100%', background: T.bg, border: `1px solid ${T.border}`, borderRadius: 4, color: T.text, fontSize: 12, padding: '5px 8px', outline: 'none', fontFamily: T.fontBody }}
      />
    </div>
  );
  const sel = (key: string, label: string, opts: string[]) => (
    <div style={{ marginBottom: 8 }}>
      <label style={{ display: 'block', fontSize: 11, color: T.textSub, marginBottom: 4 }}>{label}</label>
      <select
        value={params[key] ?? opts[0]}
        onChange={e => onChange(key, e.target.value)}
        style={{ width: '100%', background: T.bg, border: `1px solid ${T.border}`, borderRadius: 4, color: T.text, fontSize: 12, padding: '5px 8px', outline: 'none', fontFamily: T.fontBody }}
      >
        {opts.map(o => <option key={o} value={o}>{o.charAt(0).toUpperCase() + o.slice(1)}</option>)}
      </select>
    </div>
  );

  switch (actionId) {
    case 'freeze_card':
      return <>{inp('cardId', 'Card ID', REAP_MOCK.cards[0].id)}{sel('status', 'New Status', ['frozen', 'active'])}</>;
    case 'block_card':
      return <>{inp('cardId', 'Card ID', REAP_MOCK.cards[0].id)}</>;
    case 'list_transactions':
      return <>{inp('cardId', 'Card ID', REAP_MOCK.cards[0].id)}{inp('limit', 'Limit', '10')}</>;
    case 'get_transaction':
      return <>{inp('transactionId', 'Transaction ID', REAP_MOCK.recentTransactions[0].id)}</>;
    case 'report_fraud':
      return <>{inp('transactionId', 'Transaction ID', REAP_MOCK.recentTransactions[0].id)}{inp('reason', 'Reason', 'Unauthorized charge — customer did not authorise')}</>;
    case 'get_balance':
      return null;
    case 'update_spend_control':
      return <>{inp('cardId', 'Card ID', REAP_MOCK.cards[0].id)}{inp('perTransactionLimit', 'Per-Transaction Limit (HKD)', '5000')}{inp('monthlyLimit', 'Monthly Limit (HKD)', '20000')}</>;
    default:
      return null;
  }
}

// ── Badge ─────────────────────────────────────────────────────────────────────

function Badge({ label, color, bg }: { label: string; color: string; bg: string }) {
  return (
    <span style={{ fontSize: 11, fontWeight: 600, color, background: bg, borderRadius: 4, padding: '2px 7px', whiteSpace: 'nowrap' }}>
      {label}
    </span>
  );
}

// ── KB source row ─────────────────────────────────────────────────────────────

function KBRow({ article, index, T }: { article: KBResult; index: number; T: Tokens }) {
  const [open, setOpen] = useState(false);
  const pct = Math.round(article.similarity * 100);
  return (
    <div style={{ border: `1px solid ${T.border}`, borderRadius: 6, overflow: 'hidden', marginBottom: 6 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, width: '100%',
          padding: '7px 10px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left',
        }}
      >
        <span style={{ fontSize: 10, fontWeight: 700, color: '#fff', background: '#3b82f6', borderRadius: 3, padding: '1px 5px', flexShrink: 0 }}>
          KB{index + 1}
        </span>
        <span style={{ flex: 1, fontSize: 12, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {article.title}
        </span>
        <span style={{ fontSize: 11, color: T.muted, flexShrink: 0 }}>{pct}%</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={T.muted} strokeWidth="2" strokeLinecap="round" aria-hidden="true"
          style={{ transform: open ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.15s ease', flexShrink: 0 }}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div style={{ padding: '8px 10px', borderTop: `1px solid ${T.border}`, background: T.bg }}>
          <p style={{ fontSize: 12, color: T.textSub, lineHeight: 1.6, margin: '0 0 6px' }}>
            {article.text.slice(0, 500)}{article.text.length > 500 ? '…' : ''}
          </p>
          <a href={article.html_url} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: '#3b82f6' }}>
            Open in Help Center ↗
          </a>
        </div>
      )}
    </div>
  );
}

// ── Section header ─────────────────────────────────────────────────────────────

function SectionHeader({ children, T }: { children: React.ReactNode; T: Tokens }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 700, fontFamily: T.fontMono, color: T.muted,
      textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10,
    }}>
      {children}
    </div>
  );
}

// ── Card wrapper ──────────────────────────────────────────────────────────────

function Card({ children, T, style }: { children: React.ReactNode; T: Tokens; style?: React.CSSProperties }) {
  return (
    <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: 16, ...style }}>
      {children}
    </div>
  );
}

// ── AnalysisView ──────────────────────────────────────────────────────────────

interface ActionResult {
  [key: string]: unknown;
}

export function AnalysisView({ ticketId, theme, subject, body, onAnalysisReady }: {
  ticketId: string;
  theme: Theme;
  subject?: string;
  body?: string;
  onAnalysisReady?: (ticketId: string, analysis: { category: string; urgency: 'P1' | 'P2' | 'P3' | 'P4'; sentiment: number; routing: 'auto_send' | 'agent_assisted' | 'escalate' }) => void;
}) {
  const T = theme === 'dark' ? DARK : LIGHT;

  const [payload, setPayload] = useState<SidebarPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Draft state
  const [draft, setDraft] = useState('');
  const [previousDraft, setPreviousDraft] = useState<string | null>(null);
  const [regenCustomOpen, setRegenCustomOpen] = useState(false);
  const [regenInstruction, setRegenInstruction] = useState('');
  const [regenLoading, setRegenLoading] = useState(false);
  const [regenActiveChip, setRegenActiveChip] = useState<string | null>(null);
  const [regenError, setRegenError] = useState<string | null>(null);

  // Action state
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [actionParams, setActionParams] = useState<Record<string, string>>({});
  const [actionLoading, setActionLoading] = useState(false);
  const [actionResult, setActionResult] = useState<ActionResult | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Send draft state
  const [sendDone, setSendDone] = useState(false);

  useEffect(() => {
    fetch(`${API}/context/${ticketId}`)
      .then(r => r.json())
      .then((data: SidebarPayload) => {
        setPayload(data);
        if (data.responseDraft?.draft) setDraft(data.responseDraft.draft);
        if (data.classification && onAnalysisReady) {
          onAnalysisReady(ticketId, {
            category: data.classification.category,
            urgency: data.classification.urgency,
            sentiment: data.classification.sentiment,
            routing: data.responseDraft?.routing ?? 'agent_assisted',
          });
        }
      })
      .catch(() => setError('Failed to load analysis'));
  }, [ticketId]);

  if (error) {
    return (
      <div style={{ padding: 32, textAlign: 'center', color: T.muted, fontSize: 13 }}>
        {error}
      </div>
    );
  }

  if (!payload || payload.status === 'pending' || payload.status === 'processing') {
    return (
      <div style={{ padding: 32, textAlign: 'center', color: T.muted, fontSize: 13 }}>
        Processing…
      </div>
    );
  }

  const cls = payload.classification;
  const rd  = payload.responseDraft;
  const kb  = payload.kbArticles ?? [];
  const qaScore    = payload.qaScore as QAScore | undefined;
  const sentiment  = cls ? sentimentInfo(cls.sentiment) : null;
  const routing    = rd ? ROUTING_META[rd.routing] ?? ROUTING_META.agent_assisted : null;
  const urgencyColor = cls ? (URGENCY_COLOR[cls.urgency] ?? '#64748b') : '#64748b';
  const category   = cls?.category ?? '';
  const actions    = deriveActions(cls);
  const hasCompliance = (cls?.compliance_flags ?? []).length > 0;

  // Regenerate handler — accepts instruction directly (chip or custom textarea)
  const handleRegen = async (instruction: string, chipId?: string) => {
    const trimmed = instruction.trim();
    if (!trimmed) { setRegenError('Enter an instruction'); return; }
    setRegenError(null);
    setRegenLoading(true);
    setRegenActiveChip(chipId ?? null);
    try {
      const res = await fetch(`${API}/regenerate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticketId, currentDraft: draft, instruction: trimmed }),
      });
      const json = await res.json() as { draft?: string; error?: string };
      if (json.error) throw new Error(json.error);
      if (json.draft) {
        setPreviousDraft(draft);
        setDraft(json.draft);
        setRegenCustomOpen(false);
        setRegenInstruction('');
      }
    } catch (e) {
      setRegenError(e instanceof Error ? e.message : 'Regeneration failed');
    } finally {
      setRegenLoading(false);
      setRegenActiveChip(null);
    }
  };

  // Action execute handler
  const handleActionConfirm = async () => {
    if (!activeAction) return;
    setActionLoading(true);
    setActionResult(null);
    setActionError(null);
    try {
      const res = await fetch(`${API}/runbooks/${activeAction}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticketId, ...actionParams }),
      });
      const json = await res.json() as ActionResult;
      setActionResult(json);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setActionLoading(false);
    }
  };

  const handleActionSelect = (id: string) => {
    if (activeAction === id) { setActiveAction(null); setActionResult(null); setActionError(null); return; }
    setActiveAction(id);
    setActionParams({});
    setActionResult(null);
    setActionError(null);
  };

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: T.fontBody }}>

      {/* Compliance banner */}
      {hasCompliance && (
        <div style={{
          position: 'sticky', top: 0, zIndex: 20,
          background: theme === 'dark' ? '#450a0a' : '#fef2f2',
          border: `1px solid ${theme === 'dark' ? '#7f1d1d' : '#fca5a5'}`,
          borderRadius: 8, padding: '10px 14px', marginBottom: 14,
          display: 'flex', alignItems: 'flex-start', gap: 10,
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }}>
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" fill="#dc2626" opacity="0.2" stroke="#dc2626" strokeWidth="1.5" />
            <line x1="12" y1="9" x2="12" y2="13" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" />
            <line x1="12" y1="17" x2="12.01" y2="17" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#dc2626', marginBottom: 2 }}>
              Compliance Flag{cls!.compliance_flags.length > 1 ? 's' : ''} Detected
            </div>
            <div style={{ fontSize: 12, color: theme === 'dark' ? '#fca5a5' : '#b91c1c' }}>
              {cls!.compliance_flags.join(' · ')}
            </div>
          </div>
        </div>
      )}

      {/* Classification strip */}
      {cls && (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginBottom: 16 }}>
          <Badge label={cls.urgency} color={urgencyColor} bg={`${urgencyColor}1a`} />
          <Badge label={formatCategory(category)} color={T.textSub} bg={T.elevated} />
          {sentiment && <Badge label={sentiment.label} color={sentiment.color} bg={`${sentiment.color}1a`} />}
          {routing    && <Badge label={routing.label}  color={routing.color}    bg={routing.bg} />}
          <span style={{ fontSize: 11, color: T.muted, marginLeft: 'auto', fontFamily: T.fontMono }}>
            {Math.round((cls.confidence ?? 0) * 100)}% confidence
          </span>
        </div>
      )}

      {/* Main 2-column layout */}
      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>

        {/* ── Left: Draft + KB ────────────────────────────────────────────── */}
        <div style={{ flex: '3 1 0', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Draft card */}
          <Card T={T}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 8 }}>
              <SectionHeader T={T}>Draft Response</SectionHeader>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, position: 'relative' }}>
                {qaScore && <QABadge qaScore={qaScore} T={T} />}
                {routing && (
                  <span style={{ fontSize: 11, fontWeight: 600, color: routing.color, background: routing.bg, borderRadius: 4, padding: '2px 7px' }}>
                    {routing.label}
                  </span>
                )}
              </div>
            </div>

            {/* Original customer message */}
            {(subject || body) && (
              <div style={{
                background: T.bg, border: `1px solid ${T.border}`, borderRadius: 6,
                padding: '10px 12px', marginBottom: 12,
              }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: T.muted, fontFamily: T.fontMono, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
                  Customer Message
                </div>
                {subject && (
                  <div style={{ fontSize: 12, fontWeight: 600, color: T.text, marginBottom: 4 }}>{subject}</div>
                )}
                {body && (
                  <div style={{ fontSize: 12, color: T.textSub, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{body}</div>
                )}
              </div>
            )}

            {/* Draft textarea */}
            <textarea
              value={draft}
              onChange={e => setDraft(e.target.value)}
              rows={10}
              style={{
                width: '100%', background: T.bg, border: `1px solid ${T.border}`,
                borderRadius: 6, color: T.text, fontSize: 13, fontFamily: T.fontBody,
                lineHeight: 1.65, padding: '10px 12px', outline: 'none', resize: 'vertical',
              }}
            />

            {/* Jurisdiction footer */}
            {rd?.jurisdiction_footer && (
              <div style={{ fontSize: 11, color: T.muted, marginTop: 8, fontStyle: 'italic', lineHeight: 1.5 }}>
                {rd.jurisdiction_footer}
              </div>
            )}

            {/* Send + undo row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
              <button
                onClick={() => setSendDone(true)}
                disabled={sendDone}
                style={{
                  padding: '7px 16px', borderRadius: 6, border: 'none', cursor: sendDone ? 'default' : 'pointer',
                  background: sendDone ? T.elevated : T.accent,
                  color: sendDone ? T.muted : (theme === 'dark' ? '#0f172a' : '#fff'),
                  fontSize: 13, fontWeight: 600, fontFamily: T.fontBody, transition: 'all 0.15s ease',
                }}
              >
                {sendDone ? '✓ Sent' : 'Send Draft'}
              </button>
              {previousDraft && (
                <button
                  onClick={() => { setDraft(previousDraft); setPreviousDraft(null); }}
                  style={{
                    padding: '7px 10px', borderRadius: 6, border: `1px solid ${T.border}`,
                    background: 'transparent', cursor: 'pointer', color: T.muted,
                    fontSize: 12, fontFamily: T.fontBody,
                  }}
                >
                  ↩ Undo
                </button>
              )}
            </div>

            {/* AI adjustment chips */}
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: T.muted, fontFamily: T.fontMono, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
                Adjust with AI
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {([
                  { id: 'shorter',    label: 'Shorter',          instruction: 'Make the response more concise, remove unnecessary words' },
                  { id: 'formal',     label: 'More formal',      instruction: 'Use a more formal, professional tone' },
                  { id: 'empathetic', label: 'More empathetic',  instruction: 'Make the tone warmer and more empathetic toward the customer' },
                  { id: 'apology',    label: 'Add apology',      instruction: 'Add a sincere apology for the inconvenience caused' },
                  { id: 'simpler',    label: 'Simpler language',  instruction: 'Use simpler language, avoid jargon, make it easy to understand' },
                ] as const).map(chip => {
                  const isActive = regenActiveChip === chip.id;
                  return (
                    <button
                      key={chip.id}
                      onClick={() => handleRegen(chip.instruction, chip.id)}
                      disabled={regenLoading}
                      style={{
                        padding: '4px 10px', borderRadius: 20, fontSize: 12,
                        border: `1px solid ${isActive ? T.accent : T.border}`,
                        background: isActive ? `${T.accent}18` : T.bg,
                        color: isActive ? T.accent : T.textSub,
                        cursor: regenLoading ? 'default' : 'pointer',
                        fontFamily: T.fontBody, transition: 'all 0.15s ease',
                        display: 'flex', alignItems: 'center', gap: 5,
                      }}
                    >
                      {isActive && (
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden="true"
                          style={{ animation: 'spin 0.8s linear infinite', flexShrink: 0 }}>
                          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="40 20" opacity="0.4" />
                          <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                        </svg>
                      )}
                      {chip.label}
                    </button>
                  );
                })}
                <button
                  onClick={() => setRegenCustomOpen(o => !o)}
                  disabled={regenLoading}
                  style={{
                    padding: '4px 10px', borderRadius: 20, fontSize: 12,
                    border: `1px solid ${regenCustomOpen ? T.accent : T.border}`,
                    background: regenCustomOpen ? `${T.accent}18` : T.bg,
                    color: regenCustomOpen ? T.accent : T.muted,
                    cursor: regenLoading ? 'default' : 'pointer',
                    fontFamily: T.fontBody, transition: 'all 0.15s ease',
                  }}
                >
                  Custom…
                </button>
              </div>

              {/* Custom instruction input — shown only when "Custom…" chip is active */}
              {regenCustomOpen && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input
                      autoFocus
                      value={regenInstruction}
                      onChange={e => setRegenInstruction(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleRegen(regenInstruction, 'custom'); }}
                      placeholder="e.g. Add the refund timeline, mention SLA"
                      style={{
                        flex: 1, background: T.bg, border: `1px solid ${T.border}`,
                        borderRadius: 6, color: T.text, fontSize: 12, fontFamily: T.fontBody,
                        padding: '6px 10px', outline: 'none',
                      }}
                    />
                    <button
                      onClick={() => handleRegen(regenInstruction, 'custom')}
                      disabled={regenLoading || !regenInstruction.trim()}
                      style={{
                        padding: '6px 12px', borderRadius: 6, border: 'none',
                        background: T.accent, color: theme === 'dark' ? '#0f172a' : '#fff',
                        fontSize: 12, fontWeight: 600, fontFamily: T.fontBody,
                        cursor: regenLoading || !regenInstruction.trim() ? 'default' : 'pointer',
                        opacity: regenInstruction.trim() ? 1 : 0.5,
                      }}
                    >
                      {regenLoading && regenActiveChip === 'custom' ? '…' : '↵'}
                    </button>
                  </div>
                  {regenError && <p style={{ color: '#dc2626', fontSize: 11, margin: '4px 0 0' }}>{regenError}</p>}
                </div>
              )}
            </div>
          </Card>

          {/* KB sources */}
          {kb.length > 0 && (
            <Card T={T}>
              <SectionHeader T={T}>Knowledge Sources ({kb.length})</SectionHeader>
              {kb.map((art, i) => <KBRow key={art.article_id} article={art} index={i} T={T} />)}
            </Card>
          )}
        </div>

        {/* ── Right: Customer + Actions ────────────────────────────────────── */}
        <div style={{ flex: '2 1 0', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Customer & Reap account card */}
          <Card T={T}>
            <SectionHeader T={T}>Customer Account</SectionHeader>

            {/* Identity */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{REAP_MOCK.customer.name}</div>
              <div style={{ fontSize: 12, color: T.textSub, marginTop: 1 }}>{REAP_MOCK.customer.email}</div>
              <div style={{ fontSize: 12, color: T.muted }}>{REAP_MOCK.customer.org}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                {REAP_MOCK.customer.tags.map(tag => (
                  <span key={tag} style={{ fontSize: 10, color: T.muted, background: T.elevated, border: `1px solid ${T.border}`, borderRadius: 3, padding: '1px 6px' }}>
                    {tag}
                  </span>
                ))}
              </div>
            </div>

            <div style={{ height: 1, background: T.border, margin: '10px 0' }} />

            {/* KYC */}
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, color: T.muted, marginBottom: 4, fontFamily: T.fontMono }}>KYC STATUS</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#16a34a', background: 'rgba(22,163,74,0.1)', borderRadius: 4, padding: '2px 8px' }}>
                  Verified · Level {REAP_MOCK.kyc.level}
                </span>
                <span style={{ fontSize: 11, color: T.muted }}>since {REAP_MOCK.kyc.verifiedAt}</span>
              </div>
            </div>

            {/* Account */}
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, color: T.muted, marginBottom: 4, fontFamily: T.fontMono }}>ACCOUNT</div>
              <div style={{ fontSize: 12, color: T.textSub }}>{REAP_MOCK.account.id}</div>
              <div style={{ fontSize: 12, color: T.muted }}>Customer since {new Date(REAP_MOCK.customer.since).toLocaleDateString('en-HK', { month: 'short', year: 'numeric' })}</div>
              <div style={{ fontSize: 12, color: T.muted }}>
                Credit: <span style={{ color: T.text, fontWeight: 600 }}>{fmtHKD(REAP_MOCK.account.availableBalance)}</span>
                <span style={{ color: T.muted }}> / {fmtHKD(REAP_MOCK.account.totalBalance)}</span>
              </div>
            </div>

            {/* Products */}
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, color: T.muted, marginBottom: 4, fontFamily: T.fontMono }}>PRODUCTS</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {REAP_MOCK.account.products.map(p => (
                  <span key={p} style={{ fontSize: 11, color: T.textSub, background: T.elevated, border: `1px solid ${T.border}`, borderRadius: 4, padding: '2px 7px' }}>
                    {p}
                  </span>
                ))}
              </div>
            </div>

            {/* Cards */}
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, color: T.muted, marginBottom: 6, fontFamily: T.fontMono }}>CARDS</div>
              {REAP_MOCK.cards.map(card => {
                // Highlight if card number appears in the ticket context
                const highlighted = category === 'card_freeze';
                return (
                  <div key={card.last4} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '6px 8px', borderRadius: 6, marginBottom: 4,
                    border: `1px solid ${highlighted && card.last4 === '4821' ? T.accent : T.border}`,
                    background: highlighted && card.last4 === '4821' ? `${T.accent}12` : T.bg,
                  }}>
                    <div>
                      <span style={{ fontSize: 12, fontFamily: T.fontMono, color: T.text }}>•••• {card.last4}</span>
                      <span style={{ fontSize: 11, color: T.muted, marginLeft: 6 }}>{card.type}</span>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: card.status === 'active' ? '#16a34a' : '#dc2626' }}>
                        {card.status.toUpperCase()}
                      </div>
                      <div style={{ fontSize: 10, color: T.muted }}>{fmtHKD(card.spent)} / {fmtHKD(card.spendLimit)}</div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Recent transactions */}
            <div>
              <div style={{ fontSize: 11, color: T.muted, marginBottom: 6, fontFamily: T.fontMono }}>RECENT TRANSACTIONS</div>
              {REAP_MOCK.recentTransactions.slice(0, 3).map(tx => (
                <div key={tx.id} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '5px 0', borderBottom: `1px solid ${T.border}`,
                }}>
                  <div style={{ flex: 1, minWidth: 0, marginRight: 8 }}>
                    <div style={{ fontSize: 12, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {tx.merchant}
                    </div>
                    <div style={{ fontSize: 10, color: T.muted }}>{tx.date}</div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 12, color: T.text }}>{fmtHKD(tx.amountHKD)}</div>
                    <div style={{ fontSize: 10, fontWeight: 600, color: tx.status === 'disputed' ? '#f59e0b' : T.muted }}>
                      {tx.status}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Suggested actions card */}
          <Card T={T}>
            <SectionHeader T={T}>Suggested Actions</SectionHeader>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {actions.slice(0, 4).map((action, idx) => {
                const isPrimary = idx === 0;
                const isActive  = activeAction === action.id;
                return (
                  <div key={action.id}>
                    <button
                      onClick={() => handleActionSelect(action.id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                        padding: '8px 10px', borderRadius: 6, textAlign: 'left', cursor: 'pointer',
                        border: `1px solid ${isActive ? T.accent : isPrimary ? `${T.accent}40` : T.border}`,
                        background: isActive ? `${T.accent}15` : isPrimary ? `${T.accent}08` : T.bg,
                        fontFamily: T.fontBody, transition: 'all 0.15s ease',
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: isPrimary ? 600 : 400, color: T.text }}>
                          {isPrimary && (
                            <span style={{ fontSize: 10, color: T.accent, fontFamily: T.fontMono, marginRight: 6 }}>★</span>
                          )}
                          {action.label}
                        </div>
                        <div style={{ fontSize: 10, color: T.muted, marginTop: 1, fontFamily: T.fontMono }}>
                          {action.endpoint}
                        </div>
                        {isPrimary && (
                          <div style={{ fontSize: 11, color: T.textSub, marginTop: 2 }}>{action.desc}</div>
                        )}
                      </div>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={T.muted} strokeWidth="2" strokeLinecap="round" aria-hidden="true"
                        style={{ transform: isActive ? 'rotate(90deg)' : 'rotate(0)', transition: 'transform 0.15s ease', flexShrink: 0 }}>
                        <path d="M9 18l6-6-6-6" />
                      </svg>
                    </button>

                    {/* Inline action form */}
                    {isActive && (
                      <div style={{ padding: 12, border: `1px solid ${T.accent}40`, borderTop: 'none', borderRadius: '0 0 6px 6px', background: T.bg, marginBottom: 2 }}>
                        <ActionParams actionId={action.id} params={actionParams} onChange={(k, v) => setActionParams(p => ({ ...p, [k]: v }))} T={T} />

                        {actionError && (
                          <div style={{ fontSize: 11, color: '#dc2626', marginBottom: 8 }}>{actionError}</div>
                        )}

                        {actionResult ? (
                          <div style={{ marginTop: 4 }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: '#16a34a', marginBottom: 6 }}>
                              ✓ {String(actionResult.message ?? 'Action completed')}
                            </div>
                            <pre style={{
                              fontSize: 11, color: T.textSub, background: T.surface, border: `1px solid ${T.border}`,
                              borderRadius: 4, padding: '8px 10px', margin: 0, whiteSpace: 'pre-wrap',
                              wordBreak: 'break-all', maxHeight: 180, overflowY: 'auto', fontFamily: T.fontMono,
                            }}>
                              {JSON.stringify(
                                Object.fromEntries(Object.entries(actionResult).filter(([k]) => !['ok', 'runbookId'].includes(k))),
                                null, 2,
                              )}
                            </pre>
                            <button
                              onClick={() => { setActionResult(null); setActiveAction(null); }}
                              style={{ marginTop: 8, fontSize: 11, color: T.muted, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                            >
                              Dismiss
                            </button>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                            <button
                              onClick={handleActionConfirm} disabled={actionLoading}
                              style={{
                                padding: '5px 12px', borderRadius: 5, border: 'none', cursor: actionLoading ? 'default' : 'pointer',
                                background: T.accent, color: theme === 'dark' ? '#0f172a' : '#fff',
                                fontSize: 12, fontWeight: 600, fontFamily: T.fontBody,
                              }}
                            >
                              {actionLoading ? 'Running…' : 'Run'}
                            </button>
                            <button
                              onClick={() => setActiveAction(null)}
                              style={{
                                padding: '5px 10px', borderRadius: 5, border: `1px solid ${T.border}`,
                                background: 'transparent', cursor: 'pointer', color: T.textSub,
                                fontSize: 12, fontFamily: T.fontBody,
                              }}
                            >
                              Cancel
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Show remaining actions collapsed */}
            {actions.length > 4 && (
              <details style={{ marginTop: 8 }}>
                <summary style={{ fontSize: 12, color: T.muted, cursor: 'pointer', listStyle: 'none', paddingLeft: 2 }}>
                  + {actions.length - 4} more actions
                </summary>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
                  {actions.slice(4).map(action => (
                    <button
                      key={action.id}
                      onClick={() => handleActionSelect(action.id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                        padding: '7px 10px', borderRadius: 6, textAlign: 'left', cursor: 'pointer',
                        border: `1px solid ${activeAction === action.id ? T.accent : T.border}`,
                        background: activeAction === action.id ? `${T.accent}15` : T.bg,
                        fontFamily: T.fontBody,
                      }}
                    >
                      <span style={{ fontSize: 12, color: T.text }}>{action.label}</span>
                    </button>
                  ))}
                </div>
              </details>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
