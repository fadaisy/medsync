-- 0044 — Doctor-created complaints: scoped, attributed catalog TEMPLATES. GATED.
--
-- ⚠️ GATED — apply with explicit, named CSO/owner authorization (same posture as
-- 0042/0043). Extends the symptom catalog so a clerking doctor can CREATE a
-- complaint (symptom) that isn't seeded — name + system + synonyms + a mapping
-- of EXISTING properties — and save it as a reusable TEMPLATE.
--
-- THE rule: a template is the symptom + its property MAPPING (the structure) —
-- never the patient values tapped during a clerking (those persist to the
-- encounter as normal). The catalog stays patient-agnostic (reusability +
-- privacy). Two-tier governance (matches the engine): a created complaint is
-- PERSONAL to its creator (usable immediately, attributed, audited); a
-- "propose to shared" routes to CSO review → on approval it is PROMOTED to the
-- versioned shared catalog. The shared catalog is never directly user-mutated.

-- ─── Attribution + scope columns on the symptom catalog ─────────────────────
ALTER TABLE public.symptom_catalog
  ADD COLUMN IF NOT EXISTS created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS created_by_name text,
  ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'shared',
  ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'seed';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'symptom_catalog_scope_check') THEN
    ALTER TABLE public.symptom_catalog
      ADD CONSTRAINT symptom_catalog_scope_check CHECK (scope IN ('shared', 'personal'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'symptom_catalog_origin_check') THEN
    ALTER TABLE public.symptom_catalog
      ADD CONSTRAINT symptom_catalog_origin_check CHECK (origin IN ('seed', 'doctor', 'approved'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS symptom_catalog_scope_creator_idx
  ON public.symptom_catalog (scope, created_by_user_id);

-- ─── Attribution is immutable (append-only ethos) ───────────────────────────
CREATE OR REPLACE FUNCTION public.symptom_catalog_lock_attribution() RETURNS trigger AS $$
BEGIN
  IF OLD.created_by_user_id IS NOT NULL
     AND NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id THEN
    RAISE EXCEPTION 'symptom_catalog.created_by_user_id is immutable';
  END IF;
  IF OLD.created_by_name IS NOT NULL
     AND NEW.created_by_name IS DISTINCT FROM OLD.created_by_name THEN
    RAISE EXCEPTION 'symptom_catalog.created_by_name is immutable';
  END IF;
  IF NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'symptom_catalog.created_at is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS symptom_catalog_lock_attribution_trg ON public.symptom_catalog;
CREATE TRIGGER symptom_catalog_lock_attribution_trg
  BEFORE UPDATE ON public.symptom_catalog
  FOR EACH ROW EXECUTE FUNCTION public.symptom_catalog_lock_attribution();

-- ─── RLS: shared rows readable by all; personal rows only by creator/superadmin ─
DROP POLICY IF EXISTS symptom_catalog_select_all ON public.symptom_catalog;
DROP POLICY IF EXISTS symptom_catalog_select_scoped ON public.symptom_catalog;
CREATE POLICY symptom_catalog_select_scoped ON public.symptom_catalog
  FOR SELECT TO authenticated USING (
    scope = 'shared'
    OR created_by_user_id = auth.uid()
    OR public.user_has_role('superadmin')
  );
