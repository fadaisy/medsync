/**
 * Resus DISABILITY catalog (GATE B: findings) — reference data, not logic.
 *
 * The recordable disability findings (neuro-state + conscious level + pupils +
 * glucose + focal/seizure/posture + cause-screen), the neuro-state classifier
 * code-groups, and the neuro-syndrome vocabulary, transcribed from the CSO
 * catalog docs/clinical/resus-disability-clinical-catalog.md §1 (model + reuse
 * in docs/resus-disability-gate-a-proposal.md). The action catalog + clusters
 * are added in GATE C.
 *
 * Mirrors the AIRWAY/BREATHING/CIRCULATION catalog shape. CLINICAL-SAFETY
 * ARTIFACT. Decision-support: the clinician records what they find/do; the app
 * never acts. Findings are codes; the engine (lib/resus/disability.ts) reasons
 * over them — including GCS (computed from components, serial trend) and the
 * NEURO-SYNDROME identification that drives the reversible-first strategy.
 *
 * The D-distinctive element is GCS: a total computed from its components, with
 * the SERIAL TREND (a falling GCS is the danger signal + a return-to-A trigger).
 * Raw GCS components / glucose value / onset time / seizure duration are
 * structured fields on the finding-set; discrete signs are codes.
 */

export const DISABILITY_CATALOG_META = {
  verifiedOn: "2026-06-03",
  guidelineCycle: "2025",
  basis:
    "Resuscitation Council UK ABCDE/Disability + ERC & AHA 2025 (ILCOR 2025 CoSTR) + American Epilepsy Society convulsive status epilepticus guideline & 2025 SE updates (benzodiazepine first-line, three-stage algorithm, ESETT underdosing evidence) + GCS (Teasdale & Jennett) + JBDS hypoglycaemia + eclampsia magnesium (Collaborative Eclampsia Trial / Magpie; 4 g IV load + 1 g/h) + neurological-emergency literature (raised ICP/herniation, stroke). 2025 supersedes earlier.",
} as const;

/* ─── Neuro-state (headline finding AND classification output) ────────────
 * alert → mild_moderate_impairment → severe_impairment_coma (GCS≤8) →
 * active_seizure_status → raised_icp_herniation. Worst-finding-wins; a normal
 * GCS total must NEVER downgrade a recorded seizure / raised-ICP / fixed-pupil
 * sign. Unresponsive + no pulse routes to the ARREST seam, not this engine. */
export const DISABILITY_STATES = [
  "alert",
  "mild_moderate_impairment",
  "severe_impairment_coma",
  "active_seizure_status",
  "raised_icp_herniation",
] as const;
export type DisabilityState = (typeof DISABILITY_STATES)[number];

export const DISABILITY_STATE_LABEL: Record<DisabilityState, string> = {
  alert: "Alert / oriented (GCS 15)",
  mild_moderate_impairment: "Mild–moderate impairment (GCS 9–14)",
  severe_impairment_coma: "Severe impairment / coma (GCS ≤8) — airway at risk",
  active_seizure_status: "Active seizure / status epilepticus",
  raised_icp_herniation: "Raised ICP / herniation — neurosurgical emergency",
};

/* ─── Neuro-syndrome (the D-specific cause axis — drives the strategy) ──────
 * Ordered reversible-first + catastrophic. Glucose is ALWAYS considered first
 * (hypoglycaemia mimics everything + is instantly reversible). */
export const NEURO_SYNDROMES = [
  "hypoglycaemia",
  "opioid_toxicity",
  "status_epilepticus",
  "eclampsia",
  "raised_icp_herniation",
  "stroke",
  "meningitis_encephalitis",
  "dka_hhs",
  "non_convulsive_status",
  "secondary_to_abc",
  "undifferentiated",
] as const;
export type NeuroSyndrome = (typeof NEURO_SYNDROMES)[number];

