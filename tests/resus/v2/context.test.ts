import { describe, expect, it } from "vitest";

import { EMPTY_LOCAL } from "@/lib/resus/model";
import { legacyContexts, legacyStepContext } from "@/lib/resus/survey/context";
import { flags, v2 } from "./survey-fixtures";

/**
 * GATE A §4 — patient flags + arrest state + step-local toggles → each step's
 * legacy `context` object, exactly (SV-CTX-03..16, -21, -22).
 */

const on = (over: Parameters<typeof flags>[0]) => legacyContexts(v2({ flags: flags(over) }));

describe("SV-CTX-22 — exact legacy key sets, all false for an empty context", () => {
  it("SV-CTX-22: A keys", () => {
    expect(legacyStepContext("A", v2())).toEqual({
      trauma: false,
      allergenTrigger: false,
      noSignsOfLife: false,
      gagPresent: false,
    });
  });
  it("SV-CTX-22: B keys", () => {
    expect(legacyStepContext("B", v2())).toEqual({
      trauma: false,
      allergenTrigger: false,
      knownAsthma: false,
      copdRisk: false,
      peSuspected: false,
      noSignsOfLife: false,
    });
  });
  it("SV-CTX-22: C keys", () => {
    expect(legacyStepContext("C", v2())).toEqual({
      trauma: false,
      activeBleeding: false,
      febrileChild: false,
      pregnancyPossible: false,
      spinalInjury: false,
      allergenTrigger: false,
      headInjury: false,
      noPulse: false,
    });
  });
  it("SV-CTX-22: D keys", () => {
    expect(legacyStepContext("D", v2())).toEqual({
      opioidsSuspected: false,
      lowRespRate: false,
      pregnancyPostpartum: false,
      headInjury: false,
      alcoholMalnourished: false,
      feverMeningism: false,
      abcAbnormal: false,
      noPulse: false,
    });
  });
  it("SV-CTX-22: E keys", () => {
    expect(legacyStepContext("E", v2())).toEqual({
      trauma: false,
      exposureEnvironment: false,
      serotonergicOrNeuroleptic: false,
      notRecovered: false,
      noPulse: false,
    });
  });
});

