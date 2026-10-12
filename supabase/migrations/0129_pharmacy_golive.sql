-- 0129 — Going live per dispensing point, and the hospital's pharmacy settings (Pharmacy Phase 1, RD-1 to RD-5,
-- D-PH1-05, D-PH1-35; gate-a-proposal §7, §12; §1 W1).
--
-- GATED: owner-applied (`npm run db:migrate`), after 0128.
--
--   1. pharmacy_dispensing_points gains `live_at`, `switched_off_at`, `label_mode`, `count_freshness_days` and
--      the point's own `phone` (the hub holds none; W1 makes it part of going live).
--   2. pharmacy_golive: each request to switch a point on or off, its conditions as they stood, and a second
--      approver who is not the requester (RD-2, RD-3; modelled on lab_cutover). Approval stamps the point in
--      the same transaction. Only the approval fields ever change.
--   3. pharmacy_briefings, pharmacy_legal_answers, pharmacy_pilot_notes: records only, append-only (RD-1, RD-5).
--      A legal answer with no hospital applies to every hospital.
--   4. pharmacy_hospital_settings: one row per hospital. "Supply without a pharmacist" (D-PH1-05) is refused
--      unless a second person approved it and an interim answer to legal question 1 is on record (RQ-12).
--
-- ADDITIVE and re-runnable. No client grants. The hospital admin reaches these through server actions.

ALTER TABLE public.pharmacy_dispensing_points
  ADD COLUMN IF NOT EXISTS live_at timestamptz,
  ADD COLUMN IF NOT EXISTS switched_off_at timestamptz,
  ADD COLUMN IF NOT EXISTS label_mode text NOT NULL DEFAULT 'printed',
  ADD COLUMN IF NOT EXISTS count_freshness_days integer,
  ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE public.pharmacy_dispensing_points DROP CONSTRAINT IF EXISTS pdp_settings;
ALTER TABLE public.pharmacy_dispensing_points ADD CONSTRAINT pdp_settings CHECK (
  label_mode IN ('printed','by_hand')
  AND (count_freshness_days IS NULL OR count_freshness_days BETWEEN 1 AND 365)
  AND (phone IS NULL OR phone ~ '^\+?[0-9][0-9 ]{6,19}$')
  AND (switched_off_at IS NULL OR live_at IS NOT NULL));

