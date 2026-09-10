import { useEffect, useRef, useState } from "react";

import type { Sample } from "../engine/types.ts";
import {
  GLUCOSE_MAX,
  GLUCOSE_MIN,
  INSULIN_COLOUR,
  SERIES,
  STATE_COLOUR,
} from "./tracePalette.ts";
import { num, simTime } from "../lib/format.ts";
import { benchData } from "../store/benchData.ts";
import { TRACE_WINDOWS, useBench, type TraceWindow } from "../store/bench.ts";
import type { HourAggregate } from "../worker/protocol.ts";

/**
 * The instrument traces.
 *
 * Drawn on a canvas from the buffers directly, in an animation frame, so the
 * plot keeps 60 frames per second while the worker runs at up to 1440 times
 * real time. Nothing here goes through React state.
 *
 * Series are distinguished by stroke pattern as well as colour, because
 * colour alone is never allowed to carry meaning on a clinical surface.
 */

function windowSeconds(id: TraceWindow): number {
  return TRACE_WINDOWS.find((w) => w.id === id)?.seconds ?? 6 * 3600;
}

export function Traces() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const windowId = useBench((s) => s.window);
  const setWindow = useBench((s) => s.setWindow);
  const windowRef = useRef(windowId);
  windowRef.current = windowId;
  const [showText, setShowText] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    let frame = 0;
    let lastRevision = -1;
    let lastWidth = 0;

    const draw = () => {
      frame = requestAnimationFrame(draw);
      const parent = canvas.parentElement;
      if (!parent) return;

      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const width = parent.clientWidth;
      const height = parent.clientHeight;
      const resized = width !== lastWidth || canvas.height !== Math.round(height * ratio);
      if (resized) {
        canvas.width = Math.round(width * ratio);
        canvas.height = Math.round(height * ratio);
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        lastWidth = width;
      }
      // Nothing new and nothing resized: skip the frame entirely.
      if (!resized && benchData.revision === lastRevision) return;
      lastRevision = benchData.revision;

      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      render(context, width, height, windowRef.current);
    };

    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, []);

  const summary = useTextSummary(windowId);

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
        <div role="group" aria-label="Trace window" className="flex gap-1">
          {TRACE_WINDOWS.map((w) => (
            <button
              key={w.id}
              type="button"
              onClick={() => setWindow(w.id)}
              aria-pressed={windowId === w.id}
              className={`rounded-[var(--radius-control)] border px-2 py-1 font-mono text-micro transition-colors duration-[var(--duration-instant)] ease-[var(--ease-medsync)] ${
                windowId === w.id
                  ? "border-teal-bright bg-teal-bright/15 text-teal-bright"
                  : "border-edge text-muted hover:border-teal-bright hover:text-teal-bright"
              }`}
            >
              {w.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setShowText((v) => !v)}
          aria-expanded={showText}
          className="rounded-[var(--radius-control)] border border-edge px-2 py-1 text-micro text-muted transition-colors duration-[var(--duration-instant)] ease-[var(--ease-medsync)] hover:border-teal-bright hover:text-teal-bright"
        >
          {showText ? "Hide text readout" : "Text readout"}
        </button>
      </div>

      <div className="relative min-h-[180px] flex-1 overflow-hidden rounded-[var(--radius-control)] border border-edge bg-[#0d1424]">
        <canvas ref={canvasRef} role="img" aria-label={summary.short} className="block" />
      </div>

      <ul className="flex shrink-0 flex-wrap gap-x-3 gap-y-0.5 text-[10px] leading-tight text-muted">
        {SERIES.map((s) => (
          <li key={s.id} className="flex items-center gap-1" title={s.label}>
            <svg width="16" height="8" aria-hidden="true" className="shrink-0">
              <line
                x1="0"
                y1="4"
                x2="16"
                y2="4"
                stroke={s.colour}
                strokeWidth={s.width + 0.5}
                strokeDasharray={s.dash.join(" ")}
                opacity={s.ghost ? 0.55 : 1}
              />
            </svg>
            {s.shortLabel}
          </li>
        ))}
        <li className="flex items-center gap-1" title="Insulin delivery, basal and boluses">
          <svg width="16" height="8" aria-hidden="true" className="shrink-0">
            <line x1="0" y1="4" x2="16" y2="4" stroke={INSULIN_COLOUR} strokeWidth="2" data-red="insulin" />
          </svg>
          Insulin delivery
        </li>
      </ul>

      <div className={showText ? "sr-only is-shown" : "sr-only"}>
        <h3 className="text-heading-s">Text readout of the traces</h3>
        <p className="text-micro text-muted">{summary.short}</p>
        {/* Focusable, because a scrollable region has to be reachable by
            keyboard as well as by pointer. */}
        <div
          className="mt-2 overflow-x-auto"
          tabIndex={0}
          role="region"
          aria-label="Trace values, scrollable table"
        >
        <table className="w-full border-collapse text-micro">
          <caption className="sr-only">
            Lowest, highest and latest value of each trace over the visible window
          </caption>
          <thead>
            <tr className="text-left text-muted">
              <th scope="col" className="py-1 pr-3">Trace</th>
              <th scope="col" className="py-1 pr-3">Lowest</th>
              <th scope="col" className="py-1 pr-3">Highest</th>
              <th scope="col" className="py-1">Latest</th>
            </tr>
          </thead>
          <tbody className="tabular">
            {summary.rows.map((row) => (
              <tr key={row.label} className="border-t border-edge">
                <th scope="row" className="py-1 pr-3 text-left font-normal font-sans text-muted">
                  {row.label}
                </th>
                <td className="py-1 pr-3">{row.low}</td>
                <td className="py-1 pr-3">{row.high}</td>
                <td className="py-1">{row.latest}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}

/** Lowest, highest and latest of each series over the visible window. */
function useTextSummary(windowId: TraceWindow) {
  useBench((s) => s.tick);
  const span = windowSeconds(windowId);
  const state = benchData.state;
  const nowT = state?.t ?? 0;
  const useHours = span > 24 * 3600;

  const rows: Array<{ label: string; low: string; high: string; latest: string }> = [];
  const points = useHours
    ? benchData.hours.filter((h) => h.t >= nowT - span)
    : benchData.minutes.filter((s) => s.t >= nowT - span);

  for (const series of SERIES) {
    let low = Infinity;
    let high = -Infinity;
    let latest: number | null = null;
    for (const point of points) {
      const value = useHours
        ? series.hour(point as HourAggregate)
        : series.minute(point as Sample);
      if (value === null || !Number.isFinite(value)) continue;
      low = Math.min(low, value);
      high = Math.max(high, value);
      latest = value;
    }
    rows.push({
      label: series.label,
      low: low === Infinity ? "not available" : `${num(low, 1)} mmol/L`,
      high: high === -Infinity ? "not available" : `${num(high, 1)} mmol/L`,
      latest: latest === null ? "not available" : `${num(latest, 1)} mmol/L`,
    });
  }

  rows.push({
    label: "Insulin delivery",
    low: "0.00 U/h",
    high: `${num(Math.max(0, ...points.map((p) => ("insulinUph" in p ? p.insulinUph : p.insulinMean))), 2)} U/h`,
    latest: `${num(state?.deliveryRateUph ?? null, 2)} U/h`,
  });

  const short =
    state === null
      ? "Traces are still loading."
      : `Traces over the last ${TRACE_WINDOWS.find((w) => w.id === windowId)?.label}, ending ${simTime(nowT)}. ` +
        `Plasma glucose ${num(state.plasmaGlucose)} mmol/L, fused output ${num(state.fusedGlucose)} mmol/L ` +
        `plus or minus ${num(state.fusedUncertainty, 2)}, insulin ${num(state.deliveryRateUph, 2)} U/h, ` +
        `supervisor state ${state.arbitration}.`;

  return { rows, short };
}

/** All the canvas drawing, in one place. */
function render(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  windowId: TraceWindow,
): void {
  const state = benchData.state;
  context.clearRect(0, 0, width, height);
  if (!state) return;

  const padLeft = 34;
  const padRight = 8;
  const padTop = 8;
  const ribbonHeight = 10;
  const insulinHeight = Math.max(28, height * 0.16);
  const gap = 6;
  const plotHeight = height - padTop - ribbonHeight - insulinHeight - gap * 2;
  const plotWidth = width - padLeft - padRight;
  if (plotWidth <= 0 || plotHeight <= 0) return;

  const span = windowSeconds(windowId);
  const endT = state.t;
  const startT = endT - span;
  const useHours = span > 24 * 3600;

  const x = (t: number) => padLeft + ((t - startT) / span) * plotWidth;
  const y = (g: number) =>
    padTop + plotHeight * (1 - (g - GLUCOSE_MIN) / (GLUCOSE_MAX - GLUCOSE_MIN));

  // Target range band, 3.9 to 10 mmol/L.
  context.fillStyle = "rgba(13, 148, 136, 0.08)";
  context.fillRect(padLeft, y(10), plotWidth, y(3.9) - y(10));

  // Gridlines and the glucose axis.
  context.strokeStyle = "#24304a";
  context.lineWidth = 1;
  context.setLineDash([]);
  context.font = '10px ui-monospace, "SF Mono", Menlo, monospace';
  context.fillStyle = "#9aa4b2";
  context.textAlign = "right";
  context.textBaseline = "middle";
  for (const level of [4, 8, 12, 16, 20]) {
    const yy = Math.round(y(level)) + 0.5;
    context.beginPath();
    context.moveTo(padLeft, yy);
    context.lineTo(padLeft + plotWidth, yy);
    context.stroke();
    context.fillText(String(level), padLeft - 5, yy);
  }
  context.textAlign = "left";
  context.fillText("mmol/L", padLeft + 2, padTop + 6);

  const minutes = benchData.minutes;
  const hours = benchData.hours;

  // Uncertainty band on the fused output, drawn first so lines sit on top.
  if (!useHours) {
    context.fillStyle = "rgba(255, 255, 255, 0.14)";
    context.beginPath();
    let started = false;
    for (const sample of minutes) {
      if (sample.t < startT || sample.fused === null) continue;
      const px = x(sample.t);
      const py = y(sample.fused + sample.fusedUncertainty);
      if (!started) {
        context.moveTo(px, py);
        started = true;
      } else context.lineTo(px, py);
    }
    for (let i = minutes.length - 1; i >= 0; i -= 1) {
      const sample = minutes[i];
      if (!sample || sample.t < startT || sample.fused === null) continue;
      context.lineTo(x(sample.t), y(sample.fused - sample.fusedUncertainty));
    }
    if (started) {
      context.closePath();
      context.fill();
    }
  }

  for (const series of SERIES) {
    context.strokeStyle = series.colour;
    context.lineWidth = series.width;
    context.globalAlpha = series.ghost ? 0.5 : 1;
    context.setLineDash(series.dash);
    context.beginPath();
    let pen = false;
    if (useHours) {
      for (const hour of hours) {
        if (hour.t < startT) continue;
        const value = series.hour(hour);
        if (value === null) {
          pen = false;
          continue;
        }
        const px = x(hour.t);
        const py = y(value);
        if (!pen) {
          context.moveTo(px, py);
          pen = true;
        } else context.lineTo(px, py);
      }
    } else {
      for (const sample of minutes) {
        if (sample.t < startT) continue;
        const value = series.minute(sample);
        if (value === null) {
          pen = false;
          continue;
        }
        const px = x(sample.t);
        const py = y(value);
        if (!pen) {
          context.moveTo(px, py);
          pen = true;
        } else context.lineTo(px, py);
      }
    }
    context.stroke();
  }
  context.globalAlpha = 1;
  context.setLineDash([]);

  // Insulin strip. Red, and red is only ever the insulin path or an invalid
  // state anywhere on this bench.
  const insulinTop = padTop + plotHeight + gap;
  const maxRate = Math.max(state.envelope.maxBasal, 1) * 1.2;
  context.strokeStyle = "#24304a";
  context.beginPath();
  context.moveTo(padLeft, insulinTop + insulinHeight + 0.5);
  context.lineTo(padLeft + plotWidth, insulinTop + insulinHeight + 0.5);
  context.stroke();
  context.fillStyle = "#9aa4b2";
  context.textAlign = "right";
  context.fillText("U/h", padLeft - 5, insulinTop + 6);

  context.fillStyle = "rgba(220, 38, 38, 0.35)";
  context.strokeStyle = INSULIN_COLOUR;
  context.lineWidth = 1.25;
  context.beginPath();
  context.moveTo(padLeft, insulinTop + insulinHeight);
  const insulinPoints = useHours ? hours : minutes;
  for (const point of insulinPoints) {
    if (point.t < startT) continue;
    const rate = "insulinUph" in point ? point.insulinUph : point.insulinMean;
    context.lineTo(x(point.t), insulinTop + insulinHeight * (1 - Math.min(rate / maxRate, 1)));
  }
  const lastPoint = insulinPoints[insulinPoints.length - 1];
  if (lastPoint) context.lineTo(x(lastPoint.t), insulinTop + insulinHeight);
  context.closePath();
  context.fill();
  context.stroke();

  // State ribbon.
  const ribbonTop = insulinTop + insulinHeight + gap;
  const points = useHours ? hours : minutes;
  const stepWidth = Math.max(1, plotWidth / Math.max(points.length, 1));
  for (const point of points) {
    if (point.t < startT) continue;
    const stateName =
      "arbitration" in point
        ? point.arbitration
        : point.autonomyMin === 3
          ? "valid"
          : point.autonomyMin === 2
            ? "doubtful-one"
            : point.autonomyMin === 0
              ? "invalid"
              : "bridged";
    context.fillStyle = STATE_COLOUR[stateName] ?? "#9aa4b2";
    context.fillRect(x(point.t), ribbonTop, stepWidth + 0.5, ribbonHeight);
  }
  context.strokeStyle = "#24304a";
  context.strokeRect(padLeft + 0.5, ribbonTop + 0.5, plotWidth - 1, ribbonHeight - 1);

  // Time axis labels at each end.
  context.fillStyle = "#9aa4b2";
  context.textAlign = "left";
  context.textBaseline = "top";
  context.fillText(simTime(Math.max(0, startT)), padLeft, ribbonTop + ribbonHeight + 3);
  context.textAlign = "right";
  context.fillText(simTime(endT), padLeft + plotWidth, ribbonTop + ribbonHeight + 3);
}
