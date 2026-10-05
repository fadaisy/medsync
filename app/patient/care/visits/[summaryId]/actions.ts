"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/db";
import { prescriptions } from "@/db/schema/prescribing";
import { logger } from "@/lib/logger";
import { requirePatientScope } from "@/lib/patient/scope";
import { isTakeHomeOn, selfMedicationFromPrescription } from "@/lib/patient/visit-medicine";
import { getVisitSummary } from "@/lib/patient/visit-summaries";
import { createClient } from "@/lib/supabase/server";

export type AddFromVisitState = { ok?: boolean; error?: string };

const Args = z.object({ summary_id: z.string().uuid(), prescription_id: z.string().uuid() });

/**
 * "Add to my medicines" (ADR 0203 §7): only on the patient's tap, only for a take-home item on their own current
 * shared copy. The prescription is read on the server; the row is written through the patient's RLS client, as
 * `addMedicationAction` writes, with no dose times (the patient sets them).
 */
export async function addMedicineFromVisitAction(
  _prev: AddFromVisitState,
  formData: FormData,
): Promise<AddFromVisitState> {
  const parsed = Args.safeParse({
    summary_id: formData.get("summary_id"),
    prescription_id: formData.get("prescription_id"),
  });
  if (!parsed.success) return { error: "That medicine can't be added." };
  const { summary_id: summaryId, prescription_id: prescriptionId } = parsed.data;

  const scope = await requirePatientScope();
  const content = await getVisitSummary(scope.userId, summaryId);
  if (!content || !isTakeHomeOn(content, prescriptionId)) {
    return { error: "That medicine can't be added." };
  }

  const [rx] = await db
    .select({
      id: prescriptions.id,
      drugName: prescriptions.drugName,
      dose: prescriptions.dose,
      route: prescriptions.route,
      frequency: prescriptions.frequency,
      duration: prescriptions.duration,
      state: prescriptions.state,
    })
    .from(prescriptions)
    .where(and(eq(prescriptions.id, prescriptionId), eq(prescriptions.patientUserId, scope.userId)))
    .limit(1);
  if (!rx || rx.state === "cancelled") {
    return { error: "This prescription is no longer active. Ask your care team." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("self_medications").insert({
    patient_user_id: scope.userId,
    ...selfMedicationFromPrescription(rx, content.visit),
  });

  if (error) {
    if (error.code === "23505") return { error: "Already in your medicines." };
    logger.warn("patient.care.add_med_from_visit_failed", { reason: error.message });
    return { error: "Couldn't save that — try again in a moment." };
  }

  revalidatePath("/patient");
  revalidatePath("/patient/track");
  revalidatePath("/patient/track/doses");
  revalidatePath("/patient/track/medications");
  revalidatePath(`/patient/care/visits/${summaryId}`);
  return { ok: true };
}
