import type { Origin } from "@/lib/emr/charts/payload";
import type { LinearScale } from "@/lib/emr/charts/scale";
import type { ReactNode } from "react";

import { EMPTY_GRAPH_TEXT } from "@/lib/emr/charts/payload";
import { formatClock } from "@/lib/emr/charts/scale";
import { cn } from "@/lib/utils";

/**
 * What every monitoring graph shares (MONITORING-CHARTS.md §4): SVG from tokens only, clock time in
 * Geist Mono on the x axis, three or four y ticks and no gridlines, the clerking value as an ink dot
 * and nursing entries as teal dots, a legend in words, and the empty state in words. No motion.
 *
 * The SVG is drawn at its own pixel size (text stays 11–12px) and scrolls inside its frame on a
 * narrow screen; the page never scrolls sideways. Reference-line and band labels sit in a gutter to
 * the right of the plot, so no label covers a value.
 */

export const GRAPH_WIDTH = 760;
/** The right-hand gutter for reference-line and band labels. */
export const LABEL_GUTTER = 200;
const LINE_HEIGHT = 14;

/**
 * A label wrapped to lines of at most `max` characters for the gutter, breaking after a comma or a
 * colon, or before a "·", where it can, and between words where it must.
 */
export function labelLines(label: string, max = 30): string[] {
  const lines: string[] = [];
  const add = (part: string) => {
    const last = lines.at(-1);
    if (last !== undefined && `${last} ${part}`.length <= max)
      lines[lines.length - 1] = `${last} ${part}`;
    else lines.push(part);
  };
  for (const chunk of label.split(/(?<=[,:]) | (?=· )/)) {
    if (chunk.length <= max) add(chunk);
    else for (const word of chunk.split(" ")) add(word);
  }
  return lines;
}

