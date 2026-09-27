-- 0076 — Clerking desk v2: medicine details, a hospital clinical-settings row, 17 finding tokens.
--
-- Per docs/emr/clerking-v2/gate-a-proposal.md (GATE A signed 2026-09-27: H1, H6, H10).
--
-- ADDITIVE. Nothing existing changes:
--   1. medication_statements: four nullable columns for what a patient says about a medicine
--      (H1). Doses are recorded as the patient or packet states them, encrypted like the drug text;
--      MedSync never suggests a dose here. The CHECK lists are the catalogue's option ids.
--        dose_text_ciphertext  AES-GCM, as stated
--        frequency_code        od | bd | tds | nocte | weekly | prn | unknown
--        adherence             as_prescribed | sometimes_misses | stopped
--        informant             patient | carer | medicine_card | referral_letter | dispensing_record
--      medication_source keeps its meaning (patient or carer → patient_reported; card, letter or
--      dispensing record → external_record).
--   2. hospital_clinical_settings: one row per hospital. outbreak_mode turns on the outbreak VHF
--      screen (D-CV-06); a reason is required to turn it on. Readable by the hospital's active
--      clinical staff; written only by the server (hospital-admin action), every change audited.
--   3. symptom_catalog: the 17 clerking-catalogue symptoms with no token yet (H10), added once to
--      the shared vocabulary, never a private copy. ros_screen stays false, so the v1 desk's
--      review-of-systems screen is unchanged. Re-runnable (ON CONFLICT DO NOTHING).
--
-- GATED: owner-applied (`npm run db:migrate`). Until it runs, CLERKING_V2 must stay off: the desk
-- writes the new medicine columns and reads the settings row.


