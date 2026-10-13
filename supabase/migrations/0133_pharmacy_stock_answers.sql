-- 0133 — The prescriber's stock answer (Pharmacy Phase 1, Step 9; 5.10, AV-8, D-PH1-44, H8) and the time on
-- the nurse's chip (D-PH1-33).
--
-- GATED: owner-applied (`npm run db:migrate`), after 0132.
--
-- 1. pharmacy_stock_answers: every stock answer the prescriber was shown, one row per prescription, written in
--    the placement's transaction in its own savepoint (H8: a failure is logged and the prescription is placed,
--    Law 10). The state, the answering point, the count and receipt times and the level; for a Check, the
--    prescriber's tap. A Check answer also goes into prescriptions.check_answers (code `stock`) like any check.
--    NO quantity column: the prescriber's side never receives a stock figure (AV-6, Section 12).
-- 2. public.pharmacy_line_reviewed_at(prescription): when the line was first reviewed or accepted, for
--    "Pharmacy: reviewed {time}". The same gate as 0125's pharmacy_line_review_state; nothing else.
-- ADDITIVE and re-runnable. No client grants.

-- ─── 1. the stock answer ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pharmacy_stock_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  patient_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  prescription_id uuid NOT NULL UNIQUE REFERENCES public.prescriptions(id) ON DELETE RESTRICT,
  state text NOT NULL CHECK (state IN ('not_linked','not_stocked','not_counted','out','low','in_stock')),
  point_id uuid REFERENCES public.pharmacy_dispensing_points(department_id) ON DELETE RESTRICT,
  point_name text CHECK (point_name IS NULL OR char_length(point_name) <= 200),
  last_count_at timestamptz,
  last_receipt_at timestamptz,
  since timestamptz,
  level text NOT NULL CHECK (level IN ('note','check','not_checked')),
  -- The prescriber's tap at a Check ("Aware; prescribe anyway"); null for a Note or when none was given.
  answer text CHECK (answer IS NULL OR char_length(answer) BETWEEN 2 AND 60),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT psa_point CHECK ((state = 'not_linked') = (point_id IS NULL)),
  CONSTRAINT psa_answer_at_check CHECK (answer IS NULL OR level = 'check')
);
CREATE INDEX IF NOT EXISTS psa_patient ON public.pharmacy_stock_answers (hospital_id, patient_user_id);

DROP TRIGGER IF EXISTS pharmacy_stock_answers_append_only ON public.pharmacy_stock_answers;
CREATE TRIGGER pharmacy_stock_answers_append_only BEFORE UPDATE OR DELETE ON public.pharmacy_stock_answers
  FOR EACH ROW EXECUTE FUNCTION public.block_modify_append_only();
DROP TRIGGER IF EXISTS audit_pharmacy_stock_answers ON public.pharmacy_stock_answers;
CREATE TRIGGER audit_pharmacy_stock_answers AFTER INSERT ON public.pharmacy_stock_answers
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes();
ALTER TABLE public.pharmacy_stock_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pharmacy_stock_answers FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.pharmacy_stock_answers FROM anon, authenticated;
GRANT SELECT ON public.pharmacy_stock_answers TO medsync_clinical_reader;
DROP POLICY IF EXISTS pharmacy_stock_answers_select ON public.pharmacy_stock_answers;
CREATE POLICY pharmacy_stock_answers_select ON public.pharmacy_stock_answers FOR SELECT TO medsync_clinical_reader
  USING (hospital_id = (SELECT private.current_hospital_id()) AND (SELECT private.pharmacy_can('pharmacy.view')));
-- The prescriber's side (0125's shape): may prescribe here, for a patient they may see. It holds no figure.
DROP POLICY IF EXISTS pharmacy_stock_answers_prescriber_select ON public.pharmacy_stock_answers;
CREATE POLICY pharmacy_stock_answers_prescriber_select ON public.pharmacy_stock_answers FOR SELECT TO medsync_clinical_reader
  USING (hospital_id = (SELECT private.current_hospital_id()) AND (SELECT private.may_prescribe_here())
         AND patient_user_id IN (SELECT private.accessible_patient_ids()));

-- ─── 2. the reviewed time on the nurse's chip ───────────────────────
CREATE OR REPLACE FUNCTION public.pharmacy_line_reviewed_at(p_prescription uuid) RETURNS timestamptz
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT CASE
    WHEN p.hospital_id IS DISTINCT FROM private.current_hospital_id()
         OR p.patient_user_id NOT IN (SELECT private.accessible_patient_ids()) THEN NULL
    ELSE (SELECT min(e.occurred_at) FROM public.pharmacy_line_events e
           WHERE e.prescription_id = p.id AND e.kind IN ('accepted','accepted_overridden_stop','reviewed')) END
  FROM public.prescriptions p WHERE p.id = p_prescription;
$$;
REVOKE ALL ON FUNCTION public.pharmacy_line_reviewed_at(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pharmacy_line_reviewed_at(uuid) TO medsync_clinical_reader;
