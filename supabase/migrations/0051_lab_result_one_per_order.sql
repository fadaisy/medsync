-- 0051 — One result row per order (DB backstop for the lab entry upsert).
--
-- ⚠️ GATED — DO NOT APPLY TO PRODUCTION WITHOUT EXPLICIT, NAMED OWNER
-- AUTHORIZATION. Apply together with (or after) 0050 via `npm run db:migrate`.
-- Safe: encounter_results has NO insert path anywhere in the codebase except the
-- DARK lab action (gated behind LAB_RESULTS_LIVE, never run in prod), so the
-- table holds zero rows today — the unique index cannot find a duplicate to
-- reject. No backfill, no data rewrite.
--
-- Why: enterLabResultAction enforces "one result row per order" with a
-- select-then-upsert (read existing → update the editable row, else insert).
-- That is NOT atomic on the service connection: two concurrent first-enters for
-- the same order both read "none" and both insert → two rows for one order,
-- which the W4 clinician read + the lab worklist would double-render. This unique
-- index makes the DB the source of truth; the action catches the unique-violation
-- and falls back to an update (degrades the race into a correction). It also
-- serves the order_id equi-join, so it REPLACES the non-unique
-- enc_result_order_idx from 0040 (no redundant second B-tree).

drop index if exists enc_result_order_idx;

create unique index if not exists enc_result_one_per_order
  on encounter_results (order_id);
