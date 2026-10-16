-- 0132 — Not-supplied notice acknowledgements (Pharmacy Phase 1, RQ-11; 5.4).
--
-- GATED: owner-applied (`npm run db:migrate`), after 0131.
--
-- A not-supplied notice (the pharmacy's `owed`, `buying_outside` or `declined` on a line) needs no answer;
-- the prescriber may "Leave it as it is" or "Choose an alternative". 0125 kept the acknowledgement as a
-- `not_supplied_acknowledged` query event, so with no query covering the line it could not be recorded and
-- the notice could not be dismissed. Here it has its own row, one per line event (UNIQUE), always available.
-- The kind stays allowed on pharmacy_query_events (shipped); nothing writes it any more.
-- ADDITIVE and re-runnable. No client grants.

CREATE TABLE IF NOT EXISTS public.pharmacy_notice_acknowledgements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  patient_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  line_event_id uuid NOT NULL UNIQUE REFERENCES public.pharmacy_line_events(id) ON DELETE RESTRICT,
  choice text NOT NULL CHECK (choice IN ('left_as_is','alternative_chosen')),
  replaced_by_prescription_id uuid REFERENCES public.prescriptions(id) ON DELETE RESTRICT,
  actor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  acknowledged_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pna_patient ON public.pharmacy_notice_acknowledgements (hospital_id, patient_user_id);

DROP TRIGGER IF EXISTS pharmacy_notice_acknowledgements_append_only ON public.pharmacy_notice_acknowledgements;
CREATE TRIGGER pharmacy_notice_acknowledgements_append_only BEFORE UPDATE OR DELETE ON public.pharmacy_notice_acknowledgements
  FOR EACH ROW EXECUTE FUNCTION public.block_modify_append_only();
DROP TRIGGER IF EXISTS audit_pharmacy_notice_acknowledgements ON public.pharmacy_notice_acknowledgements;
CREATE TRIGGER audit_pharmacy_notice_acknowledgements AFTER INSERT ON public.pharmacy_notice_acknowledgements
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes();
ALTER TABLE public.pharmacy_notice_acknowledgements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pharmacy_notice_acknowledgements FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.pharmacy_notice_acknowledgements FROM anon, authenticated;
GRANT SELECT ON public.pharmacy_notice_acknowledgements TO medsync_clinical_reader;
DROP POLICY IF EXISTS pharmacy_notice_acknowledgements_select ON public.pharmacy_notice_acknowledgements;
CREATE POLICY pharmacy_notice_acknowledgements_select ON public.pharmacy_notice_acknowledgements FOR SELECT TO medsync_clinical_reader
  USING (hospital_id = (SELECT private.current_hospital_id()) AND (SELECT private.pharmacy_can('pharmacy.view')));
-- The prescriber's side (0125's shape): may prescribe here, for a patient they may see.
DROP POLICY IF EXISTS pharmacy_notice_acknowledgements_prescriber_select ON public.pharmacy_notice_acknowledgements;
CREATE POLICY pharmacy_notice_acknowledgements_prescriber_select ON public.pharmacy_notice_acknowledgements FOR SELECT TO medsync_clinical_reader
  USING (hospital_id = (SELECT private.current_hospital_id()) AND (SELECT private.may_prescribe_here())
         AND patient_user_id IN (SELECT private.accessible_patient_ids()));
