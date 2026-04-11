# CX AI Operations Assistant — Enhanced Solution Design / PRD

## 1) Executive Summary

This proposal designs an **AI-assisted CX Operations Assistant** for bulk customer operations such as:

> "Please update the spending limits for 50 cards for the Marketing team to SGD 2,000, and notify the cardholders once done."

The core design principle is:

**AI helps interpret, validate, explain, and communicate. Deterministic systems execute, track, and recover.**

The workflow is optimized for four outcomes:

1. **Business correctness** — no unsafe or policy-breaking bulk changes
2. **Responsiveness** — the system remains usable during long-running jobs
3. **Transparency** — agents always know what is happening, what succeeded, what failed, and what to do next
4. **Operational reliability** — retries, idempotency, partial failure isolation, cancellation, and auditability

---

## 2) Problem Framing

### Business problem

CX teams receive requests that are operationally repetitive but cognitively complex. These requests often require:

- understanding natural-language instructions
- looking up internal data and policies
- executing many actions across multiple entities
- handling slow APIs and partial failures
- keeping the human operator informed throughout

The example request combines all of these:

- identify the target cards (Marketing team)
- validate the requested spending limit (SGD 2,000)
- determine whether approvals are required
- execute updates for 50 cards
- notify affected cardholders
- explain progress and failures clearly

### What the system should optimize for

- **Safety first**: default to non-execution when key parameters or approvals are missing
- **Low operator effort**: minimize manual coordination and repetitive work
- **Correctness over speed** for execution-critical steps
- **Fast perceived responsiveness** through asynchronous job orchestration and live status updates
- **Clear recovery paths** when failures occur

### Non-goals

- full authentication or permissioning implementation
- polished production UI
- real card API integrations

---

## 3) Design Principles

1. **Plan before action**
   - The assistant never executes directly from raw natural language.
   - It first converts the request into a typed execution plan.

2. **Human approval before risky bulk actions**
   - All bulk financial-impacting changes require explicit confirmation.

3. **Deterministic execution path**
   - LLMs do not call mutable APIs directly.
   - They only produce structured interpretations and explanations.

4. **Item-level tracking**
   - Each card operation is tracked independently within a parent job.
   - This allows partial success without losing clarity.

5. **Idempotent by default**
   - Retries must not duplicate updates or notifications.

6. **Explainability and auditability**
   - Every decision and state transition is visible in logs and job records.

---

## 4) Updated Assumptions

1. The primary user is an **internal CX agent or operations specialist**, not an end customer. The system is designed first for internal operational leverage, with possible future reuse in customer-facing flows.
2. The first release should optimize for a **small number of high-frequency, high-structure bulk workflows** rather than a general autonomous assistant.
3. Bulk financial operations should be treated as **safe, durable workflows** with explicit approval and confirmation steps.
4. Policy exists in two forms:
   - **human-readable policy documents** that evolve over time
   - a **structured policy registry** for stable operational rules such as thresholds, exclusions, approval routes, and allowed states
5. AI may use retrieval to identify relevant policy passages and help interpret ambiguous requests, but **final policy enforcement must remain deterministic**.
6. Internal APIs are available or can be mocked for:
   - listing cards by team / account / filter
   - updating card settings such as spending limits
   - sending notifications
   - retrieving policy metadata / approval thresholds
   - writing audit events and retrieving job status
7. Some operations will be slow and can fail for a subset of items. The UX must remain responsive and preserve item-level visibility throughout execution.
8. The prototype should prove the operating model rather than full breadth. A strong implementation can focus on one core workflow such as bulk card limit updates while showing that the architecture generalizes.
9. The backend must support **durable async execution, item-level status tracking, and explicit workflow states**; these requirements matter more than maximizing agent flexibility.
10. The system should be designed as a **bounded planner + deterministic executor**, where AI helps interpret and explain, but execution flows through typed workflow contracts.
11. Product requirements should be grounded in direct input from target operators before broadening automation scope.

---

## 4A) Product Requirement Gathering from End Users

Before expanding beyond the initial workflow, the product team should validate demand, friction, and trust requirements with the people who will actually operate the system.

### Primary end users to interview

1. **CX agents / support operations staff** — the daily operators who handle repetitive requests
2. **Risk / compliance / policy owners** — the teams who define thresholds, approval requirements, exclusions, and escalation rules
3. **Operations managers / team leads** — the stakeholders accountable for SLA, quality, and throughput
4. **Internal platform / API owners** — the teams responsible for card APIs, notifications, approvals, and audit systems

### Key questions to gather requirements

#### Workflow frequency and value
- What bulk workflows occur most often today?
- Which workflows are the most painful, error-prone, or slow?
- Which workflows have the clearest success / failure criteria?
- Which workflows currently require the most copying, pasting, reconciliation, or manual follow-up?

#### Risk and control expectations
- Which operations are considered low-risk, medium-risk, and high-risk?
- What actions always require human confirmation?
- What actions require secondary approval?
- What kinds of failures are acceptable to auto-retry, and which must escalate immediately?

#### UX and trust requirements
- What information must an agent see before they feel safe confirming a bulk action?
- What status updates are needed while a job is running?
- How should partial failures be explained?
- What recovery actions must be available in the UI?

