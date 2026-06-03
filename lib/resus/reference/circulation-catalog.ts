/**
 * Resus CIRCULATION catalog (GATE B: findings) — reference data, not logic.
 *
 * The recordable circulation findings (circulatory-state + LOOK/FEEL/MEASURE),
 * the circulatory-state classifier code-groups, and the shock-type vocabulary,
 * transcribed from the CSO catalog docs/clinical/resus-circulation-clinical-
 * catalog.md §1 (anchors web-verified in docs/resus-circulation-gate-a-
 * proposal.md §A). The action catalog + clusters are added in GATE C.
 *
 * Mirrors the AIRWAY/BREATHING catalog shape. CLINICAL-SAFETY ARTIFACT.
 * Decision-support: the clinician records what they find/do; the app never
 * acts. Findings are codes; the engine (lib/resus/circulation.ts) reasons over
 * them — including the SHOCK-TYPE identification that drives the strategy.
 *
 * MEASURE findings are BANDED codes (e.g. "SBP ≤ 90 / MAP < 65", "shock index
 * > 0.9", "narrow pulse pressure") — not raw numbers; raw vitals live in the
 * continuous-monitoring band. The banded codes carry the load-bearing
 * thresholds + the traps (occult/compensated shock, hypotension-is-late).
 */

export const CIRCULATION_CATALOG_META = {
  verifiedOn: "2026-06-03",
  guidelineCycle: "2025",
  basis:
    "ERC & AHA 2025 (ILCOR 2025 CoSTR) + RCUK ABCDE/Circulation + Surviving Sepsis Campaign 2026 (norepinephrine first-line, MAP ≥ 65; 60–65 if ≥ 65y) + damage-control resuscitation (ATLS 11th ed 2025 xABCDE, whole-blood-first-line per NAEMSP 2025, CRASH-2/PATCH-Trauma, PROPPR; lethal diamond incl. hypocalcaemia; TBI exception MAP ≥ 80) + FEAST trial (paediatric febrile fluid caution).",
} as const;

/* ─── Circulatory state (headline finding AND classification output) ──────
 * well_perfused → compensated_shock → decompensated_shock → peri_arrest →
 * arrest. Worst-finding-wins; a NORMAL BP must NEVER downgrade a shock state
 * (compensated shock keeps BP up). `arrest` (no pulse) routes to the arrest
 * seam, not the circulation engine. */
export const CIRCULATORY_STATES = [
  "well_perfused",
  "compensated_shock",
  "decompensated_shock",
  "peri_arrest",
  "arrest",
] as const;
export type CirculatoryState = (typeof CIRCULATORY_STATES)[number];

export const CIRCULATORY_STATE_LABEL: Record<CirculatoryState, string> = {
  well_perfused: "Well perfused — stable",
  compensated_shock: "Compensated shock (BP still normal — pre-collapse)",
  decompensated_shock: "Decompensated shock (hypotensive)",
  peri_arrest: "Peri-arrest / haemodynamic collapse",
  arrest: "Cardiac arrest (no pulse)",
};

/* ─── Shock type (the C-specific second axis — drives the strategy) ──────── */
export const SHOCK_TYPES = [
  "hypovolaemic_haemorrhagic",
  "hypovolaemic_nonhaemorrhagic",
  "distributive_septic",
  "distributive_anaphylactic",
  "distributive_neurogenic",
  "cardiogenic",
  "obstructive_tamponade",
  "obstructive_pe",
  "obstructive_tension",
  "undifferentiated",
] as const;
export type ShockType = (typeof SHOCK_TYPES)[number];

export const SHOCK_TYPE_LABEL: Record<ShockType, string> = {
  hypovolaemic_haemorrhagic: "Hypovolaemic — haemorrhagic",
  hypovolaemic_nonhaemorrhagic: "Hypovolaemic — non-haemorrhagic",
  distributive_septic: "Distributive — septic",
  distributive_anaphylactic: "Distributive — anaphylaxis",
  distributive_neurogenic: "Distributive — neurogenic",
  cardiogenic: "Cardiogenic",
  obstructive_tamponade: "Obstructive — cardiac tamponade",
  obstructive_pe: "Obstructive — massive PE",
  obstructive_tension: "Obstructive — tension pneumothorax",
  undifferentiated: "Undifferentiated shock",
};

