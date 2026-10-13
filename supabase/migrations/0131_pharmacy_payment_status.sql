-- 0131 — Payment status before the hand-over (Pharmacy Phase 1, SU-12, D-PH1-20; 5.3 head, 5.6 section 4).
--
-- GATED: owner-applied (`npm run db:migrate`), after 0130.
--
-- The review screen may record a prescription's payment status before the hand-over, so the queue can show
-- it (5.2). Each setting is an append-only row; the status in force is the latest for the prescription
-- (its placement). The hand-over copies the status as it then stood onto pharmacy_handovers (SU-12).
-- MedSync checks no payment. ADDITIVE and re-runnable. No client grants.

CREATE TABLE IF NOT EXISTS public.pharmacy_payment_statuses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  patient_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  -- Any line of the prescription; the placement groups them (0099).
  prescription_id uuid NOT NULL REFERENCES public.prescriptions(id) ON DELETE RESTRICT,
  placement_id uuid,
  status text NOT NULL CHECK (status IN ('paid','exempt','insured','emergency','not_recorded')),
  detail text CHECK (detail IS NULL OR char_length(detail) <= 200),
  dispensing_point_id uuid NOT NULL REFERENCES public.pharmacy_dispensing_points(department_id) ON DELETE RESTRICT,
  actor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pps_exempt_reason CHECK (status <> 'exempt' OR detail IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS pps_prescription ON public.pharmacy_payment_statuses (prescription_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS pps_placement ON public.pharmacy_payment_statuses (placement_id, recorded_at DESC);

DROP TRIGGER IF EXISTS pharmacy_payment_statuses_append_only ON public.pharmacy_payment_statuses;
CREATE TRIGGER pharmacy_payment_statuses_append_only BEFORE UPDATE OR DELETE ON public.pharmacy_payment_statuses
  FOR EACH ROW EXECUTE FUNCTION public.block_modify_append_only();
DROP TRIGGER IF EXISTS audit_pharmacy_payment_statuses ON public.pharmacy_payment_statuses;
CREATE TRIGGER audit_pharmacy_payment_statuses AFTER INSERT ON public.pharmacy_payment_statuses
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes();
ALTER TABLE public.pharmacy_payment_statuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pharmacy_payment_statuses FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.pharmacy_payment_statuses FROM anon, authenticated;
GRANT SELECT ON public.pharmacy_payment_statuses TO medsync_clinical_reader;
DROP POLICY IF EXISTS pharmacy_payment_statuses_select ON public.pharmacy_payment_statuses;
CREATE POLICY pharmacy_payment_statuses_select ON public.pharmacy_payment_statuses FOR SELECT TO medsync_clinical_reader
  USING (hospital_id = (SELECT private.current_hospital_id()) AND (SELECT private.pharmacy_can('pharmacy.view')));
