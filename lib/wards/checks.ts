/**
 * The layout checks (ADR 0196): proposed warnings, two blocking. Pure; shared with ha-services-hub,
 * which recomputes them at publish.
 */
export {
  blockingFailures,
  layoutChecks,
  MONITORED_WARD_TYPES,
  warningTexts,
  type CheckCode,
  type LayoutCheck,
} from "@/supabase/functions/_shared/ward-layout";
