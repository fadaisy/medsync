-- ════════════════════════════════════════════════════════════════════
-- 0039 — Smart prescribing (emergency/crash-cart scope): persistence layer
--
-- CLINICAL-SAFETY persistence for the smart prescribing tool. Tables:
--   1. patient_allergies          — the prescribe-time allergy source
--   2. prescriptions              — the shared prescription anchor (extends
--                                   to full prescribing later; MAR.prescription_id
--                                   becomes a real FK)
--   3. crash_carts / crash_cart_stock — the notional crash-cart inventory
--   4. emergency_administrations  — the grab-and-give record + the pharmacy
--                                   reconciliation seam
--
-- ⚠️ GATED — NOT auto-applied. The deployed v1 of the tool records emergency
-- administrations + allergy capture to the IMMUTABLE RESUS TIMELINE (audited,
-- append-only) so it ships without a production DDL change. Apply this
-- migration via the controlled DB step (as migration 0038 was) when the
-- persistent cross-encounter store is turned on; then point the engine's
-- allergy read + administration write at these tables. RLS + audit mirror the
-- nurse-workspace pattern (0031).
-- ════════════════════════════════════════════════════════════════════

-- ─── 1. patient_allergies ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.patient_allergies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  patient_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  substance text NOT NULL,
  reaction text,
  severity text,
    -- 'mild' | 'moderate' | 'severe' | 'anaphylaxis' | 'unknown'
  recorded_by_user_id uuid NOT NULL REFERENCES auth.users(id),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT patient_allergies_severity_check CHECK (
    severity IS NULL OR severity IN ('mild','moderate','severe','anaphylaxis','unknown')
  )
);
CREATE INDEX IF NOT EXISTS patient_allergies_patient_idx
  ON public.patient_allergies (patient_user_id, recorded_at DESC);

ALTER TABLE public.patient_allergies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_allergies FORCE ROW LEVEL SECURITY;

CREATE POLICY patient_allergies_select_scoped ON public.patient_allergies
  FOR SELECT TO authenticated
  USING (
    public.user_has_role('superadmin')
    OR patient_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.staff_affiliations sa
      WHERE sa.user_id = auth.uid()
        AND sa.hospital_id = patient_allergies.hospital_id
        AND sa.state IN ('active','approved')
    )
  );

DROP TRIGGER IF EXISTS audit_patient_allergies ON public.patient_allergies;
CREATE TRIGGER audit_patient_allergies
  AFTER INSERT OR UPDATE OR DELETE ON public.patient_allergies
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes();


-- ─── 2. prescriptions (the shared anchor) ──────────────────────────
CREATE TABLE IF NOT EXISTS public.prescriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  encounter_id uuid REFERENCES public.encounters(id) ON DELETE SET NULL,
  patient_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  prescriber_user_id uuid NOT NULL REFERENCES auth.users(id),

  drug_id text NOT NULL,            -- emergency-drug-catalog id (or future formulary id)
  drug_name text NOT NULL,
  dose text NOT NULL,
  concentration text,
  route text NOT NULL,
  indication text,
  source text,                      -- the cited guideline source

  is_emergency boolean NOT NULL DEFAULT true,
  controlled boolean NOT NULL DEFAULT false,
  state text NOT NULL DEFAULT 'active',
    -- 'active' | 'administered' | 'completed' | 'cancelled'

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT prescriptions_state_check CHECK (
    state IN ('active','administered','completed','cancelled')
  )
);
CREATE INDEX IF NOT EXISTS prescriptions_patient_idx
  ON public.prescriptions (patient_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS prescriptions_encounter_idx
  ON public.prescriptions (encounter_id);

ALTER TABLE public.prescriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prescriptions FORCE ROW LEVEL SECURITY;

CREATE POLICY prescriptions_select_scoped ON public.prescriptions
  FOR SELECT TO authenticated
  USING (
    public.user_has_role('superadmin')
    OR patient_user_id = auth.uid()
    OR prescriber_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.staff_affiliations sa
      WHERE sa.user_id = auth.uid()
        AND sa.hospital_id = prescriptions.hospital_id
        AND sa.state IN ('active','approved')
    )
  );

DROP TRIGGER IF EXISTS prescriptions_updated_at ON public.prescriptions;
CREATE TRIGGER prescriptions_updated_at
  BEFORE UPDATE ON public.prescriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS audit_prescriptions ON public.prescriptions;
CREATE TRIGGER audit_prescriptions
  AFTER INSERT OR UPDATE OR DELETE ON public.prescriptions
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes();