#### Policy and exception handling
- Which policy rules are stable enough to encode structurally?
- Which policies are still evolving and must remain document-backed?
- What exceptions are common in practice?
- What evidence or citations are needed when the system blocks an action?

### Product discovery deliverables

- ranked list of candidate workflows by frequency, pain, and risk
- workflow map for the top 3 operational journeys
- approval / exception matrix
- policy dependency inventory
- v1 success metrics and failure thresholds

### Suggested v1 success metrics

- median handling time reduction for the target workflow
- confirmation-to-completion time
- percentage of cases completed without manual spreadsheeting or side-channel coordination
- partial-failure recovery time
- agent trust score / qualitative confidence feedback
- escalation rate caused by ambiguity or policy gaps

---

## 5) End-to-End Workflow

The workflow is intentionally split into **synchronous** and **asynchronous** phases.

> **See: Interactive Workflow Diagram** — the accompanying visualization shows the full A→D phase flow with state transitions, decision gates, and AI vs deterministic boundaries.

### Phase A — Intake and interpretation (synchronous)

#### Step A1: User submits request

System actions:
- capture raw request
- assign request ID
- show immediate acknowledgment: "I'm reviewing the request and preparing a safe execution plan."

**Mode:** Assist

#### Step A2: Structured intent extraction

Use an LLM to extract a typed payload:

```json
{
  "intent": "bulk_update_card_limit",
  "target_group": "Marketing team",
  "target_count_estimate": 50,
  "new_limit": {
    "currency": "SGD",
    "amount": 2000
  },
  "notify_cardholders": true
}
```

Validation layer then checks:
- schema validity
- supported intent
- numeric / currency formatting
- missing required fields
- ambiguity

If any field is missing or ambiguous, the assistant asks a clarifying question instead of proceeding.

**Mode:** Assist

#### Step A3: Context gathering

Deterministic services fetch:
- matching cards for the Marketing team
- actual card count
- current card states
- policy constraints
- approval requirements
- cardholders to notify

**Mode:** Assist

#### Step A4: Plan preview and risk summary

The assistant shows a confirmation screen with:
- operation type
- number of cards affected
- new limit
- excluded items and why
- approval requirement
- notification plan
- estimated duration
- actions: Confirm, Cancel, Export affected list

**Mode:** Assist, followed by Human only confirmation

### Phase B — Approval and execution kickoff

#### Step B1: Explicit confirmation

The system requires explicit confirmation for bulk mutable operations.

The system creates:
- a **job record** for the overall bulk request
- **item records** for each target card
- an **idempotency key** for the job and each item

**Mode:** Human only

#### Step B2: Async job starts

Once confirmed, the UI returns immediately with a job receipt and moves work to a background worker queue.

**Mode:** Fully auto resolved

### Phase C — Bulk execution and progress reporting (asynchronous)

#### Step C1: Fan-out execution

Each item task:
1. checks if item has already been completed for the current idempotency key
2. fetches latest state
3. verifies preconditions again
4. calls card API to update spending limit
5. writes result to job store

Possible item states:
- queued
- in_progress
- succeeded
- failed_retryable
- failed_permanent
- cancelled
- skipped

**Mode:** Fully auto resolved

#### Step C2: Live progress updates

The UI or chat thread is updated with progressive summaries.

**Mode:** Fully auto resolved

#### Step C3: Partial failure handling

If an item fails:
- classify failure (retryable vs permanent)
- retry retryable failures with backoff
- mark permanent failures with reason code
- continue processing other items

**Mode:** Fully auto resolved

#### Step C4: Notification phase

After updates finish, notification tasks are generated only for successfully updated cards.

**Mode:** Fully auto resolved

### Phase D — Completion and recovery

#### Step D1: Final summary

The assistant sends a concise summary with completed count, failed count by reason, skipped count, notification outcomes, and links to retry / export / escalate.

**Mode:** Fully auto resolved

#### Step D2: Recovery actions

Available post-run actions:
- retry failed items only
- cancel remaining items if job is still running
- export report CSV
- escalate to human ops queue
- open audit trail

**Mode:** Assist

---

## 6) Human / Assist / Fully Auto Table

| Step | Description | Mode |
|---|---|---|
| 1 | Receive natural-language request | Assist |
| 2 | Extract intent and parameters into structured schema | Assist |
| 3 | Gather cards, policy, approvals, recipients | Assist |
| 4 | Present safe execution plan and risk summary | Assist |
| 5 | Confirm or reject bulk action | Human only |
| 6 | Create job and item records | Fully auto resolved |
| 7 | Execute eligible item updates asynchronously | Fully auto resolved |
| 8 | Retry transient failures | Fully auto resolved |
| 9 | Send notifications for successful items | Fully auto resolved |
| 10 | Present final summary and recovery options | Assist |
| 11 | Retry failed subset or escalate | Human only for retry approval; auto for execution |

---

## 7) Stop Conditions That Force Escalation

