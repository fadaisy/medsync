import { memberNumber, plansFrom, tierNow } from "@patient-core/membership";
import { describe, expect, it } from "vitest";

const now = new Date("2026-11-16T09:00:00Z");
const row = (o = {}) => ({
  tier: "plus_care" as const,
  period: "monthly" as const,
  status: "trial" as const,
  trialEndsAtIso: "2026-11-20T00:00:00Z",
  periodEndsAtIso: null,
  trialUsed: true,
  ...o,
});

describe("membership (§5.9)", () => {
  it("a trial counts until it ends, then Basic (S25: no charge, no tier)", () => {
    expect(tierNow(row(), now)).toEqual({
      tier: "plus_care",
      trial: true,
      endsIso: "2026-11-20T00:00:00Z",
    });
    expect(tierNow(row({ trialEndsAtIso: "2026-11-15T00:00:00Z" }), now).tier).toBe("basic");
    expect(tierNow(null, now).tier).toBe("basic");
  });
  it("a paid period counts until it ends", () => {
    const paid = row({
      status: "active",
      trialEndsAtIso: null,
      periodEndsAtIso: "2026-12-16T00:00:00Z",
    });
    expect(tierNow(paid, now)).toMatchObject({ tier: "plus_care", trial: false });
    expect(tierNow({ ...paid, periodEndsAtIso: "2026-11-01T00:00:00Z" }, now).tier).toBe("basic");
  });
  it("plans come only from approved prices in force; no monthly price, no plan", () => {
    const plans = plansFrom(
      [
        { tier: "plus_care", period: "monthly", amountUgx: 10_000, effectiveFrom: "2026-11-16" },
        { tier: "plus_care", period: "monthly", amountUgx: 12_000, effectiveFrom: "2027-01-01" },
        { tier: "plus_care", period: "yearly", amountUgx: 100_000, effectiveFrom: "2026-11-16" },
        { tier: "plus_family", period: "yearly", amountUgx: 50_000, effectiveFrom: "2026-11-16" },
      ],
      "2026-11-16",
    );
    expect(plans).toEqual([
      { tier: "plus_care", monthlyUgx: 10_000, quarterlyUgx: null, yearlyUgx: 100_000 },
    ]);
  });
  it("member numbers are grouped", () => {
    expect(memberNumber("k7m42qx9z")).toBe("K7M 42Q X9Z");
    expect(memberNumber(null)).toBe("—");
  });
});
