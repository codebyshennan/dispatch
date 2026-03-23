import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

const s3 = new S3Client({});

interface ZendeskArticle {
  id: number;
  title: string;
  body: string;
  html_url: string;
  updated_at: string;
  section_id: number;
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

function chunkText(text: string, chunkSize = 500): string[] {
  // Strip HTML tags for clean text chunking
  const stripped = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const chunks: string[] = [];
  for (let i = 0; i < stripped.length; i += chunkSize) {
    const chunk = stripped.slice(i, i + chunkSize).trim();
    if (chunk.length > 50) { // skip tiny trailing chunks
      chunks.push(chunk);
    }
  }
  return chunks;
}

async function fetchArticles(subdomain: string, apiToken: string): Promise<ZendeskArticle[]> {
  const articles: ZendeskArticle[] = [];
  let nextUrl: string | null =
    `https://${subdomain}.zendesk.com/api/v2/help_center/articles?per_page=100`;

  while (nextUrl) {
    const res = await fetch(nextUrl, {
      headers: { Authorization: `Bearer ${apiToken}` },
    });
    if (!res.ok) throw new Error(`Help Center API error: ${res.status}`);

    const data = await res.json() as {
      articles: ZendeskArticle[];
      next_page: string | null;
    };
    articles.push(...data.articles);
    nextUrl = data.next_page;
  }

  return articles;
}

async function embedText(text: string): Promise<number[]> {
  // Embedding uses Voyage AI (voyage-3-lite) via raw fetch.
  // @meridian/core invoke() is a chat-completion wrapper only — do NOT use it here.
  // If VOYAGE_API_KEY is not set, return empty array; Phase 3 will re-embed during pgvector load.
  const voyageKey = process.env.VOYAGE_API_KEY;
  if (!voyageKey) {
    return [];
  }

  const res = await fetch('https://api.voyageai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${voyageKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'voyage-3-lite',
      input: [text],
    }),
  });

  if (!res.ok) throw new Error(`Voyage embedding error: ${res.status}`);
  const data = await res.json() as { data: Array<{ embedding: number[] }> };
  return data.data[0]?.embedding ?? [];
}

export async function handler(): Promise<{ articlesProcessed: number; chunksCreated: number }> {
  const subdomain = process.env.ZENDESK_SUBDOMAIN!;
  const apiToken = process.env.ZENDESK_API_TOKEN!;
  const bucket = process.env.ASSETS_BUCKET_NAME!;
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

  console.info('Fetching Help Center articles...');
  const articles = await fetchArticles(subdomain, apiToken);
  console.info(`Fetched ${articles.length} articles`);

  const allChunks: ArticleChunk[] = [];

  for (const article of articles) {
    const chunks = chunkText(article.body);
    for (let i = 0; i < chunks.length; i++) {
      const text = `${article.title}\n\n${chunks[i]}`;
      let embedding: number[] = [];
      try {
        embedding = await embedText(text);
      } catch (err) {
        console.warn(`Embedding failed for article ${article.id} chunk ${i}:`, err);
      }

      allChunks.push({
        articleId: article.id,
        title: article.title,
        htmlUrl: article.html_url,
        updatedAt: article.updated_at,
        sectionId: article.section_id,
        chunkIndex: i,
        text,
        embedding,
      });
    }
  }

  // Store as JSONL for Phase 3 pgvector indexer
  const jsonl = allChunks.map(c => JSON.stringify(c)).join('\n');
  await s3.send(new PutObjectCommand({
    Bucket: bucket,
    Key: `help-center/chunks/${timestamp}.jsonl`,
    Body: jsonl,
    ContentType: 'application/x-ndjson',
  }));

  console.info(`Stored ${allChunks.length} chunks to S3`);
  return { articlesProcessed: articles.length, chunksCreated: allChunks.length };
}
