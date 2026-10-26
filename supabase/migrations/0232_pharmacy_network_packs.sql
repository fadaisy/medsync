-- 0232 — Pharmacy Phase 4: the signed packs of Appendix D, as kinds of pharmacy_signed_sets (0122). GATE A signed
-- 26 Oct 2026 (D-PH4-29: the CSO signs alone for Steps 2 to 5).
--
-- GATED: owner-applied (`npm run db:migrate`), after 0231. ADDITIVE: the kind list only. No row is written; each
-- pack stays unsigned until its signers sign it, and while unsigned its feature does what Appendix D's right-hand
-- column says (no Repeats step, no setting aside, nothing routed, renewals answered only by Renew or Book a visit).
--
--   repeat_rules            repeat list, never-repeat list, maxima, minimum interval, tolerance (pharmacist reviewer + CSO)
--   refill_timing           request window, late window (pharmacy in charge + CSO)
--   hold_rules              hold days, extensions, hold-longer maximum, miss threshold (pharmacy in charge)
--   renewal_decline_reasons decline reasons (CSO)
--   routing_rules           routing list, never-routed list, response window (pharmacist reviewer + CSO)

ALTER TABLE public.pharmacy_signed_sets DROP CONSTRAINT IF EXISTS pharmacy_signed_sets_kind_check;
ALTER TABLE public.pharmacy_signed_sets ADD CONSTRAINT pharmacy_signed_sets_kind_check CHECK (kind IN (
  'lane_rule','high_risk_list','controlled_classes','witness_list','outcome_reasons','close_reasons',
  'decline_reasons','reversal_reasons','correction_reasons','adjustment_reasons','batch_choice_reasons',
  'count_difference_reasons','supply_without_pharmacist_reasons','payment_exemption_reasons',
  'identity_routes','query_codes','keep_reasons','withdraw_reasons','substitution_rule','label_fields',
  'warning_lines','additional_instructions','plain_words_templates','counselling_points','staff_copy',
  'patient_copy','message_name','availability_mapping',
  'order_parameters','tracer_list','cart_lookahead','month_end_rules','ward_rules','stores_reason_lists',
  'hmis_column_maps','recall_template','stockout_day_rule',
  'repeat_rules','refill_timing','hold_rules','renewal_decline_reasons','routing_rules'));
