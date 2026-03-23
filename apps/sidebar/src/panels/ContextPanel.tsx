import React from 'react';
import { Skeleton } from '@zendeskgarden/react-loaders';
import { Tag } from '@zendeskgarden/react-tags';
import { Paragraph, Span } from '@zendeskgarden/react-typography';
import { useContextData } from '../hooks/useContextData';

function PendingField({ label }: { label: string }) {
  return (
    <Paragraph style={{ color: '#68737d' }}>
      <Span isBold>{label}:</Span>{' '}
      <Span style={{ fontStyle: 'italic', fontSize: '12px' }}>Pending Reap API access</Span>
    </Paragraph>
  );
}

export function ContextPanel() {
  const { context, contextLoading } = useContextData();

  if (contextLoading) return <Skeleton width="100%" height="280px" />;
  if (!context) return <Paragraph>Unable to load context.</Paragraph>;

  return (
    <div style={{ padding: '8px 0' }}>
      {/* Zendesk-native fields — fetched via client.get(['ticket.requester.name', ...]) */}
      <Paragraph><Span isBold>Customer:</Span> {context.requesterName}</Paragraph>
      <Paragraph><Span isBold>Email:</Span> {context.requesterEmail}</Paragraph>
      <Paragraph><Span isBold>Organization:</Span> {context.orgName}</Paragraph>
      <Paragraph><Span isBold>Status:</Span> {context.status}</Paragraph>
      {context.tags.length > 0 && (
        <div style={{ marginTop: '8px' }}>
          <Span isBold>Tags:</Span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '4px' }}>
            {context.tags.map(tag => (
              <Tag key={tag}><span>{tag}</span></Tag>
            ))}
          </div>
        </div>
      )}

      {/* Reap-specific fields — placeholders until Phase 5 Reap API integration */}
      <div style={{ marginTop: '16px', borderTop: '1px solid #e9ebed', paddingTop: '12px' }}>
        <Paragraph style={{ color: '#49545c', fontWeight: 600, marginBottom: '8px', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Reap Account
        </Paragraph>
        <PendingField label="KYC Status" />
        <PendingField label="Active Products" />
        <PendingField label="Open Ticket Count" />
      </div>
    </div>
  );
}
