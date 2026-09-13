/**
 * ha-upsert-service-line — create or edit one service_lines row.
 *
 * The line is the unit the capacity model hangs on (ADR 0087, proposal
 * §5.2): which of the three capacity modes it runs in, its time-to-care
 * target, continuity default, confidentiality flag, payment posture and
 * the Appendix A reasons it accepts.
 *
 * Callable by a hospital_admin for a department at THEIR hospital, or by a
 * superadmin — the ha-update-department-policy shape, including
 * requireHospitalAdminScope. Audit verb `update_service_line`.
 *
 * Two things this function refuses on purpose:
 *
 *   'urgent_review' IN reason_codes. That code is system-only (0053) — a
 *   line that "accepted" it would let a patient self-select an urgency the
 *   engine reserves for a clinician's proposal.
 *
 *   A second default line. `service_lines_one_default_per_hospital` is the
 *   backstop; the pre-check turns the predictable case into a 409 BEFORE the
 *   audit row is written, so the log never claims a save that was refused.
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
import { PATIENT_REASON_CODES } from "../_shared/sessions-sql.ts";

const log = makeLogger("ha-upsert-service-line");

const InputSchema = z
  .object({
    hospital_id: z.string().uuid(),
    /** Omit to create; supply to edit. A supplied id must already exist. */
    id: z.string().uuid().optional(),
    department_id: z.string().uuid(),
    name: z.string().trim().min(2).max(120),
    /** Omit to derive from `name`. Same alphabet as hospital slugs. */
    slug: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "lowercase letters, digits and single hyphens")
      .max(60)
      .optional(),
    // Ranges mirror the DB CHECKs exactly (service_lines_capacity_mode_check,
    // service_lines_time_to_care_range, service_lines_payment_posture_check,
    // service_lines_fee_nonneg / _deposit_nonneg / _fee_required and
    // service_lines_reason_codes_check). A value that passes here and fails
    // there would be a 500 where a 400 was owed.
    capacity_mode: z.enum(["slot", "session", "open_queue"]),
    time_to_care_days: z.number().int().min(1).max(365),
    continuity_default: z.boolean(),
    confidential: z.boolean(),
    payment_posture: z.enum(["none", "deposit", "full"]),
    fee_ugx: z.number().int().min(0).nullable().optional(),
    deposit_ugx: z.number().int().min(0).nullable().optional(),
    // The 13 Appendix A patient codes plus the shipped 'other' catch-all
    // (the backfilled lines carry it, and the CHECK admits it). Never
    // 'urgent_review' — z.enum makes that structural, not a runtime branch.
    reason_codes: z.array(z.enum([...PATIENT_REASON_CODES, "other"])).min(1),
    is_default: z.boolean(),
    active: z.boolean(),
    reason: z.string().min(8, "Reason ≥ 8 chars required (audited)."),
  })
  .refine((v) => v.payment_posture === "none" || v.fee_ugx != null, {
    message: "A fee is required unless the payment posture is 'none'.",
    path: ["fee_ugx"],
  })
  .refine((v) => v.payment_posture !== "deposit" || v.deposit_ugx != null, {
    message: "A deposit amount is required for the 'deposit' posture.",
    path: ["deposit_ugx"],
  });

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
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

  // The tenant check happens against the department itself: without it a
  // scoped admin could post any department's uuid and hang a line off
  // another hospital's department.
  const { data: department, error: deptError } = await sb
    .from("hospital_departments")
    .select("id, hospital_id")
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

  // Editing: the row must exist AT THIS HOSPITAL. A supplied id is never
  // inserted — client-chosen ids are not a thing here.
  let existing: Record<string, unknown> | null = null;
  if (input.id) {
    const { data, error } = await sb
      .from("service_lines")
      .select("*")
      .eq("id", input.id)
      .maybeSingle();
    if (error) {
      log.error("service line read failed", { requestId, reason: error.message });
      return serverError("service line read failed", init);
    }
    if (!data) return notFound(init, "service line not found");
    if (data.hospital_id !== input.hospital_id) {
      return forbidden(init, "service line belongs to another hospital");
    }
    existing = data;
  }
  const id = input.id ?? crypto.randomUUID();
  const slug = input.slug ?? slugify(input.name);
  if (!slug) return badRequest("Name must contain at least one letter or digit.", init);

  // Predictable conflicts answered before the audit row exists. The UNIQUE
  // constraint and the partial index remain the backstop for the race.
  const { data: clashes, error: clashError } = await sb
    .from("service_lines")
    .select("id, slug, is_default")
    .eq("hospital_id", input.hospital_id)
    .neq("id", id)
    .or(`slug.eq.${slug},is_default.eq.true`);
  if (clashError) {
    log.error("conflict pre-check failed", { requestId, reason: clashError.message });
    return serverError("service line lookup failed", init);
  }
  const rows = (clashes ?? []) as { id: string; slug: string; is_default: boolean }[];
  if (rows.some((r) => r.slug === slug)) {
    return conflict(`Another service line at this hospital already uses the slug '${slug}'.`, init);
  }
  const currentDefault = rows.find((r) => r.is_default);
  if (input.is_default && currentDefault) {
    return conflict("Another service line is already this hospital's default.", init, {
      default_service_line_id: currentDefault.id,
    });
  }

  // Canonical: deduplicate + sort so two spellings of one list don't read
  // as a change in the audit diff.
  const reasonCodes = [...new Set(input.reason_codes)].sort();

  const afterRow = {
    id,
    hospital_id: input.hospital_id,
    department_id: input.department_id,
    name: input.name,
    slug,
    capacity_mode: input.capacity_mode,
    time_to_care_days: input.time_to_care_days,
    continuity_default: input.continuity_default,
    confidential: input.confidential,
    payment_posture: input.payment_posture,
    fee_ugx: input.fee_ugx ?? null,
    deposit_ugx: input.deposit_ugx ?? null,
    reason_codes: reasonCodes,
    is_default: input.is_default,
    active: input.active,
  };

  const auditShape = (row: Record<string, unknown> | null) =>
    row
      ? {
          department_id: row.department_id,
          name: row.name,
          slug: row.slug,
          capacity_mode: row.capacity_mode,
          time_to_care_days: row.time_to_care_days,
          continuity_default: row.continuity_default,
          confidential: row.confidential,
          payment_posture: row.payment_posture,
          fee_ugx: row.fee_ugx,
          deposit_ugx: row.deposit_ugx,
          reason_codes: row.reason_codes,
          is_default: row.is_default,
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
      action: "update_service_line",
      targetKind: "service_line",
      targetId: id,
      reason: input.reason,
      requestId,
      ipAddress,
      userAgent,
      // null before = a new line. The audit shows creation as creation.
      beforeData: auditShape(existing),
      afterData: auditShape(afterRow),
    });
  } catch (e) {
    log.error("sa_audit failed; aborting", { requestId, reason: String(e) });
    return serverError("audit write failed", init);
  }

  const { error } = await sb.from("service_lines").upsert(afterRow, { onConflict: "id" });
  if (error) {
    if (error.code === "23505") {
      // Lost the race the pre-check exists to make rare.
      return conflict("Another save collided with this one — reload and try again.", init);
    }
    log.error("upsert failed", { requestId, reason: error.message });
    return serverError("service line update failed", init);
  }

  log.info("service line updated", {
    requestId,
    hospital_id: input.hospital_id,
    service_line_id: id,
    created: !existing,
    capacity_mode: input.capacity_mode,
  });
  return ok({ ok: true, id, created: !existing }, init);
});
