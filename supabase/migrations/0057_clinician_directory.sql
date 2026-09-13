-- 0057 — clinician_directory: the name and photograph of every active clinician.
--
-- ⚠️ GATED — DO NOT APPLY TO PRODUCTION WITHOUT EXPLICIT, NAMED OWNER
-- AUTHORIZATION. Apply via `npm run db:migrate`.
--
-- A patient's own appointments name a clinician by `clinician_user_id`, but
-- `users` is own-row-only under RLS (0002) and the column references
-- auth.users, so the phone could never say who the visit is with — every
-- card read "Your clinician" with a glyph. `pt-bookable-clinicians` already
-- hands a patient the name and photo of every active clinician at their
-- hospital, so the information is not secret; only the table it lives in is.
--
-- This view is the narrow door: id, full_name and avatar_path — nothing
-- else from `users` (no email, no phone, no state) — for people who hold an
-- active CLINICAL affiliation somewhere. It runs with the owner's rights
-- (the default; not `security_invoker`) precisely so it can read past the
-- `users` policy; the SELECT list is the whole exposure. Signed-in only.

CREATE OR REPLACE VIEW public.clinician_directory AS
  SELECT DISTINCT
    u.id,
    u.full_name,
    u.avatar_path
  FROM public.users u
  JOIN public.staff_affiliations sa ON sa.user_id = u.id
  JOIN public.cadres c ON c.id = sa.cadre_id
  WHERE sa.state IN ('active', 'approved')
    AND c.is_clinical = true;

REVOKE ALL ON public.clinician_directory FROM anon;
GRANT SELECT ON public.clinician_directory TO authenticated;
