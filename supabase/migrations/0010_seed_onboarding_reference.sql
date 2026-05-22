-- 0010 — Seed onboarding reference data (Phase 1, GATE A).
--
-- Scope confirmed by founder:
--   - Councils: full national catalog (4 regulators)
--   - Cadres: full national catalog (every ladder, every council)
--   - Specialties: Internal Medicine + 13 IM sub-specialties (Phase 0.11 match)
--   - Roles: IM-scoped (matches Phase 0.11 hospital_departments seed)
--   - Regions: 4 Uganda regions
--   - Districts/subcounties: placeholder — UBOS NPHC 2024 framework pull
--     deferred to a follow-up migration (see GATE G reference-data-to-source).
--
-- UUID convention (all lowercase hex, never letters outside a-f):
--   councils:    00000000-0000-0000-0000-0000000000c1 … c4
--   cadres:      00000000-0000-0000-0000-000000000d01 … d2x
--   specialties: 00000000-0000-0000-0000-000000000f00 … f0d
--   roles:       00000000-0000-0000-0000-000000000e01 … e60
--   regions:     00000000-0000-0000-0000-0000000000a1 … a4
--
-- All INSERTs are idempotent via ON CONFLICT.

-- ─── Reference data versions ────────────────────────────────────────────
INSERT INTO public.ref_data_versions (dataset, source, source_url, version_date, row_count, notes)
VALUES
  ('ug_councils',
   'Uganda regulatory body websites + MoH HRH Strategic Plan 2020–2030',
   NULL, '2026-05-22', 4,
   'UMDPC, UNMC, AHPC confirmed. PSU (Pharmaceutical Society of Uganda) flagged — confirm against the official pharmacy regulator.'),
  ('ug_cadres',
   'Ministry of Public Service scheme of service + MoH HRH Strategic Plan 2020–2030',
   NULL, '2026-05-22', NULL,
   'Full national cadre catalog, council-linked.'),
  ('ug_specialties_im',
   'Phase 0.11 hospital_departments seed — Internal Medicine + 13 sub-specialties',
   NULL, '2026-05-22', 14,
   'IM-only this gate. New rows added as MedSync onboards new departments.'),
  ('ug_roles_im',
   'Derived from MoH Schemes of Service + Phase 0.11 IM seed',
   NULL, '2026-05-22', NULL,
   'IM-scoped role catalog per GATE A scope decision.'),
  ('ug_regions',
   'Uganda statistical regions — stable historical fact (UBOS)',
   NULL, '2026-05-22', 4,
   'Not subject to UBOS dataset versioning.'),
  ('ug_districts',
   'UBOS NPHC 2024 framework — 135 districts + 11 cities (PLACEHOLDER)',
   NULL, '2026-05-22', 0,
   'PLACEHOLDER — full district + subcounty dataset to be pulled from UBOS NPHC 2024 source and seeded in a follow-up migration. See reference-data-to-source list (GATE G).')
ON CONFLICT (dataset, version_date) DO NOTHING;

-- ─── Councils ───────────────────────────────────────────────────────────
INSERT INTO public.ref_councils (id, code, name, short_name, description) VALUES
  ('00000000-0000-0000-0000-0000000000c1', 'UMDPC',
   'Uganda Medical and Dental Practitioners Council', 'UMDPC',
   'Regulates doctors and dentists.'),
  ('00000000-0000-0000-0000-0000000000c2', 'UNMC',
   'Uganda Nurses and Midwives Council', 'UNMC',
   'Regulates nurses and midwives.'),
  ('00000000-0000-0000-0000-0000000000c3', 'AHPC',
   'Allied Health Professionals Council', 'AHPC',
   'Regulates clinical officers, laboratory, radiography, physiotherapy, and other allied disciplines.'),
  ('00000000-0000-0000-0000-0000000000c4', 'PSU',
   'Pharmaceutical Society of Uganda', 'PSU',
   'PLACEHOLDER — confirm official pharmacy regulator (Pharmacy Council / PSU).')
ON CONFLICT (code) DO NOTHING;

