"use server";

import type { PhotoState } from "@/components/forms";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { storeAvatar } from "@/lib/avatars";
import { requireDoctorScope } from "@/lib/doctor/scope";
import { logger } from "@/lib/logger";
import { EMPLOYMENT } from "@/lib/onboarding/schemas";
import { joinRefusal } from "@/lib/onboarding/workplaces";
import { createServiceClient } from "@/lib/supabase/service";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Replace the doctor's photo (ADR 0085 §1). Field name: `photo`. */
export async function updateDoctorPhotoAction(
  _prev: PhotoState,
  formData: FormData,
): Promise<PhotoState> {
  const scope = await requireDoctorScope();
  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a photo first." };
  const key = await storeAvatar(scope.userId, file);
  if (!key) return { error: "We couldn't save that photo — try a JPEG or PNG under 8 MB." };
  // The shell (layout) shows the photo too, so revalidate the whole workspace.
  revalidatePath("/doctor", "layout");
  return { ok: true };
}

export type JoinState = { ok?: boolean; error?: string };

const JoinInput = z.object({
  hospitalId: z.string().regex(UUID),
  departmentId: z.string().regex(UUID),
  employmentType: z.enum(EMPLOYMENT),
});

/**
 * Ask to join one more hospital (ADR 0530): a new pending request in the same post, which only
 * that hospital's admin approves or rejects. Nothing changes at the doctor's other hospitals.
 */
export async function requestHospitalAction(input: unknown): Promise<JoinState> {
  const scope = await requireDoctorScope();
  const parsed = JoinInput.safeParse(input);
  if (!parsed.success) return { error: "Choose the hospital, department and employment." };
  const v = parsed.data;
  const service = createServiceClient();
  const [mine, dept, post] = await Promise.all([
    service.from("staff_affiliations").select("hospital_id, state").eq("user_id", scope.userId),
    service
      .from("hospital_departments")
      .select("id")
      .eq("id", v.departmentId)
      .eq("hospital_id", v.hospitalId)
      .not("medsync_live_at", "is", null)
      .is("archived_at", null)
      .maybeSingle(),
    service
      .from("staff_affiliations")
      .select("cadre_id, cadre_grade_id, role_id, specialty_id")
      .eq("id", scope.affiliationId)
      .single(),
  ]);
  if (mine.error || post.error) return { error: "We couldn't send that. Try again." };
  const refusal = joinRefusal(
    mine.data.map((r) => ({ hospitalId: r.hospital_id as string, state: r.state as string })),
    v.hospitalId,
  );
  if (refusal) return { error: refusal };
  if (!dept.data) return { error: "Choose a department at this hospital." };

  const { error } = await service.from("staff_affiliations").insert({
    user_id: scope.userId,
    hospital_id: v.hospitalId,
    department_id: v.departmentId,
    ...post.data,
    employment_type: v.employmentType,
    state: "pending_approval",
  });
  if (error) {
    // The same hospital, department and post was refused or ended before: one row per post.
    if (error.code === "23505")
      return { error: "You asked this department before. Choose another, or ask its admin." };
    logger.error("doctor-profile.join_failed", { reason: error.message });
    return { error: "We couldn't send that. Try again." };
  }
  logger.info("doctor-profile.join_requested", { hospital_id: v.hospitalId });
  revalidatePath("/doctor/profile");
  return { ok: true };
}
