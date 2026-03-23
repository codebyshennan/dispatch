# Offline Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local offline demo that runs the full classify → KB-retrieve → generate pipeline with a split-panel UI: left chat input, right the existing IntelligencePanel component (unchanged).

**Architecture:** A new `apps/demo-server` Hono server embeds 115 KB articles into a Vectra vector store on startup, then runs the classify/generate pipeline in-process on `POST /analyze`. A new `apps/demo` Vite React app mocks the ZAF global so the existing `IntelligencePanel` (imported unchanged) renders against the local server.

**Tech Stack:** Vectra (vector store) · OpenAI `text-embedding-3-small` (embeddings) · Anthropic Claude (classify + generate, via existing `@beacon/core` invoke) · Hono (server) · Vite + React (UI) · `tsx` (TypeScript runner, no compile step needed for demo)

---

## File Map

**New — `apps/demo-server/`**

| File | Responsibility |
|------|---------------|
| `package.json` | Package manifest: `@beacon/demo-server`, deps: hono, @hono/node-server, vectra, openai, @anthropic-ai/sdk, tsx |
| `tsconfig.json` | Extends root `tsconfig.base.json`; adds `"lib": ["ES2022"]` |
| `src/kb-index.ts` | Load JSONL, embed articles with OpenAI, save/load Vectra index, `searchKB()` |
| `src/pipeline.ts` | `analyze(subject, body)` → classify → searchKB → generateResponse → `SidebarPayload` |
| `src/index.ts` | Hono app: CORS, all routes, startup index build, in-memory results map |

**New — `apps/demo/`**

| File | Responsibility |
|------|---------------|
| `package.json` | Package manifest: `@beacon/demo`, deps: react, react-dom, vite, @vitejs/plugin-react, @zendeskgarden/react-*, @beacon/core, fast-levenshtein |
| `tsconfig.json` | Extends root `tsconfig.base.json`; adds `"lib": ["ES2022", "DOM"]` |
| `vite.config.ts` | React plugin, `@beacon/core` alias, proxy `/api → localhost:3001` |
| `index.html` | Minimal entry point |
| `src/main.tsx` | Sets `window.ZAFClient` mock global, renders `DemoApp` |
| `src/mock-zaf-client.ts` | Module-level `currentTicketId`, `setTicketId()`, `mockZAFClient` object |
| `src/DemoApp.tsx` | Split layout, state: `currentTicketId`, wraps with `ClientProvider` |
| `src/InputPanel.tsx` | Textarea for subject+body, submit button, query history list |

> **Note — architectural deviation from spec:** The spec listed a `DemoClientProvider.tsx` component as the seam. The plan instead uses a `window.ZAFClient` global mock set in `main.tsx` before render. This achieves the same isolation with less code: the real `ClientProvider` from the sidebar is used unchanged, and the mock client is injected via the global that `ClientProvider` already reads. No `DemoClientProvider` file is needed.

**Unchanged (imported directly by `apps/demo`)**

- `apps/sidebar/src/panels/IntelligencePanel.tsx`
- `apps/sidebar/src/hooks/useBeaconData.ts`
- `apps/sidebar/src/contexts/ClientProvider.tsx`

---

## Task 1: Scaffold `apps/demo-server`

**Files:**
- Create: `apps/demo-server/package.json`
- Create: `apps/demo-server/tsconfig.json`

- [ ] **Step 1: Create `apps/demo-server/package.json`**

```json
{
  "name": "@beacon/demo-server",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "tsx src/index.ts",
    "dev": "tsx watch src/index.ts"
  },
  "dependencies": {
    "hono": "^4.6.0",
    "@hono/node-server": "^1.13.0",
    "vectra": "^0.9.0",
    "openai": "6.32.0",
    "@anthropic-ai/sdk": "0.80.0",
    "@beacon/core": "workspace:*"
  },
  "devDependencies": {
    "tsx": "^4.19.0",
    "typescript": "^5.5.0"
  }
}
```

