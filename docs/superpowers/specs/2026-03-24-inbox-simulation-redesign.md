# Beacon Demo — Inbox & Simulation Redesign

**Date:** 2026-03-24
**Status:** Approved
**Scope:** `apps/demo` (React frontend) + one small change to `apps/demo-server`

---

## Overview

Redesign the Beacon demo app from a submit-and-inspect tool into a live inbox that aggregates tickets, auto-triages them visibly, and supports a flood simulation. The input form moves into a modal. The selected ticket shows a split view: email thread (top) + Beacon analysis sidebar (bottom).

---

## Layout

Two-column shell replacing the current three-column layout:

- **Header** (48px, full-width): Beacon logo + "demo" label | center: simulation controls (speed preset selector + Start/Stop button + live counter "X tickets · Y processing") | right: "New Ticket" button + theme toggle + Dashboard link
- **Left column** (280px, fixed): Full-height inbox list. Scrollable. `inbox` is stored newest-first (prepend on add). Each row shows subject, sender, time, and — once triaged — urgency badge, category, routing badge, sentiment dot. Processing rows show a shimmer animation on the badge area (use `shimmerFrom`/`shimmerTo` tokens + `@keyframes shimmer` gradient-shift, same pattern already in `DemoApp.tsx`) plus a spinner icon.
- **Right column** (flex): Split vertically. Top ~45% = `TicketThread`. Bottom ~55% = `AnalysisView` or `AnalysisProgress` depending on ticket status. Both halves scroll independently. When no ticket is selected, right column shows `EmptyState` with updated copy: "Select a ticket from the inbox to see Beacon's analysis." All inbox tickets (including `sent` and `escalated`) are selectable and show their `AnalysisView`.

---

## demo-server Change

`POST /analyze` currently returns `{ ticketId }`. Change it to also return the classification inline:

```ts
return c.json({
  ticketId,
  classification: {
    category: payload.classification.category,
    urgency: payload.classification.urgency,
    sentiment: payload.classification.sentiment,   // field is 'sentiment' per ClassificationSchema
    routing: (payload.responseDraft as { routing?: string })?.routing ?? 'agent_assisted',
  }
});
```

`AnalysisView` still fetches the full `SidebarPayload` via `GET /context/:ticketId` for display — this change only adds data to the POST response.

---

## Data Model

`QueryEntry` and `QueryEntryAnalysis` (in `InputPanel.tsx`) remain unchanged. `InboxTicket` extends `QueryEntry`. Both types are exported from `inbox-data.ts` (which re-exports `QueryEntryAnalysis` from `InputPanel.tsx` to keep consumers to a single import):

```ts
// Existing — unchanged, stays in InputPanel.tsx
export interface QueryEntryAnalysis {
  category: string;
  urgency: 'P1' | 'P2' | 'P3' | 'P4';
  sentiment: number;
  routing: 'auto_send' | 'agent_assisted' | 'escalate';
}

export interface QueryEntry {
  ticketId: string;
  subject: string;
  body: string;
  submittedAt: string;
  analysis?: QueryEntryAnalysis;
}

// New — in inbox-data.ts
export interface InboxTicket extends QueryEntry {
  from: string;           // e.g. "alice@reapfintech.hk"
  status: 'processing' | 'triaged' | 'sent' | 'escalated';
}
```

**Routing → status mapping** (in `DemoApp`, function `routingToStatus`):
- `auto_send` → `sent`
- `escalate` → `escalated`
- anything else → `triaged`

---

## Ticket ID Strategy

The client generates a temporary placeholder ID (`tmpId = \`tmp-${Date.now()}-${Math.random().toString(36).slice(2)}\``) when a ticket enters the inbox. When `POST /analyze` resolves, the server-assigned `ticketId` replaces the `tmpId` in the inbox entry.

If the ticket was selected at the time of resolution (`selectedTicketId === tmpId`), `setSelectedTicketId` is also updated to the server `ticketId`. The `useEffect` on `selectedTicketId` then fires `setTicketId(selectedTicketId)`, keeping `AnalysisView` in sync.

---

## `DemoApp` State & Shared `analyzeTicket` Helper

```ts
const [inbox, setInbox] = useState<InboxTicket[]>([]);
const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
const [simRunning, setSimRunning] = useState(false);
const [simSpeed, setSimSpeed] = useState<'slow' | 'med' | 'fast'>('med');
const [modalOpen, setModalOpen] = useState(false);
```

