import { CautionNotice } from "@/components/medsync/caution-notice";
import { CRITICAL_FLAGGING_NOTICE } from "@/content/lab";

/**
 * "Automatic critical flagging is off" (Lab Phase 0 §5.6, Law 10, ADR 0226). Standing information,
 * so `role="status"`, not an alert; it has no close button. Shown on every lab result screen while
 * criticalFlaggingActive() is false. Amber caution, a triangle and the words: never colour alone.
 */
export function FlaggingNotice() {
  const n = CRITICAL_FLAGGING_NOTICE;
  return <CautionNotice lead={n.lead}>{n.body}</CautionNotice>;
}