export const NEURO_SYNDROME_LABEL: Record<NeuroSyndrome, string> = {
  hypoglycaemia: "Hypoglycaemia",
  opioid_toxicity: "Opioid toxicity",
  status_epilepticus: "Status epilepticus",
  eclampsia: "Eclampsia (seizure in pregnancy/postpartum)",
  raised_icp_herniation: "Raised ICP / herniation",
  stroke: "Stroke",
  meningitis_encephalitis: "Meningitis / encephalitis",
  dka_hhs: "DKA / HHS (hyperglycaemic crisis)",
  non_convulsive_status: "Non-convulsive status",
  secondary_to_abc: "Reduced consciousness secondary to A/B/C",
  undifferentiated: "Undifferentiated reduced consciousness",
};

/** The matched strategy headline per syndrome (decision-support summary). */
export const NEURO_SYNDROME_STRATEGY: Record<NeuroSyndrome, string> = {
  hypoglycaemia:
    "IV glucose / IM glucagon → RECHECK (instantly reversible — the highest-yield action)",
  opioid_toxicity: "Naloxone (titrate to ventilation) + support breathing (back to B)",
  status_epilepticus:
    "FULL-dose benzodiazepine NOW (don't underdose) → second-line if ≥2 doses fail → anaesthesia/EEG; check glucose; protect airway",
  eclampsia: "Magnesium sulfate FIRST (NOT a benzodiazepine) + control BP + urgent obstetric",
  raised_icp_herniation:
    "Neurosurgery + urgent CT + head-up 30° + optimise O₂/CO₂/BP ± osmotherapy; do NOT treat the Cushing's hypertension as primary",
  stroke:
    "Urgent CT + activate stroke pathway (thrombolysis/thrombectomy window — note onset time)",
  meningitis_encephalitis: "Do NOT delay antibiotics/antivirals; senior",
  dka_hhs: "DKA/HHS pathway (fluids + insulin + K⁺ + find the precipitant) — overlaps C",
  non_convulsive_status: "Seizure stopped but not waking → escalate + EEG",
  secondary_to_abc: "Optimise oxygenation / perfusion / glucose FIRST, then reassess GCS",
  undifferentiated: "Work the cause-screen (the reversible + the dangerous); senior; reassess",
};

export interface DisabilityFinding {
  code: string;
  label: string;
  meaning: string;
}

/* ─── PUPILS ──────────────────────────────────────────────────────────── */
export const DISABILITY_PUPILS: DisabilityFinding[] = [
  {
    code: "pinpoint_pupils",
    label: "Bilateral pinpoint pupils",
    meaning: "Opioid toxicity (also pontine lesion / organophosphate)",
  },
  {
    code: "unequal_pupil",
    label: "Unequal pupils (anisocoria)",
    meaning: "Raised ICP / herniation / mass / bleed — urgent CT",
  },
  {
    code: "fixed_dilated_pupil",
    label: "Fixed dilated pupil (unilateral)",
    meaning: "Uncal herniation (CN III palsy) — neurosurgical emergency",
  },
  {
    code: "bilateral_fixed_dilated",
    label: "Bilateral fixed dilated pupils",
    meaning: "Severe brainstem injury / hypoxia / drugs (caution: reversible causes)",
  },
  {
    code: "sluggish_pupils",
    label: "Sluggish pupil reaction",
    meaning: "Raised ICP / early herniation",
  },
];

