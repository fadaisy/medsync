-- 0111 — The NCD visit reads released lab results (Lab Phase 2, ADR 0259; NF-*, D-LAB2-14, -15).
--
-- The feed is a read model over the lab's own results (NF-3): the visit keeps only a reference to the
-- result it showed (report id, version, observation), never a copy of the number. An outside result keeps
-- the value and unit as printed, the date, the laboratory and the canonical value (NF-7), and is never a lab
-- result. Field mappings are signed configuration (lab_signed_configs kind 'ncd_mapping', 0107).
-- ADDITIVE and re-runnable. GATED: owner-applied (`npm run db:migrate -- 0111`).

ALTER TABLE public.ncd_visit
  ADD COLUMN IF NOT EXISTS lab_refs jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS outside_results jsonb NOT NULL DEFAULT '[]';