### Input / planning stop conditions
1. Ambiguous target group or target entity
2. Missing critical parameters
3. Requested action conflicts with policy and no override path exists
4. Requested volume exceeds configured safe bulk threshold
5. LLM extraction confidence is below threshold or schema validation fails repeatedly

### Execution stop conditions
1. Approval required but not yet obtained
2. Item failure rate exceeds anomaly threshold
3. Downstream card API is degraded or unavailable
4. Job cancellation requested after partial execution started and inconsistent state needs review
5. Detected mismatch between pre-check state and execution-time state beyond allowed tolerance

### Communication stop conditions
1. Notification template unavailable or unapproved
2. Recipient resolution mismatches card ownership records
3. Compliance rule blocks outbound notification

---

## 8) How the System Translates a Messy Request Into a Safe Plan

> **See: Intent Processing Pipeline Diagram** — the accompanying visualization illustrates the six-stage pipeline from raw NL input to safe execution plan.

### Input understanding pipeline

#### Stage 1: Intent classification
Classify the request into one supported workflow.

#### Stage 2: Parameter extraction
Extract required fields into a strict JSON schema.

#### Stage 3: Validation
Validate:
- enum values
- numeric ranges
- card count bounds
- supported currencies
- team existence

#### Stage 4: Enrichment
Resolve user language into concrete IDs.

#### Stage 5: Policy check
Run deterministic business rules:
- is requested limit allowed?
- is approval required?
- are some cards excluded?
- should notifications be delayed or templated differently?

#### Stage 6: Plan synthesis
Only after deterministic checks pass does the assistant generate a user-facing plan.

---

## 9) Confirmation UX

The confirmation step should show only decision-relevant information:
- exact action to be taken
- exact count of affected items
- list of exclusions and reasons
- approval requirement and current approval status
- execution estimate
- notification recipients / volume
- clear statement of what will not happen
- buttons: Confirm, Cancel, Edit, Export list

---

## 10) Synchronous vs Asynchronous Design

### Synchronous steps
- intake acknowledgment
- intent extraction
- validation
- context gathering
- plan generation
- confirmation receipt

### Asynchronous steps
- per-card updates
- retries
- notifications
- export generation

### UX behavior while job is running
The user should be able to:
- view live progress
- inspect current counts
- see failed items so far
- cancel remaining queued work
- leave and return later
- receive final completion receipt

---

## 11) Preventing Accidental Double-Submits

Mitigations:
1. Disable confirm button after click until job receipt is returned
2. Use a client-generated request token plus server-side idempotency key
3. Detect equivalent pending jobs for same actor + same parameters + same target set
4. Show existing running job instead of creating a duplicate
5. Mark notifications with per-recipient idempotency keys as well

---

## 12) Reliability Design

### Partial failures
- treat each card as an independent item task
- keep overall job running unless anomaly threshold reached
- maintain exact reason code per failed item
- retry only retryable failures
- notify only successful items
- produce failure report for remainder

### Retry strategy

**Retryable**
- timeout
- 429 / rate limit
- transient 5xx
- network interruption

**Permanent**
- card locked
- invalid state transition
- policy violation
- missing cardholder contact

Backoff strategy:
- exponential backoff with jitter
- max 3 retries per item
- dead-letter queue for exhausted retries

### Idempotency
Mandatory at:
1. **Job-level**
2. **Item-level**
3. **Notification-level**

### Cancellation
Best-effort, not rollback by default.

---

## 13) Updated Architecture

This design uses a **bounded planner + deterministic executor** model.

The assistant may help interpret requests and retrieve policy context, but the mutation-critical path is handled by typed workflow APIs, deterministic validation, and durable background execution.

> **See: System Architecture Diagram** — the accompanying visualization shows all eight high-level components with data flow, AI boundaries, and the sync/async boundary.

### High-level components

1. **CX Console / Internal Ops UI** — request intake, clarification prompts, confirmation screen, live job progress, final summary and recovery actions

2. **Workflow API / Orchestrator** — receives raw request, calls LLM assist layer for structured extraction, validates parameters, resolves entities and targets, creates job drafts, confirmed jobs, and status views

3. **Policy Service**
   - **Policy Retrieval + Interpretation** — document store, chunking / embeddings / retrieval, LLM-assisted interpretation of relevant policy passages
   - **Policy Rules Engine** — structured thresholds, allowed states, approval logic, effective dates and version-aware constraints

4. **Bulk Job Engine** — durable job lifecycle, parent job + child item model, retry, cancellation, timeout handling, failure classification

5. **Execution Workers** — perform per-item mutations through internal APIs, update status records, create notification tasks for successful items only

6. **Operational Database** — jobs, job_items, approvals, notifications, audit logs, policy versions / structured policy registry

7. **Internal Service Connectors** — card API, team / account lookup, notification API, approval API, audit service

8. **Observability Stack** — structured logs, metrics, traces, dead-letter monitoring, job dashboards

### Recommended technical stack

#### Option A: FastAPI + Postgres + Redis/Celery
**Recommended default for the assessment.**

