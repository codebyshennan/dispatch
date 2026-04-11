/**
 * Integration tests for the Beacon offline demo pipeline.
 * Runs against real APIs (Cohere + OpenRouter) using credentials from .env.
 * Requires the KB index to exist — run the server once first to build it.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { loadOrBuildKBIndex, searchKB } from '../kb-index';
import { classify } from '../../../../lambdas/classifier/src/classify';
import { generateResponse } from '../../../../lambdas/response-generator/src/generate';
import { analyze } from '../pipeline';

const TIMEOUT = 60_000; // LLM calls can take a while

// ---------------------------------------------------------------------------
// KB index + Cohere embeddings
// ---------------------------------------------------------------------------

describe('KB index (Cohere embeddings)', () => {
  beforeAll(async () => {
    await loadOrBuildKBIndex();
  }, TIMEOUT);

  it('returns results for a card freeze query', async () => {
    const results = await searchKB('how do I freeze my card', 3);
    expect(results).toHaveLength(3);
    expect(results[0].title).toBeTruthy();
    expect(results[0].similarity).toBeGreaterThan(0);
    expect(results[0].html_url).toMatch(/^https?:\/\//);
  }, TIMEOUT);

  it('returns results for a KYC query', async () => {
    const results = await searchKB('KYC verification status', 3);
    expect(results).toHaveLength(3);
    expect(results[0].similarity).toBeGreaterThan(0);
  }, TIMEOUT);

  it('returns higher similarity for more relevant queries', async () => {
    const cardResults = await searchKB('freeze my Reap card', 1);
    const unrelatedResults = await searchKB('restaurant reservation booking', 1);
    expect(cardResults[0].similarity).toBeGreaterThan(unrelatedResults[0].similarity);
  }, TIMEOUT);
});

// ---------------------------------------------------------------------------
// Classifier (OpenRouter → google/gemma-3-27b-it:free)
// ---------------------------------------------------------------------------

describe('classify (OpenRouter)', () => {
  it('classifies a card freeze ticket', async () => {
    const result = await classify({
      ticketId: 'test-001',
      subject: 'Freeze my card immediately',
      body: 'I lost my card and need to freeze it right now.',
    });

    expect(result.classification.category).toBeTruthy();
    expect(result.classification.urgency).toMatch(/^P[1-4]$/);
    expect(result.classification.confidence).toBeGreaterThan(0);
    expect(result.classification.confidence).toBeLessThanOrEqual(1);
    expect(Array.isArray(result.classification.compliance_flags)).toBe(true);
  }, TIMEOUT);

  it('classifies a legal threat as high urgency with compliance flags', async () => {
    const result = await classify({
      ticketId: 'test-002',
      subject: 'Threatening legal action',
      body: 'I am contacting my solicitor and filing a regulatory complaint if this is not resolved.',
    });

    expect(['P1', 'P2']).toContain(result.classification.urgency);
    expect(result.classification.compliance_flags.length).toBeGreaterThan(0);
  }, TIMEOUT);

  it('classifies a routine FX question as lower urgency', async () => {
    const result = await classify({
      ticketId: 'test-003',
      subject: 'FX rate question',
      body: 'What is your current USD to SGD exchange rate?',
    });

    expect(['P3', 'P4']).toContain(result.classification.urgency);
  }, TIMEOUT);
});

// ---------------------------------------------------------------------------
// Full pipeline (classify → KB search → generate)
// ---------------------------------------------------------------------------

describe('analyze pipeline (end-to-end)', () => {
  it('returns a complete SidebarPayload for a card freeze ticket', async () => {
    const { ticketId, payload } = await analyze({
      subject: 'Urgent: freeze my Reap card',
      body: 'I just lost my card and need to freeze it immediately. Card ends in 4821.',
    });

    expect(ticketId).toBeTruthy();
    expect(payload.status).toBe('ready');
    expect(payload.classification).toBeTruthy();
    expect(payload.classification!.urgency).toMatch(/^P[1-4]$/);
    expect(payload.responseDraft).toBeTruthy();
    expect(payload.responseDraft!.draft.length).toBeGreaterThan(50);
    expect(Array.isArray(payload.kbArticles)).toBe(true);
    expect(payload.kbArticles!.length).toBeGreaterThan(0);
    expect(payload.similarTickets).toEqual([]);
    expect(payload.processedAt).toBeTruthy();
  }, TIMEOUT);

  it('generates a response draft that does not contain prohibited terms', async () => {
    const { payload } = await analyze({
      subject: 'Digital asset transfer',
      body: 'I want to transfer my cryptocurrency to another wallet.',
    });

    const draft = payload.responseDraft!.draft.toLowerCase();
    // generate.ts applies applyTermSubstitution — these should be replaced
    expect(draft).not.toMatch(/\bcryptocurrency\b/);
    expect(draft).not.toMatch(/\bcrypto\b/);
  }, TIMEOUT);
});

// ---------------------------------------------------------------------------
// HTTP server endpoints
// ---------------------------------------------------------------------------

describe('server endpoints', () => {
  const BASE = 'http://localhost:3001';

  it('GET /health returns ok', async () => {
    const res = await fetch(`${BASE}/health`);
    expect(res.ok).toBe(true);
    const body = await res.json() as { status: string };
    expect(body.status).toBe('ok');
  });

  it('GET /mode returns agent_assisted', async () => {
    const res = await fetch(`${BASE}/mode`);
    expect(res.ok).toBe(true);
    const body = await res.json() as { mode: string };
    expect(body.mode).toBe('agent_assisted');
  });

  it('POST /analyze returns a ticketId', async () => {
    const res = await fetch(`${BASE}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject: 'Test', body: 'Simple test ticket for integration check.' }),
    });
    expect(res.ok).toBe(true);
    const body = await res.json() as { ticketId: string };
    expect(body.ticketId).toBeTruthy();

    // Poll until ready
    let payload: { status: string } | null = null;
    for (let i = 0; i < 12; i++) {
      await new Promise(r => setTimeout(r, 5000));
      const poll = await fetch(`${BASE}/context/${body.ticketId}`);
      payload = await poll.json() as { status: string };
      if (payload.status === 'ready') break;
    }
    expect(payload?.status).toBe('ready');
  }, TIMEOUT);

  it('POST /analyze returns 400 for empty body', async () => {
    const res = await fetch(`${BASE}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject: '', body: '' }),
    });
    expect(res.status).toBe(400);
  });

  it('GET /context/:id returns pending for unknown ticketId', async () => {
    const res = await fetch(`${BASE}/context/unknown-ticket-xyz`);
    expect(res.ok).toBe(true);
    const body = await res.json() as { status: string };
    expect(body.status).toBe('pending');
  });
});
