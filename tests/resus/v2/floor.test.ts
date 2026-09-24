import type { TimelineEvent } from "@/lib/resus/types";
import { describe, expect, it } from "vitest";

import { computeSurvey, vitalsStale } from "@/lib/resus/survey/floor";
import { computeStepBar } from "@/lib/resus/survey/step-bar";
import { act, assess, ctxEvent, ev, NORMAL, NOW, SHOCKED, vitals } from "./survey-fixtures";

/** GATE A §5 — the step floor: own-engine state, worsen-only, visuals (SV-FLR-01..13). */

const survey = (tl: TimelineEvent[], over: { ageYears?: number | null; inArrest?: boolean } = {}) =>
  computeSurvey(tl, { ageYears: 40, nowMs: NOW, ...over });
const step = (tl: TimelineEvent[], s: "A" | "B" | "C" | "D" | "E", over = {}) =>
  survey(tl, over).states.find((x) => x.step === s)!;

describe("assessed and pending", () => {
  it("SV-FLR-01: a patent, talking airway is assessed and Clear", () => {
    const a = step([assess("A", 1, { patency: "patent_talking" })], "A");
    expect([a.assessed, a.recordedState, a.visual]).toEqual([true, "secure", "clear"]);
  });
  it("SV-FLR-01: an empty C findings set is not assessed and stays pending", () => {
    const c = step([assess("C", 1, {})], "C");
    expect([c.assessed, c.visual, c.engineState]).toEqual([false, "pending", null]);
  });
  it("SV-FLR-02: a stored engine state is used only when today's classification is null", () => {
    const tl = [assess("A", 1, { patency: "patent" }, { airwayState: "secure" })];
    expect(step(tl, "A").visual).toBe("clear");
    const bad = [assess("A", 1, { patency: "patent" }, { airwayState: "not_a_state" })];
    expect(step(bad, "A").visual).toBe("pending");
  });
  it("SV-FLR-03: normal vitals alone leave every step pending", () => {
    for (const s of survey([vitals(2, NORMAL)]).states) expect(s.visual).toBe("pending");
  });
  it("SV-FLR-03: a derived code the engine cannot classify (D hypoglycaemia) stays pending", () => {
    const d = step([vitals(2, { glucose: 2.5 })], "D");
    expect([d.visual, d.fromVitals, d.derivedCodes]).toEqual(["pending", false, ["hypoglycaemia"]]);
  });
});

describe("worsen-only", () => {
  it("SV-FLR-04: a milder derived code never improves a recorded decompensated C", () => {
    const tl = [assess("C", 3, { state: "decompensated_shock" }), vitals(1, { hr: 110 })];
    const c = step(tl, "C");
    expect([c.engineState, c.recordedState, c.fromVitals]).toEqual([
      "decompensated_shock",
      "decompensated_shock",
      false,
    ]);
  });
  it("SV-FLR-05: B adequate + normal vitals is Clear; + SpO₂ 91 worsens it from vitals", () => {
    const base = assess("B", 3, { state: "adequate" });
    expect(step([base, vitals(1, NORMAL)], "B").visual).toBe("clear");
    const b = step([base, vitals(1, { spo2: 91 })], "B");
    expect([b.recordedState, b.engineState, b.fromVitals, b.assessed]).toEqual([
      "adequate",
      "failure_decompensating",
      true,
      true,
    ]);
    expect(b.visual).toBe("threatened");
  });
  it("SV-FLR-06: an unassessed C under threat from vitals keeps assessed = false", () => {
    const c = step([vitals(3, SHOCKED)], "C");
    expect([c.assessed, c.fromVitals, c.engineState]).toEqual([false, true, "decompensated_shock"]);
  });
  it("SV-FLR-06: stale vitals do not mark fromVitals", () => {
    expect(step([vitals(30, SHOCKED)], "C").fromVitals).toBe(false);
  });
});

