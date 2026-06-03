/**
 * Resus EXPOSURE catalog (GATE B: findings + GATE C: actions) — reference data.
 *
 * The recordable exposure findings (skin/rash + bleeding/wounds/injury + the
 * back + limb), the temperature staging, the exposure-state classifier
 * code-groups, the suspected-diagnosis vocabulary, and the action catalog —
 * transcribed from the CSO catalog docs/clinical/resus-exposure-clinical-
 * catalog.md (model + reuse + the return-to-A loop in docs/resus-exposure-
 * gate-a-proposal.md).
 *
 * Mirrors the A/B/C/D catalog shape. CLINICAL-SAFETY ARTIFACT. Decision-support:
 * the clinician records what they find/do; the app never acts. Findings are
 * codes; the engine (lib/resus/exposure.ts) reasons over them — including the
 * temperature staging and the SUSPECTED-DIAGNOSIS that drives the strategy, and
 * the RETURN-TO-A loop (E is not a dead-end; the primary survey cycles).
 *
 * Core temperature is a structured field (°C); the staging + extremes are
 * computed. AMPLE allergies recorded here feed the prescribing-tool allergy
 * check (via recordResusAllergies).
 */

export const EXPOSURE_CATALOG_META = {
  verifiedOn: "2026-06-03",
  guidelineCycle: "2025",
  basis:
    "Resuscitation Council UK ABCDE/Exposure + ERC & AHA 2025 (ILCOR 2025 CoSTR) + accidental-hypothermia guidance (ICAR MedCom 2021; ECLS for severe/unstable/arrest; 'not dead until warm and dead') + Wilderness Medical Society heat-illness CPGs + meningococcal-sepsis / non-blanching-rash guidance + ATLS (log-roll, secondary survey, AMPLE). 2025 supersedes earlier.",
} as const;

/* ─── Exposure-state (headline finding AND classification output) ─────────
 * no_new_critical_finding → significant_finding → temperature_extreme →
 * critical_finding. Worst-finding-wins; a temperature extreme (≤35 / ≥40) is
 * never downgraded by an otherwise-benign survey. Unresponsive + no pulse
 * routes to the ARREST seam (with the hypothermia modifier), not this engine. */
export const EXPOSURE_STATES = [
  "no_new_critical_finding",
  "significant_finding",
  "temperature_extreme",
  "critical_finding",
] as const;
export type ExposureState = (typeof EXPOSURE_STATES)[number];

export const EXPOSURE_STATE_LABEL: Record<ExposureState, string> = {
  no_new_critical_finding: "No new critical finding — re-cover, return to A",
  significant_finding: "Significant finding on exposure",
  temperature_extreme: "Temperature extreme (hypothermia / hyperthermia)",
  critical_finding: "Critical finding on exposure — emergency",
};

/* ─── Suspected diagnosis (the E-specific cause axis — drives the strategy) ── */
export const EXPOSURE_DIAGNOSES = [
  "anaphylaxis",
  "meningococcal_sepsis",
  "occult_haemorrhage",
  "necrotising_fasciitis",
  "limb_threat",
  "severe_hypothermia",
  "hyperthermia_heatstroke",
  "hypothermia",
  "opioid_patch_toxicity",
  "none",
] as const;
export type ExposureDiagnosis = (typeof EXPOSURE_DIAGNOSES)[number];

export const EXPOSURE_DIAGNOSIS_LABEL: Record<ExposureDiagnosis, string> = {
  anaphylaxis: "Anaphylaxis",
  meningococcal_sepsis: "Meningococcal sepsis / meningitis",
  occult_haemorrhage: "Occult / major haemorrhage",
  necrotising_fasciitis: "Necrotising fasciitis",
  limb_threat: "Limb-threatening ischaemia / compartment",
  severe_hypothermia: "Severe hypothermia",
  hyperthermia_heatstroke: "Hyperthermia / heatstroke",
  hypothermia: "Hypothermia",
  opioid_patch_toxicity: "Transdermal opioid toxicity",
  none: "No critical diagnosis identified",
};

export const EXPOSURE_DIAGNOSIS_STRATEGY: Record<ExposureDiagnosis, string> = {
  anaphylaxis: "IM adrenaline FIRST (back to A/B/C) + O₂ + fluids + remove the trigger",
  meningococcal_sepsis:
    "Do NOT delay broad-spectrum antibiotics (sepsis bundle, overlaps C) + resuscitate + senior",
  occult_haemorrhage:
    "Control + back to C (pressure / binder / tourniquet, blood/MHP, TXA, definitive control)",
  necrotising_fasciitis: "Urgent surgical referral + broad-spectrum antibiotics — time-critical",
  limb_threat: "Urgent surgical referral (ischaemia / compartment syndrome)",
  severe_hypothermia:
    "Gentle handling + warmed fluids + ECLS (treatment of choice for severe/unstable/arrest); treat the cause (esp. sepsis)",
  hyperthermia_heatstroke:
    "Active cooling (evaporative + cold packs / immersion for exertional) + cause-specific (serotonin/NMS/thyroid/MH)",
  hypothermia:
    "Remove wet clothing + passive ± active-external rewarming + warmed fluids; if not rewarming ~1 °C/hr reconsider sepsis/hypothyroid",
  opioid_patch_toxicity: "Remove the patch + naloxone (back to D/B)",
  none: "Re-cover + keep warm, complete AMPLE, then RETURN TO A and cycle the survey",
};

