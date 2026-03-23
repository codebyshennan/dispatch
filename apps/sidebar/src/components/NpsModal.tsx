import React, { useState } from 'react';
import { Modal, Header, Body as ModalBody, Footer as ModalFooter, Close } from '@zendeskgarden/react-modals';
import { Button } from '@zendeskgarden/react-buttons';
import { Field, Label, Textarea } from '@zendeskgarden/react-forms';

export interface NpsModalProps {
  agentId: string;
  onClose: () => void;
}

/**
 * NpsModal — Monthly NPS survey modal (CHG-04).
 *
 * Shows once per calendar month via localStorage guard (enforced in App.tsx).
 * Submits score (1-10) + optional comment to sidebar-api /nps.
 */
export function NpsModal({ agentId, onClose }: NpsModalProps) {
  const [score, setScore] = useState<number | null>(null);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentYearMonth = new Date().toISOString().slice(0, 7);

  const handleSubmit = async () => {
    if (score === null) return;

    setSubmitting(true);
    setError(null);

    try {
      // Use fetch via ZAF client proxy is not possible in this component context.
      // The sidebar-api base URL is set as a ZAF setting (api_base_url) — here we
      // rely on the ZAF client.request pattern used elsewhere. However, NpsModal
      // does not have access to the ZAF client directly.
      //
      // Per the plan: "The sidebar-api base URL comes from the same ZAF client
      // pattern used in other hooks" — App.tsx passes the base URL as a prop or
      // the modal uses window.__meridianApiBase injected by main.tsx.
      //
      // In practice the ZAF client.request() proxy handles CORS. We use a global
      // that App.tsx sets on first successful context fetch to avoid prop drilling.
      const apiBase: string = (window as Window & { __meridianApiBase?: string }).__meridianApiBase ?? '{{setting.api_base_url}}';

      const resp = await fetch(`${apiBase}/nps`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId,
          score,
          month: currentYearMonth,
          comment: comment.trim() || undefined,
        }),
      });

      if (!resp.ok) {
        throw new Error(`NPS submit failed: ${resp.status}`);
      }

      // Mark as shown in localStorage and close
      localStorage.setItem(`nps_shown_${currentYearMonth}`, 'true');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  };

  const scoreButtons = Array.from({ length: 10 }, (_, i) => i + 1);

  return (
    <Modal onClose={onClose} style={{ maxWidth: '400px' }}>
      <Header>How helpful is Meridian in your daily work?</Header>
      <ModalBody>
        <div style={{ marginBottom: '16px' }}>
          <p style={{ fontSize: '13px', color: '#68737d', margin: '0 0 12px 0' }}>
            Rate from 1 (not helpful) to 10 (extremely helpful)
          </p>
          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
            {scoreButtons.map((n) => (
              <button
                key={n}
                onClick={() => setScore(n)}
                style={{
                  width: '36px',
                  height: '36px',
                  border: score === n ? '2px solid #1f73b7' : '1px solid #d8dcde',
                  borderRadius: '4px',
                  background: score === n ? '#1f73b7' : '#fff',
                  color: score === n ? '#fff' : '#2f3941',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: score === n ? 'bold' : 'normal',
                }}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        <Field>
          <Label>Any comments? (optional)</Label>
          <Textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={2}
            placeholder="What could Meridian do better?"
          />
        </Field>

        {error && (
          <p style={{ fontSize: '12px', color: '#cc0000', marginTop: '8px' }}>{error}</p>
        )}
      </ModalBody>
      <ModalFooter>
        <Button size="small" onClick={onClose} disabled={submitting}>
          Cancel
        </Button>
        <Button
          size="small"
          isPrimary
          onClick={handleSubmit}
          disabled={score === null || submitting}
          style={{ marginLeft: '8px' }}
        >
          {submitting ? 'Submitting…' : 'Submit feedback'}
        </Button>
      </ModalFooter>
      <Close aria-label="Close" />
    </Modal>
  );
}
