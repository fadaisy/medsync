import { describe, expect, it } from "vitest";

import { DERIVED_CODES, findingLabel } from "@/lib/resus/reference/presentation";
import { deriveMeasureFindings, VITAL_BAND_RULES } from "@/lib/resus/survey/vitals-bands";
import { PULSE_PRESSURE_NARROW_FRACTION, SHOCK_INDEX } from "@/lib/triage/constants";
import { NOW, vitals } from "./survey-fixtures";

/** GATE A §5 — every numeric boundary ±1 around its signed threshold (SV-VIT-01..13). */

const derive = (snapshot: Record<string, unknown>, ageYears: number | null = 40) =>
  deriveMeasureFindings([vitals(2, snapshot)], { ageYears, nowMs: NOW });
const has = (snapshot: Record<string, unknown>, code: string) => {
  const m = derive(snapshot);
  return [...m.A, ...m.B, ...m.C, ...m.D].includes(code);
};

describe("the CSO audit table matches the signed catalog labels", () => {
  it.each(VITAL_BAND_RULES.map((r) => [r.rule, r.code, `${r.op} ${r.shown}`, r] as const))(
    "%s: %s label contains '%s'",
    (_id, code, text, r) => {
      expect(findingLabel(r.step, code)).toContain(text);
      expect(Number(r.shown)).toBe(r.value);
    },
  );
  it("SV-VIT-10: shock-index numbers are the triage scorer's SHOCK_INDEX", () => {
    const v = (code: string) => VITAL_BAND_RULES.find((r) => r.code === code)!.value;
    expect(v("shock_index_high")).toBe(SHOCK_INDEX.OCCULT_SHOCK_GT);
    expect(v("shock_index_severe")).toBe(SHOCK_INDEX.SHOCK_GTE);
  });
  it("SV-VIT-12: the narrow pulse-pressure number is PULSE_PRESSURE_NARROW_FRACTION", () => {
    expect(PULSE_PRESSURE_NARROW_FRACTION * 100).toBe(
      VITAL_BAND_RULES.find((r) => r.code === "narrow_pulse_pressure")!.value,
    );
  });
  it("SV-VIT-13: the rule codes are exactly the presentation's derived codes", () => {
    for (const s of ["A", "B", "C", "D"] as const)
      expect([...new Set(VITAL_BAND_RULES.filter((r) => r.step === s).map((r) => r.code))]).toEqual(
        DERIVED_CODES[s],
      );
    expect(DERIVED_CODES.E).toEqual([]);
  });
});

