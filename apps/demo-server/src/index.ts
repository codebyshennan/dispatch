import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import { loadOrBuildKBIndex } from './kb-index.js';
import { analyze } from './pipeline.js';
import type { SidebarPayload } from '@beacon/core';

const app = new Hono();
const PORT = 3001;

// CORS — Vite dev server runs on port 5173
app.use('*', cors({ origin: 'http://localhost:5173' }));

// In-memory store: ticketId → SidebarPayload
const results = new Map<string, SidebarPayload>();

// POST /analyze — submit a ticket, run pipeline, return ticketId
app.post('/analyze', async (c) => {
  const { subject, body } = await c.req.json<{ subject: string; body: string }>();
  if (!subject && !body) return c.json({ error: 'subject or body required' }, 400);
  const { ticketId, payload } = await analyze({ subject: subject ?? '', body: body ?? '' });
  results.set(ticketId, payload);
  return c.json({ ticketId });
});

// GET /context/:ticketId — polled by useBeaconData
app.get('/context/:ticketId', (c) => {
  const payload = results.get(c.req.param('ticketId'));
  if (!payload) return c.json({ ticketId: c.req.param('ticketId'), status: 'pending' });
  return c.json(payload);
});

// GET /mode — static agent_assisted for demo
app.get('/mode', (c) => c.json({ mode: 'agent_assisted', threshold: 0.8, currentScore: 0.95 }));

// No-ops — IntelligencePanel fires these but we don't need them for demo
app.post('/feedback', (c) => { console.log('[demo] feedback received'); return c.json({ ok: true }); });
app.post('/telemetry', (c) => { console.log('[demo] telemetry received'); return c.json({ ok: true }); });
app.post('/nps', (c) => { console.log('[demo] nps received'); return c.json({ ok: true }); });
app.get('/health', (c) => c.json({ status: 'ok' }));

// Startup: build/load KB index, then start server
await loadOrBuildKBIndex();

serve({ fetch: app.fetch, port: PORT }, () => {
  console.log(`[demo-server] Running at http://localhost:${PORT}`);
});
