import type { Margins } from "./frame";
import type { FluidBalanceBody } from "@/lib/emr/charts/payload";

import { NO_WEIGHT_TEXT } from "@/lib/emr/charts/payload";
import { clockTicks, linearScale, niceTicks } from "@/lib/emr/charts/scale";
import {
  GRAPH_WIDTH,
  GraphEmpty,
  GraphFigure,
  GraphSvg,
  INK,
  LABEL_GUTTER,
  Legend,
  ReferenceLineMark,
  TimeAxis,
  ValueAxis,
} from "./frame";
import { mlWords, plural, trendWords } from "./words";

/**
 * Urine output per hour (MONITORING-CHARTS.md §3, graph 2) against a dashed amber line at
 * 0.5 mL/kg/h × the vitals weight, labelled "KDIGO oliguria threshold, to verify". Hours below the
 * line are drawn like any other: MedSync does not flag them. No weight, no line, and the reason in
 * words. "Not measured" is written in the hour, never drawn as an empty bar.
 */

const TITLE = "Urine output per hour";
const HEIGHT = 200;
const M: Margins = { top: 22, right: LABEL_GUTTER, bottom: 30, left: 56 };
const HOUR = 3600000;

export function UrineOutputGraph({
  body,
  weightKg,
}: {
  body: FluidBalanceBody;
  weightKg: number | null;
}) {
  const rows = body.hours;
  const any = rows.some((r) => r.urineOut !== null || r.urineNotMeasured);
  if (!any) return <GraphEmpty title={TITLE} />;

  const step = body.stepHours * HOUR;
  const start = Date.parse(rows[0]!.start);
  const end = Date.parse(rows.at(-1)!.start) + step;
  const plotW = GRAPH_WIDTH - M.left - M.right;
  const slot = plotW / rows.length;
  const center = (i: number) => M.left + (i + 0.5) * slot;
  const xTime = (t: number) => M.left + ((t - start) / (end - start)) * plotW;
  const perHour = (ml: number) => ml / body.stepHours;

  const ref = body.urineReference;
  const values = rows.flatMap((r) => (r.urineOut === null ? [] : [perHour(r.urineOut)]));
  const ticks = niceTicks(0, Math.max(1, ...values, ref?.mlPerHour ?? 0));
  const y = linearScale([ticks[0]!, ticks.at(-1)!], [HEIGHT - M.bottom, M.top]);
  const base = y(0);
  const barW = Math.max(2, Math.min(24, slot * 0.6));

  const measured = rows.flatMap((r) =>
    r.urineOut === null
      ? []
      : [{ at: new Date(Date.parse(r.start) + step).toISOString(), value: perHour(r.urineOut) }],
  );
  const notMeasured = rows.filter((r) => r.urineNotMeasured).length;
  const refWords = ref
    ? `Reference line ${mlWords(ref.mlPerHour)} mL/h (${ref.mlPerKgPerHour} mL/kg/h × ${weightKg ?? "the recorded"} kg), labelled ${ref.label}; hours below it are not flagged.`
    : NO_WEIGHT_TEXT;
  const label =
    `Urine output per hour: ${trendWords(measured, (n) => `${mlWords(n)} mL/h`)}. ` +
    `${refWords}${notMeasured ? ` ${plural(notMeasured, "hour")} not measured.` : ""}`;

  return (
    <GraphFigure
      title={TITLE}
      legend={
        <Legend
          items={[
            { glyph: "out", text: "Urine, mL per hour" },
            ...(ref ? [{ glyph: "reference" as const, text: ref.label }] : []),
            ...(notMeasured ? [{ text: "NM: urine not measured in that hour" }] : []),
          ]}
        />
      }
      note={
        ref
          ? `${ref.mlPerKgPerHour} mL/kg/h × ${weightKg ?? "the recorded"} kg = ${mlWords(ref.mlPerHour)} mL/h. A reference for the reader: hours below it are not flagged.`
          : NO_WEIGHT_TEXT
      }
    >
      <GraphSvg label={label} height={HEIGHT}>
        <ValueAxis ticks={ticks} y={y} x={M.left} format={mlWords} />
        <text x={M.left - 8} y={M.top - 8} textAnchor="end" className={INK.tick}>
          mL/h
        </text>
        {rows.map((r, i) =>
          r.urineOut !== null ? (
            <rect
              key={r.start}
              x={center(i) - barW / 2}
              y={y(perHour(r.urineOut))}
              width={barW}
              height={base - y(perHour(r.urineOut))}
              className={INK.outBar}
            />
          ) : r.urineNotMeasured ? (
            <text key={r.start} x={center(i)} y={base - 6} textAnchor="middle" className={INK.tick}>
              NM
            </text>
          ) : null,
        )}
        {ref ? (
          <ReferenceLineMark
            y={y(ref.mlPerHour)}
            left={M.left}
            right={GRAPH_WIDTH - M.right}
            label={`${ref.label} · ${mlWords(ref.mlPerHour)} mL/h`}
          />
        ) : null}
        <TimeAxis
          ticks={clockTicks(new Date(start), new Date(end))}
          x={xTime}
          y={base}
          left={M.left}
          right={GRAPH_WIDTH - M.right}
        />
      </GraphSvg>
    </GraphFigure>
  );
}
