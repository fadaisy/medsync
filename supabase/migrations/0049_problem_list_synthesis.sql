-- 0049 — Queryable problem-list synthesis projection (Assessment GATE A).
--
-- ⚠️ GATED — DO NOT APPLY TO PRODUCTION WITHOUT EXPLICIT, NAMED OWNER
-- AUTHORIZATION. Additive only; safe + reversible (four NULLABLE columns + two
-- NULL-tolerant CHECKs on an existing table — no backfill, no data rewrite). The
-- TypeScript writes ship DARK behind PROBLEM_LIST_SYNTHESIS_LIVE — set that flag
-- to "1" only AFTER this migration is applied (`npm run db:migrate`). Requires the
-- encounter spine (0040) applied.
--
-- The Assessment tab models each problem richly in the versioned section_data
-- (ClerkProblem: kind / status / linkedTo / provenance — a vital starts as its
-- own first-class problem and can be LINKED under a working diagnosis as the
-- reasoning firms up). These columns surface that modelling on the `problem_list`
-- projection so it is QUERYABLE (e.g. "active vital problems not yet linked")
-- WITHOUT parsing the JSON section_data. The canonical `active` boolean still
-- drives the live list; `status` is the finer synthesis lifecycle.
--
-- Columns are nullable: every pre-existing row and every write made while the
-- flag is OFF simply leaves them NULL, so the read path (which selects an
-- explicit pre-0049 column list) is unaffected either way.

alter table problem_list
  add column if not exists kind        text,
  add column if not exists status      text,
  add column if not exists linked_to   text,
  add column if not exists provenance  text;

-- NULL passes both CHECKs (legacy + flag-off rows), so these are safe to add to a
-- populated table without a backfill.
alter table problem_list
  drop constraint if exists problem_list_kind_check;
alter table problem_list
  add constraint problem_list_kind_check
  check (kind is null or kind in ('vital','diagnosis','finding','background'));

alter table problem_list
  drop constraint if exists problem_list_status_check;
alter table problem_list
  add constraint problem_list_status_check
  check (status is null or status in ('active','resolved','linked'));
