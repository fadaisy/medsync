/**
 * system-propose-urgent-appointment — the producer-facing interface
 * for urgent appointments triggered by monitoring (or any future
 * automated source).
 *
 * Caller authorisation: this function isn't called by patients or
 * clinicians directly. It's called by:
 *   - a future monitoring/alerts producer (cron, webhook),
 *   - a superadmin manual override.
 *
 * Both routes require the SUPABASE_SERVICE_ROLE_KEY in the
 * Authorization header (or a superadmin JWT — handled the same as
 * other sa_audit_log writers). For a service-role call there's no
 * caller.id; we attribute the action to the system actor (a stable
 * uuid we pick from env, falling back to a sentinel).
 *
 * Widening fallback per PRD §1.4:
 *   1. Find the patient's primary clinician at their hospital (when
 *      that concept lands — today this is just "any active clinician
 *      in the department"). [Phase 1]
 *   2. Fallback: any active clinician at the requested department.
 *   3. Fallback: any active clinician at the hospital.
 *   For each candidate, find the EARLIEST bookable slot today
 *   (then tomorrow, then up to LOOKAHEAD_DAYS).
 *
 * Output: creates an appointment with origin='system_urgent',
 * priority='urgent', status='confirmed' (urgent skips manual
 * approval — the clinician sees it on their schedule with a red
 * accent dot and can decline/cancel if they need to).
 *
 * triggered_by_alert_id is stored as text — when monitoring lands
 * and an alerts table exists, a follow-up migration upgrades the
 * column to a real FK.
 */

import { z } from "npm:zod@4.4.3";

import { getCaller, hasRole, serviceClient } from "../_shared/auth.ts";
import { preflight } from "../_shared/cors.ts";
import {
  badRequest,
  forbidden,
  methodNotAllowed,
  notFound,
  ok,
  serverError,
  unauthorized,
} from "../_shared/errors.ts";
import { makeLogger } from "../_shared/logger.ts";
import { networkContext, recordSaAudit } from "../_shared/sa-audit.ts";

const log = makeLogger("system-propose-urgent-appointment");

const InputSchema = z.object({
  patient_user_id: z.string().uuid(),
  /** Hospital scope. Must match patient_profiles.primary_facility_id. */
  hospital_id: z.string().uuid(),
  /** Preferred department (e.g. the alert's clinical domain). Used as
   * the first try; the widening fallback expands when no slot exists. */
  preferred_department_id: z.string().uuid().nullable().optional(),
  /** Free text explaining WHY this is urgent — surfaces to clinician
   * + patient. Required ≥ 8 chars (audited). */
  reason_note: z.string().min(8),
  /** Opaque identifier for the upstream alert. Plain text until the
   * alerts table exists (then upgraded to a real FK). */
  alert_id_text: z.string().max(120).nullable().optional(),
  /** Minutes to spend on the slot. Falls back to 15. */
  slot_minutes: z.number().int().min(5).max(120).default(15),
});

const LOOKAHEAD_DAYS = 7;

