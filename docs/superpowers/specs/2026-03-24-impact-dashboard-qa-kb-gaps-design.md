# Design: Impact Dashboard, QA Scores, KB Gap Detection

**Date:** 2026-03-24
**Status:** Approved
**Scope:** `apps/demo`, `apps/demo-server`, `packages/core`

---

## Problem

Beacon has strong backend instrumentation (weekly reports, audit logs, VoC correlation, KB gap records) but nothing surfaces in real-time. An interviewer cannot see impact without reading an email. This spec adds three visible, demo-able features that map directly to the target JD ("measure impact", "QA", "AI-ready foundations").

---

## Features

### 1. Impact Dashboard (`/dashboard` route)

A dedicated full-screen page in the demo app showing live session metrics.

**Location:** `apps/demo` — new route at `/dashboard`, linked from the header.

**Data source:** `apps/demo-server` gains an in-memory `SessionStore` that accumulates stats across all `POST /analyze` calls for the current process lifetime. A new `GET /api/metrics` endpoint returns the snapshot. The dashboard polls every 5 seconds.

**SessionStore tracks:**
- `ticketsProcessed` — total `POST /analyze` calls
- `routingCounts` — `{ auto_send: number, agent_assisted: number, escalate: number }`
- `feedbackCounts` — `{ up: number, down: number }` (from `POST /feedback`)
- `acceptedDrafts` — count where edit ratio < 0.20 (from neutral feedback with editRatio)
- `kbGapsDetected` — `Array<{ category, maxSimilarity, ticketCount, detectedAt }>`
- `vocThemes` — static seed of 3 themes for demo (mirrors real `voc-processor` monthly output shape)

**`GET /api/metrics` response shape:**
```ts
{
  ticketsProcessed: number;
  deflectionRate: number;          // auto_send / total (0–1)
  draftAcceptanceRate: number;     // acceptedDrafts / feedbackWithEditRatio (0–1)
  routingCounts: { auto_send, agent_assisted, escalate };
  kbGaps: Array<{ category, maxSimilarity, ticketCount, detectedAt }>;
  vocThemes: Array<{ theme, severity: 'high' | 'medium' }>;
  sessionStartedAt: string;        // ISO timestamp
}
```

**Dashboard UI layout (Layout B — approved):**
1. Header: Beacon logo + "/ dashboard" breadcrumb + "← Back to demo" link
2. Three hero KPI cards: Deflection Rate · Draft Acceptance · KB Gaps Detected
3. Routing stacked bar: auto / assisted / escalate percentages with counts
4. KB Gaps table: category · ticket count · max similarity · suggested action
5. VoC Themes strip: 3 items with severity indicator

**Polling:** `useEffect` with `setInterval(5000)`. Shows a subtle "live" indicator. Stops polling on unmount.

**Theme:** Inherits Reap dark theme tokens from `DemoApp.tsx` (`DARK`/`LIGHT`, `Tokens`). Dashboard accepts a `theme` prop passed via URL param or shared state.

---

### 2. QA Score on Drafts

A deterministic quality signal computed immediately after response generation. No LLM call.

**Schema addition** (`packages/core/src/schemas/index.ts`):
```ts
export const QAScoreSchema = z.object({
  score: z.number().min(0).max(100),
  grade: z.enum(['high', 'medium', 'low']),
  signals: z.object({
    kbCoverage: z.number(),        // 0–40 pts
    confidence: z.number(),        // 0–30 pts
    complianceClean: z.number(),   // 0 or 20 pts
    draftLength: z.number(),       // 0 or 10 pts
  }),
});
export type QAScore = z.infer<typeof QAScoreSchema>;

// SidebarPayload gains optional field:
// qaScore?: QAScore
```

**Scoring formula:**

| Signal | Max pts | Rule |
|---|---|---|
| KB coverage | 40 | `(articles with similarity ≥ 0.70 / total) × 40` |
| Classification confidence | 30 | `confidence × 30` |
| No compliance flags | 20 | `compliance_flags.length === 0 ? 20 : 0` |
| Draft length | 10 | `wordCount ∈ [50, 400] ? 10 : 0` |

Grade: ≥75 → `high` · 50–74 → `medium` · <50 → `low`

**Computed in:** `apps/demo-server/src/pipeline.ts` after `generateResponse()`.

**Displayed in:** `apps/demo/src/AnalysisView.tsx` — coloured pill badge (`QA: High ✓`) inline with the routing badge. Clicking expands a breakdown showing each signal's score.

Also displayed in `apps/sidebar/src/panels/IntelligencePanel.tsx` — same pill badge in the classification card row.

---

### 3. KB Gap Detection

**Detection logic** (in `apps/demo-server/src/pipeline.ts`):
- After `searchKB()` returns results, check: if `kbArticles.length === 0` OR `max(kbArticles.map(a => a.similarity)) < 0.60`
- If gap detected: call `sessionStore.recordKbGap(classification.category, maxSimilarity, ticketId)`
- Gap is deduplicated by category — same category increments `ticketCount`

**`SessionStore.recordKbGap`** upserts by category:
```ts
{ category, maxSimilarity, ticketCount, detectedAt: first detection ISO timestamp }
```

**Dashboard consumption:** `GET /api/metrics` includes `kbGaps` array. Dashboard renders KB Gaps table.

**Production note:** This replicates in-demo what `lambdas/kb-maintenance` already does for prod (`KB#GAP#` DynamoDB records). The demo version is session-scoped and in-memory. No prod changes needed — `lambdas/reporting/src/weekly.ts` already reads and reports KB gaps via `fetchKbGaps()`.

---

## Files Changed

| File | Change |
|---|---|
| `packages/core/src/schemas/index.ts` | Add `QAScoreSchema`, `QAScore` type; add optional `qaScore` to `SidebarPayload` |
| `apps/demo-server/src/session-store.ts` | **New** — `SessionStore` class with accumulator methods + singleton export |
| `apps/demo-server/src/index.ts` | Add `GET /api/metrics`; wire `sessionStore` into `/analyze` and `/feedback` routes |
| `apps/demo-server/src/pipeline.ts` | Compute `qaScore` after generation; detect KB gaps; write both to `sessionStore` |
| `apps/demo/src/DashboardPage.tsx` | **New** — full dashboard component |
| `apps/demo/src/main.tsx` | Add `/dashboard` route |
| `apps/demo/src/DemoApp.tsx` | Add "Dashboard →" link in header |
| `apps/demo/src/AnalysisView.tsx` | Render QA badge + expandable signal breakdown |
| `apps/sidebar/src/panels/IntelligencePanel.tsx` | Add QA badge in classification card row |

---

## Out of Scope

- No new LLM calls (QA scoring is deterministic)
- No CDK/infra changes (prod reporting pipeline already works)
- No new Zendesk sidebar panels (QA badge is a small addition to existing `IntelligencePanel`)
- No database persistence for demo metrics (in-memory, resets on server restart)
- No authentication on `/api/metrics`

---

## Success Criteria

1. Submit 3+ tickets in the demo → switch to `/dashboard` → see live routing breakdown and KB gaps
2. Every analysis result shows a QA badge with correct grade
3. Categories with no strong KB match appear in the KB Gaps table within one analysis cycle
4. Dashboard works in both light and dark theme
