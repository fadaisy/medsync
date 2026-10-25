"use server";

import type { MoveOption } from "@/lib/patient-web/visits-data";
import { revalidatePath } from "next/cache";
import { MIN_REASON_CHARS } from "@patient-core/visits-calendar";
import { z } from "zod";

import { VISITS_COPY as C } from "@/content/patient/visits";
import { loadVisit, moveOptions } from "@/lib/patient-web/visits-data";
import { requirePatientScope } from "@/lib/patient/scope";
import { callEdge } from "@/lib/supabase/edge";

/**
 * The one read "Move it" makes when its dialog opens (the phone's `moveOptions`): the visit is re-read as the
 * signed-in patient's own, so an id from the page can never ask for someone else's clinician. Cancel, I'm coming
 * and I'm here are the existing Edge Function actions in app/patient/appointments/actions.ts.
 */
export async function moveOptionsAction(
  visitId: string,
): Promise<{ ok: true; options: MoveOption[] } | { ok: false; error: string }> {
  if (!z.string().uuid().safeParse(visitId).success) return { ok: false, error: C.moveFailed };
  const scope = await requirePatientScope();
  const visit = await loadVisit(scope.userId, visitId).catch(() => null);
  if (!visit || visit.forMember !== null) return { ok: false, error: C.moveFailed };
  return moveOptions(visit).then(
    (options) => ({ ok: true as const, options }),
    () => ({ ok: false as const, error: C.moveFailed }),
  );
}

const MoveArgs = z.object({
  appointment_id: z.string().uuid(),
  new_starts_at: z.iso.datetime({ offset: true }),
  new_ends_at: z.iso.datetime({ offset: true }),
  reason: z.string().trim().min(MIN_REASON_CHARS),
});

/**
 * Move it: `reschedule-appointment`, as app/patient/appointments/actions.ts calls it, but keeping the new
 * visit's id so the page can open it (the phone does the same). A refusal is the server's sentence.
 */
export async function moveVisitAction(input: {
  appointmentId: string;
  startsAtIso: string;
  endsAtIso: string;
  reason: string;
}): Promise<{ ok: true; newId: string | null } | { ok: false; error: string }> {
  const parsed = MoveArgs.safeParse({
    appointment_id: input.appointmentId,
    new_starts_at: input.startsAtIso,
    new_ends_at: input.endsAtIso,
    reason: input.reason,
  });
  if (!parsed.success) return { ok: false, error: C.reasonShort(MIN_REASON_CHARS) };
  await requirePatientScope();
  const res = await callEdge<{ data?: { new_appointment_id?: string } }>(
    "reschedule-appointment",
    parsed.data,
    "patient-web.visits",
  );
  if (!res.ok) return res;
  revalidatePath("/patient", "layout");
  return { ok: true, newId: res.data?.data?.new_appointment_id ?? null };
}