-- ─── 3. crash_carts + crash_cart_stock (notional inventory) ────────
CREATE TABLE IF NOT EXISTS public.crash_carts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  department_id uuid REFERENCES public.hospital_departments(id) ON DELETE SET NULL,
  label text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.crash_cart_stock (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id uuid NOT NULL REFERENCES public.crash_carts(id) ON DELETE CASCADE,
  drug_id text NOT NULL,
  drug_name text NOT NULL,
  on_hand integer NOT NULL DEFAULT 0,
  par_level integer NOT NULL DEFAULT 0,
  expires_at date,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS crash_cart_stock_cart_idx
  ON public.crash_cart_stock (cart_id);

ALTER TABLE public.crash_carts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crash_carts FORCE ROW LEVEL SECURITY;
ALTER TABLE public.crash_cart_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crash_cart_stock FORCE ROW LEVEL SECURITY;

CREATE POLICY crash_carts_select_scoped ON public.crash_carts
  FOR SELECT TO authenticated
  USING (
    public.user_has_role('superadmin')
    OR EXISTS (
      SELECT 1 FROM public.staff_affiliations sa
      WHERE sa.user_id = auth.uid()
        AND sa.hospital_id = crash_carts.hospital_id
        AND sa.state IN ('active','approved')
    )
  );
CREATE POLICY crash_cart_stock_select_scoped ON public.crash_cart_stock
  FOR SELECT TO authenticated
  USING (
    public.user_has_role('superadmin')
    OR EXISTS (
      SELECT 1 FROM public.crash_carts c
      JOIN public.staff_affiliations sa ON sa.hospital_id = c.hospital_id
      WHERE c.id = crash_cart_stock.cart_id
        AND sa.user_id = auth.uid()
        AND sa.state IN ('active','approved')
    )
  );

DROP TRIGGER IF EXISTS crash_cart_stock_updated_at ON public.crash_cart_stock;
CREATE TRIGGER crash_cart_stock_updated_at
  BEFORE UPDATE ON public.crash_cart_stock
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS audit_crash_cart_stock ON public.crash_cart_stock;
CREATE TRIGGER audit_crash_cart_stock
  AFTER INSERT OR UPDATE OR DELETE ON public.crash_cart_stock
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes();


-- ─── 4. emergency_administrations (grab-and-give + reconciliation) ──
-- Append-only accountability record. Captures everything the future pharmacy
-- module reconciles against (drug + amount + cart + time + patient + giver +
-- controlled status). No UPDATE/DELETE policy — corrections are new rows.
CREATE TABLE IF NOT EXISTS public.emergency_administrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  encounter_id uuid REFERENCES public.encounters(id) ON DELETE SET NULL,
  resus_episode_id uuid REFERENCES public.resus_episodes(id) ON DELETE SET NULL,
  patient_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  prescription_id uuid REFERENCES public.prescriptions(id) ON DELETE SET NULL,

  drug_id text NOT NULL,
  drug_name text NOT NULL,
  dose text NOT NULL,
  concentration text,
  route text NOT NULL,
  amount_mg numeric,

  cart_id uuid REFERENCES public.crash_carts(id) ON DELETE SET NULL,
  administered_by_user_id uuid NOT NULL REFERENCES auth.users(id),
  witnessed_by_user_id uuid REFERENCES auth.users(id),
  controlled boolean NOT NULL DEFAULT false,
  override_reason text,
  overridden_flags jsonb NOT NULL DEFAULT '[]'::jsonb,

  administered_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT emergency_admin_controlled_witness CHECK (
    controlled = false OR witnessed_by_user_id IS NOT NULL
  )
);
CREATE INDEX IF NOT EXISTS emergency_admin_patient_idx
  ON public.emergency_administrations (patient_user_id, administered_at DESC);
CREATE INDEX IF NOT EXISTS emergency_admin_cart_idx
  ON public.emergency_administrations (cart_id, administered_at DESC);
CREATE INDEX IF NOT EXISTS emergency_admin_episode_idx
  ON public.emergency_administrations (resus_episode_id);

ALTER TABLE public.emergency_administrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emergency_administrations FORCE ROW LEVEL SECURITY;

CREATE POLICY emergency_admin_select_scoped ON public.emergency_administrations
  FOR SELECT TO authenticated
  USING (
    public.user_has_role('superadmin')
    OR patient_user_id = auth.uid()
    OR administered_by_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.staff_affiliations sa
      WHERE sa.user_id = auth.uid()
        AND sa.hospital_id = emergency_administrations.hospital_id
        AND sa.state IN ('active','approved')
    )
  );

DROP TRIGGER IF EXISTS audit_emergency_admin ON public.emergency_administrations;
CREATE TRIGGER audit_emergency_admin
  AFTER INSERT OR UPDATE OR DELETE ON public.emergency_administrations
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes();
