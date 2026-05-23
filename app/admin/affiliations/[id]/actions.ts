"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { z } from "zod";

import { staffAffiliations } from "@/db/schema";
import { approveStaffAffiliation, rejectStaffAffiliation } from "@/lib/approvals";
import { adminHospitalIds, requireAdminish } from "@/lib/auth";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

/**
 * Approve / reject actions for /admin/affiliations/[id].
 *
 * Authorization: must be either superadmin OR a hospital_admin
 * scoped to the affiliation's hospital. The lookup happens
 * server-side here (not in the client form) so a forged
 * affiliation_id can't bypass the scope check.
 */

const sql = postgres(env.DATABASE_URL, { prepare: false, max: 3, idle_timeout: 20 });
const db = drizzle(sql);

const ApproveSchema = z.object({ affiliation_id: z.string().uuid() });
const RejectSchema = z.object({
  affiliation_id: z.string().uuid(),
  reason: z.string().trim().min(5, "Please give a reason — the clinician sees this.").max(800),
});

export type AffiliationDecisionState = {
  ok?: boolean;
  error?: string;
};

const initial: AffiliationDecisionState = {};

/**
 * Check the caller is allowed to act on this affiliation. Returns
 * the (joined) affiliation row on success, or an error string.
 */
async function authorizeForAffiliation(
  affiliationId: string,
): Promise<
  | { ok: true; affiliationId: string; userId: string; reviewerUserId: string }
  | { ok: false; error: string }
> {
  const auth = await requireAdminish();
  const isSuperadmin = auth.roles.includes("superadmin");

  const rows = await db
    .select({
      id: staffAffiliations.id,
      hospitalId: staffAffiliations.hospitalId,
    })
    .from(staffAffiliations)
    .where(eq(staffAffiliations.id, affiliationId))
    .limit(1);
  const affil = rows[0];
  if (!affil) return { ok: false, error: "Affiliation not found." };

  if (!isSuperadmin) {
    const scope = adminHospitalIds(auth);
    if (!scope.includes(affil.hospitalId)) {
      return {
        ok: false,
        error: "You can only act on affiliations at hospitals you administer.",
      };
    }
  }
  return {
    ok: true,
    affiliationId: affil.id,
    userId: auth.user!.id,
    reviewerUserId: auth.user!.id,
  };
}

export async function approveAffiliationAction(
  _prev: AffiliationDecisionState,
  formData: FormData,
): Promise<AffiliationDecisionState> {
  const parsed = ApproveSchema.safeParse({ affiliation_id: formData.get("affiliation_id") });
  if (!parsed.success) return { error: "Invalid request." };

  const guard = await authorizeForAffiliation(parsed.data.affiliation_id);
  if (!guard.ok) return { error: guard.error };

  const result = await approveStaffAffiliation({
    affiliationId: guard.affiliationId,
    approverUserId: guard.reviewerUserId,
  });
  if (!result.ok) {
    logger.warn("admin.affiliation.approve-failed", {
      affiliationId: parsed.data.affiliation_id,
      reason: result.error,
    });
    return { error: result.error };
  }
  revalidatePath("/admin/affiliations");
  revalidatePath(`/admin/affiliations/${parsed.data.affiliation_id}`);
  revalidatePath("/admin");
  return { ok: true };
}

export async function rejectAffiliationAction(
  _prev: AffiliationDecisionState,
  formData: FormData,
): Promise<AffiliationDecisionState> {
  const parsed = RejectSchema.safeParse({
    affiliation_id: formData.get("affiliation_id"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors.reason?.[0] ?? "Invalid request." };
  }

  const guard = await authorizeForAffiliation(parsed.data.affiliation_id);
  if (!guard.ok) return { error: guard.error };

  const result = await rejectStaffAffiliation({
    affiliationId: guard.affiliationId,
    approverUserId: guard.reviewerUserId,
    reason: parsed.data.reason,
  });
  if (!result.ok) {
    logger.warn("admin.affiliation.reject-failed", {
      affiliationId: parsed.data.affiliation_id,
      reason: result.error,
    });
    return { error: result.error };
  }
  revalidatePath("/admin/affiliations");
  revalidatePath(`/admin/affiliations/${parsed.data.affiliation_id}`);
  revalidatePath("/admin");
  return { ok: true };
}

export { initial as initialAffiliationState };
