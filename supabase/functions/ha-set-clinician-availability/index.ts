/**
 * ha-set-clinician-availability — create or update an availability_blocks row.
 *
 * Who can call:
 *   - The clinician themselves (own affiliation only).
 *   - The hospital_admin OR superadmin (for any clinician at THEIR hospital).
 *
 * What it does:
 *   - INSERT a new block (if no id supplied) or UPDATE an existing one.
 *   - Validates the target hospital matches the caller's scope
 *     (clinician must own the affiliation; hospital_admin must be
 *     scoped to that hospital).
 *   - Optional recurrence: 'none' or 'weekly' with a recurrence_weekday.
 *
 * Audit: sa_audit_log row with action=set_clinician_availability
 * and a ≥ 8-char operator reason.
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

const log = makeLogger("ha-set-clinician-availability");

const InputSchema = z.object({
  /** Omit for INSERT, supply for UPDATE. */
  block_id: z.string().uuid().optional(),
  hospital_id: z.string().uuid(),
  clinician_user_id: z.string().uuid(),
  department_id: z.string().uuid().nullable().optional(),
  kind: z.enum(["bookable", "teaching", "ward_round", "admin", "leave", "unavailable"]),
  starts_at: z.string().datetime({ offset: true }),
  ends_at: z.string().datetime({ offset: true }),
  recurrence: z.enum(["none", "weekly"]).default("none"),
  recurrence_weekday: z.number().int().min(1).max(7).nullable().optional(),
  recurrence_until: z.string().datetime({ offset: true }).nullable().optional(),
  location: z.string().max(160).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
  reason: z.string().min(8, "Reason ≥ 8 chars required (audited)."),
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

  if (input.recurrence === "weekly" && !input.recurrence_weekday) {
    return badRequest("recurrence='weekly' requires recurrence_weekday (1..7).", init);
  }
  if (new Date(input.ends_at) <= new Date(input.starts_at)) {
    return badRequest("ends_at must be > starts_at.", init);
  }

  const caller = await getCaller(request);
  if (!caller) return unauthorized(init);

  // Authorisation:
  //   - clinician acting on own affiliation: allowed.
  //   - hospital_admin acting on any clinician at THEIR hospital: allowed.
  //   - superadmin: allowed.
  const isSuperadmin = await hasRole(caller.id, "superadmin");
  const isSelf = caller.id === input.clinician_user_id;
  if (!isSuperadmin && !isSelf) {
    if (!(await hasRole(caller.id, "hospital_admin", input.hospital_id))) {
      return forbidden(init, "only the clinician or a hospital_admin can edit availability");
    }
    const scope = await requireHospitalAdminScope(caller.id, input.hospital_id);
    if (!scope.ok) return forbidden(init, scope.reason);
  }
  const sb = serviceClient();

  // Self acting: confirm the affiliation actually belongs to caller +
  // hospital pair — defence against URL-tampering across hospitals.
  if (isSelf && !isSuperadmin) {
    let allowed = await hasRole(caller.id, "clinician", input.hospital_id);
    // Fallback: an active/approved staff_affiliations row is the
    // canonical signal even when user_roles hasn't been granted on
    // approval. Mirrors the sign-in routing + ha-set-clinician-settings
    // fallbacks.
    if (!allowed) {
      const { data: aff } = await sb
        .from("staff_affiliations")
        .select("id")
        .eq("user_id", caller.id)
        .eq("hospital_id", input.hospital_id)
        .in("state", ["active", "approved"])
        .limit(1)
        .maybeSingle();
      allowed = !!aff;
    }
    if (!allowed) {
      return forbidden(init, "you are not an active clinician at this hospital");
    }
  }

  // If block_id supplied, verify the row exists at the right hospital
  // and the clinician owns it.
  let beforeRow: Record<string, unknown> | null = null;
  if (input.block_id) {
    const { data: existing, error } = await sb
      .from("availability_blocks")
      .select("id, hospital_id, clinician_user_id, kind, starts_at, ends_at, recurrence, state")
      .eq("id", input.block_id)
      .maybeSingle();
    if (error) return serverError(error.message, init);
    if (!existing) return notFound(init, "block not found");
    if (existing.hospital_id !== input.hospital_id) {
      return forbidden(init, "block belongs to a different hospital");
    }
    if (existing.clinician_user_id !== input.clinician_user_id) {
      return forbidden(init, "block belongs to a different clinician");
    }
    beforeRow = existing;
  }

  const { ipAddress, userAgent } = networkContext(request);
  const afterRow = {
    hospital_id: input.hospital_id,
    clinician_user_id: input.clinician_user_id,
    department_id: input.department_id ?? null,
    kind: input.kind,
    starts_at: input.starts_at,
    ends_at: input.ends_at,
    recurrence: input.recurrence,
    recurrence_weekday: input.recurrence_weekday ?? null,
    recurrence_until: input.recurrence_until ?? null,
    location: input.location ?? null,
    notes: input.notes ?? null,
  };

  try {
    await recordSaAudit({
      actorId: caller.id,
      action: "set_clinician_availability",
      targetKind: "availability_block",
      targetId: input.block_id ?? "(new)",
      reason: input.reason,
      requestId,
      ipAddress,
      userAgent,
      beforeData: beforeRow,
      afterData: afterRow,
    });
  } catch (e) {
    log.error("sa_audit failed; aborting", { requestId, reason: String(e) });
    return serverError("audit write failed", init);
  }

  let resultId: string;
  if (input.block_id) {
    const { error } = await sb
      .from("availability_blocks")
      .update({
        ...afterRow,
        state: "active",
      })
      .eq("id", input.block_id);
    if (error) {
      log.error("update failed", { requestId, reason: error.message });
      return serverError("availability update failed", init);
    }
    resultId = input.block_id;
  } else {
    const { data, error } = await sb
      .from("availability_blocks")
      .insert({
        ...afterRow,
        created_by_user_id: caller.id,
      })
      .select("id")
      .single();
    if (error || !data) {
      log.error("insert failed", { requestId, reason: error?.message });
      return serverError("availability create failed", init);
    }
    resultId = data.id;
  }

  log.info("availability block set", {
    requestId,
    block_id: resultId,
    clinician_user_id: input.clinician_user_id,
    kind: input.kind,
  });
  return ok({ block_id: resultId }, init);
});
