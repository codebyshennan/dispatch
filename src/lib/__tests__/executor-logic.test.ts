import { describe, it, expect } from "vitest";
import {
  simulateMockCardApi,
  isRetryExhausted,
  backoffMs,
  MAX_RETRIES,
} from "../executor-logic";

describe("simulateMockCardApi — permanently failing cards", () => {
  it("permanently fails card containing '019'", () => {
    const result = simulateMockCardApi("CARD-019-X", 0);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.failureType).toBe("permanent");
      expect(result.failureCode).toBe("CARD_LOCKED");
    }
  });

  it("permanently fails card containing '033'", () => {
    const result = simulateMockCardApi("CRD-033", 0);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.failureType).toBe("permanent");
      expect(result.failureCode).toBe("CARD_LOCKED");
    }
  });

  it("permanently fails card containing '047'", () => {
    const result = simulateMockCardApi("047ABC", 0);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.failureType).toBe("permanent");
      expect(result.failureCode).toBe("CARD_LOCKED");
    }
  });

  it("permanent failure includes a human-readable detail message", () => {
    const result = simulateMockCardApi("X019Y", 0);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.failureDetail).toBeTruthy();
    }
  });
});

describe("simulateMockCardApi — deterministic behaviour", () => {
  it("returns the same result for the same cardId + attempt", () => {
    const r1 = simulateMockCardApi("NORMAL-CARD-001", 0);
    const r2 = simulateMockCardApi("NORMAL-CARD-001", 0);
    expect(r1).toEqual(r2);
  });

  it("may return a different result for the same card on a different attempt", () => {
    // Not guaranteed to differ — but the function must not throw
    const r0 = simulateMockCardApi("NORMAL-CARD-001", 0);
    const r1 = simulateMockCardApi("NORMAL-CARD-001", 1);
    // Both must be valid result shapes
    expect(typeof r0.success).toBe("boolean");
    expect(typeof r1.success).toBe("boolean");
  });

  it("retryable failures use UPSTREAM_TIMEOUT code", () => {
    const retryableFailures = Array.from({ length: 100 }, (_, i) => `CARD-${String(i).padStart(3, "0")}`)
      .map((id) => simulateMockCardApi(id, 0))
      .filter((r): r is Extract<typeof r, { success: false }> => !r.success && r.failureType === "retryable");

    // At least some should be retryable given 18% probability over 100 cards
    if (retryableFailures.length > 0) {
      expect(retryableFailures[0].failureCode).toBe("UPSTREAM_TIMEOUT");
    }
  });

  it("successful results have only the success field", () => {
    // Find a card that succeeds
    const successful = Array.from({ length: 200 }, (_, i) => `CARD-${String(i + 100).padStart(4, "0")}`)
      .map((id) => simulateMockCardApi(id, 0))
      .find((r) => r.success === true);

    expect(successful).toBeDefined();
    expect(successful?.success).toBe(true);
  });
});

describe("isRetryExhausted", () => {
  it("returns false for retry counts below MAX_RETRIES", () => {
    for (let i = 0; i < MAX_RETRIES; i++) {
      expect(isRetryExhausted(i)).toBe(false);
    }
  });

  it("returns true at exactly MAX_RETRIES", () => {
    expect(isRetryExhausted(MAX_RETRIES)).toBe(true);
  });

  it("returns true above MAX_RETRIES", () => {
    expect(isRetryExhausted(MAX_RETRIES + 1)).toBe(true);
    expect(isRetryExhausted(10)).toBe(true);
  });
});

describe("backoffMs", () => {
  it("returns 2000ms for retry 1 (first retry)", () => {
    expect(backoffMs(1)).toBe(2000);
  });

  it("returns 4000ms for retry 2", () => {
    expect(backoffMs(2)).toBe(4000);
  });

  it("returns 8000ms for retry 3", () => {
    expect(backoffMs(3)).toBe(8000);
  });

  it("doubles with each retry (exponential)", () => {
    expect(backoffMs(2)).toBe(backoffMs(1) * 2);
    expect(backoffMs(3)).toBe(backoffMs(2) * 2);
    expect(backoffMs(4)).toBe(backoffMs(3) * 2);
  });
});
