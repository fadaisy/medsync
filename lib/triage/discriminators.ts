import type { AcuityLevel } from "./types";

/**
 * Triage discriminators — the SATS-style red-flag list (research doc
 * §4/§5/§8, ratified GATE A §A.2). Each forces a MINIMUM acuity
 * regardless of the physiological score (engine Step 3/4 "worse-of").
 *
 * This is the single most safety-critical list in the engine. It is
 * reference DATA, transcribed verbatim from the approved §A.2 table —
 * no item invented. At runtime it is also mirrored into the
 * `triage_discriminators` table (migration 0036) so a Clinical Safety
 * Officer can extend it without a code change; this constant is the
 * seed + the test oracle.
 *
 * `source`:
 *   - "manual"  → a clinician ticks it on the triage checklist.
 *   - "derived" → the engine computes whether it fires, from the vital
 *     set / derived metrics (so it can never be forgotten).
 * `lifeThreat: true` marks the Step-0 immediate-life-threat subset that
 *   bypasses scoring entirely → Level 1, resus now (research doc §9).
 * `conditional: true` marks a discriminator whose firing depends on
 *   more than its own presence (today: sepsis, gated on qSOFA≥2 OR
 *   NEWS2≥5 per research doc §5) — handled explicitly in the engine.
 */
export interface Discriminator {
  code: string;
  label: string;
  minAcuity: AcuityLevel;
  appliesTo: "all" | "adult" | "paediatric" | "obstetric";
  source: "manual" | "derived";
  lifeThreat: boolean;
  conditional?: boolean;
}