- **Frontend:** Next.js / React
- **Backend:** Python FastAPI
- **Database:** Postgres
- **Async execution:** Redis + Celery
- **LLM layer:** OpenRouter-compatible model with structured JSON output
- **Retrieval:** pgvector or a lightweight vector index attached to Postgres
- **Realtime UX:** polling first, WebSockets optional
- **Observability:** structured logs + OpenTelemetry-compatible traces

#### Option B: Convex as backend
**Viable for a fast product prototype, but not the best primary recommendation for this assignment.**

Potential strengths:
- very fast full-stack iteration
- built-in reactive data model and realtime UX
- convenient developer experience for internal tools
- simpler frontend/backend integration for status views and lightweight operator tooling

Limitations:
- less natural fit for durable, high-control workflow orchestration than a queue / workflow engine model
- risk of over-optimizing for reactive UI patterns instead of explicit job semantics
- you still need a clear approach for idempotent background execution, retries, and failure handling
- policy enforcement, execution control, and mutation safety still need deterministic service boundaries

**Conclusion on Convex**
Convex can be a good choice if the goal is to ship a polished internal demo quickly and keep the architecture relatively lightweight. However, for this assessment, **FastAPI + Postgres + Redis/Celery** is the stronger choice because it more directly demonstrates durable workflow thinking. If Convex is used, it should act as the application backend / realtime state layer, while core execution still follows typed workflow contracts.

### API design recommendation

Expose **typed workflow contracts**, not a broad free-form tool surface.

Examples:
- `create_bulk_job_draft(operation_type, parameters)`
- `preview_bulk_job(job_draft_id)`
- `confirm_bulk_job(job_draft_id)`
- `get_job_status(job_id)`
- `retry_failed_items(job_id, item_ids)`
- `cancel_remaining_items(job_id)`
- `send_notifications_for_successful_items(job_id)`

---

## 14) Data Model

> **See: Entity Relationship Diagram** — the accompanying visualization shows the full schema with relationships, cardinality, and key constraints.

### Job table
- job_id (PK, UUID)
- request_id (FK)
- operation_type (ENUM)
- requested_by (FK → users)
- raw_request (TEXT)
- normalized_plan_json (JSONB)
- status (ENUM: draft, confirmed, in_progress, completed, completed_with_failures, cancelled, failed)
- total_items (INT)
- eligible_items (INT)
- succeeded_count (INT)
- failed_count (INT)
- skipped_count (INT)
- cancelled_count (INT)
- approval_status (ENUM: not_required, pending, approved, rejected)
- approved_by (FK → users, NULLABLE)
- approved_at (TIMESTAMP, NULLABLE)
- created_at (TIMESTAMP)
- started_at (TIMESTAMP)
- completed_at (TIMESTAMP)
- idempotency_key (UNIQUE)
- anomaly_threshold_pct (INT, default 30)

### Item execution table
- item_id (PK, UUID)
- job_id (FK → jobs)
- card_id (FK)
- cardholder_id (FK)
- old_limit (JSONB: {currency, amount})
- requested_new_limit (JSONB: {currency, amount})
- execution_status (ENUM: queued, in_progress, succeeded, failed_retryable, failed_permanent, cancelled, skipped)
- retry_count (INT, default 0)
- max_retries (INT, default 3)
- failure_code (VARCHAR, NULLABLE)
- failure_detail (TEXT, NULLABLE)
- last_attempt_at (TIMESTAMP)
- completed_at (TIMESTAMP, NULLABLE)
- idempotency_key (UNIQUE)
- precondition_check_passed (BOOLEAN)

### Notification table
- notification_id (PK, UUID)
- job_id (FK → jobs)
- item_id (FK → job_items)
- card_id (FK)
- recipient_id (FK)
- recipient_channel (ENUM: email, sms, push, in_app)
- template_id (FK → notification_templates)
- template_version (INT)
- send_status (ENUM: queued, sent, delivered, failed, skipped)
- failure_reason (TEXT, NULLABLE)
- sent_at (TIMESTAMP, NULLABLE)
- idempotency_key (UNIQUE)

### Audit log table
- audit_id (PK, UUID)
- job_id (FK → jobs, NULLABLE)
- item_id (FK → job_items, NULLABLE)
- actor (VARCHAR)
- actor_type (ENUM: system, agent, approver, automation)
- action (VARCHAR)
- before_state (JSONB)
- after_state (JSONB)
- timestamp (TIMESTAMP)
- metadata (JSONB)
- trace_id (VARCHAR, NULLABLE)

### Policy registry table (NEW)
- policy_id (PK, UUID)
- policy_type (ENUM: threshold, exclusion, approval_route, notification_rule)
- operation_type (ENUM)
- conditions (JSONB)
- action (JSONB)
- effective_from (TIMESTAMP)
- effective_to (TIMESTAMP, NULLABLE)
- version (INT)
- created_by (VARCHAR)
- is_active (BOOLEAN)

### Approval table (NEW)
- approval_id (PK, UUID)
- job_id (FK → jobs)
- policy_id (FK → policy_registry)
- requested_by (FK → users)
- approver_id (FK → users, NULLABLE)
- status (ENUM: pending, approved, rejected, expired)
- reason (TEXT, NULLABLE)
- requested_at (TIMESTAMP)
- resolved_at (TIMESTAMP, NULLABLE)
- expires_at (TIMESTAMP)

