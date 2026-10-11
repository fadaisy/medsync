import type { RefEntry } from "@/lib/resus/reference/ref";

import { CRITICAL_REFS, REF_CRIT_TIMEFRAME } from "@/lib/emr/reference/critical";

/**
 * Is MedSync flagging critical values at this hospital? (Lab Phase 0, ADR 0226; CF-1.) True only
 * when a signed, in-force set of critical limits exists: every REF-CRIT entry and the call time
 * frame signed by the CSO. Today every entry is pending, so this is false and the result screens
 * say so (Law 10). The limits are hospital-wide for now; Lab Phase 1 replaces this body with the
 * per-hospital signed set, and its callers do not change.
 */
export function criticalFlaggingActive(
  _hospitalId: string,
  refs: readonly RefEntry[] = [...CRITICAL_REFS, REF_CRIT_TIMEFRAME],
): boolean {
  return refs.length > 0 && refs.every((r) => r.status === "signed");
}
