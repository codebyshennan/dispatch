/**
 * bootstrap-kb.ts
 *
 * One-shot script to seed the KB from datasets/reap-help-center.jsonl.
 * Reads each article, chunks + embeds its body, uploads per-article JSONL
 * files to S3 under help-center/chunks/, then invokes the kb-indexer Lambda.
 *
 * Usage:
 *   ASSETS_BUCKET_NAME=... VOYAGE_API_KEY=... \
 *     node --loader ts-node/esm bootstrap-kb.ts [path/to/reap-help-center.jsonl]
 *
 * Optional env:
 *   KB_INDEXER_FUNCTION_NAME  (default: beacon-dev-kb-indexer)
 *   DRY_RUN=true              (parse + chunk only, skip S3 upload and Lambda invoke)
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface HelpCenterArticle {
  id: string;
  title: string;
  url: string;
  category: string;
  section: string;
  body: string;
  updated_at: string;
}

interface ArticleChunk {
  articleId: number;
  title: string;
  htmlUrl: string;
  updatedAt: string;
  sectionId: number;
  chunkIndex: number;
  text: string;
  embedding: number[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function chunkText(text: string, chunkSize = 500): string[] {
  // Strip any HTML tags (body may be plain text, but strip defensively)
  const stripped = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const chunks: string[] = [];
  for (let i = 0; i < stripped.length; i += chunkSize) {
    const chunk = stripped.slice(i, i + chunkSize).trim();
    if (chunk.length > 50) {
      chunks.push(chunk);
    }
  }
  return chunks;
}

async function embedText(text: string, voyageKey: string): Promise<number[] | null> {
  const res = await fetch('https://api.voyageai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${voyageKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      input: [text],
      model: 'voyage-3-lite',
      input_type: 'document',
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.warn(`  Voyage API error ${res.status}: ${body}`);
    return null;
  }

  const data = await res.json() as { data: Array<{ embedding: number[] }> };
  const embedding = data.data[0]?.embedding ?? [];

  if (embedding.length !== 512) {
    console.warn(`  Unexpected embedding dimension: ${embedding.length} (expected 512)`);
    return null;
  }

  return embedding;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const isDryRun = process.env.DRY_RUN === 'true' || process.argv.includes('--dry-run');

  const bucketName = process.env.ASSETS_BUCKET_NAME;
  const voyageKey = process.env.VOYAGE_API_KEY;
  const functionName = process.env.KB_INDEXER_FUNCTION_NAME ?? 'beacon-dev-kb-indexer';

  if (!isDryRun) {
    if (!bucketName) {
      console.error('Error: ASSETS_BUCKET_NAME env var is required');
      process.exit(1);
    }
    if (!voyageKey) {
      console.error('Error: VOYAGE_API_KEY env var is required');
      process.exit(1);
    }
  }

  // Resolve dataset path
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const datasetPath = process.argv[2]
    ? resolve(process.argv[2])
    : resolve(__dirname, '../datasets/reap-help-center.jsonl');

  console.log(`Reading dataset: ${datasetPath}`);

  const raw = readFileSync(datasetPath, 'utf-8');
  const lines = raw.split('\n').filter((l) => l.trim().length > 0);
  const articles: HelpCenterArticle[] = lines.map((line, i) => {
    try {
      return JSON.parse(line) as HelpCenterArticle;
    } catch (err) {
      throw new Error(`Failed to parse JSONL line ${i + 1}: ${err}`);
    }
  });

  const total = articles.length;
  console.log(`Parsed ${total} articles from dataset`);

  if (isDryRun) {
    console.log('Dry run mode — skipping S3 upload and Lambda invocation');
    // Validate chunking logic on a sample article
    const sample = articles[0];
    if (sample) {
      const chunks = chunkText(sample.body);
      console.log(`Sample article "${sample.title}": ${chunks.length} chunk(s)`);
    }
    console.log('Dry run complete');
    return;
  }

  const s3 = new S3Client({});
  let processedArticles = 0;
  let totalChunks = 0;
  let skippedChunks = 0;

  for (const article of articles) {
    const articleId = parseInt(article.id, 10);
    const chunks = chunkText(article.body);
    const articleChunks: ArticleChunk[] = [];

    for (let i = 0; i < chunks.length; i++) {
      // Prepend title for retrieval context (consistent with help-center-ingestion Lambda)
      const chunkText = `${article.title}\n\n${chunks[i]}`;

      let embedding: number[] = [];
      try {
        const result = await embedText(chunkText, voyageKey!);
        if (result === null) {
          console.warn(`  Warning: embedding failed for article ${article.id} chunk ${i} — skipping chunk`);
          skippedChunks++;
          continue;
        }
        embedding = result;
      } catch (err) {
        console.warn(`  Warning: embedding error for article ${article.id} chunk ${i} — skipping chunk:`, err);
        skippedChunks++;
        continue;
      }

      articleChunks.push({
        articleId,
        title: article.title,
        htmlUrl: article.url,
        updatedAt: article.updated_at,
        sectionId: 0,
        chunkIndex: i,
        text: chunkText,
        embedding,
      });
    }

    if (articleChunks.length > 0) {
      // Upload one JSONL file per article (all chunks concatenated)
      const jsonlContent = articleChunks.map((c) => JSON.stringify(c)).join('\n');
      const s3Key = `help-center/chunks/article-${articleId}.jsonl`;

      await s3.send(new PutObjectCommand({
        Bucket: bucketName!,
        Key: s3Key,
        Body: jsonlContent,
        ContentType: 'application/x-ndjson',
      }));

      totalChunks += articleChunks.length;
    }

    processedArticles++;

    // Log progress every 10 articles
    if (processedArticles % 10 === 0 || processedArticles === total) {
      console.log(`Processed ${processedArticles}/${total}: ${article.title}`);
    }

    // Rate limit: 200ms between articles (Voyage free tier: 3 req/s)
    if (processedArticles < total) {
      await sleep(200);
    }
  }

  console.log(`\nUpload complete: ${processedArticles} articles, ${totalChunks} chunks (${skippedChunks} chunks skipped)`);

  // ---------------------------------------------------------------------------
  // Invoke kb-indexer Lambda to bulk-insert chunks into pgvector
  // ---------------------------------------------------------------------------
  const lambdaClient = new LambdaClient({});

  console.log(`\nInvoking ${functionName}...`);
  const invokeResult = await lambdaClient.send(new InvokeCommand({
    FunctionName: functionName,
    InvocationType: 'RequestResponse',
    LogType: 'Tail',
  }));

  const logBytes = invokeResult.LogResult
    ? Buffer.from(invokeResult.LogResult, 'base64').toString()
    : '';
  const payload = invokeResult.Payload
    ? JSON.parse(Buffer.from(invokeResult.Payload).toString())
    : {};

  console.log('Indexer result:', payload);

  if (invokeResult.FunctionError) {
    console.error('Indexer Lambda error. Logs:', logBytes);
    process.exit(1);
  }

  console.log('Bootstrap complete.');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
