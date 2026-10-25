-- 0210 — Pharmacy Phase 3, first merge: signed clinical content, interaction decisions, intervention coding
-- (CC-1 to CC-5, IX-6, IV-2a, IV-3; ADRs 0390, 0391, 0397; GATE A signed 25 Oct 2026).
--
-- GATED: owner-applied (`npm run db:migrate`), after 0184. ADDITIVE: no existing row changes meaning.
--
--   1. pharmacy_content_entries: one row per version of a pack entry (an interaction pair, the alert levels, the
--      look-back windows, the added query codes, the "check worth signing" minimum, the PCNE map). Only `in_force`
--      rows act (Law 3). A version in force never changes; withdrawing it is the one later change.
--   2. pharmacy_content_signatures: append-only; each with the signer's fresh second factor (an attestation), or a
--      recorded exception where no second eligible signer exists (CC-2, D-PH3-26).
--   3. pharmacy_content_imports: one row per imported candidate file and hash (CC-3: importing again does nothing).
--   4. pharmacy_query_pcne: optional PCNE coding of a query; append-only (IV-3).
--   5. pharmacy_queries.intent (IV-2a) and the line-event kind `accepted_interaction` (IX-6).

CREATE TABLE IF NOT EXISTS public.pharmacy_content_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  pack text NOT NULL CHECK (pack IN ('interaction_pair','alert_levels','lookback_windows','query_codes_added',
    'check_worth_signing','pcne_map')),
  key text NOT NULL CHECK (char_length(key) BETWEEN 1 AND 200),
  version integer NOT NULL CHECK (version > 0),
  payload jsonb NOT NULL,
  source text CHECK (source IS NULL OR char_length(source) BETWEEN 3 AND 1000),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','reviewer_signed','in_force','withdrawn')),
  -- Why a draft cannot be sent for signing yet: "not_matched", "waits_for_class_map" (CC-3, CC-5).
  blocked text CHECK (blocked IS NULL OR blocked IN ('not_matched','waits_for_class_map')),
  candidate_id text,
  author_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  in_force_at timestamptz,
  withdrawn_at timestamptz,
  withdrawn_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  withdrawn_reason text CHECK (withdrawn_reason IS NULL OR char_length(withdrawn_reason) BETWEEN 3 AND 500),
  UNIQUE (hospital_id, pack, key, version),
  CONSTRAINT pce_withdrawn CHECK ((status = 'withdrawn') = (withdrawn_at IS NOT NULL AND withdrawn_reason IS NOT NULL)),
  CONSTRAINT pce_force_source CHECK (status IN ('draft') OR pack <> 'interaction_pair' OR source IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS pce_one_in_force ON public.pharmacy_content_entries (hospital_id, pack, key)
  WHERE status = 'in_force';
CREATE UNIQUE INDEX IF NOT EXISTS pce_candidate ON public.pharmacy_content_entries (hospital_id, pack, candidate_id)
  WHERE candidate_id IS NOT NULL AND version = 1;

CREATE TABLE IF NOT EXISTS public.pharmacy_content_signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id uuid NOT NULL REFERENCES public.pharmacy_content_entries(id) ON DELETE RESTRICT,
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  signer_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  role text NOT NULL CHECK (role IN ('pharmacist_reviewer','cso','ams_chair','pharmacy_in_charge')),
  attestation_id uuid NOT NULL REFERENCES public.pharmacy_attestations(id) ON DELETE RESTRICT,
  -- CC-2: where no second eligible signer exists, the exception in words (D-PH3-26).
  exception_text text CHECK (exception_text IS NULL OR char_length(exception_text) BETWEEN 10 AND 500),
  signed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entry_id, signer_user_id)
);

-- A version's payload and source never change after it leaves draft; only withdrawal follows `in_force`.
CREATE OR REPLACE FUNCTION private.pharmacy_content_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE _signers int; _exception boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'draft' THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'pharmacy_content_entries: a signed entry is withdrawn, never deleted';
  END IF;
  IF OLD.status <> 'draft' AND (NEW.payload IS DISTINCT FROM OLD.payload OR NEW.source IS DISTINCT FROM OLD.source
       OR NEW.key <> OLD.key OR NEW.pack <> OLD.pack OR NEW.version <> OLD.version) THEN
    RAISE EXCEPTION 'pharmacy_content_entries: a signed entry never changes; save a new version';
  END IF;
  IF OLD.status = 'withdrawn' OR (OLD.status = 'in_force' AND NEW.status NOT IN ('in_force','withdrawn')) THEN
    RAISE EXCEPTION 'pharmacy_content_entries: % cannot become %', OLD.status, NEW.status;
  END IF;
  IF NEW.status = 'in_force' AND OLD.status <> 'in_force' THEN
    SELECT count(DISTINCT signer_user_id), bool_or(exception_text IS NOT NULL) INTO _signers, _exception
      FROM public.pharmacy_content_signatures WHERE entry_id = NEW.id;
    IF NOT (_signers >= 2 OR (_signers = 1 AND _exception)) THEN
      RAISE EXCEPTION 'pharmacy_content_entries: in force needs two signers, or one with a recorded exception (CC-2)'
        USING ERRCODE = 'P0001', HINT = 'signers';
    END IF;
    IF NEW.blocked IS NOT NULL THEN
      RAISE EXCEPTION 'pharmacy_content_entries: % cannot go into force', NEW.blocked USING ERRCODE = 'P0001', HINT = NEW.blocked;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS pce_guard ON public.pharmacy_content_entries;
