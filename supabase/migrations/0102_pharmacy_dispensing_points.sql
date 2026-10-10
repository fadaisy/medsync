-- 0102 — Dispensing points: units of the Pharmacy department with what each serves (Pharmacy Phase
-- 0, ADR 0236; gate-a-proposal §4.5 and §6.1, D-PH0-14, signed 2026-10-10).
--
-- GATED: owner-applied (`npm run db:migrate`), after 0101.
--
-- A dispensing point is a unit (hospital_departments row) of a hospital's Pharmacy department. Its
-- name, place, hours and in-charge are the hub's own unit fields; this table adds one thing, what
-- it `serves` — window (outpatients, clinics and discharges), wards, emergency, or all — which only
-- decides the lane its staff's queue opens on (DP-4). It routes nothing, hides nothing, holds no
-- stock and records no dispensing. Once a hospital has a point, its "dispensing points" count and
-- "pharmacy open 24 hours" are worked out from the points and can no longer be typed (DP-2, CAP-3).
--
-- 1:1 with the unit (units are shared by every department, so no column on hospital_departments).
-- RLS on with no client policy: the hub writes it through ha-services-hub (service role, audited),
-- and the app reads it server-side. ADDITIVE.

CREATE TABLE IF NOT EXISTS public.pharmacy_dispensing_points (
  department_id uuid PRIMARY KEY REFERENCES public.hospital_departments(id) ON DELETE CASCADE,
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  serves text NOT NULL CHECK (serves IN ('window', 'wards', 'emergency', 'all')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS pharmacy_dispensing_points_hospital_idx
  ON public.pharmacy_dispensing_points (hospital_id);

ALTER TABLE public.pharmacy_dispensing_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pharmacy_dispensing_points FORCE ROW LEVEL SECURITY;
