-- 0170 — The patient phone app on real data (Tide v1, ADR 0342).
--
-- 1. personal_health_logs takes four more kinds the phone logs: pulse (bpm), mood (1 not well, 2 okay, 3 good),
--    water (glasses) and activity (minutes walked). Same table, same patient-only RLS as 0029.
-- 2. patient_profiles gains the home pin the patient may drop at sign-up, with its own consent: the version of
--    the words they agreed to and when. Saying no leaves all four columns null. The patient writes it through the
--    existing patient_profiles_update_own policy; nothing else reads it yet.
-- 3. public.patient_intake_ahead(intake): "N ahead of you" for the patient's own intake, the same count as
--    app/patient/queue/[intakeId] (ADR 0084 §6): this intake's department, present today (arrived or awaiting
--    triage), by presence, coalesce(checked_in_at, arrived_at), earlier than this patient's. NULL when the
--    intake is not the caller's, has no department, or the patient is not present (a declared row is not a place
--    in the line). Never an ordinal, never a total, never a wait.
--
-- ADDITIVE and re-runnable. Owner-applied (`npm run db:migrate -- 0170`).
-- Reverse: restore the 0029 kind check (after deleting rows of the four new kinds), DROP the four
-- patient_profiles columns, DROP FUNCTION public.patient_intake_ahead(uuid).

-- ─── 1. More kinds of self-logged reading ────────────────────────────────
ALTER TABLE public.personal_health_logs DROP CONSTRAINT IF EXISTS personal_health_logs_kind_check;
ALTER TABLE public.personal_health_logs ADD CONSTRAINT personal_health_logs_kind_check CHECK (
  kind IN ('glucose','bp','weight','spo2','temperature','symptom','note','other',
           'pulse','mood','water','activity')
);

-- ─── 2. The home pin, with its own consent ──────────────────────────────
ALTER TABLE public.patient_profiles ADD COLUMN IF NOT EXISTS home_pin_lat numeric(9,6);
ALTER TABLE public.patient_profiles ADD COLUMN IF NOT EXISTS home_pin_lng numeric(9,6);
ALTER TABLE public.patient_profiles ADD COLUMN IF NOT EXISTS home_pin_consent_version text;
ALTER TABLE public.patient_profiles ADD COLUMN IF NOT EXISTS home_pin_consented_at timestamptz;

ALTER TABLE public.patient_profiles DROP CONSTRAINT IF EXISTS patient_profiles_home_pin_check;
ALTER TABLE public.patient_profiles ADD CONSTRAINT patient_profiles_home_pin_check CHECK (
  -- All four together or none: a pin never exists without the consent it was given under.
  (home_pin_lat IS NULL AND home_pin_lng IS NULL AND home_pin_consent_version IS NULL
     AND home_pin_consented_at IS NULL)
  OR (home_pin_lat BETWEEN -90 AND 90 AND home_pin_lng BETWEEN -180 AND 180
     AND home_pin_consent_version IS NOT NULL AND home_pin_consented_at IS NOT NULL)
);

-- ─── 3. "N ahead of you", for the caller's own intake only ──────────────
CREATE OR REPLACE FUNCTION public.patient_intake_ahead(p_intake uuid)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  me public.patient_intakes%ROWTYPE;
  day_start timestamptz := date_trunc('day', now() AT TIME ZONE 'Africa/Kampala') AT TIME ZONE 'Africa/Kampala';
  n integer;
BEGIN
  SELECT * INTO me FROM public.patient_intakes WHERE id = p_intake;
  IF NOT FOUND OR me.patient_user_id IS DISTINCT FROM auth.uid() THEN
    RETURN NULL;
  END IF;
  IF me.receiving_department_id IS NULL OR me.status NOT IN ('arrived', 'awaiting_triage') THEN
    RETURN NULL;
  END IF;

  SELECT count(*) INTO n
  FROM public.patient_intakes i
  WHERE i.hospital_id = me.hospital_id
    AND i.receiving_department_id = me.receiving_department_id
    AND i.status IN ('arrived', 'awaiting_triage')
    AND coalesce(i.checked_in_at, i.arrived_at) >= day_start
    AND coalesce(i.checked_in_at, i.arrived_at) < coalesce(me.checked_in_at, me.arrived_at);
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.patient_intake_ahead(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.patient_intake_ahead(uuid) TO authenticated;
