/**
 * pt-set-sms-consent — SMS about my bookings: on or off (Gate E, ADR 0090;
 * PRD §5.2). Input: { on: boolean }.
 *
 * ON records a `consent_records` row against the ACTIVE `sms_communication`
 * text (or clears `revoked_at` on the same version — the unique
 * (user, type, version) index forbids a second row). OFF stamps `revoked_at`
 * on every live row of the type. The record never changes otherwise: it is
 * the proof of what was agreed, and `revoked_at` of when it stopped. The
 * dispatcher's consent gate reads `revoked_at IS NULL` on its next run.
 *
 * Service role because RLS grants a patient INSERT on their own consent
 * but no UPDATE — withdrawal is a write the client cannot make (0002).
 * No audit row: the consent_records audit trigger (0003) already logs it.
 */
import { z } from "npm:zod@4.4.3";

import { getCaller, serviceClient } from "../_shared/auth.ts";
import { preflight } from "../_shared/cors.ts";
import { badRequest, methodNotAllowed, ok, serverError, unauthorized } from "../_shared/errors.ts";
import { makeLogger } from "../_shared/logger.ts";

const log = makeLogger("pt-set-sms-consent");

const InputSchema = z.object({ on: z.boolean() });

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

  const caller = await getCaller(request);
  if (!caller) return unauthorized(init);
  const sb = serviceClient();
  const now = new Date().toISOString();

  if (!parsed.data.on) {
    const { error } = await sb
      .from("consent_records")
      .update({ revoked_at: now })
      .eq("user_id", caller.id)
      .eq("consent_type", "sms_communication")
      .is("revoked_at", null);
    if (error) {
      log.error("revoke failed", { requestId, reason: error.message });
      return serverError("could not save", init);
    }
    return ok({ on: false }, init);
  }

  const { data: version, error: versionError } = await sb
    .from("consent_versions")
    .select("version, body_sha256")
    .eq("consent_type", "sms_communication")
    .order("effective_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (versionError) return serverError(versionError.message, init);
  if (!version) return badRequest("SMS settings are not available yet.", init);

  const { error } = await sb.from("consent_records").upsert(
    {
      user_id: caller.id,
      consent_type: "sms_communication",
      version: version.version,
      consent_text_sha256: version.body_sha256,
      accepted_at: now,
      accepted_user_agent: request.headers.get("user-agent")?.slice(0, 300) ?? null,
      revoked_at: null,
    },
    { onConflict: "user_id,consent_type,version" },
  );
  if (error) {
    log.error("grant failed", { requestId, reason: error.message });
    return serverError("could not save", init);
  }
  return ok({ on: true, version: version.version }, init);
});
