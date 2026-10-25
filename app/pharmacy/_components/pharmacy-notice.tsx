import { CautionNotice } from "@/components/medsync/caution-notice";
import { PHARMACY_NOTICE } from "@/content/pharmacy";
import { withSignedPairs } from "@/content/pharmacy-clinical";
import { anythingNotDone, pharmacyChecksState } from "@/lib/pharmacy/check-state";

/**
 * "MedSync does not record dispensing yet" (§5.6, CS-4, Law 13). Wired to pharmacyChecksState,
 * never hard-coded on: it renders while any part is not done, which in this phase is always. The
 * counts come from the shipped list (CS-3); without them, the wording without numbers. No close
 * button; `role="status"`.
 */
export function PharmacyNotice({
  hospitalId,
  pairs = null,
}: {
  hospitalId: string;
  /** Pharmacy Phase 3 (5.1): the signed pair count with `pharmacyInteractions` on; null leaves the text. */
  pairs?: number | null;
}) {
  const state = pharmacyChecksState(hospitalId);
  if (!anythingNotDone(state)) return null;
  const refs = state.doseReferences;
  const body = refs
    ? PHARMACY_NOTICE.bodyCounts
        .replace("{signed}", String(refs.signed))
        .replace("{total}", String(refs.total))
    : PHARMACY_NOTICE.bodyNoCounts;
  return <CautionNotice lead={PHARMACY_NOTICE.lead}>{withSignedPairs(body, pairs)}</CautionNotice>;
}
