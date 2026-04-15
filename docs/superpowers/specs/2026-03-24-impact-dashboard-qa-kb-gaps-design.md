# Design: Impact Dashboard, QA Scores, KB Gap Detection

**Date:** 2026-03-24
**Status:** Approved
**Scope:** `apps/demo`, `apps/demo-server`, `packages/core`

---

## Problem

Dispatch has strong backend instrumentation (weekly reports, audit logs, VoC correlation, KB gap records) but nothing surfaces in real-time. An interviewer cannot see impact without reading an email. This spec adds three visible, demo-able features that map directly to the target JD ("measure impact", "QA", "AI-ready foundations").

---

## Features

### 1. Impact Dashboard (`/dashboard` route)

A dedicated full-screen page in the demo app showing live session metrics.

**Location:** `apps/demo` — new route at `/dashboard`, linked from the header. `main.tsx` already exists and exports the router; add the `/dashboard` route entry there.

**Data source:** `apps/demo-server` gains an in-memory `SessionStore` singleton that accumulates stats across all requests for the current process lifetime. A new endpoint returns the snapshot; the dashboard polls it every 5 seconds and stops on unmount.

**API route naming:** Vite's dev proxy (`vite.config.ts` line 18) rewrites `/api/*` → demo-server by stripping the `/api` prefix. All existing demo routes follow this pattern. Therefore:
- Demo-server registers: `GET /metrics`
- Dashboard polls: `GET /api/metrics` (proxy strips `/api` → `/metrics`)

**SessionStore tracks:**
```ts
interface SessionState {
  ticketsProcessed: number;                         // incremented on every POST /analyze
  routingCounts: { auto_send: number; agent_assisted: number; escalate: number };
  feedbackTotal: number;                            // total POST /feedback calls with editRatio
  acceptedDrafts: number;                           // feedback entries where editRatio < 0.20
  kbGapsDetected: KbGapEntry[];                     // upserted by category
  sessionStartedAt: string;                         // ISO timestamp set on module load
}

interface KbGapEntry {
  category: string;
  maxSimilarity: number;    // 0 when no articles returned
  ticketCount: number;      // incremented on repeated gap for same category
  detectedAt: string;       // ISO timestamp of first detection
}
```

**Metric formulas:**
- `deflectionRate = routingCounts.auto_send / Math.max(ticketsProcessed, 1)` — proportion of tickets fully handled by AI without agent touch
- `draftAcceptanceRate = acceptedDrafts / Math.max(feedbackTotal, 1)` — proportion of submitted responses that were near-verbatim (editRatio < 0.20)

**`GET /api/metrics` response shape:**
```ts
{
  ticketsProcessed: number;
  deflectionRate: number;          // 0–1
  draftAcceptanceRate: number;     // 0–1
  routingCounts: { auto_send: number; agent_assisted: number; escalate: number };
  kbGaps: KbGapEntry[];
  vocThemes: Array<{ theme: string; severity: 'high' | 'medium' }>;
  sessionStartedAt: string;
}
```

