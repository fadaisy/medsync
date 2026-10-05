/**
 * Shadow mode for the diabetes pack (I10; PROMPT-NCD-DIABETES Phase 3): the pack is computed beside the live NCD
 * clerkship and LOGGED, shown to nobody, unless NCD_DM_PACK_LIVE puts it on the screen. The log holds rule ids and
 * counts only; no value and no free text. The capture is translated exactly as go-live translates it
 * (`lib/ncd/pack/live.ts`), so the shadow log is what the clinician would have seen.
 */
import type { CaptureMap } from "@/lib/ncd/engine/evaluate";
import type { PackInput, PackResult } from "@/lib/ncd/pack/types";

import { toPackInput, toPackValues } from "@/lib/ncd/pack/live";

/** The live capture in the pack's shape (the go-live translator). */
export const translateCapture = (values: CaptureMap) => toPackValues(values);

/** The pack's input for a live capture, with what the caller knows of the patient. */
export function shadowInput(
  values: CaptureMap,
  ctx: { ageYears?: number; site?: PackInput["site"] },
): PackInput {
  return toPackInput(values, {
    ageYears: ctx.ageYears,
    site: ctx.site ?? "referral",
    established: false,
  });
}

/** What the shadow log keeps: ids and counts, never a value. */
export function shadowSummary(r: PackResult) {
  return {
    interrupt: r.interrupt,
    fired: Object.keys(r.fired).sort(),
    sameDay: Object.keys(r.urgency).filter((k) => r.urgency[k] === "same_day").length,
    dark: Object.keys(r.dark).length,
    withheld: r.withheld.length,
    caveats: r.caveats.length,
    gaps: Object.keys(r.gaps).length,
  };
}
