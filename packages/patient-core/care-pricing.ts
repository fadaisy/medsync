/**
 * Care programme and Plus pricing, read the same on the phone, the web and the hospital's setup page. The rule
 * lives once, in `supabase/functions/_shared/care-pricing.ts`; this only re-exports it (ADR 0420).
 */
export type {
  CareRole,
  Period,
  PricingInputs,
  TeamRole,
} from "../../supabase/functions/_shared/care-pricing";

export {
  costPerMember,
  monthlyPrice,
  PERIOD_MONTHS,
  periodPrice,
  programmeNameAllowed,
  ROLE_WORDS,
  tetherShare,
} from "../../supabase/functions/_shared/care-pricing";