/** The matched strategy headline per shock type (decision-support summary). */
export const SHOCK_TYPE_STRATEGY: Record<ShockType, string> = {
  hypovolaemic_haemorrhagic:
    "STOP the bleeding + blood/MHP + TXA + permissive hypotension (except TBI); minimise crystalloid",
  hypovolaemic_nonhaemorrhagic: "Balanced crystalloid boluses; reassess perfusion after each",
  distributive_septic:
    "Sepsis bundle (cultures + early antibiotics + 30 mL/kg) + noradrenaline to MAP ≥ 65 if refractory",
  distributive_anaphylactic: "IM adrenaline FIRST + O₂ + IV fluids + remove trigger",
  distributive_neurogenic: "Fluids + vasopressors + atropine for bradycardia; C-spine care",
  cardiogenic:
    "CAUTION with fluids (can worsen oedema); treat the cause (STEMI → PCI), inotrope ± vasopressor; cardiology",
  obstructive_tamponade: "Relieve the obstruction — pericardiocentesis; fluids won't fix it",
  obstructive_pe: "Massive PE — consider thrombolysis; judicious fluids (over-filling worsens RV)",
  obstructive_tension: "Tension pneumothorax — immediate needle/finger decompression (with B)",
  undifferentiated:
    "Use bedside ultrasound + the picture to find the type; treat reversible causes early",
};

export interface CirculationFinding {
  code: string;
  label: string;
  meaning: string;
}

/* ─── LOOK ───────────────────────────────────────────────────────────── */
export const CIRCULATION_LOOK: CirculationFinding[] = [
  { code: "pallor", label: "Pallor", meaning: "Poor perfusion / anaemia / blood loss" },
  {
    code: "mottling",
    label: "Mottled skin (knees/peripheries)",
    meaning: "Poor peripheral perfusion",
  },
  {
    code: "sweating_clammy",
    label: "Sweating / clammy",
    meaning: "Sympathetic drive — shock",
  },
  {
    code: "flushing_warm",
    label: "Flushed / warm skin",
    meaning: "Distributive (anaphylaxis / early 'warm' sepsis / neurogenic)",
  },
  {
    code: "altered_consciousness",
    label: "Altered consciousness / agitation",
    meaning: "Cerebral hypoperfusion — significant shock",
  },
  {
    code: "external_haemorrhage",
    label: "Obvious external haemorrhage / 'blood on the floor'",
    meaning: "Haemorrhagic shock — control immediately",
  },
  {
    code: "abdominal_distension",
    label: "Abdominal distension",
    meaning: "Intra-abdominal bleed / AAA",
  },
  {
    code: "pelvic_instability",
    label: "Pelvic instability / deformity",
    meaning: "Pelvic haemorrhage (apply a binder; don't spring repeatedly)",
  },
  {
    code: "long_bone_deformity",
    label: "Long-bone (e.g. femoral) deformity",
    meaning: "Significant concealed blood loss",
  },
  {
    code: "raised_jvp",
    label: "Raised JVP / distended neck veins",
    meaning: "Obstructive (tamponade / tension / PE) or cardiogenic — fluids may HARM",
  },
  {
    code: "flat_jvp",
    label: "Flat / empty neck veins",
    meaning: "Hypovolaemia",
  },
  {
    code: "oliguria",
    label: "Oliguria (urine < 0.5 mL/kg/h)",
    meaning: "Renal hypoperfusion marker",
  },
  {
    code: "urticaria_angioedema",
    label: "Urticaria / angioedema",
    meaning: "Anaphylaxis (distributive)",
  },
  { code: "fever_rash", label: "Fever / rash", meaning: "Sepsis (distributive)" },
];

