-- 0150 — Lab Phase 4: the partner register, the data protection and IPC lead designations, six signed
-- configuration kinds for partners and referral wording, and nonconformity sources for referrals and manifests
-- (docs/lab/phase-4/gate-a-proposal.md §3.1, §4; P4, P8; D-LAB4-19..22; A4, A6).
--
-- No clinical number or code ships here: partner codes, stated turnaround, packing items, the legal record and the
-- field list are entered and signed in the product (lab_signed_configs). ADDITIVE and re-runnable.
-- GATED: owner-applied (`npm run db:migrate -- 0150`).
-- Reverse: DROP TABLE public.lab_partners, public.hospital_designations; restore the two CHECKs below to their
-- 0112 and 0114 lists (no row can hold a new value unless Phase 4 was used).

-- ─── Partners (PT-1): identity, contacts, transport, how results return ───
CREATE TABLE IF NOT EXISTS public.lab_partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 120),
  kind text NOT NULL CHECK (kind IN ('national_reference','public_lab','private_lab','abroad','outbreak','hub')),
  contacts jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(contacts) = 'array'),
  transport jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(transport) = 'array'),
  results_return jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(results_return) = 'array'),
  active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_at timestamptz,
  CONSTRAINT lab_partners_name UNIQUE (hospital_id, name)
);

-- ─── Designations (P8): the data protection lead and the IPC lead ─────────
CREATE TABLE IF NOT EXISTS public.hospital_designations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('data_protection_lead','ipc_lead')),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  starts_on date NOT NULL,
  ends_on date,
  set_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  set_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hdes_span CHECK (ends_on IS NULL OR ends_on >= starts_on)
);
CREATE INDEX IF NOT EXISTS hospital_designations_user ON public.hospital_designations (hospital_id, user_id);

-- The reader holds an open designation of that role at their hospital today (hospital-local).
CREATE OR REPLACE FUNCTION private.designated(p_role text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM public.hospital_designations h
    WHERE h.role = p_role AND h.user_id = private.current_user_id()
      AND h.hospital_id = private.current_hospital_id()
      AND h.starts_on <= (now() AT TIME ZONE 'Africa/Kampala')::date
      AND (h.ends_on IS NULL OR h.ends_on >= (now() AT TIME ZONE 'Africa/Kampala')::date));
$$;
REVOKE ALL ON FUNCTION private.designated(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.designated(text) TO medsync_clinical_reader;

-- ─── Signed configuration: six new kinds (A4) ────────────────────────────
-- partner_tests, partner_packing: the laboratory lead alone. partner_legal, partner_fields: the data protection
-- lead alone (in the lead slot; the action checks the designation). referral_ops (operational): the lab lead
-- alone. referral_wording: the IPC lead (lead slot), countersigned by the CSO.
ALTER TABLE public.lab_signed_configs DROP CONSTRAINT IF EXISTS lab_signed_configs_kind_check;
ALTER TABLE public.lab_signed_configs ADD CONSTRAINT lab_signed_configs_kind_check CHECK (kind IN
  ('scheme','flag_basis','elevation','hiv_algorithm','ncd_mapping','ref','addendum',
   'qc_plan','qc_policy','kit_qc_rule','acceptance_plan','device_qc_rule','competency_validity','hmis_mapping',
   'register_config',
   'partner_tests','partner_packing','partner_legal','partner_fields','referral_ops','referral_wording'));
ALTER TABLE public.lab_signed_configs DROP CONSTRAINT IF EXISTS lsc_signed_by_two;
ALTER TABLE public.lab_signed_configs ADD CONSTRAINT lsc_signed_by_two CHECK (status = 'draft' OR (
  lead_signed_by IS NOT NULL AND in_force_from IS NOT NULL AND (
    kind IN ('kit_qc_rule','acceptance_plan','device_qc_rule','competency_validity','register_config',
             'partner_tests','partner_packing','partner_legal','partner_fields','referral_ops')
    OR (cso_signed_by IS NOT NULL AND (lead_signed_by <> cso_signed_by OR exception_note IS NOT NULL)))));

-- The legal record and the field list are read by the lab, the data protection lead and the hospital admin
-- only (not every clinician of the hospital, which the base policy lsc_select allows for other kinds).
DROP POLICY IF EXISTS lsc_partner_legal ON public.lab_signed_configs;
CREATE POLICY lsc_partner_legal ON public.lab_signed_configs AS RESTRICTIVE FOR SELECT TO medsync_clinical_reader
  USING (kind NOT IN ('partner_legal','partner_fields')
         OR (SELECT private.lab_reader()) OR (SELECT private.designated('data_protection_lead'))
         OR (SELECT private.hospital_admin_reader()));

-- ─── Nonconformities: two new sources (RF-10, MF-3) ──────────────────────
ALTER TABLE public.lab_nonconformities DROP CONSTRAINT IF EXISTS lab_nonconformities_source_check;
ALTER TABLE public.lab_nonconformities ADD CONSTRAINT lab_nonconformities_source_check CHECK (source IN
  ('qc_reject','kit_qc_fail','eqa_unacceptable','temperature','lot_rejected','equipment','complaint','specimen',
   'other','referral','manifest'));

-- ─── Audit, RLS ──────────────────────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['lab_partners','hospital_designations'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS audit_%1$s ON public.%1$I', t);
    EXECUTE format('CREATE TRIGGER audit_%1$s AFTER INSERT OR UPDATE OR DELETE ON public.%1$I
      FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes()', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO medsync_clinical_reader', t);
  END LOOP;
END $$;

-- Partners: the lab, the data protection lead, the hospital admin (the register has no legal files).
DROP POLICY IF EXISTS lab_partners_read ON public.lab_partners;
CREATE POLICY lab_partners_read ON public.lab_partners FOR SELECT TO medsync_clinical_reader
  USING (hospital_id = (SELECT private.current_hospital_id())
         AND ((SELECT private.lab_reader()) OR (SELECT private.designated('data_protection_lead'))
              OR (SELECT private.hospital_admin_reader())));

-- Designations: the lab, the hospital admin, and the designated person their own rows.
DROP POLICY IF EXISTS hospital_designations_read ON public.hospital_designations;
CREATE POLICY hospital_designations_read ON public.hospital_designations FOR SELECT TO medsync_clinical_reader
  USING (hospital_id = (SELECT private.current_hospital_id())
         AND ((SELECT private.lab_reader()) OR (SELECT private.hospital_admin_reader())
              OR user_id = (SELECT private.current_user_id())));