-- ─── Cadres ─────────────────────────────────────────────────────────────
INSERT INTO public.ref_cadres (id, council_id, code, name, sort_order) VALUES
  -- UMDPC — Medical
  ('00000000-0000-0000-0000-000000000d01', '00000000-0000-0000-0000-0000000000c1',
   'INTERN_DOCTOR', 'Intern Doctor', 10),
  ('00000000-0000-0000-0000-000000000d02', '00000000-0000-0000-0000-0000000000c1',
   'MEDICAL_OFFICER', 'Medical Officer', 20),
  ('00000000-0000-0000-0000-000000000d03', '00000000-0000-0000-0000-0000000000c1',
   'MEDICAL_OFFICER_SG', 'Medical Officer (Special Grade)', 30),
  ('00000000-0000-0000-0000-000000000d04', '00000000-0000-0000-0000-0000000000c1',
   'SENIOR_CONSULTANT', 'Senior Consultant', 50),
  ('00000000-0000-0000-0000-000000000d05', '00000000-0000-0000-0000-0000000000c1',
   'CONSULTANT', 'Consultant', 40),
  -- UMDPC — Dental
  ('00000000-0000-0000-0000-000000000d06', '00000000-0000-0000-0000-0000000000c1',
   'DENTAL_SURGEON', 'Dental Surgeon', 20),

  -- UNMC — Nursing & Midwifery
  ('00000000-0000-0000-0000-000000000d10', '00000000-0000-0000-0000-0000000000c2',
   'ENROLLED_NURSE', 'Enrolled Nurse', 10),
  ('00000000-0000-0000-0000-000000000d11', '00000000-0000-0000-0000-0000000000c2',
   'REGISTERED_NURSE', 'Registered Nurse', 20),
  ('00000000-0000-0000-0000-000000000d12', '00000000-0000-0000-0000-0000000000c2',
   'SPECIALIST_NURSE', 'Specialist Nurse', 30),
  ('00000000-0000-0000-0000-000000000d13', '00000000-0000-0000-0000-0000000000c2',
   'NURSING_OFFICER', 'Nursing Officer', 25),
  ('00000000-0000-0000-0000-000000000d14', '00000000-0000-0000-0000-0000000000c2',
   'SENIOR_NURSING_OFFICER', 'Senior Nursing Officer', 40),
  ('00000000-0000-0000-0000-000000000d15', '00000000-0000-0000-0000-0000000000c2',
   'ENROLLED_MIDWIFE', 'Enrolled Midwife', 10),
  ('00000000-0000-0000-0000-000000000d16', '00000000-0000-0000-0000-0000000000c2',
   'REGISTERED_MIDWIFE', 'Registered Midwife', 20),

  -- AHPC — Allied health
  ('00000000-0000-0000-0000-000000000d20', '00000000-0000-0000-0000-0000000000c3',
   'CLINICAL_OFFICER', 'Clinical Officer', 10),
  ('00000000-0000-0000-0000-000000000d21', '00000000-0000-0000-0000-0000000000c3',
   'SENIOR_CLINICAL_OFFICER', 'Senior Clinical Officer', 20),
  ('00000000-0000-0000-0000-000000000d22', '00000000-0000-0000-0000-0000000000c3',
   'LABORATORY_TECHNICIAN', 'Laboratory Technician', 10),
  ('00000000-0000-0000-0000-000000000d23', '00000000-0000-0000-0000-0000000000c3',
   'LABORATORY_TECHNOLOGIST', 'Laboratory Technologist', 20),
  ('00000000-0000-0000-0000-000000000d24', '00000000-0000-0000-0000-0000000000c3',
   'RADIOGRAPHER', 'Radiographer', 20),
  ('00000000-0000-0000-0000-000000000d25', '00000000-0000-0000-0000-0000000000c3',
   'PHYSIOTHERAPIST', 'Physiotherapist', 20),
  ('00000000-0000-0000-0000-000000000d26', '00000000-0000-0000-0000-0000000000c3',
   'OCCUPATIONAL_THERAPIST', 'Occupational Therapist', 20),
  ('00000000-0000-0000-0000-000000000d27', '00000000-0000-0000-0000-0000000000c3',
   'ANAESTHETIC_OFFICER', 'Anaesthetic Officer', 20),
  ('00000000-0000-0000-0000-000000000d28', '00000000-0000-0000-0000-0000000000c3',
   'PUBLIC_HEALTH_OFFICER', 'Public Health Officer', 20),

  -- PSU — Pharmacy
  ('00000000-0000-0000-0000-000000000d30', '00000000-0000-0000-0000-0000000000c4',
   'PHARMACY_TECHNICIAN', 'Pharmacy Technician', 10),
  ('00000000-0000-0000-0000-000000000d31', '00000000-0000-0000-0000-0000000000c4',
   'PHARMACIST', 'Pharmacist', 20),
  ('00000000-0000-0000-0000-000000000d32', '00000000-0000-0000-0000-0000000000c4',
   'SENIOR_PHARMACIST', 'Senior Pharmacist', 30)
ON CONFLICT (code) DO NOTHING;

