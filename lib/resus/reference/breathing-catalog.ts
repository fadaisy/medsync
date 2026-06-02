/**
 * Resus BREATHING catalog (GATE B: findings) — reference data, not logic.
 *
 * The recordable breathing findings (breathing-state + LOOK/LISTEN/FEEL &
 * PERCUSS + MEASURE) and the classifier code-groups, transcribed from the
 * CSO catalog docs/clinical/resus-breathing-clinical-catalog.md §1 (web-
 * verified anchors in docs/resus-breathing-gate-a-proposal.md §A). The
 * action catalog + combination clusters are added in GATE C (same file).
 *
 * Mirrors the AIRWAY catalog shape. CLINICAL-SAFETY ARTIFACT. Decision-
 * support: the clinician records what they find/do; the app never acts.
 * Findings are codes; the engine (lib/resus/breathing.ts) reasons over them.
 *
 * MEASURE findings are BANDED codes (e.g. "RR ≥ 30", "SpO₂ < 92%",
 * "rising/normalising CO₂") — not raw numbers. Raw vitals live in the
 * continuous-monitoring band; the banded codes are the clinically load-
 * bearing thresholds + the pre-arrest traps.
 */

export const BREATHING_CATALOG_META = {
  verifiedOn: "2026-06-02",
  guidelineCycle: "2025",
  basis:
    "ERC & AHA 2025 (ILCOR 2025 CoSTR) + Resuscitation Council UK ABCDE/Breathing + BTS/SIGN 158 (2019) acute asthma + GINA 2025 + NICE CG187 (2014) acute heart failure + BTS/ICS 2016 (NIV) + ATLS/ETC (tension pneumothorax) + Surviving Sepsis 2021.",
} as const;

/* ─── Breathing-state (the headline finding AND the classification output) ─
 * Unlike airway (patency ≠ state), breathing's headline read shares the
 * five-level severity vocabulary with the engine output. The clinician's
 * gestalt is recorded; the engine upgrades it if a danger code is present
 * (worst-finding-wins). `apnoeic` + no-signs-of-life routes to arrest. */
export const BREATHING_STATES = [
  "adequate",
  "distress_compensating",
  "failure_decompensating",
  "peri_arrest",
  "apnoeic",
] as const;
export type BreathingState = (typeof BREATHING_STATES)[number];

export const BREATHING_STATE_LABEL: Record<BreathingState, string> = {
  adequate: "Adequate — breathing normally",
  distress_compensating: "Respiratory distress — compensating",
  failure_decompensating: "Respiratory failure — decompensating",
  peri_arrest: "Peri-arrest / inadequate effort",
  apnoeic: "Apnoeic / not breathing normally",
};

export interface BreathingFinding {
  code: string;
  label: string;
  meaning: string;
}