export interface ExposureFinding {
  code: string;
  label: string;
  meaning: string;
}

/* ─── SKIN / RASH ─────────────────────────────────────────────────────── */
export const EXPOSURE_SKIN: ExposureFinding[] = [
  {
    code: "non_blanching_rash",
    label: "Non-blanching rash (petechiae / purpura)",
    meaning: "Meningococcal sepsis / meningitis until proven otherwise — do NOT delay antibiotics",
  },
  {
    code: "urticaria_angioedema",
    label: "Urticaria / angioedema / flushing",
    meaning: "Anaphylaxis — IM adrenaline (back to A/B/C)",
  },
  {
    code: "mottling_pallor_cyanosis",
    label: "Mottling / pallor / cyanosis",
    meaning: "Poor perfusion (back to C)",
  },
  {
    code: "burns_blistering",
    label: "Erythema / blistering / desquamation",
    meaning: "Burns / SJS-TEN / cellulitis",
  },
  {
    code: "pain_out_of_proportion",
    label: "Pain out of proportion ± crepitus / systemic toxicity",
    meaning: "Necrotising fasciitis — surgical emergency",
  },
  {
    code: "track_marks",
    label: "Track marks / injection sites",
    meaning: "IVDU (overdose / sepsis source)",
  },
  { code: "jaundice", label: "Jaundice", meaning: "Hepatic — cause clue" },
];

/* ─── BLEEDING / WOUNDS / INJURY (the occult-haemorrhage hunt) ─────────── */
export const EXPOSURE_INJURY: ExposureFinding[] = [
  {
    code: "external_haemorrhage",
    label: "External haemorrhage",
    meaning: "Control immediately — back to C",
  },
  {
    code: "wound",
    label: "Wound / laceration / surgical site",
    meaning: "Bleeding / dehiscence / source",
  },
  {
    code: "bruising_haematoma",
    label: "Bruising / haematoma (flank / expanding)",
    meaning: "Retroperitoneal / concealed haemorrhage",
  },
  {
    code: "abdominal_distension",
    label: "Abdominal distension / peritonism / pulsatile mass",
    meaning: "Intra-abdominal bleed / AAA",
  },
  {
    code: "pelvic_instability",
    label: "Pelvic instability (don't spring repeatedly)",
    meaning: "Pelvic haemorrhage — apply a binder",
  },
  {
    code: "long_bone_deformity",
    label: "Long-bone (e.g. femoral) deformity",
    meaning: "Litres of concealed blood",
  },
  {
    code: "back_finding",
    label: "Back: wound / bleeding / spinal tenderness (log-roll)",
    meaning: "Classically missed — examine the back",
  },
  {
    code: "limb_ischaemia",
    label: "Limb cold / pale / pulseless",
    meaning: "Limb-threatening ischaemia / compartment syndrome",
  },
  {
    code: "dvt_signs",
    label: "Limb swelling / erythema / tenderness",
    meaning: "DVT",
  },
];

/* ─── PATCHES / LINES (easily-missed) ─────────────────────────────────── */
export const EXPOSURE_PATCHES: ExposureFinding[] = [
  {
    code: "transdermal_opioid_patch",
    label: "Transdermal OPIOID patch (e.g. fentanyl)",
    meaning: "May explain low GCS/RR — remove; naloxone (back to D/B)",
  },
  {
    code: "transdermal_patch_other",
    label: "Transdermal patch (GTN / hyoscine / other)",
    meaning: "Easily missed — look for + remove where relevant",
  },
  {
    code: "lines_devices",
    label: "Lines / drains / devices",
    meaning: "Infection source / what's in situ",
  },
];

/* ─── Temperature staging (°C; raw value in the finding-set) ───────────── */
export const HYPOTHERMIA_MILD_MAX = 35;
export const HYPOTHERMIA_MODERATE_MAX = 32;
export const HYPOTHERMIA_SEVERE_MAX = 28;
export const HYPERTHERMIA_MIN = 40;

export const TEMP_STAGES = [
  "severe_hypothermia",
  "moderate_hypothermia",
  "mild_hypothermia",
  "normal",
  "fever",
  "hyperthermia",
] as const;
export type TempStage = (typeof TEMP_STAGES)[number];

