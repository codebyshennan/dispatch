import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import { loadOrBuildKBIndex } from './kb-index';
import { analyze, regenerateDraft } from './pipeline';
import { sessionStore } from './session-store.js';
import type { Classification } from '@beacon/core';
import type { KBResult } from '@beacon/core';
import type { SidebarPayload } from '@beacon/core';

const app = new Hono();
const PORT = Number(process.env.PORT ?? 3001);

// CORS — allow any localhost origin (dev)
app.use('*', cors({ origin: (o) => o.startsWith('http://localhost') ? o : '' }));

// Request logger
app.use('*', async (c, next) => {
  const origin = c.req.header('origin') ?? '-';
  const referer = c.req.header('referer') ?? '-';
  console.log(`[req] ${c.req.method} ${c.req.url}  origin=${origin}  referer=${referer}`);
  await next();
  console.log(`[res] ${c.req.method} ${c.req.path} → ${c.res.status}`);
});

// In-memory store: ticketId → SidebarPayload
const results = new Map<string, SidebarPayload>();
const ticketContext = new Map<string, { subject: string; body: string }>();

// POST /analyze — submit a ticket, run pipeline, return ticketId
app.post('/analyze', async (c) => {
  let subject: string, body: string;
  try {
    ({ subject, body } = await c.req.json<{ subject: string; body: string }>());
  } catch {
    return c.json({ error: 'invalid JSON body' }, 400);
  }
  if (!subject && !body) return c.json({ error: 'subject or body required' }, 400);
  const { ticketId, payload } = await analyze({ subject: subject ?? '', body: body ?? '' });
  results.set(ticketId, payload);
  ticketContext.set(ticketId, { subject: subject.trim(), body: body.trim() });
  const routing = (payload.responseDraft as { routing?: string } | undefined)?.routing;
  if (routing === 'auto_send' || routing === 'agent_assisted' || routing === 'escalate') {
    sessionStore.recordAnalysis(routing);
  }
  return c.json({
    ticketId,
    classification: {
      category: payload.classification.category,
      urgency:  payload.classification.urgency,
      sentiment: payload.classification.sentiment,
      routing: (payload.responseDraft as { routing?: string })?.routing ?? 'agent_assisted',
    },
  });
});

// GET /context/:ticketId — polled by useBeaconData
app.get('/context/:ticketId', (c) => {
  const payload = results.get(c.req.param('ticketId'));
  if (!payload) return c.json({ ticketId: c.req.param('ticketId'), status: 'pending' });
  return c.json(payload);
});

// GET /mode — static agent_assisted for demo
app.get('/mode', (c) => c.json({ mode: 'agent_assisted', threshold: 0.8, currentScore: 0.95 }));

