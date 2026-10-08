/**
 * The clerking record → the diabetes pack's input (ADR 0216, lib/ncd/pack/from-clerking.ts).
 * Small examination contexts, one feature family at a time, then the pack run end to end.
 * Synthetic data only.
 */
import type { Scenario } from "../clerking/exam-fixtures";
import type { ClerkingPackSources } from "@/lib/ncd/pack/from-clerking";
import { describe, expect, it } from "vitest";

import { classifyAll } from "@/lib/clerking/exam/classifiers";
import { mergeVitals, parseVitalsDraft } from "@/lib/clerking/exam/vitals";
import { diabetesPack } from "@/lib/ncd/pack";
import { runProtocol } from "@/lib/ncd/pack/engine";
import {
  PACK_FEATURE_HOME,
  packInputFromClerking,
  RESTRICTED_FEATURES,
} from "@/lib/ncd/pack/from-clerking";
import { egfr } from "@/lib/ncdreg/standard/calculations";
import {
  ALL_SIGNED,
  complain,
  ecat,
  ketones,
  negative,
  NOW,
  positive,
  scenario,
  toCtx,
} from "../clerking/exam-fixtures";

const pack = diabetesPack();
const HOUR = 3_600_000;
const ago = (hours: number) => new Date(Date.parse(NOW) - hours * HOUR).toISOString();

/** Translate a scenario the way the desk does (classifiers run, vitals merged with the draft). */
function run(s: Scenario, more: Partial<Omit<ClerkingPackSources, "x">> = {}) {
  const x0 = toCtx({ ...s, facts: s.facts ?? [], now: s.now ?? NOW });
  const x = { ...x0, results: classifyAll(x0, { ...ALL_SIGNED, withheld: [] }) };
  return packInputFromClerking({ x, problems: [], diagnoses: [], ...more });
}
const values = (s: Scenario, more?: Partial<Omit<ClerkingPackSources, "x">>) =>
  run(s, more).input.values;

/** Type a glucose in the "Now" column (the context is the meter's). */
function meter(
  s: Scenario,
  glucose: string,
  glucoseContext?: "random" | "fasting" | "two_hours_after_food",
) {
  s.exam = { ...s.exam, vitalsDraft: { glucose, ...(glucoseContext ? { glucoseContext } : {}) } };
  s.vitals = mergeVitals(s.vitals, parseVitalsDraft(ecat, s.exam.vitalsDraft).values);
}
const fact = (concept: string, value: number, more: Record<string, unknown> = {}) => ({
  concept,
  value,
  at: ago(2),
  trust: 4 as const,
  ...more,
});

describe("known diabetes", () => {
  it("from the past history: yes is known (established), no is not known", () => {
    const s = scenario();
    s.history.past.conditions.diabetes = {
      answer: "yes",
      details: { type: "type_2", year_diagnosed: 2016 },
    };
    const r = run(s);
    expect(r.input.values).toMatchObject({
      dm_status: "known",
      dm_type_recorded: "type_2",
      years_since_diagnosis: 10,
      age_at_diagnosis: 30,
    });
    expect(r.input.established).toBe(true);
    expect(r.from.dm_status).toMatch(/^Past history/);
    const n = scenario();
    n.history.past.conditions.diabetes = { answer: "no" };
    expect(values(n).dm_status).toBe("not_known");
  });

  it("from the problem list: known, typed and established; a problem wins over a 'no'", () => {
    const s = scenario();
    s.history.past.conditions.diabetes = { answer: "no" };
    const r = run(s, { problems: [{ display: "Type 2 diabetes", conceptId: "cond.dm_type2" }] });
    expect(r.input.values).toMatchObject({ dm_status: "known", dm_type_recorded: "type_2" });
    expect(r.input.established).toBe(true);
  });

  it("from a glucose-lowering medicine: known, with the pack's classes", () => {
    const s = scenario({
      medicines: [{ name: "Metformin 500 mg" }, { name: "Gliclazide" }, { name: "Sitagliptin" }],
    });
    const v = values(s);
    expect(v.dm_status).toBe("known");
    expect(v.glucose_lowering_therapy).toEqual(["metformin", "gliclazide", "dpp4_inhibitor"]);
  });

  it("from this visit's diagnosis: a recorded type, not an established diagnosis", () => {
    const r = run(scenario(), {
      diagnoses: [{ display: "Type 1 diabetes", code: "5A10", termId: "dx.dm_type1" }],
    });
    expect(r.input.values.dm_type_recorded).toBe("type_1");
    expect(r.input.values.dm_status).toBeUndefined();
    expect(r.input.established).toBe(false);
    const crisis = run(scenario(), {
      diagnoses: [{ display: "DKA", code: "5A22.0", termId: "dx.dka" }],
    });
    expect(crisis.input.values.hyperglycaemic_crisis_now).toBe(true);
  });
});

