-- 0120 — Pharmacy staff read the clinical record only through the pharmacy's server reads
-- (Pharmacy Phase 0, ADR 0232; gate-a-proposal §5.2a and §6.2, D-PH0-05 signed 2026-10-10; prompt §7
-- probe table, S13).
--
-- GATED (RLS): owner-applied (`npm run db:migrate`), after 0100. Numbered 0120 so as not to collide with
-- the lab's 0101 (lab access hotfix) or Lab Phase 1's block (docs/NUMBERS.md).
--
-- Twenty-three client SELECT policies admit "any approved or active affiliation in a clinical cadre"
-- at the hospital — inline (`c.is_clinical = true`) or through public.is_active_clinical_staff(). The
-- pharmacy cadres are clinical (they need a licence on file at approval, 0033), so today a pharmacist
-- or pharmacy technician can read encounters, observations, triage, the MAR, handovers, admissions,
-- beds, visit summaries and the resus record through the client. The signed read list (D-PH0-05)
-- gives them none of that: what the pharmacy needs comes through server reads with explicit fields.
--
-- This migration takes the two pharmacy cadres (the cadres of data/pharmacy/permission-map.v1.json)
-- out of that predicate, and nothing else: every other cadre, role and branch of each policy is
-- unchanged. The function is redefined in place; the nine inline policies are recreated with one
-- added line. Laboratory cadres have the same reach today; that is reported to the lab, not changed
-- here. Prescriptions and emergency doses keep the pharmacy read 0100 gave them.

CREATE OR REPLACE FUNCTION public.is_active_clinical_staff(p_hospital uuid)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.staff_affiliations sa
    JOIN public.cadres c ON c.id = sa.cadre_id
    WHERE sa.user_id = auth.uid()
      AND sa.hospital_id = p_hospital
      AND sa.state IN ('active','approved')
      AND c.is_clinical = true
      AND c.code NOT IN ('PHARMACIST', 'PHARMACY_TECH')
  );
$$;
REVOKE ALL ON FUNCTION public.is_active_clinical_staff(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_active_clinical_staff(uuid) TO authenticated;

-- public.clinical_observations (from 0033_reception_workspace.sql)
DROP POLICY IF EXISTS clinical_observations_select_scoped ON public.clinical_observations;
CREATE POLICY clinical_observations_select_scoped
  ON public.clinical_observations
  FOR SELECT TO authenticated
  USING (
    public.user_has_role('superadmin')
    OR patient_user_id = auth.uid()
    OR recorded_by_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.staff_affiliations sa
      JOIN public.cadres c ON c.id = sa.cadre_id
      WHERE sa.user_id = auth.uid()
        AND sa.hospital_id = clinical_observations.hospital_id
        AND sa.state IN ('active','approved')
        AND c.is_clinical = true
        AND c.code NOT IN ('PHARMACIST', 'PHARMACY_TECH')
    )
  );;

-- public.encounters (from 0033_reception_workspace.sql)
DROP POLICY IF EXISTS encounters_select_scoped ON public.encounters;
CREATE POLICY encounters_select_scoped
  ON public.encounters
  FOR SELECT TO authenticated
  USING (
    public.user_has_role('superadmin')
    OR public.user_has_role('hospital_admin', hospital_id)
    OR patient_user_id = auth.uid()
    OR clinician_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.staff_affiliations sa
      JOIN public.cadres c ON c.id = sa.cadre_id
      WHERE sa.user_id = auth.uid()
        AND sa.hospital_id = encounters.hospital_id
        AND sa.state IN ('active','approved')
        AND c.is_clinical = true
        AND c.code NOT IN ('PHARMACIST', 'PHARMACY_TECH')
    )
  );;

-- public.medication_administration_records (from 0033_reception_workspace.sql)
DROP POLICY IF EXISTS mar_select_scoped ON public.medication_administration_records;
CREATE POLICY mar_select_scoped
  ON public.medication_administration_records
  FOR SELECT TO authenticated
  USING (
    public.user_has_role('superadmin')
    OR patient_user_id = auth.uid()
    OR administered_by_user_id = auth.uid()
    OR cosigned_by_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.staff_affiliations sa
      JOIN public.cadres c ON c.id = sa.cadre_id
      WHERE sa.user_id = auth.uid()
        AND sa.hospital_id = medication_administration_records.hospital_id
        AND sa.state IN ('active','approved')
        AND c.is_clinical = true
        AND c.code NOT IN ('PHARMACIST', 'PHARMACY_TECH')
    )
  );;