-- ─── Specialties (Internal Medicine + 13 sub-specialties) ──────────────
INSERT INTO public.ref_specialties (id, code, name, parent_id) VALUES
  ('00000000-0000-0000-0000-000000000f00', 'internal-medicine', 'Internal Medicine', NULL),
  ('00000000-0000-0000-0000-000000000f01', 'im-cardiology', 'Cardiology',
   '00000000-0000-0000-0000-000000000f00'),
  ('00000000-0000-0000-0000-000000000f02', 'im-nephrology', 'Nephrology',
   '00000000-0000-0000-0000-000000000f00'),
  ('00000000-0000-0000-0000-000000000f03', 'im-endocrinology', 'Endocrinology / Diabetology',
   '00000000-0000-0000-0000-000000000f00'),
  ('00000000-0000-0000-0000-000000000f04', 'im-pulmonology', 'Pulmonology',
   '00000000-0000-0000-0000-000000000f00'),
  ('00000000-0000-0000-0000-000000000f05', 'im-gastroenterology', 'Gastroenterology',
   '00000000-0000-0000-0000-000000000f00'),
  ('00000000-0000-0000-0000-000000000f06', 'im-hepatology', 'Hepatology',
   '00000000-0000-0000-0000-000000000f00'),
  ('00000000-0000-0000-0000-000000000f07', 'im-neurology', 'Neurology',
   '00000000-0000-0000-0000-000000000f00'),
  ('00000000-0000-0000-0000-000000000f08', 'im-infectious-diseases', 'Infectious Diseases',
   '00000000-0000-0000-0000-000000000f00'),
  ('00000000-0000-0000-0000-000000000f09', 'im-oncology', 'Oncology',
   '00000000-0000-0000-0000-000000000f00'),
  ('00000000-0000-0000-0000-000000000f0a', 'im-haematology', 'Haematology',
   '00000000-0000-0000-0000-000000000f00'),
  ('00000000-0000-0000-0000-000000000f0b', 'im-rheumatology', 'Rheumatology',
   '00000000-0000-0000-0000-000000000f00'),
  ('00000000-0000-0000-0000-000000000f0c', 'im-dermatology', 'Dermatology',
   '00000000-0000-0000-0000-000000000f00'),
  ('00000000-0000-0000-0000-000000000f0d', 'im-geriatrics', 'Geriatrics',
   '00000000-0000-0000-0000-000000000f00')
ON CONFLICT (code) DO NOTHING;