describe("blank is never negative", () => {
  it("an empty record gives only age, sex and what they compute", () => {
    expect(Object.keys(values(scenario())).sort()).toEqual(["age_years", "could_conceive", "sex"]);
  });

  it("no medicines listed is not 'not on' anything; 'takes none' is", () => {
    const blank = values(scenario());
    for (const f of [
      "on_statin",
      "on_antiplatelet",
      "glucose_lowering_therapy",
      "ras_blocker",
      "bp_medicines_count",
    ])
      expect(blank[f], f).toBeUndefined();
    const s = scenario();
    s.history.past.medicinesNone = true;
    expect(values(s)).toMatchObject({
      on_statin: false,
      on_antiplatelet: false,
      glucose_lowering_therapy: ["none"],
      ras_blocker: "none",
      bp_medicines_count: 0,
    });
    // A list without a statin is still not "not on a statin".
    expect(values(scenario({ medicines: [{ name: "Amlodipine" }] })).on_statin).toBeUndefined();
  });

  it("unanswered symptoms stay absent; a review 'no' is false", () => {
    const s = scenario();
    s.history.ros["sym.polyuria"] = "no";
    const v = values(s);
    expect(v.polyuria).toBe(false);
    expect(v.polydipsia).toBeUndefined();
    expect(v.unexplained_weight_loss).toBeUndefined();
  });
});

describe("Uganda 2026 inputs", () => {
  it("a classic symptom and a random meter glucose", () => {
    const s = scenario();
    complain(s, "sym.polyuria");
    s.history.ros["sym.weight_loss"] = "yes";
    meter(s, "14.2", "random");
    const r = run(s);
    expect(r.input.values).toMatchObject({
      polyuria: true,
      unexplained_weight_loss: true,
      capillary_glucose: 14.2,
      capillary_glucose_context: "random",
    });
    expect(r.from.capillary_glucose).toBe("Vital signs · glucose");
  });

  it("HI and LO are meter readings, never numbers", () => {
    const s = scenario();
    meter(s, "HI");
    const v = values(s);
    expect(v.glucose_meter_extreme).toBe("hi");
    expect(v.capillary_glucose).toBeUndefined();
    const lo = scenario();
    meter(lo, "lo");
    expect(values(lo).glucose_meter_extreme).toBe("lo");
  });

  it("laboratory glucose is split by its qualifiers and never read as a meter", () => {
    const s = scenario({
      // The newest chart glucose with no set context: maybe a lab value, so not capillary.
      vitals: { ...scenario().vitals, glucose: 9.1, glucoseContext: null },
      facts: [
        fact("obs.glucose", 6.0, { pointOfCare: true, specimen: "capillary_whole_blood" }),
        fact("obs.glucose", 7.4, { fastingState: "fasting", specimen: "venous_plasma" }),
        fact("obs.glucose", 12.5, { fastingState: "non_fasting", specimen: "venous_plasma" }),
        fact("obs.glucose", 11.6, {
          specimen: "venous_plasma",
          challenge: { type: "ogtt_75g", minutes: 120 },
        }),
        fact("obs.glucose", 20, { fastingState: "non_fasting", at: ago(24 * 30) }), // too old for this episode
      ],
    });
    const r = run(s);
    expect(r.input.values).toMatchObject({ fasting_pg: 7.4, random_pg: 12.5, ogtt_2h_pg: 11.6 });
    expect(r.input.values.capillary_glucose).toBeUndefined();
    expect(r.from.random_pg).toMatch(/^Results · glucose \d{4}-\d{2}-\d{2}$/);
  });

  it("a saved set's glucose is capillary (its context marks it)", () => {
    const s = scenario({
      vitals: { ...scenario().vitals, glucose: 8.2, glucoseContext: "fasting" },
    });
    expect(values(s)).toMatchObject({
      capillary_glucose: 8.2,
      capillary_glucose_context: "fasting",
    });
  });

  it("HbA1c and its point-of-care flag", () => {
    const lab = scenario({
      facts: [fact("obs.hba1c", 8.1, { specimen: "venous_whole_blood", at: ago(24 * 40) })],
    });
    expect(values(lab)).toMatchObject({
      hba1c: 8.1,
      hba1c_point_of_care: false,
      months_since_hba1c: 1,
    });
    const poc = scenario({ facts: [fact("obs.hba1c", 7.2, { pointOfCare: true })] });
    expect(values(poc).hba1c_point_of_care).toBe(true);
  });
});

