import { describe, expect, it } from "vitest";

import { computeArrestState } from "@/lib/resus/als/engine";
import { isPaediatric, tempBand } from "@/lib/resus/als/modifiers";
import { cause, ctxOf, min, sec, started, surveyAction } from "./fixtures";

/** ALS engine — special-circumstance modifiers (catalog §7, ALS-MOD-01..16, ALS-DRG-04/06). */

type Ctx = Parameters<typeof ctxOf>;
const mods = (
  over: Ctx[0] = {},
  flags: Ctx[1] = {},
  extra: Parameters<typeof computeArrestState>[0] = [],
) => computeArrestState([...started(), ...extra], sec(60), ctxOf(over, flags));
const ids = (s: ReturnType<typeof mods>) => s.modifiers.map((m) => m.id);

describe("temperature", () => {
  it("ALS-MOD-05: core < 30 °C and core 30–35 °C both carry the hypothermia rule", () => {
    expect(mods({ coreTempC: 28 }).modifiers[0]?.ruleIds).toContain("ALS-MOD-05");
    expect(mods({ coreTempC: 33 }).modifiers[0]?.ruleIds).toEqual(["ALS-MOD-04", "ALS-MOD-05"]);
    expect(ids(mods({ coreTempC: 37 }))).toEqual([]);
  });

  it("ALS-MOD-01: the < 30 °C modifier names withheld adrenaline and delayed shocks", () => {
    const m = mods({ coreTempC: 29.9 }).modifiers[0];
    expect(m?.id).toBe("hypothermia_below_30");
    expect(m?.ruleIds).toEqual(expect.arrayContaining(["ALS-MOD-01", "ALS-MOD-02", "ALS-MOD-03"]));
  });

  it("ALS-MOD-06: a peripheral < 32 °C gives only the measure-core modifier, no hypothermia rules", () => {
    const s = mods({ otherTempC: 29 });
    expect(ids(s)).toEqual(["temperature_not_core"]);
    expect(tempBand(ctxOf({ otherTempC: 29 }))).toBe("peripheral_low");
  });

  it("ALS-MOD-06: a core reading takes precedence over a peripheral one", () => {
    expect(tempBand(ctxOf({ coreTempC: 36, otherTempC: 29 }))).toBe("normal");
    expect(tempBand(ctxOf({ otherTempC: 32 }))).toBe("unknown");
  });
});

