/**
 * Getting in: the create-account rules, the pure body of the phone's `mobile/src/features/auth/rules.ts`
 * (copied verbatim; the phone keeps its file, which imports `formatUgPhone`/`isUgMobile` from its RN field,
 * so those two are copied here from `mobile/src/components/tide/field.tsx`). `autoPick` is left out: it
 * serves the phone's geocoder, which the web does not have. The server's `patientSchema` re-checks
 * everything; these keep Continue honest, they are not the last word. `signupKey` is not copied: the web
 * uses `crypto.randomUUID()`, the same v4 shape.
 */

export function formatUgPhone(raw: string): string {
  let d = raw.replace(/[^0-9]/g, "");
  if (d.startsWith("256")) d = d.slice(3);
  if (d.startsWith("0")) d = d.slice(1);
  d = d.slice(0, 9);
  return [d.slice(0, 3), d.slice(3, 6), d.slice(6, 9)].filter(Boolean).join(" ");
}

export function isUgMobile(formatted: string): boolean {
  return /^7\d{8}$/.test(formatted.replace(/ /g, ""));
}

export type Sex = "male" | "female" | "intersex" | "prefer_not_say";

export const SEX_OPTIONS: readonly { key: Sex; label: string }[] = [
  { key: "male", label: "Male" },
  { key: "female", label: "Female" },
  { key: "intersex", label: "Intersex" },
  { key: "prefer_not_say", label: "Prefer not to say" },
];

/** A place from the web's UBOS search (`lib/geo`): district or subcounty. */
export interface PlaceChoice {
  code: string;
  label: string;
}

/** A point on the real map (ADR 0402), with the phone geocoder's words for it. */
export interface PinSpot {
  lat: number;
  lng: number;
  address: string | null;
}

export interface SignupDraft {
  firstName: string;
  surname: string;
  sex: Sex | null;
  dobDay: string;
  dobMonth: string;
  dobYear: string;
  /** Shown grouped "772 123 456"; the leading 0 is already gone. */
  phone: string;
  /** Set when a date under 18 was refused and wiped (law L10). Only the fact, never the date. */
  refusedMinor: boolean;
  place: PlaceChoice | null;
  village: string;
  /** The phone saves it as the home place after sign-in, with `pinConsent`; the web has no map, so null. */
  pin: PinSpot | null;
  pinConsent: boolean;
  email: string;
  password: string;
  consent: boolean;
  /** Separate and unticked by default (law L9). */
  sms: boolean;
}

export function initialDraft(): SignupDraft {
  return {
    firstName: "",
    surname: "",
    sex: null,
    dobDay: "",
    dobMonth: "",
    dobYear: "",
    phone: "",
    refusedMinor: false,
    place: null,
    village: "",
    pin: null,
    pinConsent: false,
    email: "",
    password: "",
    consent: false,
    sms: false,
  };
}

export const NAME_MAX = 80;
export const VILLAGE_MAX = 200;
export const PASSWORD_MIN = 12;
/** bcrypt stops reading at 72 bytes; the server refuses longer (D14). */
export const PASSWORD_MAX_BYTES = 72;
export const ADULT_AGE = 18;
export const OLDEST_AGE = 120;

export const MINOR_NOTE =
  'MedSync accounts are for adults. A parent or guardian can add a child from their own account, under "People I care for".';

/* ─── Date of birth ──────────────────────────────────────────────────── */

export type DobCheck =
  | { ok: true; iso: string }
  | {
      ok: false;
      reason: "incomplete" | "not_real" | "future" | "under_18" | "over_120";
      message: string;
    };

/** Whole years on `today`, in UTC like the server's `ageOn`. */
export function ageOn(y: number, m: number, d: number, today: Date): number {
  let age = today.getUTCFullYear() - y;
  const tm = today.getUTCMonth() + 1;
  if (tm < m || (tm === m && today.getUTCDate() < d)) age -= 1;
  return age;
}

export function checkDob(day: string, month: string, year: string, today: Date): DobCheck {
  if (!day || !month || year.length !== 4) return { ok: false, reason: "incomplete", message: "" };
  const d = Number(day);
  const m = Number(month);
  const y = Number(year);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d)
    return {
      ok: false,
      reason: "not_real",
      message: "That date does not exist. Check the day and month.",
    };
  const age = ageOn(y, m, d, today);
  if (date.getTime() > today.getTime() || age < 0)
    return { ok: false, reason: "future", message: "The date cannot be in the future." };
  if (age < ADULT_AGE)
    return {
      ok: false,
      reason: "under_18",
      message: "You must be 18 or older to create an account.",
    };
  if (age > OLDEST_AGE) return { ok: false, reason: "over_120", message: "Please check the year." };
  return { ok: true, iso: `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}` };
}

/**
 * Types one date-of-birth box. When the date is complete and under 18 it is
 * refused and the three boxes are wiped at once: the refused date is never
 * kept, not even in memory (law L10, DPPA s.8). Only `refusedMinor` stays.
 */
