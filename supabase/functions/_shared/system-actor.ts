/**
 * Service-role callers (Gate F, ADR 0091). The `system-*` functions are
 * reached by MedSync's own servers — the USSD and inbound-SMS routes — with
 * the project's service-role key as the Bearer token. There is no user, so
 * a user JWT is refused outright (`not callable with a user JWT`), and every
 * audit row is attributed to the system actor: a real `auth.users` row named
 * by `MEDSYNC_SYSTEM_ACTOR_UUID` (`sa_audit_log.actor_id` is a NOT NULL FK —
 * the same convention `system-propose-urgent-appointment` set).
 */

/**
 * True only for the service role. A user JWT (role `authenticated`) and the
 * anon key (role `anon`) never match.
 *
 * Two ways in, because the string Supabase injects as
 * SUPABASE_SERVICE_ROLE_KEY into Functions is NOT guaranteed to be the
 * legacy `service_role` JWT the Next app holds (observed 2026-09-14: valid
 * key, different digest) — an exact-string compare alone made every call a
 * 401:
 *   1. the Bearer IS the injected key, byte for byte; or
 *   2. the Bearer is a JWT whose `role` claim is `service_role`.
 * (2) trusts the gateway: every function deploys with `verify_jwt = true`
 * (the default; never pass --no-verify-jwt — a test greps the docs for it),
 * so the signature was checked before this code ran and a forged, unsigned
 * JWT never reaches it. The claim is read, not verified, for that reason.
 *
 * ponytail: a new-style `sb_secret_…` Bearer (not a JWT) matches only via
 * (1). Ceiling: the Next side switches to sb_secret_ keys. Upgrade path:
 * compare against the entries of SUPABASE_SECRET_KEYS.
 */
export function isServiceRoleCall(request: Request): boolean {
  const header = request.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ")) return false;
  const bearer = header.slice(7).trim();
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (key.length > 0 && bearer === key) return true;
  return jwtRole(bearer) === "service_role";
}

/** The `role` claim of a JWT, decoded (not verified — see above); null for anything that is not a JWT. */
function jwtRole(token: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const b64 = (parts[1] as string).replace(/-/g, "+").replace(/_/g, "/");
    const json = new TextDecoder().decode(
      Uint8Array.from(atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, "=")), (c) => c.charCodeAt(0)),
    );
    const role = (JSON.parse(json) as { role?: unknown }).role;
    return typeof role === "string" ? role : null;
  } catch {
    return null;
  }
}

/** The actor every system write is audited as, or null when the env is missing (fail closed). */
export function systemActorId(): string | null {
  const id = Deno.env.get("MEDSYNC_SYSTEM_ACTOR_UUID") ?? "";
  return /^[0-9a-f-]{36}$/i.test(id) ? id : null;
}
