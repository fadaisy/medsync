"use server";

import { SHARE_MAX_MINUTES } from "@patient-core/help-sos";
import { isMissingTable } from "@patient-core/me-places";
import { z } from "zod";

import { HELP_COPY } from "@/content/patient/help";
import { PATIENT_WEB_COPY } from "@/content/patient/web";
import { logger } from "@/lib/logger";
import { requirePatientScope } from "@/lib/patient/scope";
import { createClient } from "@/lib/supabase/server";

/**
 * "Share my live location" (ADR 0402, migration 0185), the phone's own writes (`mobile/src/data/location-share.ts`):
 * one row in `location_shares` under RLS, the database makes the token, the row keeps the latest fix only
 * (never a trail). The browser sends at most one fix every 20 s (`shouldWrite`) and only while the page is
 * open (§3). Nothing here logs a coordinate.
 */

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const S = HELP_COPY.share;

const Start = z.object({
  minutes: z.number().int().min(1).max(SHARE_MAX_MINUTES),
  purpose: z.enum(["emergency", "visit", "other"]),
});

export async function startShareAction(input: {
  minutes: number;
  purpose: "emergency" | "visit" | "other";
}): Promise<Result<{ id: string; token: string; endsAt: string }>> {
  const p = Start.safeParse(input);
  if (!p.success) return { ok: false, error: S.failed };
  const scope = await requirePatientScope();
  const supabase = await createClient();
  const now = new Date().toISOString();
  // One live share at a time, as the phone: the old one ends first.
  const stop = await supabase
    .from("location_shares")
    .update({ stopped_at: now })
    .eq("patient_user_id", scope.userId)
    .is("stopped_at", null);
  if (isMissingTable(stop.error)) return { ok: false, error: S.off };
  // Both ends from one clock, so the 8-hour window holds.
  const startedMs = Date.now();
  const { data, error } = await supabase
    .from("location_shares")
    .insert({
      patient_user_id: scope.userId,
      purpose: p.data.purpose,
      started_at: new Date(startedMs).toISOString(),
      ends_at: new Date(startedMs + p.data.minutes * 60_000).toISOString(),
      consent_version: S.consentVersion,
    })
    .select("id, token, ends_at")
    .single();
  if (error || !data) {
    if (!isMissingTable(error))
      logger.warn("patient_web.share.start_failed", { code: error?.code });
    return { ok: false, error: isMissingTable(error) ? S.off : S.failed };
  }
  return {
    ok: true,
    id: data.id as string,
    token: data.token as string,
    endsAt: data.ends_at as string,
  };
}

const Fix = z.object({
  id: z.uuid(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracy: z.number().min(0).max(1_000_000).nullable(),
  at: z.iso.datetime({ offset: true }),
});

export async function sendFixAction(input: z.input<typeof Fix>): Promise<Result> {
  const p = Fix.safeParse(input);
  if (!p.success) return { ok: false, error: PATIENT_WEB_COPY.offline };
  const supabase = await createClient();
  const { error } = await supabase
    .from("location_shares")
    .update({
      lat: Number(p.data.lat.toFixed(6)),
      lng: Number(p.data.lng.toFixed(6)),
      accuracy_m: p.data.accuracy === null ? null : Math.round(p.data.accuracy * 10) / 10,
      position_at: p.data.at,
    })
    .eq("id", p.data.id)
    .is("stopped_at", null);
  return error ? { ok: false, error: PATIENT_WEB_COPY.offline } : { ok: true };
}

export async function stopShareAction(id: string): Promise<Result> {
  if (!z.uuid().safeParse(id).success) return { ok: false, error: S.stopFailed };
  const supabase = await createClient();
  const { error } = await supabase
    .from("location_shares")
    .update({ stopped_at: new Date().toISOString() })
    .eq("id", id)
    .is("stopped_at", null);
  return error && !isMissingTable(error) ? { ok: false, error: S.stopFailed } : { ok: true };
}
