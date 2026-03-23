# Meridian — Roadmap

## Phase 01: Foundation and Infrastructure

**Plans:** 1/3 plans complete

| Plan | Name | Status | Summary |
|------|------|--------|---------|
| 01-01 | Monorepo Scaffold + Core Types | Done | Shared types, Zod schemas, stub packages |
| 01-02 | AWS CDK Infrastructure Stacks | Done | DynamoDB tables, Lambda IAM role, CDK app |
| 01-03 | pgvector enablement + orphaned stack cleanup | Gap closure | Enable pgvector on Aurora; remove DynamoDbStack |
| 01-04 | Eval Lambda HTTP handler | Gap closure | Wire /eval/run endpoint to runEval() |

Plans:
- [x] 01-01-PLAN.md — Monorepo scaffold + @meridian/core shared types and schemas
- [x] 01-02-PLAN.md — AWS CDK infrastructure stacks (DynamoDB, SQS, Aurora, S3, IAM)
- [ ] 01-03-PLAN.md — pgvector CDK custom resource + remove orphaned DynamoDbStack
- [ ] 01-04-PLAN.md — Implement eval Lambda /eval/run HTTP handler (not a 501 stub)

## Phase 02: LLM Integration

| Plan | Name | Status |
|------|------|--------|
| 02-01 | LLM Client + Eval Lambda | Planned |

## Phase 03: Zendesk Integration

| Plan | Name | Status |
|------|------|--------|
| 03-01 | Zendesk Webhook + Routing | Planned |