/* ─── LOOK ───────────────────────────────────────────────────────────── */
export const BREATHING_LOOK: BreathingFinding[] = [
  {
    code: "rr_raised",
    label: "RR ≥ 25 (raised)",
    meaning: "Tachypnoea — significant distress band (RR is the most sensitive early sign)",
  },
  {
    code: "rr_very_high",
    label: "RR ≥ 30 (very high)",
    meaning: "Severe distress / life-threatening band",
  },
  {
    code: "rr_low_falling",
    label: "RR ≤ 8 or falling",
    meaning: "Depression / exhaustion → PERI-ARREST (a tiring patient, not improving)",
  },
  {
    code: "accessory_muscles",
    label: "Accessory muscles / recession / tracheal tug",
    meaning: "Increased work of breathing",
  },
  {
    code: "cant_complete_sentences",
    label: "Can't complete sentences in one breath",
    meaning: "Severe — acute severe asthma / significant distress",
  },
  { code: "tripod", label: "Tripod position", meaning: "Maximising work of breathing — distress" },
  {
    code: "asymmetric_expansion",
    label: "Asymmetric / reduced chest expansion (unilateral)",
    meaning: "Pneumothorax, effusion/haemothorax, consolidation, collapse",
  },
  {
    code: "flail_segment",
    label: "Paradoxical / flail segment (trauma)",
    meaning: "Flail chest — ventilatory failure",
  },
  {
    code: "central_cyanosis",
    label: "Central cyanosis (lips/tongue)",
    meaning: "Severe hypoxaemia — a LATE sign; don't wait for it",
  },
  {
    code: "exhaustion_drowsy",
    label: "Exhaustion / agitation → drowsiness",
    meaning: "Tiring / hypercapnia → PERI-ARREST (ominous, not 'settling')",
  },
  {
    code: "open_chest_wound",
    label: 'Open ("sucking") chest wound',
    meaning: "Open pneumothorax (trauma)",
  },
  {
    code: "chest_bruising",
    label: "Chest-wall bruising / deformity",
    meaning: "Chest trauma — pneumothorax / haemothorax / flail risk",
  },
  {
    code: "raised_jvp",
    label: "Raised JVP / distended neck veins",
    meaning: "Tension pneumothorax, tamponade, right-heart strain (PE), heart failure",
  },
  {
    code: "spo2_device",
    label: "On O₂ already (device/flow recorded)",
    meaning: "Interpret SpO₂ against delivered oxygen — note device + flow",
  },
];

/* ─── LISTEN ─────────────────────────────────────────────────────────── */
export const BREATHING_LISTEN: BreathingFinding[] = [
  {
    code: "full_sentences",
    label: "Speaking full sentences",
    meaning: "Reassuring — adequate ventilation for now",
  },
  {
    code: "wheeze",
    label: "Wheeze (expiratory, polyphonic)",
    meaning: "Bronchospasm — asthma, COPD, anaphylaxis",
  },
  {
    code: "silent_chest",
    label: "Silent chest",
    meaning:
      "LIFE-THREATENING — too little air movement to wheeze → peri-arrest (worse than wheeze)",
  },
  {
    code: "crackles",
    label: "Crackles / crepitations",
    meaning: "Pulmonary oedema (basal, fine) or pneumonia (coarse, localised)",
  },
  {
    code: "reduced_breath_sounds",
    label: "Reduced / absent breath sounds (unilateral)",
    meaning: "Pneumothorax, large effusion/haemothorax, collapse, consolidation",
  },
  {
    code: "bronchial_breathing",
    label: "Bronchial breathing",
    meaning: "Consolidation (pneumonia)",
  },
  {
    code: "stridor",
    label: "Stridor",
    meaning: "Upper-airway obstruction — an A finding; return to A",
  },
  {
    code: "gurgling",
    label: "Gurgling",
    meaning: "Secretions / aspiration — an A finding; return to A (suction)",
  },
  {
    code: "apnoea_agonal",
    label: "Apnoeic / agonal / not breathing normally",
    meaning: "→ assess for cardiac arrest + start ventilation/CPR",
  },
];

/* ─── FEEL & PERCUSS ─────────────────────────────────────────────────── */
export const BREATHING_FEEL: BreathingFinding[] = [
  {
    code: "trachea_deviated_away",
    label: "Trachea deviated AWAY from the affected side",
    meaning: "Tension pneumothorax — a LATE / unreliable sign; don't wait for it",
  },
  {
    code: "trachea_deviated_toward",
    label: "Trachea deviated TOWARD the affected side",
    meaning: "Collapse / volume loss",
  },
  {
    code: "hyper_resonant",
    label: "Hyper-resonant percussion",
    meaning: "Air — pneumothorax",
  },
  {
    code: "stony_dull",
    label: "Stony-dull percussion",
    meaning: "Fluid / blood — pleural effusion / haemothorax",
  },
  {
    code: "dull",
    label: "Dull percussion",
    meaning: "Consolidation / collapse",
  },
  {
    code: "surgical_emphysema",
    label: "Surgical emphysema (crepitus under skin)",
    meaning: "Airway / lung injury — pneumothorax association",
  },
  {
    code: "chest_wall_crepitus",
    label: "Chest-wall tenderness / bony crepitus",
    meaning: "Rib fractures / flail (trauma)",
  },
];

