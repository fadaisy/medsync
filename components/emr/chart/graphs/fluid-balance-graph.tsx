import type { Margins } from "./frame";
import type { FluidBalanceBody } from "@/lib/emr/charts/payload";

import { clockTicks, formatClock, linearScale, niceTicks } from "@/lib/emr/charts/scale";
import {
  GRAPH_WIDTH,
  GraphEmpty,
  GraphFigure,
  GraphSvg,
  INK,
  Legend,
  TimeAxis,
  ValueAxis,
  ValuePath,
} from "./frame";
import { plural, signedMl, trendWords } from "./words";

/**
 * In and out by hour (MONITORING-CHARTS.md §3, graph 1): in (IV plus oral) as bars above zero,
 * out (urine plus other) as grey bars below it, and the running balance as a teal line across both.
 * An hour with no entry breaks the line and shows a hollow ring: blank is not zero.
 */

const TITLE = "In and out by hour";
const HEIGHT = 240;
const M: Margins = { top: 28, right: 16, bottom: 30, left: 56 };
const HOUR = 3600000;

export function FluidBalanceGraph({ body }: { body: FluidBalanceBody }) {
  const rows = body.hours;
  const recorded = rows.filter((r) => !r.gap);
  if (recorded.length === 0) return <GraphEmpty title={TITLE} />;

  const step = body.stepHours * HOUR;
  const start = Date.parse(rows[0]!.start);
  const end = Date.parse(rows.at(-1)!.start) + step;
  const plotW = GRAPH_WIDTH - M.left - M.right;
  const slot = plotW / rows.length;
  const xTime = (t: number) => M.left + ((t - start) / (end - start)) * plotW;
  const center = (i: number) => M.left + (i + 0.5) * slot;

  const running = recorded.map((r) => r.running ?? 0);
  const ticks = niceTicks(
    Math.min(0, ...recorded.map((r) => -(r.totalOut ?? 0)), ...running),
    Math.max(0, ...recorded.map((r) => r.totalIn ?? 0), ...running),
  );
  const y = linearScale([ticks[0]!, ticks.at(-1)!], [HEIGHT - M.bottom, M.top]);
  const zero = y(0);
  const barW = Math.max(2, Math.min(24, slot * 0.6));

  // The balance line runs through consecutive recorded hours; a gap starts a new segment.
  const segments: [number, number][][] = [];
  let current: [number, number][] = [];
  let lastLevel: number | null = null;
  const gapRings: { cx: number; cy: number }[] = [];
  rows.forEach((r, i) => {
    if (r.gap) {
      if (current.length) segments.push(current);
      current = [];
      // Only gaps after the first entry, and not the hour still under way.
      if (lastLevel !== null && !r.inProgress) gapRings.push({ cx: center(i), cy: y(lastLevel) });
      return;
    }
    lastLevel = r.running ?? 0;
    current.push([center(i), y(lastLevel)]);
  });
  if (current.length) segments.push(current);

  const lastRow = [...rows].reverse().find((r) => !r.gap)!;
  const gaps = rows.filter((r) => r.gap && !r.inProgress).length;
  const trend = trendWords(
    recorded.map((r) => ({
      at: new Date(Date.parse(r.start) + step).toISOString(),
      value: r.running ?? 0,
    })),
    (n) => `${signedMl(n)} mL`,
  );
  const label =
    `Fluid in and out by hour, ${formatClock(rows[0]!.start)} to ${formatClock(lastRow.start)}. ` +
    `Running balance ${trend}. ${plural(gaps, "hour")} with no entry.`;

  return (
    <GraphFigure
      title={TITLE}
      legend={
        <Legend
          items={[
            { glyph: "in", text: "In: IV and oral (above zero)" },
            { glyph: "out", text: "Out: urine and other (below zero)" },
            { glyph: "line", text: "Running balance" },
            { glyph: "gap", text: "No entry this hour" },
          ]}
        />
      }
      note="Recorded entries only; a blank hour is not counted as 0 mL."
    >
      <GraphSvg label={label} height={HEIGHT}>
        <ValueAxis ticks={ticks} y={y} x={M.left} format={(n) => signedMl(n)} />
        <text x={M.left - 8} y={M.top - 14} textAnchor="end" className={INK.tick}>
          mL
        </text>
        {rows.map((r, i) => (
          <g key={r.start}>
            {r.totalIn ? (
              <rect
                x={center(i) - barW / 2}
                y={y(r.totalIn)}
                width={barW}
                height={zero - y(r.totalIn)}
                className={INK.inBar}
              />
            ) : null}
            {r.totalOut ? (
              <rect
                x={center(i) - barW / 2}
                y={zero}
                width={barW}
                height={y(-r.totalOut) - zero}
                className={INK.outBar}
              />
            ) : null}
          </g>
        ))}
        <line
          x1={M.left}
          x2={GRAPH_WIDTH - M.right}
          y1={zero}
          y2={zero}
          className={INK.zero}
          strokeWidth={1}
        />
        {segments.map((s) =>
          s.length === 1 ? (
            <circle
              key={s[0]!.join()}
              cx={s[0]![0]}
              cy={s[0]![1]}
              r={2.5}
              className={INK.nursingDot}
            />
          ) : (
            <ValuePath key={s[0]!.join()} points={s} />
          ),
        )}
        {gapRings.map((g) => (
          <circle
            key={g.cx}
            cx={g.cx}
            cy={g.cy}
            r={3.5}
            className={INK.gapRing}
            strokeWidth={1.5}
          />
        ))}
        <TimeAxis
          ticks={clockTicks(new Date(start), new Date(end))}
          x={xTime}
          y={HEIGHT - M.bottom}
          left={M.left}
          right={GRAPH_WIDTH - M.right}
        />
      </GraphSvg>
    </GraphFigure>
  );
}
