-- 0004 — auto-mirror auth.users INSERTs into public.users.
--
-- Supabase grants project owners CREATE TRIGGER on auth.users specifically
-- (this is the documented sign-up pattern). The function lives in public
-- (where we own everything) and is SECURITY DEFINER so it can INSERT into
-- public.users regardless of who called signUp().
--
-- Profile fields:
--   - id      = the auth.users.id (1:1)
--   - email   = the auth.users.email (NOT NULL there post-signup)
--   - full_name = raw_user_meta_data->>'full_name' if provided at signup,
--                  else fall back to the email (the user can update later).
--
-- This trigger removes the need for our sign-up server action to do its own
-- service-role insert. The form just calls supabase.auth.signUp() with
-- full_name in user metadata; the row mirrors automatically.

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'full_name', ''), NEW.email)
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();