- [ ] **Step 2: Create `apps/demo-server/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2022"],
    "outDir": "dist",
    "rootDir": "src",
    "moduleResolution": "node16",
    "paths": {
      "@beacon/core": ["../../packages/core/src/index.ts"]
    }
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Install dependencies**

```bash
# From monorepo root
pnpm install
```

Expected: resolves `@beacon/demo-server` in workspace and installs `vectra`, `@hono/node-server`.

- [ ] **Step 4: Verify install**

```bash
ls apps/demo-server/node_modules/.modules.yaml 2>/dev/null || echo "check pnpm-lock for @beacon/demo-server"
grep "@beacon/demo-server" pnpm-lock.yaml | head -2
```

Expected: package appears in lock file.

- [ ] **Step 5: Commit**

```bash
git add apps/demo-server/package.json apps/demo-server/tsconfig.json pnpm-lock.yaml
git commit -m "chore(demo-server): scaffold package"
```

---

## Task 2: KB Index (`kb-index.ts`)

Reads the 115 Reap help-center articles, embeds them with OpenAI, saves the Vectra index to disk. Subsequent restarts load from disk (skipping the ~20s embed step).

**Files:**
- Create: `apps/demo-server/src/kb-index.ts`

- [ ] **Step 1: Create `apps/demo-server/src/kb-index.ts`**

```typescript
import { LocalIndex } from 'vectra';
import { OpenAI } from 'openai';
import { createReadStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import * as readline from 'node:readline';
import * as path from 'node:path';
import type { KBResult } from '@beacon/core';

const INDEX_DIR = path.resolve(process.cwd(), '.beacon-demo-index');
const DATASET_PATH = path.resolve(process.cwd(), 'datasets/reap-help-center.jsonl');
const EMBED_MODEL = 'text-embedding-3-small';

let index: LocalIndex | null = null;
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

interface Article {
  id: string;
  title: string;
  url: string;
  body: string;
  updated_at: string;
}

async function readArticles(): Promise<Article[]> {
  const articles: Article[] = [];
  const rl = readline.createInterface({ input: createReadStream(DATASET_PATH) });
  for await (const line of rl) {
    if (!line.trim()) continue;
    const raw = JSON.parse(line);
    articles.push({
      id: String(raw.id),
      title: raw.title,
      url: raw.url,
      body: raw.body,
      updated_at: raw.updated_at,
    });
  }
  return articles;
}

async function embed(text: string): Promise<number[]> {
  const res = await openai.embeddings.create({
    model: EMBED_MODEL,
    input: text.slice(0, 8000), // stay within token limit
  });
  return res.data[0].embedding;
}

export async function buildKBIndex(): Promise<void> {
  console.log('[kb-index] Building Vectra index from dataset...');
  const idx = new LocalIndex(INDEX_DIR);
  await idx.createIndex({ version: 1, deleteIfExists: true });

  const articles = await readArticles();
  console.log(`[kb-index] Embedding ${articles.length} articles...`);

  for (let i = 0; i < articles.length; i++) {
    const article = articles[i];
    const text = `${article.title}\n\n${article.body}`;
    const vector = await embed(text);
    await idx.insertItem({
      vector,
      metadata: {
        article_id: Number(article.id),
        title: article.title,
        html_url: article.url,
        updated_at: article.updated_at,
        // Store first 500 chars as excerpt for KB card rendering
        text: article.body.slice(0, 500),
      },
    });
    if ((i + 1) % 10 === 0) console.log(`[kb-index]   ${i + 1}/${articles.length}`);
  }

  index = idx;
  console.log('[kb-index] Index built and saved to .beacon-demo-index/');
}

export async function loadOrBuildKBIndex(): Promise<void> {
  const idx = new LocalIndex(INDEX_DIR);
  if (await idx.isIndexCreated()) {
    console.log('[kb-index] Loading existing index from .beacon-demo-index/');
    index = idx;
  } else {
    await buildKBIndex();
  }
}

export async function searchKB(query: string, topK = 5): Promise<KBResult[]> {
  if (!index) throw new Error('KB index not loaded — call loadOrBuildKBIndex() first');
  const queryVector = await embed(query);
  const results = await index.queryItems(queryVector, topK);
  return results.map(r => ({
    article_id: r.item.metadata.article_id as number,
    title: r.item.metadata.title as string,
    html_url: r.item.metadata.html_url as string,
    updated_at: r.item.metadata.updated_at as string,
    text: r.item.metadata.text as string,
    similarity: r.score,
  }));
}
```

- [ ] **Step 2: Smoke-test the index build (manual)**

```bash
# From monorepo root
export OPENAI_API_KEY=sk-...
npx tsx -e "
import { loadOrBuildKBIndex, searchKB } from './apps/demo-server/src/kb-index.ts';
await loadOrBuildKBIndex();
const r = await searchKB('how do I freeze my card');
console.log(r.map(x => x.title));
"
```

Expected: logs titles like "Card Freeze…" or related Reap card articles, then exits.

- [ ] **Step 3: Commit**

```bash
git add apps/demo-server/src/kb-index.ts
git commit -m "feat(demo-server): KB index with Vectra + OpenAI embeddings"
```

---

## Task 3: Pipeline (`pipeline.ts`)

Orchestrates classify → searchKB → generateResponse in-process. Returns a `SidebarPayload` ready for the UI.

**Files:**
- Create: `apps/demo-server/src/pipeline.ts`

- [ ] **Step 1: Create `apps/demo-server/src/pipeline.ts`**

```typescript
import { randomUUID } from 'node:crypto';
import { classify } from '../../../lambdas/classifier/src/classify.js';
import { generateResponse } from '../../../lambdas/response-generator/src/generate.js';
import { searchKB } from './kb-index.js';
import type { SidebarPayload } from '@beacon/core';

export interface AnalyzeInput {
  subject: string;
  body: string;
}

export async function analyze(input: AnalyzeInput): Promise<{ ticketId: string; payload: SidebarPayload }> {
  const ticketId = randomUUID();
  const { subject, body } = input;

  // Step 1: classify
  const { classification } = await classify({ ticketId, subject, body });

  // Step 2: KB retrieval — search on subject + body excerpt
  const query = `${subject}\n${body.slice(0, 500)}`;
  const kbArticles = await searchKB(query, 5);

  // Step 3: generate draft response
  const { responseDraft } = await generateResponse({
    ticketId,
    subject,
    body,
    classification,
    kbArticles,
  });

  const payload: SidebarPayload = {
    ticketId,
    status: 'ready',
    classification,
    responseDraft,
    kbArticles,
    similarTickets: [],
    processedAt: new Date().toISOString(),
  };

  return { ticketId, payload };
}
```

- [ ] **Step 2: Smoke-test pipeline (manual)**

```bash
# From monorepo root — cwd matters for generate.ts prompt loading
export ANTHROPIC_API_KEY=sk-ant-...
export OPENAI_API_KEY=sk-...
export AWS_ACCESS_KEY_ID=demo
export AWS_SECRET_ACCESS_KEY=demo
export AWS_DEFAULT_REGION=us-east-1
npx tsx -e "
import { analyze } from './apps/demo-server/src/pipeline.ts';
const r = await analyze({ subject: 'Card freeze', body: 'I need to freeze my Reap card immediately' });
console.log(r.payload.classification);
console.log(r.payload.responseDraft?.draft?.slice(0, 100));
"
```

Expected: prints a `Classification` object and the start of a draft response. If `AUDIT_LOG_TABLE_NAME` is not set, DynamoDB variant loading will `.catch(() => null)` and fall through to the base prompt — that's fine.

- [ ] **Step 3: Commit**

```bash
git add apps/demo-server/src/pipeline.ts
git commit -m "feat(demo-server): analyze pipeline (classify → KB search → generate)"
```

---

## Task 4: Server Entry Point (`index.ts`)

Hono server with CORS, all routes, startup index loading, in-memory results map.

**Files:**
- Create: `apps/demo-server/src/index.ts`

- [ ] **Step 1: Create `apps/demo-server/src/index.ts`**

```typescript
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
```

- [ ] **Step 2: Start server and test endpoints**

```bash
# From monorepo root
export ANTHROPIC_API_KEY=sk-ant-...
export OPENAI_API_KEY=sk-...
export AWS_ACCESS_KEY_ID=demo
export AWS_SECRET_ACCESS_KEY=demo
export AWS_DEFAULT_REGION=us-east-1
npx tsx apps/demo-server/src/index.ts
```

In a second terminal:

```bash
# Health check
curl http://localhost:3001/health
# Expected: {"status":"ok"}

# Submit a ticket
curl -s -X POST http://localhost:3001/analyze \
  -H "Content-Type: application/json" \
  -d '{"subject":"Card freeze","body":"I need to freeze my Reap card immediately"}' | jq
# Expected: {"ticketId":"<uuid>"}

# Poll result (replace UUID)
curl -s http://localhost:3001/context/<uuid> | jq '.status, .classification.urgency'
# Expected: "ready" and "P1" or "P2"

# Mode
curl http://localhost:3001/mode
# Expected: {"mode":"agent_assisted",...}
```

- [ ] **Step 3: Commit**

```bash
git add apps/demo-server/src/index.ts
git commit -m "feat(demo-server): Hono server with analyze, context, mode routes"
```

---

## Task 5: Scaffold `apps/demo`

**Files:**
- Create: `apps/demo/package.json`
- Create: `apps/demo/tsconfig.json`
- Create: `apps/demo/vite.config.ts`
- Create: `apps/demo/index.html`

- [ ] **Step 1: Create `apps/demo/package.json`**

```json
{
  "name": "@beacon/demo",
  "version": "0.0.1",
  "private": true,
  "scripts": {
    "dev": "vite",
    "build": "vite build"
  },
  "dependencies": {
    "@beacon/core": "workspace:*",
    "@zendeskgarden/react-theming": "~9.15.0",
    "@zendeskgarden/react-buttons": "~9.15.0",
    "@zendeskgarden/react-loaders": "~9.15.0",
    "@zendeskgarden/react-notifications": "~9.15.0",
    "@zendeskgarden/react-typography": "~9.15.0",
    "@zendeskgarden/react-modals": "~9.15.0",
    "@zendeskgarden/react-forms": "~9.15.0",
    "@zendeskgarden/react-tags": "~9.15.0",
    "fast-levenshtein": "^3.0.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "typescript": "^5.5.0",
    "vite": "^5.4.0"
  }
}
```

- [ ] **Step 2: Create `apps/demo/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "lib": ["ES2022", "DOM"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "noEmit": true,
    "paths": {
      "@beacon/core": ["../../packages/core/src/index.ts"]
    }
  },
  "include": ["src", "../sidebar/src"]
}
```

- [ ] **Step 3: Create `apps/demo/vite.config.ts`**

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@beacon/core': path.resolve(__dirname, '../../packages/core/src/index.ts'),
    },
  },
  optimizeDeps: {
    exclude: ['@beacon/core'],
  },
  server: {
    port: 5173,
    proxy: {
      // Not strictly needed — DemoClientProvider replaces the URL directly,
      // but useful for direct fetch calls during dev
      '/api': { target: 'http://localhost:3001', rewrite: (p) => p.replace(/^\/api/, '') },
    },
  },
});
```

