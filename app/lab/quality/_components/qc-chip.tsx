import type { QcTone } from "../_lib/status";
import { CheckIcon, TriangleAlertIcon } from "lucide-react";

import { StatusWord } from "@/components/emr/status-word";
import { QUALITY } from "../_lib/copy";

/** Passed: neutral with a check · warning: amber · failed and held: dark amber · due or not run: a neutral pill. */
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
    <span className="text-caption bg-muted text-ink-700 inline-flex items-center rounded-full px-2 py-0.5 font-medium">
      {children}
    </span>
  );
}

/** An EQA round's outcome as a chip. Server-safe: the EQA page renders it outside the client forms. */
export const outcomeChip = (o: "acceptable" | "unacceptable" | "mixed" | null) =>
  o === null ? null : o === "acceptable" ? (
    <QcChip tone="passed">{QUALITY.eqa.outcome.acceptable}</QcChip>
  ) : (
    <QcChip tone={o === "unacceptable" ? "dark" : "amber"}>{QUALITY.eqa.outcome[o]}</QcChip>
  );
