"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { logger } from "@/lib/logger";
import { createClient } from "@/lib/supabase/server";

const VerifySchema = z.object({
  factor_id: z.string().min(1),
  code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code from your authenticator."),
});

export type MfaSetupState = {
  errors?: Partial<Record<"code" | "_form", string>>;
};

export async function verifyEnrollmentAction(
  _prev: MfaSetupState,
  formData: FormData,
): Promise<MfaSetupState> {
  const parsed = VerifySchema.safeParse({
    factor_id: formData.get("factor_id"),
    code: formData.get("code"),
  });
  if (!parsed.success) {
    return { errors: { code: parsed.error.flatten().fieldErrors.code?.[0] } };
  }

  const supabase = await createClient();
  const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({
    factorId: parsed.data.factor_id,
  });
  if (chErr || !ch) {
    logger.error("mfa enroll challenge failed", { reason: chErr?.message });
    return { errors: { _form: "Could not start verification. Try again." } };
  }

  const { error: verErr } = await supabase.auth.mfa.verify({
    factorId: parsed.data.factor_id,
    challengeId: ch.id,
    code: parsed.data.code,
  });
  if (verErr) {
    logger.warn("mfa enroll verify failed", { reason: verErr.message });
    return { errors: { code: "That code didn't work. Try the next one your app shows." } };
  }

  logger.info("mfa enrollment complete");
  redirect("/dashboard");
}

export async function unenrollAction(factorId: string): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.mfa.unenroll({ factorId });
  logger.info("mfa factor unenrolled");
  redirect("/onboarding/mfa-setup");
}
