import { LocalIndex } from 'vectra';
import { CohereClient } from 'cohere-ai';
import { createReadStream } from 'node:fs';
import * as readline from 'node:readline';
import * as path from 'node:path';
import type { KBResult } from '@beacon/core';

const INDEX_DIR = path.resolve(process.cwd(), '.beacon-demo-index');
const DATASET_PATH = path.resolve(process.cwd(), 'datasets/reap-help-center.jsonl');
const EMBED_MODEL = 'embed-english-v3.0';

let index: LocalIndex | null = null;
const cohere = new CohereClient({ token: process.env.COHERE_API_KEY });

interface Article {
  id: string;
  title: string;
  url: string;
  body: string;
  updated_at: string;
}

async function readArticles(): Promise<Article[]> {
  const articles: Article[] = [];
  const rl = readline.createInterface({ input: createReadStream(DATASET_PATH) });
  for await (const line of rl) {
    if (!line.trim()) continue;
    const raw = JSON.parse(line);
    articles.push({
      id: String(raw.id),
      title: raw.title,
      url: raw.url,
      body: raw.body,
      updated_at: raw.updated_at,
    });
  }
  return articles;
}

const BATCH_SIZE = 90; // Cohere max is 96; stay under trial rate limit (100 calls/min)

async function embedBatch(texts: string[], inputType: 'search_document' | 'search_query'): Promise<number[][]> {
  const res = await cohere.embed({
    texts: texts.map(t => t.slice(0, 4096)),
    model: EMBED_MODEL,
    inputType,
  });
  const embeddings = Array.isArray(res.embeddings) ? res.embeddings : res.embeddings.float;
  if (!Array.isArray(embeddings) || !Array.isArray(embeddings[0])) {
    throw new Error('Cohere embed returned unexpected shape');
  }
  return embeddings as number[][];
}

async function embed(text: string, inputType: 'search_document' | 'search_query'): Promise<number[]> {
  const results = await embedBatch([text], inputType);
  return results[0];
}

export async function buildKBIndex(): Promise<void> {
  console.log('[kb-index] Building Vectra index from dataset...');
  const idx = new LocalIndex(INDEX_DIR);
  await idx.createIndex({ version: 1, deleteIfExists: true });

  const articles = await readArticles();
  console.log(`[kb-index] Embedding ${articles.length} articles in batches of ${BATCH_SIZE}...`);

  for (let i = 0; i < articles.length; i += BATCH_SIZE) {
    const batch = articles.slice(i, i + BATCH_SIZE);
    const texts = batch.map(a => `${a.title}\n\n${a.body}`);
    const vectors = await embedBatch(texts, 'search_document');

    for (let j = 0; j < batch.length; j++) {
      const article = batch[j];
      await idx.insertItem({
        vector: vectors[j],
        metadata: {
          article_id: Number(article.id),
          title: article.title,
          html_url: article.url,
          updated_at: article.updated_at,
          text: article.body.slice(0, 500),
        },
      });
    }
    console.log(`[kb-index]   ${Math.min(i + BATCH_SIZE, articles.length)}/${articles.length}`);
  }

  index = idx;
  console.log('[kb-index] Index built and saved to .beacon-demo-index/');
}

export async function loadOrBuildKBIndex(): Promise<void> {
  const idx = new LocalIndex(INDEX_DIR);
  if (await idx.isIndexCreated()) {
    console.log('[kb-index] Loading existing index from .beacon-demo-index/');
    index = idx;
  } else {
    await buildKBIndex();
  }
}

export async function searchKB(query: string, topK = 5): Promise<KBResult[]> {
  if (!index) throw new Error('KB index not loaded — call loadOrBuildKBIndex() first');
  const queryVector = await embed(query, 'search_query');
  const results = await index.queryItems(queryVector, topK);
  return results.map(r => ({
    article_id: r.item.metadata.article_id as number,
    title: r.item.metadata.title as string,
    html_url: r.item.metadata.html_url as string,
    updated_at: r.item.metadata.updated_at as string,
    text: r.item.metadata.text as string,
    similarity: r.score,
  }));
}
