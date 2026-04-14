import { describe, it, expect } from "vitest";
import { BulkJobIntentSchema } from "../schemas";

describe("BulkJobIntentSchema", () => {
  it("parses a valid bulk_update_card_limit intent", () => {
    const result = BulkJobIntentSchema.parse({
      intent: "bulk_update_card_limit",
      targetGroup: "Marketing",
      newLimit: { currency: "SGD", amount: 2000 },
      notifyCardholders: true,
    });

    expect(result.intent).toBe("bulk_update_card_limit");
    expect(result.targetGroup).toBe("Marketing");
    expect(result.newLimit?.amount).toBe(2000);
    expect(result.notifyCardholders).toBe(true);
  });

  it("defaults notifyCardholders to false when not provided", () => {
    const result = BulkJobIntentSchema.parse({
      intent: "bulk_update_card_limit",
      targetGroup: "Marketing",
    });

    expect(result.notifyCardholders).toBe(false);
  });

  it("rejects unsupported intent type", () => {
    expect(() =>
      BulkJobIntentSchema.parse({
        intent: "delete_all_cards",
        targetGroup: "Marketing",
      })
    ).toThrow();
  });

  it("rejects negative limit amount", () => {
    expect(() =>
      BulkJobIntentSchema.parse({
        intent: "bulk_update_card_limit",
        targetGroup: "Marketing",
        newLimit: { currency: "SGD", amount: -100 },
        notifyCardholders: false,
      })
    ).toThrow();
  });

  it("rejects zero limit amount", () => {
    expect(() =>
      BulkJobIntentSchema.parse({
        intent: "bulk_update_card_limit",
        targetGroup: "Marketing",
        newLimit: { currency: "SGD", amount: 0 },
        notifyCardholders: false,
      })
    ).toThrow();
  });

  it("rejects unsupported currency", () => {
    expect(() =>
      BulkJobIntentSchema.parse({
        intent: "bulk_update_card_limit",
        targetGroup: "Marketing",
        newLimit: { currency: "JPY", amount: 2000 },
        notifyCardholders: false,
      })
    ).toThrow();
  });

  it("rejects empty targetGroup", () => {
    expect(() =>
      BulkJobIntentSchema.parse({
        intent: "bulk_update_card_limit",
        targetGroup: "",
        newLimit: { currency: "SGD", amount: 2000 },
      })
    ).toThrow();
  });

  it("accepts optional targetCountEstimate", () => {
    const result = BulkJobIntentSchema.parse({
      intent: "bulk_update_card_limit",
      targetGroup: "Marketing",
      targetCountEstimate: 50,
      newLimit: { currency: "SGD", amount: 2000 },
      notifyCardholders: true,
    });

    expect(result.targetCountEstimate).toBe(50);
  });
});
