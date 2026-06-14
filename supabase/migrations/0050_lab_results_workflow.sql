-- 0050 — Lab-technician results workflow (manual entry + verify/release + critical flags).
--
-- ⚠️ GATED — DO NOT APPLY TO PRODUCTION WITHOUT EXPLICIT, NAMED OWNER
-- AUTHORIZATION. Additive only; safe + reversible (nullable columns + two
-- NULL-tolerant CHECKs on an existing table — no backfill, no data rewrite). The
-- TypeScript writes ship DARK behind LAB_RESULTS_LIVE — set that flag to "1" only
-- AFTER this migration is applied (`npm run db:migrate`). Requires the encounter
-- spine (0040) applied.
--
-- The results-in counterpart to orders-out: the lab tech logs a specimen, enters
-- a result, and DELIBERATELY releases it (entered ≠ released). A result that
-- crosses a CSO-signed critical threshold carries a critical_flag (drives the
-- alert + priority release). The W4 clinician view treats only RELEASED results
-- as final. One data contract — these columns extend encounter_results; the
-- orders→results pipe is NOT forked.

alter table encounter_results
  add column if not exists specimen_type          text,
  add column if not exists specimen_collected_at  timestamptz,
  add column if not exists specimen_id            text,
  add column if not exists reference_range_text   text,
  add column if not exists critical_flag          text,
  add column if not exists quality_status         text,
  add column if not exists entered_by_user_id     uuid references auth.users(id) on delete set null,
  add column if not exists released_at            timestamptz,
  add column if not exists released_by_user_id    uuid references auth.users(id) on delete set null,
  add column if not exists rejection_reason       text;

-- NULL passes both CHECKs (legacy + flag-off rows), so these are safe on a
-- populated table without a backfill.
alter table encounter_results
  drop constraint if exists enc_result_quality_check;
alter table encounter_results
  add constraint enc_result_quality_check
  check (quality_status is null or quality_status in ('entered','released','rejected'));

alter table encounter_results
  drop constraint if exists enc_result_critical_check;
alter table encounter_results
  add constraint enc_result_critical_check
  check (critical_flag is null or critical_flag in ('panic_high','panic_low','critical'));

create index if not exists enc_result_released_idx on encounter_results (released_at);