describe("patient flags → legacy inputs", () => {
  it("SV-CTX-03: Trauma sets A, C and E trauma — not B (chest trauma is separate)", () => {
    const c = on({ trauma: true });
    expect([c.A.trauma, c.B.trauma, c.C.trauma, c.E.trauma]).toEqual([true, false, true, true]);
  });
  it("SV-CTX-04: Chest trauma sets B trauma only", () => {
    const c = on({ chestTrauma: true });
    expect([c.A.trauma, c.B.trauma, c.C.trauma, c.E.trauma]).toEqual([false, true, false, false]);
  });
  it("SV-CTX-05: Spinal injury sets C spinalInjury and A trauma (D19, jaw thrust)", () => {
    const c = on({ spinalInjury: true });
    expect(c.C.spinalInjury).toBe(true);
    expect(c.A.trauma).toBe(true);
    expect(c.C.trauma).toBe(false);
    expect(c.E.trauma).toBe(false);
  });
  it("SV-CTX-06: Head injury sets C and D headInjury", () => {
    const c = on({ headInjury: true });
    expect([c.C.headInjury, c.D.headInjury]).toEqual([true, true]);
  });
  it("SV-CTX-07: Active bleeding sets C activeBleeding only", () => {
    const c = on({ activeBleeding: true });
    expect(c.C.activeBleeding).toBe(true);
    expect(c.C.trauma).toBe(false);
  });
  it("SV-CTX-08: Allergen trigger sets A, B and C allergenTrigger", () => {
    const c = on({ allergenTrigger: true });
    expect([c.A.allergenTrigger, c.B.allergenTrigger, c.C.allergenTrigger]).toEqual([
      true,
      true,
      true,
    ]);
  });
  it("SV-CTX-09: Pregnancy possible sets C pregnancyPossible, not D", () => {
    const c = on({ pregnancy: "possible" });
    expect(c.C.pregnancyPossible).toBe(true);
    expect(c.D.pregnancyPostpartum).toBe(false);
  });
  it("SV-CTX-10: Pregnancy confirmed sets C pregnancyPossible and D pregnancyPostpartum", () => {
    const c = on({ pregnancy: "confirmed", gestationWeeks: 24 });
    expect([c.C.pregnancyPossible, c.D.pregnancyPostpartum]).toEqual([true, true]);
  });
  it("SV-CTX-10: Postpartum sets C pregnancyPossible and D pregnancyPostpartum", () => {
    const c = on({ pregnancy: "postpartum" });
    expect([c.C.pregnancyPossible, c.D.pregnancyPostpartum]).toEqual([true, true]);
  });
  it("SV-CTX-09: no pregnancy sets neither", () => {
    const c = on({ pregnancy: "none" });
    expect([c.C.pregnancyPossible, c.D.pregnancyPostpartum]).toEqual([false, false]);
  });
  it("SV-CTX-11: Known asthma / COPD / suspected PE set the B toggles", () => {
    expect(on({ knownAsthma: true }).B.knownAsthma).toBe(true);
    expect(on({ copdRisk: true }).B.copdRisk).toBe(true);
    expect(on({ peSuspected: true }).B.peSuspected).toBe(true);
  });
  it("SV-CTX-12: opioids / alcohol-malnourished / fever+meningism set the D toggles", () => {
    expect(on({ opioidsSuspected: true }).D.opioidsSuspected).toBe(true);
    expect(on({ alcoholMalnourished: true }).D.alcoholMalnourished).toBe(true);
    expect(on({ feverMeningism: true }).D.feverMeningism).toBe(true);
  });
  it("SV-CTX-13: serotonergic / environmental set the E toggles", () => {
    expect(on({ serotonergicOrNeuroleptic: true }).E.serotonergicOrNeuroleptic).toBe(true);
    expect(on({ environmentalExposure: true }).E.exposureEnvironment).toBe(true);
  });
  it("SV-CTX-14: Febrile child sets C febrileChild only", () => {
    const c = on({ febrileChild: true });
    expect(c.C.febrileChild).toBe(true);
    expect(Object.values(c.A).some(Boolean)).toBe(false);
  });
  it("SV-CTX-21: BMI > 40, renal, LAST and gestation touch no legacy input", () => {
    const c = on({
      bmiOver40: true,
      renalDialysis: true,
      localAnaestheticToxicity: true,
      gestationWeeks: 30,
    });
    expect(c).toEqual(legacyContexts(v2()));
  });
});

describe("the one arrest state and step-local toggles", () => {
  it("SV-CTX-15: arrest feeds A/B noSignsOfLife and C/D/E noPulse", () => {
    const c = legacyContexts(v2({ inArrest: true }));
    expect([c.A.noSignsOfLife, c.B.noSignsOfLife]).toEqual([true, true]);
    expect([c.C.noPulse, c.D.noPulse, c.E.noPulse]).toEqual([true, true, true]);
  });
  it("SV-CTX-15: no arrest → all five false", () => {
    const c = legacyContexts(v2({ inArrest: false }));
    expect([c.A.noSignsOfLife, c.B.noSignsOfLife, c.C.noPulse, c.D.noPulse, c.E.noPulse]).toEqual([
      false,
      false,
      false,
      false,
      false,
    ]);
  });
  it("SV-CTX-16: gag → A only; low RR → D only; not re-covered → E only", () => {
    const c = legacyContexts(
      v2({ local: { ...EMPTY_LOCAL, gagPresent: true, lowRespRate: true, notRecovered: true } }),
    );
    expect([c.A.gagPresent, c.D.lowRespRate, c.E.notRecovered]).toEqual([true, true, true]);
  });
  it("SV-CTX-17: abcAbnormal feeds D only", () => {
    const c = legacyContexts(v2({ abcAbnormal: true }));
    expect(c.D.abcAbnormal).toBe(true);
    expect(legacyContexts(v2()).D.abcAbnormal).toBe(false);
  });
  it("SV-CTX-22: legacyStepContext returns the same object as legacyContexts[step]", () => {
    const i = v2({ flags: flags({ trauma: true, allergenTrigger: true }), inArrest: true });
    for (const s of ["A", "B", "C", "D", "E"] as const)
      expect(legacyStepContext(s, i)).toEqual(legacyContexts(i)[s]);
  });
});
