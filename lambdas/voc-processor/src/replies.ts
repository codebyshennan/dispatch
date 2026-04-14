import { invoke } from '@dispatch/core';
import { z } from 'zod';
import {
  DynamoDBClient,
  PutItemCommand,
} from '@aws-sdk/client-dynamodb';
import type { VocReview } from './zendesk.js';

const dynamo = new DynamoDBClient({});

/**
 * Generates an empathetic public reply draft for a 1-star review using the LLM,
 * then stores the draft in DynamoDB with status:pending_approval.
 *
 * Reply drafts are NOT auto-posted — they require CX lead approval (VOC-03).
 */
export async function generateAndStageReplyDraft(
  review: VocReview,
  zendeskTicketId: string,
  tableName: string,
): Promise<void> {
  const prompt = [
    `You are a customer support specialist for a fintech app.`,
    `A customer has left a 1-star ${review.platform.replace(/_/g, ' ')} review.`,
    ``,
    `Review text: "${review.text}"`,
    ``,
    `Write a concise, empathetic public reply (2-3 sentences) that:`,
    `1. Acknowledges their frustration`,
    `2. Addresses the core concern raised`,
    `3. Invites them to reach out for resolution`,
    ``,
    `Reply only with the response text — no headers or meta commentary.`,
  ].join('\n');

  const result = await invoke<string>(prompt, {
    provider: 'openrouter',
    model: 'google/gemma-3-27b-it:free',
    schema: z.string(),
  });
  const draft = result.data;

  const createdAt = new Date().toISOString();
  const sk = `PENDING#${createdAt}`;

  await dynamo.send(
    new PutItemCommand({
      TableName: tableName,
      Item: {
        pk: { S: `VOC#draft#${review.reviewId}` },
        sk: { S: sk },
        reviewId: { S: review.reviewId },
        platform: { S: review.platform },
        reviewText: { S: review.text },
        draft: { S: draft },
        zendeskTicketId: { S: zendeskTicketId },
        status: { S: 'pending_approval' },
        createdAt: { S: createdAt },
      },
    }),
  );
}

/**
 * Updates a VOC#processed record with the Zendesk ticketId for traceability.
 */
export async function updateProcessedRecord(
  reviewId: string,
  zendeskTicketId: string,
  tableName: string,
): Promise<void> {
  await dynamo.send(
    new PutItemCommand({
      TableName: tableName,
      Item: {
        pk: { S: `VOC#processed#${reviewId}` },
        sk: { S: 'PROCESSED' },
        reviewId: { S: reviewId },
        zendeskTicketId: { S: zendeskTicketId },
        processedAt: { S: new Date().toISOString() },
      },
    }),
  );
}
