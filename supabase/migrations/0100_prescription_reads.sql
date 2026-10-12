-- 0100 — Who may read prescriptions and emergency doses in the database (Pharmacy Phase 0, ADR 0232;
-- gate-a-proposal §6.1–§6.2, D-PH0-21, signed 2026-10-10).
--
-- GATED (RLS): owner-applied (`npm run db:migrate`), after 0099.
--
-- 0039 let ANY approved or active affiliation at a hospital SELECT every prescription, emergency
-- administration and crash-cart row there through the client: reception, lab and pharmacy staff
-- included, restricted indications included; superadmin without break-glass too. No app code reads
-- these tables as a user (every read is server-side as the owner), so narrowing breaks no path.
--
-- After this migration, a client (role `authenticated`) reads a hospital's rows only when it is:
--   - the patient (own rows; 0074's RESTRICTIVE policy still hides restricted ones from them);
--   - the prescriber, or the giver of an emergency dose (own rows);
--   - clinical staff at that hospital: an approved or active affiliation in a clinical cadre that is
--     not a laboratory or pharmacy cadre (doctors, clinical officers, dental, nurses, midwives,
--     allied clinicians, as before);
--   - pharmacy staff at that hospital: the `pharmacy_staff` role, which 0098 keeps in step with an
--     approved pharmacy-cadre affiliation.
-- Superadmin reads only through break-glass, never by role. The medsync_clinical_reader policy
-- (0074) is untouched.

CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION private.reads_hospital_prescribing(p_hospital uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT p_hospital IS NOT NULL AND (
    EXISTS (
      SELECT 1 FROM public.staff_affiliations sa
      JOIN public.cadres c ON c.id = sa.cadre_id
      WHERE sa.user_id = auth.uid()
        AND sa.hospital_id = p_hospital
        AND sa.state IN ('active', 'approved')
        AND c.is_clinical
        AND c.code NOT IN ('LAB_TECH', 'LAB_TECHNOLOGIST', 'PHARMACIST', 'PHARMACY_TECH')
    )
    OR public.user_has_role('pharmacy_staff', p_hospital)
  );
$$;

REVOKE ALL ON FUNCTION private.reads_hospital_prescribing(uuid) FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.reads_hospital_prescribing(uuid) TO authenticated;

DROP POLICY IF EXISTS prescriptions_select_scoped ON public.prescriptions;
CREATE POLICY prescriptions_select_scoped ON public.prescriptions
  FOR SELECT TO authenticated
  USING (
    patient_user_id = auth.uid()
    OR prescriber_user_id = auth.uid()
    OR private.reads_hospital_prescribing(hospital_id)
  );

DROP POLICY IF EXISTS emergency_admin_select_scoped ON public.emergency_administrations;
CREATE POLICY emergency_admin_select_scoped ON public.emergency_administrations
  FOR SELECT TO authenticated
  USING (
    patient_user_id = auth.uid()
    OR administered_by_user_id = auth.uid()
    OR private.reads_hospital_prescribing(hospital_id)
  );

DROP POLICY IF EXISTS crash_carts_select_scoped ON public.crash_carts;
CREATE POLICY crash_carts_select_scoped ON public.crash_carts
  FOR SELECT TO authenticated
  USING (private.reads_hospital_prescribing(hospital_id));

DROP POLICY IF EXISTS crash_cart_stock_select_scoped ON public.crash_cart_stock;
CREATE POLICY crash_cart_stock_select_scoped ON public.crash_cart_stock
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.crash_carts c
      WHERE c.id = crash_cart_stock.cart_id
        AND private.reads_hospital_prescribing(c.hospital_id)
    )
  );
