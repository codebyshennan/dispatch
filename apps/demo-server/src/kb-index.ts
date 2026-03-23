import { LocalIndex } from 'vectra';
import { OpenAI } from 'openai';
import { createReadStream } from 'node:fs';
import * as readline from 'node:readline';
import * as path from 'node:path';
import type { KBResult } from '@beacon/core';

const INDEX_DIR = path.resolve(process.cwd(), '.beacon-demo-index');
const DATASET_PATH = path.resolve(process.cwd(), 'datasets/reap-help-center.jsonl');
const EMBED_MODEL = 'text-embedding-3-small';

let index: LocalIndex | null = null;
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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

async function embed(text: string): Promise<number[]> {
  const res = await openai.embeddings.create({
    model: EMBED_MODEL,
    input: text.slice(0, 8000), // stay within token limit
  });
  return res.data[0].embedding;
}

export async function buildKBIndex(): Promise<void> {
  console.log('[kb-index] Building Vectra index from dataset...');
  const idx = new LocalIndex(INDEX_DIR);
  await idx.createIndex({ version: 1, deleteIfExists: true });

  const articles = await readArticles();
  console.log(`[kb-index] Embedding ${articles.length} articles...`);

  for (let i = 0; i < articles.length; i++) {
    const article = articles[i];
    const text = `${article.title}\n\n${article.body}`;
    const vector = await embed(text);
    await idx.insertItem({
      vector,
      metadata: {
        article_id: Number(article.id),
        title: article.title,
        html_url: article.url,
        updated_at: article.updated_at,
        // Store first 500 chars as excerpt for KB card rendering
        text: article.body.slice(0, 500),
      },
    });
    if ((i + 1) % 10 === 0) console.log(`[kb-index]   ${i + 1}/${articles.length}`);
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
  const queryVector = await embed(query);
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
