-- 0059 — Booking receipts and the session allocator as SQL functions (Gate C, ADR 0088).
--
-- ⚠️ GATED — DO NOT APPLY TO PRODUCTION WITHOUT EXPLICIT, NAMED OWNER
-- AUTHORIZATION. Apply via `npm run db:migrate`.
--
-- Additive. Nothing shipped changes shape or meaning:
--   1. appointment_reminders.kind   'reminder' (every existing row) | 'receipt'
--   2. allocate_session_position()  the ADR 0087 allocator, callable over RPC
--   3. next_sessions_of_line()      what a 409 from the allocator offers
--   4. release_session_position()   the compensating decrement
--
-- The (state, scheduled_at) index the dispatcher needs already exists —
-- `appointment_reminders_dispatcher_idx` (0028), partial on state='queued' —
-- so none is added here.


-- ─── 1. appointment_reminders.kind ───────────────────────────────────
--
-- A booking receipt (proposal §7.2, "booking_receipt") rides the SAME queue
-- and the SAME */15 dispatcher as a reminder — one transport, one cost
-- path. It is a row scheduled for now(); the planner tells the two apart by
-- this column: a reminder is reaped when stale, a receipt is sent whenever
-- it is found, and the body is composed by `lib/notifications/receipt.ts`.

ALTER TABLE public.appointment_reminders
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'reminder';

ALTER TABLE public.appointment_reminders
  DROP CONSTRAINT IF EXISTS reminders_kind_check;
ALTER TABLE public.appointment_reminders
  ADD CONSTRAINT reminders_kind_check CHECK (kind IN ('reminder','receipt'));


-- ─── 2. allocate_session_position ────────────────────────────────────
--
-- The atomic allocator of ADR 0087 / `_shared/sessions-sql.ts`
-- (ALLOCATE_SESSION_POSITION_SQL), verbatim in its two load-bearing clauses.
-- supabase-js cannot run raw SQL, so the Edge Function calls this over RPC.
-- ONE statement, no SELECT first; zero rows (full, unpublished, or gone)
-- returns NULL and the caller answers 409 with the next two sessions.
--
-- SECURITY DEFINER and executable by service_role ONLY: a patient's JWT
-- must never be able to move a session's counters directly.

CREATE OR REPLACE FUNCTION public.allocate_session_position(p_session uuid)
RETURNS smallint
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  UPDATE public.clinic_sessions
     SET booked_count = booked_count + 1,
         next_position = next_position + 1
   WHERE id = p_session
     AND status = 'published'
     AND booked_count < ceil(capacity_booked * overbooking_factor)
  RETURNING next_position;
$$;

REVOKE ALL ON FUNCTION public.allocate_session_position(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.allocate_session_position(uuid) TO service_role;


-- ─── 3. next_sessions_of_line ────────────────────────────────────────
--
-- NEXT_SESSIONS_OF_LINE_SQL's shape, keyed by line rather than by the full
-- session so a caller that already holds the line id spends no subquery.
-- `places_left` is the number the patient surfaces show ("N places left").

CREATE OR REPLACE FUNCTION public.next_sessions_of_line(p_line uuid, p_after timestamptz)
RETURNS TABLE (
  id uuid,
  starts_at timestamptz,
  ends_at timestamptz,
  clinician_user_id uuid,
  venue text,
  places_left integer
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
  SELECT id, starts_at, ends_at, clinician_user_id, venue,
         (ceil(capacity_booked * overbooking_factor) - booked_count)::integer AS places_left
    FROM public.clinic_sessions
   WHERE service_line_id = p_line
     AND status = 'published'
     AND starts_at > p_after
     AND booked_count < ceil(capacity_booked * overbooking_factor)
   ORDER BY starts_at
   LIMIT 2;
$$;

REVOKE ALL ON FUNCTION public.next_sessions_of_line(uuid, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.next_sessions_of_line(uuid, timestamptz) TO service_role;


-- ─── 4. release_session_position ─────────────────────────────────────
--
-- The compensating decrement: an appointment INSERT that fails AFTER a
-- successful allocation, or a cancelled session booking, gives the place
-- back. `booked_count` only — `next_position` is monotonic, so a position
-- number is never re-issued (PRD §4.4). Floored at zero so a double release
-- can never trip `clinic_sessions_booked_count_range`.

CREATE OR REPLACE FUNCTION public.release_session_position(p_session uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  UPDATE public.clinic_sessions
     SET booked_count = greatest(booked_count - 1, 0)
   WHERE id = p_session;
$$;

REVOKE ALL ON FUNCTION public.release_session_position(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_session_position(uuid) TO service_role;
