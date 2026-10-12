"use server";

import { z } from "zod";

import { logger } from "@/lib/logger";
import { createClient } from "@/lib/supabase/server";

/**
 * Enter the authenticator code again before signing (Lab Phase 1 §8). The same challenge and
 * verify as sign-in (app/(auth)/sign-in/mfa/actions.ts); a fresh verify stamps the session's TOTP
 * time, which lib/auth-fresh.ts reads.
 */
export async function confirmSecondFactorAction(
  raw: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const p = z
    .object({ code: z.string().regex(/^\d{6}$/) })
    .safeParse({ code: String((raw as { code?: unknown })?.code ?? "").replace(/\s/g, "") });
  if (!p.success) return { ok: false, error: "Enter the 6-digit code from your authenticator." };
  const supabase = await createClient();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const factor = factors?.totp[0];
  if (!factor) return { ok: false, error: "No authenticator is set up on this account." };
  const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId: factor.id });
  if (chErr || !ch) return { ok: false, error: "Could not start the check. Try again." };
  const { error } = await supabase.auth.mfa.verify({
    factorId: factor.id,
    challengeId: ch.id,
    code: p.data.code,
  });
  if (error) {
    logger.warn("fresh_factor.verify_failed", { reason: error.message });
    return { ok: false, error: "That code didn't work. Try the next one your app shows." };
  }
  return { ok: true };
}
