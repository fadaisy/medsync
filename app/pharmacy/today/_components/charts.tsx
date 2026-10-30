import type { ReactNode } from "react";

import { HourlyFlowChart } from "@/components/tide/work/charts";

/**
 * Today's two pharmacy charts (GATE A §5). The pace chart is the lab's `HourlyFlowChart` (bars and a line with
 * square marks, the current hour partial, a "now" line) with arrived and supplied in place of received and
 * released. The week bars are new: the lab's `Sparkline` is a line, and the board asks for seven day bars.
 */
export function PaceChart({
  hours,
  labels,
  alt,
  table,
}: {
  hours: readonly { hour: number; arrived: number; supplied: number; partial: boolean }[];
  labels: { arrived: string; supplied: string; now: string; viewTable: string };
  alt: string;
  table: ReactNode;
}) {
  return (
    <HourlyFlowChart
      hours={hours.map((h) => ({ hour: h.hour, received: h.arrived, released: h.supplied, partial: h.partial }))}
      labels={{ received: labels.arrived, released: labels.supplied, now: labels.now, viewTable: labels.viewTable }}
      alt={alt}
      table={table}
    />
  );
}

/** Seven small day bars, oldest first, today darkest (navy); the earlier days in the cascade tone. */
export function WeekBars({ days, label }: { days: readonly number[]; label: string }) {
  const W = 64;
  const H = 26;
  const gap = 2;
  const bw = (W - gap * (days.length - 1)) / days.length;
  const max = Math.max(1, ...days);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={label} className="shrink-0">
      {days.map((v, i) => {
        const h = v ? Math.max(2, (v / max) * (H - 2)) : 1;
        return (
          <rect
            key={i}
            x={i * (bw + gap)}
            y={H - h}
            width={bw}
            height={h}
            rx={1.5}
            fill={i === days.length - 1 ? "var(--tide-navy-900)" : "var(--tide-cascade-2)"}
          />
        );
      })}
    </svg>
  );
}
