import type { LevelInput } from "@/lib/resus/closeout/level-of-care";
import { describe, expect, it } from "vitest";

import { suggestLevel } from "@/lib/resus/closeout/level-of-care";
import { BASE } from "./fixtures";

const s = (p: Partial<LevelInput>) => suggestLevel({ ...BASE, ...p }, []);
const rules = (p: Partial<LevelInput>) => s(p).reasons.map((r) => r.ruleId);
const postRosc = { stabilised: false, postRosc: true };

describe("CO-R — recommender rules (catalog §4)", () => {
  it("CO-R1: post-ROSC and not obeying commands suggests L3", () => {
    const r = s({ ...postRosc, obeysCommands: false });
    expect(r.level).toBe("l3");
    expect(r.reasons.map((x) => x.ruleId)).toEqual(["CO-R1"]);
  });

  it("CO-R1: intubated after arrest suggests L3 (with CO-R3)", () => {
    const r = s({ ...postRosc, ettInSitu: true });
    expect(r.level).toBe("l3");
    expect(r.reasons.map((x) => x.ruleId)).toEqual(["CO-R1", "CO-R3"]);
  });

  it("CO-R1: obeys-commands unknown is not guessed — no R1, no R2", () => {
    expect(rules({ ...postRosc, obeysCommands: null })).toEqual([]);
  });

  it("CO-R2: post-ROSC and awake suggests L2", () => {
    const r = s({ ...postRosc, obeysCommands: true });
    expect(r.level).toBe("l2");
    expect(rules({ ...postRosc, obeysCommands: true })).toEqual(["CO-R2"]);
  });

  it("CO-R2: obeying commands without an arrest does not fire", () => {
    expect(rules({ obeysCommands: true })).not.toContain("CO-R2");
  });

  it("CO-R3: an ETT in situ suggests L3", () => {
    expect(s({ ettInSitu: true }).level).toBe("l3");
  });

  it("CO-R4: NIV/CPAP + vasopressor + agitation suggests L3", () => {
    const r = s({ niv: true, vasopressor: true, agitationDelirium: true });
    expect(r.level).toBe("l3");
    expect(r.reasons.map((x) => x.ruleId)).toContain("CO-R4");
  });

  it("CO-R4: NIV/CPAP + vasopressor at risk of escalation suggests L3", () => {
    expect(s({ niv: true, vasopressor: true, riskOfEscalation: true }).level).toBe("l3");
  });

  it("CO-R4: risk of escalation on one support alone does not fire", () => {
    expect(rules({ niv: true, riskOfEscalation: true })).not.toContain("CO-R4");
  });

  it("CO-R5: NIV/CPAP + vasopressor suggests L2", () => {
    const r = s({ niv: true, vasopressor: true });
    expect(r.level).toBe("l2");
    expect(r.reasons.map((x) => x.ruleId)).toEqual(["CO-R5"]);
  });

  it("CO-R6: vasopressor + hyperactive delirium suggests L2", () => {
    expect(s({ vasopressor: true, agitationDelirium: true }).level).toBe("l2");
    expect(rules({ vasopressor: true, agitationDelirium: true })).toEqual(["CO-R6", "CO-R8"]);
  });

  it("CO-R6: NIV/CPAP + hyperactive delirium suggests L2", () => {
    expect(s({ niv: true, agitationDelirium: true }).level).toBe("l2");
  });

  it("CO-R6: delirium with no L1-type need does not fire", () => {
    expect(rules({ agitationDelirium: true })).toEqual([]);
  });

  it("CO-R7: NIV/CPAP alone suggests L1", () => {
    const r = s({ niv: true });
    expect(r.level).toBe("l1");
    expect(r.reasons.map((x) => x.ruleId)).toEqual(["CO-R7"]);
  });

  it("CO-R7: NIV/CPAP with a vasopressor is not 'alone'", () => {
    expect(rules({ niv: true, vasopressor: true })).not.toContain("CO-R7");
  });

  it("CO-R8: vasopressor alone suggests L1", () => {
    const r = s({ vasopressor: true });
    expect(r.level).toBe("l1");
    expect(r.reasons.map((x) => x.ruleId)).toEqual(["CO-R8"]);
  });

  it("CO-R9: refractory anaphylaxis suggests L2", () => {
    expect(s({ refractoryAnaphylaxis: true }).level).toBe("l2");
  });

  it("CO-R10: GCS 8 suggests L3", () => {
    expect(s({ gcsTotal: 8 }).level).toBe("l3");
  });

  it("CO-R10: GCS 9 does not fire", () => {
    expect(rules({ gcsTotal: 9 })).not.toContain("CO-R10");
  });

  it("CO-R10: status epilepticus suggests L3", () => {
    expect(rules({ statusEpilepticus: true })).toEqual(["CO-R10"]);
  });

  it("CO-R11: NEWS2 7 persisting suggests L2", () => {
    const r = s({ news2: { total: 7, hasSingleParameterThree: false } });
    expect(r.level).toBe("l2");
    expect(r.reasons.map((x) => x.ruleId)).toEqual(["CO-R11"]);
  });

  it("CO-R11: NEWS2 6 does not fire (and is not low enough for Ward)", () => {
    expect(s({ news2: { total: 6, hasSingleParameterThree: false } }).level).toBeNull();
  });

  it("CO-R12: stabilised, no support, NEWS2 4, no single 3 → Ward", () => {
    const r = s({ news2: { total: 4, hasSingleParameterThree: false } });
    expect(r.level).toBe("ward");
    expect(r.reasons.map((x) => x.ruleId)).toEqual(["CO-R12"]);
  });

  it("CO-R12: NEWS2 5 → no suggestion, never a silent Ward", () => {
    expect(s({ news2: { total: 5, hasSingleParameterThree: false } }).level).toBeNull();
  });

  it("CO-R12: a single parameter scoring 3 blocks Ward", () => {
    expect(s({ news2: { total: 3, hasSingleParameterThree: true } }).level).toBeNull();
  });

  it("CO-R12: NEWS2 unknown blocks Ward", () => {
    expect(s({ news2: null }).level).toBeNull();
  });

  it("CO-R12: not stabilised (an arrest occurred) blocks Ward", () => {
    expect(
      s({ stabilised: false, news2: { total: 0, hasSingleParameterThree: false } }).level,
    ).toBeNull();
  });

  it("CO-R12: organ support blocks Ward (vasopressor → L1 instead)", () => {
    const r = s({ vasopressor: true, news2: { total: 0, hasSingleParameterThree: false } });
    expect(r.level).toBe("l1");
    expect(r.reasons.map((x) => x.ruleId)).not.toContain("CO-R12");
  });

  it("CO-R13: RRT + vasopressor suggests L3", () => {
    expect(s({ rrtNeeded: true, vasopressor: true }).level).toBe("l3");
  });

  it("CO-R13: RRT + respiratory support (ETT) fires", () => {
    expect(rules({ rrtNeeded: true, ettInSitu: true })).toContain("CO-R13");
  });

  it("CO-R14: RRT alone outside a renal setting suggests L2", () => {
    expect(rules({ rrtNeeded: true })).toEqual(["CO-R14"]);
    expect(s({ rrtNeeded: true }).level).toBe("l2");
  });

  it("CO-R14: RRT alone in a renal setting → no suggestion", () => {
    expect(s({ rrtNeeded: true, renalSetting: true }).level).toBeNull();
  });

  it("CO-R15: BMI > 40 on NIV/CPAP suggests L2", () => {
    expect(s({ bmiOver40: true, niv: true }).level).toBe("l2");
  });

  it("CO-R15: BMI > 40 on a vasopressor suggests L2", () => {
    expect(rules({ bmiOver40: true, vasopressor: true })).toEqual(["CO-R8", "CO-R15"]);
  });

  it("CO-R16: BMI > 40 on NIV/CPAP and a vasopressor suggests L3 (not R15)", () => {
    const r = s({ bmiOver40: true, niv: true, vasopressor: true });
    expect(r.level).toBe("l3");
    expect(r.reasons.map((x) => x.ruleId)).toEqual(["CO-R5", "CO-R16"]);
  });

  it("CO-R8: the highest matching level wins (R8 L1 + R10 L3 → L3)", () => {
    const r = s({ vasopressor: true, gcsTotal: 6 });
    expect(r.level).toBe("l3");
    expect(r.reasons.map((x) => [x.ruleId, x.level])).toEqual([
      ["CO-R8", "l1"],
      ["CO-R10", "l3"],
    ]);
  });

  it("CO-R5: each reason carries the catalog text and source", () => {
    const [r] = s({ niv: true, vasopressor: true }).reasons;
    expect(r).toEqual({
      ruleId: "CO-R5",
      text: "NIV/CPAP + vasopressor → L2",
      level: "l2",
      source: "ICS-LOC21",
    });
  });

  it("CO-R12: no rule matched → level null, nothing required, no transfer", () => {
    expect(s({})).toEqual({
      level: null,
      reasons: [],
      extraDestinations: [],
      requiredCapabilities: [],
      qualifyingUnits: [],
      transferSuggested: false,
    });
  });
});
