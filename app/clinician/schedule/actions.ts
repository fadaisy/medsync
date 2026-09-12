"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireClinicianScope } from "@/lib/clinician/scope";
import { callEdge } from "@/lib/supabase/edge";

const ReasonArgs = z.object({
  appointment_id: z.string().uuid(),
  reason: z.string().min(8, "Reason ≥ 8 chars required."),
});

export type ScheduleActionState = { ok?: boolean; error?: string };

function makeAction(edgeName: string) {
  return async (_prev: ScheduleActionState, formData: FormData): Promise<ScheduleActionState> => {
    const parsed = ReasonArgs.safeParse({
      appointment_id: formData.get("appointment_id"),
      reason: formData.get("reason"),
    });
    if (!parsed.success) {
      return { error: parsed.error.flatten().fieldErrors.reason?.[0] ?? "Invalid input." };
    }
    await requireClinicianScope();
    const result = await callEdge(edgeName, parsed.data, "clinician.schedule");
    if (!result.ok) return { error: result.error };
    revalidatePath("/clinician/schedule");
    return { ok: true };
  };
}

export const confirmAppointmentAction = makeAction("ha-confirm-appointment-request");
export const declineAppointmentAction = makeAction("ha-decline-appointment-request");
export const cancelAppointmentAction = makeAction("cancel-appointment");
export const markNoShowAction = makeAction("ha-mark-no-show");
