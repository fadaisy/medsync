-- 0171 — Patient places and time-limited live location shares (Tide v1, ADR 0343).
--
-- 1. public.patient_places: the places a patient pins on a real map and labels (home, work, or their own word),
--    each with the consent it was saved under. At most one is the home (`is_home`), which clinic suggestions use.
--    Patient-only RLS, like the 0029 self-tracking tables: nobody else reads them yet.
--    The single home pin of 0170 (patient_profiles.home_pin_*) is copied in once as a 'home' place and is not
--    written again; the phone reads and writes patient_places only.
-- 2. public.location_shares: "Share my live location" for a bounded time (15 minutes, 1 hour, or until stopped,
--    at most 8 hours). Only the latest position is kept, never a trail. The patient's phone updates it while the
--    app is open. A share has an unguessable token (made by the database) for the link the patient sends to family; the web page at
--    /share/location/<token> reads it through public.location_share_view(token) while it is live, and nothing
--    after it ends. The patient can stop it at any time.
-- 3. public.location_share_view(token): SECURITY DEFINER read for the family link: the position, when it was
--    taken, and when the share ends, for a live, unexpired share only. No name, no patient id.
--
-- ADDITIVE and re-runnable. Owner-applied (`npm run db:migrate -- 0171`).
-- Reverse: DROP FUNCTION public.location_share_view(text); DROP TABLE public.location_shares;
-- DROP TABLE public.patient_places (0170's columns are untouched).

-- ─── 1. Saved places ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.patient_places (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('home', 'work', 'other')),
  -- The patient's own word for an 'other' place ("Mum's house"); null for home and work.
  custom_label text CHECK (custom_label IS NULL OR char_length(custom_label) BETWEEN 1 AND 40),
  lat numeric(9,6) NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lng numeric(9,6) NOT NULL CHECK (lng BETWEEN -180 AND 180),
  -- What the phone's geocoder said about the pin, as the patient confirmed or edited it.
  address text CHECK (address IS NULL OR char_length(address) <= 200),
  is_home boolean NOT NULL DEFAULT false,
  consent_version text NOT NULL,
  consented_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT patient_places_other_label CHECK ((kind = 'other') = (custom_label IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS patient_places_patient_idx ON public.patient_places (patient_user_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS patient_places_one_home
  ON public.patient_places (patient_user_id) WHERE is_home;

ALTER TABLE public.patient_places ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_places FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS patient_places_select_own ON public.patient_places;
CREATE POLICY patient_places_select_own ON public.patient_places
  FOR SELECT TO authenticated USING (patient_user_id = auth.uid());
DROP POLICY IF EXISTS patient_places_insert_own ON public.patient_places;
CREATE POLICY patient_places_insert_own ON public.patient_places
  FOR INSERT TO authenticated WITH CHECK (patient_user_id = auth.uid());
DROP POLICY IF EXISTS patient_places_update_own ON public.patient_places;
CREATE POLICY patient_places_update_own ON public.patient_places
  FOR UPDATE TO authenticated USING (patient_user_id = auth.uid()) WITH CHECK (patient_user_id = auth.uid());
DROP POLICY IF EXISTS patient_places_delete_own ON public.patient_places;
CREATE POLICY patient_places_delete_own ON public.patient_places
  FOR DELETE TO authenticated USING (patient_user_id = auth.uid());

DROP TRIGGER IF EXISTS patient_places_updated_at ON public.patient_places;
CREATE TRIGGER patient_places_updated_at
  BEFORE UPDATE ON public.patient_places
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS audit_patient_places ON public.patient_places;
CREATE TRIGGER audit_patient_places
  AFTER INSERT OR UPDATE OR DELETE ON public.patient_places
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes();

-- 0170's single home pin, once, as the home place.
INSERT INTO public.patient_places
  (patient_user_id, kind, lat, lng, is_home, consent_version, consented_at)
SELECT p.id, 'home', p.home_pin_lat, p.home_pin_lng, true, p.home_pin_consent_version, p.home_pin_consented_at
FROM public.patient_profiles p
WHERE p.home_pin_lat IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.patient_places x WHERE x.patient_user_id = p.id AND x.is_home);

-- ─── 2. Live location shares ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.location_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- The link's secret, made here (two random v4 UUIDs, 64 hex characters, about 244 random bits): the phone
  -- has no secure random source, so it never makes one. Only the family link carries it.
  token text NOT NULL UNIQUE
    DEFAULT replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')
    CHECK (token ~ '^[0-9a-f]{64}$'),
  purpose text NOT NULL CHECK (purpose IN ('emergency', 'visit', 'other')),
  started_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz NOT NULL,
  stopped_at timestamptz,
  -- The latest position only: never a trail.
  lat numeric(9,6) CHECK (lat IS NULL OR lat BETWEEN -90 AND 90),
  lng numeric(9,6) CHECK (lng IS NULL OR lng BETWEEN -180 AND 180),
  accuracy_m numeric(8,1) CHECK (accuracy_m IS NULL OR accuracy_m >= 0),
  position_at timestamptz,
  consent_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT location_shares_window CHECK (ends_at > started_at AND ends_at <= started_at + interval '8 hours')
);
CREATE INDEX IF NOT EXISTS location_shares_patient_idx ON public.location_shares (patient_user_id, started_at DESC);

ALTER TABLE public.location_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.location_shares FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS location_shares_select_own ON public.location_shares;
CREATE POLICY location_shares_select_own ON public.location_shares
  FOR SELECT TO authenticated USING (patient_user_id = auth.uid());
DROP POLICY IF EXISTS location_shares_insert_own ON public.location_shares;
CREATE POLICY location_shares_insert_own ON public.location_shares
  FOR INSERT TO authenticated WITH CHECK (patient_user_id = auth.uid());
DROP POLICY IF EXISTS location_shares_update_own ON public.location_shares;
CREATE POLICY location_shares_update_own ON public.location_shares
  FOR UPDATE TO authenticated USING (patient_user_id = auth.uid()) WITH CHECK (patient_user_id = auth.uid());

DROP TRIGGER IF EXISTS location_shares_updated_at ON public.location_shares;
CREATE TRIGGER location_shares_updated_at
  BEFORE UPDATE ON public.location_shares
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── 3. The family link's read ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.location_share_view(p_token text)
RETURNS TABLE (lat numeric, lng numeric, accuracy_m numeric, position_at timestamptz, ends_at timestamptz,
               purpose text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT s.lat, s.lng, s.accuracy_m, s.position_at, s.ends_at, s.purpose
  FROM public.location_shares s
  WHERE s.token = p_token
    AND s.stopped_at IS NULL
    AND s.ends_at > now();
$$;

REVOKE ALL ON FUNCTION public.location_share_view(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.location_share_view(text) TO anon, authenticated;