/* ─── FOCAL / SEIZURE / POSTURE / MENINGISM ───────────────────────────── */
export const DISABILITY_FOCAL_SEIZURE: DisabilityFinding[] = [
  {
    code: "focal_deficit",
    label: "Focal / lateralising deficit (weakness / facial droop / dysphasia)",
    meaning: "Stroke — time-critical; note onset time",
  },
  {
    code: "gaze_deviation",
    label: "Gaze deviation",
    meaning: "Stroke / seizure focus",
  },
  {
    code: "active_seizure",
    label: "Active seizure / convulsion",
    meaning: "Status if ≥5 min or recurrent without recovery — time-critical, treat now",
  },
  {
    code: "non_convulsive_suspected",
    label: "Seizure stopped but NOT waking up",
    meaning: "Non-convulsive status — escalate / EEG",
  },
  {
    code: "decorticate",
    label: "Decorticate posturing (flexion)",
    meaning: "Severe brain injury / raised ICP",
  },
  {
    code: "decerebrate",
    label: "Decerebrate posturing (extension)",
    meaning: "Severe brain injury / raised ICP (worse than decorticate)",
  },
  {
    code: "meningism",
    label: "Neck stiffness / photophobia (meningism)",
    meaning: "Meningitis / encephalitis / SAH (rash overlaps E)",
  },
];

/* ─── GLUCOSE + RAISED-ICP banded codes (raw value in the finding-set) ──── */
export const DISABILITY_METABOLIC: DisabilityFinding[] = [
  {
    code: "hypoglycaemia",
    label: "Glucose < 3.0 (or < 4.0 symptomatic)",
    meaning: "HYPOGLYCAEMIA — instantly reversible; mimics stroke/sepsis/coma. Treat NOW + recheck",
  },
  {
    code: "hyperglycaemia_ketotic",
    label: "Glucose > 15 + ketones / acidosis",
    meaning: "DKA / HHS — a cause of reduced consciousness",
  },
  {
    code: "cushings_triad",
    label: "Cushing's: hypertension + bradycardia + irregular breathing",
    meaning: "Raised ICP / impending herniation — do NOT treat the hypertension as primary",
  },
];

/* ─── Neuro-state classifier code-groups (worst wins) ──────────────────── */
/** Raised-ICP / herniation signs — the most ominous neuro-state. A NORMAL GCS
 *  must never downgrade these (a blown pupil with GCS 15 is still herniation). */
export const DISABILITY_RAISED_ICP_FINDINGS = [
  "cushings_triad",
  "unequal_pupil",
  "fixed_dilated_pupil",
  "bilateral_fixed_dilated",
  "decorticate",
  "decerebrate",
] as const;
/** Active seizure → active_seizure_status (more specific than bare coma). */
export const DISABILITY_SEIZURE_FINDINGS = ["active_seizure"] as const;

/** GCS ≤ this = severe impairment / coma → airway at risk → back to A. */
export const GCS_AIRWAY_THRESHOLD = 8;
/** Glucose (mmol/L) at/below which hypoglycaemia is treated (symptomatic). */
export const GLUCOSE_TREAT_THRESHOLD = 4.0;

export function disabilityFindingLabel(code: string): string {
  const all = [...DISABILITY_PUPILS, ...DISABILITY_FOCAL_SEIZURE, ...DISABILITY_METABOLIC];
  return all.find((f) => f.code === code)?.label ?? code;
}

/** The known discrete finding codes (+ `no_pulse`) — validates the recorded
 *  `present[]` so a malformed/typo code can't be silently stored. */
export const DISABILITY_FINDING_CODE_SET: ReadonlySet<string> = new Set<string>([
  ...DISABILITY_PUPILS.map((f) => f.code),
  ...DISABILITY_FOCAL_SEIZURE.map((f) => f.code),
  ...DISABILITY_METABOLIC.map((f) => f.code),
  "no_pulse",
]);

/* ─── Action catalog (GATE C; catalog §2) ───────────────────────────── */
/**
 * Each action is decision-support the clinician performs/confirms — the app
 * records, never acts. DRUG actions whose `code` is a key in the prescribing
 * tool's RECOMMENDATION_DRUG_MAP open the pre-filled, dose-verified prescribe
 * dialog (d_glucose / d_naloxone / d_benzodiazepine [FULL dose] / d_eclampsia_
 * magnesium / d_flumazenil) — doses are NOT duplicated here. `escalatesTo` is
 * surfaced when an action is recorded `failed`; `emergency` actions surface
 * prominently. Procedures (definitive airway, neurosurgery, EEG) are by a
 * skilled operator — the app records + prompts escalation. Mirrors the
 * airway/breathing/circulation shape.
 */