**VoC themes:** Static seed of 3 items in the demo (mirrors the shape produced by `voc-processor`'s monthly correlation analysis in production). Not dynamically derived from session tickets.

**Dashboard UI layout (Layout B — approved):**
1. Header: Dispatch logo + "/ dashboard" breadcrumb + "← Back to demo" link
2. Three hero KPI cards: Deflection Rate · Draft Acceptance · KB Gaps Detected
3. Routing stacked bar: auto / assisted / escalate with percentages and counts
4. KB Gaps table: category · ticket count · max similarity · suggested action ("Add KB article for this topic")
5. VoC Themes strip: 3 items with severity indicator (static in demo; sourced from DynamoDB in prod)

**Routing:** No router library is installed. `main.tsx` checks `window.location.hash` on load and on `hashchange` events to decide whether to render `<DemoApp />` (default) or `<DashboardPage />` (when hash is `#/dashboard`). The `DemoApp` header link sets `window.location.hash = '#/dashboard'`. The "← Back to demo" link sets it back to `''`.

**Theme:** `DemoApp` writes `localStorage.setItem('beaconTheme', theme)` before navigating to the dashboard. `DashboardPage` reads `localStorage.getItem('beaconTheme')` on mount, defaulting to `'dark'`. No query param needed.

---

### 2. QA Score on Drafts

A deterministic quality signal computed after response generation. No LLM call.

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
```

`SidebarPayloadSchema` gains: `qaScore: QAScoreSchema.optional()`.

`SidebarPayload` interface in `packages/core/src/types/index.ts` gains: `qaScore?: unknown` — consistent with the existing pattern where `classification`, `responseDraft`, and `kbArticles` are typed `unknown` to avoid circular schema imports. Call sites cast to `QAScore` when reading.

**Scoring formula:**

| Signal | Max pts | Rule |
|---|---|---|
| KB coverage | 40 | `(articles.filter(a => a.similarity >= 0.70).length / Math.max(articles.length, 1)) * 40` |
| Classification confidence | 30 | `classification.confidence * 30` |
| No compliance flags | 20 | `classification.compliance_flags.length === 0 ? 20 : 0` |
| Draft length | 10 | `wordCount(draft) >= 50 && wordCount(draft) <= 400 ? 10 : 0` |

`compliance_flags` is `string[]` already present on `ClassificationSchema` (confirmed: `packages/core/src/schemas/index.ts` line 45). No schema change needed for this field.

`kbArticles[].similarity` is already returned by `searchKB()` — `r.score` from Vectra's `queryItems()` (confirmed: `apps/demo-server/src/kb-index.ts` line 113). No change to `searchKB()` needed.

Grade thresholds: `score >= 75 → 'high'` · `score >= 50 → 'medium'` · otherwise `'low'`

**Computed in:** `apps/demo-server/src/pipeline.ts` — after `generateResponse()` returns, compute `qaScore` and attach to the `SidebarPayload` before storing in the results map.

**Displayed in:**
- `apps/demo/src/AnalysisView.tsx` — coloured pill badge inline with the routing badge. Clicking expands to show signal breakdown (4 rows, each with pts earned / pts possible).
- `apps/sidebar/src/panels/IntelligencePanel.tsx` — same pill badge in the classification card row. No expansion needed in sidebar (space-constrained).

---

### 3. KB Gap Detection

**Detection logic** in `apps/demo-server/src/pipeline.ts`, immediately after `searchKB()` returns:

```ts
const maxSimilarity = kbArticles.length > 0
  ? Math.max(...kbArticles.map(a => a.similarity))
  : 0;                              // 0 when no articles returned

if (maxSimilarity < 0.60) {
  sessionStore.recordKbGap(
    classification.category,        // deduplication key — category only, no ticketId
    maxSimilarity,
  );
}
```

**`SessionStore.recordKbGap(category, maxSimilarity)`:** Upserts by `category`:
- If entry exists: increment `ticketCount`, update `maxSimilarity` to the new value (so dashboard shows latest signal strength)
- If entry is new: insert `{ category, maxSimilarity, ticketCount: 1, detectedAt: now() }`

No `ticketId` parameter — deduplication is category-scoped only.

**Dashboard consumption:** `GET /api/metrics` includes `kbGaps` array sorted by `ticketCount` descending.

**Production note:** This replicates in-demo what `lambdas/kb-maintenance` already does for prod (`KB#GAP#` DynamoDB records). The demo version is session-scoped and in-memory. No prod changes needed — `lambdas/reporting/src/weekly.ts` already reads and reports KB gaps via `fetchKbGaps()`.

---

## Feedback Endpoint Wiring

`POST /feedback` already exists in `apps/demo-server/src/index.ts` (line 55) as a no-op. It will be wired to `sessionStore`:

```ts
app.post('/feedback', async (c) => {
  const body = await c.req.json<{
    ticketId: string;
    rating: 'up' | 'down' | 'neutral';
    editRatio?: number;
  }>();
  if (typeof body.editRatio === 'number') {
    sessionStore.recordFeedback(body.editRatio);
  }
  return c.json({ ok: true });
});
```

`SessionStore.recordFeedback(editRatio)`: increments `feedbackTotal`; if `editRatio < 0.20`, also increments `acceptedDrafts`.

---

## Files Changed

| File | Change |
|---|---|
| `packages/core/src/schemas/index.ts` | Add `QAScoreSchema`, `QAScore` type; add optional `qaScore` to `SidebarPayloadSchema` |
| `packages/core/src/types/index.ts` | Add `qaScore?: unknown` to `SidebarPayload` interface (consistent with existing `unknown`-typed fields) |
| `apps/demo-server/src/session-store.ts` | **New** — `SessionStore` class with `recordAnalysis()`, `recordFeedback()`, `recordKbGap()`, `getMetrics()` + singleton export |
| `apps/demo-server/src/index.ts` | Add `GET /api/metrics`; wire `sessionStore` in `/analyze` and `/feedback` |
| `apps/demo-server/src/pipeline.ts` | Compute `qaScore` after generation; detect KB gaps; write both to `sessionStore` |
| `apps/demo/src/DashboardPage.tsx` | **New** — full dashboard component with 5-section layout |
| `apps/demo/src/main.tsx` | **Modify** — add `/dashboard` route |
| `apps/demo/src/DemoApp.tsx` | **Modify** — add "Dashboard →" link in header |
| `apps/demo/src/AnalysisView.tsx` | **Modify** — render QA badge + expandable signal breakdown |
| `apps/sidebar/src/panels/IntelligencePanel.tsx` | **Modify** — add QA badge in classification card row |

---

## Out of Scope

- No new LLM calls (QA scoring is deterministic)
- No CDK/infra changes (prod reporting pipeline already works)
- No new Zendesk sidebar panels (QA badge is a small addition to existing `IntelligencePanel`)
- No database persistence for demo metrics (in-memory, resets on server restart)
- No authentication on `/api/metrics`

---

## Success Criteria

1. Submit 3+ tickets in the demo → switch to `/dashboard` → routing breakdown updates and any low-KB-coverage categories appear in the KB Gaps table
2. Every analysis result shows a QA badge with a grade matching the scoring formula
3. QA badge expands to show per-signal breakdown in `AnalysisView`
4. Categories with `max(similarity) < 0.60` appear in the KB Gaps table after the next analysis cycle
5. Dashboard renders correctly in both light and dark theme (passed via URL query param)
6. VoC themes strip displays 3 static seed items (static in demo; confirmed separate from dynamic routing/gap data)