CREATE TRIGGER pce_guard BEFORE UPDATE OR DELETE ON public.pharmacy_content_entries
  FOR EACH ROW EXECUTE FUNCTION private.pharmacy_content_guard();

CREATE TABLE IF NOT EXISTS public.pharmacy_content_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  file text NOT NULL CHECK (file IN ('interaction-candidates.json','aware-candidates.json')),
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  counts jsonb NOT NULL,
  imported_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  imported_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hospital_id, file, sha256)
);

CREATE TABLE IF NOT EXISTS public.pharmacy_query_pcne (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  query_id uuid NOT NULL REFERENCES public.pharmacy_queries(id) ON DELETE RESTRICT,
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  -- {problem, cause, intervention, acceptance, status}: codes from the signed PCNE map, confirmed by a person.
  codes jsonb NOT NULL,
  map_entry_id uuid NOT NULL REFERENCES public.pharmacy_content_entries(id) ON DELETE RESTRICT,
  coder_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  coded_at timestamptz NOT NULL DEFAULT now()
);

-- IV-2a: a query asks a question or proposes a change (default, as Phase 1's queries do).
ALTER TABLE public.pharmacy_queries ADD COLUMN IF NOT EXISTS intent text NOT NULL DEFAULT 'proposes_change'
  CHECK (intent IN ('asks_question','proposes_change'));

-- IX-6: the pharmacist supplies a line with a fired interaction, with a reason, beside the prescriber's.
ALTER TABLE public.pharmacy_line_events DROP CONSTRAINT IF EXISTS pharmacy_line_events_kind_check;
ALTER TABLE public.pharmacy_line_events ADD CONSTRAINT pharmacy_line_events_kind_check CHECK (kind IN (
  'accepted','accepted_overridden_stop','reviewed','decision_saved','decision_cleared','supplied_without_review',
  'owed','buying_outside','open_outcome_changed','supplied','part_supplied','declined','closed',
  'closed_not_collected','filled_elsewhere','replaced','cancelled_by_prescriber','returned','patient_reported',
  'accepted_interaction'));
ALTER TABLE public.pharmacy_line_events DROP CONSTRAINT IF EXISTS ple_interaction_reason;
ALTER TABLE public.pharmacy_line_events ADD CONSTRAINT ple_interaction_reason CHECK (
  kind <> 'accepted_interaction' OR (reason_code IS NOT NULL AND reason_note IS NOT NULL));

-- Grants, RLS, audit. Content is read by pharmacy staff and, for in-force entries, by prescribers through the
-- prescribing read (server functions); no client writes anything.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['pharmacy_content_entries','pharmacy_content_signatures','pharmacy_content_imports',
    'pharmacy_query_pcne'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS audit_%1$s ON public.%1$I', t);
    EXECUTE format('CREATE TRIGGER audit_%1$s AFTER INSERT OR UPDATE OR DELETE ON public.%1$I
      FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes()', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO medsync_clinical_reader', t);
    EXECUTE format('DROP POLICY IF EXISTS %1$s_select ON public.%1$I', t);
    EXECUTE format('CREATE POLICY %1$s_select ON public.%1$I FOR SELECT TO medsync_clinical_reader
      USING (hospital_id = (SELECT private.current_hospital_id()) AND (SELECT private.pharmacy_can(''pharmacy.view'')))', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['pharmacy_content_signatures','pharmacy_content_imports','pharmacy_query_pcne'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %1$s_append_only ON public.%1$I', t);
    EXECUTE format('CREATE TRIGGER %1$s_append_only BEFORE UPDATE OR DELETE ON public.%1$I
      FOR EACH ROW EXECUTE FUNCTION public.block_modify_append_only()', t);
  END LOOP;
END $$;

-- In-force entries are hospital reference content, not PHI: any active staff member of the hospital (a prescriber's
-- dialog) reads them; a superadmin without an affiliation does not. Drafts and signatures stay pharmacy-only
-- (Law 3: a draft is visible only in Clinical content).
CREATE OR REPLACE FUNCTION private.hospital_staff_now() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM public.staff_affiliations sa
                  WHERE sa.user_id = private.current_user_id() AND sa.hospital_id = private.current_hospital_id()
                    AND sa.state IN ('approved','active'));
$$;
REVOKE ALL ON FUNCTION private.hospital_staff_now() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.hospital_staff_now() TO medsync_clinical_reader;
DROP POLICY IF EXISTS pharmacy_content_entries_in_force ON public.pharmacy_content_entries;
CREATE POLICY pharmacy_content_entries_in_force ON public.pharmacy_content_entries FOR SELECT
  TO medsync_clinical_reader
  USING (hospital_id = (SELECT private.current_hospital_id()) AND status = 'in_force'
         AND (SELECT private.hospital_staff_now()));
