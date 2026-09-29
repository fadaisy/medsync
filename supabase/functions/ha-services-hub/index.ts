/**
 * ha-services-hub — every mutation of the Departments & services hub (ADR 0150), one op at a time.
 *
 * One function with a discriminated union of ops rather than ~30 functions: each op keeps the
 * contract's order exactly (docs/hospital-admin-integration-contract.md §7) —
 *   CORS/method → Zod → auth → role + scope → the op's own checks (reads only) → AUDIT → mutation
 *   → PII-redacted log → typed result.
 * An op's `plan()` may only read; the index writes the audit row, and only then runs `apply()`, so a
 * failed audit aborts before anything changes.
 *
 * Who: a hospital_admin of THIS hospital (scope-checked: provisioning or active) or a superadmin.
 * D-SVC-16: the current head of a department may run the head-scoped ops on their own department
 * (and report availability at their hospital) — `headScoped` below. ADR 0194: the live bed ops also
 * let a ward's in-charge and its assigned nurses act (ops-wards checks the ward).
 *
 * Clinic days are NOT here: they go through the booking engine's ha-upsert-session-template.
 */
import type { Ctx, OpPlan } from "./common.ts";
import { z } from "npm:zod@4.4.3";

import { getCaller, hasRole, serviceClient } from "../_shared/auth.ts";
import { preflight } from "../_shared/cors.ts";
import {
  badRequest,
  conflict,
  forbidden,
  methodNotAllowed,
  ok,
  serverError,
  unauthorized,
} from "../_shared/errors.ts";
import { requireHospitalAdminScope } from "../_shared/hospital-admin-scope.ts";
import { makeLogger } from "../_shared/logger.ts";
import { networkContext, recordSaAudit } from "../_shared/sa-audit.ts";
import { HubError } from "./common.ts";
import { SERVICE_OPS, ServiceOpSchema } from "./ops-services.ts";
import { STRUCTURE_OPS, StructureOpSchema } from "./ops-structure.ts";
import { WARD_OPS, WARD_STAFF_OPS, WardOpSchema } from "./ops-wards.ts";

const log = makeLogger("ha-services-hub");

const InputSchema = z
  .object({ hospital_id: z.string().uuid() })
  .and(z.union([StructureOpSchema, ServiceOpSchema, WardOpSchema]));

type Input = z.infer<typeof InputSchema>;

/** Ops a current head may run (D-SVC-16). Everything else needs a hospital admin or superadmin. */
const HEAD_OPS = new Set([
  "update_department",
  "add_unit",
  "report_problem",
  "update_problem",
  "resolve_problem",
  "confirm_still_down",
]);

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
  const input = parsed.data as Input & { op: string };

  const caller = await getCaller(request);
  if (!caller) return unauthorized(init);

  const sb = serviceClient();
  const isSuperadmin = await hasRole(caller.id, "superadmin");
  let role: Ctx["role"] = "superadmin";
  if (!isSuperadmin) {
    if (await hasRole(caller.id, "hospital_admin", input.hospital_id)) {
      const scope = await requireHospitalAdminScope(caller.id, input.hospital_id);
      if (!scope.ok) return forbidden(init, scope.reason);
      role = "hospital_admin";
    } else if (HEAD_OPS.has(input.op)) {
      role = "head";
    } else if (WARD_STAFF_OPS.has(input.op)) {
      role = "ward_staff";
    } else {
      return forbidden(init, "hospital_admin required for this hospital");
    }
  }

  const ctx: Ctx = { sb, hospitalId: input.hospital_id, callerId: caller.id, role, requestId };
  const handler = STRUCTURE_OPS[input.op] ?? SERVICE_OPS[input.op] ?? WARD_OPS[input.op];
  if (!handler) return badRequest(`Unknown op: ${input.op}`, init);

  let plan: OpPlan;
  try {
    plan = await handler(ctx, input as never);
  } catch (e) {
    if (e instanceof HubError) {
      return e.status === 409
        ? conflict(e.message, init)
        : e.status === 403
          ? forbidden(init, e.message)
          : badRequest(e.message, init);
    }
    log.error("plan failed", { requestId, op: input.op, reason: String(e) });
    return serverError("could not read the current state", init);
  }

  // Audit FIRST: a missing audit row aborts the mutation, never the other way round.
  const { ipAddress, userAgent } = networkContext(request);
  try {
    await recordSaAudit({
      actorId: caller.id,
      action: plan.audit.action,
      targetKind: "hospital",
      targetId: input.hospital_id,
      reason: plan.audit.reason,
      requestId,
      ipAddress,
      userAgent,
      beforeData: { op: input.op, ...(plan.audit.before ?? {}) },
      afterData: plan.audit.after ?? null,
    });
  } catch (e) {
    log.error("sa_audit failed; aborting", { requestId, op: input.op, reason: String(e) });
    return serverError("audit write failed", init);
  }

  try {
    const data = await plan.apply();
    log.info("op completed", { requestId, op: input.op, hospital_id: input.hospital_id, role });
    return ok(data ?? {}, init);
  } catch (e) {
    if (e instanceof HubError)
      return e.status === 409 ? conflict(e.message, init) : badRequest(e.message, init);
    log.error("apply failed", { requestId, op: input.op, reason: String(e) });
    return serverError("the change could not be saved", init);
  }
});
