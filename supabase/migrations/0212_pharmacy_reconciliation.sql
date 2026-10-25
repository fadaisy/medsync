-- 0212 — Pharmacy Phase 3, third merge: reconciliation at discharge (MR-1 to MR-7; ADR 0395; GATE A signed
-- 25 Oct 2026, D-PH3-16 as found: there is no discharge event, so a prescriber opens it with "Prepare medicines for home").
--
-- GATED: owner-applied (`npm run db:migrate`), after 0211. ADDITIVE.
--
--   1. One content pack: the reconciliation rules (which of R1 to R14 are on, and the reasons a pharmacist may give
--      to explain a discrepancy). Nothing is checked unsigned (Law 3).
--   2. pharmacy_reconciliations: one per admission (MR-1), opened by a prescriber.
--   3. pharmacy_reconciliation_decisions: the prescriber's decision for home, per row; append-only, the latest wins.
--   4. pharmacy_reconciliation_events: a pharmacist's explanation, an added discrepancy, the confirmation (with the
--      list as it stood, MR-4), a close with a reason (MR-6) and a reopen (MR-5). Append-only.

ALTER TABLE public.pharmacy_content_entries DROP CONSTRAINT IF EXISTS pharmacy_content_entries_pack_check;
ALTER TABLE public.pharmacy_content_entries ADD CONSTRAINT pharmacy_content_entries_pack_check CHECK (pack IN (
  'interaction_pair','alert_levels','lookback_windows','query_codes_added','check_worth_signing','pcne_map',
  'aware_pack','review_settings','reaction_timelines','reconciliation_rules'));

CREATE TABLE IF NOT EXISTS public.pharmacy_reconciliations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  patient_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  admission_id uuid NOT NULL UNIQUE REFERENCES public.admissions(id) ON DELETE RESTRICT,
  opened_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  opened_at timestamptz NOT NULL DEFAULT now(),
  client_key text UNIQUE CHECK (client_key IS NULL OR char_length(client_key) BETWEEN 8 AND 120)
);
CREATE INDEX IF NOT EXISTS pharmacy_reconciliations_hospital_idx
  ON public.pharmacy_reconciliations (hospital_id, opened_at DESC);

CREATE TABLE IF NOT EXISTS public.pharmacy_reconciliation_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reconciliation_id uuid NOT NULL REFERENCES public.pharmacy_reconciliations(id) ON DELETE RESTRICT,
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  row_key text NOT NULL CHECK (char_length(row_key) BETWEEN 2 AND 120),
  decision text NOT NULL CHECK (decision IN ('continue','restart','changed','stay_stopped','paused','ends_on_ward',
    'new_for_home')),
  reason text CHECK (reason IS NULL OR char_length(reason) BETWEEN 2 AND 500),
  decided_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  decider_cadre text,
  decided_at timestamptz NOT NULL DEFAULT now(),
  client_key text UNIQUE CHECK (client_key IS NULL OR char_length(client_key) BETWEEN 8 AND 120)
);
CREATE INDEX IF NOT EXISTS pharmacy_reconciliation_decisions_rec_idx
  ON public.pharmacy_reconciliation_decisions (reconciliation_id, decided_at);

CREATE TABLE IF NOT EXISTS public.pharmacy_reconciliation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reconciliation_id uuid NOT NULL REFERENCES public.pharmacy_reconciliations(id) ON DELETE RESTRICT,
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('explained','added','confirmed','closed','reopened','printed')),
  discrepancy text CHECK (discrepancy IS NULL OR char_length(discrepancy) BETWEEN 2 AND 160),
  reason text CHECK (reason IS NULL OR char_length(reason) BETWEEN 2 AND 160),
  note text CHECK (note IS NULL OR char_length(note) <= 1000),
  snapshot jsonb,
  actor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  at timestamptz NOT NULL DEFAULT now(),
  client_key text UNIQUE CHECK (client_key IS NULL OR char_length(client_key) BETWEEN 8 AND 120),
  CONSTRAINT prce_explained CHECK (kind <> 'explained' OR (discrepancy IS NOT NULL AND reason IS NOT NULL)),
  CONSTRAINT prce_added CHECK (kind <> 'added' OR (reason IS NOT NULL AND note IS NOT NULL)),
  CONSTRAINT prce_confirmed CHECK (kind <> 'confirmed' OR snapshot IS NOT NULL),
  CONSTRAINT prce_closed CHECK (kind <> 'closed' OR (reason IN ('confirmed_by_phone','at_next_visit','other')
    AND note IS NOT NULL)),
  CONSTRAINT prce_reopened CHECK (kind <> 'reopened' OR discrepancy IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS pharmacy_reconciliation_events_rec_idx
  ON public.pharmacy_reconciliation_events (reconciliation_id, at);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['pharmacy_reconciliations','pharmacy_reconciliation_decisions',
    'pharmacy_reconciliation_events'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS audit_%1$s ON public.%1$I', t);
    EXECUTE format('CREATE TRIGGER audit_%1$s AFTER INSERT OR UPDATE OR DELETE ON public.%1$I
      FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes()', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO medsync_clinical_reader', t);
    -- The pharmacy and the discharging prescriber both read it: hospital staff of this hospital only.
    EXECUTE format('DROP POLICY IF EXISTS %1$s_select ON public.%1$I', t);
    EXECUTE format('CREATE POLICY %1$s_select ON public.%1$I FOR SELECT TO medsync_clinical_reader
      USING (hospital_id = (SELECT private.current_hospital_id()) AND (SELECT private.hospital_staff_now()))', t);
    EXECUTE format('DROP TRIGGER IF EXISTS %1$s_append_only ON public.%1$I', t);
    EXECUTE format('CREATE TRIGGER %1$s_append_only BEFORE UPDATE OR DELETE ON public.%1$I
      FOR EACH ROW EXECUTE FUNCTION public.block_modify_append_only()', t);
  END LOOP;
END $$;
