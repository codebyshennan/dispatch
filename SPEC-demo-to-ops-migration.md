# Spec: Migrate Demo Features to Ops

## Objective

Migrate the four valuable capabilities from `apps/demo` + `apps/demo-server` into `apps/ops` so that both demo apps can be deleted. The ops app is the ongoing production dashboard — a Convex + Next.js admin tool for Reap's card operations team.

**Out of scope:** ticket inbox UI, simulation engine, Zendesk Garden components, ticket classification pipeline (ops serves a different persona — card ops admins, not support agents).

---

## Features to Migrate

### 1. Runbook Execution
**What it is:** Seven mock card API endpoints that simulate Reap's CaaS API — freeze/unfreeze a card, permanently block a card, list transactions, get a transaction detail, report fraud, get account balance, update spend controls.

**Where it lives now:** `apps/demo-server/src/index.ts` — `POST /runbooks/:id` route with a `RESULTS` map for each runbook ID.

**Where it goes in ops:** A Convex action `convex/runbooks.ts` with one exported action per runbook. The chat interface and job detail pages can trigger these. Mock data is served directly from Convex (no external call needed for now — these are mock responses). The `mock_cards` table already exists in schema; runbooks should read/write it where applicable (e.g., `freeze_card` updates `mock_cards.status`).

**Runbooks to port:**
| Runbook ID | Operation | Notes |
|---|---|---|
| `freeze_card` | Update card status to frozen/active | Write to `mock_cards` |
| `block_card` | Permanently block a card | Write to `mock_cards` |
| `list_transactions` | Return mock transaction history | Static mock data |
| `get_transaction` | Return single transaction detail | Static mock data |
| `report_fraud` | Create fraud alert | Static mock data |
| `get_balance` | Return account balance | Static mock data |
| `update_spend_control` | Update per-tx and monthly limits | Static mock data |

**UI surface:** A runbook panel/modal on the `/jobs/[id]` detail page — card operators can trigger individual card actions for cards in a job.

---

### 2. Feedback Loop
**What it is:** Thumbs up / thumbs down / neutral rating on AI chat responses. Tracks `editRatio` (how much the user edited a draft). Used to measure AI draft acceptance rate.

**Where it lives now:** `apps/demo-server/src/session-store.ts` — in-memory `acceptedDrafts` / `feedbackTotal` counts. `POST /feedback` endpoint accepts `{ticketId, rating, editRatio}`.

**Where it goes in ops:** 
- New Convex table `feedback` storing `{responseId, rating: 'up'|'down'|'neutral', editRatio?, createdAt}`.
- New Convex mutation `convex/feedback.ts` — `submitFeedback(args)`.
- UI: thumbs-up/thumbs-down buttons beneath each `answer` and `bulk_op` chat bubble in `apps/ops/src/app/page.tsx`.

---

### 3. KB Search (Policy Search)
**What it is:** Semantic search over a JSONL knowledge base of help center articles. Uses Cohere embeddings + Vectra local vector index. The demo uses this to find relevant KB articles for a support ticket; in ops it already powers policy Q&A (`/lib/policy.ts` returns `PolicySource[]` citations).

**Where it lives now:** `apps/demo-server/src/kb-index.ts` — builds a Vectra index from `datasets/reap-help-center.jsonl`, queries it with Cohere `embed-english-v3.0`.

**Where it goes in ops:** 
- Convex vector search — load the `datasets/reap-help-center.jsonl` articles into a new `kb_articles` Convex table with a vector index on `embedding` (1024-dim for Cohere embed-english-v3.0).
- New Convex action `convex/kb.ts` — `searchKB(query: string): KBResult[]` — embeds the query via Cohere API (called from Convex action using `fetch`), queries the vector index, returns top-k results.
- Wire into `convex/interpreter.ts` — replace or augment the current static policy lookup with live KB search results.
- Seed script: one-time script to embed all articles and write to Convex (can be triggered via `npx convex run kb:seed`).

**Dataset location:** `datasets/reap-help-center.jsonl` (already in repo root, not in demo-server).

---

### 4. Metrics / Telemetry
**What it is:** Session-level metrics: operations processed, routing distribution, draft acceptance rate, KB gaps detected, VoC themes. Currently in-memory in `SessionStore`.

**Where it lives now:** `apps/demo-server/src/session-store.ts` — a singleton `SessionStore` class.

**Where it goes in ops:**
- New Convex table `metrics_events` — append-only event log with `{type: 'operation'|'feedback'|'kb_gap', payload, createdAt}`.
- New Convex query `convex/metrics.ts` — `getMetrics()` aggregates events and returns the same shape as `SessionStore.getMetrics()`.
- New `/metrics` page in ops — simple dashboard showing operations processed, draft acceptance rate, KB gap categories.
- Write events automatically: operations write `type: 'operation'` events in `executor.ts`; feedback writes `type: 'feedback'` events in `feedback.ts`; KB search writes `type: 'kb_gap'` when max similarity < threshold.

---

## Tech Stack (ops)

