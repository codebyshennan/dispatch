import React, { useState, useEffect, useRef } from 'react';
import { Skeleton, Dots } from '@zendeskgarden/react-loaders';
import { Tag } from '@zendeskgarden/react-tags';
import { Notification, Title } from '@zendeskgarden/react-notifications';
import { Paragraph, Span } from '@zendeskgarden/react-typography';
import { Button } from '@zendeskgarden/react-buttons';
import { Modal, Header, Body as ModalBody, Footer as ModalFooter, Close } from '@zendeskgarden/react-modals';
import { Field, Label, Textarea } from '@zendeskgarden/react-forms';
import { useBeaconData } from '../hooks/useBeaconData';
import { useClient } from '../contexts/ClientProvider';
import levenshtein from 'fast-levenshtein';
import type { Classification, ResponseDraft, KBResult, SimilarTicket, ModeStatus, QAScore } from '@beacon/core';

const URGENCY_COLOR: Record<string, string> = {
  P1: '#cc0000',
  P2: '#d97c00',
  P3: '#1f73b7',
  P4: '#68737d',
};

const QA_GRADE_COLOR: Record<string, string> = {
  high: '#166534', medium: '#92400e', low: '#991b1b',
};
const QA_GRADE_BG: Record<string, string> = {
  high: 'rgba(34,197,94,0.12)', medium: 'rgba(245,158,11,0.12)', low: 'rgba(220,38,38,0.12)',
};

function QAScorePill({ qaScore }: { qaScore: QAScore }) {
  const color = QA_GRADE_COLOR[qaScore.grade] ?? '#68737d';
  const bg    = QA_GRADE_BG[qaScore.grade] ?? 'transparent';
  const title = [
    `KB Coverage: ${Math.round(qaScore.signals.kbCoverage)}/40`,
    `Confidence: ${Math.round(qaScore.signals.confidence)}/30`,
    `Compliance: ${Math.round(qaScore.signals.complianceClean)}/20`,
    `Draft Length: ${Math.round(qaScore.signals.draftLength)}/10`,
    `Total: ${Math.round(qaScore.score)}/100`,
  ].join('\n');
  return (
    <span
      title={title}
      style={{
        fontSize: '11px', fontWeight: 600, padding: '1px 6px', borderRadius: 4,
        background: bg, color, border: `1px solid ${color}55`, cursor: 'help',
      }}
    >
      QA {Math.round(qaScore.score)} {qaScore.grade.toUpperCase()}
    </span>
  );
}

const ROUTING_COLOR: Record<string, string> = {
  auto_send: '#22c55e',
  agent_assisted: '#1f73b7',
  escalate: '#cc0000',
};

function wordEditRatio(a: string, b: string): number {
  const charDist = levenshtein.get(a, b);
  return charDist / Math.max(a.length, b.length, 1);
}

// ── Compliance banner ────────────────────────────────────────────────────────
function ComplianceBanner({ flags }: { flags: string[] }) {
  return (
    <div style={{
      position: 'sticky',
      top: 0,
      zIndex: 20,
      background: '#fef2f2',
      border: '1px solid #fca5a5',
      borderRadius: '6px',
      padding: '10px 12px',
      marginBottom: '12px',
      display: 'flex',
      alignItems: 'flex-start',
      gap: '8px',
    }}>
      {/* Warning icon */}
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }}>
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" fill="#dc2626" opacity="0.15" stroke="#dc2626" strokeWidth="1.5" />
        <line x1="12" y1="9" x2="12" y2="13" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" />
        <line x1="12" y1="17" x2="12.01" y2="17" stroke="#dc2626" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <div>
        <div style={{ fontSize: '12px', fontWeight: 700, color: '#991b1b', marginBottom: '2px' }}>
          Compliance Flag{flags.length > 1 ? 's' : ''} Detected
        </div>
        <div style={{ fontSize: '12px', color: '#b91c1c' }}>
          {flags.join(' · ')}
        </div>
      </div>
    </div>
  );
}

