import type { DetailsBody, OnFile } from "@patient-core/me-profile";

import { supabase } from "@/lib/supabase";

export type {
  DetailsBody,
  DetailsForm,
  IdType,
  NokRelationship,
  OnFile,
  TitleCode,
} from "@patient-core/me-profile";
export {
  ID_TYPES,
  LANGUAGES,
  RELATIONSHIPS,
  TITLES,
  detailsBody,
  formFrom,
  languageOf,
} from "@patient-core/me-profile";

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

export type Section = "title" | "language" | "id" | "nok";

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
