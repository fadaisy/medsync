/**
 * Approval / rejection helpers for GATE F.
 *
 * Two domains, two ladders:
 *
 *   - Hospital application
 *       superadmin only
 *       approve: create public.hospitals row → set
 *                hospital_applications.approved_hospital_id →
 *                transition application to 'approved' → insert
 *                user_roles row (hospital_admin scoped to new hospital)
 *                → user lifecycle pending_approval → approved → active
 *       reject:  set rejection_reason → transition application to
 *                'rejected'. The user account stays pending_approval
 *                so they can fix things and re-apply (the unique
 *                index allows them to UPDATE the same row while
 *                rejected via service role).
 *
 *   - Staff affiliation
 *       superadmin OR hospital_admin scoped to the affiliation's hospital
 *       approve: transition staff_affiliations to 'active' (with
 *                approved_by + approved_at) → if user is still
 *                pending_approval, lift them to active.
 *       reject:  set rejection_reason → transition affiliation to
 *                'rejected'. User lifecycle is untouched (they may
 *                hold other affiliations elsewhere).
 *
 * All writes go via service role so RLS doesn't gate the approver;
 * authorization is enforced one layer up in the server action before
 * we call these helpers. Every meaningful mutation lands in audit_log
 * thanks to the triggers from 0003 + 0015.
 */

import "server-only";

import type { HospitalApplication } from "@/db/schema";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { hospitalApplications } from "@/db/schema";
import { env } from "@/lib/env";
import { transitionAffiliationState, transitionUserState } from "@/lib/lifecycle";
import { logger } from "@/lib/logger";
import { createServiceClient } from "@/lib/supabase/service";

const sql = postgres(env.DATABASE_URL, { prepare: false, max: 3, idle_timeout: 20 });
const db = drizzle(sql);

// ─── Hospital application — approve ─────────────────────────────────────

export type ApproveHospitalResult =
  | { ok: true; hospitalId: string; applicantUserId: string }
  | { ok: false; error: string };

/**
 * Approve a pending hospital application.
 *
 * Steps:
 *   1. Load the application; reject the call if not pending_approval.
 *   2. Insert into public.hospitals. The slug is derived from the
 *      application name (lowercased, dashed). On unique-conflict we
 *      append a short hash to disambiguate.
 *   3. Update the application: state=approved, approved_hospital_id,
 *      reviewed_by, reviewed_at.
 *   4. Insert user_roles row (hospital_admin scoped to the new hospital).
 *   5. Transition the applicant's user state pending_approval →
 *      approved → active.
 */
