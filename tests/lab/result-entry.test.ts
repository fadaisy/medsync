import { describe, expect, it } from "vitest";

import { deriveCriticalFlag, LabRejectSchema, LabResultEntrySchema } from "@/lib/lab/result-entry";

describe("LabResultEntrySchema", () => {
  it("accepts a minimal valid entry", () => {
    const r = LabResultEntrySchema.safeParse({
      orderId: "11111111-1111-4111-8111-111111111111",
      value: "5.2",
    });
    expect(r.success).toBe(true);
  });

  it("rejects an empty value and a non-uuid order", () => {
    expect(LabResultEntrySchema.safeParse({ orderId: "x", value: "5" }).success).toBe(false);
    expect(
      LabResultEntrySchema.safeParse({
        orderId: "11111111-1111-4111-8111-111111111111",
        value: "",
      }).success,
    ).toBe(false);
  });
});

describe("LabRejectSchema", () => {
  it("requires a reason", () => {
    expect(
      LabRejectSchema.safeParse({ resultId: "11111111-1111-4111-8111-111111111111" }).success,
    ).toBe(false);
    expect(
      LabRejectSchema.safeParse({
        resultId: "11111111-1111-4111-8111-111111111111",
        reason: "haemolysed — recollect",
      }).success,
    ).toBe(true);
  });
});

describe("deriveCriticalFlag", () => {
  it("non-numeric / qualitative value → null", () => {
    expect(deriveCriticalFlag("positive", "2345-7")).toBeNull();
    expect(deriveCriticalFlag("", "2345-7")).toBeNull();
  });

  it("gated dark: numeric value still → null until CRITICAL_VALUES_CSO_SIGNED", () => {
    // A glucose LOINC + a wildly low value: the flag stays null because the
    // critical-value list is not yet CSO-signed (never auto-fires unratified).
    expect(deriveCriticalFlag("1.0", "2345-7")).toBeNull();
  });
});
