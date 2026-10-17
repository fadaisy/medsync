-- 0155 — Lab Phase 5: delta checks as decision support (docs/lab/phase-5/gate-a-proposal.md §6; DL-1..DL-13;
-- A8..A11). Delta, panel and pattern rules are signed configuration (the laboratory lead, countersigned by the CSO);
-- a fired rule is a delta flag that keeps both values, the rule version and the change; the technologist's decision
-- is an append-only outcome. A confirmed mislabel opens a nonconformity from the new source `delta`.
--
-- No limit, window or threshold ships here: every rule is entered and signed in the product with its basis.
-- ADDITIVE and re-runnable. GATED: owner-applied (`npm run db:migrate -- 0155`).
-- Reverse: DROP TABLE public.delta_outcomes, public.delta_flags; restore the three CHECKs to their 0154, 0150 and
-- 0071 lists.

CREATE TABLE IF NOT EXISTS public.delta_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  patient_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  order_id uuid NOT NULL REFERENCES public.encounter_orders(id) ON DELETE RESTRICT,
  report_logical_id uuid NOT NULL,
  report_id uuid NOT NULL REFERENCES public.diagnostic_reports(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('delta','panel','pattern')),
  concept_id text,                                  -- NULL for a panel or pattern flag on the whole specimen
  rule_config_id uuid NOT NULL REFERENCES public.lab_signed_configs(id) ON DELETE RESTRICT,
  rule_key text NOT NULL,
  rule_version integer NOT NULL,
  previous_report_id uuid REFERENCES public.diagnostic_reports(id) ON DELETE RESTRICT,
  previous_value numeric,
  current_value numeric,
  unit text,
  change_abs numeric,
  change_pct numeric,
  interval_hours numeric,
  detail jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(detail) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT df_delta_shape CHECK (kind <> 'delta' OR (concept_id IS NOT NULL AND previous_report_id IS NOT NULL
    AND previous_value IS NOT NULL AND current_value IS NOT NULL))
);
-- One flag per rule per component per report version (a re-save re-evaluates into the same row's absence).
CREATE UNIQUE INDEX IF NOT EXISTS df_once
  ON public.delta_flags (report_id, rule_key, coalesce(concept_id, ''));
CREATE INDEX IF NOT EXISTS df_logical ON public.delta_flags (report_logical_id);

CREATE TABLE IF NOT EXISTS public.delta_outcomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  flag_id uuid NOT NULL REFERENCES public.delta_flags(id) ON DELETE RESTRICT,
  outcome text NOT NULL CHECK (outcome IN ('physiological_or_treatment','transfusion_or_dialysis',
    'confirmed_same_patient','contamination_suspected','previous_specimen_suspect','recollect','mislabel_confirmed')),
  with_whom text CHECK (with_whom IS NULL OR char_length(with_whom) BETWEEN 2 AND 120),
  note text NOT NULL CHECK (char_length(note) BETWEEN 3 AND 1000),
  nonconformity_id uuid REFERENCES public.lab_nonconformities(id) ON DELETE RESTRICT,
  decided_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  decided_at timestamptz NOT NULL DEFAULT now(),
  client_key text NOT NULL CHECK (char_length(client_key) BETWEEN 8 AND 120),
  CONSTRAINT do_with_whom CHECK (outcome <> 'confirmed_same_patient' OR with_whom IS NOT NULL),
  CONSTRAINT do_once UNIQUE (flag_id),
  CONSTRAINT do_key UNIQUE (hospital_id, client_key)
);

-- ─── Signed kinds and the nonconformity source ──────────────────────────
ALTER TABLE public.lab_signed_configs DROP CONSTRAINT IF EXISTS lab_signed_configs_kind_check;
ALTER TABLE public.lab_signed_configs ADD CONSTRAINT lab_signed_configs_kind_check CHECK (kind IN
  ('scheme','flag_basis','elevation','hiv_algorithm','ncd_mapping','ref','addendum',
   'qc_plan','qc_policy','kit_qc_rule','acceptance_plan','device_qc_rule','competency_validity','hmis_mapping',
   'register_config',
   'partner_tests','partner_packing','partner_legal','partner_fields','referral_ops','referral_wording',
   'patient_release','plain_words','minors_rule','sms_template','patient_floor_additions','results_consent_notice',
   'delta_rule','panel_rule','pattern_rule'));

ALTER TABLE public.lab_nonconformities DROP CONSTRAINT IF EXISTS lab_nonconformities_source_check;
ALTER TABLE public.lab_nonconformities ADD CONSTRAINT lab_nonconformities_source_check CHECK (source IN
  ('qc_reject','kit_qc_fail','eqa_unacceptable','temperature','lot_rejected','equipment','complaint','specimen',
   'other','referral','manifest','delta'));

-- DL-7: "Possible wrong sample (delta check)" rejects the specimen through the Phase 1 rejection path.
ALTER TABLE public.specimen_events DROP CONSTRAINT IF EXISTS specimen_events_reason_code_check;
ALTER TABLE public.specimen_events ADD CONSTRAINT specimen_events_reason_code_check CHECK (reason_code IS NULL
  OR reason_code IN ('haemolysed','clotted','insufficient','unlabelled_or_mislabelled','wrong_container','delayed',
                     'possible_wrong_sample'));

-- ─── Append-only, audit, RLS: the lab reads (DL-13: restricted results stay with the class's readers) ─
DROP TRIGGER IF EXISTS delta_flags_no_mutation ON public.delta_flags;
CREATE TRIGGER delta_flags_no_mutation BEFORE UPDATE OR DELETE ON public.delta_flags
  FOR EACH ROW EXECUTE FUNCTION public.block_modify_append_only();
DROP TRIGGER IF EXISTS delta_outcomes_no_mutation ON public.delta_outcomes;
CREATE TRIGGER delta_outcomes_no_mutation BEFORE UPDATE OR DELETE ON public.delta_outcomes
  FOR EACH ROW EXECUTE FUNCTION public.block_modify_append_only();
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['delta_flags','delta_outcomes'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS audit_%1$s ON public.%1$I', t);
    EXECUTE format('CREATE TRIGGER audit_%1$s AFTER INSERT OR UPDATE OR DELETE ON public.%1$I
      FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes()', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO medsync_clinical_reader', t);
  END LOOP;
END $$;
DROP POLICY IF EXISTS lab_read ON public.delta_flags;
CREATE POLICY lab_read ON public.delta_flags FOR SELECT TO medsync_clinical_reader
  USING (hospital_id = (SELECT private.current_hospital_id()) AND (SELECT private.lab_reader())
         AND EXISTS (SELECT 1 FROM public.diagnostic_reports r WHERE r.id = report_id));
DROP POLICY IF EXISTS lab_read ON public.delta_outcomes;
CREATE POLICY lab_read ON public.delta_outcomes FOR SELECT TO medsync_clinical_reader
  USING (hospital_id = (SELECT private.current_hospital_id()) AND (SELECT private.lab_reader())
         AND EXISTS (SELECT 1 FROM public.delta_flags f WHERE f.id = flag_id));
