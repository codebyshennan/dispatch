import { Hono } from 'hono';
import { handle } from 'hono/aws-lambda';
import type { Ticket } from '@meridian/core';

const app = new Hono();

app.get('/health', (c) => c.json({ status: 'ok' }));

// Stub for eval endpoints — implemented in Plan 04
app.post('/eval/run', async (c) => {
  // Ticket type imported to confirm @meridian/core dependency is resolvable
  const _ticket: Ticket | undefined = undefined;
  void _ticket;
  return c.json({ message: 'Not yet implemented' }, 501);
});

export const handler = handle(app);
