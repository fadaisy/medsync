import type { PatientContextFlags } from "@/lib/resus/model";
import type { StepAdapter } from "@/lib/resus/survey/floor";
import type { AbcdeLetter, TimelineEvent } from "@/lib/resus/types";
import { describe, expect, it } from "vitest";

import { DERIVED_CODES, STEP_PRESENTATION } from "@/lib/resus/reference/presentation";
import { legacyContexts } from "@/lib/resus/survey/context";
import {
  AIRWAY_ADAPTER,
  BREATHING_ADAPTER,
  CIRCULATION_ADAPTER,
  DISABILITY_ADAPTER,
  evaluateStep,
  EXPOSURE_ADAPTER,
  ladderRank,
} from "@/lib/resus/survey/floor";
import { ABCDE_LETTERS } from "@/lib/resus/types";
import { assess, flags, v2 } from "./survey-fixtures";

/**
 * GATE A §5 / §10 item 2 — worsen-only, exhaustively (SV-EQ-08): every recorded
 * set × every subset of the step's vitals-derived codes × patient context × the
 * arrest state, through the floor's evaluateStep and the raw signed classifier.
 * Generated timelines (worsen-only end to end, step bar vs engine) are in
 * equivalence-step-bar.test.ts.
 */

/** Recorded finding sets per step (partial over the empty set); {} = unclassifiable. */
const RECORDED: Record<AbcdeLetter, Record<string, unknown>[]> = {
  A: [
    {},
    { patency: "patent_talking" },
    { patency: "patent_at_risk" },
    { present: ["snoring"] },
    { patency: "completely_obstructed" },
    { patency: "apnoeic" },
  ],
  B: [
    {},
    { state: "adequate" },
    { state: "distress_compensating" },
    { present: ["wheeze"] },
    { state: "failure_decompensating" },
    { state: "peri_arrest" },
  ],
  C: [
    {},
    { state: "well_perfused" },
    { state: "compensated_shock" },
    { state: "decompensated_shock" },
    { present: ["absent_peripheral_pulses"] },
  ],
  D: [
    {},
    { state: "alert" },
    { gcs: { eye: 4, verbal: 5, motor: 6 } },
    { avpu: "V" },
    { gcs: { eye: 2, verbal: 2, motor: 3 } },
    { present: ["active_seizure"] },
  ],
  E: [
    {},
    { state: "no_new_critical_finding" },
    { present: ["wound"] },
    { coreTempC: 31 },
    { present: ["non_blanching_rash"] },
  ],
};
const FLAG_SETS: Partial<PatientContextFlags>[] = [
  {},
  { trauma: true, allergenTrigger: true },
  { spinalInjury: true, headInjury: true, pregnancy: "confirmed", opioidsSuspected: true },
];

const subsets = <T>(xs: readonly T[]): T[][] =>
  Array.from({ length: 2 ** xs.length }, (_, m) => xs.filter((_, i) => (m >> i) & 1));
const rank = (step: AbcdeLetter, s: string | null) => ladderRank(STEP_PRESENTATION[step].ladder, s);

type AnyFs = { present: string[]; context: Record<string, boolean | undefined> };

/** evaluateStep plus the raw engine classification of the recorded and combined sets. */
function evalWith<FS extends AnyFs>(
  step: AbcdeLetter,
  ad: StepAdapter<FS>,
  ctx: Required<FS["context"]>,
  tl: readonly TimelineEvent[],
  derived: readonly string[],
  inArrest: boolean,
) {
  const e = evaluateStep(step, ad, tl, ctx, derived, inArrest);
  const raw = (fs: FS | null) => (fs ? ad.classify(fs) : null);
  return { state: e.state, rawRecorded: raw(e.recordedFs), rawCombined: raw(e.combined) };
}
function evalStep(
  step: AbcdeLetter,
  tl: readonly TimelineEvent[],
  derived: readonly string[],
  f: PatientContextFlags,
  inArrest: boolean,
) {
  const c = legacyContexts(v2({ flags: f, inArrest }));
  if (step === "A") return evalWith("A", AIRWAY_ADAPTER, c.A, tl, derived, inArrest);
  if (step === "B") return evalWith("B", BREATHING_ADAPTER, c.B, tl, derived, inArrest);
  if (step === "C") return evalWith("C", CIRCULATION_ADAPTER, c.C, tl, derived, inArrest);
  if (step === "D") return evalWith("D", DISABILITY_ADAPTER, c.D, tl, derived, inArrest);
  return evalWith("E", EXPOSURE_ADAPTER, c.E, tl, derived, inArrest);
}

describe("SV-EQ-08 — worsen-only, exhaustive: recorded × every subset of the derived codes", () => {
  it.each(ABCDE_LETTERS)("SV-EQ-08: step %s", (step) => {
    let n = 0;
    for (const rec of [null, ...RECORDED[step]])
      for (const derived of subsets(DERIVED_CODES[step]))
        for (const f of FLAG_SETS)
          for (const inArrest of [false, true]) {
            const tl = rec ? [assess(step, 2, rec)] : [];
            const r = evalStep(step, tl, derived, flags(f), inArrest);
            const why = JSON.stringify({ rec, derived, f, inArrest });
            const { engineState, recordedState } = r.state;
            // The displayed (combined) state is never better than recorded-only.
            expect(rank(step, engineState), why).toBeGreaterThanOrEqual(rank(step, recordedState));
            // The signed classifier is itself monotone under added codes (the clamp never has to act).
            if (r.rawRecorded !== null)
              expect(rank(step, r.rawCombined), why).toBeGreaterThanOrEqual(
                rank(step, r.rawRecorded),
              );
            if (derived.length === 0)
              expect([engineState, r.state.fromVitals], why).toEqual([recordedState, false]);
            if (r.state.fromVitals && r.state.assessed)
              expect(rank(step, engineState), why).toBeGreaterThan(rank(step, recordedState));
            n += 1;
          }
    expect(n).toBe((RECORDED[step].length + 1) * 2 ** DERIVED_CODES[step].length * 3 * 2);
  });
});
