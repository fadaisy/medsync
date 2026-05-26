import "server-only";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { hospitals } from "@/db/schema/hospitals";
import { patientProfiles } from "@/db/schema/patient-profiles";
import { users } from "@/db/schema/users";
import { getAuthState } from "@/lib/auth";
import { logger } from "@/lib/logger";

/**
 * Patient workspace scope. Single source of truth for "who is the
 * signed-in patient and which hospital is their care home."
 *
 * Resolution:
 *   - Auth + AAL2 (same gate as every other workspace).
 *   - users.state must be 'active' (verified + approved patient).
 *   - patient_profiles row must exist (which they will after signup).
 *   - primaryFacilityId may be null — booking flow blocks with a
 *     friendly "set your primary hospital first" message in that case.
 *     The other patient surfaces (records, messages — later) still
 *     work without it.
 */

export interface PatientScope {
  userId: string;
  userEmail: string;
  fullName: string | null;
  /** May be null — caller decides whether to block. */
  primaryHospitalId: string | null;
  primaryHospitalName: string | null;
  primaryHospitalSlug: string | null;
}

export async function requirePatientScope(): Promise<PatientScope> {
  const state = await getAuthState();
  if (!state.user) redirect("/sign-in?redirect=/patient");
  // Patients are MFA-optional (kickoff). Only enforce MFA if the user
  // *also* holds a role that requires it (e.g. a clinician who is
  // also a patient at another hospital).
  if (state.mfaRequired) {
    if (state.nextAal !== "aal2") redirect("/onboarding/mfa-setup");
    if (state.aal !== "aal2") redirect("/sign-in/mfa?redirect=/patient");
  }

  const [me] = await db
    .select({
      userState: users.state,
      fullName: users.fullName,
      primaryFacilityId: patientProfiles.primaryFacilityId,
    })
    .from(users)
    .leftJoin(patientProfiles, eq(patientProfiles.id, users.id))
    .where(eq(users.id, state.user.id))
    .limit(1);

  if (!me) {
    logger.warn("patient.scope.no_user_row", { user_id: state.user.id });
    redirect("/");
  }
  if (me.userState !== "active") {
    // Pending / suspended / deactivated — they have no patient
    // surface today. Bounce to landing; their own flow (clinical-
    // pending equivalent for patients) will land in its own ticket.
    logger.warn("patient.scope.user_not_active", {
      user_id: state.user.id,
      user_state: me.userState,
    });
    redirect("/");
  }

  let primaryHospitalName: string | null = null;
  let primaryHospitalSlug: string | null = null;
  if (me.primaryFacilityId) {
    const [h] = await db
      .select({ name: hospitals.name, slug: hospitals.slug })
      .from(hospitals)
      .where(eq(hospitals.id, me.primaryFacilityId))
      .limit(1);
    primaryHospitalName = h?.name ?? null;
    primaryHospitalSlug = h?.slug ?? null;
  }

  return {
    userId: state.user.id,
    userEmail: state.user.email ?? "patient",
    fullName: me.fullName,
    primaryHospitalId: me.primaryFacilityId ?? null,
    primaryHospitalName,
    primaryHospitalSlug,
  };
}
