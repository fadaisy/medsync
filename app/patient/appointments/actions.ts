"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { requirePatientScope } from "@/lib/patient/scope";
import { createClient } from "@/lib/supabase/server";

const CancelArgs = z.object({
  appointment_id: z.string().uuid(),
  reason: z.string().min(8, "Reason ≥ 8 chars required."),
});

export type PatientApptActionState = { ok?: boolean; error?: string };

export async function cancelMyAppointmentAction(
  _prev: PatientApptActionState,
  formData: FormData,
): Promise<PatientApptActionState> {
  const parsed = CancelArgs.safeParse({
    appointment_id: formData.get("appointment_id"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) {
    return { error: parsed.error.flatten().fieldErrors.reason?.[0] ?? "Invalid input." };
  }
  await requirePatientScope();
  const supabase = await createClient();
  const { data: session } = await supabase.auth.getSession();
  const token = session.session?.access_token;
  if (!token) return { error: "Not authenticated." };

  try {
    const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/cancel-appointment`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
        "x-request-id": crypto.randomUUID(),
      },
      body: JSON.stringify(parsed.data),
    });
    if (!res.ok) {
      let detail = await res.text();
      try {
        const j = JSON.parse(detail) as { error?: string | { message?: string } };
        if (typeof j.error === "string") detail = j.error;
        else if (j.error?.message) detail = j.error.message;
      } catch {
        /* keep */
      }
      logger.warn("patient.appointments.cancel.failed", { status: res.status });
      return { error: detail || `Cancel failed (status ${res.status}).` };
    }
  } catch (e) {
    logger.error("patient.appointments.cancel.network", { reason: String(e) });
    return { error: "Couldn't reach the cancel service." };
  }
  revalidatePath("/patient");
  revalidatePath("/patient/appointments");
  return { ok: true };
}