/** Lines of text centred on `y`, in the gutter at `x`. */
export function GutterText({
  x,
  y,
  lines,
  className,
}: {
  x: number;
  y: number;
  lines: readonly string[];
  className: string;
}) {
  const first = y + 4 - ((lines.length - 1) * LINE_HEIGHT) / 2;
  return (
    <text x={x} y={first} className={className}>
      {lines.map((l, i) => (
        <tspan key={i} x={x} dy={i ? LINE_HEIGHT : 0}>
          {l}
        </tspan>
      ))}
    </text>
  );
}
export const gutterHeight = (lines: number) => lines * LINE_HEIGHT;
export interface Margins {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** Tokens, named once. Amber is for reference lines; teal is the value line; greys are "out". */
export const INK = {
  value: "stroke-teal-icon",
  nursingDot: "fill-teal-icon",
  clerkingDot: "fill-foreground",
  inBar: "fill-teal-200",
  outBar: "fill-ink-400",
  axis: "stroke-border",
  zero: "stroke-ink-300",
  tick: "fill-muted-foreground font-mono text-kbd",
  label: "fill-muted-foreground text-caption",
  referenceLine: "stroke-status-caution-fg",
  referenceText: "fill-amber-800 dark:fill-status-caution-fg text-caption",
  gapRing: "fill-card stroke-muted-foreground",
} as const;

export function GraphFigure({
  title,
  children,
  legend,
  note,
}: {
  title: string;
  children: ReactNode;
  legend?: ReactNode;
  note?: ReactNode;
}) {
  return (
    <figure className="flex min-w-0 flex-col gap-2">
      <figcaption className="text-heading-s text-foreground">{title}</figcaption>
      {children}
      {legend}
      {note ? <p className="text-caption text-muted-foreground">{note}</p> : null}
    </figure>
  );
}

/** A graph with nothing to draw: the words, never a flat line at zero. */
export function GraphEmpty({ title }: { title: string }) {
  return (
    <GraphFigure title={title}>
      <p className="border-border text-body-s text-muted-foreground rounded-lg border border-dashed px-4 py-6">
        {EMPTY_GRAPH_TEXT}
      </p>
    </GraphFigure>
  );
}

/** The scrolling frame and the SVG itself: `role="img"` with a sentence for its name. */
export function GraphSvg({
  label,
  height,
  width = GRAPH_WIDTH,
  children,
}: {
  label: string;
  height: number;
  width?: number;
  children: ReactNode;
}) {
  return (
    <div className="relative max-w-full overflow-x-auto">
      <svg
        role="img"
        aria-label={label}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="block max-w-none overflow-visible"
      >
        {children}
      </svg>
    </div>
  );
}

/** Clock-time labels under the plot, and the axis line. */
export function TimeAxis({
  ticks,
  x,
  y,
  left,
  right,
}: {
  ticks: readonly Date[];
  x: (t: number) => number;
  y: number;
  left: number;
  right: number;
}) {
  return (
    <g>
      <line x1={left} x2={right} y1={y} y2={y} className={INK.axis} strokeWidth={1} />
      {ticks.map((t) => (
        <g key={t.getTime()}>
          <line x1={x(t.getTime())} x2={x(t.getTime())} y1={y} y2={y + 4} className={INK.axis} />
          <text x={x(t.getTime())} y={y + 16} textAnchor="middle" className={INK.tick}>
            {formatClock(t)}
          </text>
        </g>
      ))}
    </g>
  );
}

/** Tick values at the left of the plot: labels only, no gridlines. */
export function ValueAxis({
  ticks,
  y,
  x,
  format = (n) => String(n),
}: {
  ticks: readonly number[];
  y: LinearScale;
  x: number;
  format?: (n: number) => string;
}) {
  return (
    <g>
      {ticks.map((t) => (
        <text key={t} x={x - 8} y={y(t) + 4} textAnchor="end" className={INK.tick}>
          {format(t)}
        </text>
      ))}
    </g>
  );
}

/**
 * A dashed amber reference line across the plot, its label in words in the gutter beside it; it
 * marks a value for the reader, it never flags one.
 */
export function ReferenceLineMark({
  y,
  left,
  right,
  label,
}: {
  y: number;
  left: number;
  /** The plot's right edge; the label goes in the gutter after it. */
  right: number;
  label: string;
}) {
  return (
    <g>
      <line
        x1={left}
        x2={right}
        y1={y}
        y2={y}
        className={INK.referenceLine}
        strokeWidth={1.5}
        strokeDasharray="5 4"
      />
      <GutterText x={right + 10} y={y} lines={labelLines(label)} className={INK.referenceText} />
    </g>
  );
}

/** A reading: a filled ink dot from clerking, a teal dot from nursing; a square for a core reading. */
export function PointMark({
  cx,
  cy,
  origin,
  shape = "circle",
}: {
  cx: number;
  cy: number;
  origin: Origin;
  shape?: "circle" | "square";
}) {
  const fill = origin === "clerking" ? INK.clerkingDot : INK.nursingDot;
  if (shape === "square")
    return (
      <rect
        x={cx - 4}
        y={cy - 4}
        width={8}
        height={8}
        className={cn(fill, "stroke-card")}
        strokeWidth={1}
      />
    );
  return <circle cx={cx} cy={cy} r={4} className={cn(fill, "stroke-card")} strokeWidth={1} />;
}

/** The line through the values, in time order. */
export function ValuePath({ points }: { points: readonly [number, number][] }) {
  if (points.length < 2) return null;
  const d = points
    .map(([px, py], i) => `${i ? "L" : "M"}${px.toFixed(1)},${py.toFixed(1)}`)
    .join(" ");
  return (
    <path
      d={d}
      fill="none"
      className={INK.value}
      strokeWidth={1.75}
      strokeLinejoin="round"
      strokeLinecap="round"
    />
  );
}

/* ─── Legend ─────────────────────────────────────────────────────── */

export type LegendGlyph =
  | "clerking"
  | "nursing"
  | "line"
  | "reference"
  | "in"
  | "out"
  | "gap"
  | "core"
  | "peripheral";

function Glyph({ kind }: { kind: LegendGlyph }) {
  return (
    <svg aria-hidden width={16} height={12} viewBox="0 0 16 12" className="shrink-0">
      {kind === "clerking" ? <circle cx={8} cy={6} r={4} className={INK.clerkingDot} /> : null}
      {kind === "nursing" ? <circle cx={8} cy={6} r={4} className={INK.nursingDot} /> : null}
      {kind === "peripheral" ? (
        <circle cx={8} cy={6} r={4} className="fill-none stroke-current" strokeWidth={1.5} />
      ) : null}
      {kind === "core" ? (
        <rect
          x={4}
          y={2}
          width={8}
          height={8}
          className="fill-none stroke-current"
          strokeWidth={1.5}
        />
      ) : null}
      {kind === "line" ? (
        <line x1={1} x2={15} y1={6} y2={6} className={INK.value} strokeWidth={2} />
      ) : null}
      {kind === "reference" ? (
        <line
          x1={1}
          x2={15}
          y1={6}
          y2={6}
          className={INK.referenceLine}
          strokeWidth={1.5}
          strokeDasharray="4 3"
        />
      ) : null}
      {kind === "in" ? <rect x={3} y={1} width={10} height={10} className={INK.inBar} /> : null}
      {kind === "out" ? <rect x={3} y={1} width={10} height={10} className={INK.outBar} /> : null}
      {kind === "gap" ? (
        <circle cx={8} cy={6} r={3.5} className={INK.gapRing} strokeWidth={1.5} />
      ) : null}
    </svg>
  );
}

export function Legend({ items }: { items: readonly { glyph?: LegendGlyph; text: string }[] }) {
  return (
    <ul className="text-caption text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
      {items.map((i) => (
        <li key={i.text} className="inline-flex items-center gap-1.5">
          {i.glyph ? <Glyph kind={i.glyph} /> : null}
          {i.text}
        </li>
      ))}
    </ul>
  );
}

export const ORIGIN_LEGEND = [
  { glyph: "clerking", text: "At clerking" },
  { glyph: "nursing", text: "Nursing entry" },
] as const satisfies readonly { glyph: LegendGlyph; text: string }[];
