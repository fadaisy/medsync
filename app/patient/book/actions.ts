"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { requirePatientScope } from "@/lib/patient/scope";
import { createClient } from "@/lib/supabase/server";
import { PATIENT_REASON_CODES } from "@/supabase/functions/_shared/sessions-sql";

/**
 * The wizard's one POST, mirroring `pt-request-appointment`'s three-mode
 * contract (ADR 0088): exactly one of `slot` or `session`, an idempotency
 * key the wizard minted once per attempt, and `channel: "web"`.
 *
 * Validated again here even though the Edge Function validates too — this
 * is a Server Function reachable by a direct POST, and the message a patient
 * sees for a malformed pick should be ours, not a zod flatten from Deno.
 */
const BookArgs = z
  .object({
    reason: z.enum(PATIENT_REASON_CODES),
    reason_note: z.string().max(500).optional(),
    idempotency_key: z.string().uuid(),
    slot: z
      .object({
        clinician_user_id: z.string().uuid(),
        department_id: z.string().uuid(),
        service_line_id: z.string().uuid(),
        starts_at: z.string().datetime({ offset: true }),
        ends_at: z.string().datetime({ offset: true }),
        type: z.enum(["in_person", "virtual"]).default("in_person"),
      })
      .optional(),
    session: z.object({ session_id: z.string().uuid() }).optional(),
  })
  .refine((i) => (i.slot ? 1 : 0) + (i.session ? 1 : 0) === 1, {
    message: "Choose a day first.",
  });

export type BookInput = z.input<typeof BookArgs>;

/** What `pt-request-appointment` returns on a fresh insert and on a replay alike. */
export interface BookingReceipt {
  appointment_id: string;
  status: string;
  booking_code: string | null;
  position_number: number | null;
  arrival_window_start: string | null;
  arrival_window_end: string | null;
}

export type BookActionResult =
  | { ok: true; receipt: BookingReceipt }
  | { ok: false; error: string; status?: number };

export async function bookAppointmentAction(input: BookInput): Promise<BookActionResult> {
  const parsed = BookArgs.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.issues[0]?.message;
    return { ok: false, error: first ?? "Please check your selections and try again." };
  }

  const scope = await requirePatientScope();
  if (!scope.primaryHospitalId) {
    return { ok: false, error: "Choose the hospital you go to first." };
  }

  const supabase = await createClient();
  const { data: session } = await supabase.auth.getSession();
  const token = session.session?.access_token;
  if (!token) return { ok: false, error: "You aren't signed in." };

  const { reason_note, ...rest } = parsed.data;
  try {
    const res = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/pt-request-appointment`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
        "x-request-id": crypto.randomUUID(),
      },
      body: JSON.stringify({
        ...rest,
        reason_note: reason_note?.trim() ? reason_note.trim() : null,
        hospital_id: scope.primaryHospitalId,
        channel: "web",
      }),
    });
    const text = await res.text();
    if (!res.ok) {
      // The Edge Function's sentence, word for word — it is written for the
      // patient ("This clinic day is full — here are the next two.").
      let detail = text;
      try {
        const body = JSON.parse(text) as { error?: string | { message?: string } };
        if (typeof body.error === "string") detail = body.error;
        else if (body.error?.message) detail = body.error.message;
      } catch {
        /* keep raw */
      }
      logger.warn("patient.book.failed", { status: res.status });
      return {
        ok: false,
        status: res.status,
        error: detail || `We could not send that (status ${res.status}).`,
      };
    }
    const body = JSON.parse(text) as { data?: BookingReceipt };
    if (!body.data?.appointment_id) {
      logger.error("patient.book.malformed", {});
      return { ok: false, error: "The hospital's system answered, but not with a booking." };
    }
    revalidatePath("/patient");
    revalidatePath("/patient/appointments");
    return { ok: true, receipt: body.data };
  } catch (e) {
    logger.error("patient.book.network", { reason: String(e) });
    return { ok: false, error: "Couldn't reach the hospital's system. Try again in a moment." };
  }
}