export const TEMP_STAGE_LABEL: Record<TempStage, string> = {
  severe_hypothermia: "Severe hypothermia (<28 °C)",
  moderate_hypothermia: "Moderate hypothermia (28–32 °C)",
  mild_hypothermia: "Mild hypothermia (32–35 °C)",
  normal: "Normothermic",
  fever: "Fever (38–40 °C)",
  hyperthermia: "Hyperthermia / heatstroke (≥40 °C)",
};

/* ─── Exposure-state classifier code-groups (worst wins) ───────────────── */
/** Major-haemorrhage findings — occult-haemorrhage diagnosis + back-to-C. */
export const EXPOSURE_HAEMORRHAGE_FINDINGS = [
  "external_haemorrhage",
  "bruising_haematoma",
  "abdominal_distension",
  "pelvic_instability",
  "long_bone_deformity",
] as const;
/** Critical findings → critical_finding state (loudest). */
export const EXPOSURE_CRITICAL_FINDINGS = [
  ...EXPOSURE_HAEMORRHAGE_FINDINGS,
  "non_blanching_rash",
  "urticaria_angioedema",
  "limb_ischaemia",
  "pain_out_of_proportion",
] as const;
/** Significant (but not immediately critical) findings. */
export const EXPOSURE_SIGNIFICANT_FINDINGS = [
  "wound",
  "back_finding",
  "mottling_pallor_cyanosis",
  "burns_blistering",
  "track_marks",
  "jaundice",
  "dvt_signs",
  "transdermal_opioid_patch",
  "transdermal_patch_other",
  "lines_devices",
] as const;

export function exposureFindingLabel(code: string): string {
  const all = [...EXPOSURE_SKIN, ...EXPOSURE_INJURY, ...EXPOSURE_PATCHES];
  return all.find((f) => f.code === code)?.label ?? code;
}

/** The known discrete finding codes (+ `no_pulse`) — validates `present[]`. */
export const EXPOSURE_FINDING_CODE_SET: ReadonlySet<string> = new Set<string>([
  ...EXPOSURE_SKIN.map((f) => f.code),
  ...EXPOSURE_INJURY.map((f) => f.code),
  ...EXPOSURE_PATCHES.map((f) => f.code),
  "no_pulse",
]);

/* ─── Action catalog (GATE C; catalog §2) ───────────────────────────── */
/**
 * Each action is decision-support the clinician performs/confirms — the app
 * records, never acts. DRUG actions whose `code` is a key in the prescribing
 * tool's RECOMMENDATION_DRUG_MAP open the pre-filled, dose-verified prescribe
 * dialog (e_antibiotics / e_anaphylaxis_adrenaline / e_warmed_fluids /
 * e_naloxone) — doses are NOT duplicated here. `escalatesTo` is surfaced when an
 * action is recorded `failed`; `emergency` actions surface prominently.
 * Procedures (rewarming, ECLS, surgery) are by a skilled operator — the app
 * records + prompts escalation. Mirrors the A/B/C/D shape.
 */
export interface ExposureAction {
  code: string;
  label: string;
  tier: 1 | 2 | 3;
  escalatesTo?: string;
  emergency?: boolean;
  source: string;
}

const RCUK = "Resuscitation Council UK — ABCDE/Exposure (2025)";
const ICAR = "ICAR MedCom accidental-hypothermia guidance (2021); ERC 2025";
const WMS = "Wilderness Medical Society heat-illness CPGs";
const ATLS = "ATLS (log-roll, secondary survey, AMPLE)";
const MENINGO = "Meningococcal sepsis / non-blanching-rash guidance";

