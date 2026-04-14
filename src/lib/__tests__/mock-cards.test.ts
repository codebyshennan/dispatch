import { describe, it, expect } from "vitest";
import { MOCK_CARDS, getCardsByTeam } from "../mock-cards";

describe("MOCK_CARDS", () => {
  it("has exactly 80 cards (50 Marketing + 20 Engineering + 10 Finance)", () => {
    expect(MOCK_CARDS).toHaveLength(80);
  });

  it("has unique card IDs", () => {
    const ids = MOCK_CARDS.map((c) => c.cardId);
    expect(new Set(ids).size).toBe(80);
  });

  it("has 6 frozen cards (3 Marketing + 2 Engineering + 1 Finance)", () => {
    const frozen = MOCK_CARDS.filter((c) => c.status === "frozen");
    expect(frozen).toHaveLength(6);
  });

  it("has 3 cancelled cards (2 Marketing + 1 Engineering)", () => {
    const cancelled = MOCK_CARDS.filter((c) => c.status === "cancelled");
    expect(cancelled).toHaveLength(3);
  });

  it("has 71 active cards (45 Marketing + 17 Engineering + 9 Finance)", () => {
    const active = MOCK_CARDS.filter((c) => c.status === "active");
    expect(active).toHaveLength(71);
  });

  it("all limits are positive SGD values", () => {
    expect(
      MOCK_CARDS.every(
        (c) => c.currentLimit.currency === "SGD" && c.currentLimit.amount > 0
      )
    ).toBe(true);
  });

  it("contains cards from Marketing, Engineering, and Finance teams", () => {
    const teams = new Set(MOCK_CARDS.map((c) => c.team));
    expect(teams).toContain("Marketing");
    expect(teams).toContain("Engineering");
    expect(teams).toContain("Finance");
    expect(teams.size).toBe(3);
  });
});

describe("getCardsByTeam", () => {
  it("returns all marketing cards case-insensitively", () => {
    expect(getCardsByTeam("marketing")).toHaveLength(50);
    expect(getCardsByTeam("Marketing")).toHaveLength(50);
    expect(getCardsByTeam("MARKETING")).toHaveLength(50);
  });

  it("returns all engineering cards", () => {
    expect(getCardsByTeam("Engineering")).toHaveLength(20);
  });

  it("returns all finance cards", () => {
    expect(getCardsByTeam("Finance")).toHaveLength(10);
  });

  it("returns empty array for unknown team", () => {
    expect(getCardsByTeam("Operations")).toHaveLength(0);
  });
});
