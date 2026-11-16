/** Programme pricing from the team (business model §3–4; ADR 0519). */
import {
  costPerMember,
  monthlyPrice,
  periodPrice,
  programmeNameAllowed,
  tetherShare,
} from "@patient-core/care-pricing";
import { describe, expect, it } from "vitest";

const nurse = { role: "nurse" as const, monthlyCostUgx: 1_500_000, caseload: 200 };
const mo = { role: "medical_officer" as const, monthlyCostUgx: 3_000_000, caseload: 1000 };
const nutritionist = { role: "nutritionist" as const, monthlyCostUgx: 1_800_000, caseload: 400 };

describe("pricing a programme from its team", () => {
  it("adds each role's share and the platform cost", () => {
    expect(costPerMember([nurse, mo], 6200)).toBe(7500 + 3000 + 6200);
  });

  it("covers cost, collection fee and margin, rounded up to UGX 1,000", () => {
    const p = monthlyPrice({
      team: [nurse, mo],
      platformCostUgx: 6200,
      margin: 0.3,
      collectionRate: 0.035,
    });
    expect(p).toBe(26000);
    expect(p * (1 - 0.3 - 0.035)).toBeGreaterThanOrEqual(16_700);
  });

  it("a bigger team costs more", () => {
    const base = { platformCostUgx: 6200, margin: 0.3, collectionRate: 0.035 };
    expect(monthlyPrice({ ...base, team: [nurse, mo, nutritionist] })).toBeGreaterThan(
      monthlyPrice({ ...base, team: [nurse, mo] }),
    );
  });

  it("refuses impossible inputs", () => {
    expect(() => costPerMember([{ ...nurse, caseload: 0 }], 0)).toThrow();
    expect(() =>
      monthlyPrice({ team: [nurse], platformCostUgx: 0, margin: 0.9, collectionRate: 0 }),
    ).toThrow();
  });
});

describe("periods and Tether's share", () => {
  it("a quarter is 3 months less 5%; a year is 10 months", () => {
    expect(periodPrice(10_000, "monthly")).toBe(10_000);
    expect(periodPrice(10_000, "quarterly")).toBe(28_500);
    expect(periodPrice(10_000, "yearly")).toBe(100_000);
  });

  it("is 9,000 a member-month or 20% after the fee, whichever is higher, never over half", () => {
    expect(tetherShare(25_000, 0.035, 1)).toBe(9000);
    expect(tetherShare(70_000, 0.035, 1)).toBe(13_510);
    expect(tetherShare(250_000, 0.035, 12)).toBe(108_000);
    expect(tetherShare(12_000, 0.035, 1)).toBe(6000);
  });
});

describe("names never rank care (UMDPC)", () => {
  it("allows condition and team names; refuses ranks", () => {
    expect(programmeNameAllowed("Diabetes, with a specialist")).toBe(true);
    for (const n of ["Premium diabetes", "Gold BP plan", "VIP heart care"])
      expect(programmeNameAllowed(n)).toBe(false);
  });
});
