-- 0052 — department_scheduling_policy: one weekday convention, and one
--        reminder by default.
--
-- ⚠️ GATED — DO NOT APPLY TO PRODUCTION WITHOUT EXPLICIT, NAMED OWNER
-- AUTHORIZATION. Apply via `npm run db:migrate`.
--
-- ⚠️ SEQUENCING — this migration and the two JS-convention readers named in
-- §1 below must land together. Applying this alone is harmless (no shipped
-- row is ambiguous); shipping the /hospital-admin/scheduling policy editor
-- before the readers are fixed is NOT — the editor is the first thing in the
-- codebase that can write a 7, and on a 7 those two readers close Sunday.
--
--
-- ─── 1. The Sunday ambiguity ────────────────────────────────────────
--
-- `availability_blocks.recurrence_weekday` is ISO — CHECK BETWEEN 1 AND 7,
-- 1 = Monday, 7 = Sunday (0028). Its sibling one table over,
-- `department_scheduling_policy.bookable_weekdays`, carries NO constraint at
-- all, and today four pieces of code read it under two different
-- conventions:
--
--   ISO (1..7)   supabase/functions/_shared/slots.ts, via pt-request-appointment
--                and system-propose-urgent-appointment — the booking read AND
--                write path
--   JS  (0..6)   app/patient/queue/page.tsx (`getDay()`), and
--                supabase/functions/pt-declare-intake/index.ts (`getDay()`) —
--                the walk-in window
--
-- The two conventions agree Monday through Saturday and differ on exactly one
-- day. The column's default is ARRAY[1,2,3,4,5] — Mon-Fri under both — and
-- nothing in the codebase writes the column, so no shipped row is ambiguous
-- and no reader is wrong yet. That ends the moment an admin can tick Sunday.
--
-- ISO wins, because it is already the schema's convention (the sibling column
-- is CHECK-enforced ISO), because it is what the slot engine — the one file
-- both the read and the write path of booking share — already speaks, and
-- because `extract(isodow …)` is Postgres's own answer if this ever needs a
-- SQL reader.
--
-- The UPDATE below is expected to be a no-op: there is no INSERT or UPDATE of
-- bookable_weekdays anywhere in the codebase, so every existing row holds the
-- column default. It is written anyway, because a hand-seeded row is exactly
-- the case a CHECK would otherwise reject at apply time, and because
-- 0 → 7 is the correct rewrite under either reading.

update public.department_scheduling_policy
   set bookable_weekdays = array_replace(bookable_weekdays, 0::smallint, 7::smallint)
 where 0 = any(bookable_weekdays);

alter table public.department_scheduling_policy
  drop constraint if exists dept_policy_weekday_range;

-- `<@` is element-wise containment, so this rejects 0 and 8 without a
-- subquery. An empty array is contained by anything and therefore passes —
-- deliberately: `_shared/slots.ts` documents empty as "closed every day", and
-- that is a value an operator may legitimately want.
alter table public.department_scheduling_policy
  add constraint dept_policy_weekday_range check (
    bookable_weekdays <@ ARRAY[1,2,3,4,5,6,7]::smallint[]
  );


-- ─── 2. One reminder by default, and a ceiling on the number ────────
--
-- This column is a spend multiplier, not a preference. pt-request-appointment
-- and reschedule-appointment each insert ONE appointment_reminders row per
-- positive entry, so the array's LENGTH is the number of messages per
-- booking. Today those rows are channel='in_app' and cost nothing; ADR 0084
-- §13 makes the dispatcher one-way SMS, at which point the shipped default of
-- [1440, 60] bills every un-configured department twice per appointment,
-- forever, without anyone having chosen it.
--
-- The default becomes a single 24h reminder:
--
--   * The evidence supports A reminder, not two. One-way SMS shows OR 2.03
--     (12 trials, 6,448 participants, all sub-Saharan; ADR 0084 §13). Nothing
--     in that corpus measures the marginal value of a second message.
--   * The 1h lead is the weaker one HERE specifically. Mulago's assessment
--     centre runs a median 346-minute wait and patients queue from 4am
--     (ADR 0084). A message an hour before a slot lands after the patient has
--     already travelled or already decided not to; the 24h message lands while
--     the travel decision is still open.
--   * Two is still one tick away in /hospital-admin/scheduling, named and
--     priced, for a department that wants it.
--
-- The backfill is scoped to rows still holding exactly the old default. No
-- code path has ever written this column, so such a row got its value from
-- the default and nobody chose it.

alter table public.department_scheduling_policy
  alter column reminder_lead_minutes set default ARRAY[1440]::integer[];

update public.department_scheduling_policy
   set reminder_lead_minutes = ARRAY[1440]::integer[]
 where reminder_lead_minutes = ARRAY[1440, 60]::integer[];

-- The per-booking message ceiling, at the layer that cannot be bypassed. The
-- Edge Function's zod schema offers exactly one or two leads; this is what
-- stops a future writer — or a hand-run UPDATE — turning one booking into
-- fifty messages. array_length of an empty array is NULL, so "no reminders"
-- still passes.
alter table public.department_scheduling_policy
  drop constraint if exists dept_policy_reminder_count;

alter table public.department_scheduling_policy
  add constraint dept_policy_reminder_count check (
    array_length(reminder_lead_minutes, 1) is null
    or array_length(reminder_lead_minutes, 1) <= 2
  );
