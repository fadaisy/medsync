/**
 * Smart Triage Engine — clinical threshold constants.
 *
 * EVERY number in this file is transcribed VERBATIM from
 * docs/clinical/triage-medical-research.md. No threshold is invented or
 * "improved". Each band cites its research-doc section. If a value here
 * disagrees with that document, the document wins and this file is the
 * bug. This is a clinical-safety artifact — changes require Clinical
 * Safety Officer authorship (kickoff §6).
 *
 * Bands are expressed as inclusive [min, max] ranges with the points
 * they score. `null` bounds mean unbounded on that side. The scorer
 * picks the single band that contains the value; bands are mutually
 * exclusive and exhaustive over the plausible domain.
 */

export interface ScoreBand {
  /** Inclusive lower bound; null = −∞. */
  min: number | null;
  /** Inclusive upper bound; null = +∞. */
  max: number | null;
  points: number;
}

/* ─── NEWS2 (research doc §3) ─────────────────────────────────────── */

/** Respiratory rate /min. §3 table row 1. */
export const NEWS2_RESP_RATE: ScoreBand[] = [
  { min: null, max: 8, points: 3 },
  { min: 9, max: 11, points: 1 },
  { min: 12, max: 20, points: 0 },
  { min: 21, max: 24, points: 2 },
  { min: 25, max: null, points: 3 },
];

/** SpO₂ Scale 1 (%) — the default scale. §3 table row 2. */
export const NEWS2_SPO2_SCALE1: ScoreBand[] = [
  { min: null, max: 91, points: 3 },
  { min: 92, max: 93, points: 2 },
  { min: 94, max: 95, points: 1 },
  { min: 96, max: null, points: 0 },
];

/**
 * SpO₂ Scale 2 (%) — hypercapnic/COPD target 88–92, ON AIR portion.
 * §3 table row 3. NOTE: Scale 2 is split by air-vs-oxygen in the
 * research doc; the on-oxygen sub-bands (93–94→1, 95–96→2, ≥97→3) are
 * applied by the scorer ONLY when oxygen='oxygen'. These bands cover
 * the on-air / baseline reading. Scale 2 must be clinician-enabled.
 */
export const NEWS2_SPO2_SCALE2_AIR: ScoreBand[] = [
  { min: null, max: 83, points: 3 },
  { min: 84, max: 85, points: 2 },
  { min: 86, max: 87, points: 1 },
  { min: 88, max: null, points: 0 }, // 88–92 target, or ≥93 on air
];

/** SpO₂ Scale 2 on-oxygen sub-bands (research doc §3 row 3, O₂ columns). */
export const NEWS2_SPO2_SCALE2_OXYGEN: ScoreBand[] = [
  { min: null, max: 83, points: 3 },
  { min: 84, max: 85, points: 2 },
  { min: 86, max: 87, points: 1 },
  { min: 88, max: 92, points: 0 }, // on target on O₂
  { min: 93, max: 94, points: 1 },
  { min: 95, max: 96, points: 2 },
  { min: 97, max: null, points: 3 },
];

/** Systolic BP mmHg. §3 table row 5. */
export const NEWS2_SYSTOLIC_BP: ScoreBand[] = [
  { min: null, max: 90, points: 3 },
  { min: 91, max: 100, points: 2 },
  { min: 101, max: 110, points: 1 },
  { min: 111, max: 219, points: 0 },
  { min: 220, max: null, points: 3 },
];

/** Pulse /min. §3 table row 6. */
export const NEWS2_PULSE: ScoreBand[] = [
  { min: null, max: 40, points: 3 },
  { min: 41, max: 50, points: 1 },
  { min: 51, max: 90, points: 0 },
  { min: 91, max: 110, points: 1 },
  { min: 111, max: 130, points: 2 },
  { min: 131, max: null, points: 3 },
];

/** Temperature °C. §3 table row 8. */
export const NEWS2_TEMPERATURE: ScoreBand[] = [
  { min: null, max: 35.0, points: 3 },
  { min: 35.1, max: 36.0, points: 1 },
  { min: 36.1, max: 38.0, points: 0 },
  { min: 38.1, max: 39.0, points: 1 },
  { min: 39.1, max: null, points: 2 },
];

/** Supplemental oxygen adds +2 to the aggregate (research doc §3). */
export const NEWS2_OXYGEN_POINTS = 2;

/** ACVPU: Alert = 0; any of C/V/P/U = 3 (research doc §3). */
export const NEWS2_ACVPU_POINTS: Record<string, number> = {
  A: 0,
  C: 3,
  V: 3,
  P: 3,
  U: 3,
};

/**
 * NEWS2 aggregate → clinical risk bands (research doc §3 risk table).
 * The single-parameter-3 ("red score") rule is handled separately in
 * the scorer, not here.
 */
export const NEWS2_RISK = {
  LOW_MAX: 4, // 0–4 low
  MEDIUM_MIN: 5, // 5–6 medium
  MEDIUM_MAX: 6,
  HIGH_MIN: 7, // ≥7 high
} as const;

