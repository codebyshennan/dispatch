import React, { useEffect } from 'react';
import type { Tokens } from './DemoApp';
import { TicketForm } from './TicketForm';

interface NewTicketModalProps {
  open: boolean;
  T: Tokens;
  onClose: () => void;
  onAnalyze: (subject: string, body: string) => void;
}

export function NewTicketModal({ open, T, onClose, onAnalyze }: NewTicketModalProps) {
  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  const handleSubmit = (subject: string, body: string) => {
    onClose();
    onAnalyze(subject, body);
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 520,
          background: T.surface,
          border: `1px solid ${T.border}`,
          borderRadius: 16,
          overflow: 'hidden',
          boxShadow: '0 24px 64px rgba(0,0,0,0.4)',
        }}
      >
        {/* Modal header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px', borderBottom: `1px solid ${T.border}`,
        }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: T.text, fontFamily: T.fontBody }}>
            New Ticket
          </span>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 28, height: 28, borderRadius: 6,
              border: `1px solid ${T.border}`, background: 'transparent',
              color: T.muted, cursor: 'pointer', fontSize: 16,
            }}
          >
            ✕
          </button>
        </div>

        {/* Form */}
        <div style={{ padding: 20 }}>
          <TicketForm T={T} onSubmit={handleSubmit} onCancel={onClose} />
        </div>
      </div>
    </div>
  );
}