export const TRIAGE_DISCRIMINATORS: readonly Discriminator[] = [
  // ── Step-0 immediate life threats (→ Level 1, bypass scoring) ──────
  {
    code: "airway_compromise",
    label: "Airway compromise / stridor",
    minAcuity: 1,
    appliesTo: "all",
    source: "manual",
    lifeThreat: true,
  },
  {
    code: "absent_agonal_breathing",
    label: "Absent or agonal breathing",
    minAcuity: 1,
    appliesTo: "all",
    source: "manual",
    lifeThreat: true,
  },
  {
    code: "cardiac_arrest_no_pulse",
    label: "No palpable pulse / cardiac arrest",
    minAcuity: 1,
    appliesTo: "all",
    source: "manual",
    lifeThreat: true,
  },
  {
    code: "unresponsive",
    label: "Unresponsive (U on ACVPU)",
    minAcuity: 1,
    appliesTo: "all",
    source: "manual",
    lifeThreat: true,
  },
  {
    code: "active_seizure",
    label: "Active seizure (incl. eclampsia)",
    minAcuity: 1,
    appliesTo: "all",
    source: "manual",
    lifeThreat: true,
  },
  {
    code: "exsanguinating_haemorrhage",
    label: "Exsanguinating / uncontrolled haemorrhage",
    minAcuity: 1,
    appliesTo: "all",
    source: "manual",
    lifeThreat: true,
  },
  {
    code: "spo2_critical_under_90_on_o2",
    label: "SpO₂ < 90% despite oxygen",
    minAcuity: 1,
    appliesTo: "all",
    source: "derived",
    lifeThreat: true,
  },
  {
    code: "glucose_critical_under_3",
    label: "Glucose < 3.0 mmol/L",
    minAcuity: 1,
    appliesTo: "all",
    source: "derived",
    lifeThreat: true,
  },

  // ── Adult discriminators (min acuity, full flow) ──────────────────
  {
    code: "cardiac_chest_pain",
    label: "Cardiac-sounding chest pain",
    minAcuity: 2,
    appliesTo: "adult",
    source: "manual",
    lifeThreat: false,
  },
  {
    code: "focal_neuro_deficit",
    label: "Focal neuro deficit / suspected stroke",
    minAcuity: 2,
    appliesTo: "all",
    source: "manual",
    lifeThreat: false,
  },
  {
    code: "sepsis_suspicion",
    label: "Sepsis suspicion (infection source)",
    minAcuity: 2,
    appliesTo: "adult",
    source: "manual",
    lifeThreat: false,
    conditional: true,
  },
  {
    code: "severe_resp_distress",
    label: "Severe respiratory distress (working hard)",
    minAcuity: 2,
    appliesTo: "all",
    source: "manual",
    lifeThreat: false,
  },
  {
    code: "shock_index_high",
    label: "Shock Index ≥ 1.0 (occult shock)",
    minAcuity: 2,
    appliesTo: "adult",
    source: "derived",
    lifeThreat: false,
  },
  {
    // The "scores 0 ≠ normal" red-flag: NEWS2 adds no BP points until
    // ≥220, so severe hypertension is invisible to the score. This
    // derived flag escalates it to high-acuity (L2); a hypertensive
    // EMERGENCY (with chest pain / focal deficit / breathlessness)
    // reaches L1 via those end-organ discriminators in the worse-of.
    code: "severe_hypertension",
    label: "SBP ≥ 180 or DBP ≥ 110 (severe hypertension — NEWS2 scores 0)",
    minAcuity: 2,
    appliesTo: "adult",
    source: "derived",
    lifeThreat: false,
  },
  {
    // DBP Reference §1: NEWS2 ignores diastolic entirely. A very low
    // diastolic threatens coronary perfusion (coronaries fill in
    // diastole) — invisible to the score, caught here.
    code: "low_diastolic_perfusion",
    label: "DBP < 40 (threatens coronary perfusion — NEWS2 ignores diastolic)",
    minAcuity: 2,
    appliesTo: "adult",
    source: "derived",
    lifeThreat: false,
  },
  {
    // DBP Reference §2: MAP < 65 = inadequate organ perfusion. A low
    // diastolic pulls MAP down fast; the physiological score doesn't
    // compute MAP, so escalate via the red-flag layer.
    code: "map_below_65",
    label: "MAP < 65 (inadequate organ perfusion)",
    minAcuity: 2,
    appliesTo: "adult",
    source: "derived",
    lifeThreat: false,
  },

  // ── Obstetric discriminators ──────────────────────────────────────
  {
    code: "obstetric_severe_htn",
    label: "SBP ≥ 160 or DBP ≥ 110 (severe pre-eclampsia)",
    minAcuity: 1,
    appliesTo: "obstetric",
    source: "derived",
    lifeThreat: false,
  },
  {
    code: "obstetric_heavy_pv_bleeding",
    label: "Heavy PV bleeding",
    minAcuity: 1,
    appliesTo: "obstetric",
    source: "manual",
    lifeThreat: false,
  },
  {
    code: "obstetric_preeclampsia_triad",
    label: "Pre-eclampsia triad (headache + visual + epigastric)",
    minAcuity: 2,
    appliesTo: "obstetric",
    source: "manual",
    lifeThreat: false,
  },
  {
    code: "reduced_fetal_movements",
    label: "Reduced fetal movements",
    minAcuity: 2,
    appliesTo: "obstetric",
    source: "manual",
    lifeThreat: false,
  },

  // ── Paediatric discriminators ─────────────────────────────────────
  {
    code: "paed_grunting_cyanosis_caprefill",
    label: "Grunting / cyanosis / cap refill > 3s",
    minAcuity: 2,
    appliesTo: "paediatric",
    source: "manual",
    lifeThreat: false,
  },
  {
    code: "paed_non_blanching_rash",
    label: "Non-blanching rash",
    minAcuity: 1,
    appliesTo: "paediatric",
    source: "manual",
    lifeThreat: false,
  },
  {
    code: "paed_infant_fever",
    label: "Infant < 3 months, fever ≥ 38°C",
    minAcuity: 2,
    appliesTo: "paediatric",
    source: "manual",
    lifeThreat: false,
  },

  // ── Universal ─────────────────────────────────────────────────────
  {
    code: "severe_pain",
    label: "Severe pain (≥ 7/10)",
    minAcuity: 3,
    appliesTo: "all",
    source: "manual",
    lifeThreat: false,
  },
] as const;

/** Fast lookup by code. */
export const DISCRIMINATOR_BY_CODE: ReadonlyMap<string, Discriminator> = new Map(
  TRIAGE_DISCRIMINATORS.map((d) => [d.code, d]),
);

/** The life-threat subset (Step 0). */
export const LIFE_THREAT_DISCRIMINATORS = TRIAGE_DISCRIMINATORS.filter((d) => d.lifeThreat);
