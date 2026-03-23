export interface VocReview {
  reviewId: string;
  platform: 'trustpilot' | 'app_store' | 'google_play';
  rating: number;
  author: string;
  text: string;
  reviewedAt: string;
}

/**
 * Creates a Zendesk ticket from a 1-star review.
 * Returns the new Zendesk ticketId string.
 */
export async function createZendeskTicketFromReview(
  review: VocReview,
  subdomain: string,
  apiToken: string,
): Promise<string> {
  const platformLabel = review.platform.replace(/_/g, ' ');
  const subject = `[VoC] ${platformLabel} 1-star review — ${review.author}`;

  const body = [
    `Platform: ${platformLabel}`,
    `Rating: ${review.rating}`,
    `Reviewed at: ${review.reviewedAt}`,
    ``,
    review.text,
  ].join('\n');

  const response = await fetch(
    `https://${subdomain}.zendesk.com/api/v2/tickets`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiToken}`,
      },
      body: JSON.stringify({
        ticket: {
          subject,
          comment: {
            body,
            public: false,
          },
          type: 'task',
          priority: 'normal',
          tags: ['voc', `voc-${review.platform.toLowerCase()}`, '1-star'],
        },
      }),
    },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Zendesk ticket creation failed (${response.status}): ${text}`,
    );
  }

  const data = (await response.json()) as { ticket: { id: number } };
  return String(data.ticket.id);
}
