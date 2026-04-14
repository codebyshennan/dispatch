# Dispatch

AI-powered CX triage, resolution, and intelligence system for Reap's Zendesk support organisation. Classifies inbound tickets, generates KB-grounded draft responses, and surfaces actionable intelligence directly in a Zendesk sidebar copilot.

## Context — Technical Assessment

This project is a response to Reap's **CX AI Ops Engineer technical assessment**, which asked candidates to:

> Design an AI-assisted CX Operations Assistant that helps agents fulfill customer requests involving bulk operations — for example, "Update the spending limits for 50 cards for the Marketing team to SGD 2,000, and notify the cardholders once done."

The assessment evaluated solution design (business understanding, workflow optimality, assumptions and trade-offs), responsible AI application, UX for long-running work, and reliability.

**[PRD.md](./PRD.md)** contains the full solution design write-up, covering:
- Problem framing and requirements
- End-to-end workflow (Phases A → D: intake → approval → bulk execution → completion)
- System architecture (bounded planner + deterministic executor model)
- AI usage and guardrails — where LLMs help (intent extraction, plan explanation, failure summaries) and where they must not act (policy enforcement, mutable API calls)
- Reliability design: idempotency, partial-failure isolation, retry strategy, cancellation
- Data model, RBAC, SLA targets, observability plan, security considerations
- Trade-offs and alternatives considered

The **demo app** (`apps/demo/` + `apps/demo-server/`) serves as the functional prototype required by the assessment, demonstrating bulk job submission, live progress updates, partial failure reporting, and retry/cancel flows against a local mock of the card API.

## What it does

| Capability | Description |
|------------|-------------|
| **Auto-classification** | Categorises tickets by type, priority, sentiment, language, compliance risk, and crypto-specific tags |
| **Draft response generation** | Produces KB-grounded response drafts with top-3 KB references and top-3 similar resolved tickets |
| **Zendesk sidebar copilot** | Three-panel ZAF app — Customer Context, Dispatch Intelligence, Runbook Actions |
| **Runbook execution** | One-click actions: check payment status, look up transaction, freeze/unfreeze card, escalate, resend notification |
| **Voice of Customer ingestion** | Scrapes App Store, Google Play, and Trustpilot reviews on a 6–12h cadence |
| **Prompt eval pipeline** | CI-gated accuracy evaluation (≥ 85%) that runs on every `prompts/**` change |

## Architecture

```
Zendesk webhook → EventBridge → SQS → classifyFn → Aurora (pgvector) + DynamoDB
                                                 ↓
                                         responseGenFn → ZAF sidebar
```

All AWS resources are managed by a single CDK stack (`DispatchStack`). See [ARCHITECTURE.md](./ARCHITECTURE.md) for the full system diagram.

## Monorepo layout

```
beacon/
├── apps/
│   └── sidebar/          # ZAF React sidebar (Vite + Zendesk Garden)
├── lambdas/
│   ├── classifier/        # Ticket classification
│   ├── response-generator/ # KB-grounded draft generation
│   ├── webhook/           # Zendesk webhook listener
│   ├── kb-ingestion/      # Help Center → pgvector
│   ├── kb-retrieval/      # Semantic search
│   ├── kb-maintenance/    # KB refresh jobs
│   ├── sidebar-api/       # REST API consumed by the ZAF sidebar
│   ├── runbook-executor/  # Internal API actions
│   ├── auto-sender/       # Automated response sending
│   ├── batch-classifier/  # Bulk classification jobs
│   ├── eval/              # Prompt accuracy eval (CI-triggered)
│   ├── monitoring/        # Alerting and dashboards
│   ├── reporting/         # Analytics
│   ├── voc-ingestion/     # Review platform scraping
│   └── voc-processor/     # VoC normalisation
├── packages/
│   └── core/              # @beacon/core — shared LLM client, circuit breaker, types
├── infra/                 # AWS CDK — DispatchStack
├── prompts/               # Versioned prompt files (YAML frontmatter + Markdown body)
├── datasets/
│   └── golden/            # JSONL golden datasets for eval
└── .github/workflows/
    └── eval.yml           # CI: eval on prompts/** changes
```

## Tech stack