/* ─── FEEL ───────────────────────────────────────────────────────────── */
export const CIRCULATION_FEEL: CirculationFinding[] = [
  {
    code: "tachycardia",
    label: "Tachycardia (HR > 100)",
    meaning: "Compensation — an early shock sign",
  },
  {
    code: "bradycardia",
    label: "Bradycardia (HR < 60)",
    meaning: "Pre-terminal in shock, or neurogenic / cardiac",
  },
  {
    code: "irregular_pulse",
    label: "Irregular pulse (AF / arrhythmia)",
    meaning: "Arrhythmia — possible cardiogenic cause",
  },
  {
    code: "thready_pulse",
    label: "Thready / weak pulse",
    meaning: "Low cardiac output",
  },
  {
    code: "bounding_pulse",
    label: "Bounding pulse",
    meaning: "Distributive (early sepsis / anaphylaxis)",
  },
  {
    code: "weak_absent_radial",
    label: "Weak / absent radial (carotid present)",
    meaning: "Significant hypotension — peripheral pulses lost first",
  },
  {
    code: "absent_peripheral_pulses",
    label: "Barely-palpable / absent peripheral pulses",
    meaning: "Haemodynamic collapse — peri-arrest",
  },
  {
    code: "cap_refill_delayed",
    label: "Cap refill > 2 s",
    meaning: "Reduced peripheral perfusion",
  },
  {
    code: "cap_refill_poor",
    label: "Cap refill > 3–4 s",
    meaning: "Poor perfusion — shock",
  },
  {
    code: "cold_peripheries",
    label: "Cold peripheries (warm core)",
    meaning: "Vasoconstriction — hypovolaemic / cardiogenic",
  },
  {
    code: "warm_peripheries",
    label: "Warm peripheries",
    meaning: "Distributive (sepsis / anaphylaxis / neurogenic)",
  },
  {
    code: "peritonism",
    label: "Peritonism / rigid abdomen",
    meaning: "Intra-abdominal catastrophe / bleed",
  },
  {
    code: "pulsatile_mass",
    label: "Pulsatile abdominal mass",
    meaning: "AAA — haemorrhagic",
  },
  {
    code: "muffled_heart_sounds",
    label: "Muffled heart sounds",
    meaning: "Cardiac tamponade (Beck's triad with ↓BP + raised JVP)",
  },
  {
    code: "tracheal_deviation",
    label: "Tracheal deviation (away)",
    meaning: "Tension pneumothorax (obstructive) — relieve, don't flood (cross-refs B)",
  },
  {
    code: "unilateral_absent_breath_sounds",
    label: "Unilateral absent breath sounds + hyper-resonance",
    meaning: "Tension pneumothorax (obstructive) — immediate decompression",
  },
];