---

## 14A) Role-Based Access Control Model (NEW)

### Roles

| Role | Description | Permissions |
|---|---|---|
| CX Agent | Frontline operator | Submit requests, confirm low-risk jobs, view own job history |
| Senior CX Agent | Experienced operator | All CX Agent + confirm medium-risk jobs, retry failed items |
| CX Team Lead | Operations supervisor | All Senior CX Agent + approve high-risk jobs, cancel jobs, view team history |
| Compliance Officer | Policy gatekeeper | View all jobs, approve policy-gated operations, audit trail access |
| System Admin | Platform administrator | Full access, policy registry management, configuration |

### Permission matrix

| Action | CX Agent | Senior Agent | Team Lead | Compliance | Admin |
|---|---|---|---|---|---|
| Submit request | ✓ | ✓ | ✓ | — | ✓ |
| Confirm (≤ 10 items) | ✓ | ✓ | ✓ | — | ✓ |
| Confirm (11–100 items) | — | ✓ | ✓ | — | ✓ |
| Confirm (> 100 items) | — | — | ✓ | ✓ | ✓ |
| Approve policy-gated | — | — | — | ✓ | ✓ |
| Retry failed items | — | ✓ | ✓ | — | ✓ |
| Cancel running job | — | — | ✓ | ✓ | ✓ |
| View audit trail | — | — | ✓ | ✓ | ✓ |
| Manage policy registry | — | — | — | ✓ | ✓ |
| Export reports | ✓ | ✓ | ✓ | ✓ | ✓ |

---

## 14B) SLA and Latency Targets (NEW)

### Synchronous phase targets

| Step | Target latency | P95 ceiling | Notes |
|---|---|---|---|
| Request acknowledgment | < 200ms | 500ms | Immediate UI feedback |
| Intent extraction (LLM) | < 2s | 4s | Use fast model (e.g. Haiku-class) |
| Validation + enrichment | < 500ms | 1.5s | Deterministic, cacheable |
| Policy check | < 300ms | 1s | Structured registry lookup |
| Plan generation (LLM) | < 2s | 4s | Cached policy context |
| Total intake-to-confirmation | < 6s | 12s | End-to-end sync phase |

### Asynchronous phase targets

| Metric | Target | Anomaly threshold |
|---|---|---|
| Per-item execution | < 500ms | > 5s |
| Per-item retry (with backoff) | < 30s cumulative | > 2 min |
| Notification send | < 2s per recipient | > 10s |
| Progress update frequency | Every 5 items or 10s | > 30s stale |
| Full job (50 items) | < 3 min | > 10 min |
| Full job (500 items) | < 15 min | > 45 min |

### Availability targets

| Component | Target uptime | Recovery objective |
|---|---|---|
| Workflow API | 99.9% | < 5 min |
| Bulk Job Engine | 99.95% | < 2 min (worker restart) |
| Policy Service | 99.9% | < 5 min (cache fallback) |
| Notification Service | 99.5% | < 15 min (async retry) |

---

## 15) AI Usage and Guardrails

### Where AI should be used
1. Intent classification
2. Parameter extraction into strict schema
3. Clarifying question generation
4. Human-readable plan explanation
5. Final summary drafting
6. Optional failure explanation rewriting for non-technical agents
7. Policy retrieval and interpretation assistance

### Where AI should NOT be used
1. deciding whether to bypass policy
2. executing mutable API calls directly
3. determining final approval state without deterministic rules
4. choosing recipients when identity resolution is ambiguous

### Guardrails
1. Schema validation
2. Supported-intent allowlist
3. Policy engine as source of truth
4. Bulk action threshold requiring explicit approval
5. Prompt templates forbidding the model from inventing IDs, approvals, or policy outcomes
6. Escalation whenever model output conflicts with system data

### Quality evaluation
Evaluate:
- intent accuracy
- slot extraction accuracy
- ambiguity detection recall
- safe refusal rate
- hallucination rate on plan summaries

### Cost and latency management
- use small / fast model for classification and extraction
- cache policy text and tool descriptions
- avoid repeated LLM calls once plan is locked
- do not use the LLM inside per-item execution loop
- summarize failures using one final model call rather than many small ones

### Model selection strategy (NEW)

| Task | Recommended tier | Rationale |
|---|---|---|
| Intent classification | Fast/small (Haiku-class) | Low latency, high throughput, simple classification |
| Parameter extraction | Fast/small with structured output | JSON mode, schema-constrained |
| Clarifying question generation | Mid-tier (Sonnet-class) | Needs nuance for ambiguity detection |
| Plan explanation | Mid-tier | Human-facing prose quality matters |
| Failure summary | Mid-tier | Must translate error codes to agent-friendly language |
| Policy retrieval ranking | Fast/small | Embedding similarity + reranker |
| Policy interpretation | Mid-tier | Needs reasoning over complex policy language |

---

## 16) Failure Modes and How the Design Handles Them

