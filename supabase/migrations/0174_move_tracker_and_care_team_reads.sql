-- 0174 — Steps and workouts on the patient's own log, and the care team can read it (Tide v1, ADR 0354).
--
-- 1. personal_health_logs takes two more kinds:
--    'steps'    numeric_value_1 = the day's step count so far; the latest row of a day is that day's total
--               (append-only, like 'water'); unit = the source: 'phone', 'apple_health' or 'health_connect'.
--    'exercise' numeric_value_1 = minutes, numeric_value_2 = estimated kcal (2024 Compendium MET × the
--               patient's latest weight × hours, or null with no weight); unit = the activity code
--               (e.g. 'walk_brisk'); note = optional words.
-- 2. The care team reads what the patient logs (owner decision, 18 Oct 2026): anyone with a clinical
--    relationship to the patient (public.has_clinical_relationship, the same test the clinical record
--    uses) may SELECT the patient's active rows. Writes stay the patient's own.
--
-- ADDITIVE and re-runnable. Owner-applied (`npm run db:migrate`).
-- Reverse: DROP POLICY personal_health_logs_select_care_team; restore 0170's kind check after deleting
-- rows of the two new kinds.

ALTER TABLE public.personal_health_logs DROP CONSTRAINT IF EXISTS personal_health_logs_kind_check;
ALTER TABLE public.personal_health_logs ADD CONSTRAINT personal_health_logs_kind_check CHECK (
  kind IN ('glucose','bp','weight','spo2','temperature','symptom','note','other',
           'pulse','mood','water','activity','steps','exercise')
);

DROP POLICY IF EXISTS personal_health_logs_select_care_team ON public.personal_health_logs;
CREATE POLICY personal_health_logs_select_care_team ON public.personal_health_logs
  FOR SELECT TO authenticated
  USING (state = 'active' AND public.has_clinical_relationship(patient_user_id));
