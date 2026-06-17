/**
 * Lab result entry — PURE validation + critical-flag derivation (no DB).
 *
 * The privileged writes live in app/lab/actions.ts; this module holds the
 * input schemas + the value→critical-flag computation so they can be unit
 * tested. HARD invariant: `entered` (recorded, releasedAt null) ≠ `released`
 * (the deliberate, cadre-gated act that makes a result visible to the clinician).
 * Critical-flag derivation is inert until CRITICAL_VALUES_CSO_SIGNED (it never
 * auto-fires on unratified thresholds). No fabrication — every field is entered.
 */
import type { CriticalFlag } from "@/lib/lab/critical-values";
import { z } from "zod";

import { criticalValueFor, evaluateCriticalFlag } from "@/lib/lab/critical-values";

/** Enter (or correct) a result for an order — the technologist's data entry. */
export const LabResultEntrySchema = z.object({
  orderId: z.string().uuid(),
  value: z.string().trim().min(1).max(200),
  unit: z.string().trim().max(40).optional(),
  specimenType: z.string().trim().max(80).optional(),
  specimenId: z.string().trim().max(80).optional(),
  specimenCollectedAtIso: z.string().datetime().optional(),
  referenceRangeText: z.string().trim().max(160).optional(),
  loincCode: z.string().trim().max(40).optional(),
});
export type LabResultEntry = z.infer<typeof LabResultEntrySchema>;

/** Release or reject act on an already-entered result. */
export const LabReleaseSchema = z.object({ resultId: z.string().uuid() });
export const LabRejectSchema = z.object({
  resultId: z.string().uuid(),
  reason: z.string().trim().min(3).max(200),
});

/**
 * Derive the critical flag for a result value. Strips units/symbols to a number;
 * non-numeric (qualitative) results → null. Delegates to the GATED
 * evaluateCriticalFlag, so it returns null until the critical-value list is
 * CSO-signed — a critical can never be auto-raised on an unratified threshold.
 */
export function deriveCriticalFlag(
  value: string,
  loinc?: string | null,
  code?: string,
): CriticalFlag {
  const num = Number(value.replace(/[^0-9.\-]/g, ""));
  if (!Number.isFinite(num) || value.replace(/[^0-9.\-]/g, "") === "") return null;
  return evaluateCriticalFlag(criticalValueFor(loinc, code), num);
}
