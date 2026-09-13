/**
 * ha-upsert-session-template — create or edit one session_templates row,
 * then materialise its clinic_sessions for the next 14 days.
 *
 * "Every Tuesday, 08:00, 4 hours, cap 60, 36 bookable" — the weekly rule a
 * clinic_sessions row is stamped from (ADR 0087, proposal §5.4). The
 * capacity columns are COPIED into each instance, so editing the rule never
 * rewrites a published session; the nightly cron (`app/api/cron/
 * cleanup-drafts`) runs the same `expandSessionTemplate` over the same
 * horizon, which is what makes the two writers produce identical rows.
 *
 * Callable by a hospital_admin for a line at THEIR hospital, or by a
 * superadmin — the ha-update-department-policy shape, including
 * requireHospitalAdminScope. Audit verb `update_session_template`.
 *
 * Three rules the schema cannot express on its own:
 *
 *   capacity_booked has NO column DEFAULT (a default cannot read a sibling
 *   column), so when the admin leaves it blank this function supplies
 *   ceil(0.6 × capacity_total) — Part 8 #4's 60/40 split.
 *
 *   The service line must run in `session` mode. A template on a slot-mode
 *   line would publish sessions nothing offers and nothing books.
 *
 *   Deactivating a template cancels its FUTURE instances that hold no
 *   bookings and leaves the rest published — a session with patients in it
 *   is a clinician's problem to cancel (Gate E), not a side effect of
 *   editing a rule.
 */

import { z } from "npm:zod@4.4.3";

import { getCaller, hasRole, serviceClient } from "../_shared/auth.ts";
import { preflight } from "../_shared/cors.ts";
import {
  badRequest,
  conflict,
  forbidden,
  methodNotAllowed,
  notFound,
  ok,
  serverError,
  unauthorized,
} from "../_shared/errors.ts";
import { requireHospitalAdminScope } from "../_shared/hospital-admin-scope.ts";
import { makeLogger } from "../_shared/logger.ts";
import { networkContext, recordSaAudit } from "../_shared/sa-audit.ts";
import { DEFAULT_TIME_ZONE, expandSessionTemplate } from "../_shared/slots.ts";

const log = makeLogger("ha-upsert-session-template");

/** Same horizon as pt-request-appointment's PATIENT_BOOKING_HORIZON_DAYS. */
const MATERIALISE_HORIZON_DAYS = 14;

const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");

