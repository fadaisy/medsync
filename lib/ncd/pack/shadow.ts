/**
 * Shadow mode for the diabetes pack (I10; PROMPT-NCD-DIABETES Phase 3): the pack is
 * computed beside the live NCD clerkship and LOGGED, shown to nobody, until the CSO
 * signs go-live. The log holds rule ids and counts only; no value and no free text.
 *
 * The live capture uses the v0.1.0 catalog's feature codes; the pack uses its own.
 * `translateCapture` maps only where the meaning is the same (Phase 0 feature map,
 * accepted at GATE A). A live field that is broader than the pack's (for example
 * "passing much less urine" against "anuria") is deliberately NOT mapped, so shadow
 * results never overstate; the pack then reads that feature as not assessed.
 */
import type { CaptureMap, CaptureValue } from "@/lib/ncd/engine/evaluate";
import type { PackInput, PackResult, PackValue, PackValues } from "@/lib/ncd/pack/types";

import { inPregnancyAgeRange } from "@/lib/emr/reference/pregnancy";
import { isEntry, isSeries, latestReading } from "@/lib/ncd/engine/evaluate";
import { effectiveBand } from "@/lib/ncd/pack/engine";

/** Pack code ← live code, where the two mean the same thing. */
const SAME = [
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
] as const;
const RENAMED: Record<string, string> = {
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
};
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

/** The recorded value in the pack's shape, or undefined when it has none (not assessed, a duration, a free-text note). */
function scalar(v: CaptureValue): PackValue | undefined {
  if (typeof v === "number" || typeof v === "string" || typeof v === "boolean") return v;
  if (isSeries(v)) return latestReading(v)?.value;
  if (isEntry(v)) return v.option;
  if (Array.isArray(v)) return v.map((x) => (isEntry(x) ? x.option : String(x)));
  return undefined;
}

export function translateCapture(values: CaptureMap): PackValues {
  const rec = (code: string) => {
    const a = values[code];
    return a?.state === "recorded" ? scalar(a.value) : undefined;
  };
  const out: PackValues = {};
  for (const code of SAME) {
    const v = rec(code);
    if (v !== undefined) out[code] = v;
  }
  for (const [pack, live] of Object.entries(RENAMED)) {
    const v = rec(live);
    if (v !== undefined) out[pack] = v;
  }
  const status = rec("dm_status");
  if (status === "known") out.dm_status = "known";
  const therapy = rec("glucose_lowering_therapy");
  if (Array.isArray(therapy)) {
    const agent = rec("sulfonylurea_agent");
    out.glucose_lowering_therapy = therapy.flatMap((t) =>
      t === "sulfonylurea"
        ? typeof agent === "string" &&
          ["glibenclamide", "gliclazide", "glimepiride"].includes(agent)
          ? [agent]
          : []
        : THERAPY[t]
          ? [THERAPY[t]]
          : [],
    );
  }
  return out;
}

/** The pack's input for a live capture, with what the caller knows of the patient. */
export function shadowInput(
  values: CaptureMap,
  ctx: { ageYears?: number; site?: PackInput["site"] },
): PackInput {
  const v = translateCapture(values);
  if (typeof ctx.ageYears === "number") v.age_years = ctx.ageYears;
  // P0-02: "could be pregnant" from sex and age (REF-PREG-AGE) when the capture did not say.
  if (v.pregnancy_possible === undefined && v.sex !== "male") {
    const inRange = inPregnancyAgeRange(ctx.ageYears);
    if (inRange !== null) v.pregnancy_possible = inRange;
  }
  const band = effectiveBand("adult", ctx.ageYears) as PackInput["ageBand"];
  return {
    values: v,
    site: ctx.site ?? "referral",
    established: v.dm_status === "known",
    ageBand: ctx.ageYears !== undefined && ctx.ageYears >= 65 ? "older_adult" : band,
  };
}

/** What the shadow log keeps: ids and counts, never a value. */
export function shadowSummary(r: PackResult) {
  return {
    interrupt: r.interrupt,
    fired: Object.keys(r.fired).sort(),
    sameDay: Object.keys(r.urgency).filter((k) => r.urgency[k] === "same_day").length,
    dark: Object.keys(r.dark).length,
    withheld: r.withheld.length,
    caveats: r.caveats.length,
    gaps: Object.keys(r.gaps).length,
  };
}