-- ─── 1. medication_statements: what the patient says ───────────────
ALTER TABLE public.medication_statements
  ADD COLUMN IF NOT EXISTS dose_text_ciphertext text,
  ADD COLUMN IF NOT EXISTS frequency_code text,
  ADD COLUMN IF NOT EXISTS adherence text,
  ADD COLUMN IF NOT EXISTS informant text;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'medication_statements_frequency_code_check') THEN
    ALTER TABLE public.medication_statements ADD CONSTRAINT medication_statements_frequency_code_check
      CHECK (frequency_code IS NULL OR frequency_code IN ('od','bd','tds','nocte','weekly','prn','unknown'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'medication_statements_adherence_check') THEN
    ALTER TABLE public.medication_statements ADD CONSTRAINT medication_statements_adherence_check
      CHECK (adherence IS NULL OR adherence IN ('as_prescribed','sometimes_misses','stopped'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'medication_statements_informant_check') THEN
    ALTER TABLE public.medication_statements ADD CONSTRAINT medication_statements_informant_check
      CHECK (informant IS NULL OR informant IN ('patient','carer','medicine_card','referral_letter','dispensing_record'));
  END IF;
END $$;


-- ─── 2. hospital_clinical_settings ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.hospital_clinical_settings (
  hospital_id uuid PRIMARY KEY REFERENCES public.hospitals(id) ON DELETE CASCADE,
  outbreak_mode boolean NOT NULL DEFAULT false,
  outbreak_reason text,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT hcs_outbreak_reason CHECK (NOT outbreak_mode OR length(btrim(coalesce(outbreak_reason, ''))) > 0)
);

ALTER TABLE public.hospital_clinical_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hospital_clinical_settings FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hospital_clinical_settings_select_scoped ON public.hospital_clinical_settings;
CREATE POLICY hospital_clinical_settings_select_scoped ON public.hospital_clinical_settings
  FOR SELECT TO authenticated
  USING (public.user_has_role('superadmin') OR public.is_active_clinical_staff(hospital_id));
-- No INSERT/UPDATE/DELETE policy: clients never write it; the server does, as the owner role.

DROP TRIGGER IF EXISTS hospital_clinical_settings_updated_at ON public.hospital_clinical_settings;
CREATE TRIGGER hospital_clinical_settings_updated_at
  BEFORE UPDATE ON public.hospital_clinical_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS audit_hospital_clinical_settings ON public.hospital_clinical_settings;
CREATE TRIGGER audit_hospital_clinical_settings
  AFTER INSERT OR UPDATE OR DELETE ON public.hospital_clinical_settings
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes();

GRANT SELECT ON public.hospital_clinical_settings TO medsync_clinical_reader;


-- ─── 3. 17 finding tokens (H10) ────────────────────────────────────
INSERT INTO public.symptom_catalog (code, display, synonyms, system, sort_order, version, source, ros_screen) VALUES
  ('hiccups', 'Hiccups', ARRAY[]::text[], 'gastrointestinal', 3000, '4', 'MS-EMR-CLERK-CAT-001 1.0.0 (clerking v2)', false),
  ('noisy_breathing', 'Noisy breathing (stridor)', ARRAY[]::text[], 'respiratory', 3010, '4', 'MS-EMR-CLERK-CAT-001 1.0.0 (clerking v2)', false),
  ('snoring', 'Loud snoring or pauses in breathing', ARRAY[]::text[], 'respiratory', 3020, '4', 'MS-EMR-CLERK-CAT-001 1.0.0 (clerking v2)', false),
  ('constipation', 'Constipation', ARRAY['hard stools', 'not opening bowels']::text[], 'gastrointestinal', 3030, '4', 'MS-EMR-CLERK-CAT-001 1.0.0 (clerking v2)', false),
  ('urine_output_low', 'Passing less urine', ARRAY['reduced urine', 'oliguria']::text[], 'genitourinary', 3040, '4', 'MS-EMR-CLERK-CAT-001 1.0.0 (clerking v2)', false),
  ('loin_pain', 'Loin pain', ARRAY['flank pain', 'kidney pain']::text[], 'genitourinary', 3050, '4', 'MS-EMR-CLERK-CAT-001 1.0.0 (clerking v2)', false),
  ('genital_sore', 'Genital sore', ARRAY['genital ulcer']::text[], 'genitourinary', 3060, '4', 'MS-EMR-CLERK-CAT-001 1.0.0 (clerking v2)', false),
  ('scrotal', 'Scrotal pain or swelling', ARRAY['testicular pain']::text[], 'genitourinary', 3070, '4', 'MS-EMR-CLERK-CAT-001 1.0.0 (clerking v2)', false),
  ('pelvic_pain', 'Lower abdominal or pelvic pain', ARRAY[]::text[], 'genitourinary', 3080, '4', 'MS-EMR-CLERK-CAT-001 1.0.0 (clerking v2)', false),
  ('confusion', 'Confusion', ARRAY['disorientation', 'not making sense']::text[], 'neurological', 3090, '4', 'MS-EMR-CLERK-CAT-001 1.0.0 (clerking v2)', false),
  ('ear_pain', 'Ear pain or discharge', ARRAY['earache', 'ear discharge']::text[], 'ent_eyes', 3100, '4', 'MS-EMR-CLERK-CAT-001 1.0.0 (clerking v2)', false),
  ('mouth_ulcers', 'Mouth ulcers or sores', ARRAY[]::text[], 'ent_eyes', 3110, '4', 'MS-EMR-CLERK-CAT-001 1.0.0 (clerking v2)', false),
  ('neck_pain', 'Neck pain', ARRAY[]::text[], 'musculoskeletal', 3120, '4', 'MS-EMR-CLERK-CAT-001 1.0.0 (clerking v2)', false),
  ('bone_pain', 'Bone pain', ARRAY[]::text[], 'musculoskeletal', 3130, '4', 'MS-EMR-CLERK-CAT-001 1.0.0 (clerking v2)', false),
  ('face_swelling', 'Swelling of lips, tongue or face', ARRAY['angioedema', 'swollen lips']::text[], 'skin', 3140, '4', 'MS-EMR-CLERK-CAT-001 1.0.0 (clerking v2)', false),
  ('unusual_experiences', 'Hearing voices or unusual beliefs', ARRAY[]::text[], 'psychiatric', 3150, '4', 'MS-EMR-CLERK-CAT-001 1.0.0 (clerking v2)', false),
  ('self_harm_thoughts', 'Thoughts of self-harm', ARRAY[]::text[], 'psychiatric', 3160, '4', 'MS-EMR-CLERK-CAT-001 1.0.0 (clerking v2)', false)
ON CONFLICT (code) DO NOTHING;
