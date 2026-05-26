"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { requirePatientScope } from "@/lib/patient/scope";
import { createClient } from "@/lib/supabase/server";

const BookArgs = z.object({
  clinician_user_id: z.string().uuid(),
  department_id: z.string().uuid(),
  reason: z.enum(["follow_up", "new_concern", "refill", "routine", "urgent_review", "other"]),
  reason_note: z.string().max(500).optional(),
  starts_at: z.string().datetime({ offset: true }),
  ends_at: z.string().datetime({ offset: true }),
  type: z.enum(["in_person", "virtual"]).default("in_person"),
});

export type BookActionState = { ok?: boolean; error?: string; appointmentId?: string };

export async function bookAppointmentAction(
  _prev: BookActionState,
  formData: FormData,
): Promise<BookActionState> {
  const reasonNote = (formData.get("reason_note") as string | null) ?? undefined;
  const parsed = BookArgs.safeParse({
    clinician_user_id: formData.get("clinician_user_id"),
    department_id: formData.get("department_id"),
    reason: formData.get("reason"),
    reason_note: reasonNote && reasonNote.trim() ? reasonNote.trim() : undefined,
    starts_at: formData.get("starts_at"),
    ends_at: formData.get("ends_at"),
    type: formData.get("type") ?? "in_person",
  });
  if (!parsed.success) {
    const fe = parsed.error.flatten().fieldErrors;
    const first = Object.values(fe).flat().find(Boolean);
    return { error: first ?? "Please check your selections and try again." };
  }

  const scope = await requirePatientScope();
  if (!scope.primaryHospitalId) {
    return { error: "Set your primary hospital before booking." };
  }

  const supabase = await createClient();
  const { data: session } = await supabase.auth.getSession();
  const token = session.session?.access_token;
  if (!token) return { error: "You aren't signed in." };

  try {
    const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/pt-request-appointment`, {
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
      let detail = text;
      try {
        const parsedBody = JSON.parse(text) as { error?: string | { message?: string } };
        if (typeof parsedBody.error === "string") detail = parsedBody.error;
        else if (parsedBody.error?.message) detail = parsedBody.error.message;
      } catch {
        /* keep raw */
      }
      logger.warn("patient.book.failed", { status: res.status });
      return { error: detail || `Booking failed (status ${res.status}).` };
    }
    const parsedBody = JSON.parse(text) as {
      data?: { appointment_id?: string; status?: string };
    };
    const appointmentId = parsedBody.data?.appointment_id;
    revalidatePath("/patient");
    revalidatePath("/patient/appointments");
    if (!appointmentId) return { ok: true };
    // Hand the patient to the appointments list — their fresh booking
    // sits at the top there. (Showing a dedicated success screen is a
    // polish item.)
    redirect("/patient/appointments");
  } catch (e) {
    // redirect() throws a NEXT_REDIRECT — re-throw so Next handles it.
    if (e && typeof e === "object" && "digest" in e) throw e;
    logger.error("patient.book.network", { reason: String(e) });
    return { error: "Couldn't reach the booking service. Try again in a moment." };
  }

  // Unreachable — redirect() above either redirects or throws.
  return { ok: true };
}
