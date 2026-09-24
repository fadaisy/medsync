import type { AirwayFindingSet } from "@/lib/resus/airway";
import type { StepState } from "@/lib/resus/model";
import { describe, expect, it } from "vitest";

import { EMPTY_CONTEXT } from "@/lib/resus/model";
import {
  abcAbnormalFrom,
  arrestActive,
  febrileChildSuggested,
  latestContext,
  lowRespRateSuggested,
  mergeContext,
} from "@/lib/resus/survey/context";
import { ctxEvent, ev } from "./survey-fixtures";

/** GATE A §4 — context events, the arrest state, merges and suggestions. */

const st = (step: StepState["step"], visual: StepState["visual"]): StepState => ({
  step,
  visual,
  engineState: null,
  recordedState: null,
  assessed: false,
  fromVitals: false,
  derivedCodes: [],
  outstanding: 0,
});

describe("SV-CTX-01 — latestContext", () => {
  it("SV-CTX-01: no context event → EMPTY_CONTEXT", () => {
    expect(latestContext([])).toEqual(EMPTY_CONTEXT);
  });
  it("SV-CTX-01: the latest context event wins", () => {
    const tl = [ctxEvent(5, { trauma: true }), ctxEvent(1, { allergenTrigger: true })];
    expect(latestContext(tl)).toEqual({ ...EMPTY_CONTEXT, allergenTrigger: true });
  });
  it("SV-CTX-01: order in the array does not matter (clinical time decides)", () => {
    const tl = [ctxEvent(1, { allergenTrigger: true }), ctxEvent(5, { trauma: true })];
    expect(latestContext(tl).allergenTrigger).toBe(true);
    expect(latestContext(tl).trauma).toBe(false);
  });
  it("SV-CTX-01: missing keys in a stored payload fall back to the empty context", () => {
    const tl = [ev("context", null, 1, { flags: { trauma: true }, label: "Context" })];
    expect(latestContext(tl)).toEqual({ ...EMPTY_CONTEXT, trauma: true });
  });
  it("SV-CTX-01: an assessment's context is never read as patient context", () => {
    const tl = [ev("assessment", "A", 1, { airway: { context: { trauma: true } } })];
    expect(latestContext(tl)).toEqual(EMPTY_CONTEXT);
  });
});

describe("SV-CTX-02 — arrestActive", () => {
  it("SV-CTX-02: no arrest event → not in arrest", () => {
    expect(arrestActive([])).toBe(false);
  });
  it("SV-CTX-02: a legacy arrest_detected without arrestSeq → in arrest", () => {
    expect(arrestActive([ev("arrest_detected", "arrest", 3, { reason: "x" })])).toBe(true);
  });
  it("SV-CTX-02: ROSC after the arrest clears it", () => {
    const tl = [
      ev("arrest_detected", "arrest", 10, { arrestSeq: 1 }),
      ev("rosc", "arrest", 2, { arrestSeq: 1, signs: ["pulse"] }),
    ];
    expect(arrestActive(tl)).toBe(false);
  });
  it("SV-CTX-02: re-arrest after ROSC is active again", () => {
    const tl = [
      ev("arrest_detected", "arrest", 10, { arrestSeq: 1 }),
      ev("rosc", "arrest", 6, { arrestSeq: 1 }),
      ev("arrest_detected", "arrest", 2, { arrestSeq: 2 }),
    ];
    expect(arrestActive(tl)).toBe(true);
  });
  it("SV-CTX-02: resuscitation stopped or death confirmed ends the arrest state", () => {
    const start = ev("arrest_detected", "arrest", 30, { arrestSeq: 1 });
    expect(arrestActive([start, ev("resuscitation_stopped", "arrest", 5, {})])).toBe(false);
    expect(arrestActive([start, ev("death_confirmed", "arrest", 1, {})])).toBe(false);
  });
});

describe("SV-CTX-17 — abcAbnormalFrom", () => {
  it("SV-CTX-17: B threatened → abnormal", () => {
    expect(abcAbnormalFrom([st("A", "clear"), st("B", "threatened")])).toBe(true);
  });
  it("SV-CTX-17: C active threat → abnormal", () => {
    expect(abcAbnormalFrom([st("C", "active_threat")])).toBe(true);
  });
  it("SV-CTX-17: addressed / clear / pending → not abnormal", () => {
    expect(abcAbnormalFrom([st("A", "addressed"), st("B", "clear"), st("C", "pending")])).toBe(
      false,
    );
  });
  it("SV-CTX-17: D or E threat does not count", () => {
    expect(abcAbnormalFrom([st("D", "active_threat"), st("E", "threatened")])).toBe(false);
  });
});

describe("SV-CTX-18 — mergeContext (recorded || current)", () => {
  type ACtx = AirwayFindingSet["context"];
  const current: Required<ACtx> = {
    trauma: false,
    allergenTrigger: true,
    noSignsOfLife: false,
    gagPresent: false,
  };
  it("SV-CTX-18: a recorded flag survives an empty current context", () => {
    expect(mergeContext<ACtx>({ trauma: true }, current).trauma).toBe(true);
  });
  it("SV-CTX-18: the current context adds to a recorded set", () => {
    expect(mergeContext<ACtx>({}, current).allergenTrigger).toBe(true);
  });
  it("SV-CTX-18: the result has exactly the current keys, all booleans", () => {
    expect(mergeContext<ACtx>({ trauma: undefined }, current)).toEqual({
      trauma: false,
      allergenTrigger: true,
      noSignsOfLife: false,
      gagPresent: false,
    });
  });
});

describe("SV-CTX-19 — Low RR suggested from RR ≤ 8 (signed B rr_low_falling)", () => {
  it.each([
    [7, true],
    [8, true],
    [9, false],
    [null, false],
  ])("SV-CTX-19: RR %s → %s", (rr, want) => {
    expect(lowRespRateSuggested(rr)).toBe(want);
  });
});

describe("SV-CTX-20 — Febrile child suggested (age < 16, E fever stage ≥ 38 °C)", () => {
  it.each([
    [9, 38, true],
    [9, 37.9, false],
    [9, 40.5, true],
    [15, 38.2, true],
    [16, 39, false],
    [null, 39, false],
    [9, null, false],
  ])("SV-CTX-20: age %s, T %s → %s", (age, t, want) => {
    expect(febrileChildSuggested(age, t)).toBe(want);
  });
});
