import { NextResponse } from "next/server";

import { parseSlot } from "@/lib/supabase/accounts";
import { createClient, setActiveAccount } from "@/lib/supabase/server";
import { landingFor } from "../../sign-in/landing";

/**
 * POST /accounts/switch — make another account signed in to this browser the
 * active one, then land it where sign-in would. Its session is validated
 * with `getUser()` first; a dead one goes back to /sign-in.
 */
export async function POST(request: Request) {
  const slot = parseSlot(String((await request.formData()).get("slot")));
  const {
    data: { user },
  } = await (await createClient(slot)).auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/sign-in", request.url), { status: 303 });

  await setActiveAccount(slot);
  const { target } = await landingFor(user.id);
  return NextResponse.redirect(new URL(target, request.url), { status: 303 });
}
