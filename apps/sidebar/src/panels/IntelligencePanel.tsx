import React, { useState } from 'react';
import { Skeleton, Dots } from '@zendeskgarden/react-loaders';
import { Tag } from '@zendeskgarden/react-tags';
import { Notification, Title } from '@zendeskgarden/react-notifications';
import { Paragraph, Span } from '@zendeskgarden/react-typography';
import { Button, IconButton } from '@zendeskgarden/react-buttons';
import { Modal, Header, Body as ModalBody, Footer as ModalFooter, Close } from '@zendeskgarden/react-modals';
import { Field, Label, Textarea } from '@zendeskgarden/react-forms';
import { useMeridianData } from '../hooks/useMeridianData';
import { useClient } from '../contexts/ClientProvider';
import levenshtein from 'fast-levenshtein';
import type { Classification, ResponseDraft, KBResult, SimilarTicket } from '@meridian/core';

// Urgency badge color mapping
const URGENCY_COLOR: Record<string, string> = {
  P1: '#cc0000',  // red
  P2: '#d97c00',  // orange
  P3: '#1f73b7',  // blue
  P4: '#68737d',  // grey
};

function wordEditRatio(a: string, b: string): number {
  const charDist = levenshtein.get(a, b);
  return charDist / Math.max(a.length, b.length, 1);
}

export function IntelligencePanel() {
  const { data, loading } = useMeridianData();
  const client = useClient();
  const [draft, setDraft] = useState<string>('');
  const [originalDraft, setOriginalDraft] = useState<string>('');
  const [feedbackModal, setFeedbackModal] = useState<'up' | 'down' | null>(null);
  const [feedbackNote, setFeedbackNote] = useState('');

  // Sync draft textarea when data arrives
  React.useEffect(() => {
    const responseDraft = data?.responseDraft as ResponseDraft | undefined;
    if (responseDraft?.draft && !draft) {
      setDraft(responseDraft.draft);
    }
  }, [data?.responseDraft]);

  // ZAF-06: track edit distance on ticket submit
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
        data: JSON.stringify({
          ticketId: data?.ticketId,
          rating: 'neutral',
          originalDraft,
          sentText,
          editRatio,
        }),
      }).catch(() => {});
    };
    client.on('ticket.submit.done', handler);
  }, [client, originalDraft, data?.ticketId]);

  if (loading) return <Skeleton width="100%" height="300px" />;

  if (!data || data.status === 'pending') {
    return (
      <div style={{ textAlign: 'center', padding: '24px' }}>
        <Dots />
        <Paragraph style={{ marginTop: '12px', color: '#68737d' }}>
          Analysis in progress — Meridian is processing this ticket.
          This typically takes 30–90 seconds.
        </Paragraph>
      </div>
    );
  }

  const classification = data.classification as Classification | undefined;
  const responseDraft = data.responseDraft as ResponseDraft | undefined;
  const kbArticles = data.kbArticles as KBResult[] | undefined;
  const similarTickets = data.similarTickets as SimilarTicket[] | undefined;

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
      data: JSON.stringify({
        ticketId: data.ticketId,
        rating: feedbackModal,
        note: feedbackNote || undefined,
      }),
    }).catch(() => {});
    setFeedbackModal(null);
    setFeedbackNote('');
  };

  return (
    <div style={{ padding: '8px 0' }}>
      {/* Classification card */}
      {classification && (
        <div style={{ marginBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <Tag style={{ background: URGENCY_COLOR[classification.urgency], color: 'white' }}>
              <span>{classification.urgency}</span>
            </Tag>
            <Span>{classification.category} / {classification.sub_category}</Span>
          </div>
          <Paragraph>
            Confidence: <Span isBold>{Math.round(classification.confidence * 100)}%</Span>
            &nbsp;·&nbsp;Sentiment: <Span isBold>{classification.sentiment.toFixed(2)}</Span>
            &nbsp;·&nbsp;Lang: <Span isBold>{classification.language}</Span>
          </Paragraph>
          {classification.compliance_flags.length > 0 && (
            <Notification type="error" style={{ marginTop: '8px' }}>
              <Title>Compliance Flags</Title>
              {classification.compliance_flags.join(', ')}
            </Notification>
          )}
        </div>
      )}

      {/* Draft response */}
      {responseDraft && (
        <div style={{ marginBottom: '12px' }}>
          <Field>
            <Label>Draft Response</Label>
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={6}
              style={{ fontFamily: 'inherit' }}
            />
          </Field>
          <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
            <Button size="small" isPrimary onClick={handleInsertDraft}>
              Insert Draft
            </Button>
            <IconButton
              aria-label="Thumbs up"
              size="small"
              onClick={() => setFeedbackModal('up')}
            >
              👍
            </IconButton>
            <IconButton
              aria-label="Thumbs down"
              size="small"
              onClick={() => setFeedbackModal('down')}
            >
              👎
            </IconButton>
          </div>
        </div>
      )}

      {/* KB references */}
      {kbArticles && kbArticles.length > 0 && (
        <div style={{ marginBottom: '12px' }}>
          <Span isBold>KB References</Span>
          <ul style={{ margin: '4px 0', paddingLeft: '16px' }}>
            {kbArticles.slice(0, 3).map(article => (
              <li key={article.article_id}>
                <a href={article.html_url} target="_blank" rel="noreferrer">
                  {article.title}
                </a>
                <Span style={{ color: '#68737d', fontSize: '11px' }}>
                  {' '}({Math.round(article.similarity * 100)}% match)
                </Span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Similar resolved tickets (ZAF-04) */}
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

      {/* Feedback modal */}
      {feedbackModal && (
        <Modal onClose={() => setFeedbackModal(null)}>
          <Header>{feedbackModal === 'up' ? 'Positive Feedback' : 'Negative Feedback'}</Header>
          <ModalBody>
            <Field>
              <Label>Optional note (what worked or what to improve)</Label>
              <Textarea
                value={feedbackNote}
                onChange={(e) => setFeedbackNote(e.target.value)}
                rows={3}
                placeholder="e.g. Draft missed the jurisdiction-specific disclaimer"
              />
            </Field>
          </ModalBody>
          <ModalFooter>
            <Button size="small" onClick={() => setFeedbackModal(null)}>Cancel</Button>
            <Button size="small" isPrimary onClick={handleFeedbackSubmit} style={{ marginLeft: '8px' }}>
              Submit Feedback
            </Button>
          </ModalFooter>
          <Close aria-label="Close modal" />
        </Modal>
      )}
    </div>
  );
}
