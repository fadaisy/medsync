import type { ClassifierResult, Tone } from "@/lib/clerking/exam/classifiers";
import { CheckIcon, CircleIcon, TriangleAlertIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * A classifier or score result with its reason (PROMPT-CLERKING-EXAM-V2 §10, E4): the tone scale
 * ok / caution / strong, always with a word and an icon, never colour alone, and never red (red is
 * the Flags panel's, D-CV-03). A polite live region, so a new grade is announced with its reason.
 */

const TONE: Record<Tone, string> = {
  ok: "border-teal-200 bg-teal-50 text-teal-800",
  caution: "border-amber-300 bg-status-caution-bg text-amber-800 dark:text-status-caution-fg",
  strong:
    "border-amber-600 bg-status-caution-bg font-semibold text-amber-900 dark:text-status-caution-fg",
  neutral: "border-border bg-muted text-muted-foreground",
};

export function Pill({
  tone,
  children,
  className,
}: {
  tone: Tone;
  children: React.ReactNode;
  className?: string;
}) {
  const Icon = tone === "ok" ? CheckIcon : tone === "neutral" ? CircleIcon : TriangleAlertIcon;
  return (
    <span
      data-tone={tone}
      className={cn(
        "text-caption inline-flex items-center gap-1 rounded-full border px-2 py-0.5",
        TONE[tone],
        className,
      )}
    >
      <Icon aria-hidden className="size-3 shrink-0" />
      {children}
    </span>
  );
}

/** A classifier result: the pill, then its reason in words. Reserves its line (no layout shift). */
export function ResultPill({
  r,
  hideReason,
}: {
  r: ClassifierResult | undefined;
  hideReason?: boolean;
}) {
  const show = r && r.status !== "none" && (r.text || r.reason);
  return (
    <span aria-live="polite" className="inline-flex min-h-6 flex-wrap items-center gap-x-2 gap-y-1">
      {show ? (
        <>
          <Pill tone={r.status === "result" ? r.tone : "neutral"}>{r.text || r.label}</Pill>
          {!hideReason && r.reason ? (
            <span className="text-caption text-muted-foreground">{r.reason}</span>
          ) : null}
        </>
      ) : null}
    </span>
  );
}
