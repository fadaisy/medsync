-- 0125 — Review, line events and queries (Pharmacy Phase 1, LN, LO, RQ; gate-a-proposal §3, §4, §6).
--
-- GATED: owner-applied (`npm run db:migrate`), after 0124.
--
--   1. pharmacy_scope_entries: a person brought an earlier prescription into the queue (LO-6, D-PH1-38).
--   2. pharmacy_line_events: every review, staged decision, stage change and outcome on one prescription
--      line, append-only (LO-1 to LO-9). The prescription row is the line version (owner's answer at
--      STOP 0); the lane, its reasons and the rule version ride on each event (LN-7). The pharmacy never
--      writes to `prescriptions` (Law 2).
--   3. pharmacy_queries and pharmacy_query_events: a query to the prescriber and everything that happens
--      to it, append-only (RQ-2). `replaced_by_prescription_id` on an `answered: changed` event keeps the
--      new line with the prescription it replaces (gate-a-proposal §3.1).
--   4. Delivery (D-PH1-47): a `notified` event sends `{kind, ref, at}` on the recipient's own topic
--      `user:<id>` (0106). No PHI in the payload. A failure is swallowed: the query stands either way,
--      and the pharmacy reads delivery from the events, never from realtime.
--
-- ADDITIVE and re-runnable. No client grants.

-- ─── 1. Scope ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pharmacy_scope_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  prescription_id uuid NOT NULL REFERENCES public.prescriptions(id) ON DELETE RESTRICT,
  placement_id uuid,
  dispensing_point_id uuid NOT NULL REFERENCES public.pharmacy_dispensing_points(department_id) ON DELETE RESTRICT,
  brought_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  brought_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (prescription_id)
);

