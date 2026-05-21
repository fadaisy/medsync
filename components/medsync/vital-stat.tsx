import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

interface VitalStatProps extends HTMLAttributes<HTMLDivElement> {
  label: string;
  value: string | number;
  unit?: string;
  /**
   * `normal` (default): primary text colour.
   * `critical`: red + bold, for out-of-range vitals/labs.
   * `success`: green-700, for explicitly-confirmed normal results
   *   (pair with text label, never colour alone).
   */
  tone?: "normal" | "critical" | "success";
  /** Optional trailing context (timestamp, source, etc.). */
  meta?: string;
}

const valueTone: Record<Required<VitalStatProps>["tone"], string> = {
  normal: "text-foreground font-medium",
  critical: "text-status-critical-fg font-bold",
  success: "text-status-stable-fg font-medium",
};

export function VitalStat({
  label,
  value,
  unit,
  tone = "normal",
  meta,
  className,
  ...props
}: VitalStatProps) {
  return (
    <div
      data-slot="vital-stat"
      data-tone={tone}
      className={cn("flex flex-col gap-1", className)}
      {...props}
    >
      <span className="text-overline text-muted-foreground uppercase dark:text-teal-500">
        {label}
      </span>
      <div className="flex items-baseline gap-1">
        <span className={cn("font-mono text-[20px] leading-tight tabular-nums", valueTone[tone])}>
          {value}
        </span>
        {unit ? <span className="text-[11px] text-gray-400">{unit}</span> : null}
      </div>
      {meta ? <span className="font-mono text-[11px] text-gray-400">{meta}</span> : null}
    </div>
  );
}
