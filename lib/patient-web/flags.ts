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
