/**
 * Session-mode SQL and vocabulary — migration 0058, ADR 0087.
 *
 * ZERO imports, like `slots.ts`, so the Next app (`@/supabase/functions/
 * _shared/sessions-sql`) and a Deno Edge Function (`./sessions-sql.ts`) read
 * the same strings. A test asserts the allocator's two load-bearing clauses
 * so nobody can quietly turn it back into a check-then-write.
 */

/**
 * Appendix A's 13 patient-selectable reason codes (ruling C5). This is the
 * whole list a patient, a desk or `service_lines.reason_codes` may use —
 * 'urgent_review' is system-only (0053) and 'other' is the shipped catch-all;
 * neither is an Appendix A reason.
 */
export const PATIENT_REASON_CODES = [
  "follow_up",
  "post_discharge",
  "new_concern",
  "refill",
  "test_results",
  "antenatal",
  "immunisation",
  "child_wellness",
  "specialist_review",
  "routine",
  "procedure",
  "counselling",
  "second_opinion",
] as const;
export type PatientReasonCode = (typeof PATIENT_REASON_CODES)[number];

/**
 * The atomic allocator (proposal §5.3). ONE statement; no SELECT first.
 *
 *   $1 = clinic_sessions.id
 *
 * Zero rows back means the session is full, unpublished, or gone — the
 * caller answers 409 and offers `NEXT_SESSIONS_OF_LINE_SQL`. The table CHECK
 * `clinic_sessions_booked_count_range` is the belt; this WHERE is the braces.
 * A cancellation runs `booked_count = booked_count - 1` only: `next_position`
 * is monotonic, so a position number is never re-issued (PRD §4.4).
 */
export const ALLOCATE_SESSION_POSITION_SQL = `
UPDATE public.clinic_sessions
   SET booked_count = booked_count + 1,
       next_position = next_position + 1
 WHERE id = $1
   AND status = 'published'
   AND booked_count < ceil(capacity_booked * overbooking_factor)
RETURNING next_position, starts_at, ends_at, capacity_booked, overbooking_factor
`.trim();

/**
 * The two published sessions of the same service line after the one that
 * was full — what a 409 from the allocator carries in `details`.
 *
 *   $1 = clinic_sessions.id (the full one)
 */
export const NEXT_SESSIONS_OF_LINE_SQL = `
SELECT id, starts_at, ends_at, clinician_user_id, venue,
       capacity_booked, booked_count, overbooking_factor
  FROM public.clinic_sessions
 WHERE service_line_id = (SELECT service_line_id FROM public.clinic_sessions WHERE id = $1)
   AND id <> $1
   AND status = 'published'
   AND starts_at > now()
   AND booked_count < ceil(capacity_booked * overbooking_factor)
 ORDER BY starts_at
 LIMIT 2
`.trim();
