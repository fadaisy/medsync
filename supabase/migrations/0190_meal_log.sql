-- 0190 — Meals on the patient's own log (Tide v1, ADR 0356).
--
-- personal_health_logs takes one more kind:
--   'meal'  numeric_value_1 = grams eaten; numeric_value_2 = kcal for those grams when logged;
--           unit = the food or dish id in the phone's built-in Ugandan food list (ADR 0353);
--           note = which meal: 'breakfast', 'lunch', 'supper' or 'snack'.
-- Same table, same RLS: the patient writes their own rows, and the care team reads active ones (0188).
-- Taking a meal back sets state = 'deleted' through the existing personal_health_logs_update_own policy.
--
-- ADDITIVE and re-runnable. Needs 0188 first. Owner-applied (`npm run db:migrate`).
-- Reverse: restore 0188's kind check after deleting rows of kind 'meal'.

ALTER TABLE public.personal_health_logs DROP CONSTRAINT IF EXISTS personal_health_logs_kind_check;
ALTER TABLE public.personal_health_logs ADD CONSTRAINT personal_health_logs_kind_check CHECK (
  kind IN ('glucose','bp','weight','spo2','temperature','symptom','note','other',
           'pulse','mood','water','activity','steps','exercise','meal')
);