**Header counter:** `X = inbox.length`, `Y = inbox.filter(t => t.status === 'processing').length`.

**No inbox size cap.** At demo speeds, inbox growth is intentional and visible — no limit needed.

### ZAF `setTicketId` wiring

```ts
useEffect(() => {
  if (selectedTicketId) setTicketId(selectedTicketId);
}, [selectedTicketId]);
```

### `analyzeTicket` helper

Single async function used by all three call sites (seed init, simulation, modal). All tickets enter the inbox as `status: 'processing'` — including seeds. This means the app opens with ~12 processing tickets that resolve within seconds to their intended statuses, which is a compelling demo opening.

**Caller contract:** The caller is responsible for generating a unique temporary `ticketId` and setting it on the `InboxTicket` before passing it to `analyzeTicket`. The function uses `ticket.ticketId` as the key to match the inbox entry for update.

```ts
async function analyzeTicket(ticket: InboxTicket): Promise<void> {
  const tmpId = ticket.ticketId; // set by caller — e.g. `tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`
  setInbox(prev => [{ ...ticket, ticketId: tmpId, status: 'processing' }, ...prev]);
  try {
    const res = await fetch(`${API_URL}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject: ticket.subject, body: ticket.body }),
    });
    if (!res.ok) throw new Error(`${res.status}`);
    const { ticketId: serverId, classification } = await res.json();
    const status = routingToStatus(classification.routing);
    setInbox(prev => prev.map(t =>
      t.ticketId === tmpId ? { ...t, ticketId: serverId, status, analysis: classification } : t
    ));
    // if this ticket was selected, follow the server ID
    setSelectedTicketId(prev => prev === tmpId ? serverId : prev);
  } catch {
    // on error, leave as processing (or optionally mark with an error state — out of scope)
  }
}
```

### Seed initialization

`useEffect(() => { SEED_TICKETS.forEach(t => analyzeTicket(t)); }, [])` — fires once on mount. All ~12 seeds start as `processing` and resolve to their intended statuses. Seeds are defined in `inbox-data.ts` with realistic placeholder `ticketId` values (e.g. `seed-001`) that get replaced by server IDs on resolve. `submittedAt` values are hardcoded as realistic past timestamps (e.g. `new Date(Date.now() - 5 * 60000).toISOString()` for "5 minutes ago").

### `onAnalysisReady` — simplified

`AnalysisView` calls `onAnalysisReady(ticketId, analysis)` when it finishes polling. Since `analyzeTicket` already sets `analysis` on the inbox entry, this callback only needs to handle the case where AnalysisView provides richer data than the inline classification:

```ts
function handleAnalysisReady(ticketId: string, analysis: QueryEntryAnalysis) {
  setInbox(prev => prev.map(t =>
    t.ticketId === ticketId ? { ...t, analysis } : t
  ));
}
```

No guard needed — `analysis` is always safe to overwrite with AnalysisView's result (it's at least as fresh).

---

## Simulation Engine

### `useSimulation` hook

```ts
function useSimulation(options: {
  speed: 'slow' | 'med' | 'fast';
  isRunning: boolean;
  onTick: (ticket: InboxTicket) => void;
}): void
```

The hook calls `onTick` each interval with a new ticket (status `processing`, tmp `ticketId`, current `submittedAt`). `DemoApp`'s `onTick` handler calls `analyzeTicket(ticket)`. The hook does not fire fetches directly.

**Speed presets:**
| Preset | Arrival rate |
|--------|-------------|
| Slow   | 1 ticket / 8s |
| Med    | 1 ticket / 3s |
| Fast   | 1 ticket / 1s |

**Speed change while running:** `useEffect` on `[speed, isRunning]` clears and restarts the interval — new rate takes effect on the next tick.

**Stop behaviour:** Clears the interval. In-flight `analyzeTicket` calls resolve naturally.

**Tick logic:** Index ref cycles through `SIM_TICKETS`. Each tick: take `entry = SIM_TICKETS[index % SIM_TICKETS.length]`, then build a full `InboxTicket` with `ticketId: \`sim-${Date.now()}\``, `submittedAt: new Date().toISOString()`, `status: 'processing'`, and carry `subject`, `body`, and `from` directly from the pool entry.

### `SIM_TICKETS` pool

