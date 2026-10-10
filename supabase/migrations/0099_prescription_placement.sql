-- 0099 — One placed prescription has one id (Pharmacy Phase 0, ADR 0230; gate-a-proposal §6.1,
-- D-PH0-08, signed 2026-10-10).
--
-- GATED: owner-applied (`npm run db:migrate`), after 0098.
--
-- prescriptions.placement_id: every line written in one placement (a Plan basket, or one prescribe
-- on the EMR sheet) carries the same id, so the pharmacy queue shows one row per prescription the
-- patient carries (PQ-1). Rows written before this migration keep NULL and are grouped by
-- encounter + prescriber + created_at (one placement shares one transaction time), marked
-- "grouped by time". No backfill: an inferred id would look like a recorded one.
--
-- ADDITIVE: one nullable column and one index. Nothing else on prescriptions changes.

ALTER TABLE public.prescriptions ADD COLUMN IF NOT EXISTS placement_id uuid;

CREATE INDEX IF NOT EXISTS prescriptions_hospital_created_idx
  ON public.prescriptions (hospital_id, created_at);
