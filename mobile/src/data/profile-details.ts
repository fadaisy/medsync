import { supabase } from "@/lib/supabase";

/**
 * "A few more details" (after sign-up, and from Me): title, preferred
 * language, an ID and a next of kin. Real: the ID number and the next of
 * kin are encrypted with the server's key, so they go through the web's
 * `/api/mobile/profile` (mirrors app/api/mobile/profile/_lib/rules.ts) and
 * nothing sensitive comes back: the phone learns only *that* an ID or a next
 * of kin is on file. Photo and hospital are written straight through RLS
 * (`@/lib/booking`) and do not need this.
 */

const ORIGIN = process.env.EXPO_PUBLIC_WEB_ORIGIN;
const URL = ORIGIN ? `${ORIGIN.replace(/\/$/, "")}/api/mobile/profile` : null;

/** False until the build names the web origin. */
export const detailsFromAppOn = URL !== null;
export const DETAILS_OFF =
  "These details can't be saved from the app in this build. Your photo and hospital still work.";
const OFFLINE = "Couldn't reach MedSync. Check your connection and try again.";
const FAILED = "Couldn't load your details. Try again.";

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
export type Section = "title" | "language" | "id" | "nok";

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

/** The route's GET: never a decrypted value. */
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
  /** As PhoneField shows it: "772 000 000". */
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

async function token(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

async function errorWords(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { error?: unknown };
    return typeof body.error === "string" ? body.error : fallback;
  } catch {
    return fallback;
  }
}

export type LoadResult = { ok: true; onFile: OnFile } | { ok: false; message: string };

export async function loadDetails(): Promise<LoadResult> {
  if (!URL) return { ok: false, message: DETAILS_OFF };
  const tok = await token();
  if (!tok) return { ok: false, message: "Sign in again." };
  try {
    const res = await fetch(URL, { headers: { Authorization: `Bearer ${tok}` } });
    if (!res.ok) return { ok: false, message: await errorWords(res, FAILED) };
    return { ok: true, onFile: (await res.json()) as OnFile };
  } catch {
    return { ok: false, message: OFFLINE };
  }
}

export type SaveResult =
  | { ok: true; saved: Section[]; errors: Partial<Record<Section | "form", string>> }
  | { ok: false; message: string };

/**
 * One POST for the changed sections. A section the server refuses comes back
 * in `errors` while the others save. Not queued offline: an ID or next of kin
 * waiting on the phone in plaintext is worse than trying again.
 */
export async function saveDetails(body: DetailsBody): Promise<SaveResult> {
  if (!URL) return { ok: false, message: DETAILS_OFF };
  const tok = await token();
  if (!tok) return { ok: false, message: "Sign in again." };
  try {
    const res = await fetch(URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const out = (await res.json().catch(() => null)) as {
      saved?: Section[];
      errors?: Partial<Record<Section | "form", string>>;
      error?: string;
    } | null;
    if (!out || (!res.ok && !out.errors))
      return { ok: false, message: out?.error ?? "Couldn't save your details. Try again." };
    return { ok: true, saved: out.saved ?? [], errors: out.errors ?? {} };
  } catch {
    return { ok: false, message: OFFLINE };
  }
}
