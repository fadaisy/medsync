-- 0117 — Registers and HMIS 105: register prints, the monthly HMIS 105 laboratory report (draft → checked →
-- signed → exported; frozen once signed, revisions instead of rewrites), the Health Unit In-Charge and HMIS
-- focal person designations, the HIV testing purpose on the order, and the specimen types the form's columns
-- need (Lab Phase 3, gate-a-proposal §3.2, §4, §5.6, P10, P11, P16, P18; E-LAB3-05, -10, -11; D-LAB3-21, -23).
--
-- The form version is a committed data file (data/lab/hmis105-2019-09.json) and the mapping is signed
-- configuration (kind hmis_mapping, 0112); neither is a table. The hospital admin, the In-Charge and the focal
-- person read reports as aggregates only, through private.lab_hmis_aggregates(): never the per-cell record ids.
-- ADDITIVE and re-runnable. GATED: owner-applied (`npm run db:migrate -- 0117`).

-- ─── Designations (E-LAB3-11) ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.hmis_designations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('in_charge','focal')),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  starts_on date NOT NULL,
  ends_on date,
  set_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  set_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hd_span CHECK (ends_on IS NULL OR ends_on >= starts_on)
);
CREATE INDEX IF NOT EXISTS hmis_designations_user ON public.hmis_designations (hospital_id, user_id);

-- The reader holds an open designation at their hospital today (hospital-local, Africa/Kampala).
CREATE OR REPLACE FUNCTION private.hmis_designated() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM public.hmis_designations h
    WHERE h.user_id = private.current_user_id() AND h.hospital_id = private.current_hospital_id()
      AND h.starts_on <= (now() AT TIME ZONE 'Africa/Kampala')::date
      AND (h.ends_on IS NULL OR h.ends_on >= (now() AT TIME ZONE 'Africa/Kampala')::date));
$$;
CREATE OR REPLACE FUNCTION private.hospital_admin_reader() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles r
    WHERE r.user_id = private.current_user_id() AND r.role = 'hospital_admin'
      AND r.hospital_id = private.current_hospital_id());
$$;
REVOKE ALL ON FUNCTION private.hmis_designated(), private.hospital_admin_reader() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.hmis_designated(), private.hospital_admin_reader() TO medsync_clinical_reader;

-- ─── Register prints and HMIS reports ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.lab_register_prints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  register text NOT NULL CHECK (register IN ('general','hiv','tb','mental_health','sexual_reproductive_health')),
  section_id uuid REFERENCES public.hospital_departments(id) ON DELETE RESTRICT,
  day date NOT NULL,
  pages integer NOT NULL CHECK (pages > 0),
  config_id uuid REFERENCES public.lab_signed_configs(id) ON DELETE RESTRICT,   -- NULL: canvas defaults (OA-3)
  config_version integer,
  printed_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  printed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lrp_config CHECK ((config_id IS NULL) = (config_version IS NULL))
);

CREATE TABLE IF NOT EXISTS public.lab_hmis_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  month date NOT NULL CHECK (extract(day FROM month) = 1),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  state text NOT NULL DEFAULT 'draft' CHECK (state IN ('draft','checked','signed','exported')),
  mapping_config_id uuid REFERENCES public.lab_signed_configs(id) ON DELETE RESTRICT,
  mapping_version integer,
  form_hash text NOT NULL CHECK (form_hash ~ '^[0-9a-f]{64}$'),
  cells jsonb NOT NULL DEFAULT '{}',
  sources jsonb NOT NULL DEFAULT '{}',       -- record ids per cell: lab readers only
  manual jsonb NOT NULL DEFAULT '{}',
  checked_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  checked_at timestamptz,
  signed_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  signed_at timestamptz,
  exported_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  exported_at timestamptz,
  UNIQUE (hospital_id, month, revision),
  CONSTRAINT lhr_mapping CHECK ((mapping_config_id IS NULL) = (mapping_version IS NULL)
    AND (state IN ('draft','checked') OR mapping_config_id IS NOT NULL)),
  CONSTRAINT lhr_checked CHECK (state = 'draft' OR (checked_by IS NOT NULL AND checked_at IS NOT NULL)),
  CONSTRAINT lhr_signed CHECK (state IN ('draft','checked') OR (signed_by IS NOT NULL AND signed_at IS NOT NULL)),
  CONSTRAINT lhr_exported CHECK (state <> 'exported' OR (exported_by IS NOT NULL AND exported_at IS NOT NULL))
);
-- Never deleted. Once signed, only the export may be recorded, once (D-LAB3-23); a change is a new revision.
CREATE OR REPLACE FUNCTION private.lab_hmis_report_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'lab_hmis_reports: a report is never deleted'; END IF;
  IF OLD.state = 'exported' OR (OLD.state = 'signed' AND (NEW.state <> 'exported'
       OR (to_jsonb(NEW) - 'state' - 'exported_by' - 'exported_at')
          IS DISTINCT FROM (to_jsonb(OLD) - 'state' - 'exported_by' - 'exported_at'))) THEN
    RAISE EXCEPTION 'lab_hmis_reports: a signed report is frozen; prepare a revision';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS lab_hmis_reports_guard ON public.lab_hmis_reports;
