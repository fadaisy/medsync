"use server";

import type { HubResult } from "./_lib/types";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireHospitalAdminScope } from "@/lib/hospital-admin/scope";
import { logger } from "@/lib/logger";
import { materialiseClinicSessions } from "@/lib/scheduling/materialise-sessions";
import { closureImpact, loadItemHistory } from "@/lib/services/data";
import { callEdge } from "@/lib/supabase/edge";

/*
 * Departments & services hub — server actions (contract §7: scope here, everything else in the
 * Edge Function). The scope ALWAYS comes from requireHospitalAdminScope(); a hospital_id sent by the
 * page is overwritten, never trusted. ha-services-hub owns Zod, the role check, the audit row and
 * the write. Clinic days go through the booking engine's own ha-upsert-session-template; closures
 * run the booking engine's ha-cancel-session per affected session (CLN-6).
 */

const HUB_PATH = "/hospital-admin/departments";

function unwrap(data: unknown): Record<string, unknown> | undefined {
  const d = (data as { data?: unknown } | undefined)?.data;
  return d && typeof d === "object" ? (d as Record<string, unknown>) : undefined;
}

/** Every hub op, one entry point. `op` and its fields are validated by the Edge Function's Zod. */
export async function runHubOp(
  input: { op: string } & Record<string, unknown>,
): Promise<HubResult> {
  const scope = await requireHospitalAdminScope();
  const r = await callEdge(
    "ha-services-hub",
    { ...input, hospital_id: scope.hospitalId },
    "hospital-admin.hub",
  );
  if (!r.ok) return { ok: false, error: r.error };
  revalidatePath(HUB_PATH, "layout");
  return { ok: true, data: unwrap(r.data) };
}

/** A clinic going live publishes its days now (the nightly job's code, idempotent), not at 02:00. */
export async function setClinicLive(serviceLineId: string, live: boolean): Promise<HubResult> {
  const r = await runHubOp({ op: "update_clinic", service_line_id: serviceLineId, live });
  if (!r.ok || !live) return r;
  try {
    await materialiseClinicSessions();
  } catch (e) {
    logger.warn("hub.materialise_on_live.failed", { reason: String(e) });
  }
  return r;
}

const ClinicDay = z.object({
  id: z.string().uuid().optional(),
  service_line_id: z.string().uuid(),
  weekday: z.number().int().min(1).max(7),
  start_minutes_local: z.number().int().min(0).max(1440),
  duration_minutes: z.number().int().min(15).max(720),
  capacity_total: z.number().int().min(1).max(32767),
  capacity_booked: z.number().int().min(1).max(32767).optional(),
  valid_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  valid_until: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  repeat_every_weeks: z.number().int().min(1).max(8).optional(),
  nth_weekday: z.number().int().min(-1).max(5).nullable().optional(),
  runs_on_holidays: z.boolean().optional(),
  place_id: z.string().uuid().nullable().optional(),
  clinician_user_id: z.string().uuid().nullable().optional(),
  active: z.boolean(),
});

/** Clinic days = the booking engine's session templates (CLN-2). One writer: ha-upsert-session-template. */
export async function saveClinicDay(input: z.input<typeof ClinicDay>): Promise<HubResult> {
  const parsed = ClinicDay.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the clinic day." };
  const scope = await requireHospitalAdminScope();
  const day = parsed.data;
  const r = await callEdge(
    "ha-upsert-session-template",
    {
      ...day,
      hospital_id: scope.hospitalId,
      reason: day.id
        ? "Clinic day changed in Departments & services"
        : "Clinic day added in Departments & services",
    },
    "hospital-admin.hub",
  );
  if (!r.ok) return { ok: false, error: r.error };
  revalidatePath(HUB_PATH, "layout");
  revalidatePath("/hospital-admin/scheduling");
  return { ok: true, data: unwrap(r.data) };
}

const Closure = z.object({
  scope: z.enum(["hospital", "department", "ward", "clinic"]),
  target_id: z.string().uuid().nullable(),
  starts_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  ends_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: z
    .string()
    .trim()
    .min(10, "Say why in a sentence — patients are told the day is cancelled.")
    .max(280),
});

/** Consequence first (§4 rule 7): the sessions and bookings a closure would cancel. */
export async function previewClosure(input: Omit<z.input<typeof Closure>, "reason">) {
  const parsed = Closure.omit({ reason: true }).safeParse(input);
  if (!parsed.success)
    return { ok: false as const, error: "Choose what is closing and the dates." };
  if (parsed.data.ends_on < parsed.data.starts_on)
    return { ok: false as const, error: "The closure ends before it starts." };
  const scope = await requireHospitalAdminScope();
  const impact = await closureImpact(
    scope.hospitalId,
    parsed.data.scope,
    parsed.data.target_id,
    parsed.data.starts_on,
    parsed.data.ends_on,
  );
  return { ok: true as const, sessions: impact.sessions, bookings: impact.bookings };
}

/**
 * Records the closure (so both expansion paths skip those days from now on), then runs the booking
 * engine's sensitive cancel flow for every published session inside it: counts, reason, patients
 * told, rebooking offered. A session that fails to cancel is reported, never hidden.
 */
export async function addClosure(input: z.input<typeof Closure>): Promise<HubResult> {
  const parsed = Closure.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the closure." };
  const c = parsed.data;
  const scope = await requireHospitalAdminScope();
  const impact = await closureImpact(
    scope.hospitalId,
    c.scope,
    c.target_id,
    c.starts_on,
    c.ends_on,
  );
  const recorded = await runHubOp({
    op: "add_closure",
    scope: c.scope,
    target_id: c.target_id,
    starts_on: c.starts_on,
    ends_on: c.ends_on,
    reason: c.reason,
  });
  if (!recorded.ok) return recorded;
  let cancelled = 0;
  const failed: string[] = [];
  for (const sessionId of impact.sessionIds) {
    const r = await callEdge(
      "ha-cancel-session",
      { session_id: sessionId, reason: c.reason },
      "hospital-admin.hub",
    );
    if (r.ok) cancelled++;
    else failed.push(r.error);
  }
  revalidatePath("/hospital-admin/scheduling");
  if (failed.length) {
    return {
      ok: false,
      error: `The closure is saved and ${cancelled} session(s) were cancelled, but ${failed.length} could not be: ${failed[0]}`,
    };
  }
  return { ok: true, data: { cancelled, bookings: impact.bookings } };
}

/** A panel's History tab: the audited changes that name this item (read-only, this hospital only). */
export async function itemHistory(itemId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(itemId)) return [];
  const scope = await requireHospitalAdminScope();
  return loadItemHistory(scope.hospitalId, itemId);
}
