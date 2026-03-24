import React from 'react';
import type { InboxTicket } from './inbox-data';
import type { Tokens } from './DemoApp';
import { DARK } from './DemoApp';

// ── Helpers ───────────────────────────────────────────────────────────────────

function sentimentColor(score: number): string {
  if (score < -0.5) return '#dc2626';
  if (score < -0.2) return '#f59e0b';
  if (score <  0.2) return '#64748b';
  if (score <  0.5) return '#3b82f6';
  return '#22c55e';
}

const URGENCY_COLOR: Record<string, string> = {
  P1: '#dc2626', P2: '#f59e0b', P3: '#3b82f6', P4: '#64748b',
};

const ROUTING_META: Record<string, { label: string; darkColor: string; lightColor: string; bg: string }> = {
  auto_send:      { label: 'Auto Send',      darkColor: '#4ade80', lightColor: '#166534', bg: 'rgba(34,197,94,0.12)' },
  agent_assisted: { label: 'Agent Assisted', darkColor: '#60a5fa', lightColor: '#1e40af', bg: 'rgba(59,130,246,0.12)' },
  escalate:       { label: 'Escalate',       darkColor: '#f87171', lightColor: '#991b1b', bg: 'rgba(220,38,38,0.12)' },
};

const STATUS_ICON: Record<'sent' | 'escalated', { icon: string; color: string }> = {
  sent:      { icon: '✓', color: '#22c55e' },
  escalated: { icon: '↑', color: '#ef4444' },
};

function categoryLabel(cat: string): string {
  const map: Record<string, string> = {
    card_freeze: 'Card Freeze', kyc: 'KYC',
    transaction_dispute: 'Dispute', fx_inquiry: 'FX / Payments',
    legal_complaint: 'Legal', general_inquiry: 'General',
    account_issue: 'Account', stablecoin: 'Stablecoin',
  };
  return map[cat] ?? cat.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// ── Shimmer row (processing state) ────────────────────────────────────────────

function ShimmerBadges({ T }: { T: Tokens }) {
  return (
    <>
      <style>{`
        @keyframes shimmer {
          0%   { background-position: -200px 0; }
          100% { background-position: 200px 0; }
        }
      `}</style>
      <div style={{ display: 'flex', gap: 4, marginBottom: 5 }}>
        {[40, 60, 50].map((w, i) => (
          <div key={i} style={{
            height: 16, width: w, borderRadius: 3,
            background: `linear-gradient(90deg, ${T.shimmerFrom} 25%, ${T.shimmerTo} 50%, ${T.shimmerFrom} 75%)`,
            backgroundSize: '200px 100%',
            animation: 'shimmer 1.4s infinite linear',
          }} />
        ))}
      </div>
    </>
  );
}

// ── Spinner SVG ───────────────────────────────────────────────────────────────

function MiniSpinner({ color }: { color: string }) {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" style={{ animation: 'spin 0.9s linear infinite', flexShrink: 0 }} aria-hidden="true">
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <circle cx="12" cy="12" r="10" stroke={color} strokeWidth="3" strokeDasharray="40 20" opacity="0.3" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke={color} strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

// ── InboxList ─────────────────────────────────────────────────────────────────

interface InboxListProps {
  inbox: InboxTicket[];
  selectedTicketId: string | null;
  T: Tokens;
  onSelect: (ticket: InboxTicket) => void;
}

export function InboxList({ inbox, selectedTicketId, T, onSelect }: InboxListProps) {
  const isDark = T === DARK;

  if (inbox.length === 0) {
    return (
      <div style={{ padding: '48px 16px', textAlign: 'center', color: T.muted, fontSize: 13 }}>
        No tickets yet. Start the simulation or add a new ticket.
      </div>
    );
  }

  return (
    <div style={{ padding: '4px 0' }}>
      {inbox.map((ticket) => {
        const isSelected = ticket.ticketId === selectedTicketId;
        const a = ticket.analysis;
        const routing = a ? ROUTING_META[a.routing] : null;
        const statusIcon = (ticket.status === 'sent' || ticket.status === 'escalated')
          ? STATUS_ICON[ticket.status]
          : null;

        return (
          <button
            key={ticket.ticketId}
            onClick={() => onSelect(ticket)}
            style={{
              display: 'block', width: '100%', textAlign: 'left',
              padding: '10px 14px',
              background: isSelected ? (isDark ? '#1D3461' : '#EFF6FF') : 'transparent',
              border: 'none',
              borderBottom: `1px solid ${T.border}`,
              borderLeft: `3px solid ${isSelected ? '#3B82F6' : 'transparent'}`,
              cursor: 'pointer', fontFamily: T.fontBody,
              transition: 'background 0.15s ease',
            }}
          >
            {/* Row 1: subject + time + status icon */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                {ticket.subject}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                {statusIcon && (
                  <span style={{ fontSize: 11, fontWeight: 700, color: statusIcon.color }}>{statusIcon.icon}</span>
                )}
                {ticket.status === 'processing' && <MiniSpinner color={T.muted} />}
                <span style={{ fontSize: 11, color: T.muted, fontFamily: T.fontMono }}>
                  {new Date(ticket.submittedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            </div>

            {/* Row 2: sender */}
            <div style={{ fontSize: 11, color: T.muted, marginBottom: 5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {ticket.from}
            </div>

            {/* Row 3: badges or shimmer */}
            {ticket.status === 'processing'
              ? <ShimmerBadges T={T} />
              : a && routing && (
                <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap', marginBottom: 4 }}>
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: '1px 5px', borderRadius: 3,
                    background: `${URGENCY_COLOR[a.urgency]}22`, color: URGENCY_COLOR[a.urgency],
                  }}>{a.urgency}</span>
                  <span style={{
                    fontSize: 10, fontWeight: 500, padding: '1px 5px', borderRadius: 3,
                    background: isDark ? 'rgba(100,116,139,0.15)' : 'rgba(100,116,139,0.1)',
                    color: T.muted,
                  }}>{categoryLabel(a.category)}</span>
                  <span style={{
                    fontSize: 10, fontWeight: 600, padding: '1px 5px', borderRadius: 3,
                    background: routing.bg,
                    color: isDark ? routing.darkColor : routing.lightColor,
                  }}>{routing.label}</span>
                  <span style={{
                    display: 'inline-block', width: 6, height: 6, borderRadius: '50%',
                    background: sentimentColor(a.sentiment),
                    boxShadow: `0 0 4px ${sentimentColor(a.sentiment)}`,
                    marginLeft: 2, flexShrink: 0,
                  }} />
                </div>
              )
            }

            {/* Row 4: body snippet */}
            <div style={{ fontSize: 12, color: T.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {ticket.body.slice(0, 80)}
            </div>
          </button>
        );
      })}
    </div>
  );
}
