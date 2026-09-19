import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";
import { and, desc, eq, isNull } from "drizzle-orm";

import { db } from "@/db";
import { consentRecords } from "@/db/schema/consent-records";
import { consentVersions } from "@/db/schema/consent-versions";
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
  /** `users.avatar_path` — storage key of their photo, or null (ADR 0085 §1). */
  avatarPath: string | null;
  /** May be null — caller decides whether to block. */
  primaryHospitalId: string | null;
  primaryHospitalName: string | null;
  primaryHospitalSlug: string | null;
  /**
   * `hospitals.emergency_phone` — null until someone has verified a number for
   * this hospital during activation (ADR 0084 §3).
   *
   * It rides the scope because EVERY patient surface that carries a door
   * carries the emergency block above it, and the block is the one thing on
   * those screens that must not depend on a page remembering to ask. Null is
   * the ADR's correct state, not an error state: the block then shows the
   * destination alone, and a guessed or hardcoded number would be the most
   * dangerous fabricated datum in the product.
   */
  emergencyEntrancePhone: string | null;
}

/**
 * Memoised per request: the layout and the page it wraps both call
 * this, and without `cache()` every patient navigation runs the
 * users ⋈ patient_profiles read (and the hospitals read behind it)
 * twice. React's `cache` also memoises a rejection, so the
 * `redirect()` paths still throw the identical NEXT_REDIRECT to the
 * second caller — Next detects those by digest string, never by
 * identity. Outside a render pass (a Server Action calling this
 * before it mutates) React has no cache dispatcher and calls
 * straight through, so a scope changed by an action is never served
 * stale to the re-render that follows.
 *
 * Two entry points (Gate H, ADR 0094):
 *   - `requirePatientScope` — every page and action. Also the consent
 *     gate: a patient with no `data_processing` record against the
 *     ACTIVE consent text is sent to /patient/consent to re-accept
 *     before anything else.
 *   - `resolvePatientScope` — the layout and the consent page itself,
 *     which must render while the gate is closed (a layout cannot see
 *     the pathname, so it cannot exempt itself from a redirect).
 */
export const requirePatientScope = cache(async (): Promise<PatientScope> => {
  const scope = await resolvePatientScope();
  const consent = await dataProcessingConsent(scope.userId);
  if (consent && consent.acceptedAt === null) redirect("/patient/consent");
  return scope;
});

export const resolvePatientScope = cache(async (): Promise<PatientScope> => {
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
      avatarPath: users.avatarPath,
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
  // Patient signup currently lands at 'verified' (the post-OTP /
  // phone-verification bump that takes verified → active hasn't shipped
  // yet — patient/actions.ts:276 sets state='verified'). Both states
  // are "can use the patient app" for now. unverified / suspended /
  // deactivated bounce.
  const REACHABLE_PATIENT_STATES = new Set(["verified", "active"]);
  if (!REACHABLE_PATIENT_STATES.has(me.userState)) {
    logger.warn("patient.scope.user_state_unreachable", {
      user_id: state.user.id,
      user_state: me.userState,
    });
    redirect("/");
  }

  let primaryHospitalName: string | null = null;
  let primaryHospitalSlug: string | null = null;
  let emergencyEntrancePhone: string | null = null;
  if (me.primaryFacilityId) {
    const [h] = await db
      .select({
        name: hospitals.name,
        slug: hospitals.slug,
        emergencyPhone: hospitals.emergencyPhone,
      })
      .from(hospitals)
      .where(eq(hospitals.id, me.primaryFacilityId))
      .limit(1);
    primaryHospitalName = h?.name ?? null;
    primaryHospitalSlug = h?.slug ?? null;
    emergencyEntrancePhone = h?.emergencyPhone ?? null;
  }

  return {
    userId: state.user.id,
    userEmail: state.user.email ?? "patient",
    fullName: me.fullName,
    avatarPath: me.avatarPath,
    primaryHospitalId: me.primaryFacilityId ?? null,
    primaryHospitalName,
    primaryHospitalSlug,
    emergencyEntrancePhone,
  };
});

/* ─── Consent re-acceptance (Gate H, ADR 0094) ────────────────────── */

export interface DataProcessingConsent {
  /** The active `consent_versions` row — latest effective_date for 'data_processing'. */
  version: string;
  body: string;
  bodySha256: string;
  effectiveDate: string;
  /** When THIS patient accepted THIS text; null = they must (re-)accept. */
  acceptedAt: Date | null;
}

/**
 * The active data-processing text and whether this patient has accepted
 * it. "Accepted" is a `consent_records` row on the same version AND the
 * same body hash, not revoked — a record whose hash matches no shipped
 * text proves nothing (the handoff's case: five patients whose signup
 * never wrote a row; nobody can say what they saw, so nothing is
 * backfilled and they are asked again).
 *
 * Null when no version is seeded at all (a DB before migration 0012):
 * there is nothing to accept, so the gate stays open.
 */
export const dataProcessingConsent = cache(
  async (userId: string): Promise<DataProcessingConsent | null> => {
    const [active] = await db
      .select({
        version: consentVersions.version,
        body: consentVersions.body,
        bodySha256: consentVersions.bodySha256,
        effectiveDate: consentVersions.effectiveDate,
      })
      .from(consentVersions)
      .where(eq(consentVersions.consentType, "data_processing"))
      .orderBy(desc(consentVersions.effectiveDate))
      .limit(1);
    if (!active) return null;
    const [record] = await db
      .select({ acceptedAt: consentRecords.acceptedAt })
      .from(consentRecords)
      .where(
        and(
          eq(consentRecords.userId, userId),
          eq(consentRecords.consentType, "data_processing"),
          eq(consentRecords.version, active.version),
          eq(consentRecords.consentTextSha256, active.bodySha256),
          isNull(consentRecords.revokedAt),
        ),
      )
      .limit(1);
    return { ...active, acceptedAt: record?.acceptedAt ?? null };
  },
);
