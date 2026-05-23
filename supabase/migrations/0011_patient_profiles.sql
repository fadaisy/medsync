-- 0011 — Patient profiles + MS-YYYY-NNNNN code issuance (Phase 1, GATE C).
--
-- Adds the patient-specific profile table, two enums (sex + ID type),
-- and an atomic patient_code sequence/issuer so the dashboard can show
-- a stable MS-2026-00001 style ID for every signed-up patient.
--
-- Also seeds a minimal set of Uganda districts + a handful of Kampala
-- subcounties so the patient signup form has data to exercise. The
-- full UBOS NPHC 2024 framework pull is still deferred to GATE G per
-- 0010's notes.
--
-- PHI fields (id_number, phone) are stored as ciphertext produced by
-- lib/encryption.ts (AES-256-GCM). Plaintext copies in auth.users
-- (email, phone) are operational identifiers, not PHI per the kickoff.

-- ─── Enums ──────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE public.patient_sex AS ENUM ('female', 'male', 'other');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.patient_id_type AS ENUM ('nin', 'passport', 'refugee', 'none');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── Patient code sequence + issuer ─────────────────────────────────────
-- Sequence is monotonic; issuer formats as MS-YYYY-00000. Year is taken
-- at issuance time so a January-of-next-year signup gets a new prefix
-- without a separate sequence rollover.
CREATE SEQUENCE IF NOT EXISTS public.patient_code_seq;

CREATE OR REPLACE FUNCTION public.issue_patient_code()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  yr text := to_char(now(), 'YYYY');
  n bigint := nextval('public.patient_code_seq');
BEGIN
  RETURN format('MS-%s-%s', yr, lpad(n::text, 5, '0'));
END $$;

