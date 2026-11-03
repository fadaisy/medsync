-- 0272 — Shelves in the store: where each batch was put away (the Main store prototype, put-away).
--
-- GATED: owner-applied (`npm run db:migrate`), after 0271.
--
-- pharmacy_batch_shelves is append-only: each row puts a batch on a shelf, and the latest row per batch is where it
-- is now. A separate table, because the batch guard (0124/0180) lets a batch change only its number and expiry. The
-- pick list reads the shelf; nothing else depends on it, so a batch with no row simply has no shelf yet.
--
-- ADDITIVE and re-runnable. No client grants: writes come from the server connection.
-- Reverse: DROP TABLE public.pharmacy_batch_shelves.

CREATE TABLE IF NOT EXISTS public.pharmacy_batch_shelves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  batch_id uuid NOT NULL REFERENCES public.pharmacy_batches(id) ON DELETE RESTRICT,
  shelf text NOT NULL CHECK (shelf ~ '^[A-Z0-9][A-Z0-9 ./-]{0,19}$'),
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pbs_batch ON public.pharmacy_batch_shelves (batch_id, created_at DESC);

DROP TRIGGER IF EXISTS pbs_append_only ON public.pharmacy_batch_shelves;
CREATE TRIGGER pbs_append_only BEFORE UPDATE OR DELETE ON public.pharmacy_batch_shelves
  FOR EACH ROW EXECUTE FUNCTION public.block_modify_append_only();
DROP TRIGGER IF EXISTS audit_pharmacy_batch_shelves ON public.pharmacy_batch_shelves;
CREATE TRIGGER audit_pharmacy_batch_shelves AFTER INSERT OR UPDATE OR DELETE ON public.pharmacy_batch_shelves
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes();

ALTER TABLE public.pharmacy_batch_shelves ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pharmacy_batch_shelves FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.pharmacy_batch_shelves FROM anon, authenticated;
GRANT SELECT ON public.pharmacy_batch_shelves TO medsync_clinical_reader;
DROP POLICY IF EXISTS pharmacy_batch_shelves_select ON public.pharmacy_batch_shelves;
CREATE POLICY pharmacy_batch_shelves_select ON public.pharmacy_batch_shelves FOR SELECT TO medsync_clinical_reader
  USING (hospital_id = (SELECT private.current_hospital_id()) AND (SELECT private.pharmacy_can('pharmacy.view')));
