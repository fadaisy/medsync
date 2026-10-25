import "server-only";

import type { MobileVisitSummary } from "@/app/api/mobile/visit-summaries/_lib/shape";
import type { ReportedItem } from "@/lib/patient/reported-history";
import type { Place } from "@patient-core/me-places";
import type { OnFile } from "@patient-core/me-profile";
import { fromDb, isMissingTable, sortPlaces } from "@patient-core/me-places";

import { GET as profileGET } from "@/app/api/mobile/profile/route";
import { toMobileSummary } from "@/app/api/mobile/visit-summaries/_lib/shape";
import { fetchSmsConsentVersion, hasSmsConsent } from "@/lib/notifications/consent";
import { fromRow, REPORTED_COLUMNS } from "@/lib/patient/reported-history";
import {
  getVisitSummary,
  listVisitSummaries,
  prescriptionsInTracker,
} from "@/lib/patient/visit-summaries";
import { takeHomePrescriptionIds } from "@/lib/patient/visit-summary";
import { createClient } from "@/lib/supabase/server";

/**
 * Me's reads, the phone's own (`mobile/src/data/{me,history,places,records,profile-details}.ts`): the patient's
 * own rows through their own Supabase client under RLS; the visit records through the web's decrypting
 * readers (as `/api/mobile/visit-summaries` does); the profile's on-file flags through `/api/mobile/profile`
 * itself, called with the session's token, so the ID and next of kin are never decrypted here.
 */

export type Loaded<T> = { status: "ready"; value: T } | { status: "off" } | { status: "error" };

/** The card's identity: `fetchPatientProfile()` on the phone, word for word in its select. */
export interface CardIdentity {
  code: string | null;
  facility: string | null;
  emergencyPhone: string | null;
  sex: string | null;
  dob: string | null;
  /** The older free-text `known_conditions`, before ADR 0414. */
  conditions: string[];
}

const one = <T>(v: T | T[] | null | undefined): T | null =>
  Array.isArray(v) ? (v[0] ?? null) : (v ?? null);

type Hospital = { name: string; emergency_phone: string | null };

export async function loadCardIdentity(userId: string): Promise<CardIdentity | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("patient_profiles")
    .select("patient_code, sex, date_of_birth, known_conditions, hospitals(name, emergency_phone)")
    .eq("id", userId)
    .maybeSingle();
  if (error || !data) return null;
  const hospital = one(data.hospitals as unknown as Hospital | Hospital[] | null);
  return {
    code: data.patient_code ?? null,
    facility: hospital?.name ?? null,
    emergencyPhone: hospital?.emergency_phone ?? null,
    sex: data.sex ?? null,
    dob: data.date_of_birth ?? null,
    conditions: ((data.known_conditions as string[] | null) ?? []).filter((c) => c.trim()),
  };
}

/** `patient_reported_history`, active rows, oldest first (ADR 0414). */
export async function loadHistory(userId: string): Promise<Loaded<ReportedItem[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("patient_reported_history")
    .select(REPORTED_COLUMNS)
    .eq("patient_user_id", userId)
    .eq("state", "active")
    .order("created_at", { ascending: true });
  if (isMissingTable(error)) return { status: "off" };
  if (error) return { status: "error" };
  return {
    status: "ready",
    value: (data ?? []).flatMap((r) => fromRow(r as Record<string, unknown>) ?? []),
  };
}

/** `patient_places`, home first (ADR 0402). */
export async function loadPlaces(userId: string): Promise<Loaded<Place[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("patient_places")
    .select("id, kind, custom_label, lat, lng, address, is_home")
    .eq("patient_user_id", userId)
    .order("created_at", { ascending: true });
  if (isMissingTable(error)) return { status: "off" };
  if (error) return { status: "error" };
  return { status: "ready", value: sortPlaces((data ?? []).map((r) => fromDb(r))) };
}

/** SMS about my bookings: null until the consent text is seeded (the old settings page hides the row too). */
export async function loadSms(userId: string): Promise<boolean | null> {
  const version = await fetchSmsConsentVersion();
  return version ? hasSmsConsent(userId) : null;
}

/** The caller's own shared visit summaries, newest first, as `/api/mobile/visit-summaries` GET builds them. */
export async function loadRecords(userId: string): Promise<MobileVisitSummary[]> {
  const list = await listVisitSummaries(userId);
  const opened = await Promise.all(
    list.map(async (meta) => ({ meta, content: await getVisitSummary(userId, meta.id) })),
  );
  const ready = opened.flatMap((o) => (o.content ? [{ meta: o.meta, content: o.content }] : []));
  const inTracker = await prescriptionsInTracker(
    userId,
    ready.flatMap((o) => takeHomePrescriptionIds(o.content)),
  );
  return ready.map((o) => toMobileSummary(o.meta, o.content, inTracker));
}

export async function loadRecord(userId: string, id: string): Promise<MobileVisitSummary | null> {
  const meta = (await listVisitSummaries(userId)).find((s) => s.id === id);
  const content = meta ? await getVisitSummary(userId, id) : null;
  if (!meta || !content) return null;
  const inTracker = await prescriptionsInTracker(userId, takeHomePrescriptionIds(content));
  return toMobileSummary(meta, content, inTracker);
}

/** A request to a `/api/mobile/*` handler as this session's patient (the routes read a bearer token). */
export async function asPatientRequest(
  path: string,
  init: RequestInit = {},
): Promise<Request | null> {
  const supabase = await createClient();
  const token = (await supabase.auth.getSession()).data.session?.access_token;
  if (!token) return null;
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  return new Request(new URL(path, "http://medsync.internal"), { ...init, headers });
}

/** What is on file (never a decrypted value), or the route's own sentence. */
export async function loadOnFile(): Promise<
  { ok: true; onFile: OnFile } | { ok: false; message: string }
> {
  const req = await asPatientRequest("/api/mobile/profile");
  if (!req) return { ok: false, message: "Sign in again." };
  const res = await profileGET(req);
  const body = (await res.json().catch(() => null)) as (OnFile & { error?: string }) | null;
  if (!res.ok || !body)
    return { ok: false, message: body?.error ?? "Couldn't load your details. Try again." };
  return { ok: true, onFile: body };
}
