-- 0126 — Hand-over and supply (Pharmacy Phase 1, SU-1 to SU-14, LB-4 to LB-6; gate-a-proposal §7, §8, §10).
--
-- GATED: owner-applied (`npm run db:migrate`), after 0125.
--
--   1. pharmacy_handovers: who collected, how identity was confirmed (never the typed value), labels,
--      what was explained, payment status as it stood, the point, the client key (SU-10), and, after
--      downtime, the sheet and its true time (DT-3). Append-only.
--   2. pharmacy_supplies: one row per batch supplied (SU-3), with the line version (the prescription row),
--      the product, quantity, issue unit, days covered, price snapshot, strengths, the pharmacist's line,
--      and the supplying point and organisation (SU-9, E-PH1-04). Append-only.
--      Law 3 in the database: at COMMIT, every supply has exactly one `supplied` movement whose source is
--      that supply, and every `supplied` movement has its supply (a deferred constraint trigger on both
--      tables). A transaction that leaves either alone does not commit.
--   3. Reversals, "recorded in error" corrections, the look-back list, identity attempts, print events,
--      slips with their verification code, and the "in stock today" notices. All append-only.
--
-- ADDITIVE and re-runnable. No client grants.

CREATE TABLE IF NOT EXISTS public.pharmacy_handovers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  dispensing_point_id uuid NOT NULL REFERENCES public.pharmacy_dispensing_points(department_id) ON DELETE RESTRICT,
  patient_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  collector text NOT NULL CHECK (collector IN ('patient','representative','ward_staff')),
  collector_name text CHECK (collector_name IS NULL OR char_length(collector_name) BETWEEN 2 AND 120),
  collector_relationship text CHECK (collector_relationship IS NULL OR char_length(collector_relationship) BETWEEN 2 AND 80),
  collector_user_id uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  identity_route text NOT NULL CHECK (identity_route IN ('two_identifiers','identified_another_way','ward_staff','downtime_sheet')),
  second_identifier text CHECK (second_identifier IS NULL OR second_identifier IN ('date_of_birth','phone')),
  identified_how text CHECK (identified_how IS NULL OR char_length(identified_how) BETWEEN 2 AND 60),
  identified_note text CHECK (identified_note IS NULL OR char_length(identified_note) <= 500),
  sheet_identity text CHECK (sheet_identity IS NULL OR sheet_identity IN ('checked','not_checked','not_recorded')),
  label_mode text NOT NULL CHECK (label_mode IN ('printed','by_hand','none')),
  labels_written_attested boolean NOT NULL DEFAULT false,
  counselling text[] NOT NULL DEFAULT '{}',
  language text CHECK (language IS NULL OR char_length(language) BETWEEN 2 AND 40),
  payment_status text NOT NULL DEFAULT 'not_recorded'
    CHECK (payment_status IN ('paid','exempt','insured','emergency','not_recorded')),
  payment_detail text CHECK (payment_detail IS NULL OR char_length(payment_detail) <= 200),
  actor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  actor_cadre text,
  client_key text NOT NULL UNIQUE CHECK (char_length(client_key) BETWEEN 8 AND 120),
  entered_after_downtime boolean NOT NULL DEFAULT false,
  sheet_number integer,
  sheet_row integer CHECK (sheet_row IS NULL OR sheet_row > 0),
  supplied_at timestamptz NOT NULL DEFAULT now(),
  entered_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ph_collector CHECK (
    (collector = 'patient')
    OR (collector = 'representative' AND collector_name IS NOT NULL AND collector_relationship IS NOT NULL)
    OR (collector = 'ward_staff' AND collector_user_id IS NOT NULL)),
  CONSTRAINT ph_identity CHECK (
    (identity_route = 'two_identifiers' AND second_identifier IS NOT NULL AND NOT entered_after_downtime)
    OR (identity_route = 'identified_another_way' AND identified_how IS NOT NULL AND NOT entered_after_downtime)
    OR (identity_route = 'ward_staff' AND collector = 'ward_staff')
    OR (identity_route = 'downtime_sheet' AND entered_after_downtime AND sheet_identity IS NOT NULL)),
  CONSTRAINT ph_downtime CHECK (entered_after_downtime = (sheet_number IS NOT NULL AND sheet_row IS NOT NULL)),
  CONSTRAINT ph_by_hand CHECK (label_mode <> 'by_hand' OR labels_written_attested OR entered_after_downtime),
  CONSTRAINT ph_times CHECK (supplied_at <= entered_at + interval '5 minutes')
);
CREATE INDEX IF NOT EXISTS ph_point_day ON public.pharmacy_handovers (dispensing_point_id, supplied_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS ph_sheet_row_once ON public.pharmacy_handovers (hospital_id, sheet_number, sheet_row)
  WHERE entered_after_downtime;

CREATE TABLE IF NOT EXISTS public.pharmacy_supplies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  handover_id uuid NOT NULL REFERENCES public.pharmacy_handovers(id) ON DELETE RESTRICT,
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  dispensing_point_id uuid NOT NULL REFERENCES public.pharmacy_dispensing_points(department_id) ON DELETE RESTRICT,
  supplying_hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  patient_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  prescription_id uuid REFERENCES public.prescriptions(id) ON DELETE RESTRICT,
  paper_prescription_line_id uuid,
  product_id uuid NOT NULL REFERENCES public.pharmacy_products(id) ON DELETE RESTRICT,
  batch_id uuid NOT NULL REFERENCES public.pharmacy_batches(id) ON DELETE RESTRICT,
  quantity integer NOT NULL CHECK (quantity > 0),
  issue_unit text NOT NULL,
  days_covered integer CHECK (days_covered IS NULL OR days_covered > 0),
  price_ugx numeric(14,2) CHECK (price_ugx IS NULL OR price_ugx >= 0),
  prescribed_strength text,
  supplied_strength text,
  substitution_reason text CHECK (substitution_reason IS NULL OR char_length(substitution_reason) BETWEEN 2 AND 60),
  pharmacist_line text CHECK (pharmacist_line IS NULL OR char_length(pharmacist_line) BETWEEN 2 AND 80),
  pharmacist_line_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  review_event_id uuid REFERENCES public.pharmacy_line_events(id) ON DELETE RESTRICT,
  batch_choice_reason text CHECK (batch_choice_reason IS NULL OR char_length(batch_choice_reason) BETWEEN 2 AND 60),
  supplied_at timestamptz NOT NULL,
  entered_after_downtime boolean NOT NULL DEFAULT false,
  CONSTRAINT ps_line CHECK ((prescription_id IS NULL) <> (paper_prescription_line_id IS NULL)),
  CONSTRAINT ps_pharmacist_line CHECK ((pharmacist_line IS NULL) = (pharmacist_line_by IS NULL)
    AND (pharmacist_line IS NULL OR substitution_reason IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS ps_line ON public.pharmacy_supplies (prescription_id);
CREATE INDEX IF NOT EXISTS ps_handover ON public.pharmacy_supplies (handover_id);
CREATE INDEX IF NOT EXISTS ps_patient ON public.pharmacy_supplies (patient_user_id, supplied_at DESC);

ALTER TABLE public.pharmacy_line_events DROP CONSTRAINT IF EXISTS ple_handover_fk;
ALTER TABLE public.pharmacy_line_events
  ADD CONSTRAINT ple_handover_fk FOREIGN KEY (handover_id) REFERENCES public.pharmacy_handovers(id) ON DELETE RESTRICT;

-- Law 3 at COMMIT: a supply and its movement exist together, one to one.
CREATE OR REPLACE FUNCTION private.pharmacy_supply_movement_pair() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE _supply uuid; _n integer;
BEGIN
  IF TG_TABLE_NAME = 'pharmacy_supplies' THEN
    _supply := NEW.id;
  ELSIF NEW.kind = 'supplied' THEN
    IF NEW.source_kind <> 'supply' OR NEW.source_id IS NULL
       OR NOT EXISTS (SELECT 1 FROM public.pharmacy_supplies s WHERE s.id = NEW.source_id) THEN
      RAISE EXCEPTION 'pharmacy: a supplied movement without its supply (Law 3)';
    END IF;
    _supply := NEW.source_id;
  ELSE
    RETURN NULL;
  END IF;
  SELECT count(*) INTO _n FROM public.pharmacy_stock_movements m
   WHERE m.kind = 'supplied' AND m.source_kind = 'supply' AND m.source_id = _supply;
  IF _n <> 1 THEN
    RAISE EXCEPTION 'pharmacy: supply % has % supplied movements; exactly one is required (Law 3)', _supply, _n;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.pharmacy_supplies s JOIN public.pharmacy_stock_movements m
                   ON m.source_id = s.id AND m.kind = 'supplied'
                  WHERE s.id = _supply AND m.batch_id = s.batch_id AND m.quantity = -s.quantity
                    AND m.dispensing_point_id = s.dispensing_point_id) THEN
    RAISE EXCEPTION 'pharmacy: supply % and its movement disagree on batch, point or quantity', _supply;
  END IF;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS ps_pair ON public.pharmacy_supplies;
CREATE CONSTRAINT TRIGGER ps_pair AFTER INSERT ON public.pharmacy_supplies
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION private.pharmacy_supply_movement_pair();
DROP TRIGGER IF EXISTS psm_pair ON public.pharmacy_stock_movements;
CREATE CONSTRAINT TRIGGER psm_pair AFTER INSERT ON public.pharmacy_stock_movements
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION private.pharmacy_supply_movement_pair();

CREATE TABLE IF NOT EXISTS public.pharmacy_supply_reversals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supply_id uuid NOT NULL UNIQUE REFERENCES public.pharmacy_supplies(id) ON DELETE RESTRICT,
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  dispensing_point_id uuid NOT NULL REFERENCES public.pharmacy_dispensing_points(department_id) ON DELETE RESTRICT,
  reason_code text NOT NULL CHECK (char_length(reason_code) BETWEEN 2 AND 60),
  pack_fit boolean NOT NULL,
  returned_movement_id uuid NOT NULL REFERENCES public.pharmacy_stock_movements(id) ON DELETE RESTRICT,
  writeoff_movement_id uuid REFERENCES public.pharmacy_stock_movements(id) ON DELETE RESTRICT,
  witness_attestation_id uuid REFERENCES public.pharmacy_attestations(id) ON DELETE RESTRICT,
  actor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  actor_cadre text,
  reversed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT psr_fit CHECK (pack_fit = (writeoff_movement_id IS NULL))
);

CREATE TABLE IF NOT EXISTS public.pharmacy_supply_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supply_id uuid NOT NULL UNIQUE REFERENCES public.pharmacy_supplies(id) ON DELETE RESTRICT,
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  reason_code text NOT NULL CHECK (char_length(reason_code) BETWEEN 2 AND 60),
  note text CHECK (note IS NULL OR char_length(note) <= 1000),
  actor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  corrected_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pharmacy_look_backs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  supply_id uuid NOT NULL REFERENCES public.pharmacy_supplies(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('flagged','looked')),
  reasons text[] NOT NULL DEFAULT '{}',
  note text CHECK (note IS NULL OR char_length(note) <= 1000),
  actor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT plb_flag CHECK (kind <> 'flagged' OR cardinality(reasons) > 0)
);
CREATE INDEX IF NOT EXISTS plb_supply ON public.pharmacy_look_backs (supply_id);

