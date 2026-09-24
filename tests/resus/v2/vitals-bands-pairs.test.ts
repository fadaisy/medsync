import { describe, expect, it } from "vitest";

import { deriveMeasureFindings } from "@/lib/resus/survey/vitals-bands";
import { artefact, NOW, vitals } from "./survey-fixtures";

/**
 * GATE A §5 SV-VIT-09..12 — MAP and pulse pressure come from an SBP and a DBP
 * of ONE reading, the shock index from an HR and an SBP of one reading. Halves
 * of different readings make a number nobody measured.
 */

const run = (tl: Parameters<typeof deriveMeasureFindings>[0]) =>
  deriveMeasureFindings(tl, { ageYears: 40, nowMs: NOW });

describe("SV-VIT-09 / SV-VIT-12 — MAP and pulse pressure from one reading", () => {
  it("SV-VIT-09: a newer SBP-only reading is never paired with an older DBP", () => {
    // Mixed: MAP(110/40) = 63.3. The newest real pair is 100/40 → MAP 60.
    const m = run([
      vitals(14, { systolicBp: 100, diastolicBp: 40, hr: 70 }),
      vitals(1, { systolicBp: 110, hr: 70 }),
    ]);
    expect(m.values.systolicBp).toBe(110);
    expect(m.values.map).toBeCloseTo(60, 5);
    expect(m.values.pulsePressure).toBe(60);
  });
  it("SV-VIT-12: 150/100 then SBP 125 alone → no PP 25, no narrow pulse pressure", () => {
    const m = run([
      vitals(10, { systolicBp: 150, diastolicBp: 100 }),
      vitals(1, { systolicBp: 125 }),
    ]);
    expect(m.C).not.toContain("narrow_pulse_pressure");
    expect(m.values.pulsePressure).toBe(50);
  });
  it("SV-VIT-12: 130/80 then SBP 95 alone → PP 50 and MAP 97 from 130/80, not PP 15", () => {
    const m = run([vitals(5, { systolicBp: 130, diastolicBp: 80 }), vitals(0, { systolicBp: 95 })]);
    expect(m.C).toEqual([]);
    expect(m.values.pulsePressure).toBe(50);
    expect(m.values.map).toBeCloseTo(96.67, 2);
  });
  it("SV-VIT-09: an SBP-only reading with no earlier pair gives no MAP and no PP", () => {
    const m = run([vitals(2, { systolicBp: 88 })]);
    expect(m.C).toEqual(["hypotension"]);
    expect([m.values.map, m.values.pulsePressure]).toEqual([undefined, undefined]);
  });
  it("SV-VIT-12: a DBP marked artefact leaves that reading without MAP or PP", () => {
    const v = vitals(3, { systolicBp: 70, diastolicBp: 60, hr: 130 });
    const m = run([v, artefact(2, v.id, ["diastolicBp"])]);
    expect([m.values.map, m.values.pulsePressure]).toEqual([undefined, undefined]);
    expect(m.C).not.toContain("narrow_pulse_pressure");
    expect(m.C).toContain("hypotension"); // SBP 70 ≤ 90 on its own
  });
  it("SV-VIT-12: an SBP marked artefact falls back to the previous whole pair, not its DBP", () => {
    const old = vitals(8, { systolicBp: 120, diastolicBp: 80 });
    const v = vitals(3, { systolicBp: 70, diastolicBp: 60 });
    const m = run([old, v, artefact(2, v.id, ["systolicBp"])]);
    expect(m.values.systolicBp).toBe(120);
    expect(m.values.pulsePressure).toBe(40);
    expect(m.values.map).toBeCloseTo(93.33, 2);
    expect(m.C).toEqual([]);
  });
  it("SV-VIT-09: the newest whole pair wins over an older one", () => {
    const m = run([
      vitals(10, { systolicBp: 70, diastolicBp: 60 }),
      vitals(2, { systolicBp: 125, diastolicBp: 80 }),
    ]);
    expect(m.values.map).toBeCloseTo(95, 5);
    expect(m.C).toEqual([]);
  });
});

describe("SV-VIT-10 / SV-VIT-11 — shock index from one reading", () => {
  it("SV-VIT-10: a newer HR-only reading is never divided by an older SBP", () => {
    // Mixed: 130 / 100 = 1.3 (shock). The real pair is 70 / 100 = 0.7.
    const m = run([vitals(10, { hr: 70, systolicBp: 100 }), vitals(1, { hr: 130 })]);
    expect(m.values.shockIndex).toBeCloseTo(0.7, 5);
    expect(m.C).toEqual(["tachycardia"]);
  });
  it("SV-VIT-11: HR and SBP of one reading still derive the shock index", () => {
    const m = run([vitals(2, { hr: 110, systolicBp: 100, diastolicBp: 70 })]);
    expect(m.values.shockIndex).toBeCloseTo(1.1, 5);
    expect(m.C).toEqual(expect.arrayContaining(["shock_index_high", "shock_index_severe"]));
  });
  it("SV-VIT-10: an HR marked artefact removes the shock index of that reading", () => {
    const v = vitals(3, { hr: 130, systolicBp: 100 });
    const m = run([v, artefact(2, v.id, ["hr"])]);
    expect(m.values.shockIndex).toBeUndefined();
    expect(m.C).toEqual([]);
  });
});