const InputSchema = z
  .object({
    hospital_id: z.string().uuid(),
    /** Omit to create; supply to edit. A supplied id must already exist. */
    id: z.string().uuid().optional(),
    service_line_id: z.string().uuid(),
    /** NULL is the §3.6 "unset" state; the console flags it at T−12h. */
    clinician_user_id: z.string().uuid().nullable().optional(),
    venue: z.string().trim().max(120).nullable().optional(),
    // Ranges mirror the DB CHECKs exactly (session_templates_weekday_range,
    // _start_range, _duration_range, _capacity_total_positive,
    // _capacity_booked_range, _interleave_positive, _overbooking_range,
    // _validity_order). A value that passes here and fails there would be a
    // 500 where a 400 was owed.
    weekday: z.number().int().min(1).max(7),
    start_minutes_local: z.number().int().min(0).max(1440),
    duration_minutes: z.number().int().min(15).max(720),
    capacity_total: z.number().int().min(1).max(32767),
    /** Omit for ceil(0.6 × capacity_total). */
    capacity_booked: z.number().int().min(1).max(32767).optional(),
    interleave_booked: z.number().int().min(1).max(32767).optional(),
    interleave_walk_in: z.number().int().min(1).max(32767).optional(),
    overbooking_factor: z.number().min(1).max(2).optional(),
    valid_from: IsoDate,
    valid_until: IsoDate.nullable().optional(),
    active: z.boolean(),
    reason: z.string().min(8, "Reason ≥ 8 chars required (audited)."),
  })
  .refine((v) => v.capacity_booked === undefined || v.capacity_booked <= v.capacity_total, {
    message: "Bookable share cannot exceed the session's total capacity.",
    path: ["capacity_booked"],
  })
  .refine((v) => !v.valid_until || v.valid_until >= v.valid_from, {
    message: "valid_until must be on or after valid_from.",
    path: ["valid_until"],
  });

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

  const caller = await getCaller(request);
  if (!caller) return unauthorized(init);

  const isSuperadmin = await hasRole(caller.id, "superadmin");
  if (!isSuperadmin) {
    if (!(await hasRole(caller.id, "hospital_admin", input.hospital_id))) {
      return forbidden(init);
    }
    const scope = await requireHospitalAdminScope(caller.id, input.hospital_id);
    if (!scope.ok) return forbidden(init, scope.reason);
  }

  const sb = serviceClient();

  // The tenant check happens against the line itself: without it a scoped
  // admin could post any line's uuid and publish sessions at another
  // hospital. The department comes from the line — never from the body.
  const { data: line, error: lineError } = await sb
    .from("service_lines")
    .select("id, hospital_id, department_id, capacity_mode, active")
    .eq("id", input.service_line_id)
    .maybeSingle();
  if (lineError) {
    log.error("service line lookup failed", { requestId, reason: lineError.message });
    return serverError("service line lookup failed", init);
  }
  if (!line) return notFound(init, "service line not found");
  if (line.hospital_id !== input.hospital_id) {
    return forbidden(init, "service line belongs to another hospital");
  }
  if (!line.active) return badRequest("This service line is inactive — reactivate it first.", init);
  if (line.capacity_mode !== "session") {
    return badRequest(
      `This service line runs in '${line.capacity_mode}' mode — session templates need 'session' mode.`,
      init,
    );
  }

  // A named clinician must be a CLINICAL cadre with a live affiliation at
  // this hospital — the boundary pt-request-appointment applies (ADR 0086).
  if (input.clinician_user_id) {
    const { data: aff, error: affError } = await sb
      .from("staff_affiliations")
      .select("id, cadres!inner(is_clinical)")
      .eq("user_id", input.clinician_user_id)
      .eq("hospital_id", input.hospital_id)
      .in("state", ["active", "approved"])
      .eq("cadres.is_clinical", true)
      .limit(1)
      .maybeSingle();
    if (affError) {
      log.error("affiliation lookup failed", { requestId, reason: affError.message });
      return serverError("affiliation lookup failed", init);
    }
    if (!aff) return badRequest("Clinician isn't an active clinician at this hospital.", init);
  }

  // Editing: the row must exist AT THIS HOSPITAL. A supplied id is never
  // inserted — client-chosen ids are not a thing here.
  let existing: Record<string, unknown> | null = null;
  if (input.id) {
    const { data, error } = await sb
      .from("session_templates")
      .select("*")
      .eq("id", input.id)
      .maybeSingle();
    if (error) {
      log.error("template read failed", { requestId, reason: error.message });
      return serverError("template read failed", init);
    }
    if (!data) return notFound(init, "session template not found");
    if (data.hospital_id !== input.hospital_id) {
      return forbidden(init, "session template belongs to another hospital");
    }
    // A rule stays on the line it was created for: its already-materialised
    // instances carry the old line's id, and a moved rule would publish
    // sessions under two lines at once. Deactivate and recreate instead.
    if (data.service_line_id !== input.service_line_id) {
      return badRequest(
        "A rule cannot move to another service line — deactivate it and create a new one.",
        init,
      );
    }
    existing = data;
  }
  const id = input.id ?? crypto.randomUUID();

  // The predictable conflict answered before the audit row exists;
  // session_templates_unique_rule remains the backstop for the race.
  const { data: clash, error: clashError } = await sb
    .from("session_templates")
    .select("id")
    .eq("service_line_id", input.service_line_id)
    .eq("weekday", input.weekday)
    .eq("start_minutes_local", input.start_minutes_local)
    .eq("valid_from", input.valid_from)
    .neq("id", id)
    .limit(1)
    .maybeSingle();
  if (clashError) {
    log.error("conflict pre-check failed", { requestId, reason: clashError.message });
    return serverError("template lookup failed", init);
  }
  if (clash) {
    return conflict(
      "A template on this line already starts at that time on that weekday from the same date.",
      init,
      { session_template_id: clash.id },
    );
  }

  const afterRow = {
    id,
    service_line_id: input.service_line_id,
    hospital_id: input.hospital_id,
    department_id: line.department_id,
    clinician_user_id: input.clinician_user_id ?? null,
    venue: input.venue || null,
    weekday: input.weekday,
    start_minutes_local: input.start_minutes_local,
    duration_minutes: input.duration_minutes,
    capacity_total: input.capacity_total,
    capacity_booked: input.capacity_booked ?? Math.ceil(0.6 * input.capacity_total),
    interleave_booked: input.interleave_booked ?? 2,
    interleave_walk_in: input.interleave_walk_in ?? 1,
    // numeric(3,2): round here so the audit shows what the column stores.
    overbooking_factor: Math.round((input.overbooking_factor ?? 1) * 100) / 100,
    valid_from: input.valid_from,
    valid_until: input.valid_until ?? null,
    active: input.active,
  };

  const auditShape = (row: Record<string, unknown> | null) =>
    row
      ? {
          service_line_id: row.service_line_id,
          clinician_user_id: row.clinician_user_id,
          venue: row.venue,
          weekday: row.weekday,
          start_minutes_local: row.start_minutes_local,
          duration_minutes: row.duration_minutes,
          capacity_total: row.capacity_total,
          capacity_booked: row.capacity_booked,
          interleave_booked: row.interleave_booked,
          interleave_walk_in: row.interleave_walk_in,
          overbooking_factor: Number(row.overbooking_factor),
          valid_from: row.valid_from,
          valid_until: row.valid_until,
          active: row.active,
        }
      : null;

  const { ipAddress, userAgent } = networkContext(request);
  try {
    await recordSaAudit({
      actorId: caller.id,
      // Both permitted by migration 0058's sa_audit_log_action_check /
      // _target_kind_check (GATED — until the owner applies it this insert
      // raises and the function fails closed, 0054's documented mode).
      action: "update_session_template",
      targetKind: "session_template",
      targetId: id,
      reason: input.reason,
      requestId,
      ipAddress,
      userAgent,
      // null before = a new rule. The audit shows creation as creation.
      beforeData: auditShape(existing),
      afterData: auditShape(afterRow),
    });
  } catch (e) {
    log.error("sa_audit failed; aborting", { requestId, reason: String(e) });
    return serverError("audit write failed", init);
  }

  const { error } = await sb.from("session_templates").upsert(afterRow, { onConflict: "id" });
  if (error) {
    if (error.code === "23505") {
      // Lost the race the pre-check exists to make rare.
      return conflict("Another save collided with this one — reload and try again.", init);
    }
    log.error("upsert failed", { requestId, reason: error.message });
    return serverError("session template update failed", init);
  }

  // ── Materialise ───────────────────────────────────────────────────
  // Same helper, same horizon, same zone as the nightly cron. Never
  // overwrite a published instance: the partial UNIQUE
  // clinic_sessions_template_start_unique makes a duplicate a 23505, and a
  // 23505 here means "already materialised" (by an earlier save or by the
  // cron), not an error.
  //
  // ponytail: one INSERT per occurrence (≤ 3 for a weekly rule over 14 days).
  // PostgREST cannot express `ON CONFLICT (…) WHERE template_id IS NOT NULL`,
  // which a partial unique index needs for inference, so a batched
  // ignoreDuplicates upsert would 500. Batch via an RPC if templates grow
  // sub-daily or the horizon grows.
  const now = new Date();
  let materialised = 0;
  let cancelled = 0;
  if (input.active) {
    const occurrences = expandSessionTemplate(
      {
        weekday: afterRow.weekday,
        startMinutesLocal: afterRow.start_minutes_local,
        durationMinutes: afterRow.duration_minutes,
        validFrom: afterRow.valid_from,
        validUntil: afterRow.valid_until,
      },
      now,
      new Date(now.getTime() + MATERIALISE_HORIZON_DAYS * 86_400_000),
      DEFAULT_TIME_ZONE,
    );
    for (const { startsAt, endsAt } of occurrences) {
      const { error: insertError } = await sb.from("clinic_sessions").insert({
        hospital_id: afterRow.hospital_id,
        department_id: afterRow.department_id,
        service_line_id: afterRow.service_line_id,
        template_id: id,
        clinician_user_id: afterRow.clinician_user_id,
        venue: afterRow.venue,
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        capacity_total: afterRow.capacity_total,
        capacity_booked: afterRow.capacity_booked,
        interleave_booked: afterRow.interleave_booked,
        interleave_walk_in: afterRow.interleave_walk_in,
        overbooking_factor: afterRow.overbooking_factor,
        status: "published",
      });
      if (insertError && insertError.code !== "23505") {
        log.error("materialise failed", { requestId, reason: insertError.message });
        return serverError("template saved but its sessions could not be published", init);
      }
      if (!insertError) materialised += 1;
    }
  } else {
    const { data: dropped, error: cancelError } = await sb
      .from("clinic_sessions")
      .update({
        status: "cancelled",
        cancelled_reason: input.reason,
        cancelled_by_user_id: caller.id,
        cancelled_at: now.toISOString(),
      })
      .eq("template_id", id)
      .eq("status", "published")
      .eq("booked_count", 0)
      .gt("starts_at", now.toISOString())
      .select("id");
    if (cancelError) {
      log.error("cancel empty instances failed", { requestId, reason: cancelError.message });
      return serverError(
        "template deactivated but its empty sessions could not be cancelled",
        init,
      );
    }
    cancelled = dropped?.length ?? 0;
  }

  log.info("session template updated", {
    requestId,
    hospital_id: input.hospital_id,
    service_line_id: input.service_line_id,
    session_template_id: id,
    created: !existing,
    active: input.active,
    materialised,
    cancelled,
  });
  return ok({ ok: true, id, created: !existing, materialised, cancelled }, init);
});
