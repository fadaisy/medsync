-- 0211 — Pharmacy Phase 3, second merge: stewardship reviews and suspected reactions (AM-6, AR-1 to AR-7; ADRs
-- 0392, 0394, 0395; GATE A signed 25 Oct 2026).
--
-- GATED: owner-applied (`npm run db:migrate`), after 0210. ADDITIVE.
--
--   1. Two content packs: the AWaRe pack (one signed edition, keyed by medicine and route) and the antibiotic review
--      settings (interval per group, groups prompted, no-culture window). Neither acts unsigned (Law 3, Law 6).
--   2. pharmacy_ams_reviews: a prescriber's answer to a review prompt; append-only. A stop date is stored here and
--      never on the prescription (D-PH3-09).
--   3. pharmacy_reaction_reports, _medicines, _events: the hospital's record of suspected reactions and the NDA report's
--      source. Append-only; corrections, causality and submission are events (AR-1, AR-6). The allergy entry each
--      suspected medicine writes is the single allergy record's own row (D-PH3-13, linked by allergy_id).

ALTER TABLE public.pharmacy_content_entries DROP CONSTRAINT IF EXISTS pharmacy_content_entries_pack_check;
ALTER TABLE public.pharmacy_content_entries ADD CONSTRAINT pharmacy_content_entries_pack_check CHECK (pack IN (
  'interaction_pair','alert_levels','lookback_windows','query_codes_added','check_worth_signing','pcne_map',
  'aware_pack','review_settings'));

CREATE TABLE IF NOT EXISTS public.pharmacy_ams_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  patient_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  prescription_id uuid NOT NULL REFERENCES public.prescriptions(id) ON DELETE RESTRICT,
  answer text NOT NULL CHECK (answer IN ('continue','change','switch_oral','stop')),
  stop_date date,
  reason text CHECK (reason IS NULL OR char_length(reason) BETWEEN 2 AND 500),
  query_id uuid REFERENCES public.pharmacy_queries(id) ON DELETE RESTRICT,
  actor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  actor_cadre text,
  reviewed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT par_continue_date CHECK (answer <> 'continue' OR stop_date IS NOT NULL),
  CONSTRAINT par_stop_reason CHECK (answer <> 'stop' OR reason IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS par_prescription ON public.pharmacy_ams_reviews (prescription_id, reviewed_at DESC);

CREATE TABLE IF NOT EXISTS public.pharmacy_reaction_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  patient_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  -- A short, unique reference printed in place of the hospital number (AR-5).
  reference text NOT NULL UNIQUE CHECK (reference ~ '^R-[A-HJKMNP-Z2-9]{8}$'),
  kind text NOT NULL CHECK (kind IN ('suspected_reaction','lack_of_effect','poor_quality','medication_error',
    'suspected_counterfeit')),
  reaction_text text NOT NULL CHECK (char_length(reaction_text) BETWEEN 2 AND 2000),
  manifestation text CHECK (manifestation IS NULL OR manifestation IN
    ('rash','urticaria','angioedema','anaphylaxis','bronchospasm','sjs_ten','gastrointestinal','other')),
  started_on date,
  seriousness text[] NOT NULL CHECK (cardinality(seriousness) > 0 AND seriousness <@ ARRAY['not_serious','death',
    'life_threatening','hospitalisation','disability','congenital','other_important']::text[]),
  outcome text NOT NULL CHECK (outcome IN ('recovered','recovering','not_recovered','recovered_with_effects','died',
    'unknown')),
  action_taken text NOT NULL CHECK (action_taken IN ('stopped_by_patient','stopped_by_clinician',
    'dose_changed_by_clinician','continued','unknown')),
  rechallenge text NOT NULL CHECK (rechallenge IN ('yes','no','not_given_again','unknown')),
  reporter text NOT NULL CHECK (reporter IN ('patient','relative','staff')),
  recorded_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  recorder_cadre text,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  client_key text UNIQUE CHECK (client_key IS NULL OR char_length(client_key) BETWEEN 8 AND 120)
);
CREATE TABLE IF NOT EXISTS public.pharmacy_reaction_medicines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.pharmacy_reaction_reports(id) ON DELETE RESTRICT,
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  medicine_id text CHECK (medicine_id IS NULL OR medicine_id ~ '^[a-z0-9_]{2,80}$'),
  product_id uuid REFERENCES public.pharmacy_products(id) ON DELETE RESTRICT,
  batch_id uuid REFERENCES public.pharmacy_batches(id) ON DELETE RESTRICT,
  uncoded_text text CHECK (uncoded_text IS NULL OR char_length(uncoded_text) BETWEEN 2 AND 160),
  main boolean NOT NULL DEFAULT false,
  allergy_id uuid REFERENCES public.allergies(id) ON DELETE RESTRICT,
  CONSTRAINT prm_named CHECK (medicine_id IS NOT NULL OR uncoded_text IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS prm_one_main ON public.pharmacy_reaction_medicines (report_id) WHERE main;
CREATE TABLE IF NOT EXISTS public.pharmacy_reaction_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.pharmacy_reaction_reports(id) ON DELETE RESTRICT,
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('causality','submitted','closed_not_submitted','correction','printed','copied')),
  causality text CHECK (causality IS NULL OR causality IN ('certain','probable','possible','unlikely','conditional',
    'unassessable')),
  route text CHECK (route IS NULL OR char_length(route) BETWEEN 2 AND 120),
  submitted_on date,
  reference text CHECK (reference IS NULL OR char_length(reference) BETWEEN 1 AND 120),
  field text CHECK (field IS NULL OR char_length(field) BETWEEN 2 AND 60),
  note text CHECK (note IS NULL OR char_length(note) <= 1000),
  actor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pre_causality CHECK (kind <> 'causality' OR causality IS NOT NULL),
  -- Law 5: no report marked submitted without its route and date.
  CONSTRAINT pre_submitted CHECK (kind <> 'submitted' OR (route IS NOT NULL AND submitted_on IS NOT NULL)),
  CONSTRAINT pre_closed CHECK (kind <> 'closed_not_submitted' OR note IS NOT NULL),
  CONSTRAINT pre_correction CHECK (kind <> 'correction' OR (field IS NOT NULL AND note IS NOT NULL))
);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['pharmacy_ams_reviews','pharmacy_reaction_reports','pharmacy_reaction_medicines',
    'pharmacy_reaction_events'] LOOP
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
    EXECUTE format('DROP TRIGGER IF EXISTS %1$s_append_only ON public.%1$I', t);
    EXECUTE format('CREATE TRIGGER %1$s_append_only BEFORE UPDATE OR DELETE ON public.%1$I
      FOR EACH ROW EXECUTE FUNCTION public.block_modify_append_only()', t);
  END LOOP;
END $$;

-- A prescriber reads the reviews of their hospital's patients (the problem card's "Review due", the stop date);
-- the ward reads them for the administration record's chip. Hospital staff only; no other new read.
DROP POLICY IF EXISTS pharmacy_ams_reviews_staff ON public.pharmacy_ams_reviews;
CREATE POLICY pharmacy_ams_reviews_staff ON public.pharmacy_ams_reviews FOR SELECT TO medsync_clinical_reader
  USING (hospital_id = (SELECT private.current_hospital_id()) AND (SELECT private.hospital_staff_now()));
