/**
 * ha-update-department-policy — upsert one department_scheduling_policy row.
 *
 * The department's booking rules: slot length, turnaround buffer, whether
 * requests auto-confirm, which weekdays and which local hours are bookable,
 * how many reminders a booking queues, and whether virtual is allowed.
 *
 * Callable by a hospital_admin for a department at THEIR hospital, or by a
 * superadmin. There is no self case — a clinician's own overrides live in
 * ha-set-clinician-settings and take precedence over this row anyway
 * (ADR 0029 §2, resolved in _shared/slots.ts).
 *
 * Two things this function is careful about, because both are load-bearing:
 *
 *   WEEKDAYS ARE ISO. 1 = Monday … 7 = Sunday, matching
 *   availability_blocks.recurrence_weekday and the slot engine. Migration
 *   0052 adds the CHECK; this is the codebase's first writer of the column,
 *   so it is also the first thing that can make the convention matter.
 *
 *   REMINDERS COST MONEY. The array's LENGTH is the number of messages per
 *   booking — pt-request-appointment and reschedule-appointment each insert
 *   one appointment_reminders row per positive entry. One or two, nothing
 *   else, and the schema says so rather than trusting the form.
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
import { requireHospitalAdminScope } from "../_shared/hospital-admin-scope.ts";
import { makeLogger } from "../_shared/logger.ts";
import { networkContext, recordSaAudit } from "../_shared/sa-audit.ts";

const log = makeLogger("ha-update-department-policy");

/** A reminder lead longer than a week outlives the 14-day booking horizon. */
const MAX_REMINDER_LEAD_MINUTES = 10_080;

const InputSchema = z
  .object({
    hospital_id: z.string().uuid(),
    department_id: z.string().uuid(),
    // Ranges mirror the DB CHECKs exactly (dept_policy_slot_range,
    // dept_policy_buffer_range, dept_policy_window_range, and 0052's
    // dept_policy_weekday_range / dept_policy_reminder_count). A value that
    // passes here and fails there would be a 500 where a 400 was owed.
    default_slot_minutes: z.number().int().min(5).max(240),
    default_buffer_minutes: z.number().int().min(0).max(60),
    default_auto_confirm: z.boolean(),
    bookable_weekdays: z.array(z.number().int().min(1).max(7)).min(1).max(7),
    bookable_start_minutes_local: z.number().int().min(0).max(1440),
    bookable_end_minutes_local: z.number().int().min(0).max(1440),
    reminder_lead_minutes: z
      .array(z.number().int().min(1).max(MAX_REMINDER_LEAD_MINUTES))
      .min(1)
      .max(2),
    allow_virtual: z.boolean(),
    notes: z.string().max(500).nullable().optional(),
    reason: z.string().min(8, "Reason ≥ 8 chars required (audited)."),
  })
  .refine((v) => v.bookable_end_minutes_local > v.bookable_start_minutes_local, {
    message: "Closing time must be after opening time.",
    path: ["bookable_end_minutes_local"],
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

  // department_scheduling_policy is keyed by department_id alone — it carries
  // no hospital_id — so the tenant check has to happen against the department
  // itself. Without this, a scoped admin could post any department's uuid and
  // rewrite another hospital's booking hours.
  const { data: department, error: deptError } = await sb
    .from("hospital_departments")
    .select("id, hospital_id, name")
    .eq("id", input.department_id)
    .maybeSingle();
  if (deptError) {
    log.error("department lookup failed", { requestId, reason: deptError.message });
    return serverError("department lookup failed", init);
  }
  if (!department) return notFound(init, "department not found");
  if (department.hospital_id !== input.hospital_id) {
    return forbidden(init, "department belongs to another hospital");
  }

  // Deduplicate + sort so the stored array is canonical: [1,1,5] and [5,1]
  // describe the same week, and an audit diff of two spellings of one policy
  // is noise.
  const weekdays = [...new Set(input.bookable_weekdays)].sort((a, b) => a - b);
  // Longest lead first — the order pt-request-appointment queues them in.
  const reminderLeads = [...new Set(input.reminder_lead_minutes)].sort((a, b) => b - a);

  const { data: existing, error: existingError } = await sb
    .from("department_scheduling_policy")
    .select("*")
    .eq("department_id", input.department_id)
    .maybeSingle();
  if (existingError) {
    log.error("policy read failed", { requestId, reason: existingError.message });
    return serverError("policy read failed", init);
  }

  const afterRow = {
    department_id: input.department_id,
    default_slot_minutes: input.default_slot_minutes,
    default_buffer_minutes: input.default_buffer_minutes,
    default_auto_confirm: input.default_auto_confirm,
    bookable_weekdays: weekdays,
    bookable_start_minutes_local: input.bookable_start_minutes_local,
    bookable_end_minutes_local: input.bookable_end_minutes_local,
    reminder_lead_minutes: reminderLeads,
    allow_virtual: input.allow_virtual,
    notes: input.notes ?? null,
    updated_by_user_id: caller.id,
  };

  const auditShape = (row: Record<string, unknown> | null) =>
    row
      ? {
          default_slot_minutes: row.default_slot_minutes,
          default_buffer_minutes: row.default_buffer_minutes,
          default_auto_confirm: row.default_auto_confirm,
          bookable_weekdays: row.bookable_weekdays,
          bookable_start_minutes_local: row.bookable_start_minutes_local,
          bookable_end_minutes_local: row.bookable_end_minutes_local,
          reminder_lead_minutes: row.reminder_lead_minutes,
          allow_virtual: row.allow_virtual,
        }
      : null;

  const { ipAddress, userAgent } = networkContext(request);
  try {
    await recordSaAudit({
      actorId: caller.id,
      // Already permitted by sa_audit_log_action_check (widened in 0028) and
      // by sa_audit_log_target_kind_check — no migration needed for either.
      action: "update_department_policy",
      targetKind: "department_scheduling_policy",
      targetId: input.department_id,
      reason: input.reason,
      requestId,
      ipAddress,
      userAgent,
      // null before = this department had NO policy row, which under ADR 0084
      // §14 means it was unrestricted. The audit has to be able to show that
      // the first save is a narrowing, not a tweak.
      beforeData: auditShape(existing),
      afterData: auditShape(afterRow),
    });
  } catch (e) {
    log.error("sa_audit failed; aborting", { requestId, reason: String(e) });
    return serverError("audit write failed", init);
  }

  const { error } = await sb
    .from("department_scheduling_policy")
    .upsert(afterRow, { onConflict: "department_id" });
  if (error) {
    log.error("upsert failed", { requestId, reason: error.message });
    return serverError("policy update failed", init);
  }

  log.info("department policy updated", {
    requestId,
    hospital_id: input.hospital_id,
    department_id: input.department_id,
    created: !existing,
    reminder_count: reminderLeads.length,
  });
  return ok({ ok: true, created: !existing }, init);
});
