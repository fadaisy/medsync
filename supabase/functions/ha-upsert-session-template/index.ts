/**
 * ha-upsert-session-template — create or edit one session_templates row,
 * then materialise its clinic_sessions for the next 14 days.
 *
 * "Every Tuesday, 08:00, 4 hours, cap 60, 36 bookable" — the weekly rule a
 * clinic_sessions row is stamped from (ADR 0087, proposal §5.4). The
 * capacity columns are COPIED into each instance, so editing the rule never
 * rewrites a session with bookings in it (empty ones follow the rule — see
 * below); the nightly cron (`app/api/cron/cleanup-drafts`) runs the same
 * `expandSessionTemplate` over the same horizon, which is what makes the two
 * writers produce identical rows.
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
 *
 *   Editing a template (Gate H ruling, ADR 0094): "empty future instances
 *   follow the new rule; booked ones keep their promise." A published
 *   future instance with booked_count = 0 is re-stamped from the new rule —
 *   in place when the rule still names its start (the partial UNIQUE on
 *   (template_id, starts_at) refuses a cancel-and-reinsert at the same
 *   instant), cancelled by the deactivation path when it no longer does.
 *   An instance holding a booking is not touched; the INSERT skips it.
 */
import type { ClosureWindow } from "../_shared/services-hub.ts";
import { z } from "npm:zod@4.4.3";

import { PATIENT_BOOKING_HORIZON_DAYS } from "../_shared/booking-horizon.ts";
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
import { skipDayFor } from "../_shared/services-hub.ts";
import { DEFAULT_TIME_ZONE, expandSessionTemplate } from "../_shared/slots.ts";

const log = makeLogger("ha-upsert-session-template");

