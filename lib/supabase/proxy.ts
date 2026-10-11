import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

import { env } from "@/lib/env";
import { ACTIVE_ACCOUNT_COOKIE, authCookieName, parseSlot } from "@/lib/supabase/accounts";

/**
 * Supabase client wired for the Next.js 16 proxy (formerly middleware).
 *
 * Reads cookies from the incoming request, runs `getUser()` to validate /
 * refresh the JWT, and writes any updated cookies back onto the response.
 * Every protected route depends on this being called per request.
 */
export async function updateSession(request: NextRequest): Promise<{
  response: NextResponse;
  userId: string | null;
}> {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookieOptions: {
        name: authCookieName(parseSlot(request.cookies.get(ACTIVE_ACCOUNT_COOKIE)?.value)),
      },
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // getUser() validates the JWT and refreshes the cookie if needed.
  // Per Supabase + kickoff: getSession() is forgeable and must not be used.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { response, userId: user?.id ?? null };
}
