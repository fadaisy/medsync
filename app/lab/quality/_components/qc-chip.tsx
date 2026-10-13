import type { QcTone } from "../_lib/status";
import { CheckIcon, TriangleAlertIcon } from "lucide-react";

import { StatusWord } from "@/components/emr/status-word";

/** Passed: neutral with a check · warning: amber · failed and held: dark amber · due or not run: dashed. */
export function QcChip({ tone, children }: { tone: QcTone; children: string }) {
  if (tone === "passed")
    return (
      <StatusWord icon glyph={CheckIcon}>
        {children}
      </StatusWord>
    );
  if (tone === "amber") return <StatusWord tone="caution">{children}</StatusWord>;
  if (tone === "dark")
    return (
      <span className="bg-status-caution-bg text-status-caution-fg-aa border-status-caution-fg-aa text-caption inline-flex items-center gap-1 rounded border px-2 py-0.5 font-medium">
        <TriangleAlertIcon aria-hidden className="size-3 shrink-0" />
        {children}
      </span>
    );
  return (
    <span className="text-caption text-muted-foreground border-border inline-flex items-center rounded border border-dashed px-2 py-0.5 font-medium">
      {children}
    </span>
  );
}
