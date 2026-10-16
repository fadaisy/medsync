-- 0134 — The patient's medicine list from supplies, the pharmacy's message templates, and a paper "not supplied"
-- row entered once (Pharmacy Phase 1, Step 9; 5.11, ML-1, ML-6, MS-1 to MS-5, D-PH1-48, W7, DT-2).
--
-- GATED: owner-applied (`npm run db:migrate`), after 0133.
--
-- 1. self_medications.source_supply_id: the supply a list entry came from (ML-1). One entry per supplied LINE
--    (W7): the row keeps `source_prescription_id` = the line (0091's one-per-prescription index), and this column
--    holds the line's FIRST standing supply, so a later supply of the rest changes nothing in the patient's row.
--    A reversal or a correction of the record withdraws the entry through the existing state (`ended`, with
--    `ended_on`), the row's own field for "no longer taking" (ML-6); a supply of the line again restores it.
-- 2. ncd_sms_template, generalised once (D-PH1-48): a `workspace` column ('ncd' by default, so every NCD row and
--    query is unchanged) and the three pharmacy purposes, each only under workspace 'pharmacy'. The two-approver
--    CHECK stands as 0093 wrote it. The banned-term scan runs on every pharmacy template the app reads (MS-2).
-- 3. pharmacy_patient_notices: the owed and buying-outside messages join "in stock" (5.11), each with why it was
--    not sent (Law 11) and the line event it answers; one notice per event and channel (MS-3).
-- 4. paper_prescriptions.sheet_row: a downtime "not supplied" paper row is entered once (DT-2), as a supply row
--    already is through pharmacy_handovers (hospital, sheet, row).
-- ADDITIVE and re-runnable. No client grants.

-- ─── 1. the list entry's source ──────────────────────────────────────
ALTER TABLE public.self_medications ADD COLUMN IF NOT EXISTS source_supply_id uuid
  REFERENCES public.pharmacy_supplies(id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX IF NOT EXISTS self_medications_one_per_supply
  ON public.self_medications (patient_user_id, source_supply_id) WHERE source_supply_id IS NOT NULL;

-- The patient's own page reads their line events (ML-2).
CREATE INDEX IF NOT EXISTS ple_patient ON public.pharmacy_line_events (patient_user_id, hospital_id);

-- ─── 2. the template store, generalised ──────────────────────────────
ALTER TABLE public.ncd_sms_template ADD COLUMN IF NOT EXISTS workspace text NOT NULL DEFAULT 'ncd';
ALTER TABLE public.ncd_sms_template DROP CONSTRAINT IF EXISTS ncd_sms_template_purpose_check;
ALTER TABLE public.ncd_sms_template ADD CONSTRAINT ncd_sms_template_purpose_check CHECK (
  (workspace = 'ncd' AND purpose IN ('appointment_reminder','missed_visit'))
  OR (workspace = 'pharmacy' AND purpose IN ('pharmacy_owed','pharmacy_buying_outside','pharmacy_in_stock')));
CREATE INDEX IF NOT EXISTS ncd_sms_template_workspace_idx
  ON public.ncd_sms_template (facility_id, workspace, purpose, status);

-- ─── 3. the notices ──────────────────────────────────────────────────
ALTER TABLE public.pharmacy_patient_notices
  ADD COLUMN IF NOT EXISTS reason text CHECK (reason IS NULL OR char_length(reason) BETWEEN 2 AND 60),
  ADD COLUMN IF NOT EXISTS line_event_id uuid REFERENCES public.pharmacy_line_events(id) ON DELETE RESTRICT;
ALTER TABLE public.pharmacy_patient_notices DROP CONSTRAINT IF EXISTS pharmacy_patient_notices_kind_check;
ALTER TABLE public.pharmacy_patient_notices ADD CONSTRAINT pharmacy_patient_notices_kind_check
  CHECK (kind IN ('in_stock','owed','buying_outside'));
ALTER TABLE public.pharmacy_patient_notices DROP CONSTRAINT IF EXISTS ppn_reason;
ALTER TABLE public.pharmacy_patient_notices ADD CONSTRAINT ppn_reason
  CHECK (outcome <> 'sent' OR reason IS NULL);
CREATE UNIQUE INDEX IF NOT EXISTS ppn_one_per_event
  ON public.pharmacy_patient_notices (line_event_id, channel) WHERE line_event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ppn_line ON public.pharmacy_patient_notices (prescription_id, sent_at DESC);

-- ─── 4. a paper "not supplied" row, once ─────────────────────────────
ALTER TABLE public.paper_prescriptions ADD COLUMN IF NOT EXISTS sheet_row integer
  CHECK (sheet_row IS NULL OR sheet_row > 0);
CREATE UNIQUE INDEX IF NOT EXISTS paper_prescriptions_one_per_row
  ON public.paper_prescriptions (hospital_id, sheet_number, sheet_row) WHERE sheet_row IS NOT NULL;
