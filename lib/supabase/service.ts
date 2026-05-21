import "server-only";

import { createServerClient } from "@supabase/ssr";

import { env } from "@/lib/env";

/**
 * Service-role Supabase client — bypasses RLS. Use ONLY inside Edge Functions
 * or trusted server code that has already authenticated + authorised the
 * caller. NEVER expose to client components, NEVER pass user-supplied input
 * directly to it without authorization checks.
 *
 * The `server-only` import will throw at build time if anyone tries to import
 * this from a client component.
 */
export function createServiceClient() {
  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    cookies: {
      getAll() {
        return [];
      },
      setAll() {
        // service role never sets cookies
      },
    },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
