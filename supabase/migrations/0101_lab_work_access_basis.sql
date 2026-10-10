-- 0101 — Laboratory staff keep access to the patients whose specimens they hold (hotfix before Lab
-- Phase 1; docs/lab/phase-1/STOP-REPORTS.md STOP 0, verdict 3; decided by the CSO 2026-10-11).
--
-- The EMR access rule (private.patient_access_basis, 0071:1056, and its set form
-- private.accessible_patient_ids, 0071:1116) had no basis for laboratory work. A technologist matched
-- only "open intake" (the patient arrived today and is still arrived / awaiting triage / triaged),
-- because the laboratory is never the department of the encounter. So a specimen collected before
-- midnight, or for a patient whose visit had completed (inpatients included), could not be resulted:
-- "No legitimate clinical access to this patient."
--
--   1. A new basis, `lab_work`: the user has an approved or active affiliation at the hospital with a
--      laboratory cadre (LAB_TECH, LAB_TECHNOLOGIST: the cadres of data/lab/permission-map.v1.json and
--      0097), and the patient has a laboratory order at that hospital placed within the last 30 days
--      (the window the rule already uses for department_recent, DEPARTMENT_WINDOW_DAYS,
--      lib/encounter/scope.ts:43). It sits after department_recent and before break_glass.
--   2. Both bodies of the rule gain the same arm, so the set-form equivalence probe still holds.
--   3. clinical_phi_access_log's basis CHECK gains 'lab_work', so these reads are logged truthfully.
--
-- Every other arm is copied verbatim from 0071. ADDITIVE in effect and re-runnable. GATED:
-- owner-applied (`npm run db:migrate -- 0101`).

