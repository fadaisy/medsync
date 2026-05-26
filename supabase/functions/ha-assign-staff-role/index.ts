/**
 * ha-assign-staff-role — hospital admin re-assigns a staff member's
 * role and/or department for THIS hospital's affiliation.
 *
 * HOD designation = role change to a role flagged as HOD in the
 * catalog. This function doesn't treat HOD specially — it's just a
 * role from `public.roles`.
 *
 * Validation:
 *   - The target role must exist in the catalog.
 *   - The target department must belong to THIS hospital
 *     (defence against URL-tampering; an admin could otherwise nudge
 *     a staff member into a department they shouldn't see).
 *   - The (user_id, hospital_id, department_id, role_id) tuple must
 *     not already exist (the table has a UNIQUE index on those four
 *     columns). The function returns 409 on conflict.
 *
 * Audited as `assign_staff_role` with before/after diff of role_id +
 * department_id.
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

const log = makeLogger("ha-assign-staff-role");

const InputSchema = z.object({
  affiliation_id: z.string().uuid(),
  new_role_id: z.string().uuid(),
  new_department_id: z.string().uuid(),
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

  const caller = await getCaller(request);
  if (!caller) return unauthorized(init);

  const sb = serviceClient();
  const { data: aff, error: fetchError } = await sb
    .from("staff_affiliations")
    .select("id, user_id, hospital_id, department_id, role_id, state")
    .eq("id", input.affiliation_id)
    .maybeSingle();
  if (fetchError) return serverError(fetchError.message, init);
  if (!aff) return notFound(init, "affiliation not found");

  const isSuperadmin = await hasRole(caller.id, "superadmin");
  if (!isSuperadmin) {
    const scope = await requireHospitalAdminScope(caller.id, aff.hospital_id);
    if (!scope.ok) return forbidden(init, scope.reason);
  }

  // The role-change only makes sense once the affiliation is active.
  if (!(aff.state === "active" || aff.state === "approved")) {
    return badRequest(
      `Cannot change role/department on a '${aff.state}' affiliation. Approve first.`,
      init,
    );
  }

  // Target department must belong to THIS hospital.
  const { data: dept, error: deptError } = await sb
    .from("hospital_departments")
    .select("id, hospital_id, name")
    .eq("id", input.new_department_id)
    .maybeSingle();
  if (deptError) return serverError(deptError.message, init);
  if (!dept) return notFound(init, "department not found");
  if (dept.hospital_id !== aff.hospital_id) {
    return forbidden(init, "department belongs to a different hospital");
  }

  // Target role must exist.
  const { data: role, error: roleError } = await sb
    .from("roles")
    .select("id, name")
    .eq("id", input.new_role_id)
    .maybeSingle();
  if (roleError) return serverError(roleError.message, init);
  if (!role) return notFound(init, "role not found");

  // Same shape already exists? UNIQUE constraint will reject too, but
  // we surface a clean 409 with context.
  const { data: dup } = await sb
    .from("staff_affiliations")
    .select("id")
    .eq("user_id", aff.user_id)
    .eq("hospital_id", aff.hospital_id)
    .eq("department_id", input.new_department_id)
    .eq("role_id", input.new_role_id)
    .neq("id", aff.id)
    .maybeSingle();
  if (dup) {
    return conflict(
      "This staff member already has an affiliation with that role + department here.",
      init,
    );
  }

  const before = { role_id: aff.role_id, department_id: aff.department_id };
  const after = { role_id: input.new_role_id, department_id: input.new_department_id };

  const { ipAddress, userAgent } = networkContext(request);
  try {
    await recordSaAudit({
      actorId: caller.id,
      action: "assign_staff_role",
      targetKind: "staff_affiliation",
      targetId: aff.id,
      reason: input.reason,
      requestId,
      ipAddress,
      userAgent,
      beforeData: before,
      afterData: after,
    });
  } catch (e) {
    log.error("sa_audit failed; aborting", { requestId, reason: String(e) });
    return serverError("audit write failed", init);
  }

  const { error: updateError } = await sb
    .from("staff_affiliations")
    .update({ role_id: input.new_role_id, department_id: input.new_department_id })
    .eq("id", aff.id);
  if (updateError) {
    log.error("affiliation role update failed", { requestId, reason: updateError.message });
    return serverError("role assignment failed", init);
  }

  log.info("staff role/department reassigned", {
    requestId,
    affiliation_id: aff.id,
    new_role: role.name,
    new_department: dept.name,
  });
  return ok(
    {
      affiliation_id: aff.id,
      role_id: input.new_role_id,
      department_id: input.new_department_id,
    },
    init,
  );
});
