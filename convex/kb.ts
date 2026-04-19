"use node";
import { v } from "convex/values";
import { internalAction, action } from "./_generated/server";
import { internal, api } from "./_generated/api";
import OpenAI from "openai";
import * as fs from "node:fs";
import * as path from "node:path";
import * as readline from "node:readline";

const EMBED_MODEL = "text-embedding-3-small";
const EMBED_DIM = 1536;
const DATASET_PATH = path.resolve(process.cwd(), "datasets/reap-help-center.jsonl");

interface Article {
  id: string;
  title: string;
  url: string;
  body: string;
  updated_at: string;
}

function openaiClient() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY not set");
  return new OpenAI({ baseURL: "https://openrouter.ai/api/v1", apiKey });
}

async function embedTexts(client: OpenAI, texts: string[]): Promise<number[][]> {
  const res = await client.embeddings.create({
    model: EMBED_MODEL,
    input: texts.map((t) => t.slice(0, 8000)),
    dimensions: EMBED_DIM,
  });
  return res.data.map((d) => d.embedding);
}

// ── seed ──────────────────────────────────────────────────────────────────────
// Run once: npx convex run kb:seed
export const seed = internalAction({
  args: {},
  handler: async (ctx) => {
    const articles: Article[] = [];
    const rl = readline.createInterface({ input: fs.createReadStream(DATASET_PATH) });
    for await (const line of rl) {
      if (!line.trim()) continue;
      const raw = JSON.parse(line);
      articles.push({
        id: String(raw.id),
        title: raw.title,
        url: raw.url,
        body: raw.body ?? "",
        updated_at: raw.updated_at,
      });
    }

    const client = openaiClient();
    const BATCH = 20;
    let inserted = 0;

    for (let i = 0; i < articles.length; i += BATCH) {
      const batch = articles.slice(i, i + BATCH);
      const texts = batch.map((a) => `${a.title}\n\n${a.body}`.slice(0, 8000));
      const embeddings = await embedTexts(client, texts);

      await ctx.runMutation(internal.kb_queries.insertArticles, {
        articles: batch.map((a, j) => ({
          articleId: a.id,
          title: a.title,
          url: a.url,
          body: a.body.slice(0, 2000),
          updatedAt: a.updated_at,
          embedding: embeddings[j],
        })),
      });
      inserted += batch.length;
      console.log(`[kb:seed] inserted ${inserted}/${articles.length}`);
    }

    return { inserted };
  },
});

// ── seedBatch ─────────────────────────────────────────────────────────────────
// Called by scripts/seed-kb-local.ts with pre-embedded article data.
export const seedBatch = action({
  args: {
    articles: v.array(
      v.object({
        articleId: v.string(),
        title: v.string(),
        url: v.string(),
        body: v.string(),
        updatedAt: v.string(),
        embedding: v.array(v.float64()),
      })
    ),
  },
  handler: async (ctx, args) => {
    await ctx.runMutation(internal.kb_queries.insertArticles, {
      articles: args.articles,
    });
    return { inserted: args.articles.length };
  },
});

// ── searchKB ──────────────────────────────────────────────────────────────────
export const searchKB = action({
  args: { query: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, args): Promise<{ id: string; title: string; url: string; snippet: string }[]> => {
    const client = openaiClient();
    const [embedding] = await embedTexts(client, [args.query]);

    const hits = await ctx.vectorSearch("kb_articles", "by_embedding", {
      vector: embedding,
      limit: args.limit ?? 5,
    });

    const docs = await ctx.runQuery(api.kb_queries.getArticlesByIds, {
      ids: hits.map((h) => h._id),
    });

    return docs
      .filter(Boolean)
      .map((doc) => ({
        id: doc!.articleId,
        title: doc!.title,
        url: doc!.url,
        snippet: doc!.body.slice(0, 200),
      }));
  },
});
