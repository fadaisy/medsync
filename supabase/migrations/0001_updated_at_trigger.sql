-- 0001 — set_updated_at() trigger.
-- Bumps `updated_at` on every UPDATE for tables that carry the column.
-- Standalone of Drizzle because drizzle-kit doesn't generate function/trigger DDL.

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach to every table that has an `updated_at` column. Idempotent via
-- DROP IF EXISTS so re-running is safe (we still gate via _medsync_migrations,
-- this is belt-and-braces).
DROP TRIGGER IF EXISTS users_updated_at ON public.users;
CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS hospitals_updated_at ON public.hospitals;
CREATE TRIGGER hospitals_updated_at
  BEFORE UPDATE ON public.hospitals
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS hospital_departments_updated_at ON public.hospital_departments;
CREATE TRIGGER hospital_departments_updated_at
  BEFORE UPDATE ON public.hospital_departments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
