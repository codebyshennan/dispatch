# Inbox & Simulation Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the Beacon demo app into a live inbox with pre-seeded tickets, auto-triage visualization, configurable flood simulation, and a New Ticket modal — using a two-column layout with an email thread + analysis split view.

**Architecture:** All ticket state lives in `DemoApp` as `InboxTicket[]`. A shared `analyzeTicket` helper fires `POST /analyze` and handles the tmp-ID-to-server-ID swap. A `useSimulation` hook calls `analyzeTicket` on a configurable interval. The demo-server gains one small response field (`classification`) to avoid polling just for routing data. `AnalysisView` is unchanged — it still polls `GET /context/:ticketId`.

**Tech Stack:** React 18, TypeScript, Hono (demo-server), Vite, inline styles (no CSS framework), existing `@beacon/core` types.

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `apps/demo-server/src/index.ts` | Return `classification` inline from `POST /analyze` |
| Create | `apps/demo/src/inbox-data.ts` | `InboxTicket` type, re-exports `QueryEntry`/`QueryEntryAnalysis`, `SEED_TICKETS`, `SIM_TICKETS` |
| Create | `apps/demo/src/useSimulation.ts` | Tick-based hook, speed presets, calls `onTick` |
| Create | `apps/demo/src/InboxList.tsx` | Left-column inbox list (replaces `QueueView` in `DemoApp.tsx`) |
| Create | `apps/demo/src/TicketThread.tsx` | Top-half email thread view with status banner |
| Create | `apps/demo/src/TicketForm.tsx` | Form fields + examples row (extracted from `InputPanel`) |
| Create | `apps/demo/src/NewTicketModal.tsx` | Full-screen overlay wrapping `TicketForm` |
| Modify | `apps/demo/src/DemoApp.tsx` | New 2-col layout, new state, `analyzeTicket` helper, wire all components |
| Delete | `apps/demo/src/InputPanel.tsx` | Replaced by `TicketForm` + `NewTicketModal`; types move to `inbox-data.ts` |

---

## Task 1: demo-server — return `classification` inline from `POST /analyze`

**Files:**
- Modify: `apps/demo-server/src/index.ts:31-47`

This is the only server change. `POST /analyze` already runs the full pipeline synchronously; we just surface the classification in the response so `analyzeTicket` on the client can update the inbox without a second fetch.

- [ ] **Step 1: Open `apps/demo-server/src/index.ts` and find the `POST /analyze` handler (line ~31)**

The current last line is:
```ts
return c.json({ ticketId });
```

- [ ] **Step 2: Replace that return with the extended response**

```ts
return c.json({
  ticketId,
  classification: {
    category: payload.classification.category,
    urgency:  payload.classification.urgency,
    sentiment: payload.classification.sentiment,
    routing: (payload.responseDraft as { routing?: string })?.routing ?? 'agent_assisted',
  },
});
```

Note: `payload.classification` is the `Classification` object from `@beacon/core`. Its field names are `category`, `urgency`, `sentiment` (a number −1 to 1) — confirmed against `packages/core/src/schemas/index.ts`.

- [ ] **Step 3: Verify the server still starts**

```bash
cd apps/demo-server && pnpm dev
```

Expected: server starts on port 3001, no TypeScript errors.

- [ ] **Step 4: Smoke-test the endpoint**

```bash
curl -s -X POST http://localhost:3001/analyze \
  -H "Content-Type: application/json" \
  -d '{"subject":"test","body":"I need help with my card"}' | jq .
```

Expected: response contains both `ticketId` (string) and `classification` object with `category`, `urgency`, `sentiment`, `routing`.

- [ ] **Step 5: Commit**

```bash
git add apps/demo-server/src/index.ts
git commit -m "feat(demo-server): return classification inline from POST /analyze"
```

---

## Task 2: `inbox-data.ts` — types, seed tickets, simulation pool

**Files:**
- Create: `apps/demo/src/inbox-data.ts`

This file owns the data layer. It re-exports `QueryEntry`/`QueryEntryAnalysis` from `InputPanel.tsx` (which still exists at this point) so consumers can import from one place, and defines `InboxTicket`, `SEED_TICKETS`, and `SIM_TICKETS`.

- [ ] **Step 1: Create `apps/demo/src/inbox-data.ts`**

