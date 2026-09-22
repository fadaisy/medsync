/**
 * sa-sign-catalog-version — Gate CS: the CSO's signature on a patient
 * symptom catalog version (PRD MS-PRD-SYM-001 §9.1, §9.6; migration 0066 §1;
 * ADR 0098 ruling 2). Until a version row is `signed`, production keeps the
 * descriptive picker and shows the Emergency sheet only.
 *
 * WHAT IS SIGNED IS WHAT IS DEPLOYED. The row (registered by
 * `npm run db:seed-symptom-catalog` from the artifact) must carry the same
 * checksum as the package bundled into THIS function — `CATALOG_CHECKSUM`
 * from `_shared/symptom-catalog/catalog.v0.1.ts`, the generated constant a
 * test holds equal to the JSON. A mismatch is a 409, not a warning: signing
 * content other than what the phones and functions are running would make
 * the signature meaningless.
 *
 * Superadmin-only; `signoff_artifact_ref` names the governance artifact
 * (the CSO's signed document), `reason` says why now. Audited FIRST (fail
 * closed) as `sign_catalog_version`. Signing is one-way here: a signed
 * version is retired by a later migration/seed, never re-drafted.
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
import { makeLogger } from "../_shared/logger.ts";
import { networkContext, recordSaAudit } from "../_shared/sa-audit.ts";
import { CATALOG, CATALOG_CHECKSUM } from "../_shared/symptom-catalog/index.ts";

const log = makeLogger("sa-sign-catalog-version");

const InputSchema = z.object({
  version: z.string().trim().min(1).max(32),
  signoff_artifact_ref: z.string().trim().min(8).max(500),
  reason: z.string().trim().min(8).max(500),
});

interface VersionRow {
  version: string;
  status: string;
  checksum: string;
  item_count: number;
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
  if (!(await hasRole(caller.id, "superadmin"))) return forbidden(init, "superadmin required");

  const sb = serviceClient();
  const { data: row, error: rowError } = await sb
    .from("patient_symptom_catalog_versions")
    .select("version, status, checksum, item_count")
    .eq("version", input.version)
    .maybeSingle();
  if (rowError) return serverError(rowError.message, init);
  const version = (row as VersionRow | null) ?? null;
  if (!version) return notFound(init, "catalog version not registered — run the seed first");

  if (version.status !== "draft") {
    return conflict(`Version ${version.version} is already ${version.status}.`, init, {
      status: version.status,
    });
  }
  if (version.version !== CATALOG.version || version.checksum !== CATALOG_CHECKSUM) {
    return conflict(
      "The registered checksum does not match the package deployed with this function — redeploy or reseed before signing.",
      init,
      {
        code: "checksum_mismatch",
        registered: { version: version.version, checksum: version.checksum },
        deployed: { version: CATALOG.version, checksum: CATALOG_CHECKSUM },
      },
    );
  }

  const nowIso = new Date().toISOString();
  const { ipAddress, userAgent } = networkContext(request);
  try {
    await recordSaAudit({
      actorId: caller.id,
      action: "sign_catalog_version",
      targetKind: "patient_symptom_catalog_version",
      targetId: version.version,
      reason: input.reason,
      requestId,
      ipAddress,
      userAgent,
      beforeData: { status: version.status },
      afterData: {
        status: "signed",
        checksum: version.checksum,
        item_count: version.item_count,
        signoff_artifact_ref: input.signoff_artifact_ref,
        signed_at: nowIso,
      },
    });
  } catch (e) {
    log.error("audit insert failed", { requestId, reason: String(e) });
    return serverError("audit write failed", init);
  }

  const { data: updated, error } = await sb
    .from("patient_symptom_catalog_versions")
    .update({
      status: "signed",
      signed_by_user_id: caller.id,
      signed_at: nowIso,
      signoff_artifact_ref: input.signoff_artifact_ref,
    })
    .eq("version", version.version)
    .eq("status", "draft")
    .select("version")
    .maybeSingle();
  if (error) {
    log.error("update failed", { requestId, reason: error.message });
    return serverError("update failed", init);
  }
  if (!updated) return conflict("This version was signed by someone else first.", init);

  log.info("catalog version signed", {
    requestId,
    version: version.version,
    checksum: version.checksum,
    item_count: version.item_count,
  });
  return ok(
    { version: version.version, status: "signed", checksum: version.checksum, signed_at: nowIso },
    init,
  );
});
