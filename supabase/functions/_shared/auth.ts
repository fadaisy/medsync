import type { SupabaseClient, User } from "https://esm.sh/@supabase/supabase-js@2.106.1";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.106.1";

/**
 * Auth helpers for Edge Functions.
 *
 * - `getCaller(request)` validates the Authorization Bearer token via
 *   getUser() (server-validates the JWT) and returns the user, or null
 *   when the request is unauthenticated / invalid.
 * - `serviceClient()` returns a service-role Supabase client for trusted
 *   server-side mutations. NEVER pass user-supplied input through this
 *   client without authorisation checks above.
 * - `hasRole(userId, role[, hospitalId])` queries public.user_roles via the
 *   service client (which bypasses RLS); use only inside this Edge Function
 *   layer after authenticating the caller.
 */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

export function serviceClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Validate the caller's JWT from the Authorization header. Returns
 * the User on success, null otherwise. Never trust the cookie-bound
 * session; only the Bearer token's JWT is checked here.
 */
export async function getCaller(request: Request): Promise<User | null> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) return null;

  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: authHeader } },
  });

  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return null;
  return data.user;
}

/**
 * True if the user holds the named role. If `hospitalId` is provided,
 * scope-checks against that hospital (superadmin is global; always matches).
 *
 * Reads via the service-role client because user_roles RLS would otherwise
 * limit visibility to the caller's own roles only.
 */
export async function hasRole(
  userId: string,
  role: string,
  hospitalId: string | null = null,
): Promise<boolean> {
  const sb = serviceClient();
  let query = sb.from("user_roles").select("id").eq("user_id", userId).eq("role", role);
  if (role !== "superadmin" && hospitalId) {
    query = query.eq("hospital_id", hospitalId);
  }
  const { data, error } = await query.limit(1).maybeSingle();
  if (error) {
    // log via the function's logger at the call site; here we fail-closed.
    return false;
  }
  return !!data;
}