-- public.resus_episodes (from 0038_resus_abcde.sql)
DROP POLICY IF EXISTS resus_episodes_select_scoped ON public.resus_episodes;
CREATE POLICY resus_episodes_select_scoped ON public.resus_episodes
  FOR SELECT TO authenticated
  USING (
    public.user_has_role('superadmin')
    OR patient_user_id = auth.uid()
    OR opened_by_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.staff_affiliations sa
      JOIN public.cadres c ON c.id = sa.cadre_id
      WHERE sa.user_id = auth.uid()
        AND sa.hospital_id = resus_episodes.hospital_id
        AND sa.state IN ('active','approved')
        AND c.is_clinical = true
        AND c.code NOT IN ('PHARMACIST', 'PHARMACY_TECH')
    )
  );;

-- public.resus_mobilisation_alerts (from 0038_resus_abcde.sql)
DROP POLICY IF EXISTS resus_mobilisation_select_scoped ON public.resus_mobilisation_alerts;
CREATE POLICY resus_mobilisation_select_scoped ON public.resus_mobilisation_alerts
  FOR SELECT TO authenticated
  USING (
    public.user_has_role('superadmin')
    OR recipient_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.resus_episodes e
      JOIN public.staff_affiliations sa ON sa.hospital_id = e.hospital_id
      JOIN public.cadres c ON c.id = sa.cadre_id
      WHERE e.id = resus_mobilisation_alerts.episode_id
        AND sa.user_id = auth.uid()
        AND sa.state IN ('active','approved')
        AND c.is_clinical = true
        AND c.code NOT IN ('PHARMACIST', 'PHARMACY_TECH')
    )
  );;

-- public.resus_role_assignments (from 0038_resus_abcde.sql)
DROP POLICY IF EXISTS resus_roles_select_scoped ON public.resus_role_assignments;
CREATE POLICY resus_roles_select_scoped ON public.resus_role_assignments
  FOR SELECT TO authenticated
  USING (
    public.user_has_role('superadmin')
    OR user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.resus_episodes e
      JOIN public.staff_affiliations sa ON sa.hospital_id = e.hospital_id
      JOIN public.cadres c ON c.id = sa.cadre_id
      WHERE e.id = resus_role_assignments.episode_id
        AND sa.user_id = auth.uid()
        AND sa.state IN ('active','approved')
        AND c.is_clinical = true
        AND c.code NOT IN ('PHARMACIST', 'PHARMACY_TECH')
    )
  );;

-- public.resus_timeline_events (from 0038_resus_abcde.sql)
DROP POLICY IF EXISTS resus_timeline_select_scoped ON public.resus_timeline_events;
CREATE POLICY resus_timeline_select_scoped ON public.resus_timeline_events
  FOR SELECT TO authenticated
  USING (
    public.user_has_role('superadmin')
    OR recorded_by_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.resus_episodes e
      WHERE e.id = resus_timeline_events.episode_id
        AND (
          e.patient_user_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.staff_affiliations sa
            JOIN public.cadres c ON c.id = sa.cadre_id
            WHERE sa.user_id = auth.uid()
              AND sa.hospital_id = e.hospital_id
              AND sa.state IN ('active','approved')
              AND c.is_clinical = true
        AND c.code NOT IN ('PHARMACIST', 'PHARMACY_TECH')
          )
        )
    )
  );;

-- public.shift_handovers (from 0033_reception_workspace.sql)
DROP POLICY IF EXISTS shift_handovers_select_scoped ON public.shift_handovers;
CREATE POLICY shift_handovers_select_scoped
  ON public.shift_handovers
  FOR SELECT TO authenticated
  USING (
    public.user_has_role('superadmin')
    OR public.user_has_role('hospital_admin', hospital_id)
    OR submitted_by_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.staff_affiliations sa
      JOIN public.cadres c ON c.id = sa.cadre_id
      WHERE sa.user_id = auth.uid()
        AND sa.hospital_id = shift_handovers.hospital_id
        AND sa.state IN ('active','approved')
        AND c.is_clinical = true
        AND c.code NOT IN ('PHARMACIST', 'PHARMACY_TECH')
    )
  );;

-- public.triage_records (from 0036_triage_engine.sql)
DROP POLICY IF EXISTS triage_records_select_scoped ON public.triage_records;
CREATE POLICY triage_records_select_scoped ON public.triage_records
  FOR SELECT TO authenticated
  USING (
    public.user_has_role('superadmin')
    OR patient_user_id = auth.uid()
    OR triaged_by_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.staff_affiliations sa
      JOIN public.cadres c ON c.id = sa.cadre_id
      WHERE sa.user_id = auth.uid()
        AND sa.hospital_id = triage_records.hospital_id
        AND sa.state IN ('active','approved')
        AND c.is_clinical = true
        AND c.code NOT IN ('PHARMACIST', 'PHARMACY_TECH')
    )
  );;
