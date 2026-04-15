# Impact Dashboard, QA Scores & KB Gap Detection — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a live impact dashboard at `/dashboard`, a deterministic QA score badge on every draft, and automatic KB gap detection that feeds both the dashboard and the existing weekly report.

**Architecture:** A new `SessionStore` singleton in `demo-server` accumulates per-request metrics in memory. A pure `computeQAScore()` function scores each draft from existing classification + KB data. `pipeline.ts` calls both after generation and writes results to the store. The dashboard (`DashboardPage.tsx`) polls `GET /api/metrics` every 5s. Hash-based routing in `main.tsx` shows the dashboard at `#/dashboard`. The Zendesk sidebar's `IntelligencePanel` gets a non-interactive QA badge in the classification row.

**Tech Stack:** TypeScript, Zod, React (no new deps), Hono, Vitest, Vectra (already in use)

**Spec:** `docs/superpowers/specs/2026-03-24-impact-dashboard-qa-kb-gaps-design.md`

---

## File Map

| File | Status | Responsibility |
|---|---|---|
| `packages/core/src/schemas/index.ts` | Modify | Add `QAScoreSchema` + `qaScore` to `SidebarPayloadSchema` |
| `packages/core/src/types/index.ts` | Modify | Add `qaScore?: unknown` to `SidebarPayload` interface |
| `apps/demo-server/src/session-store.ts` | **Create** | In-memory metrics accumulator singleton |
| `apps/demo-server/src/qa-score.ts` | **Create** | Pure `computeQAScore()` function |
| `apps/demo-server/src/__tests__/session-store.test.ts` | **Create** | Unit tests for SessionStore |
| `apps/demo-server/src/__tests__/qa-score.test.ts` | **Create** | Unit tests for computeQAScore |
| `apps/demo-server/src/index.ts` | Modify | Add `GET /metrics`; wire sessionStore into `/analyze` + `/feedback` |
| `apps/demo-server/src/pipeline.ts` | Modify | Compute QA score; detect KB gaps; record to sessionStore |
| `apps/demo/src/DashboardPage.tsx` | **Create** | Full dashboard UI component |
| `apps/demo/src/main.tsx` | Modify | Hash-based routing: `DemoApp` vs `DashboardPage` |
| `apps/demo/src/DemoApp.tsx` | Modify | Add "Dashboard →" header link; write theme to localStorage |
| `apps/demo/src/AnalysisView.tsx` | Modify | QA score badge + expandable signal breakdown |
| `apps/sidebar/src/panels/IntelligencePanel.tsx` | Modify | QA badge in classification card row |

---

## Task 1: Add QAScoreSchema to core

**Files:**
- Modify: `packages/core/src/schemas/index.ts`
- Modify: `packages/core/src/types/index.ts`

- [ ] **Step 1: Add `QAScoreSchema` to `packages/core/src/schemas/index.ts`**

Insert after the `ResponseDraftSchema` block (after line 77):

```typescript
/**
 * Deterministic quality score for a generated draft response.
 * Computed from KB coverage, classification confidence, compliance flags, and draft length.
 * No LLM call — pure post-processing.
 */
export const QAScoreSchema = z.object({
  score: z.number().min(0).max(100),
  grade: z.enum(['high', 'medium', 'low']),
  signals: z.object({
    kbCoverage: z.number(),     // 0–40 pts: KB articles with similarity >= 0.70
    confidence: z.number(),     // 0–30 pts: classification.confidence * 30
    complianceClean: z.number(), // 0 or 20 pts: no compliance flags
    draftLength: z.number(),    // 0 or 10 pts: 50–400 words
  }),
});
export type QAScore = z.infer<typeof QAScoreSchema>;
```

- [ ] **Step 2: Add `qaScore` to `SidebarPayloadSchema`**

In `packages/core/src/schemas/index.ts`, update `SidebarPayloadSchema` (around line 95) to add one optional field:

```typescript
export const SidebarPayloadSchema = z.object({
  ticketId: z.string(),
  status: z.enum(['pending', 'processing', 'ready', 'error']),
  classification: ClassificationSchema.optional(),
  responseDraft: ResponseDraftSchema.optional(),
  kbArticles: z.array(KBResultSchema).optional(),
  similarTickets: z.array(SimilarTicketSchema).optional(),
  qaScore: QAScoreSchema.optional(),   // ← add this line
  processedAt: z.string().optional(),
});
```

- [ ] **Step 3: Add `qaScore` to `SidebarPayload` interface in `packages/core/src/types/index.ts`**

In the `SidebarPayload` interface (around line 90), add after `similarTickets`:

```typescript
  /** QA score for the generated response draft */
  qaScore?: unknown;
```

- [ ] **Step 4: Verify typecheck passes**

Run from repo root:
```bash
pnpm typecheck
```
Expected: no new errors. The `unknown` type is intentional — consistent with `classification`, `responseDraft`, etc.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/schemas/index.ts packages/core/src/types/index.ts
git commit -m "feat(core): add QAScoreSchema and qaScore field to SidebarPayload"
```

---

## Task 2: Create `session-store.ts` with unit tests (TDD)

**Files:**
- Create: `apps/demo-server/src/session-store.ts`
- Create: `apps/demo-server/src/__tests__/session-store.test.ts`

The SessionStore is a pure in-memory accumulator — no I/O, easy to test.

- [ ] **Step 1: Write failing tests**

Create `apps/demo-server/src/__tests__/session-store.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { SessionStore } from '../session-store';