-- ─── patient_profiles table ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.patient_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  patient_code text NOT NULL UNIQUE DEFAULT public.issue_patient_code(),
  sex public.patient_sex NOT NULL,
  date_of_birth date NOT NULL,
  id_type public.patient_id_type NOT NULL,
  -- Ciphertext: iv:authTag:ciphertext from lib/encryption.ts. Nullable
  -- when id_type='none' (refugee or in-process; collect later).
  id_number_encrypted text,
  -- Phone is ciphertext. Plaintext copy lives in public.users.phone
  -- (already-nullable) for operational use (SMS routing, support).
  phone_encrypted text NOT NULL,
  district_id uuid REFERENCES public.ref_districts(id) ON DELETE RESTRICT,
  subcounty_id uuid REFERENCES public.ref_subcounties(id) ON DELETE RESTRICT,
  -- Free-form ISO 639-1 / 639-3 code or human name. Constrained later
  -- when we ship the actual language picker.
  preferred_language text,
  primary_facility_id uuid REFERENCES public.hospitals(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT patient_profiles_id_number_check
    CHECK (
      (id_type = 'none' AND id_number_encrypted IS NULL)
      OR (id_type <> 'none' AND id_number_encrypted IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS patient_profiles_district_idx
  ON public.patient_profiles(district_id);
CREATE INDEX IF NOT EXISTS patient_profiles_facility_idx
  ON public.patient_profiles(primary_facility_id);

CREATE TRIGGER patient_profiles_set_updated_at
  BEFORE UPDATE ON public.patient_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── Seed minimal Uganda districts so the form has data ─────────────────
-- Subset of the UBOS list; expanded to the full 135 districts + 11 cities
-- in a follow-up GATE G migration. UUID prefix 1xx for districts, 2xxxx
-- for subcounties (all lowercase hex).
INSERT INTO public.ref_districts (id, region_id, code, name, is_city) VALUES
  -- Central
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-0000000000a1', 'KAMPALA',  'Kampala',  true),
  ('00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-0000000000a1', 'WAKISO',   'Wakiso',   false),
  ('00000000-0000-0000-0000-000000000103', '00000000-0000-0000-0000-0000000000a1', 'MUKONO',   'Mukono',   false),
  ('00000000-0000-0000-0000-000000000104', '00000000-0000-0000-0000-0000000000a1', 'MPIGI',    'Mpigi',    false),
  ('00000000-0000-0000-0000-000000000105', '00000000-0000-0000-0000-0000000000a1', 'LUWERO',   'Luwero',   false),
  ('00000000-0000-0000-0000-000000000106', '00000000-0000-0000-0000-0000000000a1', 'MASAKA',   'Masaka',   true),
  -- Eastern
  ('00000000-0000-0000-0000-000000000107', '00000000-0000-0000-0000-0000000000a2', 'JINJA',    'Jinja',    true),
  ('00000000-0000-0000-0000-000000000108', '00000000-0000-0000-0000-0000000000a2', 'MBALE',    'Mbale',    true),
  ('00000000-0000-0000-0000-000000000109', '00000000-0000-0000-0000-0000000000a2', 'SOROTI',   'Soroti',   true),
  ('00000000-0000-0000-0000-00000000010a', '00000000-0000-0000-0000-0000000000a2', 'TORORO',   'Tororo',   false),
  ('00000000-0000-0000-0000-00000000010b', '00000000-0000-0000-0000-0000000000a2', 'IGANGA',   'Iganga',   false),
  -- Northern
  ('00000000-0000-0000-0000-00000000010c', '00000000-0000-0000-0000-0000000000a3', 'GULU',     'Gulu',     true),
  ('00000000-0000-0000-0000-00000000010d', '00000000-0000-0000-0000-0000000000a3', 'LIRA',     'Lira',     true),
  ('00000000-0000-0000-0000-00000000010e', '00000000-0000-0000-0000-0000000000a3', 'ARUA',     'Arua',     true),
  ('00000000-0000-0000-0000-00000000010f', '00000000-0000-0000-0000-0000000000a3', 'KITGUM',   'Kitgum',   false),
  ('00000000-0000-0000-0000-000000000110', '00000000-0000-0000-0000-0000000000a3', 'MOROTO',   'Moroto',   false),
  -- Western
  ('00000000-0000-0000-0000-000000000111', '00000000-0000-0000-0000-0000000000a4', 'MBARARA',  'Mbarara',  true),
  ('00000000-0000-0000-0000-000000000112', '00000000-0000-0000-0000-0000000000a4', 'KABALE',   'Kabale',   false),
  ('00000000-0000-0000-0000-000000000113', '00000000-0000-0000-0000-0000000000a4', 'KASESE',   'Kasese',   false),
  ('00000000-0000-0000-0000-000000000114', '00000000-0000-0000-0000-0000000000a4', 'HOIMA',    'Hoima',    true),
  ('00000000-0000-0000-0000-000000000115', '00000000-0000-0000-0000-0000000000a4', 'FORT_PORTAL', 'Fort Portal', true)
ON CONFLICT (code) DO NOTHING;

-- Kampala divisions as subcounties (cascading combobox can render
-- them when Kampala is picked). Other districts seed in GATE G.
INSERT INTO public.ref_subcounties (id, district_id, code, name) VALUES
  ('00000000-0000-0000-0000-000000020101', '00000000-0000-0000-0000-000000000101', 'KAMPALA_CENTRAL', 'Kampala Central Division'),
  ('00000000-0000-0000-0000-000000020102', '00000000-0000-0000-0000-000000000101', 'KAWEMPE',         'Kawempe Division'),
  ('00000000-0000-0000-0000-000000020103', '00000000-0000-0000-0000-000000000101', 'MAKINDYE',        'Makindye Division'),
  ('00000000-0000-0000-0000-000000020104', '00000000-0000-0000-0000-000000000101', 'NAKAWA',          'Nakawa Division'),
  ('00000000-0000-0000-0000-000000020105', '00000000-0000-0000-0000-000000000101', 'RUBAGA',          'Rubaga Division')
ON CONFLICT (district_id, code) DO NOTHING;

-- Record version trace for the seed.
INSERT INTO public.ref_data_versions (dataset, source, source_url, version_date, row_count, notes)
VALUES
  ('ug_districts_minimal',
   'Hand-seeded subset of UBOS NPHC 2024 framework (GATE C bootstrap)',
   NULL, '2026-05-23', 21,
   'Minimum coverage to unblock /signup/patient. Full 135 districts + 11 cities deferred to GATE G.'),
  ('ug_subcounties_kampala',
   'KCCA — Kampala City Council Authority divisions',
   NULL, '2026-05-23', 5,
   'Kampala-only. Other districts'' subcounties to be seeded in GATE G.')
ON CONFLICT (dataset, version_date) DO NOTHING;
