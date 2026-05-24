"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { logger } from "@/lib/logger";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

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
  const { data: signInData, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    logger.warn("sign-in failed", { reason: error.message });
    // Never leak whether email exists. Single generic message.
    return { errors: { _form: "Invalid email or password." } };
  }

  // Default landing depends on role: superadmins / hospital_admins go
  // to /admin (the workspace IS their dashboard). Everyone else lands
  // on the landing page — Phase 0 has no clinical/patient surfaces
  // yet, so the landing page is the honest "you have nothing to do
  // here" destination. An explicit ?redirect= param always wins.
  //
  // Uses the service client to bypass RLS — the user-context session
  // cookie isn't reliably applied to the same request's downstream
  // queries, so user_roles SELECT would intermittently return empty
  // and silently default away from /admin. Matches the pattern
  // /admin/layout.tsx uses for role lookup.
  //
  // proxy.ts will still route through MFA challenge / setup if needed
  // on the next request — this just picks the *intended* destination.
  let defaultTarget = "/";
  if (signInData.user) {
    const service = createServiceClient();
    const { data: roles } = await service
      .from("user_roles")
      .select("role")
      .eq("user_id", signInData.user.id);
    if (roles?.some((r) => r.role === "superadmin" || r.role === "hospital_admin")) {
      defaultTarget = "/admin";
    }
  }

  const target =
    parsed.data.redirect && parsed.data.redirect.startsWith("/")
      ? parsed.data.redirect
      : defaultTarget;

  logger.info("sign-in succeeded");
  redirect(target);
}
