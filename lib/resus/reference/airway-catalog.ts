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
/** Apnoea / no effort → arrest pathway. */
export const AIRWAY_APNOEA_FINDINGS = ["silence_no_effort"] as const;
/** Complete obstruction (silent with effort, or no airflow). */
export const AIRWAY_COMPLETE_FINDINGS = ["silence_with_effort", "airflow_absent"] as const;
/** Partial obstruction (noisy breathing / reduced airflow / fatiguing). */
export const AIRWAY_PARTIAL_FINDINGS = [
  "stridor_inspiratory",
  "gurgling",
  "snoring",
  "crowing",
  "airflow_reduced",
  "weakening_cough",
  "see_saw",
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
] as const;

export function airwayFindingLabel(code: string): string {
  const all = [...AIRWAY_LOOK, ...AIRWAY_LISTEN, ...AIRWAY_FEEL];
  return all.find((f) => f.code === code)?.label ?? code;
}