describe("boundaries ±1", () => {
  it.each([
    [7, true],
    [8, true],
    [9, false],
  ])("SV-VIT-01: vitals GCS %s → gcs_le8 %s", (gcs, want) => {
    expect(has({ gcs }, "gcs_le8")).toBe(want);
  });
  it.each([
    [24, false],
    [25, true],
    [26, true],
  ])("SV-VIT-02: RR %s → rr_raised %s", (rr, want) => {
    expect(has({ rr }, "rr_raised")).toBe(want);
  });
  it.each([
    [29, false],
    [30, true],
    [31, true],
  ])("SV-VIT-03: RR %s → rr_very_high %s", (rr, want) => {
    expect(has({ rr }, "rr_very_high")).toBe(want);
  });
  it.each([
    [7, true],
    [8, true],
    [9, false],
  ])("SV-VIT-04: RR %s → rr_low_falling %s", (rr, want) => {
    expect(has({ rr }, "rr_low_falling")).toBe(want);
  });
  it.each([
    [91, true],
    [92, false],
    [93, false],
  ])("SV-VIT-05: SpO₂ %s → spo2_lt92 %s", (spo2, want) => {
    expect(has({ spo2 }, "spo2_lt92")).toBe(want);
  });
  it.each([
    [93, true],
    [94, false],
    [95, false],
  ])("SV-VIT-06: SpO₂ %s on air → spo2_lt94 %s", (spo2, want) => {
    expect(has({ spo2, oxygen: "air" }, "spo2_lt94")).toBe(want);
  });
  it("SV-VIT-06: SpO₂ 93 on oxygen, or with O₂ status unrecorded → no spo2_lt94", () => {
    expect(has({ spo2: 93, oxygen: "oxygen" }, "spo2_lt94")).toBe(false);
    expect(has({ spo2: 93 }, "spo2_lt94")).toBe(false);
  });
  it.each([
    [99, false],
    [100, false],
    [101, true],
  ])("SV-VIT-07: HR %s → tachycardia %s", (hr, want) => {
    expect(has({ hr }, "tachycardia")).toBe(want);
  });
  it.each([
    [59, true],
    [60, false],
    [61, false],
  ])("SV-VIT-08: HR %s → bradycardia %s", (hr, want) => {
    expect(has({ hr }, "bradycardia")).toBe(want);
  });
  it.each([
    [89, true],
    [90, true],
    [91, false],
  ])("SV-VIT-09: SBP %s (MAP ≥ 65) → hypotension %s", (systolicBp, want) => {
    expect(has({ systolicBp, diastolicBp: 60 }, "hypotension")).toBe(want);
  });
  it.each([
    [48.5, true], // MAP 64
    [50, false], // MAP 65
    [51.5, false], // MAP 66
  ])("SV-VIT-09: SBP 95 / DBP %s → hypotension by MAP %s", (diastolicBp, want) => {
    expect(has({ systolicBp: 95, diastolicBp }, "hypotension")).toBe(want);
  });
  it.each([
    [89, false], // SI 0.89
    [90, false], // SI 0.90
    [91, true], // SI 0.91
  ])("SV-VIT-10: HR %s / SBP 100 → shock_index_high %s", (hr, want) => {
    expect(has({ hr, systolicBp: 100, diastolicBp: 60 }, "shock_index_high")).toBe(want);
  });
  it.each([
    [99, false], // SI 0.99
    [100, true], // SI 1.00
    [101, true], // SI 1.01
  ])("SV-VIT-11: HR %s / SBP 100 → shock_index_severe %s", (hr, want) => {
    expect(has({ hr, systolicBp: 100, diastolicBp: 60 }, "shock_index_severe")).toBe(want);
  });
  it.each([
    [76, true], // PP 24 < 25 % of 100
    [75, false], // PP 25
    [74, false], // PP 26
  ])("SV-VIT-12: SBP 100 / DBP %s → narrow_pulse_pressure %s", (diastolicBp, want) => {
    expect(has({ systolicBp: 100, diastolicBp }, "narrow_pulse_pressure")).toBe(want);
  });
  it.each([
    [2.9, true],
    [3.0, false],
    [3.1, false],
  ])("SV-VIT-13: glucose %s → hypoglycaemia %s", (glucose, want) => {
    expect(has({ glucose }, "hypoglycaemia")).toBe(want);
  });
});

describe("the shocked adult (P3 live case)", () => {
  it("SV-VIT-09: HR 130, BP 70/60, SpO₂ 67 % derives the C and B codes, nothing for A/D", () => {
    const m = derive({ hr: 130, rr: 20, spo2: 67, systolicBp: 70, diastolicBp: 60 });
    expect(m.C).toEqual([
      "tachycardia",
      "hypotension",
      "shock_index_high",
      "shock_index_severe",
      "narrow_pulse_pressure",
    ]);
    expect(m.B).toEqual(["spo2_lt92"]);
    expect([m.A, m.D]).toEqual([[], []]);
    expect(Math.round(m.values.map!)).toBe(63);
  });
  it("SV-VIT-02: normal adult vitals derive nothing", () => {
    const m = derive({ hr: 80, rr: 14, spo2: 98, systolicBp: 125, diastolicBp: 80, glucose: 5 });
    expect([...m.A, ...m.B, ...m.C, ...m.D]).toEqual([]);
  });
});
