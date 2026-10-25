"use server";

import type { DetailsSection } from "@patient-core/me-profile";
import { revalidatePath } from "next/cache";
import { isMissingTable, OFF_WORDS, PLACE_CONSENT, toDb } from "@patient-core/me-places";
import { householdProblem, toUgandaE164 } from "@patient-core/me-profile";
import { z } from "zod";

import { POST as profilePOST } from "@/app/api/mobile/profile/route";
import { ME_COPY as C } from "@/content/patient/me";
import { PATIENT_WEB_COPY } from "@/content/patient/web";
import { BOOKING_AGENT_RELATIONSHIPS } from "@/db/schema/provisional-patients";
import { logger } from "@/lib/logger";
import { asPatientRequest } from "@/lib/patient-web/me-data";
import { OTHER_MAX, toRow } from "@/lib/patient/reported-history";
import { requirePatientScope } from "@/lib/patient/scope";
import { callEdge } from "@/lib/supabase/edge";
import { createClient } from "@/lib/supabase/server";

/**
 * Me's writes, the phone's own: `patient_reported_history` inserts (an edit is a new row naming the old one,
 * which the database retires) and `active → removed` updates, and `patient_places` rows, through the
 * patient's own Supabase client under RLS (`mobile/src/data/{history,places}.ts`); SMS consent and the
 * household through their Edge Functions (S19, S20); "A few more details" through `/api/mobile/profile`,
 * which holds the encryption key. The server's own sentence is shown word for word.
 */

export type MeResult = { ok: true } | { ok: false; error: string };
const off = (error: { code?: string } | null, offWords: string, failed: string): MeResult =>
  isMissingTable(error) ? { ok: false, error: offWords } : { ok: false, error: failed };

function refresh() {
  revalidatePath("/pw/patient/me", "layout");
  revalidatePath("/patient/me", "layout");
}

/* ── History (ADR 0414) ─────────────────────────────────────────────── */

const Reported = z.object({
  kind: z.enum(["condition", "allergy", "family", "no_known_allergies"]),
  itemId: z.string().max(80).nullable(),
  otherText: z.string().max(OTHER_MAX).nullable(),
  onsetYear: z.number().int().min(1900).max(2200).nullable(),
  resolved: z.boolean().nullable(),
  relation: z.string().max(40).nullable(),
  reactions: z.array(z.string().max(80)).max(12),
  severity: z.string().max(20).nullable(),
});
const Rows = z.array(Reported).min(1).max(6);
const Id = z.string().uuid();

export async function saveReportedAction(rows: unknown, replaces?: string): Promise<MeResult> {
  const parsed = Rows.safeParse(rows);
  if (!parsed.success || (replaces !== undefined && !Id.safeParse(replaces).success))
    return { ok: false, error: C.saveFailed };
  const scope = await requirePatientScope();
  const supabase = await createClient();
  const { error } = await supabase.from("patient_reported_history").insert(
    parsed.data.map((i) => ({
      ...toRow(i),
      patient_user_id: scope.userId,
      ...(replaces ? { supersedes_id: replaces } : {}),
    })),
  );
  if (error) {
    logger.warn("patient-web.history_save_failed", { code: error.code ?? null });
    return off(error, C.historyOff, C.saveFailed);
  }
  refresh();
  return { ok: true };
}

/** Retire one (it stays in the audited history; the care team stops seeing it). */
export async function removeReportedAction(id: string): Promise<MeResult> {
  if (!Id.safeParse(id).success) return { ok: false, error: C.removeFailed };
  const scope = await requirePatientScope();
  const supabase = await createClient();
  const { error } = await supabase
    .from("patient_reported_history")
    .update({ state: "removed", removed_at: new Date().toISOString() })
    .eq("id", id)
    .eq("patient_user_id", scope.userId)
    .eq("state", "active");
  if (error) {
    logger.warn("patient-web.history_remove_failed", { code: error.code ?? null });
    return off(error, C.historyOff, C.removeFailed);
  }
  refresh();
  return { ok: true };
}

/* ── SMS consent (S20) ──────────────────────────────────────────────── */

export async function setSmsConsentAction(
  on: boolean,
): Promise<{ ok: true; on: boolean } | { ok: false; error: string }> {
  if (typeof on !== "boolean") return { ok: false, error: PATIENT_WEB_COPY.offline };
  await requirePatientScope();
  const res = await callEdge<{ on?: boolean }>("pt-set-sms-consent", { on }, "patient-web.me");
  if (!res.ok) return { ok: false, error: res.error };
  refresh();
  return { ok: true, on: res.data?.on ?? on };
}

/* ── Places (ADR 0402) ──────────────────────────────────────────────── */