export interface DisabilityAction {
  code: string;
  label: string;
  tier: 1 | 2 | 3;
  escalatesTo?: string;
  emergency?: boolean;
  source: string;
}

const RCUK = "Resuscitation Council UK — ABCDE/Disability (2025)";
const AES = "American Epilepsy Society convulsive SE guideline + 2025 SE updates (ESETT)";
const JBDS = "JBDS-IP Hospital Management of Hypoglycaemia in Adults (2023)";
const ECL = "Collaborative Eclampsia Trial / Magpie (4 g IV load + 1 g/h); RCOG/NICE";

export const DISABILITY_ACTIONS = {
  // Tier 1 — basic / always-available
  d_check_glucose: {
    code: "d_check_glucose",
    label: "Check capillary blood glucose NOW (Don't Ever Forget Glucose)",
    tier: 1,
    emergency: true,
    source: JBDS,
  },
  d_reconfirm_abc: {
    code: "d_reconfirm_abc",
    label: "Re-confirm + optimise A-B-C (most reduced GCS is secondary)",
    tier: 1,
    source: RCUK,
  },
  d_high_flow_o2: {
    code: "d_high_flow_o2",
    label: "High-flow O₂ + ensure perfusion (coordinate with A/B/C)",
    tier: 1,
    source: RCUK,
  },
  d_monitoring: {
    code: "d_monitoring",
    label: "Continuous monitoring (incl. serial GCS + pupils)",
    tier: 1,
    source: RCUK,
  },
  d_serial_gcs: {
    code: "d_serial_gcs",
    label: "Serial GCS + pupils — the trend is the monitoring (a fall → back to A)",
    tier: 1,
    source: RCUK,
  },
  d_iv_access: { code: "d_iv_access", label: "IV access (if not already)", tier: 1, source: RCUK },
  d_protect_airway: {
    code: "d_protect_airway",
    label: "Position / protect the airway (recovery position if appropriate)",
    tier: 1,
    source: RCUK,
  },
  d_back_to_a_airway: {
    code: "d_back_to_a_airway",
    label:
      "GCS ≤8 / not protecting airway → BACK TO A → prepare definitive airway; call skilled help",
    tier: 1,
    emergency: true,
    escalatesTo: "d_definitive_airway",
    source: RCUK,
  },

  // Tier 2 — cause-specific (drug actions route through the prescribing tool)
  d_glucose: {
    code: "d_glucose",
    label: "Hypoglycaemia → IV glucose / IM glucagon → prescribe; then recheck",
    tier: 2,
    emergency: true,
    escalatesTo: "d_recheck_glucose",
    source: JBDS,
  },
  d_recheck_glucose: {
    code: "d_recheck_glucose",
    label: "Recheck capillary glucose after treatment (repeat if still low)",
    tier: 2,
    source: JBDS,
  },
  d_thiamine: {
    code: "d_thiamine",
    label: "Thiamine if malnourished / alcohol (Wernicke's) — record + escalation",
    tier: 2,
    source: "BNF thiamine / Wernicke's prophylaxis",
  },
  d_naloxone: {
    code: "d_naloxone",
    label:
      "Opioid toxicity → naloxone (titrate to ventilation) → prescribe + support breathing (B)",
    tier: 2,
    emergency: true,
    source: "RCUK opioid-toxicity guidance",
  },
  d_benzodiazepine: {
    code: "d_benzodiazepine",
    label:
      "Status → FULL-dose benzodiazepine → prescribe (lorazepam 4 mg / midazolam 10 mg) — don't underdose",
    tier: 2,
    emergency: true,
    escalatesTo: "d_second_line_anticonvulsant",
    source: AES,
  },
  d_second_line_anticonvulsant: {
    code: "d_second_line_anticonvulsant",
    label:
      "Seizing after 2 benzo doses → second-line (levetiracetam/valproate/fosphenytoin) + senior/ICU",
    tier: 2,
    emergency: true,
    escalatesTo: "d_anaesthesia_eeg",
    source: AES,
  },
  d_eclampsia_magnesium: {
    code: "d_eclampsia_magnesium",
    label: "Eclampsia → magnesium sulfate FIRST (NOT a benzo) → prescribe + control BP",
    tier: 2,
    emergency: true,
    escalatesTo: "d_call_skilled_help",
    source: ECL,
  },
  d_neurosurgery_ct: {
    code: "d_neurosurgery_ct",
    label:
      "Raised ICP → urgent CT + neurosurgery; head-up 30°; do NOT treat the Cushing's HTN as primary",
    tier: 2,
    emergency: true,
    escalatesTo: "d_neurosurgical_intervention",
    source: RCUK,
  },
  d_osmotherapy: {
    code: "d_osmotherapy",
    label:
      "Consider osmotherapy (hypertonic saline / mannitol) per neurosurgery/protocol — record + escalation",
    tier: 2,
    source: "Neurocritical care guidance",
  },
  d_stroke_pathway: {
    code: "d_stroke_pathway",
    label:
      "Stroke → urgent CT + activate stroke pathway (thrombolysis/thrombectomy window — onset time)",
    tier: 2,
    emergency: true,
    escalatesTo: "d_call_skilled_help",
    source: "RCUK / national stroke pathway",
  },
  d_dka_pathway: {
    code: "d_dka_pathway",
    label: "DKA / HHS → fluids + insulin + K⁺ + find the precipitant (overlaps C)",
    tier: 2,
    source: "JBDS DKA/HHS",
  },
  d_antimicrobials: {
    code: "d_antimicrobials",
    label: "Suspected meningitis/encephalitis → do NOT delay antibiotics ± antivirals; senior",
    tier: 2,
    emergency: true,
    source: "Sepsis / meningitis guidance",
  },
  d_flumazenil: {
    code: "d_flumazenil",
    label:
      "Benzodiazepine toxicity (if clearly the cause) → flumazenil cautiously → prescribe (seizure risk; senior)",
    tier: 2,
    source: "Toxicology / BNF flumazenil",
  },
  d_eeg: {
    code: "d_eeg",
    label: "Seizure stopped but not waking → non-convulsive status → escalate + EEG",
    tier: 2,
    escalatesTo: "d_anaesthesia_eeg",
    source: AES,
  },

  // Tier 3 — advanced / skilled operator (record + escalation)
  d_definitive_airway: {
    code: "d_definitive_airway",
    label: "Definitive airway (RSI / intubation) — GCS ≤8 / airway-at-risk",
    tier: 3,
    emergency: true,
    source: RCUK,
  },
  d_neurosurgical_intervention: {
    code: "d_neurosurgical_intervention",
    label: "Neurosurgery (evacuation / EVD / ICP monitoring) / thrombectomy",
    tier: 3,
    emergency: true,
    source: "Neurosurgery / stroke",
  },
  d_anaesthesia_eeg: {
    code: "d_anaesthesia_eeg",
    label: "Refractory status → anaesthesia (propofol/midazolam infusion) + continuous EEG",
    tier: 3,
    emergency: true,
    source: AES,
  },
  d_icu: {
    code: "d_icu",
    label: "ICU for ongoing neuroprotection / monitoring",
    tier: 3,
    source: RCUK,
  },
  d_call_skilled_help: {
    code: "d_call_skilled_help",
    label: "Call senior / neurosurgery / stroke team / ICU / obstetrics / anaesthetics",
    tier: 3,
    emergency: true,
    source: RCUK,
  },
} as const satisfies Record<string, DisabilityAction>;

export type DisabilityActionCode = keyof typeof DISABILITY_ACTIONS;

export function disabilityAction(code: string): DisabilityAction | null {
  return (DISABILITY_ACTIONS as Record<string, DisabilityAction>)[code] ?? null;
}
