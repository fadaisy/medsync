/**
 * Paying the booking fee, read the same on the phone, the web and the desk (patient app v2 §5.4, PA5).
 * The rules live once, in `supabase/functions/_shared/payments.ts` (zero imports, also run by the Edge
 * Functions); this file only re-exports them for the two apps (ADR 0420: a rule written twice is a bug).
 */
export type {
  BillStatus,
  Channel,
  IntentStatus,
  Network,
  PaymentChip,
  PromptView,
  RefundEligibility,
  RefundStatus,
  TicketPayLine,
} from "../../supabase/functions/_shared/payments";

export {
  defaultPayChoice,
  maskMsisdn,
  NETWORK_NAME,
  normaliseUgMsisdn,
  paymentChip,
  promptView,
  refundEligibility,
  refundStep,
  ticketPayLine,
} from "../../supabase/functions/_shared/payments";
