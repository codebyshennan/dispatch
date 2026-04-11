# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Beacon is an AI-powered CX triage and resolution system for Reap's Zendesk support team. It classifies inbound tickets, generates KB-grounded draft responses, and surfaces intelligence in a Zendesk sidebar copilot (ZAF app).

## Commands

```bash
# Root (all packages via Turborepo)
pnpm install          # Install all workspace dependencies
pnpm build            # Build all packages
pnpm typecheck        # Type-check all packages
pnpm lint             # Lint all packages
pnpm eval             # Run the prompt eval pipeline locally (requires .env)

# Sidebar (ZAF React app)
cd apps/sidebar && pnpm dev
cd apps/sidebar && pnpm build
cd apps/sidebar && pnpm deploy   # zcli apps:update dist

# Demo server (Hono, local dev)
cd apps/demo-server && pnpm dev  # runs tsx watch from repo root with --env-file=.env
cd apps/demo-server && pnpm test # vitest integration tests (requires .env at repo root)

# Infrastructure (AWS CDK)
cd infra && pnpm build
cdk deploy --all
```

## Monorepo Structure

```
beacon/
├── apps/
│   ├── sidebar/          # ZAF React sidebar (Vite + Zendesk Garden) — three panels
│   └── demo-server/      # Local Hono server simulating the production API for demo
├── lambdas/              # AWS Lambda functions (Node.js, esbuild-bundled)
├── packages/
│   └── core/             # @beacon/core — shared by all Lambdas
├── infra/                # AWS CDK — BeaconStack
├── prompts/              # Versioned prompt files (YAML frontmatter + Markdown body)
└── datasets/             # JSONL golden datasets for eval
```

## Architecture

**Ticket flow:** Zendesk webhook → EventBridge → SQS → `classifier` Lambda → Aurora (pgvector) + DynamoDB → `response-generator` Lambda → ZAF sidebar

**Key patterns:**
- Every LLM call goes through `@beacon/core`'s `invoke()` — never call Anthropic/OpenAI/OpenRouter SDKs directly in Lambdas
- `invoke()` handles 3× retry with exponential backoff, Zod schema validation, JSON repair, and audit log entry creation. The **caller** persists the `auditEntry` to DynamoDB.
- The circuit breaker is DynamoDB-backed and shared across Lambda instances: `CLOSED → OPEN (5 failures/60s) → HALF_OPEN → CLOSED`
- All AWS resources are named `beacon-{env}-{resource}` and managed in a single CDK stack (`BeaconStack`)

## `@beacon/core` (`packages/core`)

The single shared package imported by every Lambda. Key exports:
- `invoke(userContent, options)` — unified LLM abstraction supporting `anthropic`, `openai`, and `openrouter` providers
- `MeridianLLMError` — structured error thrown after retries exhausted; carries `auditEntry` for DynamoDB write
- `ClassificationSchema`, `KBResultSchema`, `SidebarPayload` — canonical Zod schemas shared across Lambdas
- Circuit breaker utilities

## LLM Provider Configuration

The `provider` field in `LLMOptions` selects the backend:
- `'anthropic'` → Anthropic SDK directly (`ANTHROPIC_API_KEY`)
- `'openrouter'` → OpenAI SDK pointed at `https://openrouter.ai/api/v1` (`OPENROUTER_API_KEY`)
- `'openai'` → OpenAI SDK (`OPENAI_API_KEY`)

Model tiering convention: complex tasks (classification, response drafts) → `claude-opus-4-5`; high-volume/routine tasks → `claude-haiku-3-5`; fallback → `gpt-4o`.

## Demo App (`apps/demo-server`)

A local Hono server that replicates the production Lambda pipeline without AWS dependencies. Uses Vectra (local vector index at `.beacon-demo-index/`) and Cohere embeddings instead of Aurora pgvector. Requires a `.env` file at the repo root. The demo React app (`apps/demo`) connects to this server.

Integration tests in `apps/demo-server/src/__tests__/` use vitest and read `.env` from the repo root via `vitest.config.ts`.

## Prompts

Prompts under `prompts/` are versioned Markdown files with YAML frontmatter. The CI pipeline (`.github/workflows/eval.yml`) runs `pnpm eval` against `datasets/golden/` on every `prompts/**` change and blocks merges if accuracy drops below 85%.

## DynamoDB Access Patterns

The `beacon-{env}-audit-log` table uses the following key patterns:
- `pk: AUDIT#<promptHash>` / `sk: <ISO timestamp>` — LLM call audit entries
- `pk: TICKET#<ticketId>` / `sk: CLASSIFICATION#<ISO timestamp>` — classifier output
- `pk: TICKET#<ticketId>` / `sk: SIMILAR#<category>` — similar ticket placeholders
- `pk: CB#<service>` — circuit breaker state

## Environment Variables

All Lambdas read config from env vars injected by CDK. Key vars: `AUDIT_TABLE_NAME`, `IDEMPOTENCY_TABLE_NAME`, `AURORA_SECRET_ARN`, `ANTHROPIC_API_KEY_SECRET_ARN`, `ZENDESK_SUBDOMAIN`, `OPENROUTER_API_KEY`.