// ── KB source item (expandable) ──────────────────────────────────────────────
function KBSourceItem({ article, index }: { article: KBResult; index: number }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div style={{
      border: '1px solid #e9ebed',
      borderRadius: '4px',
      overflow: 'hidden',
      marginBottom: '4px',
    }}>
      <button
        onClick={() => setExpanded(e => !e)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          padding: '6px 8px',
          background: expanded ? '#f3f4f6' : '#f8f9f9',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
          gap: '8px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
          <span style={{
            fontSize: '10px', fontWeight: 700, color: '#fff',
            background: '#1f73b7', borderRadius: '3px',
            padding: '1px 5px', flexShrink: 0,
          }}>KB{index + 1}</span>
          <span style={{ fontSize: '12px', color: '#2f3941', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {article.title}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
          <span style={{ fontSize: '11px', color: '#68737d' }}>
            {Math.round(article.similarity * 100)}%
          </span>
          {/* Chevron */}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#68737d" strokeWidth="2" strokeLinecap="round" aria-hidden="true"
            style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.15s ease' }}>
            <path d="M6 9l6 6 6-6" />
          </svg>
        </div>
      </button>
      {expanded && (
        <div style={{ padding: '8px', background: '#fff', borderTop: '1px solid #e9ebed' }}>
          <p style={{ fontSize: '12px', color: '#49545c', lineHeight: 1.5, margin: 0, marginBottom: '6px' }}>
            {article.text.slice(0, 500)}{article.text.length > 500 ? '…' : ''}
          </p>
          <a href={article.html_url} target="_blank" rel="noreferrer"
            style={{ fontSize: '11px', color: '#1f73b7' }}>
            Open in Help Center ↗
          </a>
        </div>
      )}
    </div>
  );
}

// ── Regenerate section ───────────────────────────────────────────────────────
function RegenerateSection({
  ticketId,
  currentDraft,
  onNewDraft,
  client,
}: {
  ticketId: string;
  currentDraft: string;
  onNewDraft: (draft: string) => void;
  client: ReturnType<typeof useClient>;
}) {
  const [open, setOpen] = useState(false);
  const [instruction, setInstruction] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRegenerate = async () => {
    if (!instruction.trim()) { setError('Enter an instruction'); return; }
    setError(null);
    setLoading(true);
    try {
      const res = await client.request({
        url: '{{setting.api_base_url}}/regenerate',
        type: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({ ticketId, currentDraft, instruction: instruction.trim() }),
      }) as { draft?: string; error?: string };
      if (res.error) throw new Error(res.error);
      if (res.draft) {
        onNewDraft(res.draft);
        setOpen(false);
        setInstruction('');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Regeneration failed');
    } finally {
      setLoading(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          background: 'none', border: 'none', padding: 0,
          fontSize: '12px', color: '#68737d', cursor: 'pointer',
          textDecoration: 'underline', textDecorationStyle: 'dotted',
        }}
      >
        Regenerate with instruction…
      </button>
    );
  }

  return (
    <div style={{ border: '1px solid #e9ebed', borderRadius: '4px', padding: '10px', marginTop: '4px', background: '#f8f9f9' }}>
      <Field>
        <Label style={{ fontSize: '11px' }}>Instruction for regeneration</Label>
        <Textarea
          value={instruction}
          onChange={e => setInstruction(e.target.value)}
          rows={2}
          placeholder="e.g. Make it shorter · Use a more formal tone · Add an apology"
          disabled={loading}
          style={{ fontSize: '12px' }}
        />
      </Field>
      {error && <p style={{ color: '#cc0000', fontSize: '12px', margin: '4px 0 0' }}>{error}</p>}
      <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
        <Button size="small" isPrimary onClick={handleRegenerate} disabled={loading}>
          {loading ? 'Regenerating…' : 'Regenerate'}
        </Button>
        <Button size="small" onClick={() => { setOpen(false); setInstruction(''); setError(null); }} disabled={loading}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────
export function IntelligencePanel() {
  const { data, loading } = useBeaconData();
  const client = useClient();
  const [draft, setDraft] = useState<string>('');
  const [originalDraft, setOriginalDraft] = useState<string>('');
  const [feedbackModal, setFeedbackModal] = useState<'up' | 'down' | null>(null);
  const [feedbackNote, setFeedbackNote] = useState('');
  const [routingMode, setRoutingMode] = useState<ModeStatus | null>(null);
  const [sendConfirmOpen, setSendConfirmOpen] = useState(false);
  const [sendNotification, setSendNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  React.useEffect(() => {
    const responseDraft = data?.responseDraft as ResponseDraft | undefined;
    if (responseDraft?.draft && !draft) {
      setDraft(responseDraft.draft);
    }
  }, [data?.responseDraft]);

  React.useEffect(() => {
    if (!originalDraft) return;
    const handler = async () => {
      const ticketData = await client.get('ticket.comment.text') as Record<string, string>;
      const sentText = ticketData['ticket.comment.text'] ?? '';
      const editRatio = wordEditRatio(originalDraft, sentText);
      client.request({
        url: '{{setting.api_base_url}}/feedback',
        type: 'POST',
        contentType: 'application/json',
        data: JSON.stringify({ ticketId: data?.ticketId, rating: 'neutral', originalDraft, sentText, editRatio }),
      }).catch(() => {});
    };
    client.on('ticket.submit.done', handler);
  }, [client, originalDraft, data?.ticketId]);

  React.useEffect(() => {
    if (!data?.ticketId) return;
    client.request({ url: '{{setting.api_base_url}}/mode', type: 'GET' })
      .then((res: unknown) => setRoutingMode(res as ModeStatus))
      .catch(() => setRoutingMode(null));
  }, [client, data?.ticketId]);

  if (loading) return <Skeleton width="100%" height="300px" />;

  if (!data || data.status === 'pending') {
    return (
      <div style={{ textAlign: 'center', padding: '24px' }}>
        <Dots />
        <Paragraph style={{ marginTop: '12px', color: '#68737d' }}>
          Analysis in progress — this typically takes 30–90 seconds.
        </Paragraph>
      </div>
    );
  }

  const classification = data.classification as Classification | undefined;
  const responseDraft = data.responseDraft as ResponseDraft | undefined;
  const kbArticles = (data.kbArticles as KBResult[] | undefined) ?? [];
  const qaScore = data.qaScore as QAScore | undefined;
  const similarTickets = data.similarTickets as SimilarTicket[] | undefined;

  const isAgentAssisted = routingMode?.mode === 'agent_assisted';
  const isEligibleForSend = isAgentAssisted && (classification?.urgency === 'P3' || classification?.urgency === 'P4');

  const handleInsertDraft = async () => {
    if (!draft) return;
    setOriginalDraft(draft);
    await client.invoke('comment.appendText', draft);
  };

  const handleFeedbackSubmit = () => {
    if (!feedbackModal) return;
    client.request({
      url: '{{setting.api_base_url}}/feedback',
      type: 'POST',
      contentType: 'application/json',
      data: JSON.stringify({ ticketId: data.ticketId, rating: feedbackModal, note: feedbackNote || undefined }),
    }).catch(() => {});
    setFeedbackModal(null);
    setFeedbackNote('');
  };

  const handleSendConfirm = () => {
    setSendConfirmOpen(false);
    client.request({
      url: '{{setting.api_base_url}}/send',
      type: 'POST',
      contentType: 'application/json',
      data: JSON.stringify({
        ticketId: data.ticketId,
        draftText: draft,
        originalDraft: responseDraft?.draft ?? draft,
        urgency: classification?.urgency,
      }),
    }).then(() => {
      setSendNotification({ type: 'success', message: 'Response sent to customer.' });
      setTimeout(() => setSendNotification(null), 5000);
    }).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setSendNotification({ type: 'error', message: `Send failed: ${message}` });
      setTimeout(() => setSendNotification(null), 8000);
    });
  };

  return (
    <div style={{ padding: '8px 0' }}>

      {/* ── 1. Sticky compliance banner ──────────────────────────────────── */}
      {classification && classification.compliance_flags.length > 0 && (
        <ComplianceBanner flags={classification.compliance_flags} />
      )}

      {/* ── 2. Send result notification ──────────────────────────────────── */}
      {sendNotification && (
        <Notification type={sendNotification.type} style={{ marginBottom: '8px' }}>
          <Title>{sendNotification.type === 'success' ? 'Success' : 'Error'}</Title>
          {sendNotification.message}
        </Notification>
      )}

      {/* ── 3. Classification card ───────────────────────────────────────── */}
      {classification && (
        <div style={{ marginBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
            <Tag style={{ background: URGENCY_COLOR[classification.urgency], color: 'white' }}>
              <span>{classification.urgency}</span>
            </Tag>
            <Span>{classification.category} / {classification.sub_category}</Span>
            {qaScore && <QAScorePill qaScore={qaScore} />}
          </div>
          <Paragraph>
            Confidence: <Span isBold>{Math.round(classification.confidence * 100)}%</Span>
            &nbsp;·&nbsp;Sentiment: <Span isBold>{classification.sentiment.toFixed(2)}</Span>
            &nbsp;·&nbsp;Lang: <Span isBold>{classification.language}</Span>
          </Paragraph>
        </div>
      )}

      {/* ── 4. Draft response card (with inline KB sources) ──────────────── */}
      {responseDraft && (
        <div style={{ marginBottom: '12px' }}>
          {/* Routing mode badge */}
          <div style={{ marginBottom: '6px' }}>
            <Tag style={{
              background: ROUTING_COLOR[responseDraft.routing] ?? '#68737d',
              color: 'white', fontSize: '11px',
            }}>
              <span>{responseDraft.routing === 'auto_send' ? 'Auto-send eligible' : responseDraft.routing === 'escalate' ? 'Escalate' : 'Agent-assisted'}</span>
            </Tag>
          </div>

          <Field>
            <Label>Draft Response</Label>
            <Textarea
              value={draft}
              onChange={e => setDraft(e.target.value)}
              rows={6}
              style={{ fontFamily: 'inherit' }}
            />
          </Field>

          {/* KB sources inline */}
          {kbArticles.length > 0 && (
            <div style={{ marginTop: '10px' }}>
              <Span style={{ fontSize: '11px', color: '#68737d', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '6px' }}>
                Sources ({kbArticles.length})
              </Span>
              {kbArticles.slice(0, 3).map((article, i) => (
                <KBSourceItem key={article.article_id} article={article} index={i} />
              ))}
            </div>
          )}

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: '8px', marginTop: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            <Button size="small" isPrimary onClick={handleInsertDraft}>
              Insert Draft
            </Button>
            {isEligibleForSend && (
              <Button size="small" isPrimary onClick={() => setSendConfirmOpen(true)} data-testid="send-response-btn"
                style={{ background: '#2f3941', borderColor: '#2f3941' }}>
                Send Response
              </Button>
            )}
            <Button size="small" onClick={() => setFeedbackModal('up')} aria-label="Thumbs up">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z" />
                <path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
              </svg>
            </Button>
            <Button size="small" onClick={() => setFeedbackModal('down')} aria-label="Thumbs down">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3H10z" />
                <path d="M17 2h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17" />
              </svg>
            </Button>
          </div>

          {/* Regenerate section */}
          <div style={{ marginTop: '8px' }}>
            <RegenerateSection
              ticketId={data.ticketId}
              currentDraft={draft}
              onNewDraft={setDraft}
              client={client}
            />
          </div>
        </div>
      )}

      {/* ── 5. Similar resolved tickets ───────────────────────────────────── */}
      {similarTickets && similarTickets.length > 0 && (
        <div style={{ marginBottom: '12px' }}>
          <Span isBold>Similar Resolved Tickets</Span>
          <ul style={{ margin: '4px 0', paddingLeft: '16px' }}>
            {similarTickets.slice(0, 3).map(ticket => (
              <li key={ticket.ticketId}>
                <Span style={{ fontFamily: 'monospace', fontSize: '12px' }}>#{ticket.ticketId}</Span>
                <Span style={{ color: '#68737d', fontSize: '11px' }}>
                  {' '}— {ticket.category}
                  {ticket.resolvedAt ? ` · resolved ${new Date(ticket.resolvedAt).toLocaleDateString()}` : ''}
                </Span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Modals ────────────────────────────────────────────────────────── */}
      {sendConfirmOpen && (
        <Modal onClose={() => setSendConfirmOpen(false)}>
          <Header>Send Response to Customer</Header>
          <ModalBody>
            <Paragraph>Send this response directly to the customer? This cannot be undone.</Paragraph>
          </ModalBody>
          <ModalFooter>
            <Button size="small" onClick={() => setSendConfirmOpen(false)}>Cancel</Button>
            <Button size="small" isPrimary onClick={handleSendConfirm} style={{ marginLeft: '8px' }}>Send</Button>
          </ModalFooter>
          <Close aria-label="Close modal" />
        </Modal>
      )}

      {feedbackModal && (
        <Modal onClose={() => setFeedbackModal(null)}>
          <Header>{feedbackModal === 'up' ? 'Positive Feedback' : 'Negative Feedback'}</Header>
          <ModalBody>
            <Field>
              <Label>Optional note (what worked or what to improve)</Label>
              <Textarea
                value={feedbackNote}
                onChange={e => setFeedbackNote(e.target.value)}
                rows={3}
                placeholder="e.g. Draft missed the jurisdiction-specific disclaimer"
              />
            </Field>
          </ModalBody>
          <ModalFooter>
            <Button size="small" onClick={() => setFeedbackModal(null)}>Cancel</Button>
            <Button size="small" isPrimary onClick={handleFeedbackSubmit} style={{ marginLeft: '8px' }}>Submit Feedback</Button>
          </ModalFooter>
          <Close aria-label="Close modal" />
        </Modal>
      )}
    </div>
  );
}
