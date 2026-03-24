import React from 'react';
import type { InboxTicket } from './inbox-data';
import type { Tokens } from './DemoApp';

function formatTimestamp(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Hong_Kong',
  }).format(new Date(iso));
}

function avatarInitial(from: string): string {
  const name = from.split('@')[0].replace(/[._-]/g, ' ');
  return name.trim()[0]?.toUpperCase() ?? '?';
}

interface TicketThreadProps {
  ticket: InboxTicket;
  T: Tokens;
}

export function TicketThread({ ticket, T }: TicketThreadProps) {
  const senderName = ticket.from.split('@')[0].replace(/[._-]/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());

  const bannerStyle = (color: string, bg: string): React.CSSProperties => ({
    padding: '6px 16px',
    background: bg,
    color,
    fontSize: 12,
    fontWeight: 600,
    borderBottom: `1px solid ${color}33`,
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: T.surface }}>

      {/* Thread header */}
      <div style={{ padding: '16px 20px', borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: T.text, marginBottom: 6, lineHeight: 1.3 }}>
          {ticket.subject}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, color: T.muted }}>
          <span style={{ fontWeight: 500, color: T.textSub }}>{ticket.from}</span>
          <span>·</span>
          <span style={{ fontFamily: T.fontMono }}>{formatTimestamp(ticket.submittedAt)}</span>
        </div>
      </div>

      {/* Status banner */}
      {ticket.status === 'sent' && (
        <div style={bannerStyle('#166534', 'rgba(34,197,94,0.08)')}>
          Auto-sent by Beacon
        </div>
      )}
      {ticket.status === 'escalated' && (
        <div style={bannerStyle('#991b1b', 'rgba(220,38,38,0.08)')}>
          Escalated to Tier 2
        </div>
      )}

      {/* Message bubble */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          {/* Avatar */}
          <div style={{
            width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
            background: T.accent, color: '#0F172A',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 14, fontWeight: 700, fontFamily: T.fontBody,
          }}>
            {avatarInitial(ticket.from)}
          </div>

          {/* Bubble */}
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: T.textSub, marginBottom: 8 }}>
              {senderName}
            </div>
            <div style={{
              background: T.elevated,
              border: `1px solid ${T.border}`,
              borderRadius: 12,
              borderTopLeftRadius: 2,
              padding: '12px 16px',
              fontSize: 13,
              color: T.text,
              lineHeight: 1.7,
              whiteSpace: 'pre-wrap',
            }}>
              {ticket.body}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
