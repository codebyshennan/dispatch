import type { Classification } from '@dispatch/core';

function formatPriority(urgency: string): string {
  const labels: Record<string, string> = {
    P1: 'P1 - CRITICAL (Fraud/Account Compromise/Regulatory)',
    P2: 'P2 - HIGH (Payment Failure/Card Blocked)',
    P3: 'P3 - MEDIUM (General Support)',
    P4: 'P4 - LOW (Feature Request/Feedback)',
  };
  return labels[urgency] ?? urgency;
}

function formatClassificationNote(ticketId: string, c: Classification): string {
  const complianceBlock = c.compliance_flags.length > 0
    ? `\n[COMPLIANCE FLAGS: ${c.compliance_flags.join(', ')}]\n`
    : '';
  const cryptoBlock = c.crypto_specific_tags.length > 0
    ? `\nCrypto Tags: ${c.crypto_specific_tags.join(', ')}`
    : '';

  return [
    `[Meridian Classification - Shadow Mode]`,
    `Ticket: ${ticketId}`,
    `Category: ${c.category} / ${c.sub_category}`,
    `Priority: ${formatPriority(c.urgency)}`,
    `Sentiment: ${(c.sentiment * 100).toFixed(0)}%`,
    `Language: ${c.language}`,
    `Confidence: ${(c.confidence * 100).toFixed(1)}%`,
    complianceBlock,
    cryptoBlock,
  ].filter(Boolean).join('\n');
}

export async function writeShadowNote(
  ticketId: string,
  classification: Classification,
  subdomain: string,
  apiToken: string,
): Promise<void> {
  const noteBody = formatClassificationNote(ticketId, classification);

  const res = await fetch(
    `https://${subdomain}.zendesk.com/api/v2/tickets/${ticketId}`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiToken}`,
      },
      body: JSON.stringify({
        ticket: {
          comment: { body: noteBody, public: false },
        },
      }),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Zendesk shadow note write failed: ${res.status} ${text}`);
  }
}
