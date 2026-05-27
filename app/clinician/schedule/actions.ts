"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireClinicianScope } from "@/lib/clinician/scope";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { createClient } from "@/lib/supabase/server";

const ReasonArgs = z.object({
  appointment_id: z.string().uuid(),
  reason: z.string().min(8, "Reason ≥ 8 chars required."),
});

export type ScheduleActionState = { ok?: boolean; error?: string };

async function callEdge(
  name: string,
  body: Record<string, unknown>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data: session } = await supabase.auth.getSession();
  const token = session.session?.access_token;
  if (!token) return { ok: false, error: "Not authenticated." };
  try {
    const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/${name}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
        "x-request-id": crypto.randomUUID(),
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      let detail = await res.text();
      try {
        const parsed = JSON.parse(detail) as { error?: string | { message?: string } };
        if (typeof parsed.error === "string") detail = parsed.error;
        else if (parsed.error?.message) detail = parsed.error.message;
      } catch {
        /* keep */
      }
      logger.warn(`clinician.schedule.${name}.failed`, { status: res.status });
      return { ok: false, error: detail || `Edge Function returned ${res.status}.` };
    }
    return { ok: true };
  } catch (e) {
    logger.error(`clinician.schedule.${name}.network`, { reason: String(e) });
    return { ok: false, error: `Couldn't reach ${name}.` };
  }
}

async function pinScope(): Promise<void> {
  await requireClinicianScope();
}

function makeAction(edgeName: string) {
  return async (_prev: ScheduleActionState, formData: FormData): Promise<ScheduleActionState> => {
    const parsed = ReasonArgs.safeParse({
      appointment_id: formData.get("appointment_id"),
      reason: formData.get("reason"),
    });
    if (!parsed.success) {
      return { error: parsed.error.flatten().fieldErrors.reason?.[0] ?? "Invalid input." };
    }
    await pinScope();
    const result = await callEdge(edgeName, parsed.data);
    if (!result.ok) return { error: result.error };
    revalidatePath("/clinician/schedule");
    return { ok: true };
  };
}

export const confirmAppointmentAction = makeAction("ha-confirm-appointment-request");
export const declineAppointmentAction = makeAction("ha-decline-appointment-request");
export const cancelAppointmentAction = makeAction("cancel-appointment");
export const markNoShowAction = makeAction("ha-mark-no-show");
