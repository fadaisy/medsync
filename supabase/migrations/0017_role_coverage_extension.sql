-- ─────────────────────────────────────────────────────────────────────────
-- 0017_role_coverage_extension
--
-- Adds at least one role row for every cadre that the IM-only seed in
-- 0009 left empty. Clinical staff signup (GATE D) requires `role_id`
-- on the affiliation step — if a clinician picks a cadre with zero
-- seeded roles (e.g. SENIOR_CONSULTANT, RADIOGRAPHER, MIDWIFE), the
-- combobox shows "No matches." and the form can't be submitted.
--
-- Approach: seed a single generic, specialty-agnostic role per gap
-- cadre, named after the cadre itself. Specialty-specific roles can
-- be added in later migrations as the catalog expands; this just
-- unblocks signup for non-IM cadres.
--
-- Idempotent: ON CONFLICT (code) DO NOTHING. Re-running is a no-op.
--
-- Cadre IDs are looked up by `code` (not hardcoded UUIDs) so the
-- migration stays correct even if the underlying ID format shifts.
-- ─────────────────────────────────────────────────────────────────────────

-- department_family is NOT NULL on the roles table — use 'GENERAL' for
-- specialty-agnostic gap-fill rows.
INSERT INTO public.roles (id, cadre_id, specialty_id, code, name, department_family, sort_order)
SELECT gen_random_uuid(), c.id, NULL, v.code, v.name, 'GENERAL', v.sort_order
FROM (VALUES
  ('LAB_TECHNOLOGIST_GENERAL',  'LAB_TECHNOLOGIST',  'Laboratory Technologist',  10),
  ('RADIOGRAPHER_GENERAL',      'RADIOGRAPHER',      'Radiographer',             10),
  ('PHYSIOTHERAPIST_GENERAL',   'PHYSIOTHERAPIST',   'Physiotherapist',          10),
  ('OCC_THERAPIST_GENERAL',     'OCCUPATIONAL_THER', 'Occupational Therapist',   10),
  ('NUTRITIONIST_GENERAL',      'NUTRITIONIST',      'Nutritionist',             10),
  ('PHARMACY_TECH_GENERAL',     'PHARMACY_TECH',     'Pharmacy Technician',      10),
  ('DENTAL_OFFICER_GENERAL',    'DENTAL_OFFICER',    'Dental Officer',           10),
  ('DENTAL_SURGEON_GENERAL',    'DENTAL_SURGEON',    'Dental Surgeon',           10),
  ('MIDWIFE_GENERAL',           'MIDWIFE',           'Midwife',                  10)
) AS v(code, cadre_code, name, sort_order)
JOIN public.cadres c ON c.code = v.cadre_code
ON CONFLICT (code) DO NOTHING;

-- Senior Consultant gets one generic + a handful of common
-- specialty-flavoured options keyed by department_family.
-- specialty_id stays NULL (we'd need the matching specialty rows
-- to wire that up — out of scope for this gap-fill).
INSERT INTO public.roles (id, cadre_id, specialty_id, code, name, department_family, sort_order)
SELECT gen_random_uuid(), c.id, NULL, v.code, v.name, v.dept_family, v.sort_order
FROM (VALUES
  ('SR_CONSULTANT_GENERAL',     'Senior Consultant',                         'GENERAL',            10),
  ('SR_CONSULTANT_IM',          'Senior Consultant — Internal Medicine',     'INTERNAL_MEDICINE',  20),
  ('SR_CONSULTANT_SURGERY',     'Senior Consultant — Surgery',               'SURGERY',            30),
  ('SR_CONSULTANT_PAEDS',       'Senior Consultant — Paediatrics',           'PAEDIATRICS',        40),
  ('SR_CONSULTANT_OG',          'Senior Consultant — Obstetrics & Gynaecology', 'OBGYN',           50)
) AS v(code, name, dept_family, sort_order)
JOIN public.cadres c ON c.code = 'SENIOR_CONSULTANT'
ON CONFLICT (code) DO NOTHING;

-- Log the seed in reference_data_versions for the audit trail
-- expected by the kickoff (versioned reference data).
INSERT INTO public.reference_data_versions
  (dataset, source, source_url, version_date, row_count, notes)
VALUES (
  'roles',
  'MedSync internal — gap-fill for non-IM cadres',
  NULL,
  to_char(now(), 'YYYY-MM-DD'),
  14, -- 9 generic + 5 senior_consultant
  'Generic per-cadre role rows for cadres the IM-only seed (0009) left empty so clinical signup is usable across the catalog. Replace with specialty-aware roles as those specialties get seeded.'
)
ON CONFLICT DO NOTHING;