~20 entries in `inbox-data.ts`. Start from the 5 existing `EXAMPLES` in `InputPanel.tsx`, add variations to cover all 8 categories. Each entry must include `subject`, `body`, and `from` (realistic HK business email address, e.g. `"james.lau@hklogistics.com"`). `ticketId` and `submittedAt` are generated at tick time and must not be set on pool entries.

`SEED_TICKETS` entries must also include `from` — use 6–8 distinct realistic HK business email addresses, with some repeated to simulate returning customers.

---

## New Ticket Modal (`NewTicketModal`)

Triggered by "New Ticket" in header. Full-screen overlay (backdrop blur + dark scrim), centered card (~520px wide).

**Contents:**
- Header: "New Ticket" title + X close button
- Examples row: same `EXAMPLES` pill buttons — clicking pre-fills subject + body
- Subject input (optional)
- Body textarea (required)
- Footer: Cancel + Analyze (primary) buttons

**Submit behaviour:**
1. Validate body non-empty; show inline error if empty
2. Build `InboxTicket` with tmp `ticketId`, `from: 'agent@demo.local'`, `status: 'processing'`
3. Close modal immediately
4. Call `analyzeTicket(ticket)` — ticket appears in inbox as processing, resolves in background

No in-flight spinner on the modal — it closes instantly on submit and the ticket's progress is visible in the inbox.

**Escape / backdrop click:** Close without submitting.

**Implementation:** Extract `TicketForm` (fields + examples) from `InputPanel`. `NewTicketModal` wraps it. `InputPanel` is deleted once `TicketForm` is extracted.

---

## Ticket Thread View (`TicketThread`)

```ts
interface TicketThreadProps {
  ticket: InboxTicket;
  T: Tokens;  // Tokens type from DemoApp.tsx
}
```

- **Thread header**: Subject (bold, ~18px) + `from` address + timestamp formatted as:
  ```ts
  new Intl.DateTimeFormat('en-GB', {
    day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'Asia/Hong_Kong',
  }).format(new Date(ticket.submittedAt))
  // → "24 Mar, 14:32"
  ```
- **Status banner** (thin strip, conditional):
  - `sent`: green background — "Auto-sent by Beacon"
  - `escalated`: red background — "Escalated to Tier 2"
  - `processing` / `triaged`: no banner
- **Message bubble**: Light card, avatar initial circle (left), sender name above, ticket body in bubble

**Right panel bottom half (rendered in `DemoApp`):**

Always derive the selected ticket's current status from a live lookup: `const selectedTicket = inbox.find(t => t.ticketId === selectedTicketId)`. Do not snapshot status in a separate state variable — this ensures the bottom panel re-renders reactively when a processing ticket resolves.

- `selectedTicket.status === 'processing'` → `<AnalysisProgress T={T} />`
- all other statuses → `<AnalysisView key={selectedTicket.ticketId} ticketId={selectedTicket.ticketId} theme={theme} subject={selectedTicket.subject} body={selectedTicket.body} onAnalysisReady={handleAnalysisReady} />`

---

## Component Change Summary

| Component | Change |
|-----------|--------|
| `DemoApp` | New 2-col layout; `inbox: InboxTicket[]`; `analyzeTicket` helper; `setTicketId` effect; mounts `useSimulation` |
| `InputPanel` | Refactored into `TicketForm` then deleted |
| New: `TicketForm` | Form fields + examples, used by `NewTicketModal` |
| New: `NewTicketModal` | Overlay shell, closes on submit, calls `analyzeTicket` |
| `QueueView` → `InboxList` | Renamed; `inbox: InboxTicket[]` prop; shimmer on processing rows; status icons |
| New: `TicketThread` | Email thread + status banner |
| `AnalysisProgress` | Unchanged; reused in right panel for processing tickets |
| `AnalysisView` | Unchanged; bottom-right panel |
| New: `inbox-data.ts` | `InboxTicket` type, `SEED_TICKETS`, `SIM_TICKETS` |
| New: `useSimulation.ts` | Tick hook, speed presets, calls `onTick` |
| `DashboardPage` | Unchanged |
| `demo-server /analyze` | Return `classification` inline alongside `ticketId` |

---

## Out of Scope

- Persistent storage — resets on page reload
- Real email parsing — `from` is hardcoded per ticket
- Reply / send UI — status flip only, no send button
- Mobile layout
- Error state for failed `/analyze` calls — ticket stays as `processing` indefinitely