/** Same horizon as pt-request-appointment's PATIENT_BOOKING_HORIZON_DAYS. */
const MATERIALISE_HORIZON_DAYS = PATIENT_BOOKING_HORIZON_DAYS;

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
    // CLN-3 (0080): every N weeks, or the nth weekday of the month; one-off = valid_from = valid_until.
    repeat_every_weeks: z.number().int().min(1).max(8).optional(),
    nth_weekday: z
      .union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(-1)])
      .nullable()
      .optional(),
    // CLN-4 (0080): public holidays are skipped unless the clinic runs on them.
    runs_on_holidays: z.boolean().optional(),
    place_id: z.string().uuid().nullable().optional(),
    reason: z.string().min(8, "Reason ≥ 8 chars required (audited)."),
  })
  .refine((v) => !(v.nth_weekday != null && (v.repeat_every_weeks ?? 1) > 1), {
    message: "Choose every N weeks or the nth weekday of the month, not both.",
    path: ["nth_weekday"],
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
    .select("id, hospital_id, department_id, unit_id, capacity_mode, active, archived_at")
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
  // 0080: a Planned clinic (inactive) may hold its days before it goes live; its sessions publish
  // once it is live (the nightly materialiser, or the hub's go-live). An archived one may not.
  if (line.archived_at) return badRequest("This clinic is archived — restore it first.", init);
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

  // The place must be this hospital's; its name becomes the venue existing readers show.
  let venue = input.venue || null;
  if (input.place_id) {
    const { data: place } = await sb
      .from("hospital_places")
      .select("id, name")
      .eq("id", input.place_id)
      .eq("hospital_id", input.hospital_id)
      .maybeSingle();
    if (!place) return badRequest("That place isn't at this hospital.", init);
    venue = venue ?? place.name;
  }

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
    venue,
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
    repeat_every_weeks: input.repeat_every_weeks ?? 1,
    nth_weekday: input.nth_weekday ?? null,
    runs_on_holidays: input.runs_on_holidays ?? false,
    place_id: input.place_id ?? null,
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
          repeat_every_weeks: row.repeat_every_weeks,
          nth_weekday: row.nth_weekday,
          runs_on_holidays: row.runs_on_holidays,
          place_id: row.place_id,
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
  // overwrite an instance with bookings in it: the partial UNIQUE
  // clinic_sessions_template_start_unique makes a duplicate a 23505, and a
  // 23505 here means "already materialised" (by an earlier save or by the
  // cron), not an error. An EMPTY published instance of an edited rule is
  // re-stamped in place before the INSERT loop reaches it (ADR 0094).
  //
  // ponytail: one INSERT per occurrence (≤ 3 for a weekly rule over 14 days).
  // PostgREST cannot express `ON CONFLICT (…) WHERE template_id IS NOT NULL`,
  // which a partial unique index needs for inference, so a batched
  // ignoreDuplicates upsert would 500. Batch via an RPC if templates grow
  // sub-daily or the horizon grows.
  const now = new Date();
  const nowIso = now.toISOString();
  let materialised = 0;
  let restamped = 0;
  let cancelled = 0;

  // The deactivation path, and what an edit does to empty instances the new
  // rule no longer names. Guarded on booked_count = 0 in the UPDATE itself so
  // a place taken since the read is a promise kept, not a booking cancelled.
  const cancelEmpty = async (ids: string[] | null) => {
    let q = sb
      .from("clinic_sessions")
      .update({
        status: "cancelled",
        cancelled_reason: input.reason,
        cancelled_by_user_id: caller.id,
        cancelled_at: nowIso,
      })
      .eq("template_id", id)
      .eq("status", "published")
      .eq("booked_count", 0)
      .gt("starts_at", nowIso);
    if (ids) q = q.in("id", ids);
    const { data, error } = await q.select("id");
    if (error) throw new Error(error.message);
    return data?.length ?? 0;
  };

  if (input.active && line.active) {
    // CLN-4: public holidays (unless the clinic runs on them) and closures (always) are skipped.
    const horizonEnd = new Date(now.getTime() + MATERIALISE_HORIZON_DAYS * 86_400_000);
    const ymd = (d: Date) => d.toISOString().slice(0, 10);
    const [{ data: holidays, error: hErr }, { data: closures, error: cErr }] = await Promise.all([
      sb
        .from("public_holidays")
        .select("holiday_date")
        .gte("holiday_date", ymd(now))
        .lte("holiday_date", ymd(horizonEnd)),
      sb
        .from("service_closures")
        .select("scope, department_id, service_line_id, starts_on, ends_on")
        .eq("hospital_id", input.hospital_id)
        .is("lifted_at", null)
        .lte("starts_on", ymd(horizonEnd))
        .gte("ends_on", ymd(now)),
    ]);
    if (hErr || cErr) {
      log.error("calendar read failed", { requestId, reason: (hErr ?? cErr)!.message });
      return serverError("template saved but the calendar could not be read", init);
    }
    const skip = skipDayFor({
      holidays: (holidays ?? []).map((h: { holiday_date: string }) => h.holiday_date),
      closures: (closures ?? []).map(
        (c: {
          scope: string;
          department_id: string | null;
          service_line_id: string | null;
          starts_on: string;
          ends_on: string;
        }): ClosureWindow => ({
          scope: c.scope as ClosureWindow["scope"],
          departmentId: c.department_id,
          serviceLineId: c.service_line_id,
          startsOn: c.starts_on,
          endsOn: c.ends_on,
        }),
      ),
      runsOnHolidays: afterRow.runs_on_holidays,
      departmentIds: [line.department_id, ...(line.unit_id ? [line.unit_id] : [])],
      serviceLineId: line.id,
    });
    const occurrences = expandSessionTemplate(
      {
        weekday: afterRow.weekday,
        startMinutesLocal: afterRow.start_minutes_local,
        durationMinutes: afterRow.duration_minutes,
        validFrom: afterRow.valid_from,
        validUntil: afterRow.valid_until,
        repeatEveryWeeks: afterRow.repeat_every_weeks,
        nthWeekday: afterRow.nth_weekday,
      },
      now,
      horizonEnd,
      DEFAULT_TIME_ZONE,
      skip,
    );
    // The columns an instance copies from its rule; starts_at/ends_at are per occurrence.
    const stamp = {
      clinician_user_id: afterRow.clinician_user_id,
      venue: afterRow.venue,
      capacity_total: afterRow.capacity_total,
      capacity_booked: afterRow.capacity_booked,
      interleave_booked: afterRow.interleave_booked,
      interleave_walk_in: afterRow.interleave_walk_in,
      overbooking_factor: afterRow.overbooking_factor,
    };

    // An edit: the rule's empty future instances, by start instant.
    //
    // ponytail: a cancelled instance keeps its (template_id, starts_at), so a
    // rule edited A → B → A leaves A's day cancelled (the INSERT sees 23505)
    // — the same hole deactivate-then-reactivate has had since Gate C, and
    // one the console fixes by deactivating the rule and creating a new one.
    // Reviving cancelled rows is not safe here: ha-cancel-session also zeroes
    // booked_count, and its patients were told that day is gone.
    const emptyByStart = new Map<number, string>();
    if (existing) {
      const { data: empties, error: emptiesError } = await sb
        .from("clinic_sessions")
        .select("id, starts_at")
        .eq("template_id", id)
        .eq("status", "published")
        .eq("booked_count", 0)
        .gt("starts_at", nowIso);
      if (emptiesError) {
        log.error("empty instances read failed", { requestId, reason: emptiesError.message });
        return serverError("template saved but its sessions could not be re-published", init);
      }
      for (const e of empties ?? []) emptyByStart.set(new Date(e.starts_at).getTime(), e.id);
    }

    for (const { startsAt, endsAt } of occurrences) {
      const inPlace = emptyByStart.get(startsAt.getTime());
      if (inPlace) {
        emptyByStart.delete(startsAt.getTime());
        const { data: touched, error: updateError } = await sb
          .from("clinic_sessions")
          .update({ ...stamp, ends_at: endsAt.toISOString() })
          .eq("id", inPlace)
          .eq("status", "published")
          .eq("booked_count", 0)
          .select("id");
        if (updateError) {
          log.error("re-stamp failed", { requestId, reason: updateError.message });
          return serverError("template saved but its sessions could not be re-published", init);
        }
        restamped += touched?.length ?? 0;
        continue;
      }
      const { error: insertError } = await sb.from("clinic_sessions").insert({
        ...stamp,
        hospital_id: afterRow.hospital_id,
        department_id: afterRow.department_id,
        service_line_id: afterRow.service_line_id,
        template_id: id,
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        status: "published",
      });
      if (insertError && insertError.code !== "23505") {
        log.error("materialise failed", { requestId, reason: insertError.message });
        return serverError("template saved but its sessions could not be published", init);
      }
      if (!insertError) materialised += 1;
    }

    // Empty instances the new rule no longer names go the way deactivation
    // sends them.
    if (emptyByStart.size > 0) {
      try {
        cancelled = await cancelEmpty([...emptyByStart.values()]);
      } catch (e) {
        log.error("cancel stale instances failed", { requestId, reason: String(e) });
        return serverError("template saved but its stale sessions could not be cancelled", init);
      }
    }
  } else if (!input.active) {
    try {
      cancelled = await cancelEmpty(null);
    } catch (e) {
      log.error("cancel empty instances failed", { requestId, reason: String(e) });
      return serverError(
        "template deactivated but its empty sessions could not be cancelled",
        init,
      );
    }
  }

  log.info("session template updated", {
    requestId,
    hospital_id: input.hospital_id,
    service_line_id: input.service_line_id,
    session_template_id: id,
    created: !existing,
    active: input.active,
    materialised,
    restamped,
    cancelled,
  });
  return ok({ ok: true, id, created: !existing, materialised, restamped, cancelled }, init);
});