```ts
// Re-export existing types so consumers don't need to import from InputPanel
export type { QueryEntry, QueryEntryAnalysis } from './InputPanel';

// ── InboxTicket ───────────────────────────────────────────────────────────────
export interface InboxTicket {
  ticketId: string;
  subject: string;
  body: string;
  from: string;
  submittedAt: string;
  status: 'processing' | 'triaged' | 'sent' | 'escalated';
  analysis?: {
    category: string;
    urgency: 'P1' | 'P2' | 'P3' | 'P4';
    sentiment: number;
    routing: 'auto_send' | 'agent_assisted' | 'escalate';
  };
}

// ── Sim pool entry (ticketId and submittedAt generated at tick time) ──────────
export interface SimTicketEntry {
  subject: string;
  body: string;
  from: string;
}

// ── SEED_TICKETS (~12 entries, all start as processing on mount) ──────────────
// submittedAt values are realistic past timestamps (spread over last 2 hours)
const now = Date.now();
const ago = (ms: number) => new Date(now - ms).toISOString();

export const SEED_TICKETS: InboxTicket[] = [
  {
    ticketId: 'seed-001',
    subject: 'Urgent: freeze my Reap card immediately',
    body: "I just lost my physical card at the airport and I'm worried about unauthorized charges. My card ends in 4821. Please freeze it now.",
    from: 'james.wong@globallogistics.hk',
    submittedAt: ago(7 * 60000),
    status: 'processing',
  },
  {
    ticketId: 'seed-002',
    subject: 'KYC verification stuck for 3 days',
    body: 'I submitted my KYC documents 3 days ago and my account is still under review. I need to make business payments urgently. Can you tell me the status?',
    from: 'sarah.chen@hkfintech.com',
    submittedAt: ago(15 * 60000),
    status: 'processing',
  },
  {
    ticketId: 'seed-003',
    subject: 'Unauthorized transaction — HKD 8,400',
    body: "There's a charge of HKD 8,400 on 21 March from 'INTL TECH SVC'. I did not authorize this and want to dispute it.",
    from: 'michael.patel@reapfintech.hk',
    submittedAt: ago(22 * 60000),
    status: 'processing',
  },
  {
    ticketId: 'seed-004',
    subject: 'Question about USD to SGD FX rates',
    body: 'I need to transfer USD 50,000 to a supplier in Singapore. What is your current rate and are there any fees?',
    from: 'alice.lam@hklogistics.com',
    submittedAt: ago(35 * 60000),
    status: 'processing',
  },
  {
    ticketId: 'seed-005',
    subject: 'Formal complaint — threatening legal action',
    body: 'I have been waiting 2 weeks for my refund. I am contacting my solicitor and filing a complaint with the SFC if this is not resolved today.',
    from: 'james.wong@globallogistics.hk',
    submittedAt: ago(48 * 60000),
    status: 'processing',
  },
  {
    ticketId: 'seed-006',
    subject: 'Account locked after failed login attempts',
    body: 'My account has been locked. I tried to log in several times and now I cannot access it. Please help me unlock it.',
    from: 'priya.nair@hkfintech.com',
    submittedAt: ago(55 * 60000),
    status: 'processing',
  },
  {
    ticketId: 'seed-007',
    subject: 'Stablecoin transfer confirmation delayed',
    body: 'I sent USDC to an external wallet 2 hours ago and it has not arrived. The transaction hash is 0xabc123. Can you check the status?',
    from: 'david.ng@reapfintech.hk',
    submittedAt: ago(63 * 60000),
    status: 'processing',
  },
  {
    ticketId: 'seed-008',
    subject: 'General question about virtual card limits',
    body: 'What is the maximum daily spend limit for virtual cards on the business plan? I need to make a large vendor payment.',
    from: 'alice.lam@hklogistics.com',
    submittedAt: ago(75 * 60000),
    status: 'processing',
  },
  {
    ticketId: 'seed-009',
    subject: 'Cannot add new team member to account',
    body: 'I am trying to invite a new finance team member but the invite button is greyed out. We are on the Pro plan. Is this a known issue?',
    from: 'sarah.chen@hkfintech.com',
    submittedAt: ago(88 * 60000),
    status: 'processing',
  },
  {
    ticketId: 'seed-010',
    subject: 'EUR payment failed — supplier urgent',
    body: 'My EUR wire to a German supplier failed this morning. Error code: IBAN_INVALID. The IBAN I have is DE89370400440532013000. Is it correct?',
    from: 'michael.patel@reapfintech.hk',
    submittedAt: ago(100 * 60000),
    status: 'processing',
  },
  {
    ticketId: 'seed-011',
    subject: 'Request for transaction history export',
    body: 'I need a full CSV export of all transactions from January to March 2026 for our annual audit. How do I download this?',
    from: 'priya.nair@hkfintech.com',
    submittedAt: ago(112 * 60000),
    status: 'processing',
  },
  {
    ticketId: 'seed-012',
    subject: 'Card declined at overseas merchant',
    body: 'My Reap card was declined at a hotel in Tokyo yesterday even though I have sufficient balance. Is there a restriction on overseas transactions?',
    from: 'david.ng@reapfintech.hk',
    submittedAt: ago(120 * 60000),
    status: 'processing',
  },
];

// ── SIM_TICKETS pool (~20 entries, ticketId and submittedAt generated at tick) ─
export const SIM_TICKETS: SimTicketEntry[] = [
  {
    subject: 'Urgent: freeze my Reap card',
    body: 'I dropped my wallet on the MTR. Please freeze card ending 7734 immediately.',
    from: 'kevin.leung@hklogistics.com',
  },
  {
    subject: 'KYC documents submitted — no response',
    body: 'I uploaded my passport and proof of address 5 days ago. My account is still restricted. Please advise.',
    from: 'wendy.ho@fintech-hk.com',
  },
  {
    subject: 'Suspicious charge on my account',
    body: 'I see a charge of HKD 2,200 from ONLINE STORE on 23 March that I did not make. Please investigate and issue a refund.',
    from: 'raymond.chan@reapfintech.hk',
  },
  {
    subject: 'FX rate for JPY transfer',
    body: 'What is your HKD to JPY rate today? I need to pay a supplier in Japan approximately HKD 100,000.',
    from: 'julia.tam@globalcorp.hk',
  },
  {
    subject: 'Threatening to escalate to regulator',
    body: 'This is my third complaint. My account has been suspended without explanation for 10 days. I am now contacting the HKMA.',
    from: 'kevin.leung@hklogistics.com',
  },
  {
    subject: 'Virtual card not working online',
    body: 'My virtual card keeps getting declined for online purchases. Physical card works fine. I have tried 3 different merchants.',
    from: 'wendy.ho@fintech-hk.com',
  },
  {
    subject: 'USDT withdrawal pending for 4 hours',
    body: 'I initiated a USDT withdrawal 4 hours ago and it is still showing pending. Amount: 10,000 USDT. TX reference: TXN-9921.',
    from: 'raymond.chan@reapfintech.hk',
  },
  {
    subject: 'How do I upgrade to the Enterprise plan?',
    body: 'We are a team of 15 and need to upgrade from Business to Enterprise. What is the pricing and process?',
    from: 'julia.tam@globalcorp.hk',
  },
  {
    subject: 'Duplicate transaction on statement',
    body: 'I see the same HKD 3,500 charge from CLOUD SERVICES appearing twice on 20 March. I only made one payment.',
    from: 'ben.yeung@hkfintech.com',
  },
  {
    subject: 'Card expired — replacement not received',
    body: 'My card expired last week and I have not received a replacement. I need it urgently for business travel next Monday.',
    from: 'cynthia.wu@reapfintech.hk',
  },
  {
    subject: 'GBP wire returned — reason unknown',
    body: 'A GBP 15,000 wire to a UK supplier was returned today. No reason given in the notification. Can you investigate?',
    from: 'ben.yeung@hkfintech.com',
  },
  {
    subject: 'Two-factor authentication not working',
    body: 'I am not receiving SMS OTP codes when logging in. I have tried multiple times. My phone number is +852 9xxx.',
    from: 'cynthia.wu@reapfintech.hk',
  },
  {
    subject: 'Refund not received after 14 days',
    body: 'I returned goods to a merchant on 10 March and the refund of HKD 6,800 has still not appeared on my account.',
    from: 'kevin.leung@hklogistics.com',
  },
  {
    subject: 'Request for formal invoice',
    body: 'I need a formal VAT invoice for our subscription fees paid in Q1 2026 for accounting purposes. How do I request this?',
    from: 'wendy.ho@fintech-hk.com',
  },
  {
    subject: 'Account access denied — compliance hold',
    body: 'I received an email saying my account is under a compliance review. I have been unable to access it for 3 days.',
    from: 'raymond.chan@reapfintech.hk',
  },
  {
    subject: 'USD receiving account details',
    body: 'I need to share USD receiving bank details with a US client. Where do I find the routing number and account number?',
    from: 'julia.tam@globalcorp.hk',
  },
  {
    subject: 'Card spend limit increase request',
    body: 'Our monthly card spend is approaching the limit. We need to increase it from HKD 500,000 to HKD 1,000,000 for next month.',
    from: 'ben.yeung@hkfintech.com',
  },
  {
    subject: 'ETH transfer not confirming',
    body: 'I sent 2.5 ETH from my Reap wallet 6 hours ago. The recipient says they have not received it. TX hash: 0xdef456.',
    from: 'cynthia.wu@reapfintech.hk',
  },
  {
    subject: 'Wrong currency charged on hotel stay',
    body: 'I was charged in USD instead of HKD for a hotel in Hong Kong. This resulted in an unfavourable FX conversion. I want a refund of the difference.',
    from: 'kevin.leung@hklogistics.com',
  },
  {
    subject: 'Payroll batch failed overnight',
    body: 'Our scheduled payroll batch for 47 employees failed last night. The error message says INSUFFICIENT_FUNDS but our balance is HKD 2.3M.',
    from: 'wendy.ho@fintech-hk.com',
  },
];
```