-- ─── Roles (IM-scoped) ─────────────────────────────────────────────────
INSERT INTO public.ref_roles (id, cadre_id, specialty_id, code, name, department_family, sort_order)
VALUES
  -- Doctors — IM generalist
  ('00000000-0000-0000-0000-000000000e01', '00000000-0000-0000-0000-000000000d01',
   '00000000-0000-0000-0000-000000000f00',
   'INTERN_DOCTOR_IM', 'Intern Doctor — Internal Medicine', 'internal-medicine', 10),
  ('00000000-0000-0000-0000-000000000e02', '00000000-0000-0000-0000-000000000d02',
   '00000000-0000-0000-0000-000000000f00',
   'MO_IM', 'Medical Officer — Internal Medicine', 'internal-medicine', 20),
  ('00000000-0000-0000-0000-000000000e03', '00000000-0000-0000-0000-000000000d05',
   '00000000-0000-0000-0000-000000000f00',
   'CONSULTANT_IM', 'Consultant Physician — Internal Medicine', 'internal-medicine', 30),

  -- Doctors — sub-specialty consultants
  ('00000000-0000-0000-0000-000000000e10', '00000000-0000-0000-0000-000000000d05',
   '00000000-0000-0000-0000-000000000f01',
   'CONSULTANT_CARDIOLOGY', 'Consultant — Cardiology', 'internal-medicine', 40),
  ('00000000-0000-0000-0000-000000000e11', '00000000-0000-0000-0000-000000000d05',
   '00000000-0000-0000-0000-000000000f02',
   'CONSULTANT_NEPHROLOGY', 'Consultant — Nephrology', 'internal-medicine', 40),
  ('00000000-0000-0000-0000-000000000e12', '00000000-0000-0000-0000-000000000d05',
   '00000000-0000-0000-0000-000000000f03',
   'CONSULTANT_ENDOCRINOLOGY', 'Consultant — Endocrinology / Diabetology', 'internal-medicine', 40),
  ('00000000-0000-0000-0000-000000000e13', '00000000-0000-0000-0000-000000000d05',
   '00000000-0000-0000-0000-000000000f04',
   'CONSULTANT_PULMONOLOGY', 'Consultant — Pulmonology', 'internal-medicine', 40),
  ('00000000-0000-0000-0000-000000000e14', '00000000-0000-0000-0000-000000000d05',
   '00000000-0000-0000-0000-000000000f07',
   'CONSULTANT_NEUROLOGY', 'Consultant — Neurology', 'internal-medicine', 40),
  ('00000000-0000-0000-0000-000000000e15', '00000000-0000-0000-0000-000000000d05',
   '00000000-0000-0000-0000-000000000f08',
   'CONSULTANT_INFECTIOUS_DISEASES', 'Consultant — Infectious Diseases', 'internal-medicine', 40),
  ('00000000-0000-0000-0000-000000000e16', '00000000-0000-0000-0000-000000000d05',
   '00000000-0000-0000-0000-000000000f09',
   'CONSULTANT_ONCOLOGY', 'Consultant — Oncology', 'internal-medicine', 40),

  -- HOD
  ('00000000-0000-0000-0000-000000000e20', '00000000-0000-0000-0000-000000000d04',
   '00000000-0000-0000-0000-000000000f00',
   'HOD_IM', 'Head of Department — Internal Medicine', 'internal-medicine', 50),

  -- Nurses on IM ward
  ('00000000-0000-0000-0000-000000000e30', '00000000-0000-0000-0000-000000000d11',
   '00000000-0000-0000-0000-000000000f00',
   'REGISTERED_NURSE_IM', 'Registered Nurse — IM ward', 'internal-medicine', 20),
  ('00000000-0000-0000-0000-000000000e31', '00000000-0000-0000-0000-000000000d13',
   '00000000-0000-0000-0000-000000000f00',
   'NURSING_OFFICER_IM', 'Nursing Officer — IM ward', 'internal-medicine', 25),
  ('00000000-0000-0000-0000-000000000e32', '00000000-0000-0000-0000-000000000d14',
   '00000000-0000-0000-0000-000000000f00',
   'NURSE_IN_CHARGE_IM', 'Nurse-in-Charge — IM ward', 'internal-medicine', 30),
  ('00000000-0000-0000-0000-000000000e33', '00000000-0000-0000-0000-000000000d12',
   '00000000-0000-0000-0000-000000000f01',
   'SPECIALIST_NURSE_CARDIOLOGY', 'Specialist Nurse — Cardiology', 'internal-medicine', 35),

  -- Pharmacy
  ('00000000-0000-0000-0000-000000000e40', '00000000-0000-0000-0000-000000000d31',
   '00000000-0000-0000-0000-000000000f00',
   'PHARMACIST_IM', 'Pharmacist — IM', 'internal-medicine', 20),
  ('00000000-0000-0000-0000-000000000e41', '00000000-0000-0000-0000-000000000d30',
   '00000000-0000-0000-0000-000000000f00',
   'PHARMACY_TECH_IM', 'Pharmacy Technician — IM', 'internal-medicine', 10),

  -- Allied health on IM
  ('00000000-0000-0000-0000-000000000e50', '00000000-0000-0000-0000-000000000d23',
   NULL, 'LAB_TECHNOLOGIST_IM', 'Laboratory Technologist — IM workups',
   'internal-medicine', 20),
  ('00000000-0000-0000-0000-000000000e51', '00000000-0000-0000-0000-000000000d24',
   NULL, 'RADIOGRAPHER_IM', 'Radiographer — IM imaging',
   'internal-medicine', 20),
  ('00000000-0000-0000-0000-000000000e52', '00000000-0000-0000-0000-000000000d25',
   NULL, 'PHYSIO_IM', 'Physiotherapist — IM rehab',
   'internal-medicine', 20),

  -- Clinical Officer on IM
  ('00000000-0000-0000-0000-000000000e60', '00000000-0000-0000-0000-000000000d20',
   '00000000-0000-0000-0000-000000000f00',
   'CLINICAL_OFFICER_IM', 'Clinical Officer — IM', 'internal-medicine', 15)
ON CONFLICT (code) DO NOTHING;

-- ─── Regions ────────────────────────────────────────────────────────────
INSERT INTO public.ref_regions (id, code, name) VALUES
  ('00000000-0000-0000-0000-0000000000a1', 'CENTRAL',  'Central'),
  ('00000000-0000-0000-0000-0000000000a2', 'EASTERN',  'Eastern'),
  ('00000000-0000-0000-0000-0000000000a3', 'NORTHERN', 'Northern'),
  ('00000000-0000-0000-0000-0000000000a4', 'WESTERN',  'Western')
ON CONFLICT (code) DO NOTHING;

-- Districts + subcounties intentionally NOT seeded — UBOS NPHC 2024
-- framework pull is on the GATE G reference-data-to-source list.
