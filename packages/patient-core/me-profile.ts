/**
 * Me: "A few more details" and "People I book for", the pure halves of the phone's
 * `mobile/src/data/profile-details.ts` (moved verbatim) and of `household.tsx` / `lib/booking.ts`
 * (`HOUSEHOLD_RELATIONSHIPS`, `toUgandaE164`). The adult rule is `pt-add-household-member`'s own
 * (S19): the function keeps it as a local constant, so it is copied here and the server still decides.
 */

export type TitleCode = "mr" | "ms" | "mrs" | "dr" | "other";
export type IdType = "nin" | "passport" | "refugee_id" | "other";
export type NokRelationship =
  | "spouse"
  | "parent"
  | "child"
  | "sibling"
  | "guardian"
  | "friend"
  | "other";
export type DetailsSection = "title" | "language" | "id" | "nok";

export const TITLES: { key: TitleCode | null; label: string }[] = [
  { key: "mr", label: "Mr" },
  { key: "ms", label: "Ms" },
  { key: "mrs", label: "Mrs" },
  { key: "dr", label: "Dr" },
  { key: "other", label: "Other" },
  { key: null, label: "None" },
];
/** Stored as the word itself, as the web's free-text field does. */
export const LANGUAGES = ["English", "Luganda", "Runyankole", "Swahili"] as const;
export const ID_TYPES: { key: IdType; label: string }[] = [
  { key: "nin", label: "National ID (NIN)" },
  { key: "passport", label: "Passport" },
  { key: "refugee_id", label: "Refugee ID" },
  { key: "other", label: "Other" },
];
export const RELATIONSHIPS: { key: NokRelationship; label: string }[] = [
  { key: "spouse", label: "Spouse" },
  { key: "parent", label: "Parent" },
  { key: "child", label: "Child" },
  { key: "sibling", label: "Sibling" },
  { key: "guardian", label: "Guardian" },
  { key: "friend", label: "Friend" },
  { key: "other", label: "Other" },
];

/** `/api/mobile/profile` GET: never a decrypted value. */
export interface OnFile {
  idOnFile: boolean;
  idType: IdType | null;
  nokOnFile: boolean;
  relationship: NokRelationship | null;
  titleCode: TitleCode | null;
  preferredLanguage: string | null;
}

export interface DetailsForm {
  title: TitleCode | null;
  /** A chip from LANGUAGES, "Other", or null for none chosen. */
  languageChoice: string | null;
  languageOther: string;
  idType: IdType;
  idNumber: string;
  nokName: string;
  nokRelationship: NokRelationship | null;
  /** The digits after +256: "772 000 000". */
  nokPhone: string;
}

export interface DetailsBody {
  title?: TitleCode | null;
  language?: string;
  id?: { type: IdType; number: string };
  nok?: { name: string; relationship: NokRelationship | null; phone: string };
}

/** The form as it opens: what is on file, the ID and next of kin empty (they are never sent back). */
export function formFrom(on: OnFile): DetailsForm {
  const stored = on.preferredLanguage?.trim() || null;
  const known = stored !== null && (LANGUAGES as readonly string[]).includes(stored);
  return {
    title: on.titleCode,
    languageChoice: stored === null ? null : known ? stored : "Other",
    languageOther: stored !== null && !known ? stored : "",
    idType: "nin",
    idNumber: "",
    nokName: "",
    nokRelationship: on.relationship,
    nokPhone: "",
  };
}

export function languageOf(form: DetailsForm): string {
  return (
    form.languageChoice === "Other" ? form.languageOther : (form.languageChoice ?? "")
  ).trim();
}

/**
 * Only what changed: a title or language that differs from the file, an ID
 * while none is on file, a next of kin once a name or phone is typed. An
 * empty body means there is nothing to save.
 */
export function detailsBody(form: DetailsForm, on: OnFile): DetailsBody {
  const body: DetailsBody = {};
  if (form.title !== on.titleCode) body.title = form.title;
  const language = languageOf(form);
  if ((language || null) !== (on.preferredLanguage?.trim() || null)) body.language = language;
  if (!on.idOnFile && form.idNumber.trim())
    body.id = { type: form.idType, number: form.idNumber.trim() };
  const digits = form.nokPhone.replace(/\D/g, "");
  if (form.nokName.trim() || digits)
    body.nok = {
      name: form.nokName.trim(),
      relationship: form.nokRelationship,
      phone: digits ? `+256${digits}` : "",
    };
  return body;
}

/* ── People I book for ───────────────────────────────────────────────── */

export const HOUSEHOLD_RELATIONSHIPS = [
  { value: "parent", label: "Parent" },
  { value: "guardian", label: "Guardian" },
  { value: "child", label: "Adult child" },
  { value: "spouse", label: "Spouse" },
  { value: "relative", label: "Relative" },
  { value: "vht", label: "VHT" },
  { value: "other", label: "Other" },
] as const;
export type HouseholdRelationship = (typeof HOUSEHOLD_RELATIONSHIPS)[number]["value"];

/** pt-add-household-member's refusal, word for word (its MINOR_REFUSAL). */
export const MINOR_REFUSAL = "Booking for a child is not available yet.";
const ADULT_YEARS = 18;

/** "+256XXXXXXXXX" from the ways a Ugandan number gets typed; anything else as typed. */
export function toUgandaE164(raw: string): string {
  const digits = raw.replace(/[\s\-()]/g, "");
  if (digits.startsWith("+")) return digits;
  if (digits.startsWith("0")) return `+256${digits.slice(1)}`;
  if (digits.startsWith("256")) return `+${digits}`;
  return digits;
}

/** Whole years since a "YYYY-MM-DD" date, in UTC, as the function counts them. */
function yearsSince(isoDate: string, now: Date): number {
  const [y, m, d] = isoDate.split("-").map(Number) as [number, number, number];
  let years = now.getUTCFullYear() - y;
  if (now.getUTCMonth() + 1 < m || (now.getUTCMonth() + 1 === m && now.getUTCDate() < d))
    years -= 1;
  return years;
}

export interface HouseholdDraft {
  label: string;
  phone: string;
  /** As typed. */
  age: string;
  /** "YYYY-MM-DD" or "". */
  dob: string;
  relationship: HouseholdRelationship | null;
  adult: boolean;
}

/**
 * Why this person cannot be added, or null. The adult rule comes first and says the function's own
 * sentence (S19): the switch is required, and no age or date of birth given may say under 18.
 */
export function householdProblem(d: HouseholdDraft, now: Date): string | null {
  const dob = d.dob.trim();
  const age = d.age.trim() === "" ? null : Number(d.age.trim());
  const dobOk = dob === "" || /^\d{4}-\d{2}-\d{2}$/.test(dob);
  const stated = [
    age !== null && Number.isFinite(age) ? age : null,
    dob && dobOk ? yearsSince(dob, now) : null,
  ].filter((n): n is number => n !== null);
  if (!d.adult || stated.some((n) => n < ADULT_YEARS)) return MINOR_REFUSAL;
  if (!d.label.trim()) return "Give this person a name.";
  if (!d.phone.trim()) return "A Ugandan number, like +256 7XX XXX XXX.";
  if (!dobOk) return "Write the date of birth as YYYY-MM-DD.";
  if (!dob && (age === null || !Number.isInteger(age))) return "Give a date of birth or an age.";
  if (!d.relationship) return "Choose who they are to you.";
  return null;
}
