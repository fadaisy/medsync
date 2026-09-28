import type { LegendGlyph, Margins } from "./frame";
import type { Origin, ReferenceLine } from "@/lib/emr/charts/payload";
import type { ReactNode } from "react";

import { clockTicks, linearScale, niceTicks, timeDomain } from "@/lib/emr/charts/scale";
import {
  GRAPH_WIDTH,
  GraphEmpty,
  GraphFigure,
  GraphSvg,
  LABEL_GUTTER,
  Legend,
  ORIGIN_LEGEND,
  PointMark,
  ReferenceLineMark,
  TimeAxis,
  ValueAxis,
  ValuePath,
} from "./frame";

/**
 * A value over time, its points joined in teal, against one amber reference line with its label
 * (temperature, capillary glucose). The line marks a value for the reader; nothing is flagged.
 */

const HEIGHT = 200;
const M: Margins = { top: 22, right: LABEL_GUTTER, bottom: 30, left: 48 };

export interface GraphPoint {
  at: string;
  value: number;
  origin: Origin;
  shape?: "circle" | "square";
}

export function PointsGraph({
  title,
  points,
  reference,
  unit,
  now,
  label,
  legend = [],
  note,
}: {
  title: string;
  points: readonly GraphPoint[];
  reference: ReferenceLine;
  unit: string;
  now: string;
  /** The accessible name: the latest value and the trend in words. */
  label: string;
  legend?: readonly { glyph?: LegendGlyph; text: string }[];
  note?: ReactNode;
}) {
  if (points.length === 0) return <GraphEmpty title={title} />;
  const times = points.map((p) => new Date(p.at));
  const [start, end] = timeDomain(times, {
    from: new Date(Math.min(...times.map((t) => t.getTime()))),
    now: new Date(now),
  });
  const right = GRAPH_WIDTH - M.right;
  const x = linearScale([start.getTime(), end.getTime()], [M.left, right]);
  const values = points.map((p) => p.value);
  const lo = Math.min(reference.value, ...values);
  const hi = Math.max(reference.value, ...values);
  const pad = Math.max((hi - lo) * 0.1, 0.5);
  const ticks = niceTicks(lo - pad, hi + pad);
  const y = linearScale([ticks[0]!, ticks.at(-1)!], [HEIGHT - M.bottom, M.top]);
  const coords = points.map((p) => [x(Date.parse(p.at)), y(p.value)] as [number, number]);
  return (
    <GraphFigure
      title={title}
      legend={
        <Legend
          items={[...ORIGIN_LEGEND, ...legend, { glyph: "reference", text: reference.label }]}
        />
      }
      note={note}
    >
      <GraphSvg label={label} height={HEIGHT}>
        <ValueAxis ticks={ticks} y={y} x={M.left} />
        <text
          x={M.left - 8}
          y={M.top - 8}
          textAnchor="end"
          className="fill-muted-foreground text-kbd font-mono"
        >
          {unit}
        </text>
        <ReferenceLineMark
          y={y(reference.value)}
          left={M.left}
          right={right}
          label={reference.label}
        />
        <ValuePath points={coords} />
        {points.map((p, i) => (
          <PointMark
            key={p.at}
            cx={coords[i]![0]}
            cy={coords[i]![1]}
            origin={p.origin}
            shape={p.shape}
          />
        ))}
        <TimeAxis
          ticks={clockTicks(start, end)}
          x={x}
          y={HEIGHT - M.bottom}
          left={M.left}
          right={right}
        />
      </GraphSvg>
    </GraphFigure>
  );
}