/* ─── MEASURE (banded codes; raw numbers live in the vitals band) ────── */
export const CIRCULATION_MEASURE: CirculationFinding[] = [
  {
    code: "hypotension",
    label: "SBP ≤ 90 or MAP < 65",
    meaning: "Decompensated shock — a LATE sign; large volume already lost",
  },
  {
    code: "shock_index_high",
    label: "Shock index > 0.9",
    meaning: "OCCULT shock — present even with a normal BP",
  },
  {
    code: "shock_index_severe",
    label: "Shock index ≥ 1.0",
    meaning: "Strong shock flag",
  },
  {
    code: "narrow_pulse_pressure",
    label: "Narrow pulse pressure (< 25% of SBP)",
    meaning: "Low stroke volume — hypovolaemia (an early sign)",
  },
  {
    code: "wide_pulse_pressure",
    label: "Wide pulse pressure",
    meaning: "Distributive (sepsis / AR)",
  },
  { code: "lactate_raised", label: "Lactate > 2 mmol/L", meaning: "Hypoperfusion" },
  {
    code: "lactate_severe",
    label: "Lactate > 4 mmol/L",
    meaning: "Severe shock — sepsis/shock severity",
  },
  {
    code: "ecg_ischaemia",
    label: "ECG ischaemia / STEMI",
    meaning: "Cardiogenic cause — activate reperfusion",
  },
  {
    code: "ecg_arrhythmia",
    label: "ECG arrhythmia",
    meaning: "Peri-arrest arrhythmia — possible cardiogenic",
  },
  {
    code: "ecg_pe",
    label: "ECG RV strain / S1Q3T3",
    meaning: "Massive PE (obstructive)",
  },
  {
    code: "ecg_tamponade",
    label: "ECG low voltages / electrical alternans",
    meaning: "Cardiac tamponade (obstructive)",
  },
  {
    code: "bhcg_positive",
    label: "β-hCG positive (reproductive-age woman)",
    meaning: "Ectopic until excluded — shock + abdo pain is surgical",
  },
  {
    code: "us_free_fluid",
    label: "US: free fluid (FAST+)",
    meaning: "Haemorrhage — intra-abdominal / intrathoracic",
  },
  {
    code: "us_tamponade",
    label: "US: pericardial effusion / tamponade",
    meaning: "Obstructive — pericardiocentesis",
  },
  { code: "us_rv_strain", label: "US: dilated RV / strain", meaning: "Massive PE (obstructive)" },
  {
    code: "us_poor_filling",
    label: "US: empty / collapsing IVC, hyperdynamic LV",
    meaning: "Volume-responsive (hypovolaemia)",
  },
];

/* ─── Circulatory-state classifier code-groups (worst wins) ────────────── */
/** No pulse → arrest (the only state that routes to CPR/ALS). */
export const CIRCULATION_ARREST_FINDINGS = ["no_pulse"] as const;
/** Peri-arrest / haemodynamic collapse. */
export const CIRCULATION_PERI_ARREST_FINDINGS = ["absent_peripheral_pulses"] as const;
/** Decompensated shock — hypotension present (or a severe marker). */
export const CIRCULATION_DECOMPENSATED_FINDINGS = [
  "hypotension",
  "weak_absent_radial",
  "shock_index_severe",
  "lactate_severe",
] as const;
/**
 * Compensated shock — shock signs with the BP STILL NORMAL. A normal BP must
 * never downgrade these (the occult/compensated-shock trap).
 */
export const CIRCULATION_COMPENSATED_FINDINGS = [
  "tachycardia",
  "narrow_pulse_pressure",
  "shock_index_high",
  "cap_refill_delayed",
  "cap_refill_poor",
  "cold_peripheries",
  "mottling",
  "pallor",
  "sweating_clammy",
  "thready_pulse",
  "oliguria",
  "lactate_raised",
  "altered_consciousness",
  // Distributive / brady shock signs — must be caught even with a NORMAL BP
  // (the warm/brady picture compensates then crashes; adversarial must-fix #4).
  "bradycardia",
  "warm_peripheries",
  "bounding_pulse",
  "wide_pulse_pressure",
  "flushing_warm",
  // Obstructive / cardiogenic cardinal signs — a recorded tamponade/tension/PE
  // sign must NEVER read as "not assessed" even before a severity number is in
  // (adversarial must-fix NEW-2). The shock type then drives the relief action.
  "raised_jvp",
  "muffled_heart_sounds",
  "tracheal_deviation",
  "unilateral_absent_breath_sounds",
  "us_tamponade",
  "us_rv_strain",
  "ecg_pe",
  "ecg_tamponade",
  "ecg_ischaemia",
] as const;

export function circulationFindingLabel(code: string): string {
  const all = [...CIRCULATION_LOOK, ...CIRCULATION_FEEL, ...CIRCULATION_MEASURE];
  return all.find((f) => f.code === code)?.label ?? code;
}

