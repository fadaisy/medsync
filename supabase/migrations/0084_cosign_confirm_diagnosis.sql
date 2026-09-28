-- 0084 — Co-signature of a junior's final diagnosis: the confirm_diagnosis action kind.
--
-- Per docs/emr/clerking-v2/summary-impression/gate-a-proposal.md §3 (GATE A signed 2026-09-28:
-- D-SI-09, D-SI-23). A clinician without a final-diagnosis authority (an intern) who chooses Final
-- stores Working and opens a clinical_cosign_requests row of this kind; a senior approves (the
-- diagnosis becomes Final in the same transaction) or returns it (it stays Working).
--
-- ADDITIVE. No new table or column; no existing row changes:
--   1. cosign_action_kind_check: DROP-then-ADD with 0071's ten kinds verbatim plus confirm_diagnosis.
--      The condition is named in action_payload ({conditionLogicalId, encounterId}, PHI-free).
--      cosign_note_link (0071) already requires note_id to be null for every kind but sign_note.
-- The Drizzle copy (db/schema/doctor-workspace.ts) carries the same list; tests/emr-db/drizzle-parity
-- fails while they differ. Every request row stays audited by 0030's audit_clinical_cosign_requests.
--
-- Re-runnable: DROP CONSTRAINT IF EXISTS, then the one ADD.
--
-- GATED: owner-applied (`npm run db:migrate`), after 0071. Until it runs, an intern's Final is
-- refused at the insert (the check), so the Summary and Impression step must stay off
-- (CLERKING_V2) where it has not run.


-- ─── 1. The action kinds ──────────────────────────────────────────────
ALTER TABLE public.clinical_cosign_requests DROP CONSTRAINT IF EXISTS cosign_action_kind_check;
ALTER TABLE public.clinical_cosign_requests ADD CONSTRAINT cosign_action_kind_check CHECK (action_kind IN (
  'prescription_routine','prescription_controlled','order_high_cost_imaging','admit_patient','discharge_patient',
  'high_alert_med_administration','independent_complex_procedure','triage_patient','triage_downgrade',  -- 0036, kept
  'sign_note',                                                                                           -- 0071, kept
  'confirm_diagnosis'));                                                                                 -- new