describe("context modifiers", () => {
  it("ALS-MOD-07: pregnancy confirmed > 20 weeks → uterine displacement, 4 Ps, hysterotomy — no minute target", () => {
    const m = mods({}, { pregnancy: "confirmed", gestationWeeks: 24 }).modifiers[0];
    expect(m?.id).toBe("pregnancy");
    expect(m?.label).toMatch(/left uterine displacement/);
    expect(m?.label).not.toMatch(/\d+\s*min/);
  });

  it("ALS-MOD-07: not active at ≤ 20 weeks, unknown weeks, or pregnancy only possible", () => {
    expect(ids(mods({}, { pregnancy: "confirmed", gestationWeeks: 20 }))).toEqual([]);
    expect(ids(mods({}, { pregnancy: "confirmed", gestationWeeks: null }))).toEqual([]);
    expect(ids(mods({}, { pregnancy: "possible", gestationWeeks: 30 }))).toEqual([]);
    expect(ids(mods({}, { pregnancy: "postpartum", gestationWeeks: 38 }))).toEqual(["pregnancy"]);
  });

  it("ALS-MOD-08: trauma → treat reversible causes first", () => {
    expect(mods({}, { trauma: true }).modifiers[0]?.ruleIds).toEqual(["ALS-MOD-08"]);
  });

  it("ALS-MOD-09: allergen trigger → standard ALS, IM prompt suppressed", () => {
    const m = mods({}, { allergenTrigger: true }).modifiers[0];
    expect(m?.ruleIds).toEqual(["ALS-MOD-09", "ALS-DRG-06"]);
    expect(m?.label).toMatch(/IM prompt suppressed/);
  });

  it('ALS-DRG-06: in arrest the anaphylaxis prompt reads "follow ALS — adrenaline 1 mg IV" with an early bolus', () => {
    const p = mods({}, { allergenTrigger: true }).prompts.find((x) => x.ruleId === "ALS-DRG-06");
    expect(p?.text).toMatch(/follow ALS — adrenaline 1 mg IV/);
    expect(p?.text).toMatch(/crystalloid/);
    expect(p?.text).not.toMatch(/IM|500/);
  });

  it("ALS-DRG-06 / ALS-MOD-10: with LAST the anaphylaxis bar follows ALS at ≤ 1 µg/kg, never 1 mg", () => {
    const s = mods({}, { allergenTrigger: true, localAnaestheticToxicity: true });
    const p = s.prompts.find((x) => x.ruleId === "ALS-DRG-06");
    const m = s.modifiers.find((x) => x.id === "anaphylaxis");
    for (const text of [p?.text, m?.label]) {
      expect(text).toMatch(/follow ALS/);
      expect(text).toMatch(/≤ 1 µg\/kg/);
      expect(text).not.toMatch(/1 mg/);
    }
  });

  it("ALS-DRG-06 / ALS-MOD-01: below 30 °C core the anaphylaxis bar says adrenaline is withheld", () => {
    const s = mods({ coreTempC: 28 }, { allergenTrigger: true });
    const p = s.prompts.find((x) => x.ruleId === "ALS-DRG-06");
    const m = s.modifiers.find((x) => x.id === "anaphylaxis");
    for (const text of [p?.text, m?.label]) {
      expect(text).toMatch(/adrenaline withheld while core < 30 °C/);
      expect(text).not.toMatch(/1 mg/);
    }
  });

  it("ALS-DRG-06: a child's anaphylaxis prompt carries no adult dose", () => {
    const s = mods({ ageYears: 7 }, { allergenTrigger: true });
    expect(s.prompts.find((x) => x.ruleId === "ALS-DRG-06")?.text).not.toMatch(/\d/);
  });

  it("ALS-MOD-10: LAST → the modifier names ≤ 1 µg/kg and prolonged resuscitation", () => {
    const m = mods({}, { localAnaestheticToxicity: true }).modifiers[0];
    expect(m?.label).toMatch(/≤ 1 µg\/kg/);
    expect(m?.label).toMatch(/> 1 h/);
  });

  it("ALS-MOD-11: the C-step thrombolysis recorded performed adds the 60–90 min modifier", () => {
    const s = mods({}, {}, [surveyAction(sec(30), "C", "c_thrombolysis")]);
    expect(s.modifiers.find((m) => m.id === "pe_lysis")?.ruleIds).toEqual([
      "ALS-MOD-11",
      "ALS-DRG-04",
    ]);
  });

  it("ALS-DRG-04: the thrombolysis prompt shows the advisory clock and no thrombolytic dose", () => {
    const events = [
      ...started(),
      surveyAction(min(2), "C", "c_thrombolysis", "indicated"),
      surveyAction(min(5), "C", "c_thrombolysis"),
    ];
    const p = computeArrestState(events, min(17), ctxOf()).prompts.find(
      (x) => x.ruleId === "ALS-DRG-04",
    );
    expect(p?.text).toMatch(/12 min ago/);
    expect(p?.text).toMatch(/60–90 min/);
    expect(p?.text).not.toMatch(/mg|units/i);
  });

  it("ALS-MOD-11: thrombolysis only indicated, or later marked not performed, starts no clock", () => {
    expect(ids(mods({}, {}, [surveyAction(sec(30), "C", "c_thrombolysis", "indicated")]))).toEqual(
      [],
    );
    const undone = [
      surveyAction(sec(30), "C", "c_thrombolysis"),
      surveyAction(sec(40), "C", "c_thrombolysis", "not_indicated"),
    ];
    expect(ids(mods({}, {}, undone))).toEqual([]);
  });

  it("ALS-MOD-12: a suspected toxins tile flags prolonged resuscitation", () => {
    expect(ids(mods({}, { opioidsSuspected: true }))).toContain("prolonged");
  });

  it("ALS-MOD-12: a toxins tile recorded as excluded does not flag it", () => {
    const s = mods({}, { opioidsSuspected: true }, [cause(sec(30), "toxins", "excluded")]);
    expect(ids(s)).not.toContain("prolonged");
  });

  it("ALS-MOD-13: known asthma → 100 % O₂, exclude tension and anaphylaxis", () => {
    expect(mods({}, { knownAsthma: true }).modifiers[0]?.label).toMatch(
      /exclude tension pneumothorax/,
    );
  });

  it("ALS-MOD-14: haemodialysis → stop dialysis, return blood volume", () => {
    expect(
      mods({}, { renalDialysis: true }).modifiers.find((m) => m.id === "dialysis")?.ruleIds,
    ).toEqual(["ALS-MOD-14"]);
  });

  it("ALS-MOD-15: BMI > 40 → standard ALS, standard energy", () => {
    expect(mods({}, { bmiOver40: true }).modifiers[0]?.label).toMatch(/standard energy/);
  });

  it("ALS-MOD-16: age < 16 → paediatric, with the clocks-only modifier and prompt", () => {
    const s = mods({ ageYears: 15 });
    expect(s.paediatric).toBe(true);
    expect(ids(s)).toContain("paediatric");
    expect(s.prompts.some((p) => p.ruleId === "ALS-MOD-16")).toBe(true);
  });

  it("ALS-MOD-16: unknown age uses adult rules; 16 is an adult", () => {
    expect(isPaediatric(ctxOf({ ageYears: null }))).toBe(false);
    expect(isPaediatric(ctxOf({ ageYears: 16 }))).toBe(false);
  });

  it("ALS-MOD-16: modifiers come in catalog order", () => {
    const s = mods({ coreTempC: 33 }, { trauma: true, knownAsthma: true, bmiOver40: true });
    expect(ids(s)).toEqual(["hypothermia_30_to_35", "trauma", "asthma", "obesity"]);
  });
});
