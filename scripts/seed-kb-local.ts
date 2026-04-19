/**
 * seed-kb-local.ts
 *
 * Reads datasets/reap-help-center.jsonl, embeds each article locally via
 * OpenRouter, and upserts into Convex kb_articles for both dev and prod.
 *
 * Usage:
 *   npx tsx scripts/seed-kb-local.ts
 *
 * Requires .env.local at repo root with OPENROUTER_API_KEY and
 * NEXT_PUBLIC_CONVEX_URL (dev). Set CONVEX_PROD_URL for prod.
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";

// ── load env ──────────────────────────────────────────────────────────────────

function loadEnv(): Record<string, string> {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  try {
    const lines = readFileSync(resolve(root, ".env.local"), "utf-8").split("\n");
    const env: Record<string, string> = {};
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx === -1) continue;
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim().replace(/\s*#.*$/, "");
      env[key] = val;
    }
    return env;
  } catch {
    return {};
  }
}

const ENV = loadEnv();
const OPENROUTER_KEY = ENV.OPENROUTER_API_KEY ?? process.env.OPENROUTER_API_KEY ?? "";
const DEV_URL = ENV.NEXT_PUBLIC_CONVEX_URL ?? process.env.NEXT_PUBLIC_CONVEX_URL ?? "";
const PROD_URL = ENV.CONVEX_PROD_URL ?? process.env.CONVEX_PROD_URL ?? "";
const EMBED_MODEL = "text-embedding-3-small";
const BATCH = 20;

// ── types ─────────────────────────────────────────────────────────────────────

interface RawArticle {
  id: string | number;
  title: string;
  url: string;
  body?: string;
  updated_at: string;
}

// ── helpers ───────────────────────────────────────────────────────────────────

async function embedTexts(texts: string[]): Promise<number[][]> {
  const res = await fetch("https://openrouter.ai/api/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENROUTER_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: EMBED_MODEL,
      input: texts.map((t) => t.slice(0, 8000)),
      dimensions: 1536,
    }),
  });
  if (!res.ok) throw new Error(`OpenRouter embed error ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { data: Array<{ embedding: number[] }> };
  return data.data.map((d) => d.embedding);
}

async function seedDeployment(url: string, label: string, articles: RawArticle[]) {
  console.log(`\n[${label}] Seeding ${articles.length} articles → ${url}`);
  const client = new ConvexHttpClient(url);
  let total = 0;

  for (let i = 0; i < articles.length; i += BATCH) {
    const batch = articles.slice(i, i + BATCH);
    const texts = batch.map((a) => `${a.title}\n\n${a.body ?? ""}`.slice(0, 8000));
    const embeddings = await embedTexts(texts);

    const result = await client.action(anyApi.kb.seedBatch, {
      articles: batch.map((a, j) => ({
        articleId: String(a.id),
        title: a.title,
        url: a.url,
        body: (a.body ?? "").slice(0, 2000),
        updatedAt: a.updated_at,
        embedding: embeddings[j],
      })),
    });

    total += result.inserted;
    console.log(`[${label}] ${total}/${articles.length} done`);
  }

  console.log(`[${label}] Complete — ${total} articles upserted`);
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
  if (!OPENROUTER_KEY) throw new Error("OPENROUTER_API_KEY not set");
  if (!DEV_URL) throw new Error("NEXT_PUBLIC_CONVEX_URL not set");

  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const datasetPath = resolve(root, "datasets/reap-help-center.jsonl");
  const lines = readFileSync(datasetPath, "utf-8").split("\n").filter((l) => l.trim());
  const articles: RawArticle[] = lines.map((l) => JSON.parse(l) as RawArticle);
  console.log(`Loaded ${articles.length} articles from ${datasetPath}`);

  await seedDeployment(DEV_URL, "dev", articles);

  if (PROD_URL) {
    await seedDeployment(PROD_URL, "prod", articles);
  } else {
    console.log("\n[prod] Skipped — set CONVEX_PROD_URL in .env.local to seed prod");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