| # | Failure mode | Detection | Response | Recovery |
|---|---|---|---|---|
| 1 | Ambiguous target group | Validation stage | Block execution, ask clarifying question | Agent re-submits with clarification |
| 2 | Policy conflict | Policy engine check | Block auto-execution, show policy reason, offer request-approval path | Approval or request modification |
| 3 | Partial downstream API failure | Per-item status tracking | Continue other items, retry transient failures | Retry failed subset post-completion |
| 4 | Duplicate submission | Idempotency key match | Deduplicate, surface existing job receipt | No action needed |
| 5 | Notification failure after update success | Notification status tracking | Keep update marked successful, retry notification separately | Async notification retry |
| 6 | Cancellation mid-run | Cancellation request handler | Cancel queued work, allow in-flight work to finish safely | Review partial state |
| 7 | Bad LLM extraction | Schema validation failure | Fallback to clarification or manual form | Agent manually fills structured form |
| 8 | Anomaly threshold breach (NEW) | Failure rate monitor (> 30% failures in rolling window) | Pause job, alert agent | Agent investigates, resumes or cancels |
| 9 | Stale pre-check data (NEW) | Execution-time state mismatch | Skip item with reason code `stale_precondition` | Retry with fresh state check |
| 10 | Downstream rate limiting (NEW) | 429 response code | Adaptive backoff, reduce concurrency | Auto-resumes when rate limit clears |

---

## 17) Observability Plan

### Logs
Structured logs for:
- request received
- model extraction output
- validation result
- policy retrieval result
- policy check result
- confirmation action
- job created
- per-item execution attempt
- per-item failure classification
- notification send result
- cancellation requests
- final job completion

### Metrics
- bulk jobs started / completed
- job success rate
- item success rate
- partial failure rate
- mean time to completion
- mean retries per item
- cancellation rate
- duplicate-submit prevention count
- notification success rate
- approval-required rate
- human-escalation rate
- LLM latency by task type (NEW)
- LLM token consumption per job (NEW)
- policy cache hit rate (NEW)
- downstream API error rate by provider (NEW)

### Traces
Distributed tracing across:
- workflow API
- LLM service
- policy service
- card API
- notification API
- worker queue

### Dashboards and alerts

| Dashboard | Key panels | Alert condition |
|---|---|---|
| Live jobs | Running jobs, progress bars, item-level status | Job stalled > 5 min |
| Failure breakdown | Failure codes by category, time series | Failure rate > 30% in 5 min window |
| Downstream API health | Response time, error rate per endpoint | Error rate > 10% or P95 > 5s |
| LLM performance | Extraction accuracy, latency, token spend | Latency > 4s or accuracy < 90% |
| Dead-letter queue | Queue depth, oldest message age | Depth > 50 or age > 1 hour |
| Notification delivery | Send rate, delivery rate, failure reasons | Delivery rate < 95% |

---

## 18) Security and Safety Considerations

### Safety controls
1. Explicit confirmation before bulk mutation
2. Approval routing for policy-sensitive changes
3. Hard caps on bulk size
4. Immutable audit trail
5. Notification only for successful items
6. Least-authority execution service accounts
7. PII minimization in logs and model prompts

### Prompt safety
- never include secrets in prompts
- redact unnecessary customer identifiers
- use model outputs only after validation
- sanitize model outputs before rendering in UI (prevent prompt injection via stored data)

### Operational safety
- circuit breaker on downstream API instability
- pause bulk jobs if anomaly threshold exceeded
- dead-letter queue for unresolved items

### Data classification (NEW)

| Data type | Classification | Handling |
|---|---|---|
| Card IDs | Internal identifier | Log freely, exclude from LLM prompts |
| Cardholder names | PII | Redact from logs, exclude from LLM prompts |
| Spending limits | Financial-sensitive | Log in audit trail only, encrypt at rest |
| Email addresses | PII | Redact from logs, use only in notification service |
| Policy documents | Internal-confidential | Version-controlled, access-logged |
| LLM prompts/responses | Operational | Log for debugging, auto-expire after 30 days |
| Job execution state | Operational | Full logging, retain for compliance period |

---

## 19) Trade-offs and Alternatives Considered

### Alternative A: Fully autonomous agent executing APIs directly
**Rejected** because:
- unsafe for bulk financial operations
- hard to validate
- poor auditability
- higher hallucination risk

### Alternative B: Fully manual workflow with no AI
**Rejected** because:
- high operator burden
- slower planning and communication
- poor scalability

### Alternative C: All-or-nothing transaction semantics
**Rejected** because:
- impractical for long-running distributed operations
- hard to guarantee across multiple systems
- partial completion is more realistic and easier to communicate

### Chosen design
A hybrid model:
- AI for understanding, retrieval, and communication
- rules engine for safety and approvals
- asynchronous workers for execution reliability

---

## 20) Updated Prototype Scope and Iteration Plan

A strong prototype should focus on a narrow but representative workflow and demonstrate the core operating model clearly.

### Recommended v1 prototype scope
1. Chat-like or form-assisted input for a single workflow: **bulk card spending-limit update**
2. Schema-constrained intent extraction
3. Target resolution and policy retrieval
4. Confirmation screen with counts, exclusions, approval requirement, and cited policy rationale
5. Mock bulk execution across 50 fake cards
6. Live progress updates during execution
7. Injected partial failures
8. Retry failed items
9. Cancel remaining queued items
10. Final summary with exportable failure report

