/**
 * assign-role — reference Edge Function implementing the mandatory MedSync
 * pattern (see ADR-0011):
 *
 *   1. CORS preflight
 *   2. Method gate (POST only)
 *   3. Zod input validation (typed errors)
 *   4. Authentication (Bearer JWT → getUser)
 *   5. Role authorisation (superadmin OR hospital_admin in scope)
 *   6. Action (INSERT into user_roles via service client)
 *   7. PII-redacted structured log
 *   8. Audit-log entry (handled automatically by Phase 0.6 trigger on user_roles)
 *   9. Typed response envelope
 *
 * Body shape:
 *   { target_user_id: uuid, role: string, hospital_id?: uuid }
 *
 * Authorisation rule:
 *   - superadmin can assign any role, any hospital (or null for superadmin grants).
 *   - hospital_admin can assign non-superadmin roles within their own hospital.
 *   - No other role can call this function successfully.
 *
 * Audit: the INSERT into user_roles fires the public.audit_log_changes()
 * trigger from migration 0003; we don't write to audit_log directly.
 */

import { z } from "npm:zod@4.4.3";

import { getCaller, hasRole, serviceClient } from "../_shared/auth.ts";
import { preflight } from "../_shared/cors.ts";
import {
  badRequest,
  forbidden,
  methodNotAllowed,
  ok,
  serverError,
  unauthorized,
} from "../_shared/errors.ts";
import { makeLogger } from "../_shared/logger.ts";

const log = makeLogger("assign-role");

const NON_SUPERADMIN_ROLES = [
  "patient",
  "clinician",
  "nurse",
  "pharmacist",
  "lab_tech",
  "hospital_admin",
] as const;
const ALL_ROLES = [...NON_SUPERADMIN_ROLES, "superadmin"] as const;

const InputSchema = z
  .object({
    target_user_id: z.string().uuid(),
    role: z.enum(ALL_ROLES),
    hospital_id: z.string().uuid().nullable().optional(),
  })
  .refine(
    (v) => (v.role === "superadmin" ? !v.hospital_id : !!v.hospital_id),
    "hospital_id is required for non-superadmin roles, and forbidden for superadmin",
  );

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("origin");
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
  const init = { origin, requestId };

  // 1. CORS preflight
  const pre = preflight(request);
  if (pre) return pre;

  // 2. Method gate
  if (request.method !== "POST") return methodNotAllowed(init);

  // 3. Zod input validation
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("Body must be JSON", init);
  }
  const parsed = InputSchema.safeParse(body);
  if (!parsed.success) {
    return badRequest("Invalid input", init, parsed.error.flatten());
  }
  const input = parsed.data;

  // 4. Authentication
  const caller = await getCaller(request);
  if (!caller) {
    log.warn("unauthorized", { requestId });
    return unauthorized(init);
  }

  // 5. Authorisation
  const callerIsSuperadmin = await hasRole(caller.id, "superadmin");
  const callerIsHospitalAdmin =
    !callerIsSuperadmin && input.hospital_id
      ? await hasRole(caller.id, "hospital_admin", input.hospital_id)
      : false;

  if (input.role === "superadmin" && !callerIsSuperadmin) {
    log.warn("forbidden: only superadmin can grant superadmin", {
      requestId,
      caller_id: caller.id,
    });
    return forbidden(init, "Only a superadmin can grant the superadmin role");
  }
  if (!callerIsSuperadmin && !callerIsHospitalAdmin) {
    log.warn("forbidden: caller has no admin role for this scope", {
      requestId,
      caller_id: caller.id,
      target_hospital_id: input.hospital_id ?? null,
    });
    return forbidden(init);
  }

  // 6. Action
  const sb = serviceClient();
  const { data, error } = await sb
    .from("user_roles")
    .insert({
      user_id: input.target_user_id,
      role: input.role,
      hospital_id: input.hospital_id ?? null,
      created_by: caller.id,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      log.info("conflict: role already held", { requestId });
      return ok({ id: null, already_held: true }, init);
    }
    log.error("user_roles insert failed", { requestId, reason: error.message });
    return serverError("Failed to assign role", init);
  }

  // 7+8. Logged + audit row already written by the trigger.
  log.info("role assigned", {
    requestId,
    caller_id: caller.id,
    target_user_id: input.target_user_id,
    role: input.role,
    hospital_id: input.hospital_id ?? null,
    user_roles_id: data?.id,
  });

  // 9. Typed response
  return ok({ id: data?.id ?? null, already_held: false }, init);
});
