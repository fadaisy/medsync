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
  //   3. clinician with a not-yet-approved staff_affiliation →
  //      /onboarding/clinical-pending (their status page)
  //   4. everyone else → /  (landing — Phase 0 has no clinical/patient
  //      workspace yet for approved users; that lands when /clinical
  //      ships).
  // An explicit ?redirect= param always wins over this default.
  //
  // Uses the service client to bypass RLS — the user-context session
  // cookie isn't reliably applied to the same request's downstream
  // queries, so a user-context query would intermittently return
  // empty and silently default away. Matches the pattern
  // /admin/layout.tsx uses for role lookup.
  let defaultTarget = "/";
  let routeReason = "default-landing";
  if (signInData.user) {
    const service = createServiceClient();

    const { data: roles, error: rolesError } = await service
      .from("user_roles")
      .select("role")
      .eq("user_id", signInData.user.id);
    if (rolesError) {
      logger.warn("sign-in.routing.user_roles_query_failed", { reason: rolesError.message });
    }

    if (roles?.some((r) => r.role === "superadmin")) {
      defaultTarget = "/admin";
      routeReason = "superadmin-role";
    } else if (roles?.some((r) => r.role === "hospital_admin")) {
      // Hospital admins get their own scoped workspace — never /admin,
      // which is now superadmin-only chrome. The /hospital-admin layout
      // resolves the tenant scope via requireHospitalAdminScope().
      defaultTarget = "/hospital-admin";
      routeReason = "hospital-admin-role";
    } else if (
      roles?.some((r) => ["clinician", "nurse", "pharmacist", "lab_tech"].includes(r.role))
    ) {
      // Active clinical staff with the role granted go to the clinician
      // workspace. (The clinician scheduling availability editor — first
      // page that lands at /clinician — is scoped per affiliation.)
      defaultTarget = "/clinician";
      routeReason = "clinician-role";
    } else {
      // Check for a pending hospital application — these users have
      // an account but no admin role yet. The pending page shows
      // their application status; once the superadmin approves, they
      // get the hospital_admin role and this branch falls through
      // to the /admin path above.
      const { data: app, error: appError } = await service
        .from("hospital_applications")
        .select("state")
        .eq("applicant_user_id", signInData.user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (appError) {
        logger.warn("sign-in.routing.hospital_applications_query_failed", {
          reason: appError.message,
        });
      }

      if (app && ["pending_approval", "under_review", "rejected"].includes(app.state)) {
        defaultTarget = "/onboarding/hospital-pending";
        routeReason = `hospital-application-${app.state}`;
      } else {
        // Check for a not-yet-approved staff_affiliation. Same shape as
        // the hospital case — until the affiliation lands `approved`,
        // the clinician sees their status page rather than the landing.
        const { data: aff, error: affError } = await service
          .from("staff_affiliations")
          .select("state")
          .eq("user_id", signInData.user.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (affError) {
          logger.warn("sign-in.routing.staff_affiliations_query_failed", {
            reason: affError.message,
          });
        }

        if (aff) {
          // Any clinician with a staff_affiliation lands on the
          // clinical-pending page. The page itself decides what to
          // render based on state (pending / approved / rejected /
          // active) — Phase 0 has no /clinical workspace yet, so an
          // approved clinician with nowhere else to go sees an
          // "Approved" view with an MFA-setup CTA. Replace this with
          // /clinical when that workspace ships.
          defaultTarget = "/onboarding/clinical-pending";
          routeReason = `staff-affiliation-${aff.state}`;
        } else {
          // Patient detection: presence of a patient_profiles row.
          // The patient signup flow doesn't grant a 'patient' role
          // in user_roles (yet) — the row itself is the signal.
          const { data: patientProfile, error: patientError } = await service
            .from("patient_profiles")
            .select("id")
            .eq("id", signInData.user.id)
            .maybeSingle();
          if (patientError) {
            logger.warn("sign-in.routing.patient_profiles_query_failed", {
              reason: patientError.message,
            });
          }
          if (patientProfile) {
            defaultTarget = "/patient";
            routeReason = "patient-profile";
          } else {
            routeReason = "no-affiliation-or-patient-profile";
          }
        }
      }
    }
  }

  const target =
    parsed.data.redirect && parsed.data.redirect.startsWith("/")
      ? parsed.data.redirect
      : defaultTarget;

  logger.info("sign-in succeeded", { target, routeReason });
  redirect(target);
}