- [ ] **Step 2: Verify TypeScript compiles cleanly**

```bash
cd /path/to/beacon && pnpm typecheck 2>&1 | grep "apps/demo/src/inbox-data"
```

Expected: no errors on this file.

- [ ] **Step 3: Commit**

```bash
git add apps/demo/src/inbox-data.ts
git commit -m "feat(demo): add InboxTicket type, SEED_TICKETS, and SIM_TICKETS pool"
```

---

## Task 3: `useSimulation.ts` — tick hook

**Files:**
- Create: `apps/demo/src/useSimulation.ts`

The hook manages the interval. It does not fire fetches. `DemoApp`'s `onTick` calls `analyzeTicket`.

- [ ] **Step 1: Create `apps/demo/src/useSimulation.ts`**

```ts
import { useEffect, useRef } from 'react';
import type { InboxTicket, SimTicketEntry } from './inbox-data';
import { SIM_TICKETS } from './inbox-data';

const INTERVALS: Record<'slow' | 'med' | 'fast', number> = {
  slow: 8000,
  med:  3000,
  fast: 1000,
};

export function useSimulation({
  speed,
  isRunning,
  onTick,
}: {
  speed: 'slow' | 'med' | 'fast';
  isRunning: boolean;
  onTick: (ticket: InboxTicket) => void;
}): void {
  const indexRef = useRef(0);
  // Stable ref so the interval closure always calls the latest onTick
  const onTickRef = useRef(onTick);
  useEffect(() => { onTickRef.current = onTick; });

  useEffect(() => {
    if (!isRunning) return;

    const id = setInterval(() => {
      const entry: SimTicketEntry = SIM_TICKETS[indexRef.current % SIM_TICKETS.length];
      indexRef.current += 1;

      const ticket: InboxTicket = {
        ticketId: `sim-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        subject: entry.subject,
        body: entry.body,
        from: entry.from,
        submittedAt: new Date().toISOString(),
        status: 'processing',
      };
      onTickRef.current(ticket);
    }, INTERVALS[speed]);

    return () => clearInterval(id);
  }, [speed, isRunning]);
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /path/to/beacon && pnpm typecheck 2>&1 | grep "apps/demo/src/useSimulation"
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/demo/src/useSimulation.ts
git commit -m "feat(demo): add useSimulation hook with slow/med/fast presets"
```

---

## Task 4: `InboxList.tsx` — inbox list component

**Files:**
- Create: `apps/demo/src/InboxList.tsx`

This is an evolution of `QueueView` in `DemoApp.tsx`. It handles the full left column: ticket rows with badges, processing shimmer, and status icons.

- [ ] **Step 1: Create `apps/demo/src/InboxList.tsx`**

```tsx
import React from 'react';
import type { InboxTicket } from './inbox-data';
import type { Tokens } from './DemoApp';
import { DARK } from './DemoApp';

// ── Helpers ───────────────────────────────────────────────────────────────────

function sentimentColor(score: number): string {
  if (score < -0.5) return '#dc2626';
  if (score < -0.2) return '#f59e0b';
  if (score <  0.2) return '#64748b';
  if (score <  0.5) return '#3b82f6';
  return '#22c55e';
}

const URGENCY_COLOR: Record<string, string> = {
  P1: '#dc2626', P2: '#f59e0b', P3: '#3b82f6', P4: '#64748b',
};

const ROUTING_META: Record<string, { label: string; darkColor: string; lightColor: string; bg: string }> = {
  auto_send:      { label: 'Auto Send',      darkColor: '#4ade80', lightColor: '#166534', bg: 'rgba(34,197,94,0.12)' },
  agent_assisted: { label: 'Agent Assisted', darkColor: '#60a5fa', lightColor: '#1e40af', bg: 'rgba(59,130,246,0.12)' },
  escalate:       { label: 'Escalate',       darkColor: '#f87171', lightColor: '#991b1b', bg: 'rgba(220,38,38,0.12)' },
};

const STATUS_ICON: Record<'sent' | 'escalated', { icon: string; color: string }> = {
  sent:      { icon: '✓', color: '#22c55e' },
  escalated: { icon: '↑', color: '#ef4444' },
};

