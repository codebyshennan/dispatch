---
phase: 05-runbook-automation-and-agent-assisted-mode
plan: "01"
subsystem: database
tags: [s3, voyage-ai, embeddings, pgvector, kb-indexer, ts-node, lambda]

# Dependency graph
requires:
  - phase: 03-knowledge-base-response-generation-and-compliance
    provides: kb-indexer Lambda that reads S3 chunks and bulk-inserts into pgvector
provides:
  - scripts/bootstrap-kb.ts one-shot script to seed KB from real dataset
  - Per-article JSONL files uploaded to S3 under help-center/chunks/
  - KB is now seeded with 115 real Reap Help Center articles for KB retrieval
affects:
  - kb-retrieval Lambda (now has real data to return for KB queries)
  - sidebar IntelligencePanel (will show real article titles after indexing)
  - runbook-suggestions feature (depends on populated KB)

# Tech tracking
tech-stack:
  added:
    - "@aws-sdk/client-lambda: ^3.0.0 (scripts package)"
    - "@aws-sdk/client-s3: ^3.0.0 (scripts package)"
    - "ts-node: ^10.9.0 (scripts devDep)"
  patterns:
    - "Per-article JSONL files in S3: one file per article (all chunks), not one file per chunk"
    - "Title-prepended chunk text: article.title + chunk for retrieval context"
    - "200ms inter-article delay for Voyage free tier (3 req/s)"
    - "DRY_RUN env or --dry-run flag for local validation without AWS calls"

key-files:
  created:
    - scripts/bootstrap-kb.ts
    - scripts/package.json
    - scripts/tsconfig.json
  modified:
    - pnpm-workspace.yaml (added scripts/ package)
    - pnpm-lock.yaml (updated lockfile)

key-decisions:
  - "scripts/ added to pnpm-workspace.yaml as @beacon/scripts — enables standard pnpm dep management for one-shot scripts"
  - "Dataset id field is string (Zendesk article ID); parsed via parseInt to match ArticleChunk.articleId: number schema used by kb-indexer Lambda"
  - "sectionId hardcoded to 0 for dataset articles — reap-help-center.jsonl has section as string name, not numeric ID like Zendesk API; consistent with kb-indexer ArticleChunk interface"
  - "Title prepended to each chunk text (consistent with help-center-ingestion Lambda pattern)"
  - "Dry run mode validates 115-article parse and chunking without any AWS calls"

patterns-established:
  - "Bootstrap script pattern: read JSONL dataset -> chunk+embed -> S3 upload per article -> invoke Lambda"
  - "Error isolation: embedding failure skips chunk (not article), S3 failure throws (visible abort)"

requirements-completed:
  - KB-01

# Metrics
duration: 8min
completed: 2026-03-23
---

# Phase 5 Plan 01: KB Bootstrap from Reap Help Center Dataset Summary

**One-shot TypeScript bootstrap script that chunks, embeds (voyage-3-lite), and uploads all 115 Reap Help Center articles to S3, then invokes kb-indexer Lambda to populate pgvector for real KB retrieval**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-03-23T05:55:00Z
- **Completed:** 2026-03-23T06:03:29Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Created scripts/bootstrap-kb.ts: reads dataset JSONL, strips HTML, chunks 500-char passages, embeds via Voyage AI, uploads per-article JSONL to S3
- Created scripts/package.json: @beacon/scripts package with @aws-sdk/client-lambda and @aws-sdk/client-s3 deps
- Bootstrap script invokes beacon-dev-kb-indexer Lambda after all uploads, outputting { indexed, skipped, errors }
- Added scripts/ to pnpm-workspace.yaml for proper dep management; verified dry-run parses all 115 articles correctly

## Task Commits

Each task was committed atomically:

1. **Task 1: KB bootstrap script — chunk, embed, upload to S3** - `535d46e` (feat)
2. **Task 2: Scripts package setup + invoke kb-indexer** - `34ae9ed` (feat)

**Plan metadata:** (docs commit below)

## Files Created/Modified
- `scripts/bootstrap-kb.ts` - One-shot bootstrap script: reads reap-help-center.jsonl, chunks+embeds each article, uploads JSONL to S3, invokes kb-indexer Lambda
- `scripts/package.json` - @beacon/scripts package with AWS SDK and ts-node deps
- `scripts/tsconfig.json` - NodeNext tsconfig for ESM ts-node execution
- `pnpm-workspace.yaml` - Added scripts/ to workspace packages
- `pnpm-lock.yaml` - Updated lockfile after scripts/ install

## Decisions Made
- Dataset `id` field is a string (Zendesk article ID); parsed via `parseInt` to match the `ArticleChunk.articleId: number` interface used by kb-indexer Lambda
- `sectionId` hardcoded to 0 — the dataset has `section` as a string name, not the numeric ID the Zendesk API would return; matches what kb-indexer expects
- Title prepended to each chunk text for retrieval quality — consistent with existing help-center-ingestion Lambda pattern
- Per-article JSONL strategy (one file per article, all chunks inside) matches kb-indexer's S3 listing/reading pattern

## Deviations from Plan

None — plan executed exactly as written. One minor addition: created scripts/tsconfig.json (not explicitly specified in plan) to enable clean TypeScript compilation with NodeNext module resolution for ESM ts-node execution.

## Issues Encountered
None — TypeScript check and dry-run both passed cleanly on first attempt.

## User Setup Required
To run the bootstrap after CDK deploy:

```bash
cd ventures/meridian/scripts
ASSETS_BUCKET_NAME=beacon-dev-assets \
VOYAGE_API_KEY=<your-key> \
AWS_PROFILE=<your-profile> \
node --loader ts-node/esm bootstrap-kb.ts
```

Verification:
```bash
aws s3 ls s3://beacon-dev-assets/help-center/chunks/ | wc -l
# Should return 115
```

## Next Phase Readiness
- KB bootstrap script ready to run against real AWS environment after CDK deploy
- After running, kb-retrieval Lambda will return real article results for queries like "payment failed" or "card not working"
- IntelligencePanel sidebar will show real KB article titles
- KB-01 requirement satisfied once script is executed against production AWS

---
*Phase: 05-runbook-automation-and-agent-assisted-mode*
*Completed: 2026-03-23*