// Feedback — wired to sessionStore for draft acceptance tracking
app.post('/feedback', async (c) => {
  const body = await c.req.json<{ ticketId: string; rating: 'up' | 'down' | 'neutral'; editRatio?: number }>().catch(() => null);
  if (body && typeof body.editRatio === 'number') {
    sessionStore.recordFeedback(body.editRatio);
  }
  return c.json({ ok: true });
});
app.post('/telemetry', (c) => { console.log('[demo] telemetry received'); return c.json({ ok: true }); });
app.post('/nps', (c) => { console.log('[demo] nps received'); return c.json({ ok: true }); });
app.post('/send', (c) => { console.log('[demo] send received'); return c.json({ ok: true }); });
app.post('/runbooks/:id', async (c) => {
  const id = c.req.param('id');
  let params: Record<string, string> = {};
  try { params = await c.req.json(); } catch { /* no body */ }
  console.log(`[demo] runbook executed: ${id}`, params);

  const now = new Date().toISOString();
  // Reap CaaS API — realistic mock responses per endpoint
  const RESULTS: Record<string, object> = {
    // PUT /cards/{cardId}/status
    freeze_card: {
      id: params.cardId || 'crd_4821a8e3f2',
      status: params.status || 'frozen',
      last4: (params.cardId || 'crd_4821a8e3f2').slice(-4),
      updatedAt: now,
      message: `Card successfully ${params.status === 'active' ? 'unfrozen' : 'frozen'}`,
    },
    // PUT /cards/{cardId}/block
    block_card: {
      id: params.cardId || 'crd_4821a8e3f2',
      status: 'blocked',
      last4: (params.cardId || 'crd_4821a8e3f2').slice(-4),
      blockedAt: now,
      message: 'Card permanently blocked. A replacement card can be issued via POST /cards.',
    },
    // GET /cards/{cardId}/transactions
    list_transactions: {
      cardId: params.cardId || 'crd_4821a8e3f2',
      data: [
        { id: 'txn_8821c3d1', merchantName: 'INTL TECH SVC',   amount: -8400,  currency: 'HKD', status: 'disputed', createdAt: '2024-03-21T09:14:22Z' },
        { id: 'txn_2291a4f0', merchantName: 'AWS Asia Pacific', amount: -3200,  currency: 'HKD', status: 'cleared',  createdAt: '2024-03-20T15:30:01Z' },
        { id: 'txn_4417d9c8', merchantName: 'Stripe HK Ltd',    amount: -18900, currency: 'HKD', status: 'cleared',  createdAt: '2024-03-15T11:05:44Z' },
      ],
      total: 3,
    },
    // GET /transactions/{transactionId}
    get_transaction: {
      id: params.transactionId || 'txn_8821c3d1',
      merchantName: 'INTL TECH SVC',
      merchantCategory: '7372',
      amount: -8400,
      currency: 'HKD',
      status: 'disputed',
      cardId: 'crd_4821a8e3f2',
      cardLast4: '4821',
      authCode: 'A48291',
      createdAt: '2024-03-21T09:14:22Z',
      settledAt: '2024-03-22T00:00:00Z',
    },
    // POST /transactions/{transactionId}/fraud-alert
    report_fraud: {
      id: `frd_${Date.now().toString(36)}`,
      transactionId: params.transactionId || 'txn_8821c3d1',
      status: 'open',
      reason: params.reason || 'Unauthorized charge',
      createdAt: now,
      message: 'Fraud alert created. Transaction flagged for review.',
    },
    // GET /account/balance
    get_balance: {
      availableBalance: 215250,
      totalBalance: 500000,
      currency: 'HKD',
      updatedAt: now,
    },
    // PUT /cards/{cardId}/spend-control
    update_spend_control: {
      id: params.cardId || 'crd_4821a8e3f2',
      spendControl: {
        perTransactionLimit: Number(params.perTransactionLimit) || 5000,
        monthlyLimit: Number(params.monthlyLimit) || 20000,
        currency: 'HKD',
      },
      updatedAt: now,
      message: 'Spend controls updated successfully.',
    },
  };

  const result = RESULTS[id] ?? { status: 'success', message: `${id} completed`, timestamp: now };
  return c.json({ ok: true, runbookId: id, ...result });
});
app.post('/regenerate', async (c) => {
  let ticketId: string, currentDraft: string, instruction: string;
  try {
    ({ ticketId, currentDraft, instruction } = await c.req.json<{ ticketId: string; currentDraft: string; instruction: string }>());
  } catch {
    return c.json({ error: 'invalid JSON' }, 400);
  }
  const payload = results.get(ticketId);
  const ctx = ticketContext.get(ticketId);
  if (!payload || !ctx) return c.json({ error: 'ticket not found' }, 404);

  const newDraft = await regenerateDraft({
    ticketId,
    subject: ctx.subject,
    body: ctx.body,
    classification: payload.classification as Classification,
    kbArticles: (payload.kbArticles ?? []) as KBResult[],
    currentDraft,
    instruction: instruction || 'Make the response clearer and more concise',
  });
  return c.json({ draft: newDraft });
});

// GET /metrics — live session metrics polled by dashboard
app.get('/metrics', (c) => c.json(sessionStore.getMetrics()));

app.get('/health', (c) => c.json({ status: 'ok' }));
app.get('/', (c) => c.json({ service: 'beacon-demo-server', status: 'ok' }));

// Startup: build/load KB index, then start server
(async () => {
  await loadOrBuildKBIndex();
  serve({ fetch: app.fetch, port: PORT }, () => {
    console.log(`[demo-server] Running at http://localhost:${PORT}`);
  });
})();
