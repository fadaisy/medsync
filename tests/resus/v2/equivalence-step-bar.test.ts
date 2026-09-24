import type { PatientContextFlags } from "@/lib/resus/model";
import type { StepAdapter } from "@/lib/resus/survey/floor";
import type { AbcdeLetter, TimelineEvent } from "@/lib/resus/types";
import { describe, expect, it } from "vitest";

import * as airway from "@/lib/resus/airway";
import * as breathing from "@/lib/resus/breathing";
import * as circulation from "@/lib/resus/circulation";
import * as disability from "@/lib/resus/disability";
import * as exposure from "@/lib/resus/exposure";
import { STEP_PRESENTATION } from "@/lib/resus/reference/presentation";
import { abcAbnormalFrom, legacyContexts, mergeContext } from "@/lib/resus/survey/context";
import {
  AIRWAY_ADAPTER,
  BREATHING_ADAPTER,
  CIRCULATION_ADAPTER,
  computeSurvey,
  DISABILITY_ADAPTER,
  EXPOSURE_ADAPTER,
  ladderRank,
} from "@/lib/resus/survey/floor";
import { computeStepBar } from "@/lib/resus/survey/step-bar";
import { ADULT_MIN_AGE_YEARS } from "@/lib/resus/survey/vitals-bands";
import { ABCDE_LETTERS } from "@/lib/resus/types";
import { assess, ctxEvent, flags, NOW, v2, vitals } from "./survey-fixtures";

/**
 * GATE A §5 / §10 item 2 over generated timelines (seeded, reproducible):
 * worsen-only end to end (SV-EQ-09) and the step bar agrees with each step's
 * own signed engine (SV-EQ-10). Recorded sets are drawn from each step's signed
 * catalog (STEP_PRESENTATION overall + findings); vitals span wide ranges, fresh
 * and stale; the patient context and the arrest state vary.
 */

const rand = (seed: number) => {
  let s = seed >>> 0;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32;
};
const r = rand(20260923);
const int = (lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]!;

const HEADLINE_KEY: Record<AbcdeLetter, string> = {
  A: "patency",
  B: "state",
  C: "state",
  D: "state",
  E: "state",
};
const FLAG_SETS: Partial<PatientContextFlags>[] = [
  {},
  { trauma: true },
  { allergenTrigger: true, knownAsthma: true, copdRisk: true },
  { spinalInjury: true, headInjury: true, activeBleeding: true, pregnancy: "possible" },
];

/** A recorded finding set drawn from the step's signed catalog, or null (not recorded). */
function randomRecorded(step: AbcdeLetter): Record<string, unknown> | null {
  if (r() < 0.3) return null;
  const p = STEP_PRESENTATION[step];
  const fs: Record<string, unknown> = {
    present: Array.from({ length: int(0, 3) }, () => pick(p.findings).code),
  };
  if (r() < 0.4) fs[HEADLINE_KEY[step]] = pick(p.overall);
  if (step === "D" && r() < 0.3) fs.gcs = { eye: int(1, 4), verbal: int(1, 5), motor: int(1, 6) };
  if (step === "D" && r() < 0.2) fs.avpu = pick(["A", "V", "P", "U"]);
  if (step === "E" && r() < 0.4) fs.coreTempC = int(250, 420) / 10;
  return fs;
}

interface Case {
  tl: TimelineEvent[];
  f: PatientContextFlags;
  ageYears: number;
  inArrest: boolean;
}
function randomCase(): Case {
  const f = flags(pick(FLAG_SETS));
  const tl: TimelineEvent[] = [ctxEvent(40, f)];
  for (const step of ABCDE_LETTERS) {
    const fs = randomRecorded(step);
    if (fs) tl.push(assess(step, int(1, 25), fs));
  }
  const snap: Record<string, unknown> = {};
  const maybe = (k: string, v: unknown) => r() < 0.7 && (snap[k] = v);
  const sbp = int(50, 220);
  maybe("hr", int(20, 200));
  maybe("rr", int(0, 60));
  maybe("spo2", int(50, 100));
  maybe("systolicBp", sbp);
  maybe("diastolicBp", int(20, sbp));
  maybe("gcs", int(3, 15));
  maybe("glucose", int(10, 250) / 10);
  maybe("oxygen", pick(["air", "oxygen"]));
  tl.push(vitals(int(0, 30), snap));
  return { tl, f, ageYears: pick([ADULT_MIN_AGE_YEARS, 40, 85]), inArrest: r() < 0.25 };
}
const CASES = Array.from({ length: 600 }, randomCase);
const rank = (step: AbcdeLetter, s: string | null) => ladderRank(STEP_PRESENTATION[step].ladder, s);

