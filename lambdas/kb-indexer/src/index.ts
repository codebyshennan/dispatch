import { S3Client, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';
import { RDSDataClient, ExecuteStatementCommand } from '@aws-sdk/client-rds-data';

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

async function embedText(text: string): Promise<number[]> {
  const voyageKey = process.env.VOYAGE_API_KEY;
  if (!voyageKey) {
    throw new Error('VOYAGE_API_KEY is not set');
  }

  const res = await fetch('https://api.voyageai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${voyageKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      input: [text],
      model: 'voyage-3-lite',
      input_type: 'document',
    }),
  });

  if (!res.ok) {
    throw new Error(`Voyage embedding error: ${res.status}`);
  }

  const data = await res.json() as { data: Array<{ embedding: number[] }> };
  const embedding = data.data[0]?.embedding ?? [];

  if (embedding.length !== 512) {
    throw new Error(`Expected embedding dimension 512, got ${embedding.length}`);
  }

  return embedding;
}

async function insertChunk(
  rds: RDSDataClient,
  clusterArn: string,
  secretArn: string,
  chunk: ArticleChunk,
  embedding: number[],
): Promise<void> {
  await rds.send(new ExecuteStatementCommand({
    resourceArn: clusterArn,
    secretArn: secretArn,
    database: 'beacon',
    sql: `
      INSERT INTO kb_articles (article_id, title, html_url, updated_at, section_id, chunk_index, text, embedding)
      VALUES (:articleId, :title, :htmlUrl, :updatedAt::timestamptz, :sectionId, :chunkIndex, :text, :embedding::vector)
      ON CONFLICT (article_id, chunk_index) DO UPDATE
        SET text = EXCLUDED.text,
            embedding = EXCLUDED.embedding,
            indexed_at = NOW()
    `,
    parameters: [
      { name: 'articleId', value: { longValue: chunk.articleId } },
      { name: 'title', value: { stringValue: chunk.title } },
      { name: 'htmlUrl', value: { stringValue: chunk.htmlUrl } },
      { name: 'updatedAt', value: { stringValue: chunk.updatedAt } },
      { name: 'sectionId', value: { longValue: chunk.sectionId } },
      { name: 'chunkIndex', value: { longValue: chunk.chunkIndex } },
      { name: 'text', value: { stringValue: chunk.text } },
      // RDS Data API does not support native vector type;
      // JSON.stringify produces '[1.0, 2.0, ...]' which Aurora casts to vector via ::vector
      { name: 'embedding', value: { stringValue: JSON.stringify(embedding) } },
    ],
  }));
}

export async function handler(): Promise<{ indexed: number; skipped: number; errors: number }> {
  const bucketName = process.env.ASSETS_BUCKET_NAME!;
  const clusterArn = process.env.DB_CLUSTER_ARN!;
  const secretArn = process.env.DB_SECRET_ARN!;

  const s3 = new S3Client({});
  const rds = new RDSDataClient({});

  let indexed = 0;
  let skipped = 0;
  let errors = 0;
  let total = 0;

  // List all JSONL chunk files under help-center/chunks/
  const listCmd = new ListObjectsV2Command({
    Bucket: bucketName,
    Prefix: 'help-center/chunks/',
  });

  const listResult = await s3.send(listCmd);
  const objects = listResult.Contents ?? [];

  console.log(`Found ${objects.length} chunk files in S3`);

  // Collect all chunks first to get total count
  const allChunks: ArticleChunk[] = [];

  for (const obj of objects) {
    if (!obj.Key) continue;

    const getCmd = new GetObjectCommand({ Bucket: bucketName, Key: obj.Key });
    const response = await s3.send(getCmd);

    if (!response.Body) continue;

    const body = await response.Body.transformToString();
    const lines = body.split('\n').filter((line) => line.trim().length > 0);

    for (const line of lines) {
      try {
        const chunk = JSON.parse(line) as ArticleChunk;
        allChunks.push(chunk);
      } catch (err) {
        console.warn(`Failed to parse JSONL line from ${obj.Key}:`, err);
        errors++;
      }
    }
  }

  total = allChunks.length;
  console.log(`Total chunks to index: ${total}`);

  for (const chunk of allChunks) {
    let embedding = chunk.embedding;

    // Re-embed if embedding is missing or empty
    if (embedding.length === 0) {
      try {
        embedding = await embedText(chunk.text);
      } catch (err) {
        console.warn(`Re-embedding failed for article ${chunk.articleId} chunk ${chunk.chunkIndex}:`, err);
        skipped++;
        continue;
      }
    }

    // Validate embedding dimension
    if (embedding.length !== 512) {
      console.warn(
        `Skipping article ${chunk.articleId} chunk ${chunk.chunkIndex}: expected 512-dim embedding, got ${embedding.length}`,
      );
      skipped++;
      continue;
    }

    try {
      await insertChunk(rds, clusterArn, secretArn, chunk, embedding);
      indexed++;
    } catch (err) {
      console.error(`Insert failed for article ${chunk.articleId} chunk ${chunk.chunkIndex}:`, err);
      errors++;
    }

    // Log progress every 50 chunks
    if ((indexed + skipped + errors) % 50 === 0) {
      console.log(`Indexed ${indexed}/${total}`);
    }
  }

  console.log(`Indexing complete: indexed=${indexed}, skipped=${skipped}, errors=${errors}`);
  return { indexed, skipped, errors };
}
