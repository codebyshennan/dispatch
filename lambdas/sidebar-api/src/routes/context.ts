import { Hono } from 'hono';
import { queryLatest } from '../dynamo.js';
import type { SidebarPayload } from '@beacon/core';

const app = new Hono();

app.get('/:ticketId', async (c) => {
  const ticketId = c.req.param('ticketId');

  const [classificationItem, responseItem, similarItem] = await Promise.all([
    queryLatest(ticketId, 'CLASSIFICATION#').catch(() => null),
    queryLatest(ticketId, 'RESPONSE#').catch(() => null),
    queryLatest(ticketId, 'SIMILAR#').catch(() => null),
  ]);

  const payload: SidebarPayload = {
    ticketId,
    status: 'pending',
  };

  if (classificationItem) {
    try {
      payload.classification = JSON.parse(classificationItem.classification.S!);
      payload.status = 'ready';
    } catch { /* malformed record — treat as pending */ }
  }

  if (responseItem) {
    try {
      payload.responseDraft = JSON.parse(responseItem.responseDraft.S!);
      payload.kbArticles = JSON.parse(responseItem.kbArticles?.S ?? '[]');
      payload.processedAt = responseItem.processedAt?.S;
      payload.status = 'ready';
    } catch { /* malformed record */ }
  }

  if (similarItem) {
    try {
      payload.similarTickets = JSON.parse(similarItem.similarTickets.S ?? '[]');
    } catch { /* malformed record — omit similarTickets */ }
  }

  return c.json(payload);
});

export { app as contextRouter };
