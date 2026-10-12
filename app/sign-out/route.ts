import { NextResponse } from "next/server";

import { createClient, listAccounts, setActiveAccount } from "@/lib/supabase/server";

/**
 * POST /sign-out — ends THIS device's session for the ACTIVE account. Other
 * accounts signed in to this browser stay signed in: the next one becomes
 * active and the user lands on /accounts; with none left, /sign-in.
 * GET is intentionally not supported (avoids CSRF logout via a link).
 *
 * `scope: "local"`: supabase-js defaults to "global", which revokes every
 * session the user holds — signing out of a shared ward PC used to sign the
 * same clinician out of their phone and every other tab.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  const next = (await listAccounts()).find((a) => !a.active);
  if (next) await setActiveAccount(next.slot);
  return NextResponse.redirect(new URL(next ? "/accounts" : "/sign-in", request.url), {
    status: 303,
  });
}