### Product iteration strategy

#### Iteration 0: Narrow assistive workflow
- one high-frequency, high-structure bulk operation
- confirmation-first UX
- async job receipt and progress updates
- retry / cancel / export

#### Iteration 1: Reusable bulk-job framework
- reuse the same job lifecycle for multiple operation types
- expand to adjacent workflows such as freeze / unfreeze or notification-only tasks
- validate that the framework generalizes

#### Iteration 2: Policy-aware operational copilot
- richer retrieval over evolving policy docs
- better explanation of why actions are blocked, approval-gated, or partially skipped
- escalation notes and customer comms drafts

#### Iteration 3: Selective low-risk auto-resolution
- only for well-understood, policy-safe operations
- retain approvals for higher-risk changes
- use historical logs and metrics to tune thresholds

### Suggested tech stack

**Prototype stack**
- Frontend: Next.js / React
- Backend: FastAPI
- Database: Postgres
- Queue: Redis + Celery
- Retrieval: pgvector or lightweight vector retrieval over policy docs
- LLM: OpenRouter-compatible model with structured outputs

**Alternative prototype stack with Convex**
- Frontend: Next.js / React
- Backend / app state: Convex
- Execution workers: separate Python or TypeScript worker service
- Retrieval: attached vector store or external retrieval service
- LLM: OpenRouter-compatible model with structured outputs

**Production-oriented evolution**
- migrate from Celery to Temporal for durable workflow orchestration
- add stronger approval workflow support
- add richer monitoring, audit dashboards, and policy version tooling

---

## 20A) Agent-Ready API Documentation and Context Management

### Documentation principles
1. **Typed contracts first**
2. **Machine-readable + human-readable**
3. **Examples over prose**
4. **Versioned semantics**

### What should be documented for agent use
For each workflow contract, include:
- purpose
- required inputs
- allowed values / enums
- preconditions
- side effects
- idempotency behavior
- retry semantics
- cancellation behavior
- error codes and escalation cases
- example success / partial failure / blocked responses

### How to keep API docs updated
- generate OpenAPI specs from source code where possible
- add contract tests that fail CI when implementation and schema diverge
- publish a lightweight changelog for each API version
- create a single internal reference page per workflow family
- require documentation updates as part of the definition of done for API changes

### Agent-facing tool manifest pattern
Maintain a compact agent tool manifest for each workflow tool:
- tool name
- one-line purpose
- required arguments
- common failure cases
- safe usage notes
- what the tool must never be used for

### Managing context window limits
To keep agent context efficient:
- pass only the workflow-relevant tool docs for the current intent
- retrieve API docs dynamically by operation type instead of stuffing all docs into the prompt
- summarize long policy and API references into compact system-ready notes
- include structured state snapshots rather than verbose log histories
- store prior job state outside the prompt and retrieve only the latest relevant state when needed

### Recommended context packaging for an agent turn
1. current user request
2. extracted intent and parameters
3. current workflow state
4. relevant policy summary with references
5. only the 1-3 workflow contracts relevant to the current action
6. latest job/item status snapshot

---

## 20B) OpenAPI Contract Examples (NEW)

### POST /api/v1/jobs/draft

```yaml
operationId: createBulkJobDraft
summary: Create a draft bulk job from extracted intent
requestBody:
  required: true
  content:
    application/json:
      schema:
        type: object
        required: [operation_type, parameters, requested_by]
        properties:
          operation_type:
            type: string
            enum: [bulk_update_card_limit, bulk_freeze_cards, bulk_notify_cardholders]
          parameters:
            type: object
            properties:
              target_group:
                type: string
              new_limit:
                type: object
                properties:
                  currency: { type: string, enum: [SGD, USD, EUR, GBP] }
                  amount: { type: number, minimum: 0 }
              notify_cardholders:
                type: boolean
          requested_by:
            type: string
            format: uuid
responses:
  201:
    description: Draft job created
    content:
      application/json:
        schema:
          $ref: '#/components/schemas/JobDraft'
  400:
    description: Validation error
  409:
    description: Duplicate job detected (idempotency key match)
```

### GET /api/v1/jobs/{job_id}/status

```yaml
operationId: getJobStatus
summary: Get current job status with item-level breakdown
parameters:
  - name: job_id
    in: path
    required: true
    schema: { type: string, format: uuid }
  - name: include_items
    in: query
    schema: { type: boolean, default: false }
  - name: item_status_filter
    in: query
    schema:
      type: string
      enum: [queued, in_progress, succeeded, failed_retryable, failed_permanent, cancelled, skipped]
responses:
  200:
    description: Job status with optional item details
    content:
      application/json:
        schema:
          type: object
          properties:
            job_id: { type: string }
            status: { type: string }
            progress:
              type: object
              properties:
                total: { type: integer }
                succeeded: { type: integer }
                failed: { type: integer }
                remaining: { type: integer }
                percent_complete: { type: number }
            items:
              type: array
              items: { $ref: '#/components/schemas/JobItem' }
```

