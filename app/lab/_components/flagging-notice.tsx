import { CautionNotice } from "@/components/medsync/caution-notice";
import { CRITICAL_FLAGGING_NOTICE } from "@/content/lab";
import { CRITICALS_COPY } from "@/content/lab-criticals";

/**
 * "Automatic critical flagging is off" (Lab Phase 0 §5.6, Law 10, ADR 0226). Standing information,
 * so `role="status"`, not an alert; it has no close button. Shown on every lab result screen while
 * criticalFlaggingActive() is false. Amber caution, a triangle and the words: never colour alone.
 */
export function FlaggingNotice({ phase1 = null }: { phase1?: "on" | "off" | null }) {
  // Lab Phase 1 (CF-1): with LAB_CRITICALS on, the signed state decides; "on" is neutral information.
  if (phase1 === "on")
    return (
      <p role="status" className="text-body-s text-muted-foreground">
        <strong className="text-foreground font-medium">{CRITICALS_COPY.noticeOn.lead}</strong>{" "}
        {CRITICALS_COPY.noticeOn.body}
      </p>
    );
  const n = phase1 === "off" ? CRITICALS_COPY.noticeOff : CRITICAL_FLAGGING_NOTICE;
  return <CautionNotice lead={n.lead}>{n.body}</CautionNotice>;
}
