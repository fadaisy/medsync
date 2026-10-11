import type { CriticalLimitVersion } from "@/lib/lab/flags";
import type { SignedStatus } from "@/lib/lab/ranges";
import type { RefEntry } from "@/lib/resus/reference/ref";

import { CRITICAL_REFS, REF_CRIT_TIMEFRAME } from "@/lib/emr/reference/critical";
import { inForceAt } from "@/lib/lab/ranges";

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

/**
 * CF-2 (Lab Phase 1): true only when this hospital has at least one signed, in-force critical limit
 * and a signed, in-force set of response times (a response set is in force from its second signature).
 * The read of both sets is CF-1's loader, wired at Step 6.
 */
export function flaggingActiveFrom(input: {
  hospitalId: string;
  at: Date;
  limitVersions: readonly Pick<
    CriticalLimitVersion,
    "hospitalId" | "status" | "inForceFrom" | "supersededAt" | "limits"
  >[];
  responseVersions: readonly {
    hospitalId: string;
    status: SignedStatus;
    inForceFrom: Date | null;
    supersededAt: Date | null;
  }[];
}): boolean {
  const here = (v: { hospitalId: string }) => v.hospitalId === input.hospitalId;
  const limits = input.limitVersions.some(
    (v) => here(v) && inForceAt(v, input.at) && v.limits.length > 0,
  );
  const times = input.responseVersions.some((v) => here(v) && inForceAt(v, input.at));
  return limits && times;
}
