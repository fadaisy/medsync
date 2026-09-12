-- 0053 — hospitals.emergency_phone, and "urgent" stops being something a
--        patient can pick.
--
-- ⚠️ GATED — DO NOT APPLY TO PRODUCTION WITHOUT EXPLICIT, NAMED OWNER
-- AUTHORIZATION. Apply via `npm run db:migrate`.
--
-- ⚠️ SEQUENCING — two halves, and they point in opposite directions.
--
--   §1 (emergency_phone) must land BEFORE the ADR 0084 §3 emergency block
--   reads the column. Applying it early is inert — the column is nullable,
--   ships NULL at every hospital, and nothing selects it yet. Shipping the
--   block first is a missing-column error on a patient's home screen.
--
--   §2 (the patient-reason CHECK) must land WITH OR AFTER the two zod enums
--   that still accept 'urgent_review' on the patient path
--   (app/patient/book/actions.ts, supabase/functions/pt-request-appointment).
--   Applied alone it is still correct — the wizard has never offered the
--   value — but a hand-crafted POST would then fail at the constraint and
--   surface a raw Postgres violation to a patient, instead of a clean 400 at
--   the boundary.
--
-- ADR 0084 §3 and §12.
--
--
-- ─── 1. hospitals.emergency_phone ───────────────────────────────────
--
-- ADR 0084 §3 puts one `tel:` link beside "Go to the hospital's emergency
-- entrance". For the common case — a relative holding a shared phone, at
-- night, 30 km out, with no transport money — the number IS the
-- intervention, and it costs no data to dial. `hospitals` has no phone
-- column; this adds it.
--
-- Nullable, no default, because the block must render the destination alone
-- and NO number until one is verified for that hospital. An invented or
-- guessed number here would be the most dangerous fabricated datum in the
-- product.
--
-- NO BACKFILL FROM hospital_applications.main_phone. Three reasons, in
-- ascending order of how much they settle it:
--
--   * It is self-asserted. main_phone is typed into the public hospital
--     signup form (app/signup/hospital, "Main phone") by a person claiming to
--     represent the facility, validated by a Ugandan E.164 regex and by
--     nothing else. Nobody has ever dialled it. "Verified" in §3 means a
--     human rang it, not that it parsed.
--   * It is the wrong number even when it is a real one. A "main phone" is a
--     switchboard — an administrative line that rings during office hours.
--     §3's block is read at 02:00 by someone whose father will not wake.
--   * At the beachhead there is nothing to copy anyway. Of the three
--     `hospitals` rows today, Mulago National Referral — the one hospital
--     this ADR ships for — has NO hospital_applications row: it was seeded in
--     Phase 0.11, it never applied. The two rows that do have an application
--     are a test tenant and one still in `provisioning`. A backfill would
--     populate zero of the hospitals that matter and two that must not ship a
--     number.
--
-- So the number is entered per hospital during activation, by a superadmin,
-- after someone has dialled it. `hospitals_modify_superadmin` (0002) already
-- makes that the only write path, and 0002's
-- `GRANT SELECT ON public.hospitals TO anon, authenticated` is table-wide —
-- the patient surface reads the new column with no further grant, under the
-- existing `hospitals_select_all` policy.

alter table public.hospitals
  add column if not exists emergency_phone text;

-- The format check lives here rather than in a form because the value's only
-- consumer is an <a href="tel:…"> on the highest-stakes instruction in the
-- product. A number that does not dial is worse than no number, and the
-- placeholder from the ADR's own mock ("0800 XXX XXX") must not be storable.
-- Same Ugandan E.164 shape the four signup actions already enforce
-- (PHONE_E164_UG in app/signup/*/actions.ts), rewritten with [+] and [0-9]
-- instead of \+ and \d so it reads identically in SQL and in the Drizzle
-- mirror without escaping. NULL passes: no number is the ADR's correct
-- default state, not a violation.

alter table public.hospitals
  drop constraint if exists hospitals_emergency_phone_format;

alter table public.hospitals
  add constraint hospitals_emergency_phone_format check (
    emergency_phone is null
    or emergency_phone ~ '^[+]2567[0-9]{8}$|^[+]256[23489][0-9]{7,8}$'
  );


-- ─── 2. 'urgent_review' leaves the patient-selectable reasons ───────
--
-- ADR 0084 §12. A patient-picked "urgent" is not a triage signal
-- (patient–clinician agreement kappa 0.166 / 0.07), yet
-- appointments.reason = 'urgent_review' sits one column away from
-- appointments.origin = 'system_urgent' under a near-identical name. Two
-- values with completely different evidential weight, one
-- `where reason = 'urgent_review'` away from a future worklist or dashboard
-- reading a frightened patient's self-rating as a clinical escalation.
--
-- WHY THE VALUE IS NOT DROPPED FROM appointments_reason_check.
-- system-propose-urgent-appointment writes exactly that reason, with
-- origin='system_urgent', and it is the correct value there. The reason is
-- not the problem. Who gets to pick it is. Narrowing the domain would delete
-- the system escalation path to close a patient-facing hole.
--
-- So the constraint is on the PAIR, and `origin` is the right discriminator
-- precisely because it is not patient-supplied: pt-request-appointment
-- hard-codes `origin: "patient"` and is the only path that creates such a
-- row. Staff-created rows (clinician / nurse / reception) are untouched — a
-- clinician calling a review urgent is a clinical judgement, which is the
-- thing §12 wants to keep legible by removing the impostor standing next to
-- it.
--
-- ADDITIVE, per the immutability rule: appointments_reason_check is not
-- edited, and every existing row keeps its value. Verified 2026-09-12 against
-- the live database — `appointments` holds ZERO 'urgent_review' rows of any
-- origin, so there is nothing to migrate and a validating constraint would
-- have applied cleanly today.
--
-- NOT VALID anyway. This file is GATED: it applies at a moment strictly later
-- than that count, and a migration that can fail on a row someone inserted in
-- between is a worse migration than one that cannot. NOT VALID still enforces
-- on every insert and every update from the moment it lands; it only declines
-- to re-read history — which is exactly what "existing rows keep their value"
-- asks for. Once the owner has confirmed the count is still zero,
--
--   alter table public.appointments
--     validate constraint appointments_patient_reason_check;
--
-- closes it. Leaving it NOT VALID forever is also correct.

alter table public.appointments
  drop constraint if exists appointments_patient_reason_check;

alter table public.appointments
  add constraint appointments_patient_reason_check check (
    origin <> 'patient' or reason <> 'urgent_review'
  ) not valid;

-- This is the backstop, not the message. The zod enums in
-- app/patient/book/actions.ts and
-- supabase/functions/pt-request-appointment/index.ts must drop
-- 'urgent_review' as well — not because the constraint needs help, but so a
-- refusal reads as a sentence at the boundary rather than as a Postgres
-- violation surfaced verbatim from the bottom of the stack.
