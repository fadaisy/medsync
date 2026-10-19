import type { NowWords } from "@/lib/lab/referral-words";
import { CheckIcon, ClockIcon, TriangleAlertIcon } from "lucide-react";

import { StatusWord } from "@/components/emr/status-word";

/** A "Now" chip: words with an icon; amber only for overdue, rejected, lost; never red or green (Law 13). */
export function NowChip({ now }: { now: NowWords }) {
  const glyph =
    now.glyph === "clock"
      ? ClockIcon
      : now.glyph === "triangle"
        ? TriangleAlertIcon
        : now.glyph === "check"
          ? CheckIcon
          : undefined;
  if (now.tone === "dashed")
    return (
      <span className="border-ink-300 text-caption text-ink-700 inline-flex rounded border border-dashed px-2 py-0.5">
        {now.words}
      </span>
    );
  return (
    <StatusWord
      tone={now.tone === "caution" ? "caution" : "neutral"}
      {...(glyph ? { glyph, icon: true } : {})}
    >
      {now.words}
    </StatusWord>
  );
}
