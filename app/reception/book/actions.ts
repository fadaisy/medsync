"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireReceptionScope } from "@/lib/reception/scope";
import { callEdge } from "@/lib/supabase/edge";
import { PATIENT_REASON_CODES } from "@/supabase/functions/_shared/sessions-sql";
import {
  MAX_QUALIFIER_KEY,
  MAX_QUALIFIER_LABEL,
  MAX_SYMPTOM_LABEL,
  MAX_SYMPTOM_QUALIFIERS,
  MAX_SYMPTOMS,
  SYMPTOM_DURATION_CODES,
} from "@/supabase/functions/_shared/symptoms";

/**
 * The desk's one POST — `ha-book-on-behalf` (Gate D). Same slot | session
 * contract as the patient wizard, `channel: "desk"`, and EITHER a registered
 * patient OR a new caller's declared identity, which the Edge Function
 * encrypts into a provisional_patients row before booking. A provisional
 * booking is never merged into a record here: the desk reconciles it on the
 * Expected board when the person arrives (PRD §2.8).
 *
 * Nothing is scored or routed on what is sent (PRD §7.2 rule 1 as amended
 * by ADR 0095: symptoms travel as the caller's words, descriptive only).
 */
const Provisional = z
  .object({
    declared_name: z.string().trim().min(1, "The caller's name is needed.").max(120),
    phone_e164: z
      .string()
      .trim()
      .regex(/^\+256(7\d{8}|[23489]\d{7,8})$/, "A Ugandan number, like +256 7XX XXX XXX."),
    date_of_birth: z.string().date().optional(),
    age_years: z.number().int().min(0).max(130).optional(),
    phone_verified: z.literal(false),
  })
  .refine((p) => p.date_of_birth || p.age_years !== undefined, {
    message: "A date of birth or an age is needed.",
  });

const BookArgs = z
  .object({
    reason: z.enum([...PATIENT_REASON_CODES, "other"]),
    note: z.string().max(500).optional(),
    /** ADR 0095: the caller's own words, each with a duration — never routed on. */
    symptoms: z
      .array(
        z.object({
          code: z.string().max(64).nullable(),
          label: z.string().trim().min(1).max(MAX_SYMPTOM_LABEL),
          // v2 (ADR 0098 ruling 3): a catalog item carries qualifiers, not a chip.
          duration: z.enum(SYMPTOM_DURATION_CODES).nullable().optional(),
          qualifiers: z
            .array(
              z.object({
                key: z.string().trim().min(1).max(MAX_QUALIFIER_KEY),
                option: z.string().trim().min(1).max(MAX_QUALIFIER_KEY),
                label: z.string().trim().min(1).max(MAX_QUALIFIER_LABEL),
              }),
            )
            .max(MAX_SYMPTOM_QUALIFIERS)
            .optional(),
        }),
      )
      .max(MAX_SYMPTOMS)
      .optional(),
    idempotency_key: z.string().uuid(),
    patient_user_id: z.string().uuid().optional(),
    provisional: Provisional.optional(),
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
  .refine((i) => (i.slot ? 1 : 0) + (i.session ? 1 : 0) === 1, { message: "Choose a day first." })
  .refine((i) => (i.patient_user_id ? 1 : 0) + (i.provisional ? 1 : 0) === 1, {
    message: "Say who this booking is for.",
  });

export type DeskBookInput = z.input<typeof BookArgs>;

export interface DeskBookingReceipt {
  appointment_id: string;
  status: string;
  booking_code: string | null;
  position_number: number | null;
  arrival_window_start: string | null;
  arrival_window_end: string | null;
  provisional_patient_id: string | null;
}

export type DeskBookResult =
  | { ok: true; receipt: DeskBookingReceipt }
  | { ok: false; error: string };

export async function bookOnBehalfAction(input: DeskBookInput): Promise<DeskBookResult> {
  const parsed = BookArgs.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the values." };
  }
  const scope = await requireReceptionScope();
  const { note, ...rest } = parsed.data;
  const result = await callEdge<{ data?: DeskBookingReceipt }>(
    "ha-book-on-behalf",
    {
      ...rest,
      note: note?.trim() ? note.trim() : null,
      hospital_id: scope.hospitalId,
      channel: "desk",
    },
    "reception",
  );
  if (!result.ok) return { ok: false, error: result.error };
  if (!result.data?.data?.appointment_id) {
    return { ok: false, error: "The booking service answered, but not with a booking." };
  }
  revalidatePath("/reception");
  revalidatePath("/reception/expected");
  revalidatePath("/reception/flow");
  return { ok: true, receipt: result.data.data };
}
