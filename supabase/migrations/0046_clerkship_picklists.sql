-- 0046 — Clerkship history-section pick-lists (PMH/PSH/Drug/Family/Social). GATED.
--
-- ⚠️ GATED — apply with explicit, named CSO/owner authorization (same posture as
-- 0042–0045). Clinical-safety REFERENCE DATA: the curated pick-lists the tap-first
-- history sections consume — conditions (shared by PMH + Family Hx), operations,
-- allergens, common drugs, occupations, exposures. The CSO (Fadhul) signs it.
-- Source: clerkship-history-sections-catalog.md (Hutchison Ch 1) — IM-first,
-- Uganda-relevant. Decision-support + structured documentation, not autonomous.
--
-- ONE generic, governed pick-list table (ratified at GATE A) keyed by list_type;
-- reuses the symptom_catalog governance shape (scope/origin + immutable
-- attribution + propose-to-shared). The structured per-encounter ENTRIES live in
-- the clerkship section_data; PMH conditions / drugs / allergies additionally
-- write to the existing problem_list / encounter_medications / patient_allergies
-- objects (no parallel store).

CREATE TABLE IF NOT EXISTS public.clerkship_picklist (
  code text PRIMARY KEY,
  list_type text NOT NULL,
  display text NOT NULL,
  synonyms text[] NOT NULL DEFAULT '{}',
  -- list-specific extras (e.g. condition complications, default route) — tap content.
  meta jsonb NOT NULL DEFAULT '{}',
  icd10_hint text,
  uganda_flag text,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  version text NOT NULL,
  source text NOT NULL,
  -- governance (mirrors symptom_catalog): attribution + scope + provenance.
  created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_name text,
  scope text NOT NULL DEFAULT 'shared',
  origin text NOT NULL DEFAULT 'seed',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT clerkship_picklist_list_type_check
    CHECK (list_type IN ('condition', 'operation', 'allergen', 'drug', 'occupation', 'exposure', 'immunisation')),
  CONSTRAINT clerkship_picklist_scope_check CHECK (scope IN ('shared', 'personal')),
  CONSTRAINT clerkship_picklist_origin_check CHECK (origin IN ('seed', 'doctor', 'approved'))
);

CREATE INDEX IF NOT EXISTS clerkship_picklist_type_idx
  ON public.clerkship_picklist (list_type, active, sort_order);
CREATE INDEX IF NOT EXISTS clerkship_picklist_scope_creator_idx
  ON public.clerkship_picklist (scope, created_by_user_id);

-- ─── Attribution immutable (append-only ethos) ──────────────────────────────
CREATE OR REPLACE FUNCTION public.clerkship_picklist_lock_attribution() RETURNS trigger AS $$
BEGIN
  IF OLD.created_by_user_id IS NOT NULL
     AND NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id THEN
    RAISE EXCEPTION 'clerkship_picklist.created_by_user_id is immutable';
  END IF;
  IF OLD.created_by_name IS NOT NULL
     AND NEW.created_by_name IS DISTINCT FROM OLD.created_by_name THEN
    RAISE EXCEPTION 'clerkship_picklist.created_by_name is immutable';
  END IF;
  IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'clerkship_picklist.created_at is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS clerkship_picklist_lock_attribution_trg ON public.clerkship_picklist;
CREATE TRIGGER clerkship_picklist_lock_attribution_trg
  BEFORE UPDATE ON public.clerkship_picklist
  FOR EACH ROW EXECUTE FUNCTION public.clerkship_picklist_lock_attribution();

-- ─── RLS: shared rows readable by all; personal rows only by creator/superadmin ─
ALTER TABLE public.clerkship_picklist ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS clerkship_picklist_select_scoped ON public.clerkship_picklist;
CREATE POLICY clerkship_picklist_select_scoped ON public.clerkship_picklist
  FOR SELECT TO authenticated USING (
    scope = 'shared'
    OR created_by_user_id = auth.uid()
    OR public.user_has_role('superadmin')
  );

-- Writes go through Edge Functions / governed flows (service role); no direct
-- client INSERT/UPDATE policy (shared lists are never directly user-mutated).