describe("SV-EQ-09 — worsen-only over generated timelines (computeSurvey)", () => {
  it("SV-EQ-09: the displayed state is never better than the recorded-only state", () => {
    let worsened = 0;
    for (const [n, c] of CASES.entries()) {
      const s = computeSurvey(c.tl, { ageYears: c.ageYears, nowMs: NOW, inArrest: c.inArrest });
      for (const st of s.states) {
        const why = `case ${n} step ${st.step}`;
        expect(rank(st.step, st.engineState), why).toBeGreaterThanOrEqual(
          rank(st.step, st.recordedState),
        );
        if (st.derivedCodes.length === 0) expect(st.engineState, why).toBe(st.recordedState);
        if (st.fromVitals) worsened += 1;
      }
    }
    expect(worsened).toBeGreaterThan(0); // the sample does exercise vitals worsening
  });
});

type AnyFs = { present: string[]; context: Record<string, boolean | undefined> };

/** The step's states straight from its signed engine (latest + classify; see the wiring test). */
function direct<FS extends AnyFs>(
  ad: StepAdapter<FS>,
  ctx: Required<FS["context"]>,
  tl: readonly TimelineEvent[],
  derived: readonly string[],
) {
  const base = ad.latest(tl);
  const empty: FS = { ...ad.empty(), context: ctx };
  const start: FS = base ? { ...base, context: mergeContext(base.context, ctx) } : empty;
  const plus = (fs: FS): FS => ({ ...fs, present: [...fs.present, ...derived] });
  return {
    rec: base ? ad.classify(start) : null,
    comb: ad.classify(plus(start)),
    derivedOnly: ad.classify(plus(empty)),
  };
}
function directStates(step: AbcdeLetter, c: Case, abcAbnormal: boolean, derived: string[]) {
  const x = legacyContexts(v2({ flags: c.f, inArrest: c.inArrest, abcAbnormal }));
  if (step === "A") return direct(AIRWAY_ADAPTER, x.A, c.tl, derived);
  if (step === "B") return direct(BREATHING_ADAPTER, x.B, c.tl, derived);
  if (step === "C") return direct(CIRCULATION_ADAPTER, x.C, c.tl, derived);
  if (step === "D") return direct(DISABILITY_ADAPTER, x.D, c.tl, derived);
  return direct(EXPOSURE_ADAPTER, x.E, c.tl, derived);
}

describe("SV-EQ-10 — the step bar agrees with each step's own engine", () => {
  it("SV-EQ-10: the floor adapters wire exactly the signed engine functions", () => {
    const wired: [unknown, unknown][] = [
      [AIRWAY_ADAPTER.latest, airway.latestAirwayAssessment],
      [AIRWAY_ADAPTER.classify, airway.classifyAirway],
      [AIRWAY_ADAPTER.triggered, airway.triggeredActions],
      [BREATHING_ADAPTER.latest, breathing.latestBreathingAssessment],
      [BREATHING_ADAPTER.classify, breathing.classifyBreathing],
      [BREATHING_ADAPTER.triggered, breathing.triggeredActions],
      [CIRCULATION_ADAPTER.latest, circulation.latestCirculationAssessment],
      [CIRCULATION_ADAPTER.classify, circulation.classifyCirculation],
      [CIRCULATION_ADAPTER.triggered, circulation.triggeredActions],
      [DISABILITY_ADAPTER.latest, disability.latestDisabilityAssessment],
      [DISABILITY_ADAPTER.classify, disability.classifyDisability],
      [DISABILITY_ADAPTER.triggered, disability.triggeredActions],
      [EXPOSURE_ADAPTER.latest, exposure.latestExposureAssessment],
      [EXPOSURE_ADAPTER.classify, exposure.classifyExposure],
      [EXPOSURE_ADAPTER.triggered, exposure.triggeredActions],
    ];
    for (const [adapterFn, engineFn] of wired) expect(adapterFn).toBe(engineFn);
  });
  it("SV-EQ-10: clear iff ladder-best; pending iff not assessed and no derived threat", () => {
    const seen = new Set<string>();
    for (const [n, c] of CASES.entries()) {
      const bar = computeStepBar(c.tl, {
        ageYears: c.ageYears,
        arrestDetected: c.inArrest,
        nowMs: NOW,
      });
      const abc = abcAbnormalFrom(bar);
      for (const s of bar) {
        const why = `case ${n} step ${s.step}`;
        const d = directStates(s.step, c, abc, s.derivedCodes);
        const worse = rank(s.step, d.comb) > rank(s.step, d.rec) ? d.comb : d.rec;
        const derivedThreat = s.derivedCodes.length > 0 && d.derivedOnly !== null;
        expect([s.recordedState, s.assessed], why).toEqual([d.rec, d.rec !== null]);
        expect(s.engineState, why).toBe(s.assessed || s.derivedCodes.length > 0 ? worse : null);
        expect(s.visual === "clear", why).toBe(
          s.engineState === STEP_PRESENTATION[s.step].ladder[0],
        );
        expect(s.visual === "pending", why).toBe(!s.assessed && !derivedThreat);
        seen.add(s.visual);
      }
    }
    // The sample reaches every visual the generator can produce (no actions → no "addressed").
    expect([...seen].sort()).toEqual(["active_threat", "clear", "pending", "threatened"]);
  });
});
