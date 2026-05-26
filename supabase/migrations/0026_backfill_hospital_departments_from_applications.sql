-- Backfill `hospital_departments` rows for already-approved hospitals
-- whose application captured department picks but never materialised them.
--
-- Symptom: a clinician filling out /signup/clinical picks a hospital like
-- "Test Hospital-1" and the Department combobox is empty, because
-- listDepartments() reads from `hospital_departments` and the approve-
-- hospital-application Edge Function was never inserting into it.
--
-- This migration plugs the historical gap. The Edge Function is patched
-- in the same PR so new approvals materialise on the fly.
--
-- Idempotent: only inserts where a row with the same (hospital_id, slug)
-- isn't already present at parent_id IS NULL.

-- Code → label map. Mirror of app/signup/hospital/_catalog.ts. The
-- catalog comment notes it is the source of truth for what the form
-- offers; keep this CASE in sync whenever it grows.
WITH code_label(code, label) AS (
  VALUES
    ('INTERNAL_MEDICINE',         'Internal Medicine'),
    ('FAMILY_MEDICINE',           'Family Medicine'),
    ('GENERAL_SURGERY',           'General Surgery'),
    ('ORTHOPAEDICS',              'Orthopaedics'),
    ('UROLOGY',                   'Urology'),
    ('NEUROSURGERY',              'Neurosurgery'),
    ('CARDIOTHORACIC',            'Cardiothoracic'),
    ('PAEDIATRIC_SURGERY',        'Paediatric Surgery'),
    ('PLASTIC_RECONSTRUCTIVE',    'Plastic / Reconstructive'),
    ('ENT',                       'ENT'),
    ('MAXILLOFACIAL',             'Maxillofacial'),
    ('OBSTETRICS_GYNAECOLOGY',    'Obstetrics & Gynaecology'),
    ('PAEDIATRICS_CHILD_HEALTH',  'Paediatrics & Child Health'),
    ('NEONATOLOGY',               'Neonatology'),
    ('EMERGENCY',                 'Emergency / Casualty'),
    ('ANAESTHESIA',               'Anaesthesia'),
    ('INTENSIVE_CARE',            'Intensive Care (ICU/HDU)'),
    ('PSYCHIATRY',                'Psychiatry / Mental Health'),
    ('PHYSIOTHERAPY_REHAB',       'Physiotherapy & Rehabilitation'),
    ('PALLIATIVE_CARE',           'Palliative Care'),
    ('DENTAL_ORAL',               'Dental / Oral Health'),
    ('PUBLIC_HEALTH',             'Public / Community Health'),
    ('OPHTHALMOLOGY',             'Ophthalmology')
)
INSERT INTO public.hospital_departments (hospital_id, parent_id, name, slug)
SELECT
  app.approved_hospital_id   AS hospital_id,
  NULL                       AS parent_id,
  COALESCE(cl.label, initcap(replace(lower(had.department_family), '_', ' ')))
                             AS name,
  lower(replace(had.department_family, '_', '-'))
                             AS slug
FROM public.hospital_application_departments had
JOIN public.hospital_applications app
  ON app.id = had.application_id
LEFT JOIN code_label cl
  ON cl.code = had.department_family
WHERE app.approved_hospital_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.hospital_departments hd
    WHERE hd.hospital_id = app.approved_hospital_id
      AND hd.parent_id IS NULL
      AND hd.slug = lower(replace(had.department_family, '_', '-'))
  );
