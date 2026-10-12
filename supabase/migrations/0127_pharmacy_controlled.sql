-- 0127 — Controlled drugs: the witnessed record beside the statutory paper (Pharmacy Phase 1, CD-1 to CD-8;
-- D-PH1-26 to 28, D-PH1-42; gate-a-proposal §7).
--
-- GATED: owner-applied (`npm run db:migrate`), after 0126. D-PH1-26 and 28 are provisional until legal
-- questions 2 to 4 are answered; nothing here says MedSync's record replaces the register (Law 9).
--
--   1. pharmacy_controlled_entries: one row per controlled action (supply, receipt, count, adjustment,
--      transfer, reversal, correction, batch correction), naming the attested witness (D-PH1-42) and, for a
--      supply, the two paper attestations and the witness's agreement with the balance (CD-2, CD-7). A
--      back-entered supply carries the witness's name as written on the sheet until a holder of
--      `pharmacy.controlled`, with a witness, confirms it against the register (DT-8).
--   2. pharmacy_controlled_differences: a count that did not match the record, with both figures, listed
--      for the pharmacy in charge until closed with a note (CD-3). Only the closing fields ever change.
--
-- ADDITIVE and re-runnable. No client grants.

CREATE TABLE IF NOT EXISTS public.pharmacy_controlled_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  dispensing_point_id uuid NOT NULL REFERENCES public.pharmacy_dispensing_points(department_id) ON DELETE RESTRICT,
  medicine_id text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('supply','receipt','count','adjustment','transfer','reversal','correction',
    'batch_correction','back_entered_supply','back_entry_confirmed')),
  handover_id uuid REFERENCES public.pharmacy_handovers(id) ON DELETE RESTRICT,
  movement_id uuid REFERENCES public.pharmacy_stock_movements(id) ON DELETE RESTRICT,
  count_id uuid REFERENCES public.pharmacy_counts(id) ON DELETE RESTRICT,
  confirms_entry_id uuid REFERENCES public.pharmacy_controlled_entries(id) ON DELETE RESTRICT,
  witness_attestation_id uuid REFERENCES public.pharmacy_attestations(id) ON DELETE RESTRICT,
  witness_name_as_written text CHECK (witness_name_as_written IS NULL OR char_length(witness_name_as_written) BETWEEN 2 AND 120),
  paper_prescription_attested boolean NOT NULL DEFAULT false,
  register_attested boolean NOT NULL DEFAULT false,
  witness_agreed_balance integer,
  actor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  actor_cadre text,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pce_witness CHECK (
    (kind = 'back_entered_supply' AND witness_name_as_written IS NOT NULL AND register_attested)
    OR (kind <> 'back_entered_supply' AND witness_attestation_id IS NOT NULL)),
  CONSTRAINT pce_supply CHECK (kind <> 'supply' OR (handover_id IS NOT NULL AND paper_prescription_attested
    AND register_attested AND witness_agreed_balance IS NOT NULL AND count_id IS NOT NULL)),
  CONSTRAINT pce_confirm CHECK ((kind = 'back_entry_confirmed') = (confirms_entry_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS pce_medicine ON public.pharmacy_controlled_entries (dispensing_point_id, medicine_id, recorded_at);

-- The witness is never the actor (PA2-6): checked against the attestation itself.
CREATE OR REPLACE FUNCTION private.pharmacy_controlled_witness_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE _a public.pharmacy_attestations;
BEGIN
  IF NEW.witness_attestation_id IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO _a FROM public.pharmacy_attestations WHERE id = NEW.witness_attestation_id;
  IF _a.purpose <> 'witness' OR _a.outcome <> 'passed' OR _a.attester_user_id = NEW.actor_user_id
     OR _a.actor_user_id <> NEW.actor_user_id OR _a.hospital_id <> NEW.hospital_id
     OR _a.attested_at < now() - interval '30 minutes' THEN
    RAISE EXCEPTION 'pharmacy_controlled: the witness attestation does not stand for this entry';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS pce_witness_guard ON public.pharmacy_controlled_entries;
CREATE TRIGGER pce_witness_guard BEFORE INSERT ON public.pharmacy_controlled_entries
  FOR EACH ROW EXECUTE FUNCTION private.pharmacy_controlled_witness_guard();

CREATE TABLE IF NOT EXISTS public.pharmacy_controlled_differences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  dispensing_point_id uuid NOT NULL REFERENCES public.pharmacy_dispensing_points(department_id) ON DELETE RESTRICT,
  count_id uuid NOT NULL REFERENCES public.pharmacy_counts(id) ON DELETE RESTRICT,
  batch_id uuid NOT NULL REFERENCES public.pharmacy_batches(id) ON DELETE RESTRICT,
  counted_quantity integer NOT NULL,
  recorded_balance integer NOT NULL,
  supplier_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  witness_attestation_id uuid NOT NULL REFERENCES public.pharmacy_attestations(id) ON DELETE RESTRICT,
  correction_movement_id uuid NOT NULL REFERENCES public.pharmacy_stock_movements(id) ON DELETE RESTRICT,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  closed_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  close_note text CHECK (close_note IS NULL OR char_length(close_note) BETWEEN 3 AND 1000),
  CONSTRAINT pcd_differs CHECK (counted_quantity <> recorded_balance),
  CONSTRAINT pcd_closed CHECK ((closed_at IS NULL) = (closed_by IS NULL) AND (closed_at IS NULL) = (close_note IS NULL))
);
CREATE OR REPLACE FUNCTION private.pharmacy_difference_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' OR OLD.closed_at IS NOT NULL THEN
    RAISE EXCEPTION 'pharmacy_controlled_differences: a closed difference never changes';
  END IF;
  IF (to_jsonb(NEW) - ARRAY['closed_at','closed_by','close_note']) IS DISTINCT FROM
     (to_jsonb(OLD) - ARRAY['closed_at','closed_by','close_note']) THEN
    RAISE EXCEPTION 'pharmacy_controlled_differences: only closing changes a difference';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS pcd_guard ON public.pharmacy_controlled_differences;
CREATE TRIGGER pcd_guard BEFORE UPDATE OR DELETE ON public.pharmacy_controlled_differences
  FOR EACH ROW EXECUTE FUNCTION private.pharmacy_difference_guard();

DROP TRIGGER IF EXISTS pce_append_only ON public.pharmacy_controlled_entries;
CREATE TRIGGER pce_append_only BEFORE UPDATE OR DELETE ON public.pharmacy_controlled_entries
  FOR EACH ROW EXECUTE FUNCTION public.block_modify_append_only();

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['pharmacy_controlled_entries','pharmacy_controlled_differences'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS audit_%1$s ON public.%1$I', t);
    EXECUTE format('CREATE TRIGGER audit_%1$s AFTER INSERT OR UPDATE ON public.%1$I
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