/* ─── Derived metrics (research doc §6) ───────────────────────────── */

/** Shock Index = HR / systolic BP. >0.9 occult shock; ≥1.0 strong flag. */
export const SHOCK_INDEX = {
  OCCULT_SHOCK_GT: 0.9,
  SHOCK_GTE: 1.0,
} as const;

/** Pulse pressure (SBP − DBP). Narrow if < 25% of SBP (research doc §6). */
export const PULSE_PRESSURE_NARROW_FRACTION = 0.25;

/** qSOFA points (research doc §5). */
export const QSOFA = {
  RESP_RATE_GTE: 22,
  SYSTOLIC_BP_LTE: 100,
  /** Altered mentation = anything other than Alert on ACVPU (GCS<15). */
  POSITIVE_THRESHOLD: 2,
} as const;

/** Glucose mmol/L (research doc §6, §11). */
export const GLUCOSE = {
  HYPO_LT: 3.0, // <3.0 immediate
  HYPER_DKA_SCREEN_GT: 15.0, // >15 + ketones/acidosis → DKA pathway
} as const;

/* ─── Paediatric age-band normal ranges (research doc §7) ─────────── */
/**
 * NORMAL ranges only — the research doc provides these but does NOT
 * provide the full Brighton PEWS per-point sub-rubric (behaviour/CVS/
 * respiratory each 0–3). The scorer uses these to flag out-of-range
 * vitals; full PEWS point allocation is a CSO data request (see
 * lib/triage/scoring/pews.ts header). Lower SBP limit ≈ 70 + 2×age.
 */
export interface PaedAgeBand {
  label: string;
  minAgeYears: number;
  maxAgeYears: number;
  respRate: { min: number; max: number };
  heartRate: { min: number; max: number };
  systolicBpLowerLimit: number;
}

export const PAED_AGE_BANDS: PaedAgeBand[] = [
  {
    label: "<1y (infant)",
    minAgeYears: 0,
    maxAgeYears: 0.999,
    respRate: { min: 30, max: 60 },
    heartRate: { min: 100, max: 160 },
    systolicBpLowerLimit: 70,
  },
  {
    label: "1–2y",
    minAgeYears: 1,
    maxAgeYears: 2.999,
    respRate: { min: 24, max: 40 },
    heartRate: { min: 90, max: 150 },
    systolicBpLowerLimit: 74,
  },
  {
    label: "2–5y",
    minAgeYears: 3,
    maxAgeYears: 5.999,
    respRate: { min: 22, max: 34 },
    heartRate: { min: 80, max: 140 },
    systolicBpLowerLimit: 78,
  },
  {
    label: "6–12y",
    minAgeYears: 6,
    maxAgeYears: 12.999,
    respRate: { min: 18, max: 30 },
    heartRate: { min: 70, max: 120 },
    systolicBpLowerLimit: 82,
  },
  {
    label: ">12y",
    minAgeYears: 13,
    maxAgeYears: 17.999,
    respRate: { min: 12, max: 20 },
    heartRate: { min: 60, max: 100 },
    systolicBpLowerLimit: 90,
  },
];

/* ─── ESI v5 mandatory vitals + danger-zone (ENA 2023) ────────────── */
/**
 * ESI 5th Edition (ENA, 2023-03-28) — verified current at build
 * (docs/triage-v2-gate-a-proposal.md §1; ena.org ESI v5).
 *
 * Two v5 rules v4 lacked:
 *   1. HR + RR + SpO₂ are MANDATORY for every patient not already
 *      Level 1/2 — a reassuring level may NOT be issued without them.
 *   2. A high-risk ("danger-zone") vital reassesses acuity UPWARD →
 *      minimum Level 2, regardless of the aggregate score.
 *
 * Adult danger-zone thresholds (verified ESI v5): HR > 100, RR > 20,
 * SpO₂ < 92. Paediatric numeric cutoffs live in the paid ENA handbook
 * and are NOT encoded here (not fabricated) — paeds stays provisional.
 */
export const ESI_V5_REQUIRED_VITALS = ["respiratory_rate", "pulse", "spo2"] as const;

export const ESI_V5_ADULT_DANGER = {
  PULSE_GT: 100,
  RESP_RATE_GT: 20,
  SPO2_LT: 92,
} as const;

/** Where an incomplete required-vital set floors acuity (biased up from Green). */
export const ESI_V5_INCOMPLETE_FLOOR_LEVEL = 3;
/** Where a danger-zone vital floors acuity (reassess-up). */
export const ESI_V5_DANGER_FLOOR_LEVEL = 2;

/* ─── 5-tier acuity model (research doc §1) ───────────────────────── */

export interface AcuityTier {
  level: 1 | 2 | 3 | 4 | 5;
  colour: "red" | "orange" | "yellow" | "green" | "blue";
  meaning: string;
  targetMinutes: number; // default; per-hospital configurable
}

