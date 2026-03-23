---
phase: 06-intelligence-voc-reporting-and-auto-send
plan: "01"
subsystem: auto-send routing and proactive notifications
tags: [auto-send, routing, step-functions, lambda, dynamodb, eventbridge, route-03, route-05]
dependency_graph:
  requires: [05-04-SUMMARY.md, 05-05-SUMMARY.md]
  provides: [AutoSenderLambda, RoutingChoice state, ProactiveNotificationLambda, auto_send RoutingMode]
  affects: [infra/src/stacks/meridian-stack.ts, packages/core/src/types/index.ts]
tech_stack:
  added: [lambdas/auto-sender, lambdas/proactive-notification]
  patterns: [Step Functions Choice state, runtime mode gate from DynamoDB, AUTOSEND# audit records]
key_files:
  created:
    - lambdas/auto-sender/package.json
    - lambdas/auto-sender/tsconfig.json
    - lambdas/auto-sender/src/index.ts
    - lambdas/proactive-notification/package.json
    - lambdas/proactive-notification/tsconfig.json
    - lambdas/proactive-notification/src/index.ts
  modified:
    - packages/core/src/types/index.ts
    - packages/core/src/schemas/index.ts
    - infra/src/stacks/meridian-stack.ts
decisions:
  - "[Phase 06-01]: AutoSenderLambda declared before Step Functions workflow in CDK — TypeScript hoisting requires const to be declared before use; moved to after ShadowLambda declaration"
  - "[Phase 06-01]: ModeStatusSchema enum updated to include auto_send — consistent with RoutingMode type extension; downstream consumers get accurate schema for GET /mode responses"
metrics:
  duration: 5 min
  completed_date: 2026-03-23
  tasks_completed: 2
  files_changed: 9
---

# Phase 6 Plan 01: Auto-Send Routing and Proactive Notifications Infrastructure Summary

Auto-send routing implemented via Step Functions RoutingChoice branching on responseDraft.routing, with AutoSenderLambda performing a runtime SYSTEM#config mode gate before any public reply; ProactiveNotificationLambda added with 4-hour EventBridge schedule (Reap Pay polling stubbed pending internal API access).

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | AutoSenderLambda + RoutingMode type extension | 60591dc | lambdas/auto-sender/src/index.ts, packages/core/src/types/index.ts |
| 2 | Step Functions Choice state + ProactiveNotificationLambda CDK wiring | 4d80179 | infra/src/stacks/meridian-stack.ts, lambdas/proactive-notification/src/index.ts |

## What Was Built

### Task 1: AutoSenderLambda + RoutingMode type extension

Created `lambdas/auto-sender/` as a new monorepo package following the runbook-executor pattern (package.json with workspace:* dep, tsconfig extending base with node16).

**AutoSenderLambda handler (`lambdas/auto-sender/src/index.ts`):**
- Reads `SYSTEM#config` / `ROUTING_MODE` from DynamoDB at handler start; defaults to `'shadow'` if record missing or unreadable
- Only posts a public Zendesk reply when BOTH: `systemMode === 'auto_send'` AND `responseDraft.routing === 'auto_send'`
- Any other combination posts an internal (private: false) Zendesk note
- Writes `AUTOSEND#${ticketId}` / `SENT#${timestamp}` or `WITHHELD#${timestamp}` DynamoDB record for full auditability
- Returns `{ sent: boolean; mode: string; ticketId: string }`

**RoutingMode type extension (`packages/core/src/types/index.ts`):**
- Extended `RoutingMode` union: `'shadow' | 'agent_assisted' | 'auto_send'`
- Updated `ModeStatusSchema` in schemas/index.ts to include `auto_send` in the mode enum

### Task 2: Step Functions Choice state + ProactiveNotificationLambda CDK wiring

**RoutingChoice state in Step Functions (`infra/src/stacks/meridian-stack.ts`):**
- Inserted `RoutingChoice` (sfn.Choice) after `GenerateResponse` step
- When `$.responseResult.Payload.responseDraft.routing === 'auto_send'` → routes to `AutoSendResponse` (AutoSenderLambda)
- Otherwise (agent_assisted, escalate) → routes to `WriteShadowNote` (existing shadow step)
- Chain: `classifyStep → kbRetrievalStep → responseGenStep → routingChoice`

**AutoSenderLambda CDK construct:**
- NodejsFunction with AUDIT_TABLE_NAME, ZENDESK_SUBDOMAIN, ZENDESK_API_TOKEN env vars
- `auditLogTable.grantReadWriteData(autoSenderFn)` for DynamoDB audit writes
- Declared before Step Functions workflow (TypeScript `const` requires declaration before use)

**ProactiveNotificationLambda (ROUTE-05 infrastructure skeleton):**
- NodejsFunction pointing to `lambdas/proactive-notification/src/index.ts`
- EventBridge schedule: every 4 hours (`cron(0 */4 * * ? *)`)
- Handler checks SYSTEM#config mode gate — returns early if not `auto_send`
- Stubs out Reap Pay polling with log line; no API calls, no SES emails dispatched

## Verification Results

- `cd lambdas/auto-sender && npx tsc --noEmit` — no errors
- `pnpm -r typecheck` — ok (no errors across all packages)
- `cd infra && pnpm build && npx cdk synth --quiet` — succeeds; RoutingChoice visible in synthesized CF template
- `grep -r "RoutingChoice" infra/dist/` — found in meridian-stack.js
- `grep auto_send packages/core/src/types/index.ts` — RoutingMode includes new value

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] AutoSenderLambda declared after Step Functions workflow reference**
- **Found during:** Task 2
- **Issue:** autoSenderStep referenced autoSenderFn at line 582, but the CDK NodejsFunction was declared at line 727 — TypeScript `const` does not allow use before declaration (TS2448, TS2454)
- **Fix:** Moved the AutoSenderLambda CDK block to before the Step Functions workflow section (after ShadowLambda declaration); removed duplicate block that was in the Runbook Executor section
- **Files modified:** infra/src/stacks/meridian-stack.ts
- **Commit:** 4d80179 (included in Task 2 commit)

## Requirements Satisfied

- **ROUTE-03:** AutoSenderLambda with runtime mode gate; Step Functions RoutingChoice branching on responseDraft.routing = auto_send
- **ROUTE-05:** ProactiveNotificationLambda infrastructure skeleton with 4-hour EventBridge schedule and mode gate; Reap Pay API polling stubbed pending internal API access (listed blocker in STATE.md)

## Self-Check: PASSED
