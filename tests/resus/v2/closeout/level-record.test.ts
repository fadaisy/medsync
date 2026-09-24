import type { LevelExtras } from "@/lib/resus/closeout/level-of-care";
import type { TimelineEvent } from "@/lib/resus/types";
import { describe, expect, it } from "vitest";

import { levelInputFromRecord, suggestLevel } from "@/lib/resus/closeout/level-of-care";
import {
  action,
  arrest,
  context,
  decision,
  drug,
  ev,
  NORMAL_VITALS,
  rosc,
  vitals,
} from "./fixtures";

const ADULT: LevelExtras = { ageYears: 50 };
const input = (tl: TimelineEvent[], extras: LevelExtras = ADULT) =>
  levelInputFromRecord(tl, extras);
const imDose = (minsAgo: number) =>
  drug(minsAgo, { drugId: "adrenaline_anaphylaxis_im", drugKey: "adrenaline", route: "im" });
const dAssess = (disability: Record<string, unknown>) =>
  ev("assessment", "D", 3, { disability: { present: [], context: {}, ...disability }, label: "D" });
const cause = (cause: string, state: string) =>
  decision(4, { decision: "reversible_cause", arrestSeq: 1, cause, state });

describe("CO-R — the recommender input from the record", () => {
  it("CO-R12: no arrest recorded → stabilised, not post-ROSC", () => {
    expect(input([])).toMatchObject({ stabilised: true, postRosc: false });
  });

  it("CO-R1: arrest then ROSC → post-ROSC", () => {
    expect(input([arrest(20), rosc(10)])).toMatchObject({ stabilised: false, postRosc: true });
  });

  it("CO-R1: re-arrest after ROSC → no longer post-ROSC", () => {
    expect(input([arrest(30), rosc(20), arrest(5, 2)]).postRosc).toBe(false);
  });

  it("CO-R1: obeys commands comes from the latest decision", () => {
    const tl = [arrest(20), rosc(10), decision(5, { decision: "obeys_commands", value: false })];
    expect(input(tl).obeysCommands).toBe(false);
    expect(suggestLevel(input(tl), []).level).toBe("l3");
  });

  it("CO-R3: an arrest ETT procedure → ETT in situ", () => {
    const ett = ev("procedure", "arrest", 12, {
      arrestSeq: 1,
      arrestProcedure: "airway_ett",
      label: "ETT",
    });
    expect(input([arrest(20), ett]).ettInSitu).toBe(true);
  });

  it("CO-R3: Plan A intubation performed → ETT in situ", () => {
    expect(input([action("A", "a_plan_a_intubation", "performed")]).ettInSitu).toBe(true);
  });

  it("CO-R3: intubation only indicated is not an ETT in situ", () => {
    expect(input([action("A", "a_plan_a_intubation", "indicated")]).ettInSitu).toBe(false);
  });

  it("CO-R3: B RSI and D definitive airway performed count", () => {
    expect(input([action("B", "b_rsi_intubation", "performed")]).ettInSitu).toBe(true);
    expect(input([action("D", "d_definitive_airway", "performed")]).ettInSitu).toBe(true);
  });

  it("CO-R7: NIV in progress → NIV/CPAP", () => {
    expect(input([action("B", "b_niv", "in_progress")]).niv).toBe(true);
  });

  it("CO-R7: NIV not indicated → no NIV", () => {
    expect(input([action("B", "b_niv", "not_indicated")]).niv).toBe(false);
  });

  it("CO-R8: noradrenaline action performed → vasopressor", () => {
    expect(input([action("C", "c_noradrenaline", "performed")]).vasopressor).toBe(true);
  });

  it("CO-R8: a vasopressor-infusion drug event → vasopressor", () => {
    expect(
      input([drug(5, { drugId: "vasopressor_infusion", drugKey: "vasopressor" })]).vasopressor,
    ).toBe(true);
    expect(
      input([drug(5, { drugId: "vasopressin_refractory", drugKey: "vasopressin" })]).vasopressor,
    ).toBe(true);
  });

  it("CO-R8: dobutamine (inotrope) and arrest adrenaline are not vasopressors here", () => {
    const tl = [
      drug(5, { drugId: "dobutamine_inotrope", drugKey: "dobutamine" }),
      drug(4, { drugId: "adrenaline_arrest_iv", drugKey: "adrenaline", route: "iv" }),
    ];
    expect(input(tl).vasopressor).toBe(false);
  });

  it("CO-R9: 2 IM doses + the clinician's infusion flag → refractory anaphylaxis", () => {
    expect(
      input([imDose(20), imDose(14)], { ...ADULT, adrenalineInfusion: true }).refractoryAnaphylaxis,
    ).toBe(true);
  });

  it("CO-R9: 2 IM doses + a recorded adrenaline infusion → refractory", () => {
    const inf = drug(5, {
      drugId: "adrenaline_anaphylaxis_im",
      drugKey: "adrenaline",
      route: "infusion",
    });
    expect(input([imDose(20), imDose(14), inf]).refractoryAnaphylaxis).toBe(true);
  });

  it("CO-R9: 1 IM dose + infusion flag is not refractory", () => {
    expect(input([imDose(20)], { ...ADULT, adrenalineInfusion: true }).refractoryAnaphylaxis).toBe(
      false,
    );
  });

  it("CO-R9: 2 IM doses without an infusion are not refractory", () => {
    expect(input([imDose(20), imDose(14)]).refractoryAnaphylaxis).toBe(false);
  });

  it("CO-R10: GCS total from the latest D assessment", () => {
    const r = input([dAssess({ gcs: { eye: 1, verbal: 2, motor: 4 } })]);
    expect(r.gcsTotal).toBe(7);
    expect(suggestLevel(r, []).reasons.map((x) => x.ruleId)).toContain("CO-R10");
  });

  it("CO-R10: an active seizure alone is not status needing anaesthesia", () => {
    const r = input([dAssess({ present: ["active_seizure"] })]);
    expect(r.statusEpilepticus).toBe(false);
    expect(suggestLevel(r, []).reasons.map((x) => x.ruleId)).not.toContain("CO-R10");
  });

  it("CO-R10: refractory status → anaesthetic infusion on → L3", () => {
    for (const state of ["performed", "in_progress"]) {
      const r = input([action("D", "d_anaesthesia_eeg", state)]);
      expect(r.statusEpilepticus).toBe(true);
      expect(suggestLevel(r, []).level).toBe("l3");
    }
    expect(input([action("D", "d_anaesthesia_eeg", "indicated")]).statusEpilepticus).toBe(false);
  });

  it("CO-R12: a complete adult vital set → NEWS2 0 → Ward, no transfer", () => {
    const r = input([vitals(5, NORMAL_VITALS)]);
    expect(r.news2).toEqual({ total: 0, hasSingleParameterThree: false });
    expect(suggestLevel(r, [])).toMatchObject({ level: "ward", transferSuggested: false });
  });

  it("CO-R12: a missing parameter → NEWS2 null (never guessed)", () => {
    const { temperature: _t, ...partial } = NORMAL_VITALS;
    expect(input([vitals(5, partial)]).news2).toBeNull();
  });

  it("CO-R11: a child gets no NEWS2 (adult score)", () => {
    expect(input([vitals(5, NORMAL_VITALS)], { ageYears: 10 }).news2).toBeNull();
  });

  it("CO-R11: high-scoring vitals → NEWS2 ≥ 7 → L2", () => {
    const r = input([vitals(5, { ...NORMAL_VITALS, rr: 26, spo2: 90, hr: 135 })]);
    expect(r.news2!.total).toBeGreaterThanOrEqual(7);
    expect(suggestLevel(r, []).reasons.map((x) => x.ruleId)).toContain("CO-R11");
  });

  it("CO-R15: BMI > 40 and pregnancy come from the latest context flags", () => {
    const tl = [
      context(30, { bmiOver40: false, pregnancy: "none" }),
      context(5, { bmiOver40: true, pregnancy: "postpartum", headInjury: true }),
    ];
    expect(input(tl)).toMatchObject({ bmiOver40: true, pregnancyRelated: true, headInjury: true });
  });

  it("CO-DST-03: possible pregnancy is not pregnancy-related", () => {
    expect(input([context(5, { pregnancy: "possible" })]).pregnancyRelated).toBe(false);
  });

  it("CO-DST-01: ECG ischaemia in the latest C assessment → STEMI", () => {
    const c = ev("assessment", "C", 5, {
      circulation: { state: null, present: ["ecg_ischaemia"], context: {} },
    });
    expect(input([c]).stemi).toBe(true);
  });

  it("CO-DST-01: PR-C-05 done → STEMI", () => {
    const d = decision(5, { decision: "post_rosc_item", itemId: "PR-C-05", state: "done" });
    expect(input([d]).stemi).toBe(true);
  });

  it("CO-DST-02: E occult haemorrhage → haemorrhage", () => {
    const e = ev("assessment", "E", 5, {
      exposure: { state: null, present: ["external_haemorrhage"], context: {} },
    });
    expect(input([e]).haemorrhage).toBe(true);
  });

  it("CO-DST-02: C haemorrhagic shock type → haemorrhage", () => {
    const c = ev("assessment", "C", 5, {
      circulation: { state: "decompensated_shock", present: ["external_haemorrhage"], context: {} },
    });
    expect(input([c]).haemorrhage).toBe(true);
  });

  it("CO-DST-04: a suspected non-coronary cause tile → CT first", () => {
    expect(input([arrest(20), cause("hypoxia", "suspected")]).nonCoronaryCause).toBe(true);
  });

  it("CO-DST-04: thrombosis (may be coronary) or an excluded cause does not count", () => {
    expect(input([arrest(20), cause("thrombosis", "suspected")]).nonCoronaryCause).toBe(false);
    expect(input([arrest(20), cause("tension", "excluded")]).nonCoronaryCause).toBe(false);
  });

  it("CO-R4: clinician extras pass through", () => {
    const r = input([], {
      ageYears: 60,
      agitationDelirium: true,
      riskOfEscalation: true,
      rrtNeeded: true,
      renalSetting: true,
      nonCoronaryCauseSuspected: true,
    });
    expect(r).toMatchObject({
      agitationDelirium: true,
      riskOfEscalation: true,
      rrtNeeded: true,
      renalSetting: true,
      nonCoronaryCause: true,
    });
  });
});
