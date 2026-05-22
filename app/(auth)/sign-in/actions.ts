"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { logger } from "@/lib/logger";
import { createClient } from "@/lib/supabase/server";

const SignInSchema = z.object({
  email: z.string().email("Enter a valid email."),
  password: z.string().min(1, "Required."),
  redirect: z.string().optional(),
});

export type SignInState = {
  errors?: Partial<Record<"email" | "password" | "_form", string>>;
};

export async function signInAction(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const parsed = SignInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    redirect: formData.get("redirect") ?? undefined,
  });

  if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors;
    return {
      errors: {
        email: fieldErrors.email?.[0],
        password: fieldErrors.password?.[0],
      },
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    logger.warn("sign-in failed", { reason: error.message });
    // Never leak whether email exists. Single generic message.
    return { errors: { _form: "Invalid email or password." } };
  }

  // proxy.ts will route the user further (MFA challenge, MFA setup, or
  // straight to /dashboard) based on AAL + role state.
  const target =
    parsed.data.redirect && parsed.data.redirect.startsWith("/")
      ? parsed.data.redirect
      : "/dashboard";

  logger.info("sign-in succeeded");
  redirect(target);
}
