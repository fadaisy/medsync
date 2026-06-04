-- 0041 — Clinical code reference (ICD-10 + LOINC) as versioned reference data.
--
-- ⚠️ GATED — apply alongside the encounter engine (0040). NON-PHI public
-- reference data (diagnosis/lab code catalogs), so lower-risk than 0040, but
-- still applied with the same named authorization.
--
-- Kickoff §1/§5: standards alignment as VERSIONED REFERENCE DATA, "sourced, not
-- invented". This seeds a CURATED STARTER SUBSET of common codes (each verified
-- against WHO ICD-10 / loinc.org) — the full sets load later via an official
-- import. The rows here mirror lib/encounter/reference-codes.ts (the app/UI
-- source of truth); keep the two in sync until the importer lands.
--
-- RLS: readable by any authenticated user (reference data, not PHI); no client
-- write policy (catalog is maintained service-role / by the importer).

CREATE TABLE IF NOT EXISTS public.icd10_codes (
  code text PRIMARY KEY,
  display text NOT NULL,
  category text,
  version text NOT NULL,
  source text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS icd10_codes_category_idx ON public.icd10_codes (category);

CREATE TABLE IF NOT EXISTS public.loinc_codes (
  code text PRIMARY KEY,
  display text NOT NULL,
  category text,
  version text NOT NULL,
  source text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS loinc_codes_category_idx ON public.loinc_codes (category);

ALTER TABLE public.icd10_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.icd10_codes FORCE ROW LEVEL SECURITY;
ALTER TABLE public.loinc_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loinc_codes FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS icd10_codes_select_all ON public.icd10_codes;
CREATE POLICY icd10_codes_select_all ON public.icd10_codes
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS loinc_codes_select_all ON public.loinc_codes;
CREATE POLICY loinc_codes_select_all ON public.loinc_codes
  FOR SELECT TO authenticated USING (true);

-- ─── Seed (curated, verified). Mirrors lib/encounter/reference-codes.ts. ──
INSERT INTO public.icd10_codes (code, display, category, version, source) VALUES
  ('A09',   'Gastroenteritis / diarrhoea, presumed infectious', 'Infectious',     '2019', 'WHO ICD-10 (2019)'),
  ('A41.9', 'Sepsis, unspecified',                              'Infectious',     '2019', 'WHO ICD-10 (2019)'),
  ('B54',   'Malaria, unspecified',                             'Infectious',     '2019', 'WHO ICD-10 (2019)'),
  ('B50',   'Plasmodium falciparum malaria',                    'Infectious',     '2019', 'WHO ICD-10 (2019)'),
  ('A15',   'Respiratory tuberculosis, confirmed',              'Infectious',     '2019', 'WHO ICD-10 (2019)'),
  ('B24',   'HIV disease, unspecified',                         'Infectious',     '2019', 'WHO ICD-10 (2019)'),
  ('J18.9', 'Pneumonia, unspecified organism',                  'Respiratory',    '2019', 'WHO ICD-10 (2019)'),
  ('J06.9', 'Acute upper respiratory infection, unspecified',   'Respiratory',    '2019', 'WHO ICD-10 (2019)'),
  ('J45',   'Asthma',                                           'Respiratory',    '2019', 'WHO ICD-10 (2019)'),
  ('I10',   'Essential (primary) hypertension',                 'Cardiovascular', '2019', 'WHO ICD-10 (2019)'),
  ('I50',   'Heart failure',                                    'Cardiovascular', '2019', 'WHO ICD-10 (2019)'),
  ('I63',   'Cerebral infarction (stroke)',                     'Neurological',   '2019', 'WHO ICD-10 (2019)'),
  ('E11',   'Type 2 diabetes mellitus',                         'Endocrine',      '2019', 'WHO ICD-10 (2019)'),
  ('D64.9', 'Anaemia, unspecified',                             'Haematology',    '2019', 'WHO ICD-10 (2019)'),
  ('N39.0', 'Urinary tract infection, site not specified',      'Renal/GU',       '2019', 'WHO ICD-10 (2019)'),
  ('K35',   'Acute appendicitis',                               'Surgical',       '2019', 'WHO ICD-10 (2019)'),
  ('O15',   'Eclampsia',                                        'Obstetric',      '2019', 'WHO ICD-10 (2019)'),
  ('O80',   'Single spontaneous delivery',                      'Obstetric',      '2019', 'WHO ICD-10 (2019)'),
  ('S06',   'Intracranial injury',                              'Injury',         '2019', 'WHO ICD-10 (2019)')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.loinc_codes (code, display, category, version, source) VALUES
  ('718-7',   'Hemoglobin [Mass/volume] in Blood',              'Haematology', '2.77', 'LOINC (Regenstrief)'),
  ('20570-8', 'Hematocrit [Volume Fraction] of Blood',          'Haematology', '2.77', 'LOINC (Regenstrief)'),
  ('6690-2',  'Leukocytes (WBC) [#/volume] in Blood',           'Haematology', '2.77', 'LOINC (Regenstrief)'),
  ('777-3',   'Platelets [#/volume] in Blood',                  'Haematology', '2.77', 'LOINC (Regenstrief)'),
  ('2345-7',  'Glucose [Mass/volume] in Serum or Plasma',       'Chemistry',   '2.77', 'LOINC (Regenstrief)'),
  ('4548-4',  'Hemoglobin A1c / Hemoglobin.total in Blood',     'Chemistry',   '2.77', 'LOINC (Regenstrief)'),
  ('2160-0',  'Creatinine [Mass/volume] in Serum or Plasma',    'Chemistry',   '2.77', 'LOINC (Regenstrief)'),
  ('2951-2',  'Sodium [Moles/volume] in Serum or Plasma',       'Chemistry',   '2.77', 'LOINC (Regenstrief)'),
  ('2823-3',  'Potassium [Moles/volume] in Serum or Plasma',    'Chemistry',   '2.77', 'LOINC (Regenstrief)')
ON CONFLICT (code) DO NOTHING;
