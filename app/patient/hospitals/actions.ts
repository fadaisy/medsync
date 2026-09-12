"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { logger } from "@/lib/logger";
import { requirePatientScope } from "@/lib/patient/scope";
import { createClient } from "@/lib/supabase/server";

/**
 * Patient picks a primary hospital. Updates patient_profiles.primary_facility_id.
 * RLS (patient_profiles_update_own from migration 0011) enforces ownership.
 */
const SelectHospitalSchema = z.object({
  hospital_id: z.string().uuid(),
});

export type SelectHospitalState = { ok?: boolean; error?: string };

export async function selectPrimaryHospitalAction(
  hospitalId: string,
): Promise<SelectHospitalState> {
  const parsed = SelectHospitalSchema.safeParse({ hospital_id: hospitalId });
  if (!parsed.success) return { error: "Please pick a hospital." };

  const scope = await requirePatientScope();
  const supabase = await createClient();

  // Verify the hospital exists + is active before assigning. Defence
  // in depth — superadmin RLS would already block writing to a
  // suspended hospital here, but failing early with a clear message
  // beats a downstream booking failure.
  const { data: target, error: targetError } = await supabase
    .from("hospitals")
    .select("id, state")
    .eq("id", parsed.data.hospital_id)
    .maybeSingle();
  if (targetError || !target) {
    logger.warn("patient.hospitals.select_lookup_failed", {
      reason: targetError?.message ?? "not_found",
    });
    return { error: "We couldn't find that hospital." };
  }
  if (target.state !== "active") {
    return { error: "That hospital isn't accepting patients right now." };
  }

  const { error } = await supabase
    .from("patient_profiles")
    .update({ primary_facility_id: parsed.data.hospital_id })
    .eq("id", scope.userId);

  if (error) {
    logger.warn("patient.hospitals.select_update_failed", { reason: error.message });
    return { error: "Couldn't save that — try again in a moment." };
  }

  revalidatePath("/patient");
  revalidatePath("/patient/hospitals");
  revalidatePath("/patient/menu");
  return { ok: true };
}
