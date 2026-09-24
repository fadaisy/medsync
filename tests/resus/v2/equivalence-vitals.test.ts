import type { StepState } from "@/lib/resus/model";
import type { TimelineEvent } from "@/lib/resus/types";
import { describe, expect, it } from "vitest";

import { computeSurvey } from "@/lib/resus/survey/floor";
import {
  ADULT_MIN_AGE_YEARS,
  deriveMeasureFindings,
  emptyMeasureFindings,
} from "@/lib/resus/survey/vitals-bands";
import { assess, flags, NOW, SHOCKED, vitals } from "./survey-fixtures";

/**
 * GATE A §5 / §10 item 2 — pending stays pending (SV-EQ-11, -12) and children
 * and unknown age derive nothing (SV-EQ-13). "In-band" vitals are the ones no
 * signed band rule fires on; the grid includes each band's edge (HR 60 / 100,
 * RR 9 / 24, SpO₂ 94 on air, GCS 9, glucose 3.0 — the rule numbers themselves
 * live in VITAL_BAND_RULES) and the suite first proves the grid derives nothing.
 */

const HR = [60, 80, 100];
const RR = [9, 16, 24];
const SPO2_AIR = [94, 97, 100];
const BP = [
  [120, 80],
  [135, 85],
  [150, 95],
];
const GCS = [9, 15];
const GLUCOSE = [3.0, 5.5];
const IN_BAND: Record<string, unknown>[] = HR.flatMap((hr) =>
  RR.flatMap((rr) =>
    SPO2_AIR.flatMap((spo2) =>
      BP.flatMap(([systolicBp, diastolicBp]) =>
        GCS.flatMap((gcs) =>
          GLUCOSE.map((glucose) => ({
            hr,
            rr,
            spo2,
            oxygen: "air",
            systolicBp,
            diastolicBp,
            gcs,
            glucose,
          })),
        ),
      ),
    ),
  ),
);

const run = (tl: TimelineEvent[], ageYears: number | null, inArrest = false) =>
  computeSurvey(tl, { ageYears, nowMs: NOW, inArrest });
const expectPending = (s: StepState, why: string) =>
  expect([s.visual, s.engineState, s.assessed, s.fromVitals, s.derivedCodes], why).toEqual([
    "pending",
    null,
    false,
    false,
    [],
  ]);

describe("SV-EQ-11 — in-band adult vitals never move an unassessed step from pending", () => {
  it("SV-EQ-11: the in-band grid (edges included) derives no code at all", () => {
    expect(IN_BAND).toHaveLength(3 ** 4 * 2 * 2);
    for (const snap of IN_BAND) {
      const m = deriveMeasureFindings([vitals(2, snap)], { ageYears: 40, nowMs: NOW });
      expect([m.A, m.B, m.C, m.D], JSON.stringify(snap)).toEqual([[], [], [], []]);
    }
  });
  it("SV-EQ-11: vitals only — all five steps stay pending, in or out of arrest", () => {
    for (const snap of IN_BAND)
      for (const inArrest of [false, true])
        for (const s of run([vitals(2, snap)], 40, inArrest).states)
          expectPending(s, `${s.step} ${JSON.stringify(snap)} arrest=${inArrest}`);
  });
  it("SV-EQ-11: beside assessed steps, the unassessed stay pending and the assessed are unchanged", () => {
    const rec = [
      assess("A", 5, { patency: "patent_talking" }),
      assess("B", 5, {}), // recorded but unclassifiable → still not assessed
      assess("C", 5, { state: "compensated_shock" }),
    ];
    const base = run(rec, 40).states;
    for (const snap of IN_BAND) {
      const states = run([...rec, vitals(2, snap)], 40).states;
      for (const s of states.filter((x) => !x.assessed)) expectPending(s, s.step);
      for (const s of states.filter((x) => x.assessed))
        expect(s, s.step).toEqual(base.find((b) => b.step === s.step));
    }
  });
});

describe("SV-EQ-12 — vitals alone never produce Clear", () => {
  it("SV-EQ-12: over a seeded sample of any adult vitals, no unassessed step reads Clear", () => {
    let s = 42;
    const r = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32;
    const int = (lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
    let threats = 0;
    for (let n = 0; n < 400; n++) {
      const sbp = int(50, 220);
      const snap = {
        hr: int(20, 200),
        rr: int(0, 60),
        spo2: int(50, 100),
        oxygen: r() < 0.5 ? "air" : "oxygen",
        systolicBp: sbp,
        diastolicBp: int(20, sbp),
        gcs: int(3, 15),
        glucose: int(10, 250) / 10,
      };
      const tl = [assess("B", 3, {}), assess("E", 3, {}), vitals(int(0, 15), snap)];
      const inArrest = r() < 0.3;
      for (const st of run(tl, 40, inArrest).states) {
        // In arrest an empty B set classifies from the arrest state alone (apnoeic).
        if (!inArrest) expect(st.assessed, `${n} ${st.step}`).toBe(false);
        expect(st.visual, `${n} ${st.step}`).not.toBe("clear");
        if (st.visual !== "pending") threats += 1;
      }
    }
    expect(threats).toBeGreaterThan(0); // the sample does derive threats
  });
});

describe("SV-EQ-13 — children (< 16) and unknown age derive nothing", () => {
  const AGES: (number | null)[] = [null, Number.NaN, 0, 1, 5, 12, ADULT_MIN_AGE_YEARS - 1];
  const EXTREME = { ...SHOCKED, rr: 40, spo2: 80, oxygen: "air", gcs: 5, glucose: 2.0 };
  const tl = () => [
    assess("C", 4, { state: "well_perfused" }),
    assess("D", 1, { gcs: { eye: 1, verbal: 2, motor: 3 } }),
    vitals(1, EXTREME),
  ];

  it("SV-EQ-13: the same vitals derive in A, B, C and D for an adult (the contrast)", () => {
    const m = deriveMeasureFindings(tl(), { ageYears: ADULT_MIN_AGE_YEARS, nowMs: NOW });
    for (const codes of [m.A, m.B, m.C, m.D]) expect(codes.length).toBeGreaterThan(0);
  });
  it.each(AGES)("SV-EQ-13: age %s — no Measure finding, no value, no GCS", (ageYears) => {
    expect(deriveMeasureFindings(tl(), { ageYears, nowMs: NOW })).toEqual(emptyMeasureFindings());
  });
  it.each(AGES)("SV-EQ-13: age %s — every step shows its recorded state only", (ageYears) => {
    for (const inArrest of [false, true]) {
      const states = run([...tl()], ageYears, inArrest).states;
      for (const s of states) {
        const why = `${s.step} arrest=${inArrest}`;
        expect([s.derivedCodes, s.fromVitals, s.engineState], why).toEqual([
          [],
          false,
          s.recordedState,
        ]);
        if (!s.assessed) expectPending(s, why);
      }
    }
  });
  it("SV-EQ-13: the patient context does not reintroduce derivation for a child", () => {
    const ctx = flags({ febrileChild: true, trauma: true });
    const s = computeSurvey(tl(), { ageYears: 9, nowMs: NOW, flags: ctx });
    expect(s.states.flatMap((x) => x.derivedCodes)).toEqual([]);
  });
});