describe("active threat, arrest, addressed, threatened", () => {
  it("SV-FLR-07: complete airway obstruction is an active threat", () => {
    expect(step([assess("A", 1, { patency: "completely_obstructed" })], "A").visual).toBe(
      "active_threat",
    );
  });
  it("SV-FLR-07: decompensated shock from vitals alone is an active threat", () => {
    expect(step([vitals(2, SHOCKED)], "C").visual).toBe("active_threat");
  });
  it("SV-FLR-07: D GCS 7 and E temperature extreme are active threats", () => {
    const tl = [
      assess("D", 1, { gcs: { eye: 2, verbal: 2, motor: 3 } }),
      assess("E", 1, { coreTempC: 31 }),
    ];
    expect(step(tl, "D").visual).toBe("active_threat");
    expect(step(tl, "E").visual).toBe("active_threat");
  });
  it("SV-FLR-07: B wheeze after an allergen (IM adrenaline, priority 0) is an active threat", () => {
    const tl = [ctxEvent(5, { allergenTrigger: true }), assess("B", 1, { present: ["wheeze"] })];
    expect(step(tl, "B").visual).toBe("active_threat");
  });
  it("SV-FLR-08: the arrest state makes a recorded airway apnoeic_arrest, an active threat", () => {
    const a = step([assess("A", 1, { patency: "patent_talking" })], "A", { inArrest: true });
    expect([a.engineState, a.visual]).toEqual(["apnoeic_arrest", "active_threat"]);
  });
  it("SV-FLR-08: in arrest a threatened step reads active threat", () => {
    const tl = [assess("B", 1, { state: "distress_compensating" })];
    expect(step(tl, "B").visual).toBe("threatened");
    expect(step(tl, "B", { inArrest: true }).visual).toBe("active_threat");
  });
  it("SV-FLR-09: all triggered actions performed → addressed", () => {
    const tl = [
      assess("B", 5, { state: "distress_compensating" }),
      act("B", 4, "b_sit_upright", "performed"),
      act("B", 4, "b_high_flow_o2", "performed"),
      act("B", 4, "b_continuous_monitoring", "performed"),
    ];
    const b = step(tl, "B");
    expect([b.visual, b.outstanding]).toEqual(["addressed", 0]);
  });
  it("SV-FLR-09: nothing outstanding but nothing performed (all deferred) → threatened", () => {
    const tl = [
      assess("B", 5, { state: "distress_compensating" }),
      act("B", 4, "b_sit_upright", "deferred"),
      act("B", 4, "b_high_flow_o2", "not_indicated"),
      act("B", 4, "b_continuous_monitoring", "deferred"),
    ];
    expect(step(tl, "B").visual).toBe("threatened");
  });
  it("SV-FLR-10: outstanding counts triggered ∪ recorded-only (failed / indicated / in progress)", () => {
    const tl = [
      assess("B", 5, { state: "distress_compensating" }),
      act("B", 4, "b_sit_upright", "performed"),
      act("B", 4, "b_niv", "in_progress"),
    ];
    const s = survey(tl);
    expect(s.states[1]!.outstanding).toBe(3); // high-flow O₂, monitoring, NIV (recorded-only)
    expect(s.actions.B.map((a) => a.code)).toContain("b_niv");
  });
});

describe("signals, staleness, context", () => {
  it("SV-FLR-11: signals — GCS, opioid, glucose and core temperature", () => {
    const tl = [
      ctxEvent(9, { opioidsSuspected: true }),
      assess("D", 2, { gcs: { eye: 2, verbal: 2, motor: 3 }, present: ["pinpoint_pupils"] }),
    ];
    expect(survey(tl).signals).toMatchObject({
      gcsTotal: 7,
      opioid: true,
      glucoseMissing: true,
      coreTempMissing: true,
    });
  });
  it("SV-FLR-11: a recorded core temperature clears coreTempMissing", () => {
    expect(survey([assess("E", 1, { coreTempC: 36.8 })]).signals.coreTempMissing).toBe(false);
  });
  it("SV-FLR-12: an intervention after the last vital makes vitals stale", () => {
    expect(vitalsStale([vitals(5, NORMAL), ev("drug", "C", 2, { label: "drug" })])).toBe(true);
    expect(vitalsStale([ev("fluid", "C", 5, { label: "fluid" }), vitals(1, NORMAL)])).toBe(false);
  });
  it("SV-FLR-12: a deferred / not-indicated action is not an intervention", () => {
    expect(vitalsStale([vitals(5, NORMAL), act("C", 1, "c_txa", "deferred")])).toBe(false);
    expect(vitalsStale([vitals(5, NORMAL), act("C", 1, "c_txa", "performed")])).toBe(true);
  });
  it("SV-FLR-13: the current patient context reaches a recorded set (trauma → bleeding plan)", () => {
    const rec = assess("C", 3, { state: "compensated_shock" });
    const codes = (tl: TimelineEvent[]) => survey(tl).actions.C.map((a) => a.code);
    expect(codes([rec])).not.toContain("c_stop_bleeding");
    expect(codes([ctxEvent(5, { trauma: true }), rec])).toContain("c_stop_bleeding");
  });
  it("SV-FLR-13: computeStepBar = computeStepStates with arrestDetected as the arrest state", () => {
    const tl = [assess("B", 1, { state: "distress_compensating" })];
    const bar = computeStepBar(tl, { ageYears: 40, arrestDetected: true, nowMs: NOW });
    expect(bar[1]).toMatchObject({ step: "B", visual: "active_threat", assessed: true });
  });
});