-- ═══ SEED — CSO-signed pick-lists (appended below) ═══
INSERT INTO public.clerkship_picklist (code, list_type, display, synonyms, meta, uganda_flag, sort_order, version, source) VALUES
  ('hypertension', 'condition', 'Hypertension', ARRAY[]::text[], '{"complications":["stroke","IHD","CKD","heart failure"]}'::jsonb, NULL, 10, '1', 'Hutchison Ch1 (history sections)'),
  ('diabetes_t1', 'condition', 'Diabetes mellitus — type 1', ARRAY[]::text[], '{"complications":["retinopathy","nephropathy","neuropathy","foot ulcer"]}'::jsonb, NULL, 20, '1', 'Hutchison Ch1 (history sections)'),
  ('diabetes_t2', 'condition', 'Diabetes mellitus — type 2', ARRAY[]::text[], '{"complications":["retinopathy","nephropathy","neuropathy","foot ulcer"]}'::jsonb, NULL, 30, '1', 'Hutchison Ch1 (history sections)'),
  ('asthma', 'condition', 'Asthma', ARRAY[]::text[], '{}'::jsonb, NULL, 40, '1', 'Hutchison Ch1 (history sections)'),
  ('copd', 'condition', 'COPD', ARRAY['chronic obstructive pulmonary disease']::text[], '{}'::jsonb, NULL, 50, '1', 'Hutchison Ch1 (history sections)'),
  ('ihd', 'condition', 'Ischaemic heart disease / prior MI', ARRAY['heart attack','angina']::text[], '{}'::jsonb, NULL, 60, '1', 'Hutchison Ch1 (history sections)'),
  ('heart_failure', 'condition', 'Heart failure', ARRAY[]::text[], '{}'::jsonb, NULL, 70, '1', 'Hutchison Ch1 (history sections)'),
  ('atrial_fibrillation', 'condition', 'Atrial fibrillation', ARRAY['AF']::text[], '{}'::jsonb, NULL, 80, '1', 'Hutchison Ch1 (history sections)'),
  ('stroke_tia', 'condition', 'Stroke / TIA', ARRAY[]::text[], '{}'::jsonb, NULL, 90, '1', 'Hutchison Ch1 (history sections)'),
  ('ckd', 'condition', 'Chronic kidney disease', ARRAY[]::text[], '{}'::jsonb, NULL, 100, '1', 'Hutchison Ch1 (history sections)'),
  ('liver_disease', 'condition', 'Liver disease', ARRAY[]::text[], '{}'::jsonb, NULL, 110, '1', 'Hutchison Ch1 (history sections)'),
  ('peptic_ulcer', 'condition', 'Peptic ulcer disease', ARRAY[]::text[], '{}'::jsonb, NULL, 120, '1', 'Hutchison Ch1 (history sections)'),
  ('thyroid_hypo', 'condition', 'Hypothyroidism', ARRAY[]::text[], '{}'::jsonb, NULL, 130, '1', 'Hutchison Ch1 (history sections)'),
  ('thyroid_hyper', 'condition', 'Hyperthyroidism', ARRAY[]::text[], '{}'::jsonb, NULL, 140, '1', 'Hutchison Ch1 (history sections)'),
  ('epilepsy', 'condition', 'Epilepsy', ARRAY['seizures']::text[], '{}'::jsonb, NULL, 150, '1', 'Hutchison Ch1 (history sections)'),
  ('depression_anxiety', 'condition', 'Depression / anxiety', ARRAY[]::text[], '{}'::jsonb, NULL, 160, '1', 'Hutchison Ch1 (history sections)'),
  ('osteoarthritis', 'condition', 'Osteoarthritis', ARRAY[]::text[], '{}'::jsonb, NULL, 170, '1', 'Hutchison Ch1 (history sections)'),
  ('rheumatoid_arthritis', 'condition', 'Rheumatoid arthritis', ARRAY[]::text[], '{}'::jsonb, NULL, 180, '1', 'Hutchison Ch1 (history sections)'),
  ('cancer', 'condition', 'Cancer (specify site)', ARRAY[]::text[], '{}'::jsonb, NULL, 190, '1', 'Hutchison Ch1 (history sections)'),
  ('hyperlipidaemia', 'condition', 'Hyperlipidaemia', ARRAY[]::text[], '{}'::jsonb, NULL, 200, '1', 'Hutchison Ch1 (history sections)'),
  ('gout', 'condition', 'Gout', ARRAY[]::text[], '{}'::jsonb, NULL, 210, '1', 'Hutchison Ch1 (history sections)'),
  ('hiv', 'condition', 'HIV', ARRAY[]::text[], '{}'::jsonb, 'hiv', 220, '1', 'Hutchison Ch1 (history sections)'),
  ('tuberculosis', 'condition', 'Tuberculosis', ARRAY['TB']::text[], '{}'::jsonb, 'tb', 230, '1', 'Hutchison Ch1 (history sections)'),
  ('sickle_cell', 'condition', 'Sickle-cell disease', ARRAY[]::text[], '{}'::jsonb, 'sickle', 240, '1', 'Hutchison Ch1 (history sections)'),
  ('hepatitis_b', 'condition', 'Hepatitis B', ARRAY[]::text[], '{}'::jsonb, 'hepatitis', 250, '1', 'Hutchison Ch1 (history sections)'),
  ('hepatitis_c', 'condition', 'Hepatitis C', ARRAY[]::text[], '{}'::jsonb, 'hepatitis', 260, '1', 'Hutchison Ch1 (history sections)'),
  ('rheumatic_heart_disease', 'condition', 'Rheumatic heart disease', ARRAY[]::text[], '{}'::jsonb, 'rhd', 270, '1', 'Hutchison Ch1 (history sections)'),
  ('recurrent_malaria', 'condition', 'Recurrent malaria', ARRAY[]::text[], '{}'::jsonb, 'malaria', 280, '1', 'Hutchison Ch1 (history sections)'),
  ('appendicectomy', 'operation', 'Appendicectomy', ARRAY[]::text[], '{}'::jsonb, NULL, 10, '1', 'Hutchison Ch1 (history sections)'),
  ('cholecystectomy', 'operation', 'Cholecystectomy', ARRAY[]::text[], '{}'::jsonb, NULL, 20, '1', 'Hutchison Ch1 (history sections)'),
  ('herniorrhaphy', 'operation', 'Hernia repair', ARRAY[]::text[], '{}'::jsonb, NULL, 30, '1', 'Hutchison Ch1 (history sections)'),
  ('caesarean_section', 'operation', 'Caesarean section', ARRAY[]::text[], '{}'::jsonb, NULL, 40, '1', 'Hutchison Ch1 (history sections)'),
  ('hysterectomy', 'operation', 'Hysterectomy', ARRAY[]::text[], '{}'::jsonb, NULL, 50, '1', 'Hutchison Ch1 (history sections)'),
  ('laparotomy', 'operation', 'Laparotomy', ARRAY[]::text[], '{}'::jsonb, NULL, 60, '1', 'Hutchison Ch1 (history sections)'),
  ('tonsillectomy', 'operation', 'Tonsillectomy', ARRAY[]::text[], '{}'::jsonb, NULL, 70, '1', 'Hutchison Ch1 (history sections)'),
  ('joint_replacement', 'operation', 'Joint replacement', ARRAY[]::text[], '{}'::jsonb, NULL, 80, '1', 'Hutchison Ch1 (history sections)'),
  ('cataract_surgery', 'operation', 'Cataract surgery', ARRAY[]::text[], '{}'::jsonb, NULL, 90, '1', 'Hutchison Ch1 (history sections)'),
  ('prostatectomy', 'operation', 'Prostatectomy', ARRAY[]::text[], '{}'::jsonb, NULL, 100, '1', 'Hutchison Ch1 (history sections)'),
  ('thyroidectomy', 'operation', 'Thyroidectomy', ARRAY[]::text[], '{}'::jsonb, NULL, 110, '1', 'Hutchison Ch1 (history sections)'),
  ('orif', 'operation', 'Fracture fixation (ORIF)', ARRAY[]::text[], '{}'::jsonb, NULL, 120, '1', 'Hutchison Ch1 (history sections)'),
  ('amputation', 'operation', 'Amputation', ARRAY[]::text[], '{}'::jsonb, NULL, 130, '1', 'Hutchison Ch1 (history sections)'),
  ('cardiac_surgery', 'operation', 'Cardiac surgery (CABG/valve)', ARRAY[]::text[], '{}'::jsonb, NULL, 140, '1', 'Hutchison Ch1 (history sections)'),
  ('bowel_resection', 'operation', 'Bowel resection', ARRAY[]::text[], '{}'::jsonb, NULL, 150, '1', 'Hutchison Ch1 (history sections)'),
  ('penicillin', 'allergen', 'Penicillin', ARRAY[]::text[], '{}'::jsonb, NULL, 10, '1', 'Hutchison Ch1 (history sections)'),
  ('sulfonamides', 'allergen', 'Sulfa / sulfonamides', ARRAY[]::text[], '{}'::jsonb, NULL, 20, '1', 'Hutchison Ch1 (history sections)'),
  ('nsaids', 'allergen', 'NSAIDs', ARRAY[]::text[], '{}'::jsonb, NULL, 30, '1', 'Hutchison Ch1 (history sections)'),
  ('aspirin', 'allergen', 'Aspirin', ARRAY[]::text[], '{}'::jsonb, NULL, 40, '1', 'Hutchison Ch1 (history sections)'),
  ('cephalosporins', 'allergen', 'Cephalosporins', ARRAY[]::text[], '{}'::jsonb, NULL, 50, '1', 'Hutchison Ch1 (history sections)'),
  ('opioids', 'allergen', 'Opioids / morphine', ARRAY[]::text[], '{}'::jsonb, NULL, 60, '1', 'Hutchison Ch1 (history sections)'),
  ('local_anaesthetic', 'allergen', 'Local anaesthetic', ARRAY[]::text[], '{}'::jsonb, NULL, 70, '1', 'Hutchison Ch1 (history sections)'),
  ('contrast_iodine', 'allergen', 'Iodine / contrast', ARRAY[]::text[], '{}'::jsonb, NULL, 80, '1', 'Hutchison Ch1 (history sections)'),
  ('latex', 'allergen', 'Latex', ARRAY[]::text[], '{}'::jsonb, NULL, 90, '1', 'Hutchison Ch1 (history sections)'),
  ('peanut', 'allergen', 'Peanut', ARRAY[]::text[], '{}'::jsonb, NULL, 100, '1', 'Hutchison Ch1 (history sections)'),
  ('egg', 'allergen', 'Egg', ARRAY[]::text[], '{}'::jsonb, NULL, 110, '1', 'Hutchison Ch1 (history sections)'),
  ('shellfish', 'allergen', 'Shellfish', ARRAY[]::text[], '{}'::jsonb, NULL, 120, '1', 'Hutchison Ch1 (history sections)'),
  ('pollen', 'allergen', 'Pollen', ARRAY[]::text[], '{}'::jsonb, NULL, 130, '1', 'Hutchison Ch1 (history sections)'),
  ('dust_mite', 'allergen', 'Dust mite', ARRAY[]::text[], '{}'::jsonb, NULL, 140, '1', 'Hutchison Ch1 (history sections)'),
  ('amlodipine', 'drug', 'Amlodipine', ARRAY[]::text[], '{}'::jsonb, NULL, 10, '1', 'Hutchison Ch1 (history sections)'),
  ('lisinopril', 'drug', 'Lisinopril', ARRAY[]::text[], '{}'::jsonb, NULL, 20, '1', 'Hutchison Ch1 (history sections)'),
  ('losartan', 'drug', 'Losartan', ARRAY[]::text[], '{}'::jsonb, NULL, 30, '1', 'Hutchison Ch1 (history sections)'),
  ('hydrochlorothiazide', 'drug', 'Hydrochlorothiazide', ARRAY[]::text[], '{}'::jsonb, NULL, 40, '1', 'Hutchison Ch1 (history sections)'),
  ('atenolol', 'drug', 'Atenolol', ARRAY[]::text[], '{}'::jsonb, NULL, 50, '1', 'Hutchison Ch1 (history sections)'),
  ('bisoprolol', 'drug', 'Bisoprolol', ARRAY[]::text[], '{}'::jsonb, NULL, 60, '1', 'Hutchison Ch1 (history sections)'),
  ('metformin', 'drug', 'Metformin', ARRAY[]::text[], '{}'::jsonb, NULL, 70, '1', 'Hutchison Ch1 (history sections)'),
  ('glibenclamide', 'drug', 'Glibenclamide', ARRAY[]::text[], '{}'::jsonb, NULL, 80, '1', 'Hutchison Ch1 (history sections)'),
  ('insulin', 'drug', 'Insulin', ARRAY[]::text[], '{}'::jsonb, NULL, 90, '1', 'Hutchison Ch1 (history sections)'),
  ('atorvastatin', 'drug', 'Atorvastatin', ARRAY[]::text[], '{}'::jsonb, NULL, 100, '1', 'Hutchison Ch1 (history sections)'),
  ('simvastatin', 'drug', 'Simvastatin', ARRAY[]::text[], '{}'::jsonb, NULL, 110, '1', 'Hutchison Ch1 (history sections)'),
  ('aspirin_drug', 'drug', 'Aspirin', ARRAY[]::text[], '{}'::jsonb, NULL, 120, '1', 'Hutchison Ch1 (history sections)'),
  ('clopidogrel', 'drug', 'Clopidogrel', ARRAY[]::text[], '{}'::jsonb, NULL, 130, '1', 'Hutchison Ch1 (history sections)'),
  ('salbutamol', 'drug', 'Salbutamol inhaler', ARRAY[]::text[], '{}'::jsonb, NULL, 140, '1', 'Hutchison Ch1 (history sections)'),
  ('beclometasone', 'drug', 'Beclometasone inhaler', ARRAY[]::text[], '{}'::jsonb, NULL, 150, '1', 'Hutchison Ch1 (history sections)'),
  ('prednisolone', 'drug', 'Prednisolone', ARRAY[]::text[], '{}'::jsonb, NULL, 160, '1', 'Hutchison Ch1 (history sections)'),
  ('omeprazole', 'drug', 'Omeprazole', ARRAY[]::text[], '{}'::jsonb, NULL, 170, '1', 'Hutchison Ch1 (history sections)'),
  ('paracetamol', 'drug', 'Paracetamol', ARRAY[]::text[], '{}'::jsonb, NULL, 180, '1', 'Hutchison Ch1 (history sections)'),
  ('ibuprofen', 'drug', 'Ibuprofen', ARRAY[]::text[], '{}'::jsonb, NULL, 190, '1', 'Hutchison Ch1 (history sections)'),
  ('amoxicillin', 'drug', 'Amoxicillin', ARRAY[]::text[], '{}'::jsonb, NULL, 200, '1', 'Hutchison Ch1 (history sections)'),
  ('cotrimoxazole', 'drug', 'Cotrimoxazole', ARRAY[]::text[], '{}'::jsonb, NULL, 210, '1', 'Hutchison Ch1 (history sections)'),
  ('art', 'drug', 'Antiretrovirals (ART)', ARRAY[]::text[], '{}'::jsonb, 'hiv', 220, '1', 'Hutchison Ch1 (history sections)'),
  ('anti_tb', 'drug', 'Anti-TB (RHZE)', ARRAY[]::text[], '{}'::jsonb, 'tb', 230, '1', 'Hutchison Ch1 (history sections)'),
  ('warfarin', 'drug', 'Warfarin', ARRAY[]::text[], '{}'::jsonb, NULL, 240, '1', 'Hutchison Ch1 (history sections)'),
  ('furosemide', 'drug', 'Furosemide', ARRAY[]::text[], '{}'::jsonb, NULL, 250, '1', 'Hutchison Ch1 (history sections)'),
  ('digoxin', 'drug', 'Digoxin', ARRAY[]::text[], '{}'::jsonb, NULL, 260, '1', 'Hutchison Ch1 (history sections)'),
  ('levothyroxine', 'drug', 'Levothyroxine', ARRAY[]::text[], '{}'::jsonb, NULL, 270, '1', 'Hutchison Ch1 (history sections)'),
  ('carbamazepine', 'drug', 'Carbamazepine', ARRAY[]::text[], '{}'::jsonb, NULL, 280, '1', 'Hutchison Ch1 (history sections)'),
  ('amitriptyline', 'drug', 'Amitriptyline', ARRAY[]::text[], '{}'::jsonb, NULL, 290, '1', 'Hutchison Ch1 (history sections)'),
  ('coc', 'drug', 'Combined oral contraceptive', ARRAY[]::text[], '{}'::jsonb, NULL, 300, '1', 'Hutchison Ch1 (history sections)'),
  ('depot_provera', 'drug', 'Depot medroxyprogesterone', ARRAY[]::text[], '{}'::jsonb, NULL, 310, '1', 'Hutchison Ch1 (history sections)'),
  ('subsistence_farmer', 'occupation', 'Subsistence farmer', ARRAY[]::text[], '{}'::jsonb, NULL, 10, '1', 'Hutchison Ch1 (history sections)'),
  ('trader_business', 'occupation', 'Trader / business', ARRAY[]::text[], '{}'::jsonb, NULL, 20, '1', 'Hutchison Ch1 (history sections)'),
  ('teacher', 'occupation', 'Teacher', ARRAY[]::text[], '{}'::jsonb, NULL, 30, '1', 'Hutchison Ch1 (history sections)'),
  ('student', 'occupation', 'Student', ARRAY[]::text[], '{}'::jsonb, NULL, 40, '1', 'Hutchison Ch1 (history sections)'),
  ('unemployed', 'occupation', 'Unemployed', ARRAY[]::text[], '{}'::jsonb, NULL, 50, '1', 'Hutchison Ch1 (history sections)'),
  ('retired', 'occupation', 'Retired', ARRAY[]::text[], '{}'::jsonb, NULL, 60, '1', 'Hutchison Ch1 (history sections)'),
  ('civil_servant', 'occupation', 'Civil servant', ARRAY[]::text[], '{}'::jsonb, NULL, 70, '1', 'Hutchison Ch1 (history sections)'),
  ('driver', 'occupation', 'Driver', ARRAY[]::text[], '{}'::jsonb, NULL, 80, '1', 'Hutchison Ch1 (history sections)'),
  ('healthcare_worker', 'occupation', 'Healthcare worker', ARRAY[]::text[], '{}'::jsonb, NULL, 90, '1', 'Hutchison Ch1 (history sections)'),
  ('manual_labourer', 'occupation', 'Manual labourer', ARRAY[]::text[], '{}'::jsonb, NULL, 100, '1', 'Hutchison Ch1 (history sections)'),
  ('domestic_worker', 'occupation', 'Domestic worker', ARRAY[]::text[], '{}'::jsonb, NULL, 110, '1', 'Hutchison Ch1 (history sections)'),
  ('miner', 'occupation', 'Miner', ARRAY[]::text[], '{}'::jsonb, NULL, 120, '1', 'Hutchison Ch1 (history sections)'),
  ('fisherman', 'occupation', 'Fisherman', ARRAY[]::text[], '{}'::jsonb, NULL, 130, '1', 'Hutchison Ch1 (history sections)'),
  ('security_guard', 'occupation', 'Security guard', ARRAY[]::text[], '{}'::jsonb, NULL, 140, '1', 'Hutchison Ch1 (history sections)'),
  ('mechanic', 'occupation', 'Mechanic', ARRAY[]::text[], '{}'::jsonb, NULL, 150, '1', 'Hutchison Ch1 (history sections)'),
  ('market_vendor', 'occupation', 'Market vendor', ARRAY[]::text[], '{}'::jsonb, NULL, 160, '1', 'Hutchison Ch1 (history sections)'),
  ('dust', 'exposure', 'Dust', ARRAY[]::text[], '{}'::jsonb, NULL, 10, '1', 'Hutchison Ch1 (history sections)'),
  ('chemicals', 'exposure', 'Chemicals', ARRAY[]::text[], '{}'::jsonb, NULL, 20, '1', 'Hutchison Ch1 (history sections)'),
  ('asbestos', 'exposure', 'Asbestos', ARRAY[]::text[], '{}'::jsonb, NULL, 30, '1', 'Hutchison Ch1 (history sections)'),
  ('biological', 'exposure', 'Biological', ARRAY[]::text[], '{}'::jsonb, NULL, 40, '1', 'Hutchison Ch1 (history sections)'),
  ('smoke_fumes', 'exposure', 'Smoke / fumes', ARRAY[]::text[], '{}'::jsonb, NULL, 50, '1', 'Hutchison Ch1 (history sections)'),
  ('loud_noise', 'exposure', 'Loud noise', ARRAY[]::text[], '{}'::jsonb, NULL, 60, '1', 'Hutchison Ch1 (history sections)'),
  ('tetanus', 'immunisation', 'Tetanus', ARRAY[]::text[], '{}'::jsonb, NULL, 10, '1', 'Hutchison Ch1 (history sections)'),
  ('hepatitis_b_vac', 'immunisation', 'Hepatitis B', ARRAY[]::text[], '{}'::jsonb, NULL, 20, '1', 'Hutchison Ch1 (history sections)'),
  ('covid19', 'immunisation', 'COVID-19', ARRAY[]::text[], '{}'::jsonb, NULL, 30, '1', 'Hutchison Ch1 (history sections)'),
  ('measles', 'immunisation', 'Measles', ARRAY[]::text[], '{}'::jsonb, NULL, 40, '1', 'Hutchison Ch1 (history sections)'),
  ('bcg', 'immunisation', 'BCG', ARRAY[]::text[], '{}'::jsonb, NULL, 50, '1', 'Hutchison Ch1 (history sections)'),
  ('hpv', 'immunisation', 'HPV', ARRAY[]::text[], '{}'::jsonb, NULL, 60, '1', 'Hutchison Ch1 (history sections)'),
  ('pneumococcal', 'immunisation', 'Pneumococcal', ARRAY[]::text[], '{}'::jsonb, NULL, 70, '1', 'Hutchison Ch1 (history sections)')
ON CONFLICT (code) DO NOTHING;
