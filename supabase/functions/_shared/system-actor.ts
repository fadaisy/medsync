/**
 * Service-role callers (Gate F, ADR 0091). The `system-*` functions are
 * reached by MedSync's own servers — the USSD and inbound-SMS routes — with
 * the project's service-role key as the Bearer token. There is no user, so
 * a user JWT is refused outright (`not callable with a user JWT`), and every
 * audit row is attributed to the system actor: a real `auth.users` row named
 * by `MEDSYNC_SYSTEM_ACTOR_UUID` (`sa_audit_log.actor_id` is a NOT NULL FK —
 * the same convention `system-propose-urgent-appointment` set).
 */

/** True only when the Bearer token IS the service-role key. A user JWT never matches. */
export function isServiceRoleCall(request: Request): boolean {
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const header = request.headers.get("authorization") ?? "";
  return key.length > 0 && header === `Bearer ${key}`;
}

/** The actor every system write is audited as, or null when the env is missing (fail closed). */
export function systemActorId(): string | null {
  const id = Deno.env.get("MEDSYNC_SYSTEM_ACTOR_UUID") ?? "";
  return /^[0-9a-f-]{36}$/i.test(id) ? id : null;
}
