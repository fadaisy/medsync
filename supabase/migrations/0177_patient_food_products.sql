-- 0177 — Packaged foods the patient has scanned or read off a label (Tide v1, ADR 0357).
--
-- One row per product the patient logs from a barcode or a nutrition label: a snapshot of its values per
-- 100 g (or 100 ml), so their meals add up offline and the care team reads what they ate. A 'meal' row on
-- personal_health_logs (0176) names one with unit = 'product:<id>'.
--   source 'open_food_facts'  looked up by barcode in Open Food Facts (ODbL), as the database gave it;
--          'label_photo'      read off the pack's nutrition label by the phone, checked by the patient;
--          'typed'            typed in from the label by the patient.
-- Per patient, never shared between patients. The patient inserts their own and may retire one
-- (state active → deleted); the care team reads active rows (has_clinical_relationship, as 0174).
--
-- ADDITIVE and re-runnable. Owner-applied (`npm run db:migrate`).
-- Reverse: DROP TABLE public.patient_food_products (after deleting 'meal' rows whose unit starts 'product:').

CREATE TABLE IF NOT EXISTS public.patient_food_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  barcode text,
  name text NOT NULL,
  brand text,
  kcal_100g numeric NOT NULL,
  carbs_100g numeric NOT NULL,
  protein_100g numeric,
  fat_100g numeric,
  fibre_100g numeric,
  serving_g numeric,
  source text NOT NULL,
  state text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT patient_food_products_source_check
    CHECK (source IN ('open_food_facts','label_photo','typed')),
  CONSTRAINT patient_food_products_state_check CHECK (state IN ('active','deleted')),
  CONSTRAINT patient_food_products_values_check CHECK (
    kcal_100g BETWEEN 0 AND 950 AND carbs_100g BETWEEN 0 AND 100
    AND (protein_100g IS NULL OR protein_100g BETWEEN 0 AND 100)
    AND (fat_100g IS NULL OR fat_100g BETWEEN 0 AND 100)
    AND (fibre_100g IS NULL OR fibre_100g BETWEEN 0 AND 100)
    AND (serving_g IS NULL OR serving_g BETWEEN 1 AND 5000)
  ),
  CONSTRAINT patient_food_products_name_check CHECK (length(name) BETWEEN 1 AND 200)
);

CREATE INDEX IF NOT EXISTS patient_food_products_patient_idx
  ON public.patient_food_products (patient_user_id, barcode) WHERE state = 'active';

ALTER TABLE public.patient_food_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_food_products FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS patient_food_products_select_own ON public.patient_food_products;
CREATE POLICY patient_food_products_select_own ON public.patient_food_products
  FOR SELECT TO authenticated
  USING (patient_user_id = auth.uid() OR public.user_has_role('superadmin'));

DROP POLICY IF EXISTS patient_food_products_select_care_team ON public.patient_food_products;
CREATE POLICY patient_food_products_select_care_team ON public.patient_food_products
  FOR SELECT TO authenticated
  USING (state = 'active' AND public.has_clinical_relationship(patient_user_id));

DROP POLICY IF EXISTS patient_food_products_insert_own ON public.patient_food_products;
CREATE POLICY patient_food_products_insert_own ON public.patient_food_products
  FOR INSERT TO authenticated
  WITH CHECK (patient_user_id = auth.uid());

DROP POLICY IF EXISTS patient_food_products_update_own ON public.patient_food_products;
CREATE POLICY patient_food_products_update_own ON public.patient_food_products
  FOR UPDATE TO authenticated
  USING (patient_user_id = auth.uid())
  WITH CHECK (patient_user_id = auth.uid());

DROP TRIGGER IF EXISTS patient_food_products_updated_at ON public.patient_food_products;
CREATE TRIGGER patient_food_products_updated_at
  BEFORE UPDATE ON public.patient_food_products
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS audit_patient_food_products ON public.patient_food_products;
CREATE TRIGGER audit_patient_food_products
  AFTER INSERT OR UPDATE OR DELETE ON public.patient_food_products
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes();
