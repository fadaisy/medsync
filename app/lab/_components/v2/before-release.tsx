import type { ReactNode } from "react";
import { CheckIcon, CircleIcon, ClockIcon } from "lucide-react";

import { fill, LABWS2 } from "@/content/lab-workspace-v2";
import { cn } from "@/lib/utils";

export interface Gate {
  key: string;
  label: string;
  /** ok: passed; wait: blocks or holds (amber); none: does not apply. Read from the existing gates only. */
  state: "ok" | "wait" | "none";
  line: ReactNode;
  /** The control that clears it (the delta decision). */
  control?: ReactNode;
}

const ICON = { ok: CheckIcon, wait: ClockIcon, none: CircleIcon };
const B = LABWS2.bench;

/**
 * Before release (prompt 5.5; ADR 0343): one row per existing gate, in order — units and entry checks, QC passed
 * today, delta checks, critical check. It shows each gate's state and line; it decides nothing (Law 4). A gate
 * that blocks is announced once (`role="status"`).
 */
export function BeforeRelease({ gates }: { gates: readonly Gate[] }) {
  const ok = gates.filter((g) => g.state !== "wait").length;
  return (
    <section
      aria-labelledby="before-release"
      className="bg-card shadow-tide-card rounded-tide-card flex flex-col gap-3 p-4"
    >
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="before-release" className="text-heading-s text-foreground">
          {B.beforeRelease}
        </h2>
        <span className="text-caption text-muted-foreground tabular-nums">
          {fill(B.gatesOf, { ok, n: gates.length })}
        </span>
      </div>
      <ol className="flex flex-col gap-2">
        {gates.map((g) => {
          const Icon = ICON[g.state];
          return (
            <li
              key={g.key}
              role={g.state === "wait" ? "status" : undefined}
              className={cn(
                "rounded-tide-row flex flex-col gap-2 px-3 py-2.5",
                g.state === "wait"
                  ? "bg-status-caution-bg shadow-[inset_0_0_0_1px_var(--tide-caution-edge)]"
                  : "bg-muted/70",
              )}
            >
              <div className="flex items-start gap-2.5">
                <Icon
                  aria-hidden
                  className={cn(
                    "mt-0.5 size-4 shrink-0",
                    g.state === "wait" ? "text-amber-800" : "text-ink-600",
                  )}
                />
                <div className="flex min-w-0 flex-col">
                  <span
                    className={cn(
                      "text-body-s font-semibold",
                      g.state === "wait" ? "text-amber-900" : "text-foreground",
                    )}
                  >
                    {g.label}
                    <span className="sr-only"> · {B.gateStates[g.state]}</span>
                  </span>
                  <span
                    className={cn(
                      "text-caption",
                      g.state === "wait" ? "text-amber-900" : "text-muted-foreground",
                    )}
                  >
                    {g.line}
                  </span>
                </div>
              </div>
              {g.control}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