- [ ] **Step 4: Create `apps/demo/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Beacon AI Demo</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5: Create src directory and install**

```bash
mkdir -p apps/demo/src
pnpm install
pnpm --filter @beacon/demo exec vite --version
```

Expected: prints Vite version.

- [ ] **Step 6: Commit**

```bash
git add apps/demo/package.json apps/demo/tsconfig.json apps/demo/vite.config.ts apps/demo/index.html pnpm-lock.yaml
git commit -m "chore(demo): scaffold Vite React app"
```

---

## Task 6: Mock ZAF Client (`mock-zaf-client.ts`)

Module-level mutable `currentTicketId` lets `DemoApp` update what `useTicketId()` returns without re-creating the client object. Setting `window.ZAFClient` before `ClientProvider` renders means the real `ClientProvider` from the sidebar gets our mock — zero modifications to sidebar code.

**Files:**
- Create: `apps/demo/src/mock-zaf-client.ts`

- [ ] **Step 1: Create `apps/demo/src/mock-zaf-client.ts`**

```typescript
import type { ZAFClientInstance, ZAFRequestOptions } from '../../sidebar/src/contexts/ClientProvider';

// Module-level mutable state — fine for a demo
let currentTicketId = 'demo-init';

export function setTicketId(id: string): void {
  currentTicketId = id;
}