CREATE TABLE IF NOT EXISTS public.pharmacy_golive (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  dispensing_point_id uuid NOT NULL REFERENCES public.pharmacy_dispensing_points(department_id) ON DELETE RESTRICT,
  action text NOT NULL CHECK (action IN ('switch_on','switch_off')),
  conditions jsonb NOT NULL,
  reason text CHECK (reason IS NULL OR char_length(reason) BETWEEN 10 AND 500),
  requested_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  requested_at timestamptz NOT NULL DEFAULT now(),
  approved_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  approved_at timestamptz,
  withdrawn_at timestamptz,
  CONSTRAINT pg_second_person CHECK (approved_by IS NULL OR approved_by <> requested_by),
  CONSTRAINT pg_approved CHECK ((approved_by IS NULL) = (approved_at IS NULL)),
  CONSTRAINT pg_off_reason CHECK (action <> 'switch_off' OR reason IS NOT NULL),
  CONSTRAINT pg_one_end CHECK (approved_at IS NULL OR withdrawn_at IS NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS pg_one_open ON public.pharmacy_golive (dispensing_point_id)
  WHERE approved_at IS NULL AND withdrawn_at IS NULL;

CREATE OR REPLACE FUNCTION private.pharmacy_golive_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' OR OLD.approved_at IS NOT NULL OR OLD.withdrawn_at IS NOT NULL THEN
    RAISE EXCEPTION 'pharmacy_golive: a decided request never changes';
  END IF;
  IF (to_jsonb(NEW) - ARRAY['approved_by','approved_at','withdrawn_at'])
     IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['approved_by','approved_at','withdrawn_at']) THEN
    RAISE EXCEPTION 'pharmacy_golive: only the decision changes a request';
  END IF;
  IF NEW.approved_at IS NOT NULL THEN
    IF NEW.action = 'switch_on' THEN
      UPDATE public.pharmacy_dispensing_points SET live_at = NEW.approved_at, switched_off_at = NULL
       WHERE department_id = NEW.dispensing_point_id;
    ELSE
      UPDATE public.pharmacy_dispensing_points SET switched_off_at = NEW.approved_at
       WHERE department_id = NEW.dispensing_point_id AND live_at IS NOT NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS pg_guard ON public.pharmacy_golive;
CREATE TRIGGER pg_guard BEFORE UPDATE OR DELETE ON public.pharmacy_golive
  FOR EACH ROW EXECUTE FUNCTION private.pharmacy_golive_guard();

CREATE TABLE IF NOT EXISTS public.pharmacy_briefings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  dispensing_point_id uuid REFERENCES public.pharmacy_dispensing_points(department_id) ON DELETE RESTRICT,
  audience text NOT NULL CHECK (audience IN ('pharmacy','prescribers')),
  held_on date NOT NULL,
  notes text CHECK (notes IS NULL OR char_length(notes) <= 1000),
  recorded_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pharmacy_legal_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  question integer NOT NULL CHECK (question BETWEEN 1 AND 8),
  answer text NOT NULL CHECK (char_length(answer) BETWEEN 3 AND 4000),
  source_ref text NOT NULL CHECK (char_length(source_ref) BETWEEN 3 AND 500),
  given_by text NOT NULL CHECK (char_length(given_by) BETWEEN 2 AND 200),
  given_on date NOT NULL,
  interim boolean NOT NULL DEFAULT true,
  recorded_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pharmacy_pilot_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  dispensing_point_id uuid NOT NULL REFERENCES public.pharmacy_dispensing_points(department_id) ON DELETE RESTRICT,
  note text NOT NULL CHECK (char_length(note) BETWEEN 20 AND 4000),
  written_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  written_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pharmacy_hospital_settings (
  hospital_id uuid PRIMARY KEY REFERENCES public.hospitals(id) ON DELETE CASCADE,
  individual_inpatient_supply boolean NOT NULL DEFAULT false,
  payment_status_required boolean NOT NULL DEFAULT false,
  supply_without_pharmacist boolean NOT NULL DEFAULT false,
  supply_without_pharmacist_requested_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  supply_without_pharmacist_approved_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  expiry_lookahead_days integer CHECK (expiry_lookahead_days IS NULL OR expiry_lookahead_days BETWEEN 1 AND 730),
  live_sms boolean NOT NULL DEFAULT false,
  log_columns jsonb,
  log_columns_confirmed_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  log_columns_confirmed_at timestamptz,
  updated_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT phs_without_pharmacist CHECK (NOT supply_without_pharmacist OR (
    supply_without_pharmacist_requested_by IS NOT NULL AND supply_without_pharmacist_approved_by IS NOT NULL
    AND supply_without_pharmacist_approved_by <> supply_without_pharmacist_requested_by)),
  CONSTRAINT phs_log_confirmed CHECK ((log_columns_confirmed_at IS NULL) = (log_columns_confirmed_by IS NULL))
);

-- RQ-12: "supply without a pharmacist" needs an interim answer to legal question 1 on record.
CREATE OR REPLACE FUNCTION private.pharmacy_settings_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.supply_without_pharmacist AND NOT EXISTS (
       SELECT 1 FROM public.pharmacy_legal_answers a
        WHERE a.question = 1 AND (a.hospital_id IS NULL OR a.hospital_id = NEW.hospital_id)) THEN
    RAISE EXCEPTION 'pharmacy_hospital_settings: supply without a pharmacist needs an answer to legal question 1 on record';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS phs_guard ON public.pharmacy_hospital_settings;
CREATE TRIGGER phs_guard BEFORE INSERT OR UPDATE ON public.pharmacy_hospital_settings
  FOR EACH ROW EXECUTE FUNCTION private.pharmacy_settings_guard();

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['pharmacy_briefings','pharmacy_legal_answers','pharmacy_pilot_notes'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %1$s_append_only ON public.%1$I', t);
    EXECUTE format('CREATE TRIGGER %1$s_append_only BEFORE UPDATE OR DELETE ON public.%1$I
      FOR EACH ROW EXECUTE FUNCTION public.block_modify_append_only()', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['pharmacy_golive','pharmacy_briefings','pharmacy_legal_answers','pharmacy_pilot_notes',
    'pharmacy_hospital_settings'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS audit_%1$s ON public.%1$I', t);
    EXECUTE format('CREATE TRIGGER audit_%1$s AFTER INSERT OR UPDATE OR DELETE ON public.%1$I
      FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes()', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO medsync_clinical_reader', t);
    EXECUTE format('DROP POLICY IF EXISTS %1$s_select ON public.%1$I', t);
  END LOOP;
END $$;

-- Pharmacy staff read their hospital's go-live state and settings; the hospital admin reads them through
-- the server (no PHI in any of these tables). Legal answers with no hospital apply everywhere.
CREATE POLICY pharmacy_golive_select ON public.pharmacy_golive FOR SELECT TO medsync_clinical_reader
  USING (hospital_id = (SELECT private.current_hospital_id()) AND (SELECT private.pharmacy_can('pharmacy.view')));
CREATE POLICY pharmacy_briefings_select ON public.pharmacy_briefings FOR SELECT TO medsync_clinical_reader
  USING (hospital_id = (SELECT private.current_hospital_id()) AND (SELECT private.pharmacy_can('pharmacy.view')));
CREATE POLICY pharmacy_legal_answers_select ON public.pharmacy_legal_answers FOR SELECT TO medsync_clinical_reader
  USING ((hospital_id IS NULL OR hospital_id = (SELECT private.current_hospital_id()))
         AND (SELECT private.pharmacy_can('pharmacy.view')));
CREATE POLICY pharmacy_pilot_notes_select ON public.pharmacy_pilot_notes FOR SELECT TO medsync_clinical_reader
  USING (hospital_id = (SELECT private.current_hospital_id()) AND (SELECT private.pharmacy_can('pharmacy.view')));
CREATE POLICY pharmacy_hospital_settings_select ON public.pharmacy_hospital_settings FOR SELECT TO medsync_clinical_reader
  USING (hospital_id = (SELECT private.current_hospital_id()) AND (SELECT private.pharmacy_can('pharmacy.view')));
