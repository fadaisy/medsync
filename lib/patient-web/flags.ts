/**
 * The phone's feature switches, read on the web from the server env `PATIENT_FLAGS` (D-PW-15): a comma list of
 * the phone's own names, e.g. `PATIENT_FLAGS=mobileChat,sayIt`. Absent means off.
 */
export function patientFlag(name: string, env = process.env.PATIENT_FLAGS): boolean {
  return (env ?? "")
    .split(",")
    .map((s) => s.trim())
    .includes(name);
}

/** Gate CG governance artifact: not signed (16 Nov 2026). The phone holds the same constant. */
export const GATE_CG_SIGNED = false;

/**
 * Care mode, v2 on the web (gate A5): only where Gate CG is signed AND `careMode` is in `PATIENT_FLAGS`.
 * Flipping `GATE_CG_SIGNED` is a reviewed code change that names the signed artifact, not a setting (MR11).
 */
export function careModeOn(env = process.env.PATIENT_FLAGS): boolean {
  return GATE_CG_SIGNED && patientFlag("careMode", env) && patientFlag("appV2Web", env);
}