/* ─── Action catalog (GATE C; catalog §2) ───────────────────────────── */
/**
 * Each action is decision-support the clinician performs/confirms — the app
 * records, never acts. DRUG actions whose `code` is a key in the prescribing
 * tool's RECOMMENDATION_DRUG_MAP open the pre-filled, dose-verified prescribe
 * dialog (TXA / noradrenaline / antibiotics / adrenaline / crystalloid / blood)
 * — doses are NOT duplicated here. `escalatesTo` is surfaced when an action is
 * recorded `failed`; `emergency` actions surface prominently. Procedures
 * (decompression, pericardiocentesis, central line) are by a skilled operator —
 * the app records + prompts escalation. Mirrors the airway/breathing shape.
 */
export interface CirculationAction {
  code: string;
  label: string;
  tier: 1 | 2 | 3;
  escalatesTo?: string;
  emergency?: boolean;
  source: string;
}

const RCUK = "Resuscitation Council UK — ABCDE/Circulation (2025)";
const DCR =
  "Damage-control resuscitation (ATLS 11th ed 2025; PROPPR; European trauma guideline 6th ed)";
const SSC = "Surviving Sepsis Campaign 2026";

export const CIRCULATION_ACTIONS = {
  // Tier 1 — basic / always-available
  c_iv_access: {
    code: "c_iv_access",
    label: "IV access ×2 large-bore (14–16G); IO if access fails",
    tier: 1,
    escalatesTo: "c_central_arterial_access",
    source: RCUK,
  },
  c_bloods: {
    code: "c_bloods",
    label: "Bloods at cannulation (FBC/U&E/lactate/coag/cultures + group & save / crossmatch)",
    tier: 1,
    source: RCUK,
  },
  c_monitoring: {
    code: "c_monitoring",
    label: "Continuous monitoring (ECG · BP · SpO₂)",
    tier: 1,
    source: RCUK,
  },
  c_catheter: {
    code: "c_catheter",
    label: "Urinary catheter (urine output)",
    tier: 1,
    source: RCUK,
  },
  c_ecg_12lead: { code: "c_ecg_12lead", label: "12-lead ECG", tier: 1, source: RCUK },
  c_position: {
    code: "c_position",
    label: "Position by type (flat / legs up — sit up if pulmonary oedema)",
    tier: 1,
    source: RCUK,
  },
  c_high_flow_o2: {
    code: "c_high_flow_o2",
    label: "High-flow O₂ (shock increases O₂ demand — coordinate with B)",
    tier: 1,
    source: RCUK,
  },
  c_haemorrhage_control: {
    code: "c_haemorrhage_control",
    label: "Control external haemorrhage — direct pressure / tourniquet / pelvic binder / packing",
    tier: 1,
    emergency: true,
    escalatesTo: "c_blood_mhp",
    source: DCR,
  },

  // Tier 2 — type-specific (drug actions route through the prescribing tool)
  c_crystalloid_bolus: {
    code: "c_crystalloid_bolus",
    label:
      "Balanced crystalloid bolus → prescribe; reassess after each (NOT for cardiogenic/obstructive/haemorrhagic floods)",
    tier: 2,
    escalatesTo: "c_noradrenaline",
    source: `${RCUK} / ${SSC}`,
  },
  c_stop_bleeding: {
    code: "c_stop_bleeding",
    label: "STOP the bleeding + permissive hypotension (SBP 80–90; NOT in TBI → MAP ≥ 80)",
    tier: 2,
    emergency: true,
    escalatesTo: "c_definitive_haemorrhage_control",
    source: DCR,
  },
  c_blood_mhp: {
    code: "c_blood_mhp",
    label:
      "Blood / Major Haemorrhage Protocol → prescribe (whole blood first-line; minimise crystalloid; watch iCa²⁺/temp)",
    tier: 2,
    emergency: true,
    escalatesTo: "c_definitive_haemorrhage_control",
    source: DCR,
  },
  c_txa: {
    code: "c_txa",
    label: "Tranexamic acid → prescribe (early, within 3 h of injury)",
    tier: 2,
    emergency: true,
    source: "CRASH-2; PATCH-Trauma 2023",
  },
  c_sepsis_antibiotics: {
    code: "c_sepsis_antibiotics",
    label: "Sepsis bundle → early broad-spectrum antibiotics → prescribe (+ cultures, lactate)",
    tier: 2,
    emergency: true,
    source: SSC,
  },
  c_noradrenaline: {
    code: "c_noradrenaline",
    label:
      "Noradrenaline → prescribe (first-line vasopressor; target MAP ≥ 65 — peripheral OK, don't delay)",
    tier: 2,
    escalatesTo: "c_vasopressin",
    source: SSC,
  },
  c_anaphylaxis_adrenaline: {
    code: "c_anaphylaxis_adrenaline",
    label: "Anaphylaxis → IM adrenaline FIRST → prescribe",
    tier: 2,
    emergency: true,
    escalatesTo: "c_call_skilled_help",
    source: "RCUK Anaphylaxis (2021, current)",
  },
  c_atropine: {
    code: "c_atropine",
    label: "Atropine → prescribe (neurogenic / symptomatic bradycardia)",
    tier: 2,
    source: RCUK,
  },
  c_inotrope: {
    code: "c_inotrope",
    label: "Inotrope (dobutamine) → prescribe (cardiogenic low-output) — caution with fluids",
    tier: 2,
    escalatesTo: "c_call_skilled_help",
    source: "ESC cardiogenic-shock guidance",
  },
  c_hydrocortisone: {
    code: "c_hydrocortisone",
    label: "Hydrocortisone → prescribe (refractory septic shock / adrenal crisis)",
    tier: 2,
    source: SSC,
  },
  c_pci_activate: {
    code: "c_pci_activate",
    label: "STEMI → activate PCI / reperfusion (cardiology)",
    tier: 2,
    emergency: true,
    escalatesTo: "c_call_skilled_help",
    source: "ESC / AHA 2025",
  },
  c_decompress: {
    code: "c_decompress",
    label: "Tension pneumothorax → immediate needle/finger decompression (with B)",
    tier: 2,
    emergency: true,
    escalatesTo: "c_call_skilled_help",
    source: "ATLS 11th ed",
  },

  // Tier 3 — advanced / skilled operator
  c_central_arterial_access: {
    code: "c_central_arterial_access",
    label: "Central venous + arterial access (don't delay peripheral pressors for it)",
    tier: 3,
    source: SSC,
  },
  c_vasopressin: {
    code: "c_vasopressin",
    label: "Vasopressin → prescribe (add-on in refractory septic shock)",
    tier: 3,
    escalatesTo: "c_call_skilled_help",
    source: SSC,
  },
  c_pericardiocentesis: {
    code: "c_pericardiocentesis",
    label: "Cardiac tamponade → pericardiocentesis (skilled operator)",
    tier: 3,
    emergency: true,
    escalatesTo: "c_call_skilled_help",
    source: RCUK,
  },
  c_thrombolysis: {
    code: "c_thrombolysis",
    label: "Massive PE → consider thrombolysis / embolectomy (senior)",
    tier: 3,
    emergency: true,
    escalatesTo: "c_call_skilled_help",
    source: "ESC / RCUK (peri-arrest PE)",
  },
  c_definitive_haemorrhage_control: {
    code: "c_definitive_haemorrhage_control",
    label: "Definitive haemorrhage control (theatre / IR / endoscopy)",
    tier: 3,
    emergency: true,
    source: DCR,
  },
  c_call_skilled_help: {
    code: "c_call_skilled_help",
    label: "Call senior / surgery / cardiology / ICU / obstetrics",
    tier: 3,
    emergency: true,
    source: RCUK,
  },
} as const satisfies Record<string, CirculationAction>;

export type CirculationActionCode = keyof typeof CIRCULATION_ACTIONS;

export function circulationAction(code: string): CirculationAction | null {
  return (CIRCULATION_ACTIONS as Record<string, CirculationAction>)[code] ?? null;
}
