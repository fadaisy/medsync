/**
 * Resus AIRWAY catalog (GATE B: findings) — reference data, not logic.
 *
 * The recordable airway findings (patency state + LOOK/LISTEN/FEEL + the
 * difficulty screen) and the classifier code-groups, transcribed from the
 * CSO catalog docs/clinical/resus-airway-clinical-catalog.md §1 (web-
 * verified anchors in docs/resus-airway-gate-a-proposal.md §A.6). The
 * action catalog + combination clusters are added in GATE C (same file).
 *
 * CLINICAL-SAFETY ARTIFACT. Decision-support: the clinician records what
 * they find/do; the app never acts. Findings are codes; the engine
 * (lib/resus/airway.ts) reasons over them.
 */

export const AIRWAY_CATALOG_META = {
  verifiedOn: "2026-06-02",
  guidelineCycle: "2025",
  basis:
    "DAS 2025 (BJA, supersedes 2015) + Resuscitation Council UK ABCDE/Airway + RCUK 2025 First Aid/BLS + ERC/AHA 2025 + LEMON/MOANS/RODS (Walls & Murphy).",
} as const;

/* ─── Patency state (the headline finding) ──────────────────────────── */
export const AIRWAY_PATENCY = [
  "patent_talking",
  "patent_at_risk",
  "partially_obstructed",
  "completely_obstructed",
  "apnoeic",
] as const;
export type AirwayPatency = (typeof AIRWAY_PATENCY)[number];

export const AIRWAY_PATENCY_LABEL: Record<AirwayPatency, string> = {
  patent_talking: "Patent — talking normally",
  patent_at_risk: "Patent but at risk / threatened",
  partially_obstructed: "Partially obstructed",
  completely_obstructed: "Completely obstructed",
  apnoeic: "Apnoeic / no airway effort",
};

export interface AirwayFinding {
  code: string;
  label: string;
  meaning: string;
}

/* ─── LOOK / LISTEN / FEEL finding catalog ──────────────────────────── */
export const AIRWAY_LOOK: AirwayFinding[] = [
  {
    code: "see_saw",
    label: "See-saw / paradoxical movement",
    meaning: "Obstruction (chest in–abdomen out)",
  },
  {
    code: "accessory_muscles",
    label: "Accessory muscles / tracheal tug / recession",
    meaning: "Increased airway/respiratory effort",
  },
  {
    code: "central_cyanosis",
    label: "Central cyanosis (lips/tongue)",
    meaning: "Severe hypoxaemia — a LATE sign",
  },
  {
    code: "foreign_body",
    label: "Foreign body / vomit / blood / secretions",
    meaning: "Material in the mouth/pharynx",
  },
  {
    code: "facial_neck_trauma",
    label: "Facial / mouth / neck trauma",
    meaning: "Distortion + C-spine concern",
  },
  {
    code: "burns_soot",
    label: "Facial/neck burns · soot · singed nasal hair",
    meaning: "Inhalation injury — closing-airway risk",
  },
  {
    code: "swelling_face",
    label: "Swelling — lips / tongue / face",
    meaning: "Angioedema / anaphylaxis",
  },
  {
    code: "swelling_neck",
    label: "Swelling — neck (haematoma / infection)",
    meaning: "Ludwig's / abscess / expanding haematoma",
  },
  {
    code: "gcs_le8",
    label: "Reduced consciousness / GCS ≤ 8",
    meaning: "Cannot protect own airway (aspiration risk)",
  },
  {
    code: "drooling_tripod",
    label: "Drooling / can't swallow / tripod position",
    meaning: "Supraglottic pathology (epiglottitis)",
  },
];

