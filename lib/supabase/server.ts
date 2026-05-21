import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

import { env } from "@/lib/env";

/**
 * Supabase client for use inside Server Components, Route Handlers, and
 * Server Actions. Threads cookies through `next/headers` so the auth
 * session round-trips between server and browser.
 *
 * Next.js 16: `cookies()` is async — always `await createClient()`.
 *
 * IMPORTANT: Always call `await supabase.auth.getUser()` to validate the JWT.
 * `getSession()` returns the cookie without verifying the token signature, so
 * it must NOT be used for authorization decisions in Server Components, route
 * handlers, or middleware/proxy. (Supabase guidance, mandatory for MedSync.)
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // The `setAll` method was called from a Server Component, which
          // cannot mutate cookies. Safe to ignore as long as middleware/proxy
          // is refreshing the session on every request.
        }
      },
    },
  });
}