CREATE TRIGGER lab_hmis_reports_guard BEFORE UPDATE OR DELETE ON public.lab_hmis_reports
  FOR EACH ROW EXECUTE FUNCTION private.lab_hmis_report_guard();

-- Aggregates only (Law 10): the report without its per-cell record ids, for the lab, the In-Charge, the focal
-- person and the hospital admin of the reader's hospital.
CREATE OR REPLACE FUNCTION private.lab_hmis_aggregates()
RETURNS TABLE (id uuid, month date, revision integer, state text, mapping_version integer, form_hash text,
               cells jsonb, manual jsonb, checked_at timestamptz, signed_at timestamptz, exported_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT r.id, r.month, r.revision, r.state, r.mapping_version, r.form_hash, r.cells, r.manual,
         r.checked_at, r.signed_at, r.exported_at
    FROM public.lab_hmis_reports r
   WHERE r.hospital_id = private.current_hospital_id()
     AND (private.lab_reader() OR private.hmis_designated() OR private.hospital_admin_reader())
$$;
REVOKE ALL ON FUNCTION private.lab_hmis_aggregates() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.lab_hmis_aggregates() TO medsync_clinical_reader;

DROP TRIGGER IF EXISTS lab_register_prints_no_mutation ON public.lab_register_prints;
CREATE TRIGGER lab_register_prints_no_mutation BEFORE UPDATE OR DELETE ON public.lab_register_prints
  FOR EACH ROW EXECUTE FUNCTION public.block_modify_append_only();
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['hmis_designations','lab_register_prints','lab_hmis_reports'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS audit_%1$s ON public.%1$I', t);
    EXECUTE format('CREATE TRIGGER audit_%1$s AFTER INSERT OR UPDATE OR DELETE ON public.%1$I
      FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes()', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO medsync_clinical_reader', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['lab_register_prints','lab_hmis_reports'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS lab_read ON public.%I', t);
    EXECUTE format('CREATE POLICY lab_read ON public.%I FOR SELECT TO medsync_clinical_reader
      USING (hospital_id = (SELECT private.current_hospital_id()) AND (SELECT private.lab_reader()))', t);
  END LOOP;
END $$;
-- The lab and the hospital admin read every designation; a designated person reads their own.
DROP POLICY IF EXISTS hd_read ON public.hmis_designations;
CREATE POLICY hd_read ON public.hmis_designations FOR SELECT TO medsync_clinical_reader
  USING (hospital_id = (SELECT private.current_hospital_id())
         AND ((SELECT private.lab_reader()) OR (SELECT private.hospital_admin_reader())
              OR user_id = (SELECT private.current_user_id())));

-- ─── HIV testing purpose on the order line (D-LAB3-21; required by the writer when labHmis is on) ─
ALTER TABLE public.encounter_orders ADD COLUMN IF NOT EXISTS test_purpose text;
ALTER TABLE public.encounter_orders DROP CONSTRAINT IF EXISTS enc_order_test_purpose_check;
ALTER TABLE public.encounter_orders ADD CONSTRAINT enc_order_test_purpose_check CHECK (test_purpose IS NULL OR
  test_purpose IN ('hct','emtct','clinical_diagnosis','smc','verification','recency'));

-- ─── Specimen types for the form's columns (E-LAB3-10). The catalogue's sputum tests already name `sputum`. ─
ALTER TABLE public.specimens DROP CONSTRAINT IF EXISTS specimens_specimen_type_check;
ALTER TABLE public.specimens ADD CONSTRAINT specimens_specimen_type_check CHECK (specimen_type IN
  ('venous_plasma','venous_serum','venous_whole_blood','capillary_whole_blood','arterial_blood','urine_spot',
   'urine_first_morning','urine_24h','interstitial_fluid','unknown',
   'sputum','stool','csf','pus_swab','genital_swab','skin_snip','other'));