export const AIRWAY_LISTEN: AirwayFinding[] = [
  { code: "normal_speech", label: "Normal speech, full sentences", meaning: "Patent (reassuring)" },
  {
    code: "hoarse_muffled_voice",
    label: 'Hoarse / "hot-potato" muffled voice',
    meaning: "Laryngeal/supraglottic oedema — threatened",
  },
  {
    code: "stridor_inspiratory",
    label: "Stridor (inspiratory)",
    meaning: "Upper-airway obstruction — urgent",
  },
  {
    code: "snoring",
    label: "Snoring",
    meaning: "Tongue/soft-palate obstruction (reduced consciousness)",
  },
  { code: "gurgling", label: "Gurgling", meaning: "Liquid in the airway — needs suction" },
  { code: "crowing", label: "Crowing", meaning: "Laryngeal spasm" },
  {
    code: "silence_with_effort",
    label: "Silence + respiratory effort",
    meaning: "Complete obstruction — immediate",
  },
  { code: "silence_no_effort", label: "Silence + no effort", meaning: "Apnoea / arrest" },
  {
    code: "weakening_cough",
    label: "Cough — weakening",
    meaning: "Progressive obstruction / fatiguing",
  },
];

export const AIRWAY_FEEL: AirwayFinding[] = [
  {
    code: "airflow_absent",
    label: "No airflow at mouth/nose",
    meaning: "Complete obstruction / apnoea",
  },
  {
    code: "airflow_reduced",
    label: "Reduced airflow at mouth/nose",
    meaning: "Partial obstruction",
  },
  {
    code: "tracheal_deviation",
    label: "Tracheal deviation",
    meaning: "Tension pneumothorax / large intrathoracic process (a B finding)",
  },
  {
    code: "surgical_emphysema",
    label: "Surgical emphysema (crepitus)",
    meaning: "Airway/lung injury",
  },
  { code: "asymmetric_chest", label: "Asymmetric chest movement", meaning: "Overlaps B" },
];

/* ─── Difficulty screen (anticipate a difficult airway) ─────────────── */
export interface DifficultyFlag {
  code: string;
  label: string;
  expansion: string;
}
export const AIRWAY_DIFFICULTY: DifficultyFlag[] = [
  {
    code: "lemon",
    label: "LEMON — difficult laryngoscopy/intubation",
    expansion:
      "Look externally · Evaluate 3-3-2 (3 inter-incisor, 3 mentum–hyoid, 2 hyoid–thyroid finger-breadths) · Mallampati 3–4 · Obstruction/Obesity · Neck mobility",
  },
  {
    code: "moans",
    label: "MOANS — difficult bag-mask ventilation",
    expansion:
      "Mask seal · Obese/Obstruction · Aged > 55 · No teeth · Stiff lungs and/or Snoring/OSA",
  },
  {
    code: "rods",
    label: "RODS — difficult supraglottic airway",
    expansion:
      "Restricted mouth opening · Obstruction · Distorted anatomy · Stiff lungs (± cervical spine)",
  },
  {
    code: "physiologically_difficult",
    label: "Physiologically difficult airway",
    expansion:
      "Hypoxaemia · hypotension · metabolic acidosis · haemodynamic compromise → peri-intubation arrest risk; peroxygenate + optimise haemodynamics first (DAS 2025)",
  },
  {
    code: "history_difficult",
    label: "History flags",
    expansion:
      "Previous difficult intubation · neck radiotherapy/surgery · OSA · known airway pathology",
  },
];

/* ─── Classifier code-groups (used by classifyAirway) ───────────────── */
/** Apnoea / no effort → arrest (if pulseless) or ventilation emergency. */
export const AIRWAY_APNOEA_FINDINGS = ["silence_no_effort"] as const;
/**
 * Complete obstruction — silent with effort, no airflow, OR see-saw /
 * paradoxical chest-abdomen movement (a defining sign of complete
 * obstruction; catalog §1.1/§3 — bias to over-triage, never O₂-only).
 */
export const AIRWAY_COMPLETE_FINDINGS = [
  "silence_with_effort",
  "airflow_absent",
  "see_saw",
] as const;
/** Partial obstruction (noisy breathing / reduced airflow / fatiguing). */
export const AIRWAY_PARTIAL_FINDINGS = [
  "stridor_inspiratory",
  "gurgling",
  "snoring",
  "crowing",
  "airflow_reduced",
  "weakening_cough",
] as const;
/** Threatened airway (patent now, but the trajectory/pathology threatens it). */
export const AIRWAY_THREATENED_FINDINGS = [
  "hoarse_muffled_voice",
  "swelling_face",
  "swelling_neck",
  "burns_soot",
  "gcs_le8",
  "drooling_tripod",
  "facial_neck_trauma",
  "central_cyanosis",
  "accessory_muscles",
] as const;

