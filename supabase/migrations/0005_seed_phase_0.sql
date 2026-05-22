-- 0005 — Phase 0.11 seed.
-- Mulago National Referral Hospital + Internal Medicine department + the 13
-- IM sub-specialties per the kickoff (Cardiology, Nephrology, Endocrinology/
-- Diabetology, Pulmonology, Gastroenterology, Hepatology, Neurology,
-- Infectious Diseases, Oncology, Haematology, Rheumatology, Dermatology,
-- Geriatrics).
--
-- Idempotent — every INSERT uses ON CONFLICT DO NOTHING on the natural key
-- (slug for hospital; (hospital_id, parent_id, slug) for departments). The
-- migration journal also gates re-application, so this would normally only
-- run once; the ON CONFLICT clauses are belt-and-braces for anyone running
-- it via direct SQL.

INSERT INTO public.hospitals (id, name, slug, country, region, district, level)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Mulago National Referral Hospital',
  'mulago-national',
  'UG',
  'Central',
  'Kampala',
  'national_referral'
)
ON CONFLICT (slug) DO NOTHING;

-- Top-level Internal Medicine department.
INSERT INTO public.hospital_departments (id, hospital_id, parent_id, name, slug)
VALUES (
  '00000000-0000-0000-0000-000000000010',
  '00000000-0000-0000-0000-000000000001',
  NULL,
  'Internal Medicine',
  'internal-medicine'
)
ON CONFLICT (hospital_id, parent_id, slug) DO NOTHING;

-- 13 sub-specialties under Internal Medicine.
-- Fixed UUIDs (00000000-0000-0000-0000-0000000000Nx where N is the sub-num)
-- so re-running stays idempotent and FKs from later phases can rely on them.
INSERT INTO public.hospital_departments (id, hospital_id, parent_id, name, slug)
VALUES
  ('00000000-0000-0000-0000-000000000020', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', 'Cardiology',                  'cardiology'),
  ('00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', 'Nephrology',                  'nephrology'),
  ('00000000-0000-0000-0000-000000000022', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', 'Endocrinology / Diabetology', 'endocrinology-diabetology'),
  ('00000000-0000-0000-0000-000000000023', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', 'Pulmonology',                 'pulmonology'),
  ('00000000-0000-0000-0000-000000000024', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', 'Gastroenterology',            'gastroenterology'),
  ('00000000-0000-0000-0000-000000000025', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', 'Hepatology',                  'hepatology'),
  ('00000000-0000-0000-0000-000000000026', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', 'Neurology',                   'neurology'),
  ('00000000-0000-0000-0000-000000000027', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', 'Infectious Diseases',         'infectious-diseases'),
  ('00000000-0000-0000-0000-000000000028', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', 'Oncology',                    'oncology'),
  ('00000000-0000-0000-0000-000000000029', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', 'Haematology',                 'haematology'),
  ('00000000-0000-0000-0000-00000000002a', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', 'Rheumatology',                'rheumatology'),
  ('00000000-0000-0000-0000-00000000002b', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', 'Dermatology',                 'dermatology'),
  ('00000000-0000-0000-0000-00000000002c', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000010', 'Geriatrics',                  'geriatrics')
ON CONFLICT (hospital_id, parent_id, slug) DO NOTHING;