describe('SessionStore', () => {
  let store: SessionStore;

  beforeEach(() => {
    store = new SessionStore();
  });

  it('starts with zeroed counters', () => {
    const m = store.getMetrics();
    expect(m.ticketsProcessed).toBe(0);
    expect(m.routingCounts.auto_send).toBe(0);
    expect(m.routingCounts.agent_assisted).toBe(0);
    expect(m.routingCounts.escalate).toBe(0);
    expect(m.feedbackTotal).toBe(0);
    expect(m.acceptedDrafts).toBe(0);
    expect(m.kbGaps).toEqual([]);
  });

  it('recordAnalysis increments ticketsProcessed and correct routing bucket', () => {
    store.recordAnalysis('auto_send');
    store.recordAnalysis('escalate');
    store.recordAnalysis('auto_send');
    const m = store.getMetrics();
    expect(m.ticketsProcessed).toBe(3);
    expect(m.routingCounts.auto_send).toBe(2);
    expect(m.routingCounts.escalate).toBe(1);
    expect(m.routingCounts.agent_assisted).toBe(0);
  });

  it('deflectionRate is auto_send / total', () => {
    store.recordAnalysis('auto_send');
    store.recordAnalysis('agent_assisted');
    store.recordAnalysis('auto_send');
    const m = store.getMetrics();
    expect(m.deflectionRate).toBeCloseTo(2 / 3);
  });

  it('deflectionRate is 0 when no tickets processed', () => {
    expect(store.getMetrics().deflectionRate).toBe(0);
  });

  it('recordFeedback with low editRatio counts as accepted', () => {
    store.recordFeedback(0.10);
    store.recordFeedback(0.05);
    store.recordFeedback(0.50); // above threshold
    const m = store.getMetrics();
    expect(m.feedbackTotal).toBe(3);
    expect(m.acceptedDrafts).toBe(2);
    expect(m.draftAcceptanceRate).toBeCloseTo(2 / 3);
  });

  it('draftAcceptanceRate is 0 when no feedback', () => {
    expect(store.getMetrics().draftAcceptanceRate).toBe(0);
  });

  it('recordKbGap creates a new entry', () => {
    store.recordKbGap('fx_inquiry', 0.45);
    const m = store.getMetrics();
    expect(m.kbGaps).toHaveLength(1);
    expect(m.kbGaps[0].category).toBe('fx_inquiry');
    expect(m.kbGaps[0].maxSimilarity).toBe(0.45);
    expect(m.kbGaps[0].ticketCount).toBe(1);
    expect(m.kbGaps[0].detectedAt).toBeTruthy();
  });

  it('recordKbGap increments ticketCount and updates maxSimilarity on repeat', () => {
    store.recordKbGap('fx_inquiry', 0.45);
    store.recordKbGap('fx_inquiry', 0.38);
    const m = store.getMetrics();
    expect(m.kbGaps).toHaveLength(1);
    expect(m.kbGaps[0].ticketCount).toBe(2);
    expect(m.kbGaps[0].maxSimilarity).toBe(0.38); // latest value
  });

  it('recordKbGap handles maxSimilarity of 0 (no articles returned)', () => {
    store.recordKbGap('stablecoin', 0);
    const m = store.getMetrics();
    expect(m.kbGaps[0].maxSimilarity).toBe(0);
  });

  it('getMetrics kbGaps are sorted by ticketCount descending', () => {
    store.recordKbGap('kyc', 0.55);
    store.recordKbGap('fx_inquiry', 0.40);
    store.recordKbGap('fx_inquiry', 0.38);
    store.recordKbGap('fx_inquiry', 0.41);
    const m = store.getMetrics();
    expect(m.kbGaps[0].category).toBe('fx_inquiry'); // ticketCount 3
    expect(m.kbGaps[1].category).toBe('kyc');          // ticketCount 1
  });

  it('sessionStartedAt is a valid ISO string', () => {
    const m = store.getMetrics();
    expect(() => new Date(m.sessionStartedAt)).not.toThrow();
    expect(new Date(m.sessionStartedAt).getTime()).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run tests — expect failures**

```bash
cd /path/to/beacon && pnpm --filter demo-server test 2>&1 | head -30
```
Expected: errors about `../session-store` not found.

- [ ] **Step 3: Implement `session-store.ts`**

Create `apps/demo-server/src/session-store.ts`:

```typescript
export interface KbGapEntry {
  category: string;
  maxSimilarity: number;
  ticketCount: number;
  detectedAt: string;
}

interface MetricsSnapshot {
  ticketsProcessed: number;
  deflectionRate: number;
  draftAcceptanceRate: number;
  routingCounts: { auto_send: number; agent_assisted: number; escalate: number };
  feedbackTotal: number;
  acceptedDrafts: number;
  kbGaps: KbGapEntry[];
  vocThemes: Array<{ theme: string; severity: 'high' | 'medium' }>;
  sessionStartedAt: string;
}

// Static VoC seed — mirrors the shape produced by voc-processor monthly correlation
const VOC_THEMES_SEED: MetricsSnapshot['vocThemes'] = [
  { theme: 'FX fee confusion after cross-border payment', severity: 'high' },
  { theme: 'Card spending limit queries', severity: 'high' },
  { theme: 'KYC re-verification delays', severity: 'medium' },
];

export class SessionStore {
  private ticketsProcessed = 0;
  private routingCounts = { auto_send: 0, agent_assisted: 0, escalate: 0 };
  private feedbackTotal = 0;
  private acceptedDrafts = 0;
  private kbGapMap = new Map<string, KbGapEntry>();
  private readonly sessionStartedAt = new Date().toISOString();

  recordAnalysis(routing: 'auto_send' | 'agent_assisted' | 'escalate'): void {
    this.ticketsProcessed += 1;
    this.routingCounts[routing] += 1;
  }

  recordFeedback(editRatio: number): void {
    this.feedbackTotal += 1;
    if (editRatio < 0.20) {
      this.acceptedDrafts += 1;
    }
  }

  recordKbGap(category: string, maxSimilarity: number): void {
    const existing = this.kbGapMap.get(category);
    if (existing) {
      existing.ticketCount += 1;
      existing.maxSimilarity = maxSimilarity; // latest value
    } else {
      this.kbGapMap.set(category, {
        category,
        maxSimilarity,
        ticketCount: 1,
        detectedAt: new Date().toISOString(),
      });
    }
  }

  getMetrics(): MetricsSnapshot {
    const kbGaps = [...this.kbGapMap.values()]
      .sort((a, b) => b.ticketCount - a.ticketCount);

    return {
      ticketsProcessed: this.ticketsProcessed,
      deflectionRate: this.ticketsProcessed > 0
        ? this.routingCounts.auto_send / this.ticketsProcessed
        : 0,
      draftAcceptanceRate: this.feedbackTotal > 0
        ? this.acceptedDrafts / this.feedbackTotal
        : 0,
      routingCounts: { ...this.routingCounts },
      feedbackTotal: this.feedbackTotal,
      acceptedDrafts: this.acceptedDrafts,
      kbGaps,
      vocThemes: VOC_THEMES_SEED,
      sessionStartedAt: this.sessionStartedAt,
    };
  }
}

// Singleton — one store per server process lifetime
export const sessionStore = new SessionStore();
```

- [ ] **Step 4: Run tests — expect all pass**

```bash
pnpm --filter demo-server test
```
Expected: all `SessionStore` tests pass. Ignore integration tests (they need API keys and a built KB index).

- [ ] **Step 5: Commit**

```bash
git add apps/demo-server/src/session-store.ts apps/demo-server/src/__tests__/session-store.test.ts
git commit -m "feat(demo-server): add SessionStore with unit tests"
```

---

## Task 3: Create `qa-score.ts` with unit tests (TDD)

**Files:**
- Create: `apps/demo-server/src/qa-score.ts`
- Create: `apps/demo-server/src/__tests__/qa-score.test.ts`

Extracting QA scoring into its own file makes it unit-testable without touching the pipeline.

- [ ] **Step 1: Write failing tests**

Create `apps/demo-server/src/__tests__/qa-score.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { computeQAScore } from '../qa-score';
import type { Classification, KBResult } from '@beacon/core';

// Minimal Classification factory
function makeClassification(overrides: Partial<Classification> = {}): Classification {
  return {
    category: 'card_freeze',
    sub_category: 'freeze_request',
    urgency: 'P3',
    sentiment: -0.2,
    language: 'en',
    confidence: 0.9,
    compliance_flags: [],
    crypto_specific_tags: [],
    ...overrides,
  };
}

// KB article factory
function makeArticle(similarity: number): KBResult {
  return {
    article_id: 1,
    title: 'Test article',
    html_url: 'https://help.reap.global/test',
    updated_at: '2024-01-01',
    text: 'Article text',
    similarity,
  };
}

describe('computeQAScore', () => {
  it('returns high grade for ideal inputs', () => {
    const result = computeQAScore(
      makeClassification({ confidence: 1.0, compliance_flags: [] }),
      [makeArticle(0.95), makeArticle(0.85), makeArticle(0.80)],
      'This is a good draft response with enough words to pass the length check okay.',
    );
    expect(result.grade).toBe('high');
    expect(result.score).toBeGreaterThanOrEqual(75);
  });

  it('kbCoverage: articles >= 0.70 similarity contribute full points', () => {
    const result = computeQAScore(
      makeClassification(),
      [makeArticle(0.80), makeArticle(0.80), makeArticle(0.80)],
      'Draft text with sufficient words for length check.',
    );
    expect(result.signals.kbCoverage).toBe(40); // 3/3 * 40
  });

  it('kbCoverage: no high-similarity articles gives 0 pts', () => {
    const result = computeQAScore(
      makeClassification(),
      [makeArticle(0.50), makeArticle(0.55)],
      'Draft text',
    );
    expect(result.signals.kbCoverage).toBe(0);
  });

  it('kbCoverage: empty articles array gives 0 pts', () => {
    const result = computeQAScore(makeClassification(), [], 'Draft text');
    expect(result.signals.kbCoverage).toBe(0);
  });

  it('confidence: 0.9 confidence yields 27 pts', () => {
    const result = computeQAScore(
      makeClassification({ confidence: 0.9 }),
      [],
      'Draft',
    );
    expect(result.signals.confidence).toBeCloseTo(27);
  });

  it('complianceClean: no flags gives 20 pts', () => {
    const result = computeQAScore(
      makeClassification({ compliance_flags: [] }),
      [],
      'Draft',
    );
    expect(result.signals.complianceClean).toBe(20);
  });

  it('complianceClean: any flags gives 0 pts', () => {
    const result = computeQAScore(
      makeClassification({ compliance_flags: ['pep_screening'] }),
      [],
      'Draft',
    );
    expect(result.signals.complianceClean).toBe(0);
  });

  it('draftLength: 50–400 words gives 10 pts', () => {
    const draft = 'word '.repeat(75); // 75 words
    const result = computeQAScore(makeClassification(), [], draft);
    expect(result.signals.draftLength).toBe(10);
  });

  it('draftLength: fewer than 50 words gives 0 pts', () => {
    const draft = 'short draft'; // 2 words
    const result = computeQAScore(makeClassification(), [], draft);
    expect(result.signals.draftLength).toBe(0);
  });

  it('draftLength: more than 400 words gives 0 pts', () => {
    const draft = 'word '.repeat(401);
    const result = computeQAScore(makeClassification(), [], draft);
    expect(result.signals.draftLength).toBe(0);
  });

  it('grade is medium for scores 50–74', () => {
    // confidence 0.5 → 15pts, no compliance (20pts), no KB (0), short draft (0) = 35 → low
    // Use: good confidence + clean + short
    const result = computeQAScore(
      makeClassification({ confidence: 0.65, compliance_flags: [] }),
      [makeArticle(0.6)], // below 0.70, no KB pts
      'Draft',            // too short
    );
    // 0 (kb) + 19.5 (conf) + 20 (clean) + 0 (length) = ~39.5 → low
    // Let's make a proper medium: conf 0.8 + clean + good length = 24 + 20 + 10 = 54
    const result2 = computeQAScore(
      makeClassification({ confidence: 0.8, compliance_flags: [] }),
      [],
      'word '.repeat(60),
    );
    expect(result2.grade).toBe('medium');
    expect(result2.score).toBeGreaterThanOrEqual(50);
    expect(result2.score).toBeLessThan(75);
  });

  it('grade is low for scores below 50', () => {
    const result = computeQAScore(
      makeClassification({ confidence: 0.3, compliance_flags: ['pep'] }),
      [],
      'short',
    );
    expect(result.grade).toBe('low');
    expect(result.score).toBeLessThan(50);
  });

  it('score is the sum of all signals rounded to integer', () => {
    const result = computeQAScore(
      makeClassification({ confidence: 1.0, compliance_flags: [] }),
      [makeArticle(0.9), makeArticle(0.9)],
      'word '.repeat(100),
    );
    const expectedSum = result.signals.kbCoverage + result.signals.confidence +
                        result.signals.complianceClean + result.signals.draftLength;
    expect(result.score).toBe(Math.round(expectedSum));
  });
});
```

- [ ] **Step 2: Run tests — expect failures**

```bash
pnpm --filter demo-server test 2>&1 | grep "qa-score"
```
Expected: error — `../qa-score` not found.

- [ ] **Step 3: Implement `qa-score.ts`**

Create `apps/demo-server/src/qa-score.ts`:

```typescript
import type { Classification, KBResult } from '@beacon/core';
import type { QAScore } from '@beacon/core';

/**
 * Compute a deterministic QA score for a generated draft response.
 * No LLM call — derived entirely from existing pipeline outputs.
 *
 * Scoring breakdown (max 100 pts):
 *   kbCoverage    0–40  fraction of KB articles with similarity >= 0.70
 *   confidence    0–30  classification.confidence * 30
 *   complianceClean 0|20  no compliance flags = 20, any flag = 0
 *   draftLength   0|10  50–400 words = 10, otherwise 0
 */
export function computeQAScore(
  classification: Classification,
  kbArticles: KBResult[],
  draft: string,
): QAScore {
  const highSimilarityCount = kbArticles.filter(a => a.similarity >= 0.70).length;
  const kbCoverage = kbArticles.length > 0
    ? (highSimilarityCount / kbArticles.length) * 40
    : 0;

  const confidence = classification.confidence * 30;

  const complianceClean = classification.compliance_flags.length === 0 ? 20 : 0;

  const wordCount = draft.trim().split(/\s+/).filter(Boolean).length;
  const draftLength = wordCount >= 50 && wordCount <= 400 ? 10 : 0;

  const score = Math.round(kbCoverage + confidence + complianceClean + draftLength);

  const grade: QAScore['grade'] = score >= 75 ? 'high' : score >= 50 ? 'medium' : 'low';

  return {
    score,
    grade,
    signals: { kbCoverage, confidence, complianceClean, draftLength },
  };
}
```

- [ ] **Step 4: Run tests — expect all pass**

```bash
pnpm --filter demo-server test
```
Expected: all `qa-score` tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/demo-server/src/qa-score.ts apps/demo-server/src/__tests__/qa-score.test.ts
git commit -m "feat(demo-server): add computeQAScore with unit tests"
```

---

## Task 4: Wire SessionStore into `demo-server/index.ts`

**Files:**
- Modify: `apps/demo-server/src/index.ts`

Two changes: (1) add `GET /metrics` route, (2) wire `sessionStore` into the existing `/analyze` and `/feedback` no-ops.

- [ ] **Step 1: Add import at top of `index.ts`**

Add after the existing imports:
```typescript
import { sessionStore } from './session-store.js';
```

- [ ] **Step 2: Wire `POST /analyze` to record routing**

`payload.responseDraft` is typed as `unknown` on `SidebarPayload` but is actually a `ResponseDraft` object with a `routing` field at the top level (shape: `{ draft, citations, routing, ... }`). After `results.set(ticketId, payload)`, add:

```typescript
const routing = (payload.responseDraft as { routing?: string } | undefined)?.routing;
if (routing === 'auto_send' || routing === 'agent_assisted' || routing === 'escalate') {
  sessionStore.recordAnalysis(routing);
}
```

- [ ] **Step 3: Replace the `/feedback` no-op with a real handler**

Replace:
```typescript
app.post('/feedback', (c) => { console.log('[demo] feedback received'); return c.json({ ok: true }); });
```
With:
```typescript
app.post('/feedback', async (c) => {
  try {
    const body = await c.req.json<{ ticketId?: string; rating?: string; editRatio?: number }>();
    if (typeof body.editRatio === 'number') {
      sessionStore.recordFeedback(body.editRatio);
    }
  } catch { /* malformed body — ignore */ }
  return c.json({ ok: true });
});
```

- [ ] **Step 4: Add `GET /metrics` route**

Add before the `/health` route:
```typescript
app.get('/metrics', (c) => c.json(sessionStore.getMetrics()));
```

- [ ] **Step 5: Smoke-test manually**

Start the demo server:
```bash
cd apps/demo-server && pnpm dev
```
In a second terminal:
```bash
curl -s http://localhost:3001/metrics | jq .
```
Expected output:
```json
{
  "ticketsProcessed": 0,
  "deflectionRate": 0,
  "draftAcceptanceRate": 0,
  "routingCounts": { "auto_send": 0, "agent_assisted": 0, "escalate": 0 },
  "feedbackTotal": 0,
  "acceptedDrafts": 0,
  "kbGaps": [],
  "vocThemes": [ ... 3 items ... ],
  "sessionStartedAt": "..."
}
```

- [ ] **Step 6: Commit**

```bash
git add apps/demo-server/src/index.ts
git commit -m "feat(demo-server): add GET /metrics and wire sessionStore into /analyze and /feedback"
```

---

## Task 5: Update `pipeline.ts` — QA scoring + KB gap detection

**Files:**
- Modify: `apps/demo-server/src/pipeline.ts`

- [ ] **Step 1: Add imports**

Add at the top of `apps/demo-server/src/pipeline.ts`:
```typescript
import { computeQAScore } from './qa-score.js';
import { sessionStore } from './session-store.js';
```

- [ ] **Step 2: Detect KB gaps after `searchKB()` call**

After the `const kbArticles = await searchKB(query, 5);` line, add:
```typescript
// KB gap detection — log categories where no article has strong coverage
const maxSimilarity = kbArticles.length > 0
  ? Math.max(...kbArticles.map(a => a.similarity))
  : 0;
if (maxSimilarity < 0.60) {
  sessionStore.recordKbGap(classification.category, maxSimilarity);
}
```

- [ ] **Step 3: Compute QA score and attach to payload**

After `const { responseDraft } = await generateResponse(...)`, add:
```typescript
const qaScore = computeQAScore(classification, kbArticles, responseDraft.draft);
```

Then update the `payload` object to include `qaScore`:
```typescript
const payload: SidebarPayload = {
  ticketId,
  status: 'ready',
  classification,
  responseDraft,
  kbArticles,
  similarTickets: [],
  qaScore,                        // ← add this
  processedAt: new Date().toISOString(),
};
```

- [ ] **Step 4: Verify typecheck passes**

```bash
pnpm typecheck
```
Expected: no errors. (`qaScore` is typed `unknown` on `SidebarPayload` interface, so assignment is valid.)

- [ ] **Step 5: Commit**

```bash
git add apps/demo-server/src/pipeline.ts
git commit -m "feat(demo-server): compute QA score and detect KB gaps in pipeline"
```

---

## Task 6: Build `DashboardPage.tsx`

**Files:**
- Create: `apps/demo/src/DashboardPage.tsx`

This component polls `/api/metrics` every 5s and renders the Layout B design.

- [ ] **Step 1: Create `DashboardPage.tsx`**

Create `apps/demo/src/DashboardPage.tsx`:

```tsx
import React, { useState, useEffect } from 'react';
import { type Tokens, DARK, LIGHT } from './DemoApp';

const API = import.meta.env.VITE_API_URL ? '' : ''; // polls /api/metrics via Vite proxy

interface KbGapEntry {
  category: string;
  maxSimilarity: number;
  ticketCount: number;
  detectedAt: string;
}

interface MetricsSnapshot {
  ticketsProcessed: number;
  deflectionRate: number;
  draftAcceptanceRate: number;
  routingCounts: { auto_send: number; agent_assisted: number; escalate: number };
  kbGaps: KbGapEntry[];
  vocThemes: Array<{ theme: string; severity: 'high' | 'medium' }>;
  sessionStartedAt: string;
}

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

function HeroCard({ label, value, sub, color, T }: {
  label: string; value: string; sub: string; color: string; T: Tokens;
}) {
  return (
    <div style={{
      background: T.surface, borderRadius: 8, padding: '20px 24px',
      borderLeft: `3px solid ${color}`, flex: 1,
    }}>
      <div style={{ fontSize: 13, color: T.muted, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
      <div style={{ fontSize: 36, fontWeight: 700, color, marginBottom: 4, fontFamily: "'Fira Code', monospace" }}>{value}</div>
      <div style={{ fontSize: 12, color: T.muted }}>{sub}</div>
    </div>
  );
}

export function DashboardPage() {
  const storedTheme = localStorage.getItem('beaconTheme');
  const T: Tokens = storedTheme === 'light' ? LIGHT : DARK;

  const [metrics, setMetrics] = useState<MetricsSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function poll() {
      try {
        const res = await fetch('/api/metrics');
        if (!res.ok) throw new Error(`${res.status}`);
        const data = await res.json() as MetricsSnapshot;
        if (active) { setMetrics(data); setError(null); }
      } catch (e) {
        if (active) setError('Could not reach demo server — is it running?');
      }
    }
    poll();
    const id = setInterval(poll, 5000);
    return () => { active = false; clearInterval(id); };
  }, []);

  const total = metrics?.routingCounts
    ? metrics.routingCounts.auto_send + metrics.routingCounts.agent_assisted + metrics.routingCounts.escalate
    : 0;

  const autoW = total > 0 ? (metrics!.routingCounts.auto_send / total) * 100 : 0;
  const assistW = total > 0 ? (metrics!.routingCounts.agent_assisted / total) * 100 : 0;
  const escW = total > 0 ? (metrics!.routingCounts.escalate / total) * 100 : 0;

  return (
    <div style={{ minHeight: '100dvh', background: T.bg, color: T.text, fontFamily: "'Fira Sans', system-ui, sans-serif" }}>
      {/* Header */}
      <header style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '0 24px',
        height: 48, borderBottom: `1px solid ${T.border}`, background: T.surface,
      }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="3" fill={T.accent} />
          <path d="M12 2v4M12 18v4M2 12h4M18 12h4" stroke={T.accent} strokeWidth="2" strokeLinecap="round" opacity="0.6" />
        </svg>
        <span style={{ fontFamily: "'Fira Code', monospace", fontWeight: 600, fontSize: 14 }}>Dispatch</span>
        <span style={{ color: T.muted, fontSize: 12 }}>/ dashboard</span>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginRight: 16 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: T.accent, boxShadow: `0 0 6px ${T.accent}`, display: 'inline-block' }} />
          <span style={{ fontSize: 11, color: T.muted, fontFamily: "'Fira Code', monospace" }}>live</span>
        </div>
        <button
          onClick={() => { window.location.hash = ''; }}
          style={{
            background: 'none', border: `1px solid ${T.border}`, borderRadius: 6,
            padding: '4px 12px', color: T.muted, fontSize: 12, cursor: 'pointer',
          }}
        >
          ← Back to demo
        </button>
      </header>

      {/* Content */}
      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '28px 24px' }}>
        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 6, padding: '12px 16px', marginBottom: 20, color: '#991b1b', fontSize: 13 }}>
            {error}
          </div>
        )}

        {/* Hero KPIs */}
        <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
          <HeroCard
            label="Deflection Rate"
            value={metrics ? pct(metrics.deflectionRate) : '—'}
            sub={`${metrics?.routingCounts.auto_send ?? 0} of ${metrics?.ticketsProcessed ?? 0} tickets auto-handled`}
            color={T.accent}
            T={T}
          />
          <HeroCard
            label="Draft Acceptance"
            value={metrics ? pct(metrics.draftAcceptanceRate) : '—'}
            sub={`${metrics?.acceptedDrafts ?? 0} of ${metrics?.feedbackTotal ?? 0} drafts used near-verbatim`}
            color="#4ade80"
            T={T}
          />
          <HeroCard
            label="KB Gaps Detected"
            value={metrics ? String(metrics.kbGaps.length) : '—'}
            sub={metrics && metrics.kbGaps.length > 0 ? `Top: ${metrics.kbGaps[0].category}` : 'No gaps this session'}
            color={metrics && metrics.kbGaps.length > 0 ? '#f59e0b' : '#4ade80'}
            T={T}
          />
        </div>

        {/* Routing bar */}
        <div style={{ background: T.surface, borderRadius: 8, padding: '20px 24px', marginBottom: 20 }}>
          <div style={{ fontSize: 11, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
            Routing — {metrics?.ticketsProcessed ?? 0} tickets this session
          </div>
          {total > 0 ? (
            <>
              <div style={{ display: 'flex', height: 24, borderRadius: 4, overflow: 'hidden', marginBottom: 10 }}>
                {autoW > 0 && <div style={{ width: `${autoW}%`, background: '#22c55e', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#052e16' }}>{Math.round(autoW)}%</div>}
                {assistW > 0 && <div style={{ width: `${assistW}%`, background: '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#fff' }}>{Math.round(assistW)}%</div>}
                {escW > 0 && <div style={{ width: `${escW}%`, background: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#fff' }}>{Math.round(escW)}%</div>}
              </div>
              <div style={{ display: 'flex', gap: 20, fontSize: 12 }}>
                <span style={{ color: '#4ade80' }}>■ Auto-send ({metrics?.routingCounts.auto_send})</span>
                <span style={{ color: '#60a5fa' }}>■ Agent-assisted ({metrics?.routingCounts.agent_assisted})</span>
                <span style={{ color: '#f87171' }}>■ Escalated ({metrics?.routingCounts.escalate})</span>
              </div>
            </>
          ) : (
            <div style={{ color: T.muted, fontSize: 13 }}>No tickets analyzed yet — submit a ticket in the demo to see routing data.</div>
          )}
        </div>

        {/* KB Gaps */}
        <div style={{ background: T.surface, borderRadius: 8, padding: '20px 24px', marginBottom: 20 }}>
          <div style={{ fontSize: 11, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
            KB Gaps Detected This Session
          </div>
          {metrics && metrics.kbGaps.length > 0 ? (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                  {['Category', 'Tickets', 'Max Similarity', 'Suggested Action'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '6px 12px 6px 0', color: T.muted, fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {metrics.kbGaps.map(gap => (
                  <tr key={gap.category} style={{ borderBottom: `1px solid ${T.border}` }}>
                    <td style={{ padding: '10px 12px 10px 0', color: '#f59e0b', fontWeight: 600 }}>{gap.category}</td>
                    <td style={{ padding: '10px 12px 10px 0', color: T.text }}>{gap.ticketCount}</td>
                    <td style={{ padding: '10px 12px 10px 0', color: gap.maxSimilarity < 0.4 ? '#ef4444' : '#f59e0b' }}>
                      {gap.maxSimilarity === 0 ? 'No match' : `${Math.round(gap.maxSimilarity * 100)}%`}
                    </td>
                    <td style={{ padding: '10px 0', color: T.muted, fontSize: 12 }}>Add KB article for this topic</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div style={{ color: T.muted, fontSize: 13 }}>
              {metrics ? 'No KB gaps detected — all categories have strong article coverage.' : 'Loading...'}
            </div>
          )}
        </div>

        {/* VoC Themes */}
        <div style={{ background: T.surface, borderRadius: 8, padding: '20px 24px' }}>
          <div style={{ fontSize: 11, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
            VoC Themes — Monthly Correlation Analysis
          </div>
          {metrics?.vocThemes.map((t, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: i < (metrics.vocThemes.length - 1) ? `1px solid ${T.border}` : 'none' }}>
              <span style={{
                width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                background: t.severity === 'high' ? '#ef4444' : '#f59e0b',
                boxShadow: `0 0 4px ${t.severity === 'high' ? '#ef4444' : '#f59e0b'}`,
              }} />
              <span style={{ fontSize: 13, color: T.text }}>{t.theme}</span>
              <span style={{ marginLeft: 'auto', fontSize: 11, color: T.muted, textTransform: 'uppercase' }}>{t.severity}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/demo/src/DashboardPage.tsx
git commit -m "feat(demo): add DashboardPage with hero KPIs, routing bar, KB gaps, VoC themes"
```

---

## Task 7: Update `main.tsx` and `DemoApp.tsx` — routing + navigation

**Files:**
- Modify: `apps/demo/src/main.tsx`
- Modify: `apps/demo/src/DemoApp.tsx`

- [ ] **Step 1: Update `main.tsx` for hash-based routing**

Replace the entire content of `apps/demo/src/main.tsx`:

```tsx
import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { mockZAFClient } from './mock-zaf-client';
import { DemoApp } from './DemoApp';
import { DashboardPage } from './DashboardPage';

// Must be set before DemoApp renders — ClientProvider reads ZAFClient.init() in useState()
(window as unknown as Record<string, unknown>).ZAFClient = mockZAFClient;

function Root() {
  const [hash, setHash] = useState(window.location.hash);

  useEffect(() => {
    const handler = () => setHash(window.location.hash);
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);

  if (hash === '#/dashboard') return <DashboardPage />;
  return <DemoApp />;
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
```

- [ ] **Step 2: Add "Dashboard →" link to `DemoApp.tsx` header**

In `DemoApp.tsx`, find the header's `ThemeToggle` component (the last element before `</header>`). Add a Dashboard link just before it:

```tsx
<button
  onClick={() => {
    localStorage.setItem('beaconTheme', theme);
    window.location.hash = '#/dashboard';
  }}
  style={{
    background: 'none', border: `1px solid ${T.border}`, borderRadius: 6,
    padding: '4px 10px', color: T.muted, fontSize: 12, cursor: 'pointer',
    fontFamily: T.fontBody,
  }}
>
  Dashboard →
</button>
```

- [ ] **Step 3: Verify in browser**

Start the demo app:
```bash
cd apps/demo && pnpm dev
```
- Open `http://localhost:5173`
- Click "Dashboard →" — should navigate to dashboard
- Click "← Back to demo" — should return
- Change theme in DemoApp, go to dashboard — should use the same theme

- [ ] **Step 4: Commit**

```bash
git add apps/demo/src/main.tsx apps/demo/src/DemoApp.tsx
git commit -m "feat(demo): add hash-based routing and Dashboard navigation link"
```

---

## Task 8: Add QA badge to `AnalysisView.tsx`

**Files:**
- Modify: `apps/demo/src/AnalysisView.tsx`

- [ ] **Step 1: Add `QABadge` component to `AnalysisView.tsx`**

First confirm `useState` is already imported at the top of `AnalysisView.tsx` (it is — the file uses it for the expandable KB source items). Then add the following near the top of the file (after existing imports and helpers):

```tsx
import type { QAScore } from '@beacon/core';

const QA_COLORS: Record<string, { text: string; bg: string; border: string }> = {
  high:   { text: '#166534', bg: 'rgba(34,197,94,0.12)',  border: 'rgba(34,197,94,0.3)' },
  medium: { text: '#92400e', bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.3)' },
  low:    { text: '#991b1b', bg: 'rgba(239,68,68,0.12)',  border: 'rgba(239,68,68,0.3)' },
};

// Dark-mode overrides
const QA_COLORS_DARK: Record<string, { text: string; bg: string; border: string }> = {
  high:   { text: '#4ade80', bg: 'rgba(34,197,94,0.12)',  border: 'rgba(34,197,94,0.3)' },
  medium: { text: '#fbbf24', bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.3)' },
  low:    { text: '#f87171', bg: 'rgba(239,68,68,0.12)',  border: 'rgba(239,68,68,0.3)' },
};

function QABadge({ qaScore, theme }: { qaScore: QAScore; theme: Theme }) {
  const [expanded, setExpanded] = useState(false);
  const colors = theme === 'dark' ? QA_COLORS_DARK[qaScore.grade] : QA_COLORS[qaScore.grade];

  return (
    <div style={{ display: 'inline-block' }}>
      <button
        onClick={() => setExpanded(e => !e)}
        title="Click to see QA signal breakdown"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600, cursor: 'pointer',
          background: colors.bg, color: colors.text, border: `1px solid ${colors.border}`,
        }}
      >
        QA: {qaScore.grade.charAt(0).toUpperCase() + qaScore.grade.slice(1)} ({qaScore.score}/100)
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {expanded && (
        <div style={{
          marginTop: 4, padding: '8px 12px', borderRadius: 4, fontSize: 11,
          background: colors.bg, border: `1px solid ${colors.border}`, color: colors.text,
          display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '4px 12px', alignItems: 'center',
        }}>
          <span>KB coverage (≥70% similarity)</span>
          <span>{Math.round(qaScore.signals.kbCoverage)}</span>
          <span style={{ color: colors.text, opacity: 0.6 }}>/40</span>

          <span>Classification confidence</span>
          <span>{Math.round(qaScore.signals.confidence)}</span>
          <span style={{ color: colors.text, opacity: 0.6 }}>/30</span>

          <span>No compliance flags</span>
          <span>{qaScore.signals.complianceClean}</span>
          <span style={{ color: colors.text, opacity: 0.6 }}>/20</span>

          <span>Draft length (50–400 words)</span>
          <span>{qaScore.signals.draftLength}</span>
          <span style={{ color: colors.text, opacity: 0.6 }}>/10</span>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Read the `qaScore` from payload and render the badge**

In `AnalysisView.tsx`, find where `classification` and `responseDraft` are extracted from the payload (they use `as Classification | undefined` casts). Add:

```tsx
const qaScore = payload.qaScore as QAScore | undefined;
```

In the classification section (where urgency/confidence/sentiment is displayed), add the `QABadge` after the existing badges:

```tsx
{qaScore && <QABadge qaScore={qaScore} theme={theme} />}
```

- [ ] **Step 3: Verify in browser**

- Submit a ticket in the demo
- The analysis result should show a coloured "QA: High/Medium/Low (nn/100)" badge
- Clicking it expands the 4-row signal breakdown

- [ ] **Step 4: Commit**

```bash
git add apps/demo/src/AnalysisView.tsx
git commit -m "feat(demo): add QA score badge with expandable signal breakdown to AnalysisView"
```

---

## Task 9: Add QA badge to `IntelligencePanel.tsx` (sidebar)

**Files:**
- Modify: `apps/sidebar/src/panels/IntelligencePanel.tsx`

The sidebar is space-constrained — add the badge inline with the routing badge, no expansion.

- [ ] **Step 1: Add import and helper**

At the top of `IntelligencePanel.tsx`, add:
```typescript
import type { QAScore } from '@beacon/core';
```

Add this simple inline badge component near the top of the file (it's too small to warrant its own file):

```tsx
function QAScorePill({ qaScore }: { qaScore: QAScore }) {
  const COLOR: Record<string, string> = {
    high: '#22c55e', medium: '#f59e0b', low: '#ef4444',
  };
  const color = COLOR[qaScore.grade] ?? '#94a3b8';
  return (
    <span
      title={`QA Score: ${qaScore.score}/100\nKB: ${Math.round(qaScore.signals.kbCoverage)}/40 · Conf: ${Math.round(qaScore.signals.confidence)}/30 · Flags: ${qaScore.signals.complianceClean}/20 · Length: ${qaScore.signals.draftLength}/10`}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 3,
        padding: '1px 6px', borderRadius: 3, fontSize: 10, fontWeight: 600,
        background: `${color}22`, color, border: `1px solid ${color}44`,
        cursor: 'default',
      }}
    >
      QA {qaScore.grade.charAt(0).toUpperCase() + qaScore.grade.slice(1)}
    </span>
  );
}
```

- [ ] **Step 2: Read `qaScore` from payload and render pill**

In `IntelligencePanel`, the payload is accessed via `useDispatchData()`. Find where `classification` is extracted:
```tsx
const classification = data.classification as Classification | undefined;
```

Add below it:
```tsx
const qaScore = data.qaScore as QAScore | undefined;
```

In the classification card section — find the row showing urgency tag and category. Add the `QAScorePill` to that row:

```tsx
{qaScore && <QAScorePill qaScore={qaScore} />}
```

- [ ] **Step 3: Commit**

```bash
git add apps/sidebar/src/panels/IntelligencePanel.tsx
git commit -m "feat(sidebar): add QA score pill to IntelligencePanel classification row"
```

---

## Task 10: End-to-end smoke test

- [ ] **Step 1: Start both servers**

Terminal 1:
```bash
cd apps/demo-server && pnpm dev
```
Terminal 2:
```bash
cd apps/demo && pnpm dev
```

- [ ] **Step 2: Verify all success criteria**

1. Submit 3 tickets with different subjects (e.g. "Freeze my card", "KYC delay", "FX fee question")
2. Each result shows a QA badge — click it to see signal breakdown ✓
3. Click "Dashboard →" in the header
4. Hero KPIs update: deflection rate, KB gaps counter
5. Routing bar shows segments for auto/assisted/escalate
6. If any ticket had low KB coverage, that category appears in KB Gaps table
7. VoC Themes strip shows 3 static items
8. Click "← Back to demo" — returns to DemoApp
9. Toggle theme in DemoApp, go back to dashboard — theme matches
10. Check sidebar: load a ticket in a ZAF-like context, classification row shows QA pill

- [ ] **Step 3: Run unit tests one final time**

```bash
pnpm --filter demo-server test
```
Expected: all session-store and qa-score unit tests pass.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "chore: verify end-to-end smoke test passes"
```
