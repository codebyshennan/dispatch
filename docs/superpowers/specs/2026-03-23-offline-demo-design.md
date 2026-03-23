# Offline Demo Design

**Date:** 2026-03-23
**Status:** Approved

## Overview

A local offline demo of the Beacon AI support pipeline using the existing IntelligencePanel UI, a mock ZAF client, Vectra vector store, and the Reap help center KB articles — no AWS infrastructure required.

## Goal

Demo the full classify → retrieve → generate pipeline to a live audience using:
- The existing `IntelligencePanel` component (unchanged)
- 115 Reap help center articles from `datasets/reap-help-center.jsonl` embedded in a local vector store
- OpenAI `text-embedding-3-small` for KB embeddings (Vectra's native interface)
- Anthropic API for classification and response generation
- Two terminal commands to start

## Architecture

Two new packages added to the monorepo:

### `apps/demo`

Vite React app. Renders a split-panel layout:
- **Left panel (`InputPanel`)** — chat-style history of past queries, a textarea for ticket subject + body (or free-form question), and an Analyze button. On submit, POSTs to `demo-server` and updates the active ticket ID.
- **Right panel** — the existing `IntelligencePanel` from `apps/sidebar/src/panels/`, completely unchanged.

Provides `DemoClientProvider` — a drop-in replacement for `ClientProvider` that mocks the ZAF client interface. This is the only seam between demo and production code.

### `apps/demo-server`

Hono Node.js server (TypeScript, run via `tsx`). Responsibilities:

1. **Startup**: reads `datasets/reap-help-center.jsonl`, embeds all 115 articles using Vectra + OpenAI `text-embedding-3-small`. Saves index to `.beacon-demo-index/` at the monorepo root so subsequent restarts skip re-embedding (~20s first run, instant after).
2. **`POST /analyze`**: accepts `{ subject: string, body: string }`. Generates a `ticketId`, runs the pipeline synchronously, stores result in a memory map, returns `{ ticketId }`.
3. **`GET /context/:ticketId`**: returns the stored `SidebarPayload` with `status: 'ready'`. If not found, returns `{ status: 'pending' }`.
4. **`GET /mode`**: returns `{ mode: 'agent_assisted', threshold: 0.8, currentScore: 0.95 }`.
5. **`POST /feedback`**, **`POST /telemetry`**, **`POST /nps`**: no-op (log to console).
6. **CORS**: `app.use('*', cors({ origin: 'http://localhost:5173' }))` — required since Vite runs on a different port.

### Pipeline (in-process, no AWS)

```
POST /analyze
  → classify({ ticketId, subject, body })         ← lambdas/classifier/src/classify.ts
  → vectra.search(subject + " " + body, topK=5)   ← returns KBResult[]
  → generate({ ticketId, classification, kbArticles, subject, body })
                                                   ← lambdas/response-generator/src/generate.ts
  → SidebarPayload { status: 'ready', classification, responseDraft, kbArticles }
  → Map<ticketId, SidebarPayload>
```

**Prompt path resolution:** `classify.ts` resolves prompts via `__dirname` (relative to its own source location — works correctly when imported as a module). `generate.ts` resolves prompts via `process.cwd()`. The server **must be started from the monorepo root** so `process.cwd()` points to `beacon/`.

**DynamoDB prompt variant loading:** Both handlers call DynamoDB to load A/B prompt variants, with `.catch(() => null)` fallback to the base prompt. With no real AWS, this fires a network call that fails gracefully. To prevent the SDK from hanging on instance metadata discovery, set these env vars before starting:
```
AWS_ACCESS_KEY_ID=demo
AWS_SECRET_ACCESS_KEY=demo
AWS_DEFAULT_REGION=us-east-1
```

### The Mock ZAF Client

```typescript
// DemoClientProvider.tsx — IntelligencePanel never knows it's not in Zendesk
const mockClient: ZAFClientInstance = {
  context: () => Promise.resolve({ ticketId: currentTicketId }),
  request: ({ url, type, data, contentType }) => {
    const actual = url.replace('{{setting.api_base_url}}', 'http://localhost:3001');
    return fetch(actual, {
      method: type,
      body: data,
      headers: contentType ? { 'Content-Type': contentType } : {},
    }).then(r => r.json());
  },
  get: () => Promise.resolve({}),
  invoke: () => Promise.resolve(undefined),
  on: () => {},
  off: () => {},
};
```

`currentTicketId` is React state in `DemoApp`. When the user submits a query, `InputPanel` calls `onAnalyze(ticketId)`, updating state — `DemoClientProvider` re-provides the new value, triggering `useBeaconData` to re-fetch.

## Components

| Component | Location | New/Unchanged |
|-----------|----------|---------------|
| `DemoApp.tsx` | `apps/demo/src/` | New |
| `DemoClientProvider.tsx` | `apps/demo/src/` | New |
| `InputPanel.tsx` | `apps/demo/src/` | New |
| `IntelligencePanel.tsx` | `apps/sidebar/src/panels/` | **Unchanged** |
| `useBeaconData.ts` | `apps/sidebar/src/hooks/` | **Unchanged** |
| `index.ts` | `apps/demo-server/src/` | New |
| `pipeline.ts` | `apps/demo-server/src/` | New |
| `kb-index.ts` | `apps/demo-server/src/` | New |

## Monorepo Integration

- Both packages added to `pnpm-workspace.yaml` under the `apps/*` glob (already covered).
- `apps/demo/package.json`: `name: "@beacon/demo"`, depends on `@beacon/core`, `@zendeskgarden/react-*`, `fast-levenshtein`.
- `apps/demo-server/package.json`: `name: "@beacon/demo-server"`, depends on `@beacon/core`, `hono`, `hono/cors`, `vectra`, `openai`, `@anthropic-ai/sdk`, `tsx` (dev).
- Both extend `tsconfig.base.json` at the monorepo root for `@beacon/*` path alias resolution.

## Running Locally

```bash
# From monorepo root (required for prompt path resolution)
export ANTHROPIC_API_KEY=sk-ant-...
export OPENAI_API_KEY=sk-...
export AWS_ACCESS_KEY_ID=demo
export AWS_SECRET_ACCESS_KEY=demo
export AWS_DEFAULT_REGION=us-east-1

# Terminal 1 — start server (embeds KB on first run ~20s, cached after)
npx tsx apps/demo-server/src/index.ts

# Terminal 2 — start UI
pnpm --filter @beacon/demo dev
```

Open `http://localhost:5173`.

## What Is Not Included

- Feedback persistence (logged to console only)
- Similar tickets (no historical ticket data — section renders empty)
- Auto-send mode (mode endpoint returns static `agent_assisted`)
- VoC, NPS, runbooks (not relevant for demo)
