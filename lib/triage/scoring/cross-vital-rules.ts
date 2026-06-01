import type {
  CrossVitalRuleResult,
  DerivedMetrics,
  LifeThreatFlags,
  TriageRuleset,
  TriageVitals,
} from "../types";

import { CUSHING_REFLEX, SPO2_RR_PATTERN, TEMP_HR_SEPSIS } from "../constants";
import { resolvePaedBand } from "../reference";

/**
 * Cross-vital "smart layer" rules — pure, deterministic (catalog Part F).
 *
 * Patterns that only mean something when vitals are read TOGETHER. Each
 * rule is null-guarded (a missing input → fired:false; a gap is never
 * read as normal — the ESI-v5 incomplete floor already covers that).
 *
 * Bias-up + over-flag-caveat: every escalation needs a PATTERN of ≥2
 * signals (Cushing's needs all three); paediatric bounds use the age
 * band (NEVER adult numbers); overlays carry zero or raise-only acuity.
 *
 *  - cushings_reflex: bradycardia + hypertension + irregular breathing →
 *    raised ICP → L1 (a hard floor). Paeds brady bound = age band min.
 *  - temp_hr_sepsis: hypothermia≤36 + tachy, OR fever≥38 + tachy →
 *    sepsis SUSPICION overlay (acuity null; only widens an already-
 *    ticked sepsis_suspicion gate — never standalone escalation).
 *  - pulse_pressure: narrow → hypovolaemia; wide → sepsis/aortic
 *    (interpretation strings only, no acuity, no double-count).
 *  - spo2_rr_will_fail: normal SpO₂ + high RR → compensating, will fail
 *    → raise-only floor to L3 (can't issue a reassuring L4/L5).
 *  - peri-arrest: DEFERRED (needs prior-vitals trend the engine doesn't
 *    carry; existing NEWS2 + life-threat already escalate those snapshots).
 */
export function computeCrossVitalRules(
  vitals: TriageVitals,
  derived: DerivedMetrics,
  flags: LifeThreatFlags,
  ruleset: TriageRuleset,
  ageYears: number | null,
): CrossVitalRuleResult[] {
  const out: CrossVitalRuleResult[] = [];
  const hr = vitals.pulse;
  const sbp = vitals.systolicBp;
  const dbp = vitals.diastolicBp;

  // ── Cushing's reflex (triad → raised ICP → L1). ─────────────────
  const bradyBound = cushingBradyBound(ruleset, ageYears);
  const cushingsFired =
    bradyBound !== null &&
    hr !== null &&
    hr <= bradyBound &&
    ((sbp !== null && sbp >= CUSHING_REFLEX.HYPERTENSION_SBP_GTE) ||
      (dbp !== null && dbp >= CUSHING_REFLEX.HYPERTENSION_DBP_GTE)) &&
    flags.irregularBreathing === true;
  out.push({
    code: "cushings_reflex",
    fired: cushingsFired,
    acuityImplication: cushingsFired ? 1 : null,
    interpretation: cushingsFired
      ? "Cushing's reflex (bradycardia + hypertension + irregular breathing) — raised intracranial pressure, immediate."
      : "",
  });

  // ── Temp + HR sepsis overlay (suspicion only, no acuity). ───────
  const tachyBound = sepsisTachyBound(ruleset, ageYears);
  const tempHrFired =
    hr !== null &&
    tachyBound !== null &&
    hr >= tachyBound &&
    vitals.temperature !== null &&
    (vitals.temperature <= TEMP_HR_SEPSIS.HYPOTHERMIA_TEMP_LTE ||
      vitals.temperature >= TEMP_HR_SEPSIS.FEVER_TEMP_GTE);
  out.push({
    code: "temp_hr_sepsis",
    fired: tempHrFired,
    acuityImplication: null, // overlay — widens an already-ticked sepsis gate only
    interpretation: tempHrFired
      ? vitals.temperature !== null && vitals.temperature <= TEMP_HR_SEPSIS.HYPOTHERMIA_TEMP_LTE
        ? "Hypothermia with tachycardia — suspect sepsis (cold sepsis carries a worse prognosis)."
        : "Tachycardia with fever — consider sepsis."
      : "",
  });

  // ── Pulse-pressure interpretation (strings only). ───────────────
  if (derived.pulsePressureFlag === "narrow") {
    out.push({
      code: "pulse_pressure_narrow",
      fired: true,
      acuityImplication: null,
      interpretation: "Narrow pulse pressure — hypovolaemia / poor stroke volume.",
    });
  } else if (derived.pulsePressureFlag === "wide") {
    out.push({
      code: "pulse_pressure_wide",
      fired: true,
      acuityImplication: null,
      interpretation: "Wide pulse pressure — consider sepsis / aortic pathology.",
    });
  }

  // ── SpO₂ + RR "will fail" (raise-only floor to L3). ─────────────
  const rrHighBound = willFailRrBound(ruleset, ageYears);
  const willFail =
    vitals.spo2 !== null &&
    vitals.spo2 >= SPO2_RR_PATTERN.SPO2_NORMAL_GTE &&
    vitals.respiratoryRate !== null &&
    rrHighBound !== null &&
    vitals.respiratoryRate >= rrHighBound;
  out.push({
    code: "spo2_rr_will_fail",
    fired: willFail,
    // Raise-only: a floor toward L3, applied by the engine only when the
    // current level is more reassuring than L3 (never overwrites L1/L2).
    acuityImplication: willFail ? (SPO2_RR_PATTERN.WILL_FAIL_FLOOR_LEVEL as 3) : null,
    interpretation: willFail
      ? "Normal SpO₂ with a high respiratory rate — compensating to stay saturated; do not be reassured, reassess."
      : "",
  });

  return out.filter((r) => r.fired);
}

/** Cushing's bradycardia bound: adult ≤50; paeds = the age band's HR min. */
function cushingBradyBound(ruleset: TriageRuleset, ageYears: number | null): number | null {
  if (ruleset !== "paediatric_pews") return CUSHING_REFLEX.BRADYCARDIA_HR_LTE;
  if (ageYears === null) return null; // no age → can't pick a paed bound; rule won't fire
  const band = resolvePaedBand(ageYears);
  return band ? band.heartRate.min : null;
}

/** Sepsis-overlay tachycardia bound: adult ≥91; paeds = the age band's HR max. */
function sepsisTachyBound(ruleset: TriageRuleset, ageYears: number | null): number | null {
  if (ruleset !== "paediatric_pews") return TEMP_HR_SEPSIS.TACHYCARDIA_HR_GTE;
  if (ageYears === null) return null;
  const band = resolvePaedBand(ageYears);
  return band ? band.heartRate.max : null;
}

/** "Will fail" high-RR bound: adult ≥21; paeds = the age band's RR max. */
function willFailRrBound(ruleset: TriageRuleset, ageYears: number | null): number | null {
  if (ruleset !== "paediatric_pews") return SPO2_RR_PATTERN.RR_HIGH_GTE;
  if (ageYears === null) return null;
  const band = resolvePaedBand(ageYears);
  return band ? band.respRate.max : null;
}