-- ─── 2. Line events ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pharmacy_line_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  prescription_id uuid NOT NULL REFERENCES public.prescriptions(id) ON DELETE RESTRICT,
  patient_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  dispensing_point_id uuid REFERENCES public.pharmacy_dispensing_points(department_id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN (
    'accepted','accepted_overridden_stop','reviewed',            -- RQ-1, LO-6
    'decision_saved','decision_cleared',                          -- staged; moves no stock
    'supplied_without_review',                                    -- RQ-12, D-PH1-05
    'owed','buying_outside','open_outcome_changed',               -- LO-2 open outcomes
    'supplied','part_supplied',                                   -- written by the hand-over (SU-1)
    'declined','closed','closed_not_collected','filled_elsewhere',
    'replaced','cancelled_by_prescriber',                         -- read from the prescriber's action
    'returned',                                                   -- reversal or "recorded in error" (SU-11, SU-14)
    'patient_reported')),                                         -- ML-4
  lane text CHECK (lane IS NULL OR lane IN ('pharmacist_first','standard')),
  lane_reasons text[] NOT NULL DEFAULT '{}',
  rule_version integer,
  reason_code text CHECK (reason_code IS NULL OR char_length(reason_code) BETWEEN 2 AND 60),
  reason_note text CHECK (reason_note IS NULL OR char_length(reason_note) <= 1000),
  quantity_supplied integer CHECK (quantity_supplied IS NULL OR quantity_supplied >= 0),
  quantity_not_supplied integer CHECK (quantity_not_supplied IS NULL OR quantity_not_supplied >= 0),
  decision jsonb,
  patient_told text CHECK (patient_told IS NULL OR char_length(patient_told) <= 500),
  handover_id uuid,
  replaced_by_prescription_id uuid REFERENCES public.prescriptions(id) ON DELETE RESTRICT,
  actor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  actor_cadre text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  effective_at timestamptz NOT NULL DEFAULT now(),
  client_key text UNIQUE CHECK (client_key IS NULL OR char_length(client_key) BETWEEN 8 AND 120),
  CONSTRAINT ple_reason CHECK (kind NOT IN ('owed','buying_outside','declined','closed','closed_not_collected',
    'supplied_without_review','returned') OR reason_code IS NOT NULL),
  CONSTRAINT ple_replaced CHECK ((kind = 'replaced') = (replaced_by_prescription_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS ple_line ON public.pharmacy_line_events (prescription_id, occurred_at);
CREATE INDEX IF NOT EXISTS ple_hospital_open ON public.pharmacy_line_events (hospital_id, occurred_at DESC);

-- ─── 3. Queries ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pharmacy_queries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  patient_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  scope text NOT NULL CHECK (scope IN ('line','prescription')),
  prescription_id uuid NOT NULL REFERENCES public.prescriptions(id) ON DELETE RESTRICT,  -- the line, or any line of the prescription
  placement_id uuid,
  type_code text NOT NULL CHECK (char_length(type_code) BETWEEN 2 AND 60),
  proposal text NOT NULL CHECK (char_length(proposal) BETWEEN 1 AND 500),
  patient_waiting boolean NOT NULL DEFAULT false,
  dispensing_point_id uuid NOT NULL REFERENCES public.pharmacy_dispensing_points(department_id) ON DELETE RESTRICT,
  sender_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  sender_cadre text,
  created_at timestamptz NOT NULL DEFAULT now(),
  client_key text UNIQUE CHECK (client_key IS NULL OR char_length(client_key) BETWEEN 8 AND 120)
);
CREATE INDEX IF NOT EXISTS pq_patient ON public.pharmacy_queries (patient_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.pharmacy_query_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  query_id uuid NOT NULL REFERENCES public.pharmacy_queries(id) ON DELETE RESTRICT,
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('notified','skipped','notify_failed','seen','call_logged','answered',
    'disputed','withdrawn','not_supplied_acknowledged')),
  recipient_user_id uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  recipient_role text CHECK (recipient_role IS NULL OR recipient_role IN ('prescriber','responsible_clinician')),
  answer text CHECK (answer IS NULL OR answer IN ('keep','changed','stopped')),
  answer_reason_code text CHECK (answer_reason_code IS NULL OR char_length(answer_reason_code) BETWEEN 2 AND 60),
  note text CHECK (note IS NULL OR char_length(note) <= 1000),
  via text CHECK (via IS NULL OR via IN ('app','phone')),
  answered_by_user_id uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  replaced_by_prescription_id uuid REFERENCES public.prescriptions(id) ON DELETE RESTRICT,
  actor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  client_key text UNIQUE CHECK (client_key IS NULL OR char_length(client_key) BETWEEN 8 AND 120),
  CONSTRAINT pqe_answer CHECK ((kind = 'answered') = (answer IS NOT NULL)),
  CONSTRAINT pqe_answer_via CHECK (kind <> 'answered' OR (via IS NOT NULL AND answered_by_user_id IS NOT NULL)),
  CONSTRAINT pqe_phone_keep CHECK (kind <> 'answered' OR via = 'app' OR answer = 'keep'),
  CONSTRAINT pqe_recipient CHECK (kind NOT IN ('notified','skipped','notify_failed','seen') OR recipient_user_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS pqe_query ON public.pharmacy_query_events (query_id, occurred_at);
CREATE INDEX IF NOT EXISTS pqe_recipient ON public.pharmacy_query_events (recipient_user_id) WHERE kind = 'notified';

-- ─── 4. Delivery (D-PH1-47) ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION private.notify_user_event(p_user uuid, p_event text, p_kind text, p_ref uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF p_user IS NULL OR to_regproc('realtime.send') IS NULL THEN RETURN; END IF;
  PERFORM realtime.send(jsonb_build_object('kind', p_kind, 'ref', p_ref, 'at', now()), p_event,
                        'user:' || p_user::text, true);
EXCEPTION WHEN OTHERS THEN
  RETURN;  -- a nudge only; the query is on the recipient's screen at its next render whatever happens here
END;
$$;
REVOKE ALL ON FUNCTION private.notify_user_event(uuid, text, text, uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION private.pharmacy_query_event_notify() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE _sender uuid;
BEGIN
  IF NEW.kind = 'notified' THEN
    PERFORM private.notify_user_event(NEW.recipient_user_id, 'pharmacy', 'query', NEW.query_id);
  ELSIF NEW.kind IN ('answered','disputed') THEN
    SELECT sender_user_id INTO _sender FROM public.pharmacy_queries WHERE id = NEW.query_id;
    PERFORM private.notify_user_event(_sender, 'pharmacy', 'query_' || NEW.kind, NEW.query_id);
  END IF;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS pqe_notify ON public.pharmacy_query_events;
CREATE TRIGGER pqe_notify AFTER INSERT ON public.pharmacy_query_events
  FOR EACH ROW EXECUTE FUNCTION private.pharmacy_query_event_notify();

-- ─── Append-only, grants, RLS, audit ────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['pharmacy_scope_entries','pharmacy_line_events','pharmacy_queries','pharmacy_query_events'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %1$s_append_only ON public.%1$I', t);
    EXECUTE format('CREATE TRIGGER %1$s_append_only BEFORE UPDATE OR DELETE ON public.%1$I
      FOR EACH ROW EXECUTE FUNCTION public.block_modify_append_only()', t);
    EXECUTE format('DROP TRIGGER IF EXISTS audit_%1$s ON public.%1$I', t);
    EXECUTE format('CREATE TRIGGER audit_%1$s AFTER INSERT ON public.%1$I
      FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes()', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO medsync_clinical_reader', t);
    EXECUTE format('DROP POLICY IF EXISTS %1$s_select ON public.%1$I', t);
    EXECUTE format('CREATE POLICY %1$s_select ON public.%1$I FOR SELECT TO medsync_clinical_reader
      USING (hospital_id = (SELECT private.current_hospital_id()) AND (SELECT private.pharmacy_can(''pharmacy.view'')))', t);
  END LOOP;
END $$;

-- The prescriber's side (PA2-5, D-PH1-08): a clinician who may prescribe at this hospital (the co-sign
-- policy names their cadre for routine prescribing, allowed or with co-sign; fail closed like
-- lib/emr/write/prescriptions.ts), for patients they may already see in the chart (0071's basis). Never a
-- stock figure, never a pharmacy name beyond cadre. Nurses and reception hold no prescribing policy.
CREATE OR REPLACE FUNCTION private.may_prescribe_here() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.staff_affiliations sa
      JOIN public.cadres c ON c.id = sa.cadre_id
      JOIN public.clinical_cosign_policies cp
        ON cp.hospital_id = sa.hospital_id AND cp.cadre_code = c.code
       AND cp.action_kind = 'prescription_routine' AND cp.requirement IN ('allowed','cosign_required')
     WHERE sa.user_id = private.current_user_id() AND sa.hospital_id = private.current_hospital_id()
       AND sa.state IN ('approved','active'));
$$;
REVOKE ALL ON FUNCTION private.may_prescribe_here() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.may_prescribe_here() TO medsync_clinical_reader;

DROP POLICY IF EXISTS pharmacy_queries_prescriber_select ON public.pharmacy_queries;
CREATE POLICY pharmacy_queries_prescriber_select ON public.pharmacy_queries FOR SELECT TO medsync_clinical_reader
  USING (hospital_id = (SELECT private.current_hospital_id()) AND (SELECT private.may_prescribe_here())
         AND patient_user_id IN (SELECT private.accessible_patient_ids()));
DROP POLICY IF EXISTS pharmacy_query_events_prescriber_select ON public.pharmacy_query_events;
CREATE POLICY pharmacy_query_events_prescriber_select ON public.pharmacy_query_events FOR SELECT TO medsync_clinical_reader
  USING (hospital_id = (SELECT private.current_hospital_id()) AND (SELECT private.may_prescribe_here())
         AND EXISTS (SELECT 1 FROM public.pharmacy_queries q WHERE q.id = query_id
                       AND q.patient_user_id IN (SELECT private.accessible_patient_ids())));
DROP POLICY IF EXISTS pharmacy_line_events_prescriber_select ON public.pharmacy_line_events;
CREATE POLICY pharmacy_line_events_prescriber_select ON public.pharmacy_line_events FOR SELECT TO medsync_clinical_reader
  USING (hospital_id = (SELECT private.current_hospital_id()) AND (SELECT private.may_prescribe_here())
         AND patient_user_id IN (SELECT private.accessible_patient_ids()));

-- The nurse's chip (PA2-5, D-PH1-33): one word per line, through a definer function, nothing else.
CREATE OR REPLACE FUNCTION public.pharmacy_line_review_state(p_prescription uuid) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT CASE
    WHEN p.hospital_id IS DISTINCT FROM private.current_hospital_id()
         OR p.patient_user_id NOT IN (SELECT private.accessible_patient_ids()) THEN NULL
    WHEN EXISTS (SELECT 1 FROM public.pharmacy_queries q
                  WHERE q.prescription_id = p.id
                    AND NOT EXISTS (SELECT 1 FROM public.pharmacy_query_events e
                                     WHERE e.query_id = q.id AND e.kind IN ('answered','withdrawn'))) THEN 'queried'
    WHEN EXISTS (SELECT 1 FROM public.pharmacy_line_events e
                  WHERE e.prescription_id = p.id AND e.kind IN ('accepted','accepted_overridden_stop','reviewed')) THEN 'reviewed'
    ELSE 'not_reviewed' END
  FROM public.prescriptions p WHERE p.id = p_prescription;
$$;
REVOKE ALL ON FUNCTION public.pharmacy_line_review_state(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pharmacy_line_review_state(uuid) TO medsync_clinical_reader;
