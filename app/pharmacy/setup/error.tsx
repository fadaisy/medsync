"use client";

import { LabButton } from "@/components/tide/work/button";
import { PHWS2 } from "@/content/pharmacy-workspace-v2";

/** The place did not load: say nothing was changed, and offer one retry. */
export default function PlaceError({
  unstable_retry,
  reset,
}: {
  error: Error & { digest?: string };
  unstable_retry?: () => void;
  reset?: () => void;
}) {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col items-start gap-3 px-4 py-6 sm:px-6">
      <p className="text-body-m text-foreground">{PHWS2.kit.error}</p>
      <LabButton variant="primary" onClick={() => (unstable_retry ?? reset)?.()}>
        {PHWS2.kit.errorRetry}
      </LabButton>
    </div>
  );
}