interface Candidate {
  clinicianUserId: string;
  departmentId: string;
}

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("origin");
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
  const init = { origin, requestId };
  const pre = preflight(request);
  if (pre) return pre;
  if (request.method !== "POST") return methodNotAllowed(init);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("Body must be JSON", init);
  }
  const parsed = InputSchema.safeParse(body);
  if (!parsed.success) return badRequest("Invalid input", init, parsed.error.flatten());
  const input = parsed.data;

  // Caller must be a superadmin or a service-role call (the
  // monitoring producer). hasRole('superadmin') returns false for a
  // service-role caller without a JWT, but the role check via getCaller
  // also returns null for service-role calls — so for those, the
  // Authorization header IS the SUPABASE_SERVICE_ROLE_KEY and we
  // gate on that explicitly.
  const authHeader = request.headers.get("authorization") ?? "";
  const isServiceRole = authHeader === `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""}`;
  let callerId: string;

  if (isServiceRole) {
    // System call — attribute to a configurable system actor.
    callerId = Deno.env.get("MEDSYNC_SYSTEM_ACTOR_UUID") ?? "00000000-0000-0000-0000-000000000000";
  } else {
    const caller = await getCaller(request);
    if (!caller) return unauthorized(init);
    if (!(await hasRole(caller.id, "superadmin"))) {
      return forbidden(init, "service-role or superadmin required");
    }
    callerId = caller.id;
  }

  const sb = serviceClient();

  // Patient sanity check.
  const { data: patient, error: pErr } = await sb
    .from("patient_profiles")
    .select("id, primary_facility_id")
    .eq("id", input.patient_user_id)
    .maybeSingle();
  if (pErr) return serverError(pErr.message, init);
  if (!patient) return notFound(init, "patient not found");
  if (patient.primary_facility_id !== input.hospital_id) {
    return badRequest("patient's primary hospital doesn't match", init);
  }

  // Build widening fallback candidate set.
  // PHASE 1 hook: when patient_care_team or patient.primary_clinician
  // lands, the first slice of `candidates` is that primary clinician.
  // Until then, the fallback is identical for all patients at the
  // hospital.
  const candidates = await findCandidates(
    sb,
    input.hospital_id,
    input.preferred_department_id ?? null,
  );

  if (candidates.length === 0) {
    log.warn("no candidate clinicians", { requestId, hospital_id: input.hospital_id });
    return notFound(init, "no clinicians available at this hospital");
  }

  // For each candidate, try to find the earliest bookable slot in the
  // lookahead window. Stop as soon as one is found.
  const slot = await findEarliestSlot(sb, candidates, input.slot_minutes);
  if (!slot) {
    log.warn("no urgent slot found", { requestId, candidates: candidates.length });
    return notFound(
      init,
      "no urgent slot found in the next 7 days — surfacing as a flagged escalation",
    );
  }

  // Insert the urgent appointment. Status = confirmed (urgent skips
  // manual approval per the PRD). The clinician sees it on their
  // schedule with priority='urgent'.
  const { data: created, error: insertError } = await sb
    .from("appointments")
    .insert({
      hospital_id: input.hospital_id,
      department_id: slot.departmentId,
      patient_user_id: input.patient_user_id,
      clinician_user_id: slot.clinicianUserId,
      starts_at: slot.startsAtIso,
      ends_at: slot.endsAtIso,
      reason: "urgent_review",
      reason_note: input.reason_note,
      origin: "system_urgent",
      status: "confirmed",
      priority: "urgent",
      type: "in_person",
      triggered_by_alert_id: input.alert_id_text ?? null,
      created_by_user_id: callerId,
    })
    .select("id")
    .single();
  if (insertError || !created) {
    log.error("urgent appointment insert failed", { requestId, reason: insertError?.message });
    return serverError("could not create urgent appointment", init);
  }

  // Queue immediate-ish reminders: 30 min and 5 min before.
  const startsMs = new Date(slot.startsAtIso).getTime();
  const reminderRows = [30, 5]
    .map((m) => ({
      appointment_id: created.id,
      channel: "in_app" as const,
      scheduled_at: new Date(startsMs - m * 60_000).toISOString(),
    }))
    .filter((r) => new Date(r.scheduled_at).getTime() > Date.now());
  if (reminderRows.length > 0) {
    await sb.from("appointment_reminders").insert(reminderRows);
  }

  const { ipAddress, userAgent } = networkContext(request);
  try {
    await recordSaAudit({
      actorId: callerId,
      action: "propose_urgent_appointment",
      targetKind: "appointment",
      targetId: created.id,
      reason: `Urgent (system): ${input.reason_note.slice(0, 200)}`,
      requestId,
      ipAddress,
      userAgent,
      beforeData: null,
      afterData: {
        clinician_user_id: slot.clinicianUserId,
        department_id: slot.departmentId,
        starts_at: slot.startsAtIso,
        alert_id_text: input.alert_id_text ?? null,
      },
    });
  } catch (e) {
    log.warn("sa_audit failed (appointment already created)", {
      requestId,
      appointment_id: created.id,
      reason: String(e),
    });
  }

  log.info("urgent appointment proposed", {
    requestId,
    appointment_id: created.id,
    clinician_user_id: slot.clinicianUserId,
    starts_at: slot.startsAtIso,
  });
  return ok(
    {
      appointment_id: created.id,
      clinician_user_id: slot.clinicianUserId,
      department_id: slot.departmentId,
      starts_at: slot.startsAtIso,
    },
    init,
  );
});