---

## 21) Example User Journey

### User input
"Please update the spending limits for 50 cards for the Marketing team to SGD 2,000, and notify the cardholders once done."

### Assistant response
"I found a matching bulk operation request. I'm checking the target cards, policy requirements, and notification list now."

### Confirmation summary
"Ready to proceed.
- 50 cards requested
- 46 eligible for immediate update
- 2 blocked cards will be skipped
- 2 cards require approval due to policy threshold
- 46 cardholders will be notified after successful update
Estimated completion time: 2-4 minutes"

### Agent clicks confirm
System creates Job ID and starts async processing.

### Live updates
- 10 / 46 completed
- 28 / 46 completed; 2 temporary failures retrying
- 46 / 46 update attempts finished
- sending 43 notifications

### Final summary
"Bulk update completed.
- 43 updated successfully
- 2 retried successfully after timeout
- 1 failed permanently because the card is locked
- 43 notifications sent
You can now retry the failed item, export the report, or escalate to Ops."

---

## 22) How This Design Evolves if Volume Increases 10x

1. Move from simple queue workers to a workflow engine such as Temporal
2. Shard item execution across worker pools
3. Add stronger rate limiting and adaptive concurrency per downstream API
4. Introduce job prioritization by customer segment / urgency
5. Add richer observability on queue lag and downstream bottlenecks
6. Precompute policy / team membership caches where safe
7. Split notification sending into separate throughput-controlled pipelines

---

## 23) Where the Design Is Most Fragile

1. **Target resolution quality** — if team membership data is stale, incomplete, or ambiguous, the wrong cards will be targeted. Mitigation: confirmation screen with exact card list, not just count.

2. **Policy complexity** — as policy rules grow, the boundary between "structured registry" and "document-backed" may blur, causing enforcement gaps. Mitigation: version-controlled policy registry with effective dates.

3. **Downstream API inconsistency** — if the card API returns different states on read vs write, precondition checks may pass but execution may fail. Mitigation: execution-time revalidation before each mutation.

4. **Communication trust** — if summaries are inaccurate or confusing, agents will lose confidence in the system. Mitigation: structured templates with deterministic counts, not free-form LLM-generated summaries for critical numbers.

---

## 23A) Risk Register (NEW)

| # | Risk | Likelihood | Impact | Mitigation | Owner |
|---|---|---|---|---|---|
| R1 | LLM extraction misinterprets currency | Medium | High | Schema validation with strict currency enum, confirmation screen | Engineering |
| R2 | Policy registry out of sync with actual policy | Medium | High | Version control, effective dates, policy owner sign-off workflow | Compliance |
| R3 | Card API rate limits cause job timeout | High | Medium | Adaptive concurrency, backoff, progress preservation | Engineering |
| R4 | Agent confirms without reading plan | Medium | High | Require explicit checkboxes for high-risk jobs, show diff from current state | Product |
| R5 | Notification sent for failed update | Low | High | Notification phase gated on item success status, not job-level success | Engineering |
| R6 | Stale team membership data | Medium | Medium | Real-time resolution at plan time, confirmation shows exact card IDs | Platform |
| R7 | LLM provider outage | Low | High | Fallback to manual form input, cached policy context | Engineering |

---

## 24) Conclusion

This design treats the CX Operations Assistant as a **safe orchestration system with AI at the edges, not the core of execution control**.

That is the right shape for this business problem because the highest-risk failure is not "the model answered strangely"; it is **an unsafe or confusing bulk operation**.

The proposed solution therefore:
- converts natural language into a structured plan
- validates against deterministic policy and operational rules
- requires human confirmation for risky actions
- executes asynchronously with item-level tracking
- handles partial failures gracefully
- communicates progress and outcomes clearly
- preserves auditability, idempotency, and recovery paths

This is business-correct, scalable, and practical to prototype within a short assessment window.

---

## Appendix A: Gap Analysis — What This Enhanced PRD Adds

| Gap in original | Section added | What it covers |
|---|---|---|
| No RBAC model | §14A | Roles, permissions, bulk-size-tiered confirmation |
| No SLA / latency targets | §14B | Per-step latency targets, availability targets, anomaly thresholds |
| Vague data model fields | §14 (enhanced) | Added types, constraints, NULLability, new tables (policy_registry, approvals) |
| No API contract examples | §20B | OpenAPI specs for draft creation and status endpoints |
| No model selection guidance | §15 (enhanced) | Model tier recommendations by task type |
| Incomplete failure mode table | §16 (enhanced) | Added anomaly threshold, stale data, rate limiting scenarios |
| No data classification | §18 (enhanced) | PII/financial/operational data handling rules |
| No risk register | §23A | Likelihood/impact matrix with mitigations and owners |
| No observability alert thresholds | §17 (enhanced) | Dashboard-to-alert mapping with specific trigger conditions |
| ASCII-only architecture diagram | See visualizations | Interactive architecture, workflow, state machine, and ERD diagrams |
| No prompt injection mitigation | §18 (enhanced) | Output sanitization before UI rendering |
| Fragility section too terse | §23 (enhanced) | Expanded with specific mitigations per fragility |
