"use server";

import { revalidatePath } from "next/cache";

import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { requirePatientScope } from "@/lib/patient/scope";
import { createClient } from "@/lib/supabase/server";

/**
 * Patient self-cancels a declared (not-yet-checked-in) intake. Reuses
 * the existing ha-cancel-intake Edge Function — the function was
 * extended (migration 0035) to allow the patient to cancel their own
 * row while it's still in 'declared'.
 */
export async function cancelDeclaredIntakeAction(
  intakeId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  // Every patient action goes through the scope: it is also the consent gate (ADR 0094).
  await requirePatientScope();
  const supabase = await createClient();
  const { data: session } = await supabase.auth.getSession();
  const token = session.session?.access_token;
  if (!token) return { ok: false, error: "You aren't signed in." };

  try {
    const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/ha-cancel-intake`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
        "x-request-id": crypto.randomUUID(),
      },
      body: JSON.stringify({
        intake_id: intakeId,
        reason: "Patient cancelled their own queue ticket before checking in.",
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      let message = `Couldn't cancel (status ${res.status}).`;
      try {
        const body = JSON.parse(text) as { error?: { message?: string } };
        if (body.error?.message) message = body.error.message;
      } catch {
        /* keep default */
      }
      logger.warn("patient.queue.cancel.failed", { status: res.status });
      return { ok: false, error: message };
    }
    revalidatePath("/patient");
    revalidatePath(`/patient/queue/${intakeId}`);
    return { ok: true };
  } catch (e) {
    logger.error("patient.queue.cancel.network", { reason: String(e) });
    return { ok: false, error: "Couldn't reach the queue service. Try again in a moment." };
  }
}