async function findCandidates(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- service-role supabase client; typed `any` until generated Database types land
  sb: any,
  hospitalId: string,
  preferredDepartmentId: string | null,
): Promise<Candidate[]> {
  const { data: rows, error } = await sb
    .from("staff_affiliations")
    .select("user_id, department_id")
    .eq("hospital_id", hospitalId)
    .in("state", ["active", "approved"]);
  if (error || !rows) return [];

  const list: Candidate[] = rows.map((r: { user_id: string; department_id: string }) => ({
    clinicianUserId: r.user_id,
    departmentId: r.department_id,
  }));

  // Widening: preferred department first, then everyone else.
  return list.sort((a, b) => {
    if (preferredDepartmentId) {
      if (a.departmentId === preferredDepartmentId && b.departmentId !== preferredDepartmentId)
        return -1;
      if (b.departmentId === preferredDepartmentId && a.departmentId !== preferredDepartmentId)
        return 1;
    }
    return 0;
  });
}

async function findEarliestSlot(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any,
  candidates: ReadonlyArray<Candidate>,
  slotMinutes: number,
): Promise<{
  clinicianUserId: string;
  departmentId: string;
  startsAtIso: string;
  endsAtIso: string;
} | null> {
  const since = new Date();
  const until = new Date(Date.now() + LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000);
  const slotMs = slotMinutes * 60_000;

  const clinicianIds = Array.from(new Set(candidates.map((c) => c.clinicianUserId)));
  if (clinicianIds.length === 0) return null;

  const { data: blocks } = await sb
    .from("availability_blocks")
    .select("clinician_user_id, starts_at, ends_at")
    .in("clinician_user_id", clinicianIds)
    .eq("kind", "bookable")
    .eq("state", "active")
    .gte("ends_at", since.toISOString())
    .lt("starts_at", until.toISOString());

  const { data: live } = await sb
    .from("appointments")
    .select("clinician_user_id, starts_at, ends_at")
    .in("clinician_user_id", clinicianIds)
    .in("status", ["requested", "pending_approval", "confirmed", "arrived", "in_progress"])
    .gte("ends_at", since.toISOString())
    .lt("starts_at", until.toISOString());

  const blocksByClin = new Map<string, Array<{ s: number; e: number }>>();
  for (const b of (blocks ?? []) as Array<{
    clinician_user_id: string;
    starts_at: string;
    ends_at: string;
  }>) {
    const list = blocksByClin.get(b.clinician_user_id) ?? [];
    list.push({ s: new Date(b.starts_at).getTime(), e: new Date(b.ends_at).getTime() });
    blocksByClin.set(b.clinician_user_id, list);
  }
  const liveByClin = new Map<string, Array<{ s: number; e: number }>>();
  for (const a of (live ?? []) as Array<{
    clinician_user_id: string;
    starts_at: string;
    ends_at: string;
  }>) {
    const list = liveByClin.get(a.clinician_user_id) ?? [];
    list.push({ s: new Date(a.starts_at).getTime(), e: new Date(a.ends_at).getTime() });
    liveByClin.set(a.clinician_user_id, list);
  }

  // Walk candidates in widening-fallback order, pick the earliest
  // available slot.
  const nowMs = Date.now();
  let best: { clin: Candidate; s: number } | null = null;
  for (const cand of candidates) {
    const blockList = (blocksByClin.get(cand.clinicianUserId) ?? []).sort((a, b) => a.s - b.s);
    const liveList = liveByClin.get(cand.clinicianUserId) ?? [];
    for (const block of blockList) {
      const start = Math.max(block.s, nowMs);
      for (let s = start; s + slotMs <= block.e; s += slotMs) {
        const e = s + slotMs;
        const taken = liveList.some((a) => s < a.e && e > a.s);
        if (taken) continue;
        if (!best || s < best.s) best = { clin: cand, s };
        break; // earliest per block is enough
      }
      if (best && best.s === blockList[0]?.s) break;
    }
  }

  if (!best) return null;
  return {
    clinicianUserId: best.clin.clinicianUserId,
    departmentId: best.clin.departmentId,
    startsAtIso: new Date(best.s).toISOString(),
    endsAtIso: new Date(best.s + slotMs).toISOString(),
  };
}
