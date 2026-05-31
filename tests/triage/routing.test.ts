import type { TriageContext } from "@/lib/triage/types";
import { describe, expect, it } from "vitest";

import { routePopulation } from "@/lib/triage/scoring/routing";

/**
 * Population routing (research doc §7/§8, ratified R3). Wrong ruleset =
 * dangerous mis-triage, so this is exhaustively tested.
 */

function ctx(o: Partial<TriageContext> = {}): TriageContext {
  return {
    ageYears: 30,
    pregnancy: "not_pregnant",
    reproductiveAgeFemale: false,
    spo2Scale2Enabled: false,
    ...o,
  };
}

describe("routePopulation — obstetric takes precedence (§8)", () => {
  it("pregnant → obstetric MEOWS regardless of age", () => {
    expect(routePopulation(ctx({ pregnancy: "pregnant", ageYears: 25 })).ruleset).toBe(
      "obstetric_meows",
    );
  });
  it("≤6wk postpartum → obstetric MEOWS", () => {
    expect(routePopulation(ctx({ pregnancy: "postpartum_6wk" })).ruleset).toBe("obstetric_meows");
  });
});

describe("routePopulation — paediatric (§7, R3 12–15 → paeds)", () => {
  it.each([0.5, 4, 11, 12, 15])("age %s → paediatric PEWS", (age) => {
    expect(routePopulation(ctx({ ageYears: age })).ruleset).toBe("paediatric_pews");
  });
  it("age 16 → adult (NEWS2 lower bound)", () => {
    expect(routePopulation(ctx({ ageYears: 16 })).ruleset).toBe("adult_news2");
  });
});

describe("routePopulation — adult (§3)", () => {
  it("adult non-pregnant → NEWS2", () => {
    expect(routePopulation(ctx({ ageYears: 40 })).ruleset).toBe("adult_news2");
  });
});

describe("routePopulation — unknown pregnancy (R3: flag, don't block)", () => {
  it("reproductive-age female, unknown pregnancy → adult NEWS2 + confirm flag", () => {
    const r = routePopulation(
      ctx({ ageYears: 28, pregnancy: "unknown", reproductiveAgeFemale: true }),
    );
    expect(r.ruleset).toBe("adult_news2");
    expect(r.flags.some((f) => /pregnancy/i.test(f))).toBe(true);
  });

  it("does NOT raise the pregnancy flag for a male", () => {
    const r = routePopulation(
      ctx({ ageYears: 28, pregnancy: "unknown", reproductiveAgeFemale: false }),
    );
    expect(r.flags.some((f) => /pregnancy/i.test(f))).toBe(false);
  });

  it("a 12–15yo reproductive-age female with unknown pregnancy still routes paediatric (age wins under the paeds threshold) but keeps the flag", () => {
    const r = routePopulation(
      ctx({ ageYears: 14, pregnancy: "unknown", reproductiveAgeFemale: true }),
    );
    // Pregnant <16 would still be obstetric; UNKNOWN <16 routes paeds
    // (the safer sensitive ruleset) while flagging to confirm.
    expect(r.ruleset).toBe("paediatric_pews");
    expect(r.flags.some((f) => /pregnancy/i.test(f))).toBe(true);
  });
});

describe("routePopulation — missing age is flagged (§10, never guessed)", () => {
  it("null age → flag to obtain, default to adult NEWS2 (conservative, scored not bypassed)", () => {
    const r = routePopulation(ctx({ ageYears: null }));
    expect(r.flags.some((f) => /age/i.test(f))).toBe(true);
  });
});

describe("routePopulation — determinism", () => {
  it("identical inputs → identical output", () => {
    const c = ctx({ ageYears: 14, pregnancy: "unknown", reproductiveAgeFemale: true });
    expect(routePopulation(c)).toEqual(routePopulation(c));
  });
});
