/**
 * Arrest-detection seam (GATE E) — PURE.
 *
 * The ONLY arrest logic in this surface: decide whether the patient is in
 * cardiac arrest so the UI can prompt CPR and route to the ALS module.
 * Everything past that (rhythm, defibrillation, CPR quality, arrest drug
 * dosing, 4Hs/4Ts) is DEFERRED to the separately-signed-off ALS module.
 *
 * Criterion (RCUK/ERC 2025): UNRESPONSIVE AND (not breathing normally —
 * agonal gasps count as NOT normal — and/or no central pulse / no signs
 * of life). Each input is a tri-state (true / false / unknown-null).
 */

export interface ArrestSigns {
  /** Did the patient respond to voice/pain? */
  responsive?: boolean | null;
  /** Is the patient breathing normally? (agonal gasps = false) */
  breathingNormally?: boolean | null;
  /** Is a central pulse present? */
  centralPulse?: boolean | null;
}

export function detectArrest(s: ArrestSigns): { isArrest: boolean; reason: string | null } {
  const unresponsive = s.responsive === false;
  const notBreathing = s.breathingNormally === false;
  const noPulse = s.centralPulse === false;

  if (unresponsive && (notBreathing || noPulse)) {
    const parts: string[] = [];
    if (notBreathing) parts.push("not breathing normally (gasping is not normal)");
    if (noPulse) parts.push("no central pulse / no signs of life");
    return { isArrest: true, reason: `Unresponsive + ${parts.join(" + ")}` };
  }
  return { isArrest: false, reason: null };
}