const PlaceInput = z.object({
  kind: z.enum(["home", "work", "other"]),
  customLabel: z.string().max(80).nullable(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  address: z.string().max(400).nullable(),
});

async function clearHome(userId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("patient_places")
    .update({ is_home: false })
    .eq("patient_user_id", userId)
    .eq("is_home", true);
  return error;
}

/** A new place, saved only with PLACE_CONSENT. `makeHome` clears the old home first (one home). */
export async function addPlaceAction(
  input: unknown,
  makeHome: boolean,
  consented: boolean,
): Promise<MeResult> {
  const parsed = PlaceInput.safeParse(input);
  if (!parsed.success || consented !== true) return { ok: false, error: C.placeSaveFailed };
  const scope = await requirePatientScope();
  if (makeHome) {
    const e = await clearHome(scope.userId);
    if (e) return off(e, OFF_WORDS, C.placeSaveFailed);
  }
  const supabase = await createClient();
  const { error } = await supabase.from("patient_places").insert({
    ...toDb(parsed.data),
    patient_user_id: scope.userId,
    is_home: makeHome,
    consent_version: PLACE_CONSENT.version,
    consented_at: new Date().toISOString(),
  });
  if (error) return off(error, OFF_WORDS, C.placeSaveFailed);
  refresh();
  return { ok: true };
}

export async function updatePlaceAction(id: string, input: unknown): Promise<MeResult> {
  const parsed = PlaceInput.safeParse(input);
  if (!parsed.success || !Id.safeParse(id).success) return { ok: false, error: C.placeSaveFailed };
  const scope = await requirePatientScope();
  const supabase = await createClient();
  const { error } = await supabase
    .from("patient_places")
    .update(toDb(parsed.data))
    .eq("id", id)
    .eq("patient_user_id", scope.userId);
  if (error) return off(error, OFF_WORDS, C.placeSaveFailed);
  refresh();
  return { ok: true };
}

export async function deletePlaceAction(id: string): Promise<MeResult> {
  if (!Id.safeParse(id).success) return { ok: false, error: C.placeDeleteFailed };
  const scope = await requirePatientScope();
  const supabase = await createClient();
  const { error } = await supabase
    .from("patient_places")
    .delete()
    .eq("id", id)
    .eq("patient_user_id", scope.userId);
  if (error) return off(error, OFF_WORDS, C.placeDeleteFailed);
  refresh();
  return { ok: true };
}

export async function setHomeAction(id: string): Promise<MeResult> {
  if (!Id.safeParse(id).success) return { ok: false, error: C.homeFailed };
  const scope = await requirePatientScope();
  const e = await clearHome(scope.userId);
  if (e) return off(e, OFF_WORDS, C.homeFailed);
  const supabase = await createClient();
  const { error } = await supabase
    .from("patient_places")
    .update({ is_home: true })
    .eq("id", id)
    .eq("patient_user_id", scope.userId);
  if (error) return off(error, OFF_WORDS, C.homeFailed);
  refresh();
  return { ok: true };
}

/* ── A few more details (/api/mobile/profile) ───────────────────────── */

export type DetailsSave =
  | { ok: true; saved: DetailsSection[]; errors: Partial<Record<DetailsSection | "form", string>> }
  | { ok: false; message: string };

/** One POST for the changed sections; a refused section comes back in `errors` while the others save. */
export async function saveDetailsAction(body: unknown): Promise<DetailsSave> {
  if (!body || typeof body !== "object") return { ok: false, message: C.detailsSaveFailed };
  await requirePatientScope();
  const req = await asPatientRequest("/api/mobile/profile", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!req) return { ok: false, message: "Sign in again." };
  const res = await profilePOST(req);
  const out = (await res.json().catch(() => null)) as {
    saved?: DetailsSection[];
    errors?: Partial<Record<DetailsSection | "form", string>>;
    error?: string;
  } | null;
  if (!out || (!res.ok && !out.errors))
    return { ok: false, message: out?.error ?? C.detailsSaveFailed };
  refresh();
  return { ok: true, saved: out.saved ?? [], errors: out.errors ?? {} };
}

/* ── People I book for (S19) ────────────────────────────────────────── */

const Household = z.object({
  label: z.string().max(80),
  phone: z.string().max(40),
  age: z.string().max(3),
  dob: z.string().max(10),
  relationship: z.enum(BOOKING_AGENT_RELATIONSHIPS).nullable(),
  adult: z.boolean(),
});

/**
 * Adults only: the shared rule refuses a minor or a missing switch with the function's own sentence before
 * anything is sent, and `pt-add-household-member` decides again on the server (it mints the encrypted record).
 */
export async function addHouseholdAction(input: unknown): Promise<MeResult> {
  const parsed = Household.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Please check the values." };
  const d = parsed.data;
  const problem = householdProblem(d, new Date());
  if (problem) return { ok: false, error: problem };
  await requirePatientScope();
  const res = await callEdge(
    "pt-add-household-member",
    {
      member_label: d.label.trim(),
      phone_e164: toUgandaE164(d.phone),
      ...(d.dob.trim() ? { date_of_birth: d.dob.trim() } : {}),
      ...(d.age.trim() ? { age_years: Number(d.age.trim()) } : {}),
      declared_adult: d.adult,
      relationship: d.relationship,
    },
    "patient-web.household",
  );
  if (!res.ok) return { ok: false, error: res.error };
  refresh();
  revalidatePath("/patient/book");
  return { ok: true };
}
