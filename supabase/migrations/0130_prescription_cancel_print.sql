-- 0130 — The prescriber's cancel and the print record (Pharmacy Phase 1; D-PH1-41, D-PH1-49; gate-a-proposal §1
-- W3, H4; §8).
--
-- GATED: owner-applied (`npm run db:migrate`), after 0129.
--
--   1. prescription_cancellations: `cancelPrescriptionLine` moves a line from `active` to `cancelled`, as the
--      co-sign withdrawal already does (audit_prescriptions records the state change), and writes one row
--      here with the coded reason and, when the line was changed rather than stopped, the line that replaces
--      it. No column is added to `prescriptions`. Append-only, one per line.
--   2. prescription_print_events: the doctor's prescription print page records each line it printed, so
--      "changed since printing" can be worked out. The paper itself does not change. Append-only.
--
-- ADDITIVE and re-runnable. No client grants: both are written by server actions and read under RLS by
-- clinicians who may see the patient, and by pharmacy staff of the hospital.

CREATE TABLE IF NOT EXISTS public.prescription_cancellations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prescription_id uuid NOT NULL UNIQUE REFERENCES public.prescriptions(id) ON DELETE RESTRICT,
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  patient_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  reason_code text NOT NULL CHECK (char_length(reason_code) BETWEEN 2 AND 60),
  note text CHECK (note IS NULL OR char_length(note) <= 1000),
  replaced_by_prescription_id uuid REFERENCES public.prescriptions(id) ON DELETE RESTRICT,
  query_id uuid REFERENCES public.pharmacy_queries(id) ON DELETE RESTRICT,
  actor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  actor_cadre text,
  cancelled_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pc_not_self CHECK (replaced_by_prescription_id IS NULL OR replaced_by_prescription_id <> prescription_id)
);
CREATE INDEX IF NOT EXISTS pc_replaced_by ON public.prescription_cancellations (replaced_by_prescription_id);

CREATE TABLE IF NOT EXISTS public.prescription_print_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prescription_id uuid NOT NULL REFERENCES public.prescriptions(id) ON DELETE RESTRICT,
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  patient_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  printed_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  printed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ppe_line ON public.prescription_print_events (prescription_id, printed_at DESC);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['prescription_cancellations','prescription_print_events'] LOOP
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
      USING (hospital_id = (SELECT private.current_hospital_id())
             AND ((SELECT private.pharmacy_can(''pharmacy.view''))
                  OR patient_user_id IN (SELECT private.accessible_patient_ids())))', t);
  END LOOP;
END $$;
