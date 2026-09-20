import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * One number with its basis and an icon tile — the strip a console opens
 * with. `tinted` marks the one card a desk reads first. The hint is the
 * denominator or the window: a number without its basis is a claim.
 */
export function StatCard({
  label,
  value,
  hint,
  icon,
  tinted = false,
}: {
  label: string;
  value: number | string;
  hint: string;
  icon: ReactNode;
  tinted?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-xl border px-4 py-3 shadow-xs",
        tinted ? "bg-accent border-brand-200 dark:border-brand-800" : "bg-card border-border",
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-muted-foreground text-caption truncate">{label}</span>
        <span className="text-foreground font-mono text-[22px] leading-7 font-medium tabular-nums">
          {value}
        </span>
        <span className="text-muted-foreground text-caption truncate">{hint}</span>
      </div>
      <span
        className={cn(
          "grid size-9 shrink-0 place-items-center rounded-lg",
          tinted ? "bg-card text-brand-700" : "bg-muted text-brand-700",
        )}
      >
        {icon}
      </span>
    </div>
  );
}
