/**
 * The published layout → the bed register (ADR 0192), pure. The implementation lives in
 * supabase/functions/_shared/ward-layout.ts so ha-services-hub runs exactly this code; the app uses it
 * for the publish preview.
 */
export {
  planSummary,
  publishPayload,
  reconcile,
  syncWithRegister,
  type KeptBed,
  type NewBed,
  type ReconcileOutcome,
  type ReconcilePlan,
  type RegisterBed,
} from "@/supabase/functions/_shared/ward-layout";
