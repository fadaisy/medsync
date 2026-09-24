import type { AbcdeLetter, TimelineEvent } from "@/lib/resus/types";
import { describe, expect, it } from "vitest";

import {
  arrestActive,
  legacyContexts,
  legacyStepContext,
  mergeContext,
} from "@/lib/resus/survey/context";
import { computeSurvey, DISABILITY_ADAPTER, evaluateStep } from "@/lib/resus/survey/floor";
import { buildAssessmentPayload } from "@/lib/resus/v2-payloads";
import { ev, NORMAL, NOW, v2, vitals } from "./survey-fixtures";

/**
 * SV-CTX-18 / D20 — the one arrest state clears on ROSC. A step recorded during
 * CPR stores the arrest keys in its context (A/B noSignsOfLife, C/D/E noPulse);
 * after ROSC they must come from the current arrest state, not the stored set.
 */

/** A step recorded the way the v2 panel and recordStepFindingsV2 write it. */
function recorded(
  step: AbcdeLetter,
  minsAgo: number,
  fs: Record<string, unknown>,
  inArrest: boolean,
) {
  const context = legacyStepContext(step, v2({ inArrest }));
  return ev("assessment", step, minsAgo, buildAssessmentPayload(step, { ...fs, context }));
}
const arrest = (minsAgo: number) => ev("arrest_detected", "arrest", minsAgo, { arrestSeq: 1 });
const rosc = (minsAgo: number) => ev("rosc", "arrest", minsAgo, { arrestSeq: 1 });

const run = (tl: TimelineEvent[]) => computeSurvey(tl, { ageYears: 40, nowMs: NOW });
const stateOf = (tl: TimelineEvent[], s: AbcdeLetter) => {
  const out = run(tl);
  return { ...out.states.find((x) => x.step === s)!, actions: out.actions[s] };
};

const A_PATENT = { patency: "patent_talking", present: [], difficulty: [] };
const C_WELL = { state: "well_perfused", present: [] };

describe("SV-CTX-18 (D20) — the arrest keys clear on ROSC", () => {
  it("SV-CTX-18 (D20): during the arrest, steps recorded in CPR read as arrest", () => {
    const tl = [arrest(30), recorded("A", 25, A_PATENT, true), recorded("C", 25, C_WELL, true)];
    expect(arrestActive(tl)).toBe(true);
    expect(stateOf(tl, "A").engineState).toBe("apnoeic_arrest");
    expect(stateOf(tl, "C").engineState).toBe("arrest");
  });

  it("SV-CTX-18 (D20): after ROSC, A and C recorded in CPR return to their findings", () => {
    const tl = [
      arrest(30),
      recorded("A", 25, A_PATENT, true),
      recorded("C", 25, C_WELL, true),
      rosc(20),
      vitals(2, NORMAL),
    ];
    expect(arrestActive(tl)).toBe(false);
    const a = stateOf(tl, "A");
    const c = stateOf(tl, "C");
    expect([a.engineState, a.visual]).toEqual(["secure", "clear"]);
    expect([c.engineState, c.visual]).toEqual(["well_perfused", "clear"]);
  });

  it("SV-CTX-18 (D20): after ROSC, shocked vitals drive C and its board is not empty", () => {
    const tl = [
      arrest(30),
      recorded("C", 25, C_WELL, true),
      rosc(20),
      vitals(2, { hr: 125, systolicBp: 78, diastolicBp: 45 }),
    ];
    const c = stateOf(tl, "C");
    expect(c.engineState).not.toBe("arrest");
    expect(c.engineState).toBe("decompensated_shock");
    expect(c.actions.length).toBeGreaterThan(0);
  });

  it("SV-CTX-18 (D20): B and D recorded in CPR leave the arrest after ROSC too", () => {
    const tl = [
      arrest(30),
      recorded("B", 25, { state: "adequate", present: [] }, true),
      recorded(
        "D",
        25,
        { state: null, gcs: null, avpu: "V", glucoseMmol: null, present: [] },
        true,
      ),
      rosc(20),
    ];
    const out = run(tl);
    expect(out.states.find((s) => s.step === "B")!.engineState).toBe("adequate");
    expect(out.actions.D.length).toBeGreaterThan(0);
  });

  it("SV-CTX-18 (D20): a state stored in CPR is not used once the arrest key is dropped", () => {
    // A with a difficulty flag only: today's classification is null; the stored
    // state ("apnoeic_arrest", classified with noSignsOfLife) must not come back.
    const tl = [
      arrest(30),
      recorded("A", 25, { patency: null, present: [], difficulty: ["lemon"] }, true),
    ];
    expect(tl[1]!.payload.airwayState).toBe("apnoeic_arrest");
    const a = stateOf([...tl, rosc(20)], "A");
    expect([a.engineState, a.assessed, a.visual]).toEqual([null, false, "pending"]);
  });

  it("SV-CTX-18 (D20): re-arrest after ROSC puts the steps back in arrest", () => {
    const tl = [
      arrest(30),
      recorded("C", 25, C_WELL, false),
      rosc(20),
      ev("arrest_detected", "arrest", 5, { arrestSeq: 2 }),
    ];
    expect(stateOf(tl, "C").engineState).toBe("arrest");
  });

  it("SV-CTX-18 (D20): a v1 episode with no arrest state keeps a recorded per-step No pulse", () => {
    const tl = [recorded("C", 5, C_WELL, true)];
    expect(arrestActive(tl)).toBe(false);
    expect(stateOf(tl, "C").engineState).toBe("arrest");
  });
});

describe("SV-CTX-18 — mergeContext: keys owned by the current state", () => {
  const cur = legacyContexts(v2());
  it("SV-CTX-18 (D20): a recorded noPulse / noSignsOfLife does not survive a current 'not in arrest'", () => {
    expect(mergeContext({ noPulse: true }, cur.C).noPulse).toBe(false);
    expect(mergeContext({ noSignsOfLife: true }, cur.A).noSignsOfLife).toBe(false);
  });
  it("SV-CTX-18 (D20): with no arrest state in the episode, the recorded toggle still counts", () => {
    expect(mergeContext({ noPulse: true }, cur.C, false).noPulse).toBe(true);
  });
  it("SV-CTX-18 (D20): the current arrest state still sets the keys", () => {
    const inArrest = legacyContexts(v2({ inArrest: true }));
    expect(mergeContext({}, inArrest.E).noPulse).toBe(true);
  });
  it("SV-CTX-18 (SV-CTX-17): D abcAbnormal follows the current A/B/C, never the recorded set", () => {
    expect(mergeContext({ abcAbnormal: true }, cur.D, false).abcAbnormal).toBe(false);
    expect(mergeContext({}, legacyContexts(v2({ abcAbnormal: true })).D).abcAbnormal).toBe(true);
  });
  it("SV-CTX-18 (SV-CTX-17): a D set recorded while C was abnormal un-latches when C is fine", () => {
    const d = {
      state: null,
      gcs: null,
      avpu: "V",
      glucoseMmol: 5.5,
      present: [],
      context: { abcAbnormal: true },
    };
    const tl = [ev("assessment", "D", 5, buildAssessmentPayload("D", d))];
    const out = evaluateStep("D", DISABILITY_ADAPTER, tl, cur.D, [], false);
    expect(out.recordedFs!.context.abcAbnormal).toBe(false);
  });
});
