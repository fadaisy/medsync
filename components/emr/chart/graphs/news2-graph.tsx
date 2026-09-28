import type { Margins } from "./frame";
import type { News2Band, ObservationsBody, VitalStrip } from "@/lib/emr/charts/payload";
import type { LinearScale } from "@/lib/emr/charts/scale";

import { clockTicks, linearScale, niceTicks, timeDomain } from "@/lib/emr/charts/scale";
import { cn } from "@/lib/utils";
import {
  GRAPH_WIDTH,
  GraphEmpty,
  GraphFigure,
  GraphSvg,
  gutterHeight,
  GutterText,
  INK,
  LABEL_GUTTER,
  labelLines,
  Legend,
  ORIGIN_LEGEND,
  PointMark,
  TimeAxis,
  ValueAxis,
  ValuePath,
} from "./frame";
import { plural, trendWords } from "./words";

/**
 * NEWS2 aggregate over time, drawn over the RCP 2017 response bands (labels from the signed
 * CO-NEWS entries), with a small-multiple strip per vital sign below it (MONITORING-CHARTS.md §2).
 * Only a complete set is scored; a partial one is counted in words. The clerking score is an ink
 * dot, nursing scores teal dots.
 */

// The one red on the monitoring charts: the NEWS2 7+ emergency-response band, always with its label.
const EMERGENCY_BAND_FILL = "fill-status-critical-bg";
const EMERGENCY_BAND_TEXT = "fill-status-critical-fg-aa";
/** The other bands are neutral tints, told apart by their labels. */
const BAND_FILL = ["", "fill-ink-50", "fill-ink-100"] as const;

const TITLE = "NEWS2";
const HEIGHT = 220;
const M: Margins = { top: 12, right: LABEL_GUTTER, bottom: 30, left: 44 };
const STRIP_HEIGHT = 48;
const STRIP_M: Margins = { top: 8, right: LABEL_GUTTER, bottom: 8, left: 44 };

function bandSpan(b: News2Band, top: number): [number, number] {
  return [b.from === 0 ? 0 : b.from - 0.5, b.to === null ? top : b.to + 0.5];
}

/** Each band's tint runs under the plot and its gutter; its label sits in the gutter, in the band. */
function Bands({
  bands,
  y,
  top,
  left,
  right,
}: {
  bands: readonly News2Band[];
  y: LinearScale;
  top: number;
  left: number;
  /** The plot's right edge; the gutter follows. */
  right: number;
}) {
  return (
    <g>
      {bands.map((b, i) => {
        const [lo, hi] = bandSpan(b, top);
        const y0 = y(Math.min(hi, top));
        const height = y(lo) - y0;
        const fill = b.emergency ? EMERGENCY_BAND_FILL : (BAND_FILL[i] ?? "");
        const lines = labelLines(b.label);
        return (
          <g key={b.refId}>
            {fill ? (
              <rect
                x={left}
                y={y0}
                width={GRAPH_WIDTH - 8 - left}
                height={height}
                className={fill}
              />
            ) : null}
            {height >= gutterHeight(lines.length) + 4 ? (
              <GutterText
                x={right + 10}
                y={y0 + height / 2}
                lines={lines}
                className={cn("text-caption", b.emergency ? EMERGENCY_BAND_TEXT : INK.label)}
              />
            ) : null}
          </g>
        );
      })}
    </g>
  );
}

function Strip({ strip, x }: { strip: VitalStrip; x: (t: number) => number }) {
  const values = strip.points.map((p) => p.value);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const pad = hi === lo ? 1 : (hi - lo) * 0.15;
  const y = linearScale([lo - pad, hi + pad], [STRIP_HEIGHT - STRIP_M.bottom, STRIP_M.top]);
  const last = strip.points.at(-1)!;
  const coords = strip.points.map((p) => [x(Date.parse(p.at)), y(p.value)] as [number, number]);
  return (
    <div className="flex flex-col gap-0.5">
      <p className="text-caption text-muted-foreground flex items-baseline gap-2">
        <span>{strip.label}</span>
        <span className="text-foreground font-mono tabular-nums">
          {last.value} {strip.unit}
        </span>
      </p>
      <GraphSvg
        label={`${strip.label}: ${trendWords(strip.points, (n) => `${n} ${strip.unit}`)}.`}
        height={STRIP_HEIGHT}
      >
        <ValueAxis
          ticks={lo === hi ? [lo] : [lo, hi]}
          y={y}
          x={STRIP_M.left}
          format={(n) => String(n)}
        />
        <ValuePath points={coords} />
        {strip.points.map((p, i) => (
          <PointMark key={p.at} cx={coords[i]![0]} cy={coords[i]![1]} origin={p.origin} />
        ))}
      </GraphSvg>
    </div>
  );
}

