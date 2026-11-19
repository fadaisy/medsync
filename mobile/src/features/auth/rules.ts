import type { PlaceOption } from "@/data/signup";
import type { SignupDraft, Step } from "@patient-core/getting-in-signup";
import {
  checkDob,
  isEmail,
  minorNote,
  NAME_MAX,
  passwordOk,
  STEP_NAMES,
  VILLAGE_MAX,
} from "@patient-core/getting-in-signup";

import { formatUgPhone, isUgMobile } from "@/components/tide/field";
import { BRAND } from "@/lib/brand";

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

/** The 18-or-older note, with the name the phone shows (signed by the CSO, 19 Nov 2026). */
export const MINOR_NOTE = minorNote(BRAND);

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

/* ─── What a step still needs, and what the review shows ─────────────── */

/**
 * The fields a step is still waiting for, in the fields' own names: the "Still needed" line above a
 * Continue that cannot be pressed yet. It asks what `stepValid` asks, clause for clause, so it is empty
 * exactly when the step is valid and never names a field the button is not waiting for. Display only:
 * `stepValid` still decides.
 */
export function stillNeeded(step: Step, d: SignupDraft, today: Date): string[] {
  const asks: [boolean, string][] =
    step === 1
      ? [
          [d.firstName.trim().length > 0 && d.firstName.length <= NAME_MAX, "First name"],
          [d.surname.trim().length > 0 && d.surname.length <= NAME_MAX, "Surname"],
          [d.sex !== null, "Sex at birth"],
          [checkDob(d.dobDay, d.dobMonth, d.dobYear, today).ok, "Date of birth"],
          [isUgMobile(d.phone), "Mobile number"],
        ]
      : step === 2
        ? [
            [d.place !== null, "District or subcounty"],
            [d.village.length <= VILLAGE_MAX, "Village or address"],
          ]
        : step === 3
          ? [
              [isEmail(d.email), "Email"],
              [passwordOk(d.password), "Password"],
            ]
          : [[d.consent, "Your agreement to the notice"]];
  return asks.filter(([ok]) => !ok).map(([, name]) => name);
}

export interface ReviewRow {
  step: 1 | 2 | 3;
  name: string;
  /** Empty when the step holds nothing to show (the place, where sign-up from the app is off). */
  value: string;
}

/**
 * "Your details" on the consent step: one line for each finished step, so the patient can check what
 * they typed before agreeing. The password is never one of them, and nothing here reads it.
 */
export function reviewRows(d: SignupDraft): ReviewRow[] {
  return [
    { step: 1, name: STEP_NAMES[1], value: `${d.firstName.trim()} ${d.surname.trim()}`.trim() },
    { step: 2, name: STEP_NAMES[2], value: d.place?.label ?? "" },
    { step: 3, name: STEP_NAMES[3], value: d.email.trim() },
  ];
}
