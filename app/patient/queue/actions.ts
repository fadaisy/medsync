"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { requirePatientScope } from "@/lib/patient/scope";
import { createClient } from "@/lib/supabase/server";

const DeclareArgs = z.object({
  receiving_department_id: z.string().uuid(),
  presenting_complaint: z.string().max(500).optional(),
});

export type DeclareIntakeState = {
  ok?: boolean;
  error?: string;
  /** Set when 409: patient already has a booking at this dept today. */
  existing_appointment_id?: string;
  /** Set when 409: patient already has a live queue ticket today. */
  existing_intake_id?: string;
};

export async function declareIntakeAction(
  _prev: DeclareIntakeState,
  formData: FormData,
): Promise<DeclareIntakeState> {
  const note = (formData.get("presenting_complaint") as string | null) ?? undefined;
  const parsed = DeclareArgs.safeParse({
    receiving_department_id: formData.get("receiving_department_id"),
    presenting_complaint: note && note.trim() ? note.trim() : undefined,
  });
  if (!parsed.success) {
    const fe = parsed.error.flatten().fieldErrors;
    const first = Object.values(fe).flat().find(Boolean);
    return { error: first ?? "Please pick a department and try again." };
  }

  const scope = await requirePatientScope();
  if (!scope.primaryHospitalId) {
    return { error: "Set your primary hospital before joining a queue." };
  }

  const supabase = await createClient();
  const { data: session } = await supabase.auth.getSession();
  const token = session.session?.access_token;
  if (!token) return { error: "You aren't signed in." };

  try {
    const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/pt-declare-intake`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
        "x-request-id": crypto.randomUUID(),
      },
      body: JSON.stringify({
        ...parsed.data,
        hospital_id: scope.primaryHospitalId,
      }),
    });
    const text = await res.text();
    if (!res.ok) {
      // Parse the structured error envelope. 409s carry details
      // (existing_appointment_id / existing_intake_id) that let the
      // form surface a follow-up link instead of just a message.
      let message = `Couldn't join the queue (status ${res.status}).`;
      let details: { existing_appointment_id?: string; existing_intake_id?: string } | null = null;
      try {
        const body = JSON.parse(text) as {
          error?: {
            message?: string;
            details?: { existing_appointment_id?: string; existing_intake_id?: string };
          };
        };
        if (body.error?.message) message = body.error.message;
        if (body.error?.details) details = body.error.details;
      } catch {
        /* keep default */
      }
      logger.warn("patient.queue.declare.failed", { status: res.status });
      return {
        error: message,
        existing_appointment_id: details?.existing_appointment_id,
        existing_intake_id: details?.existing_intake_id,
      };
    }
    const body = JSON.parse(text) as { data?: { intake_id?: string } };
    const intakeId = body.data?.intake_id;
    revalidatePath("/patient");
    revalidatePath("/patient/queue");
    if (!intakeId) return { ok: true };
    redirect(`/patient/queue/${intakeId}`);
  } catch (e) {
    // redirect() throws a NEXT_REDIRECT — re-throw so Next handles it.
    if (e && typeof e === "object" && "digest" in e) throw e;
    logger.error("patient.queue.declare.network", { reason: String(e) });
    return { error: "Couldn't reach the queue service. Try again in a moment." };
  }

  return { ok: true };
}
