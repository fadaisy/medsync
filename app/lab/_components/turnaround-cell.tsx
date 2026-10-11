import type { Clock } from "@/lib/lab/turnaround";
import { ClockIcon } from "lucide-react";

import { LAB } from "@/content/lab";
import { formatDuration } from "@/lib/lab/turnaround";
import { cn } from "@/lib/utils";

/**
 * The Waiting cell (Lab Phase 0 §5.4). Elapsed time against the lab's own promise; lateness is said
 * in words with an icon, amber, never colour alone (Law 7). No target, no colour (Law 5). Fixed
 * width and tabular figures, so a tick never moves the layout.
 */
export function TurnaroundCell({ clock, className }: { clock: Clock; className?: string }) {
  const T = LAB.turnaround;
  const base = cn(
    "text-body-s inline-flex min-w-[13.5rem] flex-wrap items-center gap-x-1.5 gap-y-1 tabular-nums",
    className,
  );
  if (clock.kind === "not_received")
    return (
      <span className={cn(base, "text-muted-foreground")}>
        {T.notReceived(formatDuration(clock.sinceCollection))}
      </span>
    );
  const target = clock.target
    ? `${T.target(formatDuration(clock.target.minutes))}${clock.target.source === "catalogue" ? ` ${T.defaultMark}` : ""}`
    : null;
  if (clock.lateBy !== null && target)
    return (
      <span className={base}>
        <LateChip text={T.late(formatDuration(clock.lateBy))} />
        <span className="text-muted-foreground font-mono text-[12px]">{target}</span>
      </span>
    );
  return (
    <span className={base}>
      {target
        ? `${formatDuration(clock.elapsed)} · ${target}`
        : T.noTarget(formatDuration(clock.elapsed))}
    </span>
  );
}

/** Amber with a clock and the words: the one caution on the worklist. */
export function LateChip({ text }: { text: string }) {
  return (
    <span className="bg-status-caution-bg text-caption dark:text-status-caution-fg inline-flex h-[22px] items-center gap-1 rounded-full pr-2 pl-1.5 font-semibold whitespace-nowrap text-amber-800">
      <ClockIcon aria-hidden className="size-[13px] stroke-2" />
      {text}
    </span>
  );
}

/** A released result's turnaround: receipt to release, against its target (§5.5). */
export function ReleasedTurnaroundCell({
  turnaround,
  target,
}: {
  turnaround: { minutes: number; lateBy: number | null } | null;
  target: { minutes: number; source: "facility" | "catalogue" } | null;
}) {
  const T = LAB.turnaround;
  if (!turnaround) return <span className="text-muted-foreground">—</span>;
  const targetText = target
    ? `${T.target(formatDuration(target.minutes))}${target.source === "catalogue" ? ` ${T.defaultMark}` : ""}`
    : null;
  if (turnaround.lateBy !== null && targetText)
    return (
      <span className="text-body-s inline-flex flex-wrap items-center gap-x-1.5 gap-y-1 tabular-nums">
        <LateChip text={T.late(formatDuration(turnaround.lateBy))} />
        <span className="text-muted-foreground font-mono text-[12px]">{targetText}</span>
      </span>
    );
  return (
    <span className="text-body-s tabular-nums">
      {targetText
        ? `${formatDuration(turnaround.minutes)} · ${targetText}`
        : T.noTarget(formatDuration(turnaround.minutes))}
    </span>
  );
}
