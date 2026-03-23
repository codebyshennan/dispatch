import React, { useState } from 'react';
import { Field, Label, Textarea, Input } from '@zendeskgarden/react-forms';
import { Button } from '@zendeskgarden/react-buttons';
import { Paragraph, Span } from '@zendeskgarden/react-typography';

export interface QueryEntry {
  ticketId: string;
  subject: string;
  body: string;
  submittedAt: string;
}

interface Props {
  onAnalyze: (ticketId: string, entry: QueryEntry) => void;
  onSubmitStart: () => void;
  history: QueryEntry[];
  activeTicketId: string | null;
  loading: boolean;
}

export function InputPanel({ onAnalyze, onSubmitStart, history, activeTicketId, loading }: Props) {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!body.trim()) { setError('Enter a message or ticket body'); return; }
    setError(null);
    onSubmitStart();

    try {
      const res = await fetch('http://localhost:3001/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject: subject.trim(), body: body.trim() }),
      });
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      const { ticketId } = await res.json() as { ticketId: string };

      const entry: QueryEntry = {
        ticketId,
        subject: subject.trim() || body.trim().slice(0, 60),
        body: body.trim(),
        submittedAt: new Date().toISOString(),
      };
      onAnalyze(ticketId, entry);
      setSubject('');
      setBody('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed — is demo-server running?');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '16px', gap: '12px' }}>
      <Paragraph style={{ fontWeight: 600, fontSize: '16px', margin: 0 }}>Beacon AI Demo</Paragraph>

      {/* Input form */}
      <Field>
        <Label>Subject (optional)</Label>
        <Input
          value={subject}
          onChange={e => setSubject(e.target.value)}
          placeholder="e.g. Card freeze request"
        />
      </Field>
      <Field>
        <Label>Message / Ticket body</Label>
        <Textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          placeholder="Paste a customer message or type a support question..."
          rows={6}
          style={{ resize: 'vertical' }}
        />
      </Field>
      {error && <Span style={{ color: '#cc0000', fontSize: '13px' }}>{error}</Span>}
      <Button isPrimary onClick={handleSubmit} disabled={loading}>
        {loading ? 'Analyzing...' : 'Analyze'}
      </Button>

      {/* Query history */}
      {history.length > 0 && (
        <div style={{ marginTop: '8px', overflowY: 'auto', flex: 1 }}>
          <Span style={{ fontSize: '12px', color: '#68737d', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            History
          </Span>
          {[...history].reverse().map(entry => (
            <div
              key={entry.ticketId}
              onClick={() => onAnalyze(entry.ticketId, entry)}
              style={{
                padding: '8px',
                marginTop: '6px',
                borderRadius: '4px',
                cursor: 'pointer',
                background: entry.ticketId === activeTicketId ? '#e8f0fe' : '#f5f5f5',
                borderLeft: entry.ticketId === activeTicketId ? '3px solid #1f73b7' : '3px solid transparent',
              }}
            >
              <div style={{ fontSize: '13px', fontWeight: 500 }}>{entry.subject}</div>
              <div style={{ fontSize: '11px', color: '#68737d' }}>
                {new Date(entry.submittedAt).toLocaleTimeString()}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