describe("examination", () => {
  it("the ketone panel, Kussmaul breathing and acetone", () => {
    const s = scenario();
    ketones(s, { blood: 3.4, urine: "2plus" });
    positive(s, "ex.respiratory.breathing_pattern", { pattern: "kussmaul_deep_sighing" });
    negative(s, "ex.general.odour");
    expect(values(s)).toMatchObject({
      bohb: 3.4,
      urine_ketones: "2plus",
      deep_rapid_breathing: true,
      acetone_breath: false,
    });
  });

  it("the feet: ulcer, monofilament, fork, pulses, reflexes", () => {
    const s = scenario();
    positive(s, "ex.feet.ulcer", { infection_signs: ["swelling_or_induration", "local_warmth"] });
    positive(s, "ex.feet.monofilament", { sites_not_felt_left: 2, sites_not_felt_right: 0 });
    negative(s, "ex.feet.vibration_128");
    negative(s, "ex.feet.gangrene");
    s.exam = {
      ...s.exam,
      blocks: {
        ...s.exam.blocks,
        pulses: {
          "Dorsalis pedis": { R: "present", L: "reduced" },
          "Posterior tibial": { R: "present", L: "present" },
        },
        reflexes: { Ankle: { R: 2, L: 0 } },
      },
    };
    const r = run(s);
    expect(r.input.values).toMatchObject({
      active_foot_ulcer: true,
      foot_infection_grade: "mild",
      monofilament_10g: "one_foot",
      vibration_128hz: "present",
      foot_gangrene: false,
      pedal_pulses: "reduced",
      ankle_reflexes: "reduced_or_absent",
      months_since_foot_risk_assessment: 0,
    });
    expect(r.from.active_foot_ulcer).toBe("Examination · feet");
  });

  it("fundoscopy: grade, macula, view and method", () => {
    const s = scenario();
    positive(s, "ex.eyes_ent_neck.fundoscopy", {
      dr_grade: "moderate_npdr",
      macula: "cannot_assess",
      view: "adequate",
      method: "dilated",
    });
    const v = values(s);
    expect(v).toMatchObject({
      retinopathy_stage: "moderate_npdr",
      retina_view: "adequate",
      fundus_method: "dilated_ophthalmoscopy",
      months_since_eye_screen: 0,
    });
    expect(v.macular_oedema).toBeUndefined();
  });

  it("mental status from ACVPU or GCS", () => {
    const s = scenario();
    s.exam = { ...s.exam, blocks: { consciousness: { method: "acvpu", acvpu: "V" } } };
    expect(values(s).mental_status).toBe("drowsy");
    const g = scenario();
    g.exam = { ...g.exam, blocks: { consciousness: { method: "gcs", E: 2, V: 2, M: 4 } } };
    expect(values(g).mental_status).toBe("coma");
  });
});

describe("results the desk now loads", () => {
  it("eGFR from creatinine with CKD-EPI 2021, only with age and sex", () => {
    const f = [fact("obs.creatinine", 120, { at: ago(24 * 100) })];
    const s = scenario({ patient: { ageYears: 60, sex: "female", pregnant: null }, facts: f });
    const r = run(s);
    expect(r.input.values.egfr).toBe(egfr(120, 60, "female"));
    expect(r.from.egfr).toMatch(/CKD-EPI 2021/);
    expect(
      values(scenario({ patient: { ageYears: 60, sex: null, pregnant: null }, facts: f })).egfr,
    ).toBeUndefined();
  });

  it("potassium this episode only; strips by their code", () => {
    const s = scenario({
      facts: [
        fact("obs.potassium", 6.7),
        fact("obs.urine_protein_dipstick", 2, { code: "plus2" }),
        fact("obs.ketones_urine", 0, { code: "negative" }),
        fact("obs.chol_total", 8.4, { at: ago(24 * 200) }),
      ],
    });
    expect(values(s)).toMatchObject({
      potassium: 6.7,
      urine_protein_strip: "2plus",
      urine_ketones: "neg",
      total_cholesterol: 8.4,
      months_since_lipids: 6,
    });
    const old = scenario({ facts: [fact("obs.potassium", 6.7, { at: ago(48) })] });
    expect(values(old).potassium).toBeUndefined();
  });
});

