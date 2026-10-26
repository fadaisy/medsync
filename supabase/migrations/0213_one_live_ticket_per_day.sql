-- 0213 — One live queue ticket per patient per hospital day, held by the database (ADR 0101 review, 26 Oct 2026).
--
-- GATED: owner-applied (`npm run db:migrate`), after 0212. ADDITIVE: one partial unique index, no data rewrite.
--
-- ha-register-intake and pt-declare-intake each read "does this patient already have a live ticket today?" and
-- then insert, with no lock between, so a desk registration racing the patient's own "coming today" left two live
-- tickets and two queue rows. This index makes the second insert fail (23505); both functions answer it with the
-- same 409 their read already gives.
--
-- What it never blocks, on purpose:
--   * anything urgent (priority_hint 'urgent'): every emergency entry type defaults to urgent, a pre-alert link sets
--     it, and an E-tier ticket carries it. An emergency is captured first and reconciled after.
--   * a booked arrival (entry_type_code 'booked_arrival'): check-in of a booking is keyed on the booking itself.
--   * rows before 2026-11-01, so existing days (where stale live statuses may overlap) never fail the build.
-- A ticket leaves the index when it is closed, so a patient can come back later the same day.

CREATE UNIQUE INDEX IF NOT EXISTS patient_intakes_one_live_per_day
  ON public.patient_intakes (
    hospital_id,
    patient_user_id,
    ((arrived_at AT TIME ZONE 'Africa/Kampala')::date)
  )
  WHERE patient_user_id IS NOT NULL
    AND status IN ('declared', 'arrived', 'awaiting_triage', 'triaged')
    AND priority_hint <> 'urgent'
    AND entry_type_code <> 'booked_arrival'
    AND arrived_at >= TIMESTAMPTZ '2026-11-01 00:00:00+03';
