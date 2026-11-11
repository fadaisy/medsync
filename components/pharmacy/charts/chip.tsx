import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** A count or state chip, always with its word or number; the stock tones of `medicines/tones.ts`. */
export type ChipTone = "bad" | "warn" | "info" | "neutral" | "ok" | "teal";
const TONE: Record<ChipTone, string> = {
  bad: "bg-status-critical-bg text-status-critical-fg-aa",
  warn: "bg-status-caution-bg text-status-caution-fg-aa",
  ok: "bg-status-stable-bg text-status-stable-fg",
  info: "bg-tide-sky-tint text-tide-navy",
  teal: "bg-tide-lagoon-tint text-teal-900",
  neutral: "bg-ink-100 text-ink-700",
};

export function Chip({
  tone = "neutral",
  children,
  className,
}: {
  tone?: ChipTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center rounded-full px-2 text-[11.5px] font-semibold whitespace-nowrap",
        TONE[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