describe("Core 12: the pack's questions in the clerking steps", () => {
  const CORE = {
    pmh: "prior_gdm pancreatitis_history pcos g6pd_deficiency sickle_cell_trait iron_deficiency b12_deficiency art_regimen months_since_hba1c never_hba1c months_since_lipids never_lipids hypo_awareness_score",
    social: "physically_inactive food_insecurity",
    exam: "acanthosis_nigricans",
  };

  it("past-history conditions: yes and no are answers, blank stays absent", () => {
    const s = scenario({ patient: { ageYears: 30, sex: "female", pregnant: false } });
    const c = s.history.past.conditions;
    c.gestational_diabetes_before = { answer: "yes" };
    c.pcos = { answer: "no" };
    c.g6pd_deficiency = { answer: "yes" };
    c.sickle_cell_trait = { answer: "no" };
    c.iron_deficiency = { answer: "yes" };
    const r = run(s);
    expect(r.input.values).toMatchObject({
      prior_gdm: true,
      pcos: false,
      g6pd_deficiency: true,
      sickle_cell_trait: false,
      iron_deficiency: true,
    });
    expect(r.input.values.b12_deficiency).toBeUndefined();
    expect(r.from.g6pd_deficiency).toBe("Past history · g6pd deficiency");
    expect(values(s, { viewer: { classes: new Set() } }).prior_gdm).toBeUndefined();
  });

  it("pancreatitis: no is none; a yes needs its type", () => {
    const s = scenario();
    s.history.past.conditions.pancreatitis = { answer: "no" };
    expect(values(s).pancreatitis_history).toBe("none");
    s.history.past.conditions.pancreatitis = { answer: "yes" };
    expect(values(s).pancreatitis_history).toBeUndefined();
    s.history.past.conditions.pancreatitis = { answer: "yes", details: { type: "chronic" } };
    expect(values(s).pancreatitis_history).toBe("chronic");
  });

  it("the ART regimen under HIV, restricted (hiv)", () => {
    const s = scenario();
    s.history.past.conditions.hiv = { answer: "yes", details: { art_regimen: "abc_3tc_dtg" } };
    expect(values(s).art_regimen).toBe("abc_3tc_dtg");
    expect(values(s, { viewer: { classes: new Set(["tb"]) } }).art_regimen).toBeUndefined();
  });

  it("About the diabetes: last HbA1c and lipids (MR-34), Gold score; 'not sure' stays absent", () => {
    const s = scenario();
    s.history.past.conditions.diabetes = {
      answer: "yes",
      details: { last_hba1c: "1_to_2_years", last_lipids: "never", hypo_awareness: "4" },
    };
    expect(values(s)).toMatchObject({
      months_since_hba1c: 12,
      never_hba1c: false,
      never_lipids: true,
      hypo_awareness_score: 4,
    });
    expect(values(s).months_since_lipids).toBeUndefined();
    s.history.past.conditions.diabetes!.details = { last_hba1c: "not_sure" };
    const v = values(s);
    expect(v.never_hba1c).toBeUndefined();
    expect(v.months_since_hba1c).toBeUndefined();
    expect(v.hypo_awareness_score).toBeUndefined();
  });

  it("social: exercise and food at home", () => {
    const s = scenario();
    s.history.social = { exercise: "inactive", food: "enough" };
    expect(values(s)).toMatchObject({ physically_inactive: true, food_insecurity: false });
    s.history.social = { exercise: "active", food: "not_enough" };
    expect(values(s)).toMatchObject({ physically_inactive: false, food_insecurity: true });
  });

  it("examination: acanthosis nigricans", () => {
    const s = scenario();
    positive(s, "ex.skin.acanthosis_nigricans", { where: ["posterior_neck"] });
    expect(run(s).from.acanthosis_nigricans).toBe("Examination · skin");
    expect(values(s).acanthosis_nigricans).toBe(true);
    const n = scenario();
    negative(n, "ex.skin.acanthosis_nigricans");
    expect(values(n).acanthosis_nigricans).toBe(false);
  });

  it("each lives in its step now, not in 'More diabetes questions'", () => {
    for (const [home, list] of Object.entries(CORE))
      for (const f of list.split(" ")) expect(PACK_FEATURE_HOME[f], f).toBe(home);
  });
});