export function News2Graph({ body, now }: { body: ObservationsBody; now: string }) {
  const strips = body.strips.filter((s) => s.points.length > 0);
  if (body.news2.length === 0 && strips.length === 0 && body.consciousness.length === 0)
    return <GraphEmpty title={TITLE} />;

  const times = [
    ...body.news2.map((p) => p.at),
    ...strips.flatMap((s) => s.points.map((p) => p.at)),
    ...body.consciousness.map((c) => c.at),
  ].map((t) => new Date(t));
  const earliest = new Date(Math.min(...times.map((t) => t.getTime())));
  const [start, end] = timeDomain(times, { from: earliest, now: new Date(now) });
  const plotRight = GRAPH_WIDTH - M.right;
  const x = linearScale([start.getTime(), end.getTime()], [M.left, plotRight]);
  const ticksX = clockTicks(start, end);

  const emergencyFrom = body.bands.find((b) => b.emergency)?.from ?? 0;
  const maxTotal = Math.max(0, ...body.news2.map((p) => p.total));
  const ticks = niceTicks(0, Math.max(emergencyFrom + 2, maxTotal));
  const top = ticks.at(-1)!;
  const y = linearScale([0, top], [HEIGHT - M.bottom, M.top]);
  const coords = body.news2.map((p) => [x(Date.parse(p.at)), y(p.total)] as [number, number]);

  const scored = body.news2.map((p) => ({ at: p.at, value: p.total }));
  const label =
    body.news2.length === 0
      ? `NEWS2: no complete set of observations yet, so no score is drawn. ${plural(body.incompleteSets, "set")} without every NEWS2 input.`
      : `NEWS2 over time: ${trendWords(scored, String)}. Drawn over the ${body.bandSource}.` +
        (body.incompleteSets
          ? ` ${plural(body.incompleteSets, "set")} without every NEWS2 input, not scored.`
          : "");

  return (
    <GraphFigure
      title={TITLE}
      legend={
        <div className="flex flex-col gap-1.5">
          <Legend items={[...ORIGIN_LEGEND, { glyph: "line", text: "NEWS2 aggregate" }]} />
          <ul className="text-caption text-muted-foreground flex flex-col gap-0.5">
            {body.bands.map((b) => (
              <li key={b.refId}>
                {b.label} <span className="font-mono">({b.refId})</span>
              </li>
            ))}
          </ul>
        </div>
      }
      note={
        <>
          {body.bandSource}.
          {body.incompleteSets
            ? ` ${plural(body.incompleteSets, "set")} without every NEWS2 input: no score is worked out for ${body.incompleteSets === 1 ? "it" : "them"}.`
            : null}
        </>
      }
    >
      <GraphSvg label={label} height={HEIGHT}>
        <Bands bands={body.bands} y={y} top={top} left={M.left} right={plotRight} />
        <ValueAxis ticks={ticks} y={y} x={M.left} />
        <ValuePath points={coords} />
        {body.news2.map((p, i) => (
          <PointMark key={p.at} cx={coords[i]![0]} cy={coords[i]![1]} origin={p.origin} />
        ))}
        <TimeAxis ticks={ticksX} x={x} y={HEIGHT - M.bottom} left={M.left} right={plotRight} />
      </GraphSvg>

      {strips.length || body.consciousness.length ? (
        <div className="flex flex-col gap-2 pt-2">
          <p className="text-caption text-muted-foreground">Each vital sign, same times</p>
          {strips.map((s) => (
            <Strip key={s.key} strip={s} x={x} />
          ))}
          {body.consciousness.length ? (
            <div className="flex flex-col gap-0.5">
              <p className="text-caption text-muted-foreground">Consciousness (ACVPU)</p>
              <GraphSvg
                label={`Consciousness: ${body.consciousness
                  .map((c) => `${c.value}`)
                  .join(", ")}, oldest first.`}
                height={24}
              >
                {body.consciousness.map((c) => (
                  <text
                    key={c.at}
                    x={x(Date.parse(c.at))}
                    y={16}
                    textAnchor="middle"
                    className={cn(
                      "text-caption font-mono",
                      c.origin === "clerking" ? "fill-foreground" : "fill-teal-text",
                    )}
                  >
                    {c.value}
                  </text>
                ))}
              </GraphSvg>
            </div>
          ) : null}
          <div className="relative max-w-full overflow-x-auto">
            <svg aria-hidden width={GRAPH_WIDTH} height={26} className="block max-w-none">
              <TimeAxis ticks={ticksX} x={x} y={4} left={M.left} right={plotRight} />
            </svg>
          </div>
        </div>
      ) : null}
    </GraphFigure>
  );
}
