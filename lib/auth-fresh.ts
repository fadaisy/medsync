import "server-only";

import { createClient } from "@/lib/supabase/server";

/** How recent a second factor must be to sign (Lab Phase 1 §5.7, §8: "a fresh second factor"). */
export const FRESH_FACTOR_MINUTES = 10;

/**
 * True when this session passed its authenticator code within the last few minutes. Signing a
 * clinical set needs this, not merely an AAL2 session that may be hours old. The page asks for the
 * code again (components/medsync/fresh-factor.tsx) and retries.
 */
export async function secondFactorFresh(maxMinutes = FRESH_FACTOR_MINUTES): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (data?.currentLevel !== "aal2") return false;
  const latest = Math.max(
    0,
    ...(data.currentAuthenticationMethods ?? []).map((m) =>
      typeof m === "object" && m.method === "totp" ? m.timestamp : 0,
    ),
  );
  return latest * 1000 >= Date.now() - maxMinutes * 60_000;
}
