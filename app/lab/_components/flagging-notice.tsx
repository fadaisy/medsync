import { TriangleAlertIcon } from "lucide-react";

import { CRITICAL_FLAGGING_NOTICE } from "@/content/lab";

/**
 * "Automatic critical flagging is off" (Lab Phase 0 §5.6, Law 10, ADR 0226). Standing information,
 * so `role="status"`, not an alert; it has no close button. Shown on every lab result screen while
 * criticalFlaggingActive() is false. Amber caution, a triangle and the words: never colour alone.
 */
export function FlaggingNotice() {
  const n = CRITICAL_FLAGGING_NOTICE;
  return (
    <div
      role="status"
      className="bg-status-caution-bg border-status-caution-bg text-body-s dark:text-status-caution-fg flex items-start gap-2.5 rounded-lg border px-3.5 py-3 text-amber-800"
    >
      <TriangleAlertIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
      <p>
        <strong className="font-semibold">{n.lead}</strong> {n.body}
      </p>
    </div>
  );
}