CREATE TABLE IF NOT EXISTS public.pharmacy_identity_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  patient_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  handover_key text NOT NULL CHECK (char_length(handover_key) BETWEEN 8 AND 120),
  identifier text NOT NULL CHECK (identifier IN ('date_of_birth','phone')),
  outcome text NOT NULL CHECK (outcome IN ('match','mismatch','closed','reopened')),
  actor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  attempted_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pia_patient_day ON public.pharmacy_identity_attempts (patient_user_id, attempted_at DESC);

CREATE TABLE IF NOT EXISTS public.pharmacy_print_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  dispensing_point_id uuid REFERENCES public.pharmacy_dispensing_points(department_id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('label','label_reprint','slip','register_entry','dispensing_log','downtime_sheets')),
  ref_id uuid,
  copies integer NOT NULL DEFAULT 1 CHECK (copies > 0),
  outcome text NOT NULL DEFAULT 'printed' CHECK (outcome IN ('printed','cancelled','switched_to_hand')),
  actor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  printed_at timestamptz NOT NULL DEFAULT now()
);

-- LB-6: at least 8 characters from an alphabet with no 0/O, 1/I/L.
CREATE TABLE IF NOT EXISTS public.pharmacy_slips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  dispensing_point_id uuid NOT NULL REFERENCES public.pharmacy_dispensing_points(department_id) ON DELETE RESTRICT,
  code text NOT NULL UNIQUE CHECK (code ~ '^[A-HJKMNP-Z2-9]{8,12}$'),
  patient_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  prescription_ids uuid[] NOT NULL CHECK (cardinality(prescription_ids) > 0),
  copy_count integer NOT NULL DEFAULT 1 CHECK (copy_count > 0),
  printed_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  printed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pharmacy_patient_notices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  dispensing_point_id uuid NOT NULL REFERENCES public.pharmacy_dispensing_points(department_id) ON DELETE RESTRICT,
  prescription_id uuid NOT NULL REFERENCES public.prescriptions(id) ON DELETE RESTRICT,
  patient_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('in_stock')),
  channel text NOT NULL CHECK (channel IN ('sms','in_app')),
  outcome text NOT NULL CHECK (outcome IN ('sent','failed','not_sent')),
  sent_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  sent_at timestamptz NOT NULL DEFAULT now()
);

