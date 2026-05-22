import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

/**
 * POST /sign-out — clears the Supabase session and bounces to /sign-in.
 * GET is intentionally not supported (avoids CSRF logout via a link).
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/sign-in", request.url), { status: 303 });
}