export function typeDob(
  draft: SignupDraft,
  part: "dobDay" | "dobMonth" | "dobYear",
  raw: string,
  today: Date,
): { draft: SignupDraft; refused: boolean } {
  const digits = raw.replace(/[^0-9]/g, "").slice(0, part === "dobYear" ? 4 : 2);
  const next = { ...draft, [part]: digits, refusedMinor: false };
  const check = checkDob(next.dobDay, next.dobMonth, next.dobYear, today);
  if (!check.ok && check.reason === "under_18")
    return {
      draft: { ...next, dobDay: "", dobMonth: "", dobYear: "", refusedMinor: true },
      refused: true,
    };
  return { draft: next, refused: false };
}

/* ─── Phone, email, password ─────────────────────────────────────────── */

/** Error words once nine digits are in, else null. The field formats itself (`formatUgPhone`). */
export function phoneProblem(formatted: string): string | null {
  const digits = formatted.replace(/ /g, "");
  if (digits.length < 9) return null;
  return isUgMobile(formatted) ? null : "Ugandan mobile numbers start with 7, like 772 000 000";
}

/** "+256772123456": what the server's `normalizeUgPhone` reads. */
export function e164(formatted: string): string {
  return `+256${formatted.replace(/ /g, "")}`;
}

export function isEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
}

function utf8Bytes(s: string): number {
  return new TextEncoder().encode(s).length;
}

export function passwordOk(pw: string): boolean {
  return pw.length >= PASSWORD_MIN && utf8Bytes(pw) <= PASSWORD_MAX_BYTES;
}

/** 0–4 segments of the strength bar, and the countdown hint under it. */
export function passwordStrength(pw: string): { score: 0 | 1 | 2 | 3 | 4; hint: string } {
  const n = pw.length;
  if (n === 0) return { score: 0, hint: "At least 12 characters. A short sentence works well." };
  if (utf8Bytes(pw) > PASSWORD_MAX_BYTES)
    return { score: 1, hint: "That password is too long. Use a shorter one." };
  if (n < PASSWORD_MIN)
    return { score: n < 8 ? 1 : 2, hint: `${PASSWORD_MIN - n} more characters to go` };
  const strong = /[0-9]/.test(pw) && /[A-Za-z]/.test(pw);
  return strong
    ? { score: 4, hint: "Strong password" }
    : { score: 3, hint: "Good. Adding a number makes it stronger." };
}

/* ─── Steps ──────────────────────────────────────────────────────────── */

export type Step = 1 | 2 | 3 | 4;
export const STEP_NAMES: Record<Step, string> = {
  1: "About you",
  2: "Where you live",
  3: "Your sign-in",
  4: "Consent",
};

export function stepValid(step: Step, d: SignupDraft, today: Date): boolean {
  switch (step) {
    case 1:
      return (
        d.firstName.trim().length > 0 &&
        d.firstName.length <= NAME_MAX &&
        d.surname.trim().length > 0 &&
        d.surname.length <= NAME_MAX &&
        d.sex !== null &&
        checkDob(d.dobDay, d.dobMonth, d.dobYear, today).ok &&
        isUgMobile(d.phone)
      );
    case 2:
      return d.place !== null && d.village.length <= VILLAGE_MAX;
    case 3:
      return isEmail(d.email) && passwordOk(d.password);
    case 4:
      return d.consent;
  }
}

/** Which step a server field error belongs to, so the phone can go back to it. */
export function stepOfField(field: string): Step {
  if (["place", "village"].includes(field)) return 2;
  if (["email", "password"].includes(field)) return 3;
  if (field.startsWith("consent") || field.startsWith("sms")) return 4;
  return 1;
}

/* ─── Submission ─────────────────────────────────────────────────────── */

/** The notice as shown on step 4. Its version and hash ride with the answer. */
export interface ShownNotice {
  version: string;
  sha: string;
}
export interface ShownSms {
  version: string;
  sha: string;
}

/**
 * The exact `patientSchema` input the web action takes. Consent is bound to
 * the text the patient was shown: version and hash come from the notice on
 * screen, never from a constant. The map pin is not here on purpose.
 */
export function buildSubmission(d: SignupDraft, notice: ShownNotice, sms: ShownSms | null) {
  return {
    firstName: d.firstName.trim(),
    surname: d.surname.trim(),
    sex: d.sex,
    dobDay: d.dobDay,
    dobMonth: d.dobMonth,
    dobYear: d.dobYear,
    phone: e164(d.phone),
    place: d.place?.code ?? "",
    village: d.village.trim() || undefined,
    email: d.email.trim().toLowerCase(),
    password: d.password,
    consent: d.consent,
    consentVersion: notice.version,
    consentSha: notice.sha,
    smsConsent: sms ? d.sms : false,
    smsVersion: sms?.version,
    smsSha: sms?.sha,
  };
}
