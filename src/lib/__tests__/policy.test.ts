import { describe, it, expect } from "vitest";
import { checkPolicy, POLICY } from "../policy";

const activeCard = (id: string, amount = 500) => ({
  cardId: id,
  cardholderName: "Test User",
  status: "active" as const,
  currentLimit: { currency: "SGD", amount },
});

const frozenCard = (id: string) => ({
  ...activeCard(id),
  status: "frozen" as const,
});

const cancelledCard = (id: string) => ({
  ...activeCard(id),
  status: "cancelled" as const,
});

describe("checkPolicy", () => {
  it("allows a valid bulk update within limits", () => {
    const cards = Array.from({ length: 10 }, (_, i) => activeCard(`C${i}`));
    const result = checkPolicy(cards, { currency: "SGD", amount: 2000 });

    expect(result.allowed).toBe(true);
    expect(result.approvalRequired).toBe(false);
    expect(result.excludedCardIds).toHaveLength(0);
  });

  it("rejects limit above maximum (SGD 5000)", () => {
    const cards = [activeCard("C1")];
    const result = checkPolicy(cards, { currency: "SGD", amount: 6000 });

    expect(result.allowed).toBe(false);
    expect(result.notes[0]).toContain("exceeds maximum");
  });

  it("allows limit exactly at maximum", () => {
    const cards = [activeCard("C1")];
    const result = checkPolicy(cards, { currency: "SGD", amount: POLICY.MAX_LIMIT_SGD });

    expect(result.allowed).toBe(true);
  });

  it("excludes frozen cards and records the reason", () => {
    const cards = [activeCard("C1"), frozenCard("C2"), activeCard("C3")];
    const result = checkPolicy(cards, { currency: "SGD", amount: 2000 });

    expect(result.excludedCardIds).toEqual(["C2"]);
    expect(result.notes.some((n) => n.includes("C2") && n.includes("frozen"))).toBe(true);
  });

  it("excludes cancelled cards and records the reason", () => {
    const cards = [activeCard("C1"), cancelledCard("C2")];
    const result = checkPolicy(cards, { currency: "SGD", amount: 2000 });

    expect(result.excludedCardIds).toEqual(["C2"]);
    expect(result.notes.some((n) => n.includes("C2") && n.includes("cancelled"))).toBe(true);
  });

  it("excludes both frozen and cancelled, keeps actives eligible", () => {
    const cards = [
      activeCard("C1"),
      frozenCard("C2"),
      cancelledCard("C3"),
      activeCard("C4"),
    ];
    const result = checkPolicy(cards, { currency: "SGD", amount: 2000 });

    expect(result.allowed).toBe(true);
    expect(result.excludedCardIds).toEqual(["C2", "C3"]);
  });

  it("requires approval when eligible count exceeds threshold (25)", () => {
    const cards = Array.from({ length: 30 }, (_, i) => activeCard(`C${i}`));
    const result = checkPolicy(cards, { currency: "SGD", amount: 2000 });

    expect(result.allowed).toBe(true);
    expect(result.approvalRequired).toBe(true);
    expect(result.notes.some((n) => n.includes("Approval required"))).toBe(true);
  });

  it("does not require approval when eligible count is exactly at threshold", () => {
    const cards = Array.from({ length: POLICY.APPROVAL_THRESHOLD_ITEMS }, (_, i) =>
      activeCard(`C${i}`)
    );
    const result = checkPolicy(cards, { currency: "SGD", amount: 2000 });

    expect(result.approvalRequired).toBe(false);
  });

  it("blocks bulk operation exceeding max items (200)", () => {
    const cards = Array.from({ length: 201 }, (_, i) => activeCard(`C${i}`));
    const result = checkPolicy(cards, { currency: "SGD", amount: 2000 });

    expect(result.allowed).toBe(false);
    expect(result.notes[0]).toContain("maximum");
  });

  it("computes approval based on eligible count after exclusions", () => {
    // 28 active + 5 frozen = 33 total, but only 28 eligible (below threshold of 25... wait 28 > 25)
    // Actually: 20 active + 5 frozen = 25 total, 20 eligible = no approval needed
    const cards = [
      ...Array.from({ length: 20 }, (_, i) => activeCard(`C${i}`)),
      ...Array.from({ length: 5 }, (_, i) => frozenCard(`F${i}`)),
    ];
    const result = checkPolicy(cards, { currency: "SGD", amount: 2000 });

    expect(result.approvalRequired).toBe(false);
    expect(result.excludedCardIds).toHaveLength(5);
  });
});