-- ─── Append-only, grants, RLS, audit ────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['pharmacy_handovers','pharmacy_supplies','pharmacy_supply_reversals',
    'pharmacy_supply_corrections','pharmacy_look_backs','pharmacy_identity_attempts','pharmacy_print_events',
    'pharmacy_slips','pharmacy_patient_notices'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %1$s_append_only ON public.%1$I', t);
    EXECUTE format('CREATE TRIGGER %1$s_append_only BEFORE UPDATE OR DELETE ON public.%1$I
      FOR EACH ROW EXECUTE FUNCTION public.block_modify_append_only()', t);
    EXECUTE format('DROP TRIGGER IF EXISTS audit_%1$s ON public.%1$I', t);
    EXECUTE format('CREATE TRIGGER audit_%1$s AFTER INSERT ON public.%1$I
      FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes()', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO medsync_clinical_reader', t);
    EXECUTE format('DROP POLICY IF EXISTS %1$s_select ON public.%1$I', t);
    EXECUTE format('CREATE POLICY %1$s_select ON public.%1$I FOR SELECT TO medsync_clinical_reader
      USING (hospital_id = (SELECT private.current_hospital_id()) AND (SELECT private.pharmacy_can(''pharmacy.view'')))', t);
  END LOOP;
END $$;

-- The prescriber sees what was supplied for their patients (RQ-11, SU-11, SU-14), never a stock figure.
DROP POLICY IF EXISTS pharmacy_supplies_prescriber_select ON public.pharmacy_supplies;
CREATE POLICY pharmacy_supplies_prescriber_select ON public.pharmacy_supplies FOR SELECT TO medsync_clinical_reader
  USING (hospital_id = (SELECT private.current_hospital_id()) AND (SELECT private.may_prescribe_here())
         AND patient_user_id IN (SELECT private.accessible_patient_ids()));