/* ─── MEASURE (banded codes; raw numbers live in the vitals band) ────── */
export const BREATHING_MEASURE: BreathingFinding[] = [
  {
    code: "spo2_lt94",
    label: "SpO₂ < 94% (below target on air)",
    meaning: "Hypoxaemia — below the 94–98% target",
  },
  {
    code: "spo2_lt92",
    label: "SpO₂ < 92%",
    meaning: "Life-threatening band (acute asthma) / severe hypoxaemia",
  },
  {
    code: "paco2_rising_normalising",
    label: "Rising / normalising PaCO₂ in acute asthma",
    meaning:
      "PRE-ARREST TRAP — a tiring asthmatic stops hyperventilating, so a low CO₂ climbs to normal then high → impending respiratory arrest. Escalate, do NOT relax.",
  },
  {
    code: "pao2_lt8",
    label: "PaO₂ < 8 kPa (60 mmHg)",
    meaning: "Severe hypoxaemia — type 1 respiratory failure",
  },
  {
    code: "resp_acidosis",
    label: "Respiratory acidosis (pH < 7.35, ↑PaCO₂)",
    meaning: "Type 2 respiratory failure — NIV threshold in COPD (pH < 7.35 + PaCO₂ > 6.5 kPa)",
  },
  {
    code: "pef_33_50",
    label: "PEF 33–50% best/predicted",
    meaning: "Acute severe asthma",
  },
  {
    code: "pef_lt33",
    label: "PEF < 33% best/predicted",
    meaning: "Life-threatening asthma",
  },
  {
    code: "etco2_rising_falling_rr",
    label: "Rising EtCO₂ with falling RR",
    meaning: "PRE-ARREST TRAP — ventilatory fatigue; the patient is tiring",
  },
  {
    code: "raised_lactate",
    label: "Raised lactate",
    meaning: "Hypoperfusion / severe illness (sepsis) — escalate",
  },
];

/* ─── Classifier code-groups (used by classifyBreathing; worst wins) ──── */
/** Apnoea / agonal → apnoeic (arrest if pulseless). */
export const BREATHING_APNOEA_FINDINGS = ["apnoea_agonal"] as const;
/**
 * PERI-ARREST — the pre-arrest traps + inadequate effort. These must
 * classify as critical and NEVER read as improvement (catalog §0 / §A.7):
 * silent chest, falling RR, exhaustion/drowsiness, normalising/rising
 * PaCO₂, rising EtCO₂ with falling RR.
 */
export const BREATHING_PERI_ARREST_FINDINGS = [
  "silent_chest",
  "rr_low_falling",
  "exhaustion_drowsy",
  "paco2_rising_normalising",
  "etco2_rising_falling_rr",
] as const;
/**
 * Respiratory failure — decompensating (inadequate oxygenation/ventilation).
 * `cant_complete_sentences` lives here, not in distress: inability to finish a
 * sentence in one breath is an acute-SEVERE marker (BTS/SIGN 158), so the
 * headline state must not under-state it (GATE-E adversarial fix).
 */
export const BREATHING_FAILURE_FINDINGS = [
  "central_cyanosis",
  "spo2_lt92",
  "pao2_lt8",
  "resp_acidosis",
  "pef_lt33",
  "cant_complete_sentences",
  "flail_segment",
  "open_chest_wound",
  "reduced_breath_sounds",
  "hyper_resonant",
  "stony_dull",
  "trachea_deviated_away",
] as const;
/** Respiratory distress — compensating (increased work maintaining sats). */
export const BREATHING_DISTRESS_FINDINGS = [
  "rr_raised",
  "rr_very_high",
  "accessory_muscles",
  "tripod",
  "asymmetric_expansion",
  "wheeze",
  "crackles",
  "bronchial_breathing",
  "dull",
  "spo2_lt94",
  "pef_33_50",
  "raised_jvp",
  "stridor",
] as const;