-- ─── 1. The per-patient rule ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION private.patient_access_basis(p_user uuid, p_patient uuid, p_hospital uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  WITH clin AS (
    SELECT sa.department_id
    FROM public.staff_affiliations sa              -- 0013:82  user_id, hospital_id, department_id, cadre_id, state
    JOIN public.cadres c ON c.id = sa.cadre_id     -- 0008:86 + 0033:23  is_clinical
    JOIN public.hospital_departments d             -- 0000:33  hospital_id: the department really is this hospital's
      ON d.id = sa.department_id AND d.hospital_id = p_hospital
    WHERE sa.user_id = p_user
      AND sa.hospital_id = p_hospital
      AND sa.state IN ('active','approved')
      AND c.is_clinical
  ),
  lab AS (
    SELECT 1
    FROM public.staff_affiliations sa
    JOIN public.cadres c ON c.id = sa.cadre_id
    WHERE sa.user_id = p_user
      AND sa.hospital_id = p_hospital
      AND sa.state IN ('active','approved')
      AND c.code IN ('LAB_TECH', 'LAB_TECHNOLOGIST')
  )
  SELECT CASE
    WHEN p_user IS NULL OR p_patient IS NULL OR p_hospital IS NULL THEN NULL
    -- 1. active_encounter — encounters (0028:262): clinician_user_id, patient_user_id, hospital_id, state
    WHEN EXISTS (SELECT 1 FROM clin) AND EXISTS (
      SELECT 1 FROM public.encounters e
      WHERE e.clinician_user_id = p_user AND e.patient_user_id = p_patient
        AND e.hospital_id = p_hospital AND e.state = 'in_progress')
      THEN 'active_encounter'
    -- 2. assigned — nursing_assignments (0031:21): nurse_user_id, patient_user_id, hospital_id, starts_at, ends_at
    WHEN EXISTS (SELECT 1 FROM clin) AND EXISTS (
      SELECT 1 FROM public.nursing_assignments na
      WHERE na.nurse_user_id = p_user AND na.patient_user_id = p_patient
        AND na.hospital_id = p_hospital AND na.ends_at IS NULL AND na.starts_at <= now())
      THEN 'assigned'
    -- 3. open_intake — patient_intakes (0032:56, 0035:25): patient_user_id, hospital_id, status, arrived_at.
    --    Present at this hospital today (hospital day in Africa/Kampala = DEFAULT_TIME_ZONE, _shared/slots.ts:191).
    WHEN EXISTS (SELECT 1 FROM clin) AND EXISTS (
      SELECT 1 FROM public.patient_intakes pi
      WHERE pi.patient_user_id = p_patient AND pi.hospital_id = p_hospital
        AND pi.status IN ('arrived','awaiting_triage','triaged')
        AND pi.arrived_at >= (date_trunc('day', now() AT TIME ZONE 'Africa/Kampala') AT TIME ZONE 'Africa/Kampala'))
      THEN 'open_intake'
    -- 4. department_recent — appointments (0028:175): department_id, patient_user_id, hospital_id, starts_at;
    --    encounters: department_id, started_at. 30 days = DEPARTMENT_WINDOW_DAYS (lib/encounter/scope.ts:43).
    WHEN EXISTS (
      SELECT 1 FROM clin JOIN public.appointments a ON a.department_id = clin.department_id
      WHERE a.patient_user_id = p_patient AND a.hospital_id = p_hospital
        AND a.starts_at >= now() - interval '30 days')
      OR EXISTS (
      SELECT 1 FROM clin JOIN public.encounters e ON e.department_id = clin.department_id
      WHERE e.patient_user_id = p_patient AND e.hospital_id = p_hospital
        AND e.started_at >= now() - interval '30 days')
      THEN 'department_recent'
    -- 4b. lab_work (0101) — a laboratory cadre, and a lab order for the patient at this hospital within the
    --     same 30-day window: the specimens the lab holds, whatever the visit's state or the date.
    WHEN EXISTS (SELECT 1 FROM lab) AND EXISTS (
      SELECT 1 FROM public.encounter_orders o
      WHERE o.patient_user_id = p_patient AND o.hospital_id = p_hospital
        AND o.kind = 'lab' AND o.created_at >= now() - interval '30 days')
      THEN 'lab_work'
    -- 5. care_team — seam: no care-team table yet, so it never matches.
    -- 6. break_glass — sa_break_glass_grants (0018:194): actor_id, patient_id, hospital_id (nullable), revoked_at, expires_at
    WHEN EXISTS (
      SELECT 1 FROM public.sa_break_glass_grants g
      WHERE g.actor_id = p_user AND g.patient_id = p_patient
        AND g.revoked_at IS NULL AND g.expires_at > now()
        AND (g.hospital_id IS NULL OR g.hospital_id = p_hospital))
      THEN 'break_glass'
  END;
$$;

-- ─── 2. The same rule as a set (RLS) ─────────────────────────────────────
CREATE OR REPLACE FUNCTION private.accessible_patient_ids() RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  WITH me AS (SELECT private.current_user_id() AS uid, private.current_hospital_id() AS hid),
  clin AS (
    SELECT sa.department_id FROM me
    JOIN public.staff_affiliations sa ON sa.user_id = me.uid AND sa.hospital_id = me.hid
    JOIN public.cadres c ON c.id = sa.cadre_id
    JOIN public.hospital_departments d ON d.id = sa.department_id AND d.hospital_id = me.hid
    WHERE sa.state IN ('active','approved') AND c.is_clinical
  ),
  lab AS (
    SELECT 1 FROM me
    JOIN public.staff_affiliations sa ON sa.user_id = me.uid AND sa.hospital_id = me.hid
    JOIN public.cadres c ON c.id = sa.cadre_id
    WHERE sa.state IN ('active','approved') AND c.code IN ('LAB_TECH', 'LAB_TECHNOLOGIST')
  ),
  by_affiliation AS (
    SELECT e.patient_user_id FROM me JOIN public.encounters e
      ON e.clinician_user_id = me.uid AND e.hospital_id = me.hid AND e.state = 'in_progress'
    UNION
    SELECT na.patient_user_id FROM me JOIN public.nursing_assignments na
      ON na.nurse_user_id = me.uid AND na.hospital_id = me.hid AND na.ends_at IS NULL AND na.starts_at <= now()
    UNION
    SELECT pi.patient_user_id FROM me JOIN public.patient_intakes pi
      ON pi.hospital_id = me.hid AND pi.patient_user_id IS NOT NULL
     AND pi.status IN ('arrived','awaiting_triage','triaged')
     AND pi.arrived_at >= (date_trunc('day', now() AT TIME ZONE 'Africa/Kampala') AT TIME ZONE 'Africa/Kampala')
    UNION
    SELECT a.patient_user_id FROM me, clin JOIN public.appointments a ON a.department_id = clin.department_id
      WHERE a.hospital_id = me.hid AND a.starts_at >= now() - interval '30 days'
    UNION
    SELECT e.patient_user_id FROM me, clin JOIN public.encounters e ON e.department_id = clin.department_id
      WHERE e.hospital_id = me.hid AND e.started_at >= now() - interval '30 days'
  )
  SELECT patient_user_id FROM by_affiliation WHERE EXISTS (SELECT 1 FROM clin)
  UNION
  SELECT o.patient_user_id FROM me JOIN public.encounter_orders o
    ON o.hospital_id = me.hid AND o.kind = 'lab' AND o.created_at >= now() - interval '30 days'
   WHERE EXISTS (SELECT 1 FROM lab)
  UNION
  SELECT g.patient_id FROM me JOIN public.sa_break_glass_grants g
    ON g.actor_id = me.uid AND g.revoked_at IS NULL AND g.expires_at > now()
   AND (g.hospital_id IS NULL OR g.hospital_id = me.hid);
$$;

-- ─── 3. Log the new basis truthfully ─────────────────────────────────────
ALTER TABLE public.clinical_phi_access_log DROP CONSTRAINT IF EXISTS phi_access_basis_check;
ALTER TABLE public.clinical_phi_access_log ADD CONSTRAINT phi_access_basis_check CHECK (access_basis IN
  ('care_team','active_encounter','department_recent','break_glass',     -- 0030, kept
   'assigned','open_intake',                                             -- 0071, kept
   'lab_work'));                                                         -- 0101

-- The lab_work probe: a patient's recent lab orders at a hospital.
CREATE INDEX IF NOT EXISTS encounter_orders_lab_patient_recent
  ON public.encounter_orders (hospital_id, patient_user_id, created_at DESC) WHERE kind = 'lab';
