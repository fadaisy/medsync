/**
 * The live NCD clerkship's answers in the diabetes pack's shape (go-live, NCD_DM_PACK_LIVE; Phase 0 feature map,
 * signed at GATE A). Three kinds of field:
 *
 * - the same code and meaning in both (`SAME`);
 * - a live field the pack reads under another code or shape (`RENAMED`, `mapLive`): the form keeps asking the live
 *   question and the pack reads its answer. Where the live field is broader than the pack's, it maps only where
 *   reading it broadly errs safe (more testing or referral, a relaxed target), never into a false emergency;
 * - the pack's own fields the live form did not ask, added to the form by `data/ncd/diabetes-pack-capture.json`
 *   and passed straight through.
 *
 * Nothing here invents a value: an answer that cannot be mapped leaves the pack's field not assessed.
 */
import type { CaptureMap, CaptureValue } from "@/lib/ncd/engine/evaluate";
import type { PackInput, PackValue, PackValues } from "@/lib/ncd/pack/types";

import { inPregnancyAgeRange } from "@/lib/emr/reference/pregnancy";
import {
  durationInDays,
  isDuration,
  isEntry,
  isSeries,
  latestReading,
} from "@/lib/ncd/engine/evaluate";

/** Pack code ← live code, where the two mean the same thing (units are the same quantity). */
export const SAME = [
  "polyuria",
  "polydipsia",
  "polyphagia",
  "unexplained_weight_loss",
  "fatigue",
  "slow_healing_wound",
  "vomiting",
  "abdominal_pain",
  "capillary_glucose",
  "random_pg",
  "hba1c",
  "bohb",
  "urine_ketones",
  "venous_ph",
  "bicarbonate",
  "sodium",
  "urea",
  "effective_osmolality",
  "mental_status",
  "deep_rapid_breathing",
  "acetone_breath",
  "dehydration",
  "egfr",
  "urine_acr",
  "urine_protein_strip",
  "kidney_abnormality_3_months",
  "hiv_on_art",
  "art_regimen",
  "haemolysis",
  "malaria_current",
  "recent_transfusion",
  "bp_systolic",
  "bp_diastolic",
  "weight_kg",
  "height_cm",
  "waist_cm",
  "pedal_pulses",
  "monofilament_10g",
  "retinopathy_stage",
  "foot_deformity",
  "active_foot_ulcer",
  "foot_infection_grade",
  "acanthosis_nigricans",
  "peripheral_oedema",
  "pregnant",
  "recurrent_infections",
  "ketosis_at_presentation",
  "islet_autoantibodies",
  "iron_deficiency",
  "on_dialysis",
  "cognitive_impairment",
  "abi",
  "sex",
  "pulse",
  "respiratory_rate",
  "temperature",
  "bmi",
] as const;

/** Pack code ← live code: the same meaning, or a broader live field read in the safe direction. */
export const RENAMED: Record<string, string> = {
  fasting_pg: "fpg",
  ogtt_2h_pg: "ogtt_2h",
  repeat_abnormal_result: "second_sample_confirms",
  orthostatic_dizziness: "postural_dizziness",
  age_at_diagnosis: "age_at_onset",
  previous_foot_ulcer: "prior_foot_ulcer",
  previous_amputation: "prior_amputation",
  secondary_enuresis: "bedwetting_new_onset",
  insulin_stopped_without_relapse: "insulin_withdrawn_later",
  foot_numbness_burning: "peripheral_neuropathic_symptoms",
  acute_illness_current: "intercurrent_illness",
  // Broader live fields, read broadly because that errs safe (a test, a referral, a relaxed target):
  blurred_vision: "visual_symptoms",
  first_degree_relative_diabetes: "family_history_diabetes",
  end_stage_kidney_disease: "esrd",
  foot_hot_swollen: "charcot_presentation",
  pcos: "pcos_features",
  frailty_or_limited_life_expectancy: "frailty",
  autonomic_symptoms: "autonomic_symptom_screen",
  anuria: "reduced_urine_output",
};

