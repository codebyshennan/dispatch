import { describe, it, expect } from "vitest";
import { MOCK_CARDS, getCardsByTeam } from "../mock-cards";

describe("MOCK_CARDS", () => {
  it("has exactly 50 cards", () => {
    expect(MOCK_CARDS).toHaveLength(50);
  });

  it("all cards belong to Marketing team", () => {
    expect(MOCK_CARDS.every((c) => c.team === "Marketing")).toBe(true);
  });

  it("has unique card IDs", () => {
    const ids = MOCK_CARDS.map((c) => c.cardId);
    expect(new Set(ids).size).toBe(50);
  });

  it("has 3 frozen cards", () => {
    const frozen = MOCK_CARDS.filter((c) => c.status === "frozen");
    expect(frozen).toHaveLength(3);
  });

  it("has 2 cancelled cards", () => {
    const cancelled = MOCK_CARDS.filter((c) => c.status === "cancelled");
    expect(cancelled).toHaveLength(2);
  });

  it("has 45 active cards", () => {
    const active = MOCK_CARDS.filter((c) => c.status === "active");
    expect(active).toHaveLength(45);
  });

  it("all limits are positive SGD values", () => {
    expect(
      MOCK_CARDS.every(
        (c) => c.currentLimit.currency === "SGD" && c.currentLimit.amount > 0
      )
    ).toBe(true);
  });
});

describe("getCardsByTeam", () => {
  it("returns all marketing cards case-insensitively", () => {
    expect(getCardsByTeam("marketing")).toHaveLength(50);
    expect(getCardsByTeam("Marketing")).toHaveLength(50);
    expect(getCardsByTeam("MARKETING")).toHaveLength(50);
  });

  it("returns empty array for unknown team", () => {
    expect(getCardsByTeam("Engineering")).toHaveLength(0);
  });
});