function categoryLabel(cat: string): string {
  const map: Record<string, string> = {
    card_freeze: 'Card Freeze', kyc: 'KYC',
    transaction_dispute: 'Dispute', fx_inquiry: 'FX / Payments',
    legal_complaint: 'Legal', general_inquiry: 'General',
    account_issue: 'Account', stablecoin: 'Stablecoin',
  };
  return map[cat] ?? cat.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// ── Shimmer row (processing state) ────────────────────────────────────────────

function ShimmerBadges({ T }: { T: Tokens }) {
  return (
    <>
      <style>{`
        @keyframes shimmer {
          0%   { background-position: -200px 0; }
          100% { background-position: 200px 0; }
        }
      `}</style>
      <div style={{ display: 'flex', gap: 4, marginBottom: 5 }}>
        {[40, 60, 50].map((w, i) => (
          <div key={i} style={{
            height: 16, width: w, borderRadius: 3,
            background: `linear-gradient(90deg, ${T.shimmerFrom} 25%, ${T.shimmerTo} 50%, ${T.shimmerFrom} 75%)`,
            backgroundSize: '200px 100%',
            animation: 'shimmer 1.4s infinite linear',
          }} />
        ))}
      </div>
    </>
  );
}

// ── Spinner SVG ───────────────────────────────────────────────────────────────

function MiniSpinner({ color }: { color: string }) {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" style={{ animation: 'spin 0.9s linear infinite', flexShrink: 0 }} aria-hidden="true">
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <circle cx="12" cy="12" r="10" stroke={color} strokeWidth="3" strokeDasharray="40 20" opacity="0.3" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke={color} strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

// ── InboxList ─────────────────────────────────────────────────────────────────

interface InboxListProps {
  inbox: InboxTicket[];
  selectedTicketId: string | null;
  T: Tokens;
  onSelect: (ticket: InboxTicket) => void;
}

export function InboxList({ inbox, selectedTicketId, T, onSelect }: InboxListProps) {
  const isDark = T === DARK;

  if (inbox.length === 0) {
    return (
      <div style={{ padding: '48px 16px', textAlign: 'center', color: T.muted, fontSize: 13 }}>
        No tickets yet. Start the simulation or add a new ticket.
      </div>
    );
  }

  return (
    <div style={{ padding: '4px 0' }}>
      {inbox.map((ticket) => {
        const isSelected = ticket.ticketId === selectedTicketId;
        const a = ticket.analysis;
        const routing = a ? ROUTING_META[a.routing] : null;
        const statusIcon = (ticket.status === 'sent' || ticket.status === 'escalated')
          ? STATUS_ICON[ticket.status]
          : null;

        return (
          <button
            key={ticket.ticketId}
            onClick={() => onSelect(ticket)}
            style={{
              display: 'block', width: '100%', textAlign: 'left',
              padding: '10px 14px',
              background: isSelected ? (isDark ? '#1D3461' : '#EFF6FF') : 'transparent',
              border: 'none',
              borderBottom: `1px solid ${T.border}`,
              borderLeft: `3px solid ${isSelected ? '#3B82F6' : 'transparent'}`,
              cursor: 'pointer', fontFamily: T.fontBody,
              transition: 'background 0.15s ease',
            }}
          >
            {/* Row 1: subject + time + status icon */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                {ticket.subject}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                {statusIcon && (
                  <span style={{ fontSize: 11, fontWeight: 700, color: statusIcon.color }}>{statusIcon.icon}</span>
                )}
                {ticket.status === 'processing' && <MiniSpinner color={T.muted} />}
                <span style={{ fontSize: 11, color: T.muted, fontFamily: T.fontMono }}>
                  {new Date(ticket.submittedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            </div>

            {/* Row 2: sender */}
            <div style={{ fontSize: 11, color: T.muted, marginBottom: 5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {ticket.from}
            </div>

            {/* Row 3: badges or shimmer */}
            {ticket.status === 'processing'
              ? <ShimmerBadges T={T} />
              : a && routing && (
                <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap', marginBottom: 4 }}>
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: '1px 5px', borderRadius: 3,
                    background: `${URGENCY_COLOR[a.urgency]}22`, color: URGENCY_COLOR[a.urgency],
                  }}>{a.urgency}</span>
                  <span style={{
                    fontSize: 10, fontWeight: 500, padding: '1px 5px', borderRadius: 3,
                    background: isDark ? 'rgba(100,116,139,0.15)' : 'rgba(100,116,139,0.1)',
                    color: T.muted,
                  }}>{categoryLabel(a.category)}</span>
                  <span style={{
                    fontSize: 10, fontWeight: 600, padding: '1px 5px', borderRadius: 3,
                    background: routing.bg,
                    color: isDark ? routing.darkColor : routing.lightColor,
                  }}>{routing.label}</span>
                  <span style={{
                    display: 'inline-block', width: 6, height: 6, borderRadius: '50%',
                    background: sentimentColor(a.sentiment),
                    boxShadow: `0 0 4px ${sentimentColor(a.sentiment)}`,
                    marginLeft: 2, flexShrink: 0,
                  }} />
                </div>
              )
            }

            {/* Row 4: body snippet */}
            <div style={{ fontSize: 12, color: T.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {ticket.body.slice(0, 80)}
            </div>
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd /path/to/beacon && pnpm typecheck 2>&1 | grep "apps/demo/src/InboxList"
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/demo/src/InboxList.tsx
git commit -m "feat(demo): add InboxList component with processing shimmer and status icons"
```

---

## Task 5: `TicketThread.tsx` — email thread view

**Files:**
- Create: `apps/demo/src/TicketThread.tsx`

Renders the top half of the right panel when a ticket is selected.

- [ ] **Step 1: Create `apps/demo/src/TicketThread.tsx`**

```tsx
import React from 'react';
import type { InboxTicket } from './inbox-data';
import type { Tokens } from './DemoApp';

function formatTimestamp(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Hong_Kong',
  }).format(new Date(iso));
}

function avatarInitial(from: string): string {
  const name = from.split('@')[0].replace(/[._-]/g, ' ');
  return name.trim()[0]?.toUpperCase() ?? '?';
}

interface TicketThreadProps {
  ticket: InboxTicket;
  T: Tokens;
}

export function TicketThread({ ticket, T }: TicketThreadProps) {
  const senderName = ticket.from.split('@')[0].replace(/[._-]/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());

  const bannerStyle = (color: string, bg: string): React.CSSProperties => ({
    padding: '6px 16px',
    background: bg,
    color,
    fontSize: 12,
    fontWeight: 600,
    borderBottom: `1px solid ${color}33`,
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: T.surface }}>

      {/* Thread header */}
      <div style={{ padding: '16px 20px', borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: T.text, marginBottom: 6, lineHeight: 1.3 }}>
          {ticket.subject}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, color: T.muted }}>
          <span style={{ fontWeight: 500, color: T.textSub }}>{ticket.from}</span>
          <span>·</span>
          <span style={{ fontFamily: T.fontMono }}>{formatTimestamp(ticket.submittedAt)}</span>
        </div>
      </div>

      {/* Status banner */}
      {ticket.status === 'sent' && (
        <div style={bannerStyle('#166534', 'rgba(34,197,94,0.08)')}>
          Auto-sent by Beacon
        </div>
      )}
      {ticket.status === 'escalated' && (
        <div style={bannerStyle('#991b1b', 'rgba(220,38,38,0.08)')}>
          Escalated to Tier 2
        </div>
      )}

      {/* Message bubble */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          {/* Avatar */}
          <div style={{
            width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
            background: T.accent, color: '#0F172A',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 14, fontWeight: 700, fontFamily: T.fontBody,
          }}>
            {avatarInitial(ticket.from)}
          </div>

          {/* Bubble */}
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: T.textSub, marginBottom: 8 }}>
              {senderName}
            </div>
            <div style={{
              background: T.elevated,
              border: `1px solid ${T.border}`,
              borderRadius: 12,
              borderTopLeftRadius: 2,
              padding: '12px 16px',
              fontSize: 13,
              color: T.text,
              lineHeight: 1.7,
              whiteSpace: 'pre-wrap',
            }}>
              {ticket.body}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd /path/to/beacon && pnpm typecheck 2>&1 | grep "apps/demo/src/TicketThread"
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/demo/src/TicketThread.tsx
git commit -m "feat(demo): add TicketThread component with status banner and message bubble"
```

---

## Task 6: `TicketForm.tsx` + `NewTicketModal.tsx` — form extraction and modal

**Files:**
- Create: `apps/demo/src/TicketForm.tsx`
- Create: `apps/demo/src/NewTicketModal.tsx`

`TicketForm` is extracted from `InputPanel`. `NewTicketModal` wraps it in the overlay.

- [ ] **Step 1: Create `apps/demo/src/TicketForm.tsx`**

The examples array and form fields, standalone:

```tsx
import React, { useState } from 'react';
import type { Tokens } from './DemoApp';

const EXAMPLES = [
  { label: 'Card freeze',        subject: 'Urgent: freeze my Reap card immediately', body: "I just lost my physical card and I'm worried about unauthorized charges. I need to freeze it right now. My card number ends in 4821. Please help urgently." },
  { label: 'KYC verification',   subject: 'KYC verification stuck for 3 days',        body: "I submitted my KYC documents 3 days ago and my account is still under review. I need to make business payments urgently. Can you tell me the status and how to speed this up?" },
  { label: 'Transaction dispute', subject: 'Unauthorized transaction on my account',   body: "There's a charge of HKD 8,400 on 21 March from a merchant I don't recognize called 'INTL TECH SVC'. I did not authorize this transaction and I want to dispute it and get a refund." },
  { label: 'FX rate question',   subject: 'Question about FX conversion rates',        body: "I need to transfer USD 50,000 to a supplier in Singapore. What is your current USD to SGD rate and are there any fees? How does it compare to the mid-market rate?" },
  { label: 'Legal complaint',    subject: 'Formal complaint — threatening legal action', body: "I have been waiting 2 weeks for my refund and your support team has been useless. I am contacting my solicitor and filing a regulatory complaint with the SFC if this isn't resolved by end of day." },
];

interface TicketFormProps {
  T: Tokens;
  onSubmit: (subject: string, body: string) => void;
  onCancel: () => void;
}

export function TicketForm({ T, onSubmit, onCancel }: TicketFormProps) {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState<string | null>(null);

  const inputBase: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box',
    background: T.bg, border: `1px solid ${T.border}`,
    borderRadius: 6, color: T.text, fontSize: 13,
    fontFamily: T.fontBody, padding: '8px 10px',
    outline: 'none', transition: 'border-color 0.15s ease', lineHeight: 1.5,
  };

  const handleSubmit = () => {
    if (!body.trim()) { setError('Enter a message or ticket body'); return; }
    setError(null);
    onSubmit(subject.trim(), body.trim());
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Examples */}
      <div>
        <div style={{ fontSize: 10, fontFamily: T.fontMono, fontWeight: 600, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>
          Examples
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {EXAMPLES.map(ex => {
            const active = subject === ex.subject;
            return (
              <button
                key={ex.label}
                onClick={() => { setSubject(ex.subject); setBody(ex.body); setError(null); }}
                style={{
                  fontSize: 12, padding: '4px 10px', borderRadius: 20,
                  border: `1px solid ${active ? T.accent : T.border}`,
                  background: active ? 'rgba(34,197,94,0.12)' : T.elevated,
                  color: active ? T.accent : T.textSub,
                  cursor: 'pointer', fontFamily: T.fontBody,
                  fontWeight: active ? 600 : 400, whiteSpace: 'nowrap',
                  transition: 'all 0.15s ease',
                }}
              >
                {ex.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Subject */}
      <div>
        <label htmlFor="modal-subject" style={{ display: 'block', fontSize: 12, fontWeight: 500, color: T.textSub, marginBottom: 6 }}>
          Subject (optional)
        </label>
        <input
          id="modal-subject" value={subject}
          onChange={e => setSubject(e.target.value)}
          placeholder="e.g. Card freeze request"
          onFocus={() => setFocused('subject')} onBlur={() => setFocused(null)}
          style={{
            ...inputBase,
            borderColor: focused === 'subject' ? '#3B82F6' : T.border,
            boxShadow: focused === 'subject' ? '0 0 0 3px rgba(59,130,246,0.12)' : 'none',
          }}
        />
      </div>

      {/* Body */}
      <div>
        <label htmlFor="modal-body" style={{ display: 'block', fontSize: 12, fontWeight: 500, color: T.textSub, marginBottom: 6 }}>
          Message / Ticket body
        </label>
        <textarea
          id="modal-body" value={body} rows={7}
          onChange={e => setBody(e.target.value)}
          placeholder="Paste a customer message or type a support question..."
          onFocus={() => setFocused('body')} onBlur={() => setFocused(null)}
          style={{
            ...inputBase, resize: 'vertical',
            borderColor: focused === 'body' ? '#3B82F6' : T.border,
            boxShadow: focused === 'body' ? '0 0 0 3px rgba(59,130,246,0.12)' : 'none',
          }}
        />
      </div>

      {/* Error */}
      {error && (
        <div style={{ fontSize: 12, color: '#F87171', background: 'rgba(248,113,113,0.08)', border: '1px solid rgba(248,113,113,0.2)', borderRadius: 6, padding: '8px 10px' }}>
          {error}
        </div>
      )}

      {/* Footer */}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button
          onClick={onCancel}
          style={{
            padding: '9px 18px', borderRadius: 8, border: `1px solid ${T.border}`,
            background: 'transparent', color: T.textSub, fontSize: 13,
            fontFamily: T.fontBody, cursor: 'pointer',
          }}
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          style={{
            padding: '9px 18px', borderRadius: 8, border: 'none',
            background: T.accent, color: '#0F172A', fontSize: 13,
            fontWeight: 600, fontFamily: T.fontBody, cursor: 'pointer',
            letterSpacing: '0.02em',
          }}
        >
          Analyze
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `apps/demo/src/NewTicketModal.tsx`**

```tsx
import React, { useEffect } from 'react';
import type { Tokens } from './DemoApp';
import { TicketForm } from './TicketForm';

interface NewTicketModalProps {
  open: boolean;
  T: Tokens;
  onClose: () => void;
  onAnalyze: (subject: string, body: string) => void;
}

export function NewTicketModal({ open, T, onClose, onAnalyze }: NewTicketModalProps) {
  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  const handleSubmit = (subject: string, body: string) => {
    onClose();
    onAnalyze(subject, body);
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 520,
          background: T.surface,
          border: `1px solid ${T.border}`,
          borderRadius: 16,
          overflow: 'hidden',
          boxShadow: '0 24px 64px rgba(0,0,0,0.4)',
        }}
      >
        {/* Modal header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px', borderBottom: `1px solid ${T.border}`,
        }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: T.text, fontFamily: T.fontBody }}>
            New Ticket
          </span>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 28, height: 28, borderRadius: 6,
              border: `1px solid ${T.border}`, background: 'transparent',
              color: T.muted, cursor: 'pointer', fontSize: 16,
            }}
          >
            ✕
          </button>
        </div>

        {/* Form */}
        <div style={{ padding: 20 }}>
          <TicketForm T={T} onSubmit={handleSubmit} onCancel={onClose} />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

```bash
cd /path/to/beacon && pnpm typecheck 2>&1 | grep "apps/demo/src/TicketForm\|apps/demo/src/NewTicketModal"
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/demo/src/TicketForm.tsx apps/demo/src/NewTicketModal.tsx
git commit -m "feat(demo): add TicketForm and NewTicketModal components"
```

---

## Task 7: `DemoApp.tsx` — rewire everything

**Files:**
- Modify: `apps/demo/src/DemoApp.tsx` (full rewrite of the shell)
- Delete: `apps/demo/src/InputPanel.tsx`

This is the final wiring task. All supporting files now exist. We replace the 3-col layout with the 2-col inbox layout, add state + helpers, and mount all new components.

- [ ] **Step 1: Replace `DemoApp.tsx` with the new implementation**

Keep all the token/theme definitions (`DARK`, `LIGHT`, `Tokens`, `Theme`, `BeaconLogo`, `ThemeToggle`, `StatusDot`, `AnalysisProgress`, `EmptyState`) — they are unchanged. Replace everything from the `QueueView` function onward with the new layout.

The full updated `DemoApp.tsx`:

```tsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ClientProvider } from '../../sidebar/src/contexts/ClientProvider';
import { AnalysisView } from './AnalysisView';
import { InboxList } from './InboxList';
import { TicketThread } from './TicketThread';
import { NewTicketModal } from './NewTicketModal';
import { useSimulation } from './useSimulation';
import { SEED_TICKETS, type InboxTicket, type QueryEntryAnalysis } from './inbox-data';
import { setTicketId } from './mock-zaf-client';

// ── Theme tokens (UNCHANGED) ────────────────────────────────────────────────────
export type Theme = 'dark' | 'light';

export interface Tokens {
  bg: string; surface: string; elevated: string; border: string;
  accent: string; accentHover: string; text: string; textSub: string;
  muted: string; shimmerFrom: string; shimmerTo: string;
  fontMono: string; fontBody: string;
}

export const DARK: Tokens = {
  bg: '#020617', surface: '#0F172A', elevated: '#1E293B', border: '#1E293B',
  accent: '#00FBEC', accentHover: '#00DDD0', text: '#F8FAFC', textSub: '#CBD5E1',
  muted: '#64748B', shimmerFrom: '#1E293B', shimmerTo: '#293548',
  fontMono: "'Fira Code', monospace", fontBody: "'Fira Sans', system-ui, sans-serif",
};

export const LIGHT: Tokens = {
  bg: '#F1F5F9', surface: '#FFFFFF', elevated: '#F8FAFC', border: '#E2E8F0',
  accent: '#00857E', accentHover: '#006B65', text: '#0F172A', textSub: '#334155',
  muted: '#94A3B8', shimmerFrom: '#E2E8F0', shimmerTo: '#F1F5F9',
  fontMono: "'Fira Code', monospace", fontBody: "'Fira Sans', system-ui, sans-serif",
};

// ── BeaconLogo (UNCHANGED) ──────────────────────────────────────────────────────
function BeaconLogo({ accent }: { accent: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="3" fill={accent} />
      <path d="M12 2v4M12 18v4M2 12h4M18 12h4" stroke={accent} strokeWidth="2" strokeLinecap="round" opacity="0.6" />
      <path d="M5.636 5.636l2.828 2.828M15.536 15.536l2.828 2.828M5.636 18.364l2.828-2.828M15.536 8.464l2.828-2.828"
        stroke={accent} strokeWidth="1.5" strokeLinecap="round" opacity="0.35" />
    </svg>
  );
}

// ── ThemeToggle (UNCHANGED) ──────────────────────────────────────────────────────
function ThemeToggle({ theme, onToggle, T }: { theme: Theme; onToggle: () => void; T: Tokens }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button onClick={onToggle} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 32, height: 32, borderRadius: 8, border: `1px solid ${T.border}`,
        background: hovered ? T.elevated : 'transparent', cursor: 'pointer',
        transition: 'all 0.15s ease', color: T.muted,
      }}>
      {theme === 'dark'
        ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
          </svg>
        : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
      }
    </button>
  );
}

// ── AnalysisProgress (UNCHANGED) ────────────────────────────────────────────────
const STEPS = [
  { label: 'Classifying ticket',    detail: 'Extracting category, urgency, sentiment & compliance signals', endAt: 8 },
  { label: 'Retrieving KB articles', detail: 'Semantic search across help center documentation',            endAt: 30 },
  { label: 'Drafting response',      detail: 'Generating KB-grounded reply with jurisdiction context',      endAt: Infinity },
];

function AnalysisProgress({ T }: { T: Tokens }) {
  const startRef = useRef(Date.now());
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - startRef.current) / 1000)), 500);
    return () => clearInterval(id);
  }, []);
  const activeStep = STEPS.findIndex((s, i) => elapsed < s.endAt && (i === 0 || elapsed >= STEPS[i - 1].endAt));
  const currentStep = activeStep === -1 ? STEPS.length - 1 : activeStep;
  return (
    <div style={{ padding: '32px 24px' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } } @keyframes beacon-pulse { 0% { transform: scale(1); opacity: 0.3; } 100% { transform: scale(1.8); opacity: 0; } }`}</style>
      <div style={{ marginBottom: 28, textAlign: 'center' }}>
        <div style={{ position: 'relative', width: 48, height: 48, margin: '0 auto 12px' }}>
          <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: `2px solid ${T.accent}`, opacity: 0.2, animation: 'beacon-pulse 2s ease-out infinite' }} />
          <div style={{ position: 'absolute', inset: 8, borderRadius: '50%', border: `2px solid ${T.accent}`, opacity: 0.4 }} />
          <div style={{ position: 'absolute', inset: 16, borderRadius: '50%', background: T.accent, opacity: 0.9 }} />
        </div>
        <div style={{ fontFamily: T.fontMono, fontSize: 13, fontWeight: 600, color: T.text }}>Analyzing ticket</div>
        <div style={{ fontSize: 12, color: T.muted, marginTop: 4 }}>{elapsed}s elapsed</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {STEPS.map((step, i) => {
          const done = i < currentStep; const active = i === currentStep;
          return (
            <div key={step.label} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', opacity: i > currentStep ? 0.35 : 1 }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: done ? T.accent : active ? 'transparent' : T.elevated, border: active ? `2px solid ${T.accent}` : done ? 'none' : `2px solid ${T.border}` }}>
                {done
                  ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.surface} strokeWidth="3" strokeLinecap="round" aria-hidden="true"><path d="M20 6L9 17l-5-5" /></svg>
                  : active
                    ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ animation: 'spin 0.9s linear infinite' }}><circle cx="12" cy="12" r="10" stroke={T.accent} strokeWidth="3" strokeDasharray="40 20" opacity="0.3" /><path d="M12 2a10 10 0 0 1 10 10" stroke={T.accent} strokeWidth="3" strokeLinecap="round" /></svg>
                    : <div style={{ width: 8, height: 8, borderRadius: '50%', background: T.muted }} />}
              </div>
              <div style={{ paddingTop: 4 }}>
                <div style={{ fontSize: 13, fontWeight: active ? 600 : 400, color: active ? T.text : done ? T.textSub : T.muted }}>{step.label}</div>
                {active && <div style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>{step.detail}</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── EmptyState ──────────────────────────────────────────────────────────────────
function EmptyState({ T }: { T: Tokens }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 16, padding: 32, textAlign: 'center' }}>
      <style>{`@keyframes beacon-pulse { 0% { transform: scale(1); opacity: 0.3; } 100% { transform: scale(1.8); opacity: 0; } }`}</style>
      <div style={{ position: 'relative', width: 56, height: 56 }}>
        <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: `2px solid ${T.accent}`, opacity: 0.2, animation: 'beacon-pulse 2s ease-out infinite' }} />
        <div style={{ position: 'absolute', inset: 8, borderRadius: '50%', border: `2px solid ${T.accent}`, opacity: 0.4 }} />
        <div style={{ position: 'absolute', inset: 16, borderRadius: '50%', background: T.accent, opacity: 0.8 }} />
      </div>
      <div>
        <div style={{ fontFamily: T.fontMono, fontSize: 13, fontWeight: 600, color: T.text, marginBottom: 6 }}>Awaiting selection</div>
        <div style={{ fontSize: 13, color: T.muted, maxWidth: 240, lineHeight: 1.6 }}>
          Select a ticket from the inbox to see Beacon's analysis.
        </div>
      </div>
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────────
const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001';

function routingToStatus(routing: string): InboxTicket['status'] {
  if (routing === 'auto_send') return 'sent';
  if (routing === 'escalate') return 'escalated';
  return 'triaged';
}

function makeTmpId(): string {
  return `tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// ── DemoApp ──────────────────────────────────────────────────────────────────────
export function DemoApp() {
  const [inbox, setInbox] = useState<InboxTicket[]>([]);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [simRunning, setSimRunning] = useState(false);
  const [simSpeed, setSimSpeed] = useState<'slow' | 'med' | 'fast'>('med');
  const [modalOpen, setModalOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>('dark');

  const T = theme === 'dark' ? DARK : LIGHT;

  // ── ZAF wiring ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (selectedTicketId) setTicketId(selectedTicketId);
  }, [selectedTicketId]);

  // ── Core ticket helper ───────────────────────────────────────────────────────
  const analyzeTicket = useCallback(async (ticket: InboxTicket) => {
    const tmpId = ticket.ticketId; // caller must set this
    setInbox(prev => [{ ...ticket, ticketId: tmpId, status: 'processing' }, ...prev]);
    try {
      const res = await fetch(`${API_URL}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject: ticket.subject, body: ticket.body }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const { ticketId: serverId, classification } = await res.json() as {
        ticketId: string;
        classification: QueryEntryAnalysis;
      };
      const status = routingToStatus(classification.routing);
      setInbox(prev => prev.map(t =>
        t.ticketId === tmpId ? { ...t, ticketId: serverId, status, analysis: classification } : t
      ));
      setSelectedTicketId(prev => prev === tmpId ? serverId : prev);
    } catch {
      // leave as processing on error
    }
  }, []);

  // ── Seed on mount ────────────────────────────────────────────────────────────
  useEffect(() => {
    SEED_TICKETS.forEach(t => analyzeTicket(t));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Simulation ───────────────────────────────────────────────────────────────
  useSimulation({
    speed: simSpeed,
    isRunning: simRunning,
    onTick: analyzeTicket,
  });

  // ── Analysis ready callback ───────────────────────────────────────────────────
  const handleAnalysisReady = useCallback((ticketId: string, analysis: QueryEntryAnalysis) => {
    setInbox(prev => prev.map(t =>
      t.ticketId === ticketId ? { ...t, analysis } : t
    ));
  }, []);

  // ── Modal submit ──────────────────────────────────────────────────────────────
  const handleModalAnalyze = useCallback((subject: string, body: string) => {
    const ticket: InboxTicket = {
      ticketId: makeTmpId(),
      subject: subject || body.slice(0, 60),
      body,
      from: 'agent@demo.local',
      submittedAt: new Date().toISOString(),
      status: 'processing',
    };
    analyzeTicket(ticket);
  }, [analyzeTicket]);

  // ── Derived values ────────────────────────────────────────────────────────────
  const processingCount = inbox.filter(t => t.status === 'processing').length;
  const selectedTicket = inbox.find(t => t.ticketId === selectedTicketId) ?? null;

  return (
    <ClientProvider>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', background: T.bg, fontFamily: T.fontBody, color: T.text, transition: 'background 0.2s ease' }}>
        <style>{`@keyframes beacon-pulse { 0% { transform: scale(1); opacity: 0.3; } 100% { transform: scale(1.8); opacity: 0; } }`}</style>

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <header style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '0 16px', height: 48, flexShrink: 0, borderBottom: `1px solid ${T.border}`, background: T.surface }}>
          <BeaconLogo accent={T.accent} />
          <span style={{ fontFamily: T.fontMono, fontWeight: 600, fontSize: 14, color: T.text, letterSpacing: '0.02em' }}>Beacon</span>
          <span style={{ color: T.muted, fontSize: 12, marginLeft: 2 }}>/ demo</span>

          {/* Simulation controls — center */}
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            {/* Speed presets */}
            <div style={{ display: 'flex', borderRadius: 6, overflow: 'hidden', border: `1px solid ${T.border}` }}>
              {(['slow', 'med', 'fast'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setSimSpeed(s)}
                  style={{
                    padding: '4px 10px', border: 'none', fontSize: 11, fontFamily: T.fontBody,
                    background: simSpeed === s ? T.accent : T.elevated,
                    color: simSpeed === s ? '#0F172A' : T.muted,
                    fontWeight: simSpeed === s ? 700 : 400,
                    cursor: 'pointer', transition: 'all 0.15s ease',
                  }}
                >
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
            {/* Start / Stop */}
            <button
              onClick={() => setSimRunning(r => !r)}
              style={{
                padding: '4px 14px', borderRadius: 6, border: 'none', fontSize: 12,
                fontFamily: T.fontBody, fontWeight: 600, cursor: 'pointer',
                background: simRunning ? '#ef4444' : T.accent,
                color: simRunning ? '#fff' : '#0F172A',
                transition: 'all 0.15s ease',
              }}
            >
              {simRunning ? 'Stop' : 'Start'} Simulation
            </button>
            {/* Counter */}
            <span style={{ fontSize: 12, color: T.muted, fontFamily: T.fontMono, minWidth: 120 }}>
              {inbox.length} tickets{processingCount > 0 ? ` · ${processingCount} processing` : ''}
            </span>
          </div>

          {/* Right controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={() => setModalOpen(true)}
              style={{
                padding: '5px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                border: 'none', background: T.accent, color: '#0F172A',
                fontFamily: T.fontBody, cursor: 'pointer', letterSpacing: '0.02em',
              }}
            >
              + New Ticket
            </button>
            <ThemeToggle theme={theme} onToggle={() => setTheme(t => t === 'dark' ? 'light' : 'dark')} T={T} />
            <button
              onClick={() => { localStorage.setItem('beaconTheme', theme); window.location.hash = '#/dashboard'; }}
              style={{ background: 'transparent', border: `1px solid ${T.border}`, borderRadius: 8, padding: '4px 12px', fontSize: 12, color: T.textSub, cursor: 'pointer', fontFamily: T.fontBody }}
            >
              Dashboard →
            </button>
          </div>
        </header>

        {/* ── Body ────────────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

          {/* Left: inbox list */}
          <div style={{ width: 280, flexShrink: 0, borderRight: `1px solid ${T.border}`, overflowY: 'auto', background: T.surface }}>
            <InboxList
              inbox={inbox}
              selectedTicketId={selectedTicketId}
              T={T}
              onSelect={ticket => setSelectedTicketId(ticket.ticketId)}
            />
          </div>

          {/* Right: thread + analysis split */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {selectedTicket ? (
              <>
                {/* Top ~45%: ticket thread */}
                <div style={{ flex: '0 0 45%', borderBottom: `1px solid ${T.border}`, overflow: 'hidden' }}>
                  <TicketThread ticket={selectedTicket} T={T} />
                </div>
                {/* Bottom ~55%: analysis or progress */}
                <div style={{ flex: 1, overflowY: 'auto', padding: selectedTicket.status === 'processing' ? 0 : 16 }}>
                  {selectedTicket.status === 'processing'
                    ? <AnalysisProgress T={T} />
                    : <AnalysisView
                        key={selectedTicket.ticketId}
                        ticketId={selectedTicket.ticketId}
                        theme={theme}
                        subject={selectedTicket.subject}
                        body={selectedTicket.body}
                        onAnalysisReady={handleAnalysisReady}
                      />
                  }
                </div>
              </>
            ) : (
              <EmptyState T={T} />
            )}
          </div>
        </div>

        {/* ── Modal ────────────────────────────────────────────────────────── */}
        <NewTicketModal
          open={modalOpen}
          T={T}
          onClose={() => setModalOpen(false)}
          onAnalyze={handleModalAnalyze}
        />
      </div>
    </ClientProvider>
  );
}
```

- [ ] **Step 2: Move type definitions inline in `inbox-data.ts` and delete `InputPanel.tsx`**

`inbox-data.ts` currently re-exports `QueryEntry` and `QueryEntryAnalysis` from `./InputPanel`. Before deleting `InputPanel.tsx`, replace those two re-export lines with inline definitions:

Open `apps/demo/src/inbox-data.ts` and replace:
```ts
export type { QueryEntry, QueryEntryAnalysis } from './InputPanel';
```

With:
```ts
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
```

Then check for any remaining imports from `InputPanel`:

```bash
grep -r "from './InputPanel'\|from '../InputPanel'" apps/demo/src/
```

If any files still import from `InputPanel`, update them to import from `./inbox-data`. Then delete:

```bash
rm apps/demo/src/InputPanel.tsx
```

- [ ] **Step 3: Typecheck the whole demo app**

```bash
cd /path/to/beacon && pnpm typecheck 2>&1 | grep "apps/demo"
```

Expected: zero errors.

- [ ] **Step 4: Start the demo-server and demo app and verify visually**

Terminal 1:
```bash
cd apps/demo-server && pnpm dev
```

Terminal 2:
```bash
cd apps/demo && pnpm dev
```

Open `http://localhost:5173`. Verify:
- [ ] Inbox loads with ~12 processing tickets (shimmer visible)
- [ ] Within ~30s, tickets resolve to badges (urgency, category, routing, sentiment dot)
- [ ] Clicking a ticket shows the thread top-half + analysis/progress bottom-half
- [ ] `sent` tickets show green "Auto-sent by Beacon" banner; `escalated` show red banner
- [ ] Start Simulation → tickets stream in at selected speed
- [ ] Speed toggle changes arrival rate
- [ ] Stop Simulation → new tickets stop; in-flight ones resolve
- [ ] "+ New Ticket" opens modal; selecting an example pre-fills fields
- [ ] Submitting the modal closes it and adds a processing ticket to inbox top
- [ ] Escape / backdrop click closes the modal without adding a ticket
- [ ] Theme toggle switches dark/light
- [ ] Dashboard → link still works

- [ ] **Step 5: Commit**

```bash
git add apps/demo/src/DemoApp.tsx apps/demo/src/inbox-data.ts
git rm apps/demo/src/InputPanel.tsx
git commit -m "feat(demo): inbox redesign — 2-col layout, simulation, New Ticket modal"
```

---

## Done

At this point the full redesign is complete:

1. `demo-server` returns `classification` inline
2. `inbox-data.ts` owns types + data
3. `useSimulation` drives the flood
4. `InboxList` is the left column
5. `TicketThread` is the top-right panel
6. `TicketForm` + `NewTicketModal` replace the old `InputPanel`
7. `DemoApp` wires it all together with the shared `analyzeTicket` helper
