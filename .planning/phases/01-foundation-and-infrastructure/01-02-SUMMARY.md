---
phase: 01-foundation-and-infrastructure
plan: "02"
subsystem: infra
tags: [aws-cdk, dynamodb, iam, lambda, cloudformation]

# Dependency graph
requires:
  - phase: 01-foundation-and-infrastructure
    provides: "@beacon/core types: AuditLogEntry, CircuitBreakerState"
provides:
  - DynamoDB AuditLog table (pk/sk composite, TTL)
  - DynamoDB CircuitBreaker table (pk)
  - DispatchStack CDK stack with Lambda IAM execution role
  - CDK app entry point (src/app.ts) for deployment
affects:
  - lambdas (will use Lambda execution role ARN)
  - future phases deploying Lambda functions

# Tech tracking
tech-stack:
  added:
    - aws-cdk-lib@2.244.0
    - constructs@10.5.1
    - aws-cdk@2.1112.0 (CLI)
  patterns:
    - "CDK stacks split by concern (DynamoDbStack, DispatchStack)"
    - "appEnv parameter controls retention policies and naming"
    - "CloudFormation outputs export ARNs for cross-stack references"

key-files:
  created:
    - infra/src/stacks/dynamodb.ts
    - infra/src/stacks/beacon-stack.ts
    - infra/src/app.ts
  modified:
    - infra/src/index.ts (replaced stub with real exports)
    - infra/package.json (added aws-cdk-lib, constructs, aws-cdk)
    - pnpm-lock.yaml

key-decisions:
  - "DynamoDbStack as separate stack (not nested construct) to allow independent updates"
  - "PAY_PER_REQUEST billing for all tables (no capacity planning required)"
  - "TTL attribute on AuditLog for auto-expiry of old records"
  - "appEnv parameter drives RemovalPolicy: RETAIN in prod, DESTROY in dev"
  - "Default region ap-southeast-1 (Southeast Asia deployment)"

patterns-established:
  - "Stack per concern pattern: DynamoDbStack separate from DispatchStack"
  - "APP_ENV env var for environment selection (dev | staging | prod)"
  - "CloudFormation export names: meridian-{resource}-{type}"

requirements-completed: []

# Metrics
duration: 3min
completed: 2026-03-23
---

# Phase 01 Plan 02: AWS CDK Infrastructure Stacks Summary

**CDK infrastructure with DynamoDB tables (audit-log + circuit-breaker), Lambda IAM role, and CDK app entry point deployed via aws-cdk-lib@2.244.0**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-22T18:13:48Z
- **Completed:** 2026-03-22T18:16:52Z
- **Tasks:** 5 (4 with commits, 1 verification-only)
- **Files modified:** 7

## Accomplishments

- aws-cdk-lib and constructs installed in infra package
- DynamoDB tables defined: AuditLog (pk/sk/TTL) and CircuitBreaker (pk)
- DispatchStack CDK stack with Lambda IAM execution role
- CDK app entry point (src/app.ts) for `cdk deploy` workflow
- Full workspace builds and typechecks cleanly (turbo)

## Task Commits

Each task was committed atomically:

1. **Task 1: Install CDK dependencies** - `6faa3c4` (chore)
2. **Task 2: DynamoDB table constructs** - `c9ded27` (feat)
3. **Task 3: DispatchStack CDK stack** - `6b8b942` (feat)
4. **Task 4: CDK app entry point** - `5e74d1e` (feat)
5. **Task 5: Workspace build verification** - no commit (verification only, no source changes)

**Plan metadata:** (docs commit below)

## Files Created/Modified

- `infra/src/stacks/dynamodb.ts` - DynamoDbStack with AuditLog and CircuitBreaker tables
- `infra/src/stacks/beacon-stack.ts` - DispatchStack composing DynamoDb + Lambda IAM role
- `infra/src/app.ts` - CDK app entry point, reads APP_ENV and CDK_DEFAULT_REGION
- `infra/src/index.ts` - Replaced stub with real exports (DynamoDbStack, DispatchStack)
- `infra/package.json` - Added aws-cdk-lib@2.244.0, constructs@10.5.1, aws-cdk@2.1112.0
- `pnpm-lock.yaml` - Updated lockfile

## Decisions Made

- Used DynamoDbStack as a separate top-level stack (not a nested construct) to allow independent DynamoDB updates without touching the main stack
- PAY_PER_REQUEST billing selected for all tables — no capacity planning needed at this stage
- TTL attribute included on AuditLog table to support future auto-expiry configuration
- `appEnv` parameter controls `RemovalPolicy`: DESTROY in dev/staging, RETAIN in prod
- Default region set to `ap-southeast-1` (Southeast Asia)

## Deviations from Plan

None - plan executed exactly as written.

The only minor variation: the initial package version I specified (aws-cdk@2.188.0) didn't exist on the registry. I checked the actual latest versions and used aws-cdk-lib@2.244.0 / aws-cdk@2.1112.0. This is consistent with the plan's intent, not a deviation.

## Issues Encountered

- Initial `pnpm install` failed because `aws-cdk@2.188.0` version doesn't exist. Checked registry for actual latest versions (aws-cdk-lib@2.244.0, aws-cdk@2.1112.0) and resolved immediately.

## User Setup Required

None - no external service configuration required. CDK deployment (`cdk deploy`) requires AWS credentials configured separately, but that is operational setup, not infrastructure code.

## Next Phase Readiness

- infra package fully functional with CDK stacks defined
- Lambda execution role ARN available as CloudFormation output for lambda packages to reference
- DynamoDB table names/ARNs exported for use by Lambda handlers
- Ready for Phase 02: LLM integration (lambdas/eval implementation)

---
*Phase: 01-foundation-and-infrastructure*
*Completed: 2026-03-23*