| Layer | Technology |
|-------|------------|
| Language | TypeScript |
| Monorepo | pnpm workspaces + Turborepo |
| Frontend | React 18 + Vite + Zendesk Garden |
| Backend | AWS Lambda (Node.js) |
| Infrastructure | AWS CDK |
| Primary database | Aurora Serverless v2 (PostgreSQL 16 + pgvector) |
| Audit / state | DynamoDB |
| Messaging | SQS + EventBridge |
| LLM — primary | Anthropic (`claude-opus-4-5`, `claude-haiku-3-5`) |
| LLM — fallback | OpenAI `gpt-4o` |

## LLM model tiering

| Task | Model | Rationale |
|------|-------|-----------|
| Classification, response drafts | `claude-opus-4-5` | Complex, high-stakes |
| Eval runner, intent detection | `claude-haiku-3-5` | High-volume, latency-sensitive |
| Fallback (circuit breaker open) | `gpt-4o` | Resilience when Anthropic is down |

## Getting started

**Prerequisites:** Node.js 20+, pnpm 10+, AWS CLI configured, `zcli` (for sidebar deployment)

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Type-check all packages
pnpm typecheck

# Run the eval pipeline locally
pnpm eval

# Start sidebar in dev mode
cd apps/sidebar && pnpm dev
```

### Deploy infrastructure

```bash
cd infra
pnpm build
cdk deploy --all
```

### Deploy the sidebar

```bash
cd apps/sidebar
pnpm build
pnpm deploy          # runs: zcli apps:update dist
```

## Key packages

### `@beacon/core`

Shared utilities used by all Lambda functions:

- **`llm/invoke()`** — unified LLM call with 3× retry, exponential backoff, Zod output validation, and cost audit logging
- **`circuit-breaker/`** — DynamoDB-backed circuit breaker protecting Anthropic, OpenAI, and Zendesk API calls

Circuit breaker state machine:
```
CLOSED ──(5 failures / 60s window)──► OPEN ──(60s)──► HALF_OPEN ──(success)──► CLOSED
                                                                   └──(failure)──► OPEN
```

## Prompt management

Prompts are versioned Markdown files under `prompts/` with YAML frontmatter:

```
prompts/
├── classification/v1.md
├── response-generation/v1.md
├── evaluation/judge.md
└── system/classification.md
```

The CI pipeline (`eval.yml`) runs the eval Lambda against `datasets/golden/` on every `prompts/**` change and blocks merges if accuracy drops below 85%.

## AWS resources

| Resource | Type | Purpose |
|----------|------|---------|
| `beacon-{env}-tickets-queue` | SQS | Buffers inbound Zendesk ticket events |
| `beacon-{env}-tickets-dlq` | SQS + CloudWatch Alarm | Dead-letter queue; alarm at depth > 10 |
| `beacon-{env}-audit-log` | DynamoDB | LLM calls, circuit breaker state, routing decisions |
| `beacon-{env}-idempotency` | DynamoDB | Webhook deduplication keys (TTL-backed) |
| `beacon-{env}-assets-{acct}` | S3 | KB source documents and attachments |
| `beacon-{env}-event-bus` | EventBridge | Custom event bus for ticket events |
| `beacon-{env}-db` | Aurora Serverless v2 | PostgreSQL 16 + pgvector (0.5–4 ACU, encrypted) |
| `beacon-{env}-eval` | Lambda | CI-triggered prompt accuracy gate |

## Environment variables

Each Lambda reads its configuration from environment variables injected by CDK. Key variables:

| Variable | Used by | Purpose |
|----------|---------|---------|
| `AUDIT_TABLE_NAME` | All Lambdas | DynamoDB audit log table name |
| `IDEMPOTENCY_TABLE_NAME` | `webhook`, `classifier` | Deduplication table |
| `AURORA_SECRET_ARN` | `classifier`, `response-generator`, `kb-*` | Aurora credentials secret |
| `ANTHROPIC_API_KEY_SECRET_ARN` | All LLM Lambdas | Anthropic API key secret |
| `ZENDESK_SUBDOMAIN` | `sidebar-api`, `runbook-executor` | Zendesk instance subdomain |
