/**
 * Age from date of birth — pure, deterministic.
 *
 * Extracted from the nurse patient panel so triage, reception, and the
 * patient summary share one implementation. Server time is authoritative
 * (pass a stable "now" in tests). Floors to the last birthday. No
 * date-fns — native arithmetic is exact for integer-year age.
 */
export function computeAgeYears(dobIso: string | null, now: Date = new Date()): number | null {
  if (!dobIso) return null;
  const dob = new Date(dobIso);
  if (Number.isNaN(dob.getTime())) return null;

  let age = now.getFullYear() - dob.getFullYear();
  const monthDelta = now.getMonth() - dob.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < dob.getDate())) {
    age -= 1;
  }
  return age >= 0 && age < 150 ? age : null;
}
