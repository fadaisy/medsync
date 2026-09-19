/**
 * Why a booking ended, as the person who held it is told (Gate H ruling,
 * ADR 0094: staff cancel reasons are STAFF ONLY).
 *
 * ZERO imports, like `slots.ts` and `fees.ts`: the Next app takes it as
 * `@/supabase/functions/_shared/cancel-reasons`, a Deno Edge Function as
 * `./cancel-reasons.ts`, and the Expo app as `@shared/cancel-reasons`.
 *
 * `appointments.cancelled_reason` carries a closed CODE, never words. A
 * patient reads their rows straight through RLS (the phone uses supabase-js)
 * and a booking agent reads the rows they created, so hiding text in a UI is
 * not hiding it: whatever staff typed must not sit in the column at all. The
 * free text lives in the `sa_audit_log` row every cancel writer records
 * first, which staff surfaces read. Every patient and agent surface turns the
 * code into ONE of the sentences below and never prints the column itself —
 * `tests/booking/gate-h-rulings.test.ts` greps for that.
 *
 * A value not in the map — a row that predates the ruling (migration 0064
 * rewrites those), or a writer this file does not know — gets the plain
 * sentence rather than its own words.
 */

/** The codes a writer may put in `appointments.cancelled_reason`. */
export const CANCEL_CODES = [
  /** ha-cancel-session: the clinic cancelled the whole day (Gate E; the card offers a rebooking). */
  "session_cancelled",
  /** cancel-appointment (the patient, their own visit) and the USSD/SMS cancel. */
  "patient_cancelled",
  /** cancel-appointment by staff — clinician, hospital_admin, superadmin. */
  "staff_cancelled",
  /** The dispatcher's unconfirmed-release path (Gate E, off by default). */
  "unconfirmed_release",
  /** reschedule-appointment: the old row of a move. */
  "rescheduled",
] as const;

export type CancelCode = (typeof CANCEL_CODES)[number];

const SENTENCES: Record<CancelCode, string> = {
  session_cancelled: "This clinic day was cancelled.",
  patient_cancelled: "Cancelled at the patient's request.",
  staff_cancelled: "Cancelled by the clinic.",
  unconfirmed_release: "Released because the visit was not confirmed in time.",
  rescheduled: "Moved to another day.",
};

const FALLBACK = "This visit was cancelled.";
/** `status = 'declined'` is its own closed code; `declined_reason` is no longer written. */
const DECLINED = "The clinic could not take this request.";

/**
 * The one sentence a patient or booking agent reads for a visit that will
 * not happen, or null for a visit that still might. `code` is the raw
 * column; it is looked up, never echoed.
 */
export function cancellationSentence(status: string, code: string | null): string | null {
  if (status === "declined") return DECLINED;
  if (status === "rescheduled") return SENTENCES.rescheduled;
  if (status !== "cancelled") return null;
  return (CANCEL_CODES as readonly string[]).includes(code ?? "")
    ? SENTENCES[code as CancelCode]
    : FALLBACK;
}