export function breathingFindingLabel(code: string): string {
  const all = [...BREATHING_LOOK, ...BREATHING_LISTEN, ...BREATHING_FEEL, ...BREATHING_MEASURE];
  return all.find((f) => f.code === code)?.label ?? code;
}

/* ─── Action catalog (GATE C; catalog §2) ───────────────────────────── */
/**
 * Each action is decision-support the clinician performs/confirms — the app
 * records, never acts. `doseId` references a cited constant in doses.ts (no
 * dose duplicated as a string). `escalatesTo` is the action surfaced when
 * this one is recorded `failed` (least-invasive-first / intensification
 * ladder). `emergency` actions surface prominently. Procedures (Tier 3,
 * and decompression/drains) are performed by a skilled operator — the app
 * records side/approach/confirmation/complications + prompts escalation.
 *
 * Mirrors the AIRWAY action catalog shape.
 */
export interface BreathingAction {
  code: string;
  label: string;
  tier: 1 | 2 | 3;
  doseId?: string;
  /** Action surfaced when this one is recorded `failed`. */
  escalatesTo?: string;
  emergency?: boolean;
  source: string;
}

const RCUK = "Resuscitation Council UK — ABCDE/Breathing (2025)";
const BTS_ASTHMA = "BTS/SIGN 158 (2019) acute asthma + GINA 2025";
const ATLS = "ATLS 10th ed / ETC (tension pneumothorax — clinical diagnosis)";

