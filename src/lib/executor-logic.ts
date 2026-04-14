// Pure business logic extracted from convex/executor.ts for unit testing.

export const MAX_RETRIES = 3;

export type SimulateResult =
  | { success: true }
  | { success: false; failureType: "retryable" | "permanent"; failureCode: string; failureDetail: string };

/**
 * Deterministic mock of the external card API.
 * Three specific card ID substrings always fail permanently (compliance lock).
 * All other cards use a hash-based pseudo-random to produce ~18% retryable failures.
 */
export function simulateMockCardApi(cardId: string, attempt: number): SimulateResult {
  if (cardId.includes("019") || cardId.includes("033") || cardId.includes("047")) {
    return {
      success: false,
      failureType: "permanent",
      failureCode: "CARD_LOCKED",
      failureDetail: "Card is locked pending compliance review",
    };
  }

  const hash = cardId
    .split("")
    .reduce((acc, c, i) => acc + c.charCodeAt(0) * (i + 1), 0);
  const roll = (hash * (attempt + 1)) % 100;

  if (roll < 18) {
    return {
      success: false,
      failureType: "retryable",
      failureCode: "UPSTREAM_TIMEOUT",
      failureDetail: "Card API request timed out",
    };
  }

  return { success: true };
}

/**
 * Determine how many total attempts are allowed before a failure becomes permanent.
 */
export function isRetryExhausted(retryCount: number): boolean {
  return retryCount >= MAX_RETRIES;
}

/**
 * Compute exponential backoff delay in milliseconds for a given retry count.
 */
export function backoffMs(retryCount: number): number {
  return Math.pow(2, retryCount) * 1000;
}