export const mockZAFClient: { init: () => ZAFClientInstance } = {
  init: () => ({
    context: () => Promise.resolve({ ticketId: currentTicketId }),

    request: ({ url, type, data, contentType }: ZAFRequestOptions) => {
      const actualUrl = url.replace('{{setting.api_base_url}}', 'http://localhost:3001');
      return fetch(actualUrl, {
        method: type,
        body: data,
        headers: contentType ? { 'Content-Type': contentType } : {},
      }).then(r => r.json());
    },

    get: () => Promise.resolve({}),
    invoke: () => Promise.resolve(undefined),
    on: () => {},
    off: () => {},
  }),
};
```

- [ ] **Step 2: Commit**

```bash
git add apps/demo/src/mock-zaf-client.ts
git commit -m "feat(demo): mock ZAF client"
```

---

## Task 7: Input Panel (`InputPanel.tsx`)

Left side of the split layout. Chat-style history of past queries, plus a form to submit new ones.

**Files:**
- Create: `apps/demo/src/InputPanel.tsx`

- [ ] **Step 1: Create `apps/demo/src/InputPanel.tsx`**

```tsx
import React, { useState } from 'react';
import { Field, Label, Textarea, Input } from '@zendeskgarden/react-forms';
import { Button } from '@zendeskgarden/react-buttons';
import { Paragraph, Span } from '@zendeskgarden/react-typography';

