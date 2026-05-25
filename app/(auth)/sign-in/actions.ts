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

  // Role-aware default landing. Resolution order:
  //   1. superadmin / hospital_admin → /admin
  //   2. hospital applicant with a not-yet-approved application →
  //      /onboarding/hospital-pending (their status page)
  //   3. everyone else → /  (landing — Phase 0 has no clinical/patient
  //      surfaces yet)
  // An explicit ?redirect= param always wins over this default.
  //
  // Uses the service client to bypass RLS — the user-context session
  // cookie isn't reliably applied to the same request's downstream
  // queries, so a user-context query would intermittently return
  // empty and silently default away. Matches the pattern
  // /admin/layout.tsx uses for role lookup.
  let defaultTarget = "/";
  if (signInData.user) {
    const service = createServiceClient();
    const { data: roles } = await service
      .from("user_roles")
      .select("role")
      .eq("user_id", signInData.user.id);
    if (roles?.some((r) => r.role === "superadmin" || r.role === "hospital_admin")) {
      defaultTarget = "/admin";
    } else {
      // Check for a pending hospital application — these users have
      // an account but no admin role yet. The pending page shows
      // their application status; once the superadmin approves, they
      // get the hospital_admin role and this branch falls through
      // to the /admin path above.
      const { data: app } = await service
        .from("hospital_applications")
        .select("state")
        .eq("applicant_user_id", signInData.user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (app && ["pending_approval", "under_review", "rejected"].includes(app.state)) {
        defaultTarget = "/onboarding/hospital-pending";
      }
    }
  }

  const target =
    parsed.data.redirect && parsed.data.redirect.startsWith("/")
      ? parsed.data.redirect
      : defaultTarget;

  logger.info("sign-in succeeded");
  redirect(target);
}