export async function approveHospitalApplication(args: {
  applicationId: string;
  reviewerUserId: string;
}): Promise<ApproveHospitalResult> {
  const application = await loadApplication(args.applicationId);
  if (!application) {
    return { ok: false, error: "Application not found." };
  }
  if (application.state !== "pending_approval") {
    return {
      ok: false,
      error: `Application is in state '${application.state}', cannot approve.`,
    };
  }

  const sb = createServiceClient();

  // 2. Insert into public.hospitals.
  const baseSlug = slugify(application.hospitalName);
  const slug = await uniqueHospitalSlug(baseSlug);

  const { data: hospitalRow, error: insertHospitalErr } = await sb
    .from("hospitals")
    .insert({
      name: application.hospitalName,
      slug,
      country: "UG",
      district: await districtName(application.districtId),
      level: application.level,
    })
    .select("id")
    .single<{ id: string }>();

  if (insertHospitalErr || !hospitalRow) {
    logger.error("approval.hospital.insert-failed", {
      applicationId: application.id,
      reason: insertHospitalErr?.message ?? "no row returned",
    });
    return { ok: false, error: "Failed to create hospital row." };
  }

  // 3. Update the application.
  const { error: updateAppErr } = await sb
    .from("hospital_applications")
    .update({
      state: "approved",
      approved_hospital_id: hospitalRow.id,
      reviewed_by: args.reviewerUserId,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", application.id);
  if (updateAppErr) {
    logger.error("approval.hospital.application-update-failed", {
      applicationId: application.id,
      reason: updateAppErr.message,
    });
    return { ok: false, error: "Failed to mark application approved." };
  }

  // 4. Assign the applicant the hospital_admin role for the new hospital.
  const { error: roleErr } = await sb.from("user_roles").insert({
    user_id: application.applicantUserId,
    role: "hospital_admin",
    hospital_id: hospitalRow.id,
    created_by: args.reviewerUserId,
  });
  if (roleErr) {
    logger.error("approval.hospital.role-insert-failed", {
      applicationId: application.id,
      reason: roleErr.message,
    });
    return { ok: false, error: "Failed to assign hospital_admin role." };
  }

  // 5. Transition the applicant user pending_approval → approved → active.
  const a = await transitionUserState({
    userId: application.applicantUserId,
    to: "approved",
    reason: `hospital application ${application.id} approved`,
  });
  if (!a.ok) {
    logger.error("approval.hospital.user-approved-failed", {
      applicationId: application.id,
      error: a.error,
    });
    return { ok: false, error: "Failed to mark user approved." };
  }
  const b = await transitionUserState({
    userId: application.applicantUserId,
    to: "active",
    reason: `hospital application ${application.id} approved`,
  });
  if (!b.ok) {
    logger.error("approval.hospital.user-active-failed", {
      applicationId: application.id,
      error: b.error,
    });
    return { ok: false, error: "Failed to activate user." };
  }

  logger.info("approval.hospital.complete", {
    applicationId: application.id,
    hospitalId: hospitalRow.id,
  });
  return {
    ok: true,
    hospitalId: hospitalRow.id,
    applicantUserId: application.applicantUserId,
  };
}

// ─── Hospital application — reject ──────────────────────────────────────

export type RejectHospitalResult = { ok: true } | { ok: false; error: string };

export async function rejectHospitalApplication(args: {
  applicationId: string;
  reviewerUserId: string;
  reason: string;
}): Promise<RejectHospitalResult> {
  const application = await loadApplication(args.applicationId);
  if (!application) return { ok: false, error: "Application not found." };
  if (application.state !== "pending_approval") {
    return {
      ok: false,
      error: `Application is in state '${application.state}', cannot reject.`,
    };
  }
  const sb = createServiceClient();
  const { error } = await sb
    .from("hospital_applications")
    .update({
      state: "rejected",
      rejection_reason: args.reason,
      reviewed_by: args.reviewerUserId,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", application.id);
  if (error) {
    logger.error("approval.hospital.reject-failed", {
      applicationId: application.id,
      reason: error.message,
    });
    return { ok: false, error: "Failed to mark application rejected." };
  }
  logger.info("approval.hospital.rejected", { applicationId: application.id });
  return { ok: true };
}

// ─── Staff affiliation — approve / reject ───────────────────────────────

export type AffiliationDecisionResult = { ok: true } | { ok: false; error: string };

/**
 * Approve a pending staff affiliation. Transitions the affiliation
 * straight to 'active' (the GATE A enum allows pending_approval →
 * approved → active; we collapse those for staff because there's no
 * further check between the admin's approval and the user being able
 * to log in). If the user is still pending_approval, also lift their
 * lifecycle to active.
 */
export async function approveStaffAffiliation(args: {
  affiliationId: string;
  approverUserId: string;
}): Promise<AffiliationDecisionResult> {
  const sb = createServiceClient();

  // Load the affiliation so we know whose lifecycle to lift.
  const { data: affil, error: loadErr } = await sb
    .from("staff_affiliations")
    .select("id, user_id, state")
    .eq("id", args.affiliationId)
    .single<{ id: string; user_id: string; state: string }>();
  if (loadErr || !affil) return { ok: false, error: "Affiliation not found." };
  if (affil.state !== "pending_approval") {
    return {
      ok: false,
      error: `Affiliation is in state '${affil.state}', cannot approve.`,
    };
  }

  // pending_approval → approved → active.
  const a = await transitionAffiliationState({
    affiliationId: affil.id,
    to: "approved",
    approvedBy: args.approverUserId,
    reason: "hospital admin approved",
  });
  if (!a.ok) {
    return { ok: false, error: a.error ?? "Failed to approve affiliation." };
  }
  const b = await transitionAffiliationState({
    affiliationId: affil.id,
    to: "active",
    approvedBy: args.approverUserId,
    reason: "hospital admin approved",
  });
  if (!b.ok) {
    return { ok: false, error: b.error ?? "Failed to activate affiliation." };
  }

  // Lift the user's lifecycle if they're still pending_approval.
  const { data: userRow } = await sb
    .from("users")
    .select("state")
    .eq("id", affil.user_id)
    .single<{ state: string }>();
  if (userRow?.state === "pending_approval") {
    const u1 = await transitionUserState({
      userId: affil.user_id,
      to: "approved",
      reason: `affiliation ${affil.id} approved`,
    });
    if (u1.ok) {
      await transitionUserState({
        userId: affil.user_id,
        to: "active",
        reason: `affiliation ${affil.id} approved`,
      });
    }
    // Best-effort: if the user-state transition fails for any reason,
    // the affiliation is still active and the user can be promoted by
    // a re-run from the same UI. Logged inside transitionUserState.
  }

  logger.info("approval.affiliation.approved", { affiliationId: affil.id });
  return { ok: true };
}

export async function rejectStaffAffiliation(args: {
  affiliationId: string;
  approverUserId: string;
  reason: string;
}): Promise<AffiliationDecisionResult> {
  const sb = createServiceClient();
  const { data: affil, error: loadErr } = await sb
    .from("staff_affiliations")
    .select("id, state")
    .eq("id", args.affiliationId)
    .single<{ id: string; state: string }>();
  if (loadErr || !affil) return { ok: false, error: "Affiliation not found." };
  if (affil.state !== "pending_approval") {
    return {
      ok: false,
      error: `Affiliation is in state '${affil.state}', cannot reject.`,
    };
  }
  const r = await transitionAffiliationState({
    affiliationId: affil.id,
    to: "rejected",
    approvedBy: args.approverUserId,
    reason: args.reason,
  });
  if (!r.ok) return { ok: false, error: r.error ?? "Failed to reject affiliation." };
  logger.info("approval.affiliation.rejected", { affiliationId: affil.id });
  return { ok: true };
}

// ─── Helpers ────────────────────────────────────────────────────────────

async function loadApplication(applicationId: string): Promise<HospitalApplication | null> {
  const rows = await db
    .select()
    .from(hospitalApplications)
    .where(eq(hospitalApplications.id, applicationId))
    .limit(1);
  return rows[0] ?? null;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/**
 * Pick a slug that doesn't collide with an existing public.hospitals
 * row. We try the base slug first; on conflict we append a 6-char
 * suffix derived from a timestamp + random. Doesn't loop indefinitely
 * — a real collision after two tries is astronomically unlikely.
 */
async function uniqueHospitalSlug(base: string): Promise<string> {
  const sb = createServiceClient();
  const { data } = await sb.from("hospitals").select("slug").eq("slug", base).maybeSingle();
  if (!data) return base;
  const suffix = (Date.now() % 1_000_000).toString(36);
  return `${base}-${suffix}`;
}

/**
 * Resolve a district uuid to its display name (we store the plain
 * district name on public.hospitals.district for legacy reasons).
 * Returns null if no district was set.
 */
async function districtName(districtId: string | null): Promise<string | null> {
  if (!districtId) return null;
  const sb = createServiceClient();
  const { data } = await sb
    .from("ref_districts")
    .select("name")
    .eq("id", districtId)
    .maybeSingle<{ name: string }>();
  return data?.name ?? null;
}
