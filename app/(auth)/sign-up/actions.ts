"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { logger } from "@/lib/logger";
import { createClient } from "@/lib/supabase/server";

const SignUpSchema = z.object({
  email: z.string().email("Enter a valid email."),
  full_name: z.string().min(1, "Required.").max(120),
  password: z
    .string()
    .min(12, "Password must be at least 12 characters.")
    .max(72, "Password must be 72 characters or fewer."),
});

export type SignUpState = {
  errors?: Partial<Record<"email" | "full_name" | "password" | "_form", string>>;
};

export async function signUpAction(_prev: SignUpState, formData: FormData): Promise<SignUpState> {
  const parsed = SignUpSchema.safeParse({
    email: formData.get("email"),
    full_name: formData.get("full_name"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors;
    return {
      errors: {
        email: fieldErrors.email?.[0],
        full_name: fieldErrors.full_name?.[0],
        password: fieldErrors.password?.[0],
      },
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.full_name },
    },
  });

  if (error) {
    logger.warn("sign-up failed", { reason: error.message });
    return { errors: { _form: error.message } };
  }

  // The auth.users trigger (migration 0004) mirrors into public.users
  // automatically. New users are 'patient' by default; clinical roles get
  // assigned via Edge Function in Phase 0.10.
  logger.info("sign-up succeeded");
  redirect("/sign-in?signed-up=1");
}
