"use client";

import { LabButton } from "@/app/lab/_components/v2/button";
import { PHWS2 } from "@/content/pharmacy-workspace-v2";

export default function PlaceError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div role="alert" className="mx-auto flex w-full max-w-7xl flex-col items-start gap-3 px-4 py-6 sm:px-6">
      <p className="text-body-s text-foreground">{PHWS2.kit.error}</p>
      <LabButton onClick={reset}>{PHWS2.kit.errorRetry}</LabButton>
    </div>
  );
}