/** Pack fields filled from live fields of another shape (`mapLive`). The form does not ask them again. */
export const MAPPED_FROM_LIVE = new Set<string>([
  ...Object.keys(RENAMED),
  "insulin_omitted",
  "sudden_vision_loss",
  "chest_pain_or_stroke_symptoms",
  "sickle_cell_disease",
  "sickle_cell_trait",
  "vibration_128hz",
  "foot_gangrene",
  "injection_site_lumps",
  "macular_oedema",
  "retina_view",
  "pinprick_feet",
  "ankle_reflexes",
  "limb_ischaemia_signs",
  "years_since_diagnosis",
  "ipswich_sites_missed",
  "hypo_awareness_score",
  "visual_acuity_worse_6_12",
]);

/** A pack field whose code the live form already uses for something else: the added field gets this code. */
export const PACK_ONLY_CODE: Record<string, string> = { c_peptide: "c_peptide_pmol" };

/** Live glucose-lowering options → pack options; the live 'sulfonylurea' is named by `sulfonylurea_agent`. */
const THERAPY: Record<string, string> = {
  metformin: "metformin",
  insulin: "insulin",
  sglt2: "sglt2_inhibitor",
  dpp4: "dpp4_inhibitor",
  glp1: "glp1_ra",
  tzd: "pioglitazone",
  none: "none",
};
const SU = ["glibenclamide", "gliclazide", "glimepiride"];

/** The recorded value in the pack's shape, or undefined when it has none (not assessed, a free-text note). */
function scalar(v: CaptureValue): PackValue | undefined {
  if (typeof v === "number" || typeof v === "string" || typeof v === "boolean") return v;
  if (isSeries(v)) return latestReading(v)?.value;
  if (isDuration(v)) return durationInDays(v) / 365.25;
  if (isEntry(v)) return v.option;
  if (Array.isArray(v)) return v.map((x) => (isEntry(x) ? x.option : String(x)));
  return undefined;
}

