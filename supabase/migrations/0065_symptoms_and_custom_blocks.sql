-- 0065 — What the patient says is bothering them, and a block a doctor names (ADR 0095).
--
-- ⚠️ GATED — DO NOT APPLY TO PRODUCTION WITHOUT EXPLICIT, NAMED OWNER
-- AUTHORIZATION. Apply via `npm run db:migrate`.
--
-- Owner ruling 2026-09-21 (ADR 0095): a booking may carry the symptoms the
-- patient chose to state, each with how long it has been going on, purely
-- as words for the clinic — never ranked, routed or scored (PRD §5.4 as
-- amended). And a clinician may add an availability block of their own
-- naming, colour-coded beside the six existing kinds.
--
-- Additive throughout. Sections, in order:
--   1. appointments.symptoms        jsonb list of {code, label, duration}
--   2. availability_blocks          kind += 'custom'; label for that kind
--
-- No new audit action: `book_appointment` / `book_on_behalf` already cover
-- the write, and `set_clinician_availability` covers the block. No RLS
-- change: both columns ride the policies their tables already have — a
-- patient reads their own symptoms back through `appointments_select_scoped`,
-- and `availability_blocks` has no client write policy at all.
--
-- Sequencing: apply BEFORE the redeployed `pt-request-appointment`,
-- `ha-book-on-behalf`, `reschedule-appointment`, `pt-accept-rebooking` and
-- `ha-set-clinician-availability` (they write the new columns) and BEFORE
-- the Next app that selects them.

-- ─── 1. appointments.symptoms ─────────────────────────────────────────
--
-- A list, or NULL when the patient said nothing. Each element is
-- {code: text|null, label: text, duration: text} — the shape is owned by
-- supabase/functions/_shared/symptoms.ts (zero-import, shared by Next, Deno
-- and the phone). The CHECK holds the container's type only; the element
-- shape is validated by every writer, all of which go through
-- `_shared/book.ts`.
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS symptoms jsonb;

ALTER TABLE public.appointments
  DROP CONSTRAINT IF EXISTS appointments_symptoms_is_list;
ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_symptoms_is_list
  CHECK (symptoms IS NULL OR jsonb_typeof(symptoms) = 'array');

COMMENT ON COLUMN public.appointments.symptoms IS
  'ADR 0095: what the patient said is bothering them, as they said it — [{code, label, duration}]. Descriptive only; never read by triage, clerkship or encounter code.';

-- ─── 2. availability_blocks: a seventh kind, with its own name ────────
--
-- 'custom' is inert to the slot engine (supabase/functions/_shared/slots.ts
-- lists neither BOOKABLE_KINDS nor BLOCKING_KINDS for it), exactly like
-- teaching, ward_round and admin: it is the clinician's own commitment,
-- drawn on their calendar, and does not stop a patient booking over it. A
-- clinician who needs to stop bookings uses 'unavailable' or 'leave'.
ALTER TABLE public.availability_blocks
  ADD COLUMN IF NOT EXISTS label text;

ALTER TABLE public.availability_blocks
  DROP CONSTRAINT IF EXISTS availability_blocks_kind_check;
ALTER TABLE public.availability_blocks
  ADD CONSTRAINT availability_blocks_kind_check
  CHECK (kind IN ('bookable','teaching','ward_round','admin','leave','unavailable','custom'));

ALTER TABLE public.availability_blocks
  DROP CONSTRAINT IF EXISTS availability_blocks_label_length;
ALTER TABLE public.availability_blocks
  ADD CONSTRAINT availability_blocks_label_length
  CHECK (label IS NULL OR char_length(label) BETWEEN 1 AND 40);

-- A custom block is its label; without one the calendar would print "Custom".
ALTER TABLE public.availability_blocks
  DROP CONSTRAINT IF EXISTS availability_blocks_custom_has_label;
ALTER TABLE public.availability_blocks
  ADD CONSTRAINT availability_blocks_custom_has_label
  CHECK (kind <> 'custom' OR label IS NOT NULL);

COMMENT ON COLUMN public.availability_blocks.label IS
  'ADR 0095: the clinician''s own name for a custom block (≤ 40 chars). Required when kind = custom; ignored otherwise.';