export const EXPOSURE_ACTIONS = {
  // Tier 1 — basic / always-available
  e_expose_examine: {
    code: "e_expose_examine",
    label: "Expose + examine head-to-toe (find what A–D missed)",
    tier: 1,
    source: RCUK,
  },
  e_measure_temp: {
    code: "e_measure_temp",
    label: "Measure core temperature (low-reading thermometer if cold)",
    tier: 1,
    emergency: true,
    source: RCUK,
  },
  e_recover_keep_warm: {
    code: "e_recover_keep_warm",
    label: "COVER + keep warm — prevent iatrogenic hypothermia (re-cover after examining)",
    tier: 1,
    source: RCUK,
  },
  e_ample_history: {
    code: "e_ample_history",
    label: "Take AMPLE history + review the chart (allergies feed the prescribing check)",
    tier: 1,
    source: ATLS,
  },
  e_log_roll: {
    code: "e_log_roll",
    label: "Log-roll with C-spine control — examine the back",
    tier: 1,
    source: ATLS,
  },
  e_monitoring: {
    code: "e_monitoring",
    label: "Continuous monitoring continues",
    tier: 1,
    source: RCUK,
  },
  e_return_to_a: {
    code: "e_return_to_a",
    label: "Primary survey complete → RETURN TO A and reassess (cycle the ABCDE)",
    tier: 1,
    emergency: true,
    source: RCUK,
  },

  // Tier 2 — cause-specific (drug actions route through the prescribing tool)
  e_antibiotics: {
    code: "e_antibiotics",
    label: "Non-blanching rash / meningococcal sepsis → do NOT delay antibiotics → prescribe",
    tier: 2,
    emergency: true,
    escalatesTo: "e_call_skilled_help",
    source: MENINGO,
  },
  e_anaphylaxis_adrenaline: {
    code: "e_anaphylaxis_adrenaline",
    label: "Anaphylaxis → IM adrenaline FIRST → prescribe (back to A/B/C)",
    tier: 2,
    emergency: true,
    escalatesTo: "e_call_skilled_help",
    source: "RCUK Anaphylaxis (2021, current)",
  },
  e_haemorrhage_control: {
    code: "e_haemorrhage_control",
    label:
      "Occult / major haemorrhage found → control + back to C (pressure / binder / tourniquet)",
    tier: 2,
    emergency: true,
    escalatesTo: "e_surgical_referral",
    source: ATLS,
  },
  e_passive_rewarming: {
    code: "e_passive_rewarming",
    label:
      "Hypothermia → remove wet clothing + passive rewarming (warm blankets / environment); handle gently",
    tier: 2,
    source: ICAR,
  },
  e_active_rewarming: {
    code: "e_active_rewarming",
    label:
      "Moderate hypothermia → active external rewarming (forced-air; packs to groin + axillae)",
    tier: 2,
    escalatesTo: "e_ecls_rewarming",
    source: ICAR,
  },
  e_warmed_fluids: {
    code: "e_warmed_fluids",
    label: "Warmed IV fluids → prescribe (crystalloid ~40 °C — never room-temp)",
    tier: 2,
    source: ICAR,
  },
  e_septic_screen: {
    code: "e_septic_screen",
    label:
      "Unexplained / not-rewarming hypothermia → reconsider SEPSIS (cold sepsis) / hypothyroid → septic screen + treat",
    tier: 2,
    escalatesTo: "e_antibiotics",
    source: ICAR,
  },
  e_active_cooling: {
    code: "e_active_cooling",
    label:
      "Hyperthermia / heatstroke → active cooling (evaporative + cold packs; immersion for exertional; cooled fluids)",
    tier: 2,
    emergency: true,
    source: WMS,
  },
  e_treat_hyperthermia_cause: {
    code: "e_treat_hyperthermia_cause",
    label:
      "Cause-specific: serotonin syndrome / NMS (stop drug + benzodiazepine), thyroid storm, malignant hyperthermia (dantrolene) — record + escalation",
    tier: 2,
    source: WMS,
  },
  e_remove_patch: {
    code: "e_remove_patch",
    label: "Transdermal patch / toxin found → REMOVE it; treat per toxin",
    tier: 2,
    source: RCUK,
  },
  e_naloxone: {
    code: "e_naloxone",
    label: "Opioid patch + low GCS/RR → naloxone → prescribe (back to D/B)",
    tier: 2,
    emergency: true,
    source: "RCUK opioid-toxicity guidance",
  },
  e_surgical_referral: {
    code: "e_surgical_referral",
    label:
      "Limb-threat / compartment / necrotising fasciitis → urgent surgical referral (+ antibiotics)",
    tier: 2,
    emergency: true,
    escalatesTo: "e_call_skilled_help",
    source: ATLS,
  },

  // Tier 3 — advanced / skilled operator (record + escalation)
  e_ecls_rewarming: {
    code: "e_ecls_rewarming",
    label:
      "Severe / unstable / hypothermic arrest → active internal rewarming / ECLS (ECMO / bypass — treatment of choice)",
    tier: 3,
    emergency: true,
    escalatesTo: "e_call_skilled_help",
    source: ICAR,
  },
  e_icu: {
    code: "e_icu",
    label: "ICU for heatstroke / severe-hypothermia complications",
    tier: 3,
    source: RCUK,
  },
  e_call_skilled_help: {
    code: "e_call_skilled_help",
    label: "Call senior / surgery / ICU / ECLS-centre / infectious-diseases",
    tier: 3,
    emergency: true,
    source: RCUK,
  },
} as const satisfies Record<string, ExposureAction>;

export type ExposureActionCode = keyof typeof EXPOSURE_ACTIONS;

export function exposureAction(code: string): ExposureAction | null {
  return (EXPOSURE_ACTIONS as Record<string, ExposureAction>)[code] ?? null;
}
