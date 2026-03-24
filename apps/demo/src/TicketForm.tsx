import React, { useState } from 'react';
import type { Tokens } from './DemoApp';

const EXAMPLES = [
  { label: 'Card freeze',        subject: 'Urgent: freeze my Reap card immediately', body: "I just lost my physical card and I'm worried about unauthorized charges. I need to freeze it right now. My card number ends in 4821. Please help urgently." },
  { label: 'KYC verification',   subject: 'KYC verification stuck for 3 days',        body: "I submitted my KYC documents 3 days ago and my account is still under review. I need to make business payments urgently. Can you tell me the status and how to speed this up?" },
  { label: 'Transaction dispute', subject: 'Unauthorized transaction on my account',   body: "There's a charge of HKD 8,400 on 21 March from a merchant I don't recognize called 'INTL TECH SVC'. I did not authorize this transaction and I want to dispute it and get a refund." },
  { label: 'FX rate question',   subject: 'Question about FX conversion rates',        body: "I need to transfer USD 50,000 to a supplier in Singapore. What is your current USD to SGD rate and are there any fees? How does it compare to the mid-market rate?" },
  { label: 'Legal complaint',    subject: 'Formal complaint — threatening legal action', body: "I have been waiting 2 weeks for my refund and your support team has been useless. I am contacting my solicitor and filing a regulatory complaint with the SFC if this isn't resolved by end of day." },
];

interface TicketFormProps {
  T: Tokens;
  onSubmit: (subject: string, body: string) => void;
  onCancel: () => void;
}

export function TicketForm({ T, onSubmit, onCancel }: TicketFormProps) {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState<string | null>(null);

  const inputBase: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box',
    background: T.bg, border: `1px solid ${T.border}`,
    borderRadius: 6, color: T.text, fontSize: 13,
    fontFamily: T.fontBody, padding: '8px 10px',
    outline: 'none', transition: 'border-color 0.15s ease', lineHeight: 1.5,
  };

  const handleSubmit = () => {
    if (!body.trim()) { setError('Enter a message or ticket body'); return; }
    setError(null);
    onSubmit(subject.trim(), body.trim());
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Examples */}
      <div>
        <div style={{ fontSize: 10, fontFamily: T.fontMono, fontWeight: 600, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>
          Examples
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {EXAMPLES.map(ex => {
            const active = subject === ex.subject;
            return (
              <button
                key={ex.label}
                onClick={() => { setSubject(ex.subject); setBody(ex.body); setError(null); }}
                style={{
                  fontSize: 12, padding: '4px 10px', borderRadius: 20,
                  border: `1px solid ${active ? T.accent : T.border}`,
                  background: active ? 'rgba(34,197,94,0.12)' : T.elevated,
                  color: active ? T.accent : T.textSub,
                  cursor: 'pointer', fontFamily: T.fontBody,
                  fontWeight: active ? 600 : 400, whiteSpace: 'nowrap',
                  transition: 'all 0.15s ease',
                }}
              >
                {ex.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Subject */}
      <div>
        <label htmlFor="modal-subject" style={{ display: 'block', fontSize: 12, fontWeight: 500, color: T.textSub, marginBottom: 6 }}>
          Subject (optional)
        </label>
        <input
          id="modal-subject" value={subject}
          onChange={e => setSubject(e.target.value)}
          placeholder="e.g. Card freeze request"
          onFocus={() => setFocused('subject')} onBlur={() => setFocused(null)}
          style={{
            ...inputBase,
            borderColor: focused === 'subject' ? '#3B82F6' : T.border,
            boxShadow: focused === 'subject' ? '0 0 0 3px rgba(59,130,246,0.12)' : 'none',
          }}
        />
      </div>

      {/* Body */}
      <div>
        <label htmlFor="modal-body" style={{ display: 'block', fontSize: 12, fontWeight: 500, color: T.textSub, marginBottom: 6 }}>
          Message / Ticket body
        </label>
        <textarea
          id="modal-body" value={body} rows={7}
          onChange={e => setBody(e.target.value)}
          placeholder="Paste a customer message or type a support question..."
          onFocus={() => setFocused('body')} onBlur={() => setFocused(null)}
          style={{
            ...inputBase, resize: 'vertical',
            borderColor: focused === 'body' ? '#3B82F6' : T.border,
            boxShadow: focused === 'body' ? '0 0 0 3px rgba(59,130,246,0.12)' : 'none',
          }}
        />
      </div>

      {/* Error */}
      {error && (
        <div style={{ fontSize: 12, color: '#F87171', background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: 6, padding: '8px 10px' }}>
          {error}
        </div>
      )}

      {/* Footer */}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button
          onClick={onCancel}
          style={{
            padding: '9px 18px', borderRadius: 8, border: `1px solid ${T.border}`,
            background: 'transparent', color: T.textSub, fontSize: 13,
            fontFamily: T.fontBody, cursor: 'pointer',
          }}
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          style={{
            padding: '9px 18px', borderRadius: 8, border: 'none',
            background: T.accent, color: '#0F172A', fontSize: 13,
            fontWeight: 600, fontFamily: T.fontBody, cursor: 'pointer',
            letterSpacing: '0.02em',
          }}
        >
          Analyze
        </button>
      </div>
    </div>
  );
}
