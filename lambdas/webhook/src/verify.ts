import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Verify Zendesk HMAC-SHA256 webhook signature.
 * Source: https://developer.zendesk.com/documentation/webhooks/verifying/
 *
 * Message = timestamp + rawBody
 * Digest  = base64(HMACSHA256(message, secret))
 *
 * Uses timingSafeEqual to prevent timing side-channel attacks.
 */
export function verifyZendeskSignature(
  rawBody: string,
  signature: string,
  timestamp: string,
  secret: string,
): boolean {
  const message = timestamp + rawBody;
  const expected = createHmac('sha256', secret)
    .update(message, 'utf8')
    .digest('base64');
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    // Buffer length mismatch (malformed signature) → treat as invalid
    return false;
  }
}
