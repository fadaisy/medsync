"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { approveHospitalApplication, rejectHospitalApplication } from "@/lib/approvals";
import { requireSuperadmin } from "@/lib/auth";
import { logger } from "@/lib/logger";

/**
 * Approve / reject actions for /admin/applications/[id].
 *
 * Both gate on requireSuperadmin (which redirects unauthenticated /
 * non-superadmin callers). The actual business logic lives in
 * lib/approvals.ts so it can be tested + reused from elsewhere (e.g.
 * a future Supabase Edge Function variant).
 */

const ApproveSchema = z.object({
  application_id: z.string().uuid(),
});

const RejectSchema = z.object({
  application_id: z.string().uuid(),
  reason: z.string().trim().min(5, "Please give a reason — the applicant sees this.").max(800),
});

export type DecisionState = {
  ok?: boolean;
  error?: string;
};

const initial: DecisionState = {};

export async function approveApplicationAction(
  _prev: DecisionState,
  formData: FormData,
): Promise<DecisionState> {
  const parsed = ApproveSchema.safeParse({
    application_id: formData.get("application_id"),
  });
  if (!parsed.success) return { error: "Invalid request." };

  const auth = await requireSuperadmin();

  const result = await approveHospitalApplication({
    applicationId: parsed.data.application_id,
    reviewerUserId: auth.user!.id,
  });
  if (!result.ok) {
    logger.warn("admin.application.approve-failed", {
      applicationId: parsed.data.application_id,
      reason: result.error,
    });
    return { error: result.error };
  }
  revalidatePath("/admin/applications");
  revalidatePath(`/admin/applications/${parsed.data.application_id}`);
  revalidatePath("/admin");
  return { ok: true };
}

export async function rejectApplicationAction(
  _prev: DecisionState,
  formData: FormData,
): Promise<DecisionState> {
  const parsed = RejectSchema.safeParse({
    application_id: formData.get("application_id"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors.reason?.[0] ?? "Invalid request." };
  }

  const auth = await requireSuperadmin();

  const result = await rejectHospitalApplication({
    applicationId: parsed.data.application_id,
    reviewerUserId: auth.user!.id,
    reason: parsed.data.reason,
  });
  if (!result.ok) {
    logger.warn("admin.application.reject-failed", {
      applicationId: parsed.data.application_id,
      reason: result.error,
    });
    return { error: result.error };
  }
  revalidatePath("/admin/applications");
  revalidatePath(`/admin/applications/${parsed.data.application_id}`);
  revalidatePath("/admin");
  return { ok: true };
}

export { initial as initialDecisionState };
