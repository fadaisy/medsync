import { describe, expect, it } from "vitest";

import {
  CSO_PAED_BANDS,
  OBSTETRIC_REF,
  paedHypotensionLimit,
  resolvePaedBand,
  rulesetToPopulation,
} from "@/lib/triage/reference";

/**
 * Versioned vitals reference data (GATE A). Pins the catalog-verbatim
 * values + the age-band resolver's anti-under-triage behaviour.
 */

describe("resolvePaedBand — age → catalog band", () => {
  it("ageYears 0 maps to the INFANT band (not newborn) — anti-under-triage", () => {
    // The engine floors age to integer years; an unknown-month infant
    // must get the tighter infant profile, not the wider newborn one.
    const b = resolvePaedBand(0)!;
    expect(b.label).toContain("Infant");
    expect(b.hypotension).toEqual({ kind: "flat", sbpLt: 70 });
  });

  it("explicit <1mo fractional age selects the newborn band", () => {
    const b = resolvePaedBand(0.02)!; // ~7 days
    expect(b.label).toContain("Newborn");
  });

  it.each([
    [1, "Toddler"],
    [2.9, "Toddler"],
    [3, "Preschool"],
    [6, "School"],
    [13, "Adolescent"],
    [15.9, "Adolescent"],
  ])("age %s → %s band", (age, label) => {
    expect(resolvePaedBand(age)!.label).toContain(label);
  });

  it("ages ≥16 return null (route to adult NEWS2)", () => {
    expect(resolvePaedBand(16)).toBeNull();
    expect(resolvePaedBand(40)).toBeNull();
  });
});

describe("paedHypotensionLimit — decompensated-shock line", () => {
  it("flat bands use the catalog fixed value", () => {
    expect(paedHypotensionLimit(0)).toBe(70); // infant
    expect(paedHypotensionLimit(0.02)).toBe(60); // newborn
    expect(paedHypotensionLimit(14)).toBe(90); // adolescent
  });

  it("formula bands compute 70 + 2×age on exact age (never floored down)", () => {
    expect(paedHypotensionLimit(2)).toBe(74);
    expect(paedHypotensionLimit(5)).toBe(80);
    expect(paedHypotensionLimit(2.5)).toBe(75); // exact, not floored to 74
  });

  it("formula clamps to the 1–10y stated range", () => {
    // 12y is a formula band (school 6–12) but formula applies 1–10 → clamp at 10
    expect(paedHypotensionLimit(12)).toBe(90);
  });

  it("returns null for adults", () => {
    expect(paedHypotensionLimit(30)).toBeNull();
  });
});

describe("catalog values are verbatim", () => {
  it("paed bands cover newborn → adolescent with catalog HR/RR", () => {
    expect(CSO_PAED_BANDS).toHaveLength(6);
    const infant = CSO_PAED_BANDS.find((b) => b.label.startsWith("Infant"))!;
    expect(infant.heartRate).toEqual({ min: 100, max: 160 });
    expect(infant.respRate).toEqual({ min: 24, max: 40 });
  });

  it("obstetric thresholds match the catalog (hypertension-as-emergency)", () => {
    expect(OBSTETRIC_REF.systolic).toEqual({ htnGte: 140, severeGte: 160 });
    expect(OBSTETRIC_REF.diastolic).toEqual({ htnGte: 90, severeGte: 110 });
    expect(OBSTETRIC_REF.msiHaemorrhageGt).toBe(1.7);
  });
});

describe("rulesetToPopulation", () => {
  it("maps engine rulesets to catalog populations", () => {
    expect(rulesetToPopulation("adult_news2")).toBe("adult");
    expect(rulesetToPopulation("paediatric_pews")).toBe("paediatric");
    expect(rulesetToPopulation("obstetric_meows")).toBe("obstetric");
  });
});
