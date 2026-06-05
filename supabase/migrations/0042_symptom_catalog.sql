-- 0042 — Clerkship symptom-capture engine: catalogs + mapping + governance.
--
-- ⚠️ GATED — apply with explicit, named CSO/owner authorization (same posture as
-- 0040/0041). The catalogs + the symptom→property MAPPING are clinical-safety
-- reference data (the mapping encodes "what to ask"); CSO signs them.
--
-- Tap-first history capture (addendum: clerkship symptom engine). Versioned
-- reference data:
--   symptom_catalog          curated symptoms (+ synonyms, system)
--   symptom_property         qualifiers (SOCRATES + general) + value_type
--   symptom_property_option  each property's tappable value-set
--   symptom_property_map     relevance: which properties per symptom
--   catalog_proposals        governed contribution (clerkers propose; CSO/SA review)
--   encounter_symptom_observations  queryable projection of captured selections (PHI)
--
-- Per-encounter ad-hoc symptoms/properties live in the clerkship section_data —
-- they never mutate the shared catalog. Decision-support, not autonomous.

-- ─── catalog: symptoms ──────────────────────────────────────────────────
CREATE TABLE public.symptom_catalog (
  code text PRIMARY KEY,
  display text NOT NULL,
  synonyms text[] NOT NULL DEFAULT '{}',
  system text NOT NULL,
  snomed_concept text,
  icd10_hint text,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  version text NOT NULL,
  source text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX symptom_catalog_system_idx ON public.symptom_catalog (system, sort_order);

-- ─── catalog: properties ────────────────────────────────────────────────
CREATE TABLE public.symptom_property (
  code text PRIMARY KEY,
  display text NOT NULL,
  value_type text NOT NULL,
  unit text,
  common boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  version text NOT NULL,
  source text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT symptom_property_value_type_check CHECK (
    value_type IN ('single_select','multi_select','scale','duration','boolean','text')
  )
);

-- ─── catalog: a property's value-set ────────────────────────────────────
CREATE TABLE public.symptom_property_option (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_code text NOT NULL REFERENCES public.symptom_property(code) ON DELETE CASCADE,
  value text NOT NULL,
  display text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX symptom_property_option_unique ON public.symptom_property_option (property_code, value);

-- ─── mapping: relevance (symptom → properties) ──────────────────────────
CREATE TABLE public.symptom_property_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symptom_code text NOT NULL REFERENCES public.symptom_catalog(code) ON DELETE CASCADE,
  property_code text NOT NULL REFERENCES public.symptom_property(code) ON DELETE CASCADE,
  required boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX symptom_property_map_unique ON public.symptom_property_map (symptom_code, property_code);

-- ─── governed contribution: proposals ──────────────────────────────────
CREATE TABLE public.catalog_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposer_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  hospital_id uuid REFERENCES public.hospitals(id) ON DELETE SET NULL,
  kind text NOT NULL,
  payload jsonb NOT NULL,
  note text,
  status text NOT NULL DEFAULT 'pending',
  reviewer_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT catalog_proposal_kind_check CHECK (kind IN ('symptom','property','option','mapping')),
  CONSTRAINT catalog_proposal_status_check CHECK (status IN ('pending','approved','rejected','withdrawn'))
);
CREATE INDEX catalog_proposal_status_idx ON public.catalog_proposals (status, created_at);
CREATE INDEX catalog_proposal_proposer_idx ON public.catalog_proposals (proposer_user_id, created_at);

-- ─── queryable projection of captured selections (PHI) ──────────────────
CREATE TABLE public.encounter_symptom_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  encounter_id uuid NOT NULL REFERENCES public.encounters(id) ON DELETE CASCADE,
  patient_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  symptom_code text NOT NULL,
  symptom_display text NOT NULL,
  ad_hoc boolean NOT NULL DEFAULT false,
  property_code text,
  property_display text,
  value_type text,
  value_text text,
  value_num numeric,
  recorded_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX enc_symptom_obs_encounter_idx ON public.encounter_symptom_observations (encounter_id);
CREATE INDEX enc_symptom_obs_symptom_idx ON public.encounter_symptom_observations (symptom_code);
CREATE INDEX enc_symptom_obs_patient_idx ON public.encounter_symptom_observations (patient_user_id, created_at);

-- ─── RLS ────────────────────────────────────────────────────────────────
-- Catalog tables: non-PHI reference data — readable by any authenticated user;
-- no client write policy (seed + governed approval run service-role).
ALTER TABLE public.symptom_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.symptom_catalog FORCE ROW LEVEL SECURITY;
CREATE POLICY symptom_catalog_select_all ON public.symptom_catalog FOR SELECT TO authenticated USING (true);

ALTER TABLE public.symptom_property ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.symptom_property FORCE ROW LEVEL SECURITY;
CREATE POLICY symptom_property_select_all ON public.symptom_property FOR SELECT TO authenticated USING (true);

ALTER TABLE public.symptom_property_option ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.symptom_property_option FORCE ROW LEVEL SECURITY;
CREATE POLICY symptom_property_option_select_all ON public.symptom_property_option FOR SELECT TO authenticated USING (true);

ALTER TABLE public.symptom_property_map ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.symptom_property_map FORCE ROW LEVEL SECURITY;
CREATE POLICY symptom_property_map_select_all ON public.symptom_property_map FOR SELECT TO authenticated USING (true);

-- Proposals: the proposer sees their own; superadmin sees all (the reviewer).
ALTER TABLE public.catalog_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_proposals FORCE ROW LEVEL SECURITY;
CREATE POLICY catalog_proposals_select_scoped ON public.catalog_proposals
  FOR SELECT TO authenticated USING (
    proposer_user_id = auth.uid() OR public.user_has_role('superadmin')
  );

-- Symptom observations: PHI — patient / superadmin / legitimate relationship.
ALTER TABLE public.encounter_symptom_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.encounter_symptom_observations FORCE ROW LEVEL SECURITY;
CREATE POLICY enc_symptom_obs_select_scoped ON public.encounter_symptom_observations
  FOR SELECT TO authenticated USING (
    patient_user_id = auth.uid() OR public.user_has_role('superadmin')
    OR public.has_clinical_relationship(patient_user_id)
  );

-- ─── SEED — Internal-Medicine-first (CSO-reviewed). Hutchison + SOCRATES. ──
-- Properties (common ones apply to every symptom).
INSERT INTO public.symptom_property (code, display, value_type, unit, common, sort_order, version, source) VALUES
  ('onset',               'Onset',                 'single_select', NULL, true,  10, '1', 'Hutchison clerking / SOCRATES'),
  ('duration',            'Duration',              'duration',      NULL, true,  20, '1', 'Hutchison clerking'),
  ('progression',         'Progression',           'single_select', NULL, true,  30, '1', 'Hutchison clerking'),
  ('severity',            'Severity',              'scale',         '/10', false, 40, '1', 'SOCRATES'),
  ('site',                'Site',                  'single_select', NULL, false, 50, '1', 'SOCRATES'),
  ('character',           'Character',             'single_select', NULL, false, 60, '1', 'SOCRATES'),
  ('radiation',           'Radiation',             'multi_select',  NULL, false, 70, '1', 'SOCRATES'),
  ('timing',              'Timing / pattern',      'single_select', NULL, false, 80, '1', 'SOCRATES'),
  ('frequency',           'Frequency',             'single_select', NULL, false, 90, '1', 'Hutchison clerking'),
  ('exacerbating',        'Exacerbating factors',  'multi_select',  NULL, false, 100, '1', 'SOCRATES'),
  ('relieving',           'Relieving factors',     'multi_select',  NULL, false, 110, '1', 'SOCRATES'),
  ('associated_symptoms', 'Associated symptoms',   'multi_select',  NULL, false, 120, '1', 'SOCRATES'),
  ('laterality',          'Laterality',            'single_select', NULL, false, 130, '1', 'Hutchison clerking'),
  ('prior_episodes',      'Prior similar episodes','boolean',       NULL, false, 140, '1', 'Hutchison clerking'),
  ('productive',          'Productive',            'boolean',       NULL, false, 150, '1', 'Respiratory history'),
  ('sputum_colour',       'Sputum colour',         'single_select', NULL, false, 160, '1', 'Respiratory history'),
  ('haemoptysis',         'Blood in sputum',       'boolean',       NULL, false, 170, '1', 'Respiratory history'),
  ('fever_pattern',       'Fever pattern',         'single_select', NULL, false, 180, '1', 'Infectious history'),
  ('rigors',              'Rigors / chills',       'boolean',       NULL, false, 190, '1', 'Infectious history'),
  ('travel',             'Recent travel',         'boolean',       NULL, false, 200, '1', 'Infectious history')
ON CONFLICT (code) DO NOTHING;

-- Value-set options for the select properties.
INSERT INTO public.symptom_property_option (property_code, value, display, sort_order) VALUES
  ('onset','sudden','Sudden',10),('onset','gradual','Gradual',20),
  ('progression','improving','Improving',10),('progression','worsening','Worsening',20),('progression','fluctuating','Fluctuating',30),('progression','stable','Stable',40),
  ('site','central_chest','Central chest',10),('site','left_chest','Left chest',20),('site','right_chest','Right chest',30),('site','epigastrium','Epigastrium',40),('site','ruq','Right upper quadrant',50),('site','luq','Left upper quadrant',60),('site','rlq','Right lower quadrant',70),('site','llq','Left lower quadrant',80),('site','periumbilical','Periumbilical',90),('site','suprapubic','Suprapubic',100),('site','head','Head',110),('site','generalised','Generalised',120),
  ('character','dull','Dull',10),('character','sharp','Sharp',20),('character','crushing','Crushing',30),('character','burning','Burning',40),('character','colicky','Colicky',50),('character','stabbing','Stabbing',60),('character','aching','Aching',70),('character','pressure','Pressure',80),('character','throbbing','Throbbing',90),
  ('radiation','left_arm','Left arm',10),('radiation','right_arm','Right arm',20),('radiation','jaw','Jaw',30),('radiation','neck','Neck',40),('radiation','back','Back',50),('radiation','shoulder','Shoulder',60),('radiation','none','No radiation',70),
  ('timing','constant','Constant',10),('timing','intermittent','Intermittent',20),('timing','episodic','Episodic',30),('timing','nocturnal','Nocturnal',40),('timing','exertional','On exertion',50),
  ('frequency','constant','Constant',10),('frequency','daily','Daily',20),('frequency','intermittent','Intermittent',30),('frequency','occasional','Occasional',40),
  ('exacerbating','exertion','Exertion',10),('exacerbating','inspiration','Deep breathing',20),('exacerbating','movement','Movement',30),('exacerbating','food','Food',40),('exacerbating','lying_flat','Lying flat',50),('exacerbating','coughing','Coughing',60),('exacerbating','stress','Stress',70),('exacerbating','cold','Cold',80),
  ('relieving','rest','Rest',10),('relieving','sitting_forward','Sitting forward',20),('relieving','nitrates','Nitrates (GTN)',30),('relieving','antacids','Antacids',40),('relieving','analgesia','Analgesia',50),('relieving','food','Food',60),
  ('associated_symptoms','sweating','Sweating',10),('associated_symptoms','nausea','Nausea',20),('associated_symptoms','vomiting','Vomiting',30),('associated_symptoms','breathlessness','Breathlessness',40),('associated_symptoms','palpitations','Palpitations',50),('associated_symptoms','dizziness','Dizziness',60),('associated_symptoms','fever','Fever',70),('associated_symptoms','weight_loss','Weight loss',80),('associated_symptoms','cough','Cough',90),
  ('laterality','left','Left',10),('laterality','right','Right',20),('laterality','bilateral','Bilateral',30),('laterality','central','Central',40),
  ('sputum_colour','clear','Clear',10),('sputum_colour','white','White',20),('sputum_colour','yellow','Yellow',30),('sputum_colour','green','Green',40),('sputum_colour','rust','Rust-coloured',50),('sputum_colour','blood_stained','Blood-stained',60),
  ('fever_pattern','continuous','Continuous',10),('fever_pattern','intermittent','Intermittent',20),('fever_pattern','remittent','Remittent',30),('fever_pattern','relapsing','Relapsing',40)
ON CONFLICT (property_code, value) DO NOTHING;

-- Symptoms (Internal-Medicine-first).
INSERT INTO public.symptom_catalog (code, display, synonyms, system, sort_order, version, source) VALUES
  ('chest_pain',     'Chest pain',            ARRAY['chest discomfort','chest tightness'], 'cardiovascular',   10, '1', 'Hutchison'),
  ('dyspnoea',       'Breathlessness',        ARRAY['shortness of breath','SOB','dyspnea','breathless'], 'respiratory', 20, '1', 'Hutchison'),
  ('cough',          'Cough',                 ARRAY[]::text[], 'respiratory', 30, '1', 'Hutchison'),
  ('palpitations',   'Palpitations',          ARRAY['racing heart','fluttering','heart pounding'], 'cardiovascular', 40, '1', 'Hutchison'),
  ('oedema',         'Leg swelling',          ARRAY['ankle swelling','oedema','edema','swollen legs'], 'cardiovascular', 50, '1', 'Hutchison'),
  ('abdominal_pain', 'Abdominal pain',        ARRAY['tummy pain','stomach pain','belly pain'], 'gastrointestinal', 60, '1', 'Hutchison'),
  ('headache',       'Headache',              ARRAY[]::text[], 'neurological', 70, '1', 'Hutchison'),
  ('fever',          'Fever',                 ARRAY['high temperature','pyrexia','hot body'], 'general', 80, '1', 'Hutchison'),
  ('weight_loss',    'Weight loss',           ARRAY['losing weight'], 'general', 90, '1', 'Hutchison'),
  ('dizziness',      'Dizziness',             ARRAY['lightheadedness','vertigo','giddiness'], 'neurological', 100, '1', 'Hutchison'),
  ('vomiting',       'Vomiting',              ARRAY['throwing up','emesis'], 'gastrointestinal', 110, '1', 'Hutchison'),
  ('diarrhoea',      'Diarrhoea',             ARRAY['loose stools','diarrhea','watery stool'], 'gastrointestinal', 120, '1', 'Hutchison'),
  ('fatigue',        'Fatigue',               ARRAY['tiredness','lethargy','weakness'], 'general', 130, '1', 'Hutchison'),
  ('syncope',        'Blackout / fainting',   ARRAY['fainting','collapse','passed out'], 'cardiovascular', 140, '1', 'Hutchison'),
  ('haemoptysis',    'Coughing up blood',     ARRAY['haemoptysis','blood in cough'], 'respiratory', 150, '1', 'Hutchison'),
  ('jaundice',       'Yellow eyes / skin',    ARRAY['jaundice','yellowing'], 'gastrointestinal', 160, '1', 'Hutchison')
ON CONFLICT (code) DO NOTHING;

-- Relevance mapping (symptom-specific properties; the 3 common ones auto-apply).
INSERT INTO public.symptom_property_map (symptom_code, property_code, required, sort_order) VALUES
  ('chest_pain','site',true,10),('chest_pain','character',true,20),('chest_pain','radiation',false,30),('chest_pain','severity',false,40),('chest_pain','exacerbating',false,50),('chest_pain','relieving',false,60),('chest_pain','associated_symptoms',false,70),
  ('dyspnoea','severity',false,10),('dyspnoea','timing',false,20),('dyspnoea','exacerbating',false,30),('dyspnoea','relieving',false,40),('dyspnoea','associated_symptoms',false,50),
  ('cough','productive',true,10),('cough','sputum_colour',false,20),('cough','haemoptysis',false,30),('cough','timing',false,40),('cough','associated_symptoms',false,50),
  ('palpitations','timing',false,10),('palpitations','frequency',false,20),('palpitations','exacerbating',false,30),('palpitations','associated_symptoms',false,40),
  ('oedema','laterality',true,10),('oedema','severity',false,20),('oedema','timing',false,30),('oedema','associated_symptoms',false,40),
  ('abdominal_pain','site',true,10),('abdominal_pain','character',true,20),('abdominal_pain','radiation',false,30),('abdominal_pain','severity',false,40),('abdominal_pain','exacerbating',false,50),('abdominal_pain','relieving',false,60),('abdominal_pain','associated_symptoms',false,70),
  ('headache','site',false,10),('headache','character',false,20),('headache','severity',false,30),('headache','timing',false,40),('headache','exacerbating',false,50),('headache','associated_symptoms',false,60),
  ('fever','fever_pattern',false,10),('fever','rigors',false,20),('fever','travel',false,30),('fever','associated_symptoms',false,40),
  ('weight_loss','associated_symptoms',false,10),
  ('dizziness','timing',false,10),('dizziness','exacerbating',false,20),('dizziness','associated_symptoms',false,30),
  ('vomiting','frequency',false,10),('vomiting','associated_symptoms',false,20),
  ('diarrhoea','frequency',false,10),('diarrhoea','travel',false,20),('diarrhoea','associated_symptoms',false,30),
  ('fatigue','severity',false,10),('fatigue','associated_symptoms',false,20),
  ('syncope','exacerbating',false,10),('syncope','prior_episodes',false,20),('syncope','associated_symptoms',false,30),
  ('haemoptysis','severity',false,10),('haemoptysis','associated_symptoms',false,20),
  ('jaundice','associated_symptoms',false,10)
ON CONFLICT (symptom_code, property_code) DO NOTHING;