export interface QueryEntry {
  ticketId: string;
  subject: string;
  body: string;
  submittedAt: string;
}

interface Props {
  onAnalyze: (ticketId: string, entry: QueryEntry) => void;
  onSubmitStart: () => void;
  history: QueryEntry[];
  activeTicketId: string | null;
  loading: boolean;
}

export function InputPanel({ onAnalyze, onSubmitStart, history, activeTicketId, loading }: Props) {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!body.trim()) { setError('Enter a message or ticket body'); return; }
    setError(null);
    onSubmitStart();

    try {
      const res = await fetch('http://localhost:3001/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject: subject.trim(), body: body.trim() }),
      });
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      const { ticketId } = await res.json() as { ticketId: string };

      const entry: QueryEntry = {
        ticketId,
        subject: subject.trim() || body.trim().slice(0, 60),
        body: body.trim(),
        submittedAt: new Date().toISOString(),
      };
      onAnalyze(ticketId, entry);
      setSubject('');
      setBody('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed — is demo-server running?');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '16px', gap: '12px' }}>
      <Paragraph style={{ fontWeight: 600, fontSize: '16px', margin: 0 }}>Beacon AI Demo</Paragraph>

      {/* Input form */}
      <Field>
        <Label>Subject (optional)</Label>
        <Input
          value={subject}
          onChange={e => setSubject(e.target.value)}
          placeholder="e.g. Card freeze request"
        />
      </Field>
      <Field>
        <Label>Message / Ticket body</Label>
        <Textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          placeholder="Paste a customer message or type a support question..."
          rows={6}
          style={{ resize: 'vertical' }}
        />
      </Field>
      {error && <Span style={{ color: '#cc0000', fontSize: '13px' }}>{error}</Span>}
      <Button isPrimary onClick={handleSubmit} disabled={loading}>
        {loading ? 'Analyzing...' : 'Analyze'}
      </Button>

      {/* Query history */}
      {history.length > 0 && (
        <div style={{ marginTop: '8px', overflowY: 'auto', flex: 1 }}>
          <Span style={{ fontSize: '12px', color: '#68737d', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            History
          </Span>
          {[...history].reverse().map(entry => (
            <div
              key={entry.ticketId}
              onClick={() => onAnalyze(entry.ticketId, entry)}
              style={{
                padding: '8px',
                marginTop: '6px',
                borderRadius: '4px',
                cursor: 'pointer',
                background: entry.ticketId === activeTicketId ? '#e8f0fe' : '#f5f5f5',
                borderLeft: entry.ticketId === activeTicketId ? '3px solid #1f73b7' : '3px solid transparent',
              }}
            >
              <div style={{ fontSize: '13px', fontWeight: 500 }}>{entry.subject}</div>
              <div style={{ fontSize: '11px', color: '#68737d' }}>
                {new Date(entry.submittedAt).toLocaleTimeString()}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/demo/src/InputPanel.tsx
git commit -m "feat(demo): InputPanel with submit form and query history"
```

---

## Task 8: Demo App + Entry Point (`DemoApp.tsx` + `main.tsx`)

Wires everything together. Sets the ZAF global mock before `ClientProvider` renders. Uses `key={currentTicketId}` on `IntelligencePanel` to force a remount (re-running `useTicketId` and `useBeaconData`) on each new analysis.

**Files:**
- Create: `apps/demo/src/DemoApp.tsx`
- Create: `apps/demo/src/main.tsx`

- [ ] **Step 1: Create `apps/demo/src/DemoApp.tsx`**

```tsx
import React, { useState } from 'react';
import { ClientProvider } from '../../sidebar/src/contexts/ClientProvider';
import { IntelligencePanel } from '../../sidebar/src/panels/IntelligencePanel';
import { InputPanel, type QueryEntry } from './InputPanel';
import { setTicketId } from './mock-zaf-client';

export function DemoApp() {
  const [currentTicketId, setCurrentTicketId] = useState<string | null>(null);
  const [history, setHistory] = useState<QueryEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const handleAnalyze = (ticketId: string, entry: QueryEntry) => {
    setTicketId(ticketId);
    setCurrentTicketId(ticketId);
    setLoading(false);
    setHistory(prev => {
      // Deduplicate by ticketId
      const exists = prev.find(e => e.ticketId === ticketId);
      return exists ? prev : [...prev, entry];
    });
  };

  const handleSubmitStart = () => setLoading(true);

  return (
    <ClientProvider>
      <div style={{ display: 'flex', height: '100vh', fontFamily: 'system-ui, sans-serif' }}>
        {/* Left: input panel — fixed width */}
        <div style={{ width: '360px', borderRight: '1px solid #e0e0e0', overflowY: 'auto' }}>
          <InputPanel
            onAnalyze={handleAnalyze}
            onSubmitStart={handleSubmitStart}
            history={history}
            activeTicketId={currentTicketId}
            loading={loading}
          />
        </div>

        {/* Right: IntelligencePanel — remounts on each new ticketId so hooks re-fire */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
          {currentTicketId
            ? <IntelligencePanel key={currentTicketId} />
            : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#68737d' }}>
                Submit a ticket to see AI analysis
              </div>
            )
          }
        </div>
      </div>
    </ClientProvider>
  );
}
```

Note: `handleSubmitStart` is wired via an `onSubmitStart` prop added to `InputPanel` — add `onSubmitStart?: () => void` to `InputPanel`'s `Props` interface and call it before the `fetch` in `handleSubmit`.

- [ ] **Step 2: Verify `onSubmitStart` is wired**

`InputPanel` already has `onSubmitStart` in its `Props` (added in Task 7). Confirm `DemoApp` passes it:

- [ ] **Step 3: Create `apps/demo/src/main.tsx`**

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { mockZAFClient } from './mock-zaf-client';
import { DemoApp } from './DemoApp';

// Must be set before DemoApp renders — ClientProvider reads ZAFClient.init() in useState()
(window as unknown as Record<string, unknown>).ZAFClient = mockZAFClient;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <DemoApp />
  </React.StrictMode>,
);
```

- [ ] **Step 4: Commit**

```bash
git add apps/demo/src/DemoApp.tsx apps/demo/src/InputPanel.tsx apps/demo/src/main.tsx
git commit -m "feat(demo): DemoApp split layout and main entry point"
```

---

## Task 9: End-to-End Smoke Test

Full demo from two terminal windows.

**Files:** None created — this is a run step.

- [ ] **Step 1: Start demo-server (Terminal 1)**

```bash
# From monorepo root
export ANTHROPIC_API_KEY=sk-ant-...
export OPENAI_API_KEY=sk-...
export AWS_ACCESS_KEY_ID=demo
export AWS_SECRET_ACCESS_KEY=demo
export AWS_DEFAULT_REGION=us-east-1
npx tsx apps/demo-server/src/index.ts
```

Expected output:
```
[kb-index] Loading existing index from .beacon-demo-index/    ← (or "Building..." on first run)
[demo-server] Running at http://localhost:3001
```

- [ ] **Step 2: Start demo UI (Terminal 2)**

```bash
# From monorepo root
pnpm --filter @beacon/demo dev
```

Expected: Vite starts, prints `Local: http://localhost:5173`

- [ ] **Step 3a: Verify layout renders**

Open `http://localhost:5173`. Confirm:
- Left panel shows "Beacon AI Demo" heading, textarea, and Analyze button
- Right panel shows "Submit a ticket to see AI analysis" empty state

- [ ] **Step 3b: Verify analysis pipeline**

Enter body: `"I cannot access my Reap Direct account and I need help urgently"`, click **Analyze**.
- Analyze button changes to "Analyzing..." (loading state)
- Right panel shows Zendesk Garden loading skeleton/dots

- [ ] **Step 3c: Verify IntelligencePanel renders**

Within ~5–10s, right panel renders:
- Urgency badge (P1–P4 with correct color — P1 red, P2 orange, P3 blue, P4 grey)
- Category and confidence percentage
- Draft response textarea with content
- At least one KB article reference card
- **Insert Draft** button visible

- [ ] **Step 3d: Verify history and re-select**

Submit a second query. Confirm:
- First query appears in history list on the left
- Clicking it re-displays that result in the right panel (key remount works)

- [ ] **Step 4: Final commit**

```bash
git add .
git commit -m "feat(demo): offline demo complete — split panel UI with local RAG pipeline"
```

---

## Running Summary

```bash
# One-time setup (first run only — embeds 115 articles, ~20s)
export ANTHROPIC_API_KEY=sk-ant-...
export OPENAI_API_KEY=sk-...
export AWS_ACCESS_KEY_ID=demo
export AWS_SECRET_ACCESS_KEY=demo
export AWS_DEFAULT_REGION=us-east-1

# Terminal 1
npx tsx apps/demo-server/src/index.ts

# Terminal 2
pnpm --filter @beacon/demo dev
# → http://localhost:5173
```

Index is cached in `.beacon-demo-index/` — subsequent server restarts are instant.
