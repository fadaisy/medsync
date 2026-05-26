/**
 * ha-request-staff-info — hospital admin asks the applicant for more
 * information without rejecting them.
 *
 * The affiliation stays in `pending_approval`; the admin's note lands
 * on `staff_affiliations.review_note` and is surfaced on the
 * applicant's /onboarding/clinical-pending page so they can re-submit
 * (edit + come back into the queue).
 *
 * Rejecting outright is the heavier path — that closes the row and
 * forces a fresh affiliation. Use this when the applicant just needs
 * to add a missing licence photo, fix a typo, etc.
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

const log = makeLogger("ha-request-staff-info");

const InputSchema = z.object({
  affiliation_id: z.string().uuid(),
  /** The question / note for the applicant. ≥ 8 chars so it's substantive. */
  note: z.string().min(8, "Note must be at least 8 characters."),
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
    .select("id, hospital_id, state, review_note")
    .eq("id", input.affiliation_id)
    .maybeSingle();
  if (fetchError) return serverError(fetchError.message, init);
  if (!aff) return notFound(init, "affiliation not found");

  // Hospital-scope check (superadmin bypasses; hospital_admin must be
  // scoped to THIS affiliation's hospital).
  const isSuperadmin = await hasRole(caller.id, "superadmin");
  if (!isSuperadmin) {
    const scope = await requireHospitalAdminScope(caller.id, aff.hospital_id);
    if (!scope.ok) return forbidden(init, scope.reason);
  }

  if (aff.state !== "pending_approval") {
    return badRequest(
      `Affiliation is in '${aff.state}' — must be pending_approval to request info.`,
      init,
    );
  }

  const { ipAddress, userAgent } = networkContext(request);
  try {
    await recordSaAudit({
      actorId: caller.id,
      action: "request_staff_info",
      targetKind: "staff_affiliation",
      targetId: aff.id,
      reason: input.note,
      requestId,
      ipAddress,
      userAgent,
      beforeData: { review_note: aff.review_note },
      afterData: { review_note: input.note },
    });
  } catch (e) {
    log.error("sa_audit failed; aborting", { requestId, reason: String(e) });
    return serverError("audit write failed", init);
  }

  const { error: updateError } = await sb
    .from("staff_affiliations")
    .update({ review_note: input.note })
    .eq("id", aff.id);
  if (updateError) {
    log.error("review_note update failed", { requestId, reason: updateError.message });
    return serverError("review note update failed", init);
  }

  log.info("staff info requested", { requestId, affiliation_id: aff.id });
  return ok({ affiliation_id: aff.id, state: aff.state, review_note: input.note }, init);
});