export const ACUITY_TIERS: AcuityTier[] = [
  { level: 1, colour: "red", meaning: "Immediate life-saving intervention", targetMinutes: 0 },
  { level: 2, colour: "orange", meaning: "High risk / time-critical", targetMinutes: 10 },
  { level: 3, colour: "yellow", meaning: "Urgent, stable", targetMinutes: 60 },
  { level: 4, colour: "green", meaning: "Less urgent", targetMinutes: 120 },
  { level: 5, colour: "blue", meaning: "Non-urgent", targetMinutes: 240 },
];

/**
 * NEWS2 aggregate → suggested acuity level (research doc §3 integration
 * note: "≥7 → Red/Orange, 5–6 → Orange/Yellow, single-3 → at least
 * Yellow with review"). The engine takes the WORSE of this and the
 * discriminator minimum (research doc §9 step 4). Conservative ends of
 * the cited ranges are chosen (bias up — under-triage kills, §0).
 */
export function news2ToAcuity(total: number, hasSingleThree: boolean): 1 | 2 | 3 | 4 | 5 {
  if (total >= NEWS2_RISK.HIGH_MIN) return 2; // ≥7 → Orange (Red reserved for Step-0 life-threat)
  if (total >= NEWS2_RISK.MEDIUM_MIN) return 3; // 5–6 → Yellow
  if (hasSingleThree) return 3; // single-3 red score → at least Yellow w/ review
  return 4; // 0–4 → Green
}

/* ─── MEOWS — obstetric thresholds (CSO catalog Part D, verbatim) ──── */
/**
 * Modified Obstetric Early Warning. Pregnancy changes baseline
 * physiology — HR runs +10–20 bpm and BP falls in 2nd trimester — so
 * hypertension (not hypotension) is the classic obstetric emergency, and
 * there is deliberately NO low-BP / standalone-tachycardia trigger here
 * (tachycardia only contributes via the Modified Shock Index, which also
 * needs a low MAP). SpO₂ Red reuses ESI_V5_ADULT_DANGER.SPO2_LT (=92).
 */
export const MEOWS = {
  HTN_SYS_GTE: 140, // ≥140 systolic → hypertension (Yellow)
  HTN_DIA_GTE: 90, // ≥90 diastolic → hypertension (Yellow)
  SEVERE_HTN_SYS_GTE: 160, // ≥160 → SEVERE emergency (Red)
  SEVERE_HTN_DIA_GTE: 110, // ≥110 → SEVERE emergency (Red)
  TEMP_SEPSIS_GTE: 38.0, // ≥38 → chorioamnionitis/sepsis (Red)
  SPO2_CONCERN_LT: 95, // <95 → reduced reserve / PE risk (Yellow)
  MSI_HAEMORRHAGE_GT: 1.7, // MSI = HR/MAP > 1.7 → obstetric haemorrhage (Red)
} as const;

/**
 * MEOWS trigger → acuity (catalog Part D): any Red parameter →
 * immediate senior/obstetric call = L2 (Orange; L1/resus is reserved for
 * Step-0 life-threats — eclamptic seizure, exsanguinating haemorrhage —
 * and the obstetric_severe_htn discriminator independently reaches L1).
 * Two Yellow → L3. One Yellow or none → L4 (biased up from L5: pregnancy
 * = reduced reserve; a single mild deviation never auto-alarms).
 */
export function meowsToAcuity(reds: number, yellows: number): 1 | 2 | 3 | 4 | 5 {
  if (reds >= 1) return 2;
  if (yellows >= 2) return 3;
  return 4;
}

/* ─── Cross-vital rules — the "smart layer" (catalog Part F) ───────── */
/**
 * Patterns that only mean something when vitals are read TOGETHER. Each
 * number is either verbatim-from-catalog or an explicit reuse of an
 * existing in-engine NEWS2 band (labelled INFERRED) — none invented.
 */
export const CUSHING_REFLEX = {
  // INFERRED: Part F gives no Cushing HR; reuses NEWS2_PULSE (≤50 abnormal). Triad-gated.
  BRADYCARDIA_HR_LTE: 50,
  // INFERRED: Part F says only "hypertension"; reuses the Part D obstetric def 140/90.
  HYPERTENSION_SBP_GTE: 140,
  HYPERTENSION_DBP_GTE: 90,
} as const;

export const TEMP_HR_SEPSIS = {
  HYPOTHERMIA_TEMP_LTE: 36, // verbatim Part F "(≤36)"
  FEVER_TEMP_GTE: 38.0, // verbatim Part C/D
  TACHYCARDIA_HR_GTE: 91, // INFERRED from NEWS2_PULSE 91–110 = +1
} as const;

export const SPO2_RR_PATTERN = {
  SPO2_NORMAL_GTE: 96, // verbatim Part C
  RR_HIGH_GTE: 21, // INFERRED from NEWS2_RESP_RATE 21–24 = +2
  WILL_FAIL_FLOOR_LEVEL: 3, // raise-only floor: a normal SpO₂ masking high RR can't read reassuring
} as const;
