"use server";

import type { BookingReceipt } from "@/app/patient/book/actions";
import type {
  ItemFlag,
  ServiceLineHint,
  Tier,
} from "@/supabase/functions/_shared/symptom-catalog/types";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { logger } from "@/lib/logger";
import { requirePatientScope } from "@/lib/patient/scope";
import { callEdge } from "@/lib/supabase/edge";
import { MAX_FREE_TEXT } from "@/supabase/functions/_shared/symptom-catalog/types";

/**
 * The catalog's writes (PRD MS-PRD-SYM-001 §7.2 S4; ADR 0098 rulings 1, 6).
 * Every one is an Edge Function through `callEdge`; the tier the client
 * computed offline is never sent — the server classifies the same items
 * against the same package and answers with its own.
 */

const AUDIENCE = z.enum(["adult", "child_u2m", "child_2m_5y", "child_5_12", "pregnant"]);

const SubmitArgs = z.object({
  audience: AUDIENCE,
  items: z.array(z.string().min(1).max(64)).min(1).max(12),
  qualifiers: z.record(z.string().max(64), z.record(z.string().max(64), z.string().max(64))),
  free_text: z.string().trim().max(MAX_FREE_TEXT).nullable().optional(),
});
export type SubmitInput = z.input<typeof SubmitArgs>;

export interface SubmissionResult {
  submission_id: string;
  tier: Tier;
  reasons: string[];
  flags: ItemFlag[];
  service_line_hint: ServiceLineHint | null;
  catalog_version: string;
}

export type SubmitResult =
  | { ok: true; submission: SubmissionResult }
  | { ok: false; error: string };

export async function submitSymptomsAction(input: SubmitInput): Promise<SubmitResult> {
  const parsed = SubmitArgs.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Please check what you chose and try again." };
  const scope = await requirePatientScope();
  const res = await callEdge<{ data?: SubmissionResult }>(
    "pt-submit-symptoms",
    {
      ...parsed.data,
      free_text: parsed.data.free_text || null,
      pregnant: parsed.data.audience === "pregnant",
      hospital_id: scope.primaryHospitalId ?? undefined,
      channel: "web",
    },
    "patient.symptoms",
  );
  if (!res.ok) return { ok: false, error: res.error };
  const submission = res.data?.data;
  if (!submission?.submission_id) {
    logger.error("patient.symptoms.submit.malformed", {});
    return { ok: false, error: "The hospital's system answered, but not with a report." };
  }
  return { ok: true, submission };
}

export type SameDayResult =
  | { ok: true; receipt: BookingReceipt }
  | { ok: false; noSlot: true }
  | { ok: false; noSlot?: false; error: string };

/** "Be seen today": the earliest slot left today at the patient's hospital, or an honest no. */
export async function requestSameDayAction(args: {
  submissionId: string;
  idempotencyKey: string;
}): Promise<SameDayResult> {
  const scope = await requirePatientScope();
  if (!scope.primaryHospitalId) return { ok: false, error: "Choose the hospital you go to first." };
  const res = await callEdge<{ data?: BookingReceipt }>(
    "pt-request-same-day",
    {
      hospital_id: scope.primaryHospitalId,
      submission_id: args.submissionId,
      idempotency_key: args.idempotencyKey,
    },
    "patient.symptoms",
  );
  if (!res.ok) {
    // `callEdge` flattens the envelope to its message; the 404's code is not
    // an error, it is the cue to offer today's queue (the function's own words).
    if (/slot left today/i.test(res.error)) return { ok: false, noSlot: true };
    return { ok: false, error: res.error };
  }
  if (!res.data?.data?.appointment_id) {
    return { ok: false, error: "The hospital's system answered, but not with a booking." };
  }
  revalidatePath("/patient");
  revalidatePath("/patient/appointments");
  return { ok: true, receipt: res.data.data };
}

const EventArgs = z.object({
  event: z.enum(["interrupt_shown", "declined", "call_tapped"]),
  item_key: z.string().max(64).optional(),
  submission_id: z.string().uuid().optional(),
});
export type EmergencyEventInput = z.input<typeof EventArgs>;

/**
 * Best effort (PRD §9.6): an interrupt, a decline, a call — never blocks the
 * patient. Returns whether it landed: the one caller that cares is the
 * decline that opens the same-day/booking door (the server gates on it).
 */
export async function emergencyEventAction(input: EmergencyEventInput): Promise<boolean> {
  const parsed = EventArgs.safeParse(input);
  if (!parsed.success) return false;
  try {
    const r = await callEdge("pt-emergency-event", parsed.data, "patient.symptoms");
    return r.ok;
  } catch {
    /* logged by callEdge; nothing for the patient to do */
    return false;
  }
}

/**
 * A search that found nothing — the term alone, for catalog-gap review
 * (PRD §7.4). No user id, no request context: the term is vocabulary, and
 * a line that could be joined to a person would make it PHI.
 */
export async function logZeroResultAction(term: string): Promise<void> {
  const clean = term.trim().slice(0, 64);
  if (clean.length < 2) return;
  logger.info("patient.symptoms.search.zero_results", { term: clean });
}