- Next.js 16 + React 19 + TypeScript 6
- Convex 1.35 (backend: tables, mutations, queries, actions, vector search)
- Tailwind CSS 4
- Existing theme system (`useTheme`)
- Cohere API (for KB embeddings) — already used in demo-server, add `COHERE_API_KEY` to ops env

---

## Commands

```bash
cd apps/ops
pnpm dev          # Next.js dev server (localhost:3000)
npx convex dev    # Convex dev backend

# One-time KB seeding (after migration)
npx convex run kb:seed
```

---

## Project Structure Changes

```
apps/ops/
├── convex/
│   ├── schema.ts         # Add: kb_articles, feedback, metrics_events tables
│   ├── runbooks.ts       # New: Convex actions for 7 runbook operations
│   ├── feedback.ts       # New: submitFeedback mutation
│   ├── kb.ts             # New: searchKB action + seed action
│   └── metrics.ts        # New: getMetrics query + recordMetricEvent mutation
├── src/app/
│   ├── page.tsx           # Add: thumbs feedback UI on answer/bulk_op bubbles
│   ├── jobs/[id]/page.tsx # Add: runbook panel for per-card actions
│   └── metrics/page.tsx   # New: metrics dashboard page
└── src/lib/
    └── policy.ts          # Update: wire searchKB instead of static policy lookup
```

---

## Implementation Order

Tasks are ordered by dependency. Each task is independently verifiable.

- [ ] **Task 1: Schema migration** — Add `kb_articles`, `feedback`, `metrics_events` tables to `convex/schema.ts`
  - Verify: `npx convex dev` runs without schema errors

- [ ] **Task 2: Runbooks Convex action** — Port 7 runbook mocks to `convex/runbooks.ts`. `freeze_card` and `block_card` mutate `mock_cards`; others return static mocks.
  - Verify: Can call `api.runbooks.freezeCard` from Convex dashboard

- [ ] **Task 3: Runbook UI** — Add runbook panel to `/jobs/[id]` page showing per-card action buttons for cards in a job
  - Verify: Click "Freeze Card" → card status updates in mock_cards table

- [ ] **Task 4: Feedback mutation + UI** — Add `convex/feedback.ts` mutation and thumbs-up/thumbs-down buttons under chat bubbles in `page.tsx`
  - Verify: Click thumbs-up → row appears in `feedback` table in Convex dashboard

- [ ] **Task 5: KB articles schema + seed** — Add `kb_articles` table with vector index, write `convex/kb.ts` seed action that reads `datasets/reap-help-center.jsonl`, embeds via Cohere, writes to Convex
  - Verify: `npx convex run kb:seed` populates table with correct article count

- [ ] **Task 6: KB search action** — `searchKB` action in `convex/kb.ts` takes a query string, embeds it, queries vector index, returns top-5 `KBResult[]`
  - Verify: Call from Convex dashboard with "What is the card limit policy?" and get relevant articles

- [ ] **Task 7: Wire KB search into interpreter** — Update `convex/interpreter.ts` to call `searchKB` for policy Q&A responses, surfacing citations
  - Verify: Ask a policy question in ops chat → response includes cited article titles

- [ ] **Task 8: Metrics events + query** — Add `metrics_events` table, `recordMetricEvent` mutation, `getMetrics` query. Wire into executor (operation events) and feedback (feedback events)
  - Verify: Run a job + submit feedback → `getMetrics` returns non-zero counts

- [ ] **Task 9: Metrics page** — `/metrics` route showing operations processed, draft acceptance rate, KB gaps, VoC themes
  - Verify: Page loads and shows real data from `getMetrics`

- [ ] **Task 10: Delete demo + demo-server** — Verify all features work in ops, then `trash apps/demo apps/demo-server`
  - Verify: `pnpm build` from repo root passes with no errors

---

## Boundaries

- **Always:** Use Convex mutations/queries/actions for all backend logic — no new API routes in Next.js
- **Ask first:** Changing the KB embedding model or dimension (affects existing indexed data)
- **Never:** Call Anthropic/OpenAI/Cohere SDK directly from Next.js — all LLM/embedding calls go through Convex actions
- **Never:** Use `rm` to delete files — use `trash` CLI

---

## Success Criteria

1. All 7 runbook actions are callable from the `/jobs/[id]` page
2. Feedback (up/down/neutral) is persisted to Convex on all chat response types
3. Policy Q&A in chat surfaces citations from the KB article index
4. `/metrics` page shows live aggregated data (operations, acceptance rate, KB gaps)
5. `apps/demo` and `apps/demo-server` are deleted with no build errors remaining

---

## Open Questions

1. **KB embedding provider:** Cohere is used in demo-server. Convex actions can call Cohere via `fetch`. Confirm `COHERE_API_KEY` is available in ops environment (or switch to OpenAI embeddings since OpenAI is already used in ops).
2. **Runbook surface:** Should runbooks also be triggerable from the chat interface ("freeze card X") or only from the job detail page?
3. **Metrics page nav:** Should `/metrics` appear in the top nav alongside `/jobs`?
