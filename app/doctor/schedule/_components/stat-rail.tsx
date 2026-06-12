import type { SchedulingStats } from "@/lib/scheduling/doctor";
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  CircleIcon,
  ListChecksIcon,
  XCircleIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Stat rail above the calendar — Total / Confirmed / Pending / Urgent
 * / Completed / Cancelled for the visible range. Real counts, honest
 * zero state. Trend deltas vs prior period are deferred (need a
 * second query) — flagged as a future polish.
 */

interface StatCardSpec {
  label: string;
  value: number;
  icon: typeof ListChecksIcon;
  tone: "neutral" | "teal" | "amber" | "rose" | "muted";
}

export function StatRail({ stats }: { stats: SchedulingStats }) {
  const cards: ReadonlyArray<StatCardSpec> = [
    { label: "Total", value: stats.total, icon: ListChecksIcon, tone: "neutral" },
    { label: "Confirmed", value: stats.confirmed, icon: CheckCircle2Icon, tone: "teal" },
    { label: "Pending", value: stats.pending, icon: CircleIcon, tone: "amber" },
    { label: "Urgent", value: stats.urgent, icon: AlertTriangleIcon, tone: "rose" },
    { label: "Completed", value: stats.completed, icon: CheckCircle2Icon, tone: "muted" },
    { label: "Cancelled", value: stats.cancelled, icon: XCircleIcon, tone: "muted" },
  ];

  return (
    <ul
      className="stagger-children grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6"
      aria-label="Scheduling stats"
    >
      {cards.map((c) => (
        <li key={c.label}>
          <StatCard spec={c} />
        </li>
      ))}
    </ul>
  );
}

function StatCard({ spec }: { spec: StatCardSpec }) {
  const Icon = spec.icon;
  return (
    <div className="border-border bg-card card-lift flex flex-col gap-1 rounded-xl border p-3">
      <div className="flex items-center gap-1.5">
        <Icon
          aria-hidden
          className={cn(
            "size-3.5",
            spec.tone === "teal" && "text-teal-600 dark:text-teal-400",
            spec.tone === "amber" && "text-amber-600 dark:text-amber-400",
            spec.tone === "rose" && "text-rose-600 dark:text-rose-400",
            (spec.tone === "neutral" || spec.tone === "muted") && "text-muted-foreground",
          )}
        />
        <span className="text-muted-foreground font-mono text-[10px] tracking-[0.14em] uppercase">
          {spec.label}
        </span>
      </div>
      <span
        className={cn(
          "text-foreground font-mono text-[22px] leading-none font-medium tracking-tight tabular-nums",
          spec.tone === "muted" && "text-muted-foreground",
        )}
      >
        {spec.value}
      </span>
    </div>
  );
}
