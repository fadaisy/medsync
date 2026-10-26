import type { PlaceOption } from "@/data/signup";

import { formatUgPhone } from "@/components/tide/field";

export type {
  DobCheck,
  PinSpot,
  PlaceChoice,
  Sex,
  ShownNotice,
  ShownSms,
  SignupDraft,
  Step,
} from "@patient-core/getting-in-signup";
export {
  ADULT_AGE,
  MINOR_NOTE,
  NAME_MAX,
  OLDEST_AGE,
  PASSWORD_MAX_BYTES,
  PASSWORD_MIN,
  SEX_OPTIONS,
  STEP_NAMES,
  VILLAGE_MAX,
  ageOn,
  buildSubmission,
  checkDob,
  e164,
  initialDraft,
  isEmail,
  passwordOk,
  passwordStrength,
  phoneProblem,
  stepOfField,
  stepValid,
  typeDob,
} from "@patient-core/getting-in-signup";

/* ─── Phone, email, password ─────────────────────────────────────────── */

export { formatUgPhone };

/* ─── Submission ─────────────────────────────────────────────────────── */

/** A v4 UUID for the action's idempotency key (`^[0-9a-f-]{36}$`). Called once per draft. */
export function signupKey(random: () => number = Math.random): string {
  const hex = Array.from({ length: 32 }, () => Math.floor(random() * 16).toString(16));
  hex[12] = "4";
  hex[16] = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  const h = hex.join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/**
 * The official entry a geocoder's area name points to: the first result whose
 * label starts with those words ("Rubaga Division" → "Rubaga Division,
 * Kampala"). Null when nothing names it, so the patient picks by hand.
 */
export function autoPick(query: string, places: readonly PlaceOption[]): PlaceOption | null {
  const want = query.trim().toLowerCase();
  if (!want) return null;
  return places.find((p) => p.label.toLowerCase().startsWith(want)) ?? null;
}