export function airwayFindingLabel(code: string): string {
  const all = [...AIRWAY_LOOK, ...AIRWAY_LISTEN, ...AIRWAY_FEEL];
  return all.find((f) => f.code === code)?.label ?? code;
}

/* ─── Action catalog (GATE C; catalog §2) ───────────────────────────── */
/**
 * Each action is decision-support the clinician performs/confirms — the
 * app records, never acts. `doseId` references a cited constant in
 * doses.ts (no dose duplicated as a string). `escalatesTo` is the action
 * surfaced when this one is recorded `failed` (the DAS A→B→C→D ladder /
 * least-invasive-first escalation). `emergency` actions surface
 * prominently. Advanced (Tier 3) acts are by a skilled operator.
 */
export interface AirwayAction {
  code: string;
  label: string;
  tier: 1 | 2 | 3;
  doseId?: string;
  /** Action surfaced when this one is recorded `failed`. */
  escalatesTo?: string;
  emergency?: boolean;
  source: string;
}

const RCUK = "Resuscitation Council UK — ABCDE/Airway (2025)";
const DAS = "DAS 2025 (Br J Anaesth) — Plan A→B→C→D";

export const AIRWAY_ACTIONS = {
  // Tier 1 — basic / always-available
  a_high_flow_o2: {
    code: "a_high_flow_o2",
    label: "High-flow O₂ 15 L/min (reservoir)",
    tier: 1,
    doseId: "oxygen_critically_ill",
    escalatesTo: "a_call_skilled_help",
    source: `${RCUK} + BTS 2017`,
  },
  a_head_tilt_chin_lift: {
    code: "a_head_tilt_chin_lift",
    label: "Head-tilt / chin-lift",
    tier: 1,
    escalatesTo: "a_opa",
    source: RCUK,
  },
  a_jaw_thrust: {
    code: "a_jaw_thrust",
    label: "Jaw thrust (C-spine-sparing)",
    tier: 1,
    escalatesTo: "a_opa",
    source: `${RCUK} (airway patency takes precedence)`,
  },
  a_suction: {
    code: "a_suction",
    label: "Suction (rigid Yankauer)",
    tier: 1,
    escalatesTo: "a_call_skilled_help",
    source: RCUK,
  },
  a_opa: {
    code: "a_opa",
    label: "Oropharyngeal (Guedel) airway",
    tier: 1,
    escalatesTo: "a_call_skilled_help",
    source: RCUK,
  },
  a_npa: {
    code: "a_npa",
    label: "Nasopharyngeal airway (caution in base-of-skull fracture)",
    tier: 1,
    escalatesTo: "a_call_skilled_help",
    source: RCUK,
  },
  a_recovery_position: {
    code: "a_recovery_position",
    label: "Recovery position",
    tier: 1,
    source: RCUK,
  },
  a_bag_mask_ventilation: {
    code: "a_bag_mask_ventilation",
    label: "Assisted ventilation (bag-mask) + airway adjunct + 15 L O₂",
    tier: 2,
    emergency: true,
    escalatesTo: "a_call_skilled_help",
    source: "ERC 2025 / RCUK ABCDE",
  },
  a_remove_foreign_body: {
    code: "a_remove_foreign_body",
    label: "Remove visible foreign body (suction / Magill under vision)",
    tier: 1,
    escalatesTo: "a_choking_algorithm",
    source: RCUK,
  },
  a_choking_algorithm: {
    code: "a_choking_algorithm",
    label: "Choking: 5 back blows → 5 abdominal thrusts (alternate); CPR if unresponsive",
    tier: 1,
    emergency: true,
    escalatesTo: "a_call_skilled_help",
    source: "RCUK 2025 First Aid (FBAO)",
  },

  // Tier 2 — pharmacological / cause-specific
  a_anaphylaxis_adrenaline: {
    code: "a_anaphylaxis_adrenaline",
    label: "Anaphylaxis → IM adrenaline",
    tier: 2,
    doseId: "anaphylaxis_adrenaline_im",
    emergency: true,
    escalatesTo: "a_call_skilled_help",
    source: "RCUK Anaphylaxis / ERC 2025",
  },
  a_neb_adrenaline_oedema: {
    code: "a_neb_adrenaline_oedema",
    label: "Nebulised adrenaline (upper-airway oedema)",
    tier: 2,
    doseId: "neb_adrenaline_airway_oedema",
    escalatesTo: "a_call_skilled_help",
    source: "Upper-airway-obstruction literature (category-level)",
  },
  a_steroids_oedema: {
    code: "a_steroids_oedema",
    label: "Corticosteroid (inflammatory airway oedema — start early)",
    tier: 2,
    doseId: "airway_oedema_corticosteroid",
    source: "DAS 2025 (structural)",
  },
  a_epiglottitis_pathway: {
    code: "a_epiglottitis_pathway",
    label:
      "Epiglottitis → DO NOT distress/instrument; senior anaesthetic + ENT; controlled airway in theatre",
    tier: 2,
    emergency: true,
    escalatesTo: "a_call_skilled_help",
    source: RCUK,
  },
  a_burns_early_intubation: {
    code: "a_burns_early_intubation",
    label: "Burns/inhalation → early definitive airway before oedema closes it",
    tier: 2,
    emergency: true,
    escalatesTo: "a_call_skilled_help",
    source: RCUK,
  },
  a_laryngospasm_management: {
    code: "a_laryngospasm_management",
    label: "Laryngospasm → O₂ + jaw-thrust/CPAP ± deepen anaesthesia / NMB",
    tier: 2,
    escalatesTo: "a_call_skilled_help",
    source: RCUK,
  },

  // Tier 3 — advanced (skilled operator; DAS 2025 ladder)
  a_call_skilled_help: {
    code: "a_call_skilled_help",
    label: "Call skilled airway operator (anaesthetics/ICU) + prepare advanced airway",
    tier: 3,
    emergency: true,
    escalatesTo: "a_plan_a_intubation",
    source: DAS,
  },
  a_plan_a_intubation: {
    code: "a_plan_a_intubation",
    label: "Plan A — tracheal intubation (videolaryngoscopy; first-pass; 3+1 attempt limit)",
    tier: 3,
    escalatesTo: "a_plan_b_supraglottic",
    source: DAS,
  },
  a_plan_b_supraglottic: {
    code: "a_plan_b_supraglottic",
    label: "Plan B — supraglottic airway device ventilation",
    tier: 3,
    escalatesTo: "a_plan_c_facemask",
    source: DAS,
  },
  a_plan_c_facemask: {
    code: "a_plan_c_facemask",
    label: "Plan C — facemask ventilation",
    tier: 3,
    escalatesTo: "a_plan_d_efona",
    source: DAS,
  },
  a_plan_d_efona: {
    code: "a_plan_d_efona",
    label: "Plan D — CICO → emergency front-of-neck airway (eFONA) without delay",
    tier: 3,
    emergency: true,
    source: DAS,
  },
  a_peroxygenation: {
    code: "a_peroxygenation",
    label: "Peroxygenation + haemodynamic optimisation (physiologically difficult airway)",
    tier: 3,
    source: DAS,
  },
  a_capnography_confirm: {
    code: "a_capnography_confirm",
    label: "Confirm advanced airway with waveform capnography (+ visualise tube — ≥2 variables)",
    tier: 3,
    source: DAS,
  },
} as const satisfies Record<string, AirwayAction>;

export type AirwayActionCode = keyof typeof AIRWAY_ACTIONS;

export function airwayAction(code: string): AirwayAction | null {
  return (AIRWAY_ACTIONS as Record<string, AirwayAction>)[code] ?? null;
}