describe("context", () => {
  it("pregnancy_possible from sex and age; a man is never asked", () => {
    expect(
      values(scenario({ patient: { ageYears: 30, sex: "female", pregnant: null } }))
        .pregnancy_possible,
    ).toBe(true);
    expect(
      values(scenario({ patient: { ageYears: 60, sex: "female", pregnant: null } }))
        .pregnancy_possible,
    ).toBe(false);
    expect(values(scenario()).pregnancy_possible).toBeUndefined();
  });

  it("gestation and weeks since the birth from the pregnancy record", () => {
    const s = scenario({ patient: { ageYears: 30, sex: "female", pregnant: true } });
    expect(values(s, { pregnancy: { gestationWeeks: 26 } })).toMatchObject({
      pregnant: true,
      gestation_weeks: 26,
    });
    const after = scenario({ patient: { ageYears: 30, sex: "female", pregnant: false } });
    expect(values(after, { pregnancy: { weeksPostpartum: 3 } })).toMatchObject({
      pregnant: false,
      postpartum_weeks: 3,
    });
  });

  it("restricted features stay out for a viewer without the class", () => {
    const s = scenario();
    complain(s, "sym.cough");
    s.history.complaints[0]!.duration = { value: 3, unit: "weeks" };
    expect(values(s).cough_over_2_weeks).toBe(true);
    expect(values(s, { viewer: { classes: new Set() } }).cough_over_2_weeks).toBeUndefined();
  });

  it("every pack feature has a home, and the restricted list is the pack's", () => {
    expect(Object.keys(PACK_FEATURE_HOME).sort()).toEqual(Object.keys(pack.features).sort());
    const homes = [
      "complaint",
      "history",
      "systems",
      "pmh",
      "fh",
      "social",
      "exam",
      "summary",
      "impression",
      "plan",
      "results",
      "more",
    ];
    for (const [f, h] of Object.entries(PACK_FEATURE_HOME)) expect(homes, f).toContain(h);
    const restricted = Object.fromEntries(
      Object.entries(pack.features).flatMap(([f, d]) =>
        d.restrictedClass ? [[f, d.restrictedClass]] : [],
      ),
    );
    expect(RESTRICTED_FEATURES).toEqual(restricted);
  });
});

describe("end to end through the pack", () => {
  it("ketones 2+ with a high glucose in diabetes interrupts for ketoacidosis", () => {
    const s = scenario();
    s.history.past.conditions.diabetes = { answer: "yes", details: { type: "type_1" } };
    ketones(s, { urine: "2plus" });
    meter(s, "25", "random");
    const r = runProtocol(pack, run(s).input);
    expect(r.fired["DM-ACU-ROUTE-02"]).toBe("rule");
    expect(r.interrupt).not.toBeNull();
  });

  it("a random glucose of 11.1 or more with polyuria meets the Uganda 2026 set", () => {
    const s = scenario({ patient: { ageYears: 46, sex: "male", pregnant: null } });
    complain(s, "sym.polyuria");
    s.facts = [
      fact("obs.glucose", 14.2, { fastingState: "non_fasting", specimen: "venous_plasma" }),
    ];
    const r = runProtocol(pack, run(s).input);
    expect(r.diagnosis.ug_integrated_dm_2026).toBe("met");
  });
});

describe("the desk loader's result facts", () => {
  it("keeps a dipstick's code and grade; drops a boolean", async () => {
    const { resultFact } = await import("@/lib/clerking/desk-load");
    const base = {
      concept: "obs.urine_protein_dipstick",
      effective: { at: NOW },
      trust: 4,
      interpretable: { ok: true },
      context: {},
    };
    const strip = (code: string) =>
      resultFact({ ...base, value: { type: "coded", code } } as never);
    expect(strip("plus2")).toMatchObject({ value: 2, code: "plus2" });
    expect(strip("trace")).toMatchObject({ value: 0.5, code: "trace" });
    expect(strip("hazy")).toBeNull();
    expect(resultFact({ ...base, value: { type: "boolean", value: true } } as never)).toBeNull();
  });
});
