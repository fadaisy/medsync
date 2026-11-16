-- GATED — applied by the owner (`npm run db:migrate`), never auto-run.
-- 0302: the refund rule a patient may read (patient app v2 §5.4 P5). Before cancelling a paid visit the app
-- shows "Cancel before {cutoff} and it goes back to the same Mobile Money". The cut-off lives on
-- hospital_payment_accounts, which only the hospital's staff read (0299). This view gives every signed-in
-- person the cut-off hours alone, for hospitals that take Mobile Money; nothing about the merchant account.
CREATE OR REPLACE VIEW public.hospital_refund_rules AS
SELECT hospital_id, refund_cutoff_hours
  FROM public.hospital_payment_accounts
 WHERE enabled;
REVOKE ALL ON public.hospital_refund_rules FROM PUBLIC, anon;
GRANT SELECT ON public.hospital_refund_rules TO authenticated;