export function toPackValues(values: CaptureMap, packFields: readonly string[] = []): PackValues {
  const rec = (code: string) => {
    const a = values[code];
    return a?.state === "recorded" ? scalar(a.value) : undefined;
  };
  const has = (v: unknown, ...opts: string[]) =>
    Array.isArray(v) ? v.some((x) => opts.includes(x)) : opts.includes(v as string);
  const out: PackValues = {};
  const set = (code: string, v: PackValue | undefined) => {
    if (v !== undefined && out[code] === undefined) out[code] = v;
  };
  // The pack's own fields first: a direct answer wins over a mapped one.
  for (const code of packFields) {
    const back = Object.entries(PACK_ONLY_CODE).find(([, c]) => c === code)?.[0];
    set(back ?? code, rec(code));
  }
  for (const code of SAME) set(code, rec(code));
  for (const [pack, live] of Object.entries(RENAMED)) set(pack, rec(live));

  const status = rec("dm_status");
  if (status === "known") set("dm_status", "known");
  if (status === "none") set("dm_status", "not_known");
  const therapy = rec("glucose_lowering_therapy");
  if (Array.isArray(therapy)) {
    const agent = rec("sulfonylurea_agent");
    const mapped = therapy.flatMap((t) =>
      t === "sulfonylurea"
        ? typeof agent === "string" && SU.includes(agent)
          ? [agent]
          : []
        : THERAPY[t]
          ? [THERAPY[t]!]
          : [],
    );
    // P0-03: a list holding only 'unknown' or 'other' says nothing, so it stays not assessed.
    if (mapped.length) set("glucose_lowering_therapy", mapped);
  }
  if (rec("sex") === "other") delete out.sex;
  const omission = rec("treatment_omission");
  if (
    omission !== undefined &&
    Array.isArray(out.glucose_lowering_therapy) &&
    out.glucose_lowering_therapy.includes("insulin")
  )
    set("insulin_omitted", omission);

  const pattern = rec("visual_pattern");
  if (pattern !== undefined)
    set("sudden_vision_loss", has(pattern, "sudden_loss", "recent_deterioration"));
  const chest = rec("chest_pain"),
    focal = rec("focal_neurological_deficit");
  if (chest === true || focal === true) set("chest_pain_or_stroke_symptoms", true);
  else if (chest === false && focal === false) set("chest_pain_or_stroke_symptoms", false);
  const hb = rec("haemoglobin_variant");
  if (hb !== undefined && hb !== "unknown") {
    set("sickle_cell_disease", hb === "hbss");
    set("sickle_cell_trait", has(hb, "hbs_trait", "hbc", "hbe", "thalassaemia"));
  }
  const vib = rec("vibration_128hz");
  if (vib !== undefined) set("vibration_128hz", vib === "none" ? "present" : "absent_one");
  const gangrene = rec("gangrene_type");
  if (gangrene !== undefined) set("foot_gangrene", has(gangrene, "dry", "wet"));
  const lipo = rec("lipodystrophy"),
    lipoType = rec("lipodystrophy_type");
  if (lipo === false) set("injection_site_lumps", false);
  else if (lipoType !== undefined)
    set("injection_site_lumps", has(lipoType, "lipohypertrophy", "both"));
  const mac = rec("diabetic_maculopathy"),
    centre = rec("maculopathy_centre_involved");
  if (mac === false) set("macular_oedema", "none");
  else if (centre === "central") set("macular_oedema", "centre_involving");
  else if (centre === "noncentral") set("macular_oedema", "non_centre");
  const obscured = rec("fundus_view_obscured");
  if (obscured !== undefined) set("retina_view", obscured ? "inadequate" : "adequate");
  const pin = rec("small_fibre_sensation");
  if (pin !== undefined) set("pinprick_feet", pin === "none" ? "normal" : "reduced");
  const ankle = rec("ankle_reflexes");
  if (ankle !== undefined)
    set("ankle_reflexes", ankle === "none" ? "present" : "reduced_or_absent");
  const isch = rec("ischaemic_foot_signs"),
    legPain = rec("leg_pain_character");
  if (
    (isch !== undefined && has(isch, "cool_foot", "elevation_pallor", "dependent_rubor")) ||
    legPain === "at_rest"
  )
    set("limb_ischaemia_signs", true);
  else if (isch !== undefined && legPain !== undefined) set("limb_ischaemia_signs", false);
  set("years_since_diagnosis", rec("dm_duration"));
  const ipswich = rec("lops_ipswich");
  if (ipswich !== undefined) set("ipswich_sites_missed", ipswich === "present" ? 2 : 0);
  const aware = rec("impaired_hypo_awareness");
  if (aware !== undefined) set("hypo_awareness_score", aware ? 4 : 1);
  const vaR = rec("visual_acuity_right"),
    vaL = rec("visual_acuity_left");
  if (typeof vaR === "number" || typeof vaL === "number")
    set(
      "visual_acuity_worse_6_12",
      [vaR, vaL].some((v) => typeof v === "number" && v > 12),
    );
  // The live 'last retinal examination' (asked only with a vision complaint) fills the pack's own fields if unanswered.
  const lastEye = rec("last_retinal_exam");
  if (lastEye === "never") set("never_eye_screen", true);
  const EYE_MONTHS: Record<string, number> = {
    within_1_year: 0,
    "1_to_2_years": 12,
    over_2_years: 24,
  };
  if (typeof lastEye === "string" && lastEye in EYE_MONTHS)
    set("months_since_eye_screen", EYE_MONTHS[lastEye]);
  return out;
}

/** What the encounter knows that the form does not ask (P0-01, P0-02). */
export interface PackContext {
  ageYears?: number | null;
  site: PackInput["site"];
  /** A recorded diabetes diagnosis on the patient's problem list. */
  established: boolean;
  careSetting?: "outpatient" | "emergency" | "inpatient" | null;
  /** The pack fields the form adds, passed straight through (`packFieldCodes()` on the server). */
  packFields?: readonly string[];
}

/** The pack's input for a live capture (go-live and shadow alike). */
export function toPackInput(values: CaptureMap, ctx: PackContext): PackInput {
  const v = toPackValues(values, ctx.packFields);
  if (typeof ctx.ageYears === "number") v.age_years = ctx.ageYears;
  if (ctx.careSetting) v.care_setting = ctx.careSetting;
  // P0-02: "could be pregnant" from sex and age (REF-PREG-AGE); unknown sex or age stays unknown.
  if (v.pregnancy_possible === undefined && v.sex !== "male") {
    const inRange = inPregnancyAgeRange(ctx.ageYears);
    if (inRange !== null) v.pregnancy_possible = inRange;
  }
  const age = ctx.ageYears;
  const ageBand: PackInput["ageBand"] =
    typeof age !== "number"
      ? "adult"
      : age < 10
        ? "child"
        : age < 16
          ? "adolescent"
          : age >= 65
            ? "older_adult"
            : "adult";
  return {
    values: v,
    site: ctx.site,
    established: ctx.established || v.dm_status === "known",
    ageBand,
  };
}
