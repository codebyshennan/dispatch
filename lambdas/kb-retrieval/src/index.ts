import { RDSDataClient, ExecuteStatementCommand } from '@aws-sdk/client-rds-data';
import type { KBResult } from '@meridian/core';

/**
 * Input shape from the Step Functions state machine.
 * Step Functions wraps Lambda output in { Payload: ... } when using resultPath,
 * so classificationResult has the Payload wrapper.
 */
export interface KBRetrievalInput {
  ticketId: string;
  subject: string;
  body: string;
  classificationResult: {
    Payload: {
      category: string;
      urgency: string;
      [key: string]: unknown;
    };
  };
}

const rdsClient = new RDSDataClient({});

/**
 * Embeds text using Voyage AI voyage-3-lite model (input_type: 'query' for retrieval).
 * Asserts output dimension is 512 to match indexed embeddings.
 */
async function embedText(text: string): Promise<number[]> {
  const response = await fetch('https://api.voyageai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
    },
    body: JSON.stringify({
      input: [text],
      model: 'voyage-3-lite',
      input_type: 'query',
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Voyage AI API error ${response.status}: ${text}`);
  }

  const json = (await response.json()) as { data: Array<{ embedding: number[] }> };
  const emb = json.data[0].embedding;

  if (emb.length !== 512) {
    throw new Error(`Voyage embedding dimension mismatch: got ${emb.length}, expected 512`);
  }

  return emb;
}

/**
 * Queries pgvector for the top-k most similar KB articles using cosine similarity.
 * Uses RDS Data API with formatRecordsAs: 'JSON' for structured results.
 */
async function retrieveTopK(embedding: number[], k = 3): Promise<KBResult[]> {
  const result = await rdsClient.send(
    new ExecuteStatementCommand({
      resourceArn: process.env.DB_CLUSTER_ARN!,
      secretArn: process.env.DB_SECRET_ARN!,
      database: 'meridian',
      formatRecordsAs: 'JSON',
      sql: `
        SELECT article_id, title, html_url, updated_at::text, text,
               1 - (embedding <=> :q::vector) AS similarity
        FROM kb_articles
        ORDER BY embedding <=> :q::vector
        LIMIT :k
      `,
      parameters: [
        { name: 'q', value: { stringValue: JSON.stringify(embedding) } },
        { name: 'k', value: { longValue: k } },
      ],
    }),
  );

  if (result.formattedRecords === undefined) {
    throw new Error(
      'RDS Data API formatRecordsAs not supported — ensure @aws-sdk/client-rds-data v3',
    );
  }

  return JSON.parse(result.formattedRecords ?? '[]') as KBResult[];
}

/**
 * KB Retrieval Lambda handler — Step Functions task.
 *
 * Embeds the ticket subject+body, performs cosine similarity search against
 * pgvector kb_articles, and returns the top-3 matching articles alongside
 * the full input event (pass-through for downstream steps).
 *
 * kbHits enables KB gap analysis in Plan 04 (KB-02).
 */
export async function handler(
  event: KBRetrievalInput,
): Promise<KBRetrievalInput & { kbArticles: KBResult[]; kbHits: number }> {
  const queryText = `${event.subject}\n\n${event.body}`;

  const embedding = await embedText(queryText);
  const articles = await retrieveTopK(embedding);

  return {
    ...event,
    kbArticles: articles,
    kbHits: articles.length,
  };
}