export const BREATHING_ACTIONS = {
  // Tier 1 — basic / always-available
  b_high_flow_o2: {
    code: "b_high_flow_o2",
    label: "High-flow O₂ 15 L/min (reservoir)",
    tier: 1,
    doseId: "oxygen_critically_ill",
    escalatesTo: "b_call_skilled_help",
    source: `${RCUK} + BTS 2017`,
  },
  b_sit_upright: {
    code: "b_sit_upright",
    label: "Sit upright (if tolerated; not in trauma/hypotension)",
    tier: 1,
    source: RCUK,
  },
  b_continuous_monitoring: {
    code: "b_continuous_monitoring",
    label: "Attach continuous monitoring (SpO₂ · ECG · RR · capnography)",
    tier: 1,
    source: RCUK,
  },
  b_bag_mask_ventilation: {
    code: "b_bag_mask_ventilation",
    label: "Assisted ventilation (bag-mask, two-person) + adjunct + 15 L O₂",
    tier: 1,
    emergency: true,
    escalatesTo: "b_call_skilled_help",
    source: "ERC 2025 / RCUK ABCDE",
  },

  // Tier 2 — cause-specific
  b_tension_decompression: {
    code: "b_tension_decompression",
    label: "Tension pneumothorax → immediate needle/finger thoracostomy (before PPV)",
    tier: 2,
    emergency: true,
    escalatesTo: "b_chest_drain",
    source: ATLS,
  },
  b_chest_seal: {
    code: "b_chest_seal",
    label: "Open chest wound → vented chest seal / three-sided dressing",
    tier: 2,
    escalatesTo: "b_chest_drain",
    source: ATLS,
  },
  b_haemothorax_drain: {
    code: "b_haemothorax_drain",
    label: "Massive haemothorax → large-bore chest drain + major-haemorrhage + surgery",
    tier: 2,
    emergency: true,
    escalatesTo: "b_call_skilled_help",
    source: ATLS,
  },
  b_salbutamol_neb: {
    code: "b_salbutamol_neb",
    label: "Nebulised salbutamol (O₂-driven)",
    tier: 2,
    doseId: "asthma_salbutamol_neb",
    escalatesTo: "b_magnesium_iv",
    source: BTS_ASTHMA,
  },
  b_ipratropium_neb: {
    code: "b_ipratropium_neb",
    label: "Nebulised ipratropium bromide (add-on)",
    tier: 2,
    doseId: "asthma_ipratropium_neb",
    escalatesTo: "b_magnesium_iv",
    source: BTS_ASTHMA,
  },
  b_asthma_steroid: {
    code: "b_asthma_steroid",
    label: "Systemic corticosteroid (give early)",
    tier: 2,
    doseId: "asthma_steroid",
    source: BTS_ASTHMA,
  },
  b_magnesium_iv: {
    code: "b_magnesium_iv",
    label: "IV magnesium sulphate (life-threatening asthma) + senior/ICU",
    tier: 2,
    doseId: "asthma_magnesium_iv",
    emergency: true,
    escalatesTo: "b_call_skilled_help",
    source: BTS_ASTHMA,
  },
  b_copd_controlled_o2: {
    code: "b_copd_controlled_o2",
    label: "COPD → controlled O₂ (88–92%) + nebs + steroid ± antibiotics",
    tier: 2,
    doseId: "oxygen_critically_ill",
    escalatesTo: "b_niv",
    source: "BTS/ICS 2016 (NIV) + GOLD",
  },
  b_pulmonary_oedema: {
    code: "b_pulmonary_oedema",
    label: "Acute pulmonary oedema → sit up + O₂ ± GTN / furosemide / CPAP; treat cause",
    tier: 2,
    escalatesTo: "b_niv",
    source: "NICE CG187 (2014) acute heart failure",
  },
  b_sepsis_bundle: {
    code: "b_sepsis_bundle",
    label:
      "Severe pneumonia / sepsis → O₂ + sepsis bundle (cultures, antibiotics, fluids, lactate)",
    tier: 2,
    doseId: "sepsis_crystalloid",
    escalatesTo: "b_call_skilled_help",
    source: "Surviving Sepsis Campaign 2021",
  },
  b_pe_support: {
    code: "b_pe_support",
    label: "PE (high-risk) → O₂ + haemodynamic support; consider thrombolysis (senior)",
    tier: 2,
    emergency: true,
    escalatesTo: "b_call_skilled_help",
    source: "ESC / RCUK (peri-arrest PE)",
  },
  b_anaphylaxis_adrenaline: {
    code: "b_anaphylaxis_adrenaline",
    label: "Anaphylaxis → IM adrenaline FIRST (before salbutamol)",
    tier: 2,
    doseId: "anaphylaxis_adrenaline_im",
    emergency: true,
    escalatesTo: "b_call_skilled_help",
    source: "RCUK Anaphylaxis (2021, current) / ERC 2025",
  },

  // Tier 3 — advanced / skilled operator
  b_call_skilled_help: {
    code: "b_call_skilled_help",
    label: "Call skilled help (anaesthetics / ICU / critical care) + prepare ventilation",
    tier: 3,
    emergency: true,
    escalatesTo: "b_rsi_intubation",
    source: RCUK,
  },
  b_chest_drain: {
    code: "b_chest_drain",
    label: "Intercostal chest drain (definitive)",
    tier: 3,
    escalatesTo: "b_call_skilled_help",
    source: ATLS,
  },
  b_niv: {
    code: "b_niv",
    label: "Non-invasive ventilation (BiPAP type-2 / CPAP type-1) per cause + protocol",
    tier: 3,
    escalatesTo: "b_rsi_intubation",
    source: "BTS/ICS 2016",
  },
  b_rsi_intubation: {
    code: "b_rsi_intubation",
    label: "RSI / intubation + invasive ventilation (failing oxygenation/ventilation, exhaustion)",
    tier: 3,
    escalatesTo: "b_capnography_confirm",
    source: "ERC 2025 / DAS",
  },
  b_capnography_confirm: {
    code: "b_capnography_confirm",
    label: "Confirm advanced airway with waveform capnography; lung-protective ventilation",
    tier: 3,
    source: "ERC 2025",
  },
} as const satisfies Record<string, BreathingAction>;

export type BreathingActionCode = keyof typeof BREATHING_ACTIONS;

export function breathingAction(code: string): BreathingAction | null {
  return (BREATHING_ACTIONS as Record<string, BreathingAction>)[code] ?? null;
}
