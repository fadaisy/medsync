import type { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

interface SectionNumberProps extends HTMLAttributes<HTMLSpanElement> {
  n: number;
}

export function SectionNumber({ n, className, ...props }: SectionNumberProps) {
  return (
    <span
      data-slot="section-number"
      className={cn(
        "inline-flex items-center justify-center px-2 py-0.5",
        "border border-teal-100 bg-teal-50",
        "font-mono text-[13px] leading-none font-semibold text-teal-600 tabular-nums",
        "rounded-xs",
        className,
      )}
      {...props}
    >
      [{String(n).padStart(2, "0")}]
    </span>
  );
}
