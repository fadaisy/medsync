import type { TipAt } from "./geometry";
import type { OpenTarget, Plot } from "@/lib/pharmacy/derive/store/stats";
import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";

import { AREA, BAND, DATA, GRID, REF, SPARK, ZERO } from "@/lib/pharmacy/charts/palette";
import { cn } from "@/lib/utils";
import { Chip } from "./chip";
import {
  colGeometry,
  hbarGeometry,
  lineGeometry,
  segments,
  spark,
  tipPosition,
  trackX,
} from "./geometry";

/**
 * The chart forms (STORE.md §B3). Plain SVG and CSS, no chart library. Every mark has its words: an `aria-label`, and a
 * tooltip on hover and on keyboard focus (CSS only). No dual axes. Text never takes a data colour.
 */
export type HrefOf = (t: OpenTarget) => string;

const compactAxis = (v: number) => {
  const a = Math.abs(v);
  if (a >= 1e6) return `${+(v / 1e6).toFixed(1)}m`;
  if (a >= 1e3) return `${+(v / 1e3).toFixed(1)}k`;
  return String(v);
};
const axis = (fmt: "compact" | "plain" | "percent" | "celsius", v: number) =>
  fmt === "percent"
    ? `${v}%`
    : fmt === "celsius"
      ? `${v}°`
      : fmt === "compact"
        ? compactAxis(v)
        : String(v);

const PLOT: CSSProperties = { position: "absolute", inset: "18px 16px 26px 46px" };
const label = "text-ink-600 absolute text-[11px] leading-none tabular-nums";
const markFocus = "focus-visible:ring-primary outline-none focus-visible:ring-2";

function Tip({ at, children }: { at: TipAt; children: ReactNode }) {
  return (
    <span
      role="tooltip"
      className={cn(
        "bg-foreground text-background pointer-events-none absolute bottom-full z-20 mb-1 hidden w-max max-w-[260px] rounded-md px-2 py-1 text-[12px] leading-4 group-hover/mark:block group-focus-visible/mark:block",
        at === "start" ? "left-0" : at === "end" ? "right-0" : "left-1/2 -translate-x-1/2",
      )}
    >
      {children}
    </span>
  );
}

function Grid({
  lines,
  fmt,
}: {
  lines: { y: number; value: number; zero: boolean }[];
  fmt: Parameters<typeof axis>[0];
}) {
  return lines.map((l) => (
    <div
      key={l.value}
      className="absolute inset-x-0 border-t"
      style={{ top: `${l.y}%`, borderColor: l.zero ? ZERO : GRID }}
    >
      <span className={cn(label, "-left-[46px] w-[40px] -translate-y-1/2 text-right")}>
        {axis(fmt, l.value)}
      </span>
    </div>
  ));
}

function ColPlot({ plot }: { plot: Extract<Plot, { form: "col" }> }) {
  const g = colGeometry(plot.cols);
  const n = g.bars.length;
  return (
    <div className="relative" style={{ height: plot.h }}>
      <div style={PLOT}>
        <Grid lines={g.grid} fmt={plot.fmt} />
        <div className="absolute inset-0 flex">
          {g.bars.map((c, i) => (
            <div
              key={`${c.x}-${i}`}
              tabIndex={0}
              aria-label={c.tip}
              className={cn(
                "group/mark hover:bg-ink-50/60 relative h-full min-w-0 flex-1 rounded-sm",
                markFocus,
              )}
            >
              <div
                className="absolute inset-y-0 left-1/2 -translate-x-1/2"
                style={{ width: "min(24px, 64%)" }}
              >
                {c.segs.map((s, k) => (
                  <span
                    key={k}
                    className={cn(
                      "absolute inset-x-0",
                      s.round === "top" && "rounded-t",
                      s.round === "bottom" && "rounded-b",
                    )}
                    style={{
                      top: `${s.top}%`,
                      height: `${s.height}%`,
                      background: s.color,
                      borderTop: s.gap === "top" ? "2px solid var(--card)" : undefined,
                      borderBottom: s.gap === "bottom" ? "2px solid var(--card)" : undefined,
                    }}
                  />
                ))}
              </div>
              <Tip at={tipPosition(i, n)}>{c.tip}</Tip>
              {c.showX ? (
                <span
                  className={cn(
                    label,
                    "top-full left-1/2 mt-1.5 -translate-x-1/2 whitespace-nowrap",
                  )}
                >
                  {c.x}
                </span>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function LinePlot({ plot }: { plot: Extract<Plot, { form: "line" }> }) {
  const g = lineGeometry(plot.pts, plot);
  return (
    <div className="relative" style={{ height: plot.h }}>
      <div style={PLOT}>
        <Grid lines={g.grid} fmt={plot.fmt} />
        {g.refs.map((r) =>
          r.kind === "band" ? (
            <div
              key={r.label}
              className="absolute inset-x-0"
              style={{ top: `${r.top}%`, height: `${r.height}%`, background: BAND }}
            >
              <span className={cn(label, "top-1 right-1")}>{r.label}</span>
            </div>
          ) : (
            <div
              key={r.label}
              className="absolute inset-x-0 border-t"
              style={{ top: `${r.top}%`, borderColor: REF }}
            >
              <span className={cn(label, "right-0 -translate-y-[calc(100%+3px)] font-semibold")}>
                {r.label}
              </span>
            </div>
          ),
        )}
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden
          className="absolute inset-0 size-full overflow-visible"
        >
          {g.area ? <path d={g.area} fill={AREA} /> : null}
          {g.path ? (
            <path
              d={g.path}
              fill="none"
              stroke={DATA}
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
            />
          ) : null}
        </svg>
        {g.dots.map((d) => (
          <div
            key={d.i}
            tabIndex={0}
            aria-label={d.tip}
            className={cn("group/mark absolute inset-y-0", markFocus)}
            style={{ left: `${d.left}%`, width: `${d.width}%` }}
          >
            <span
              className="absolute inset-y-0 hidden w-px group-hover/mark:block group-focus-visible/mark:block"
              style={{ left: `calc(${((d.x - d.left) / d.width) * 100}%)`, background: ZERO }}
            />
            <span
              className={cn(
                "border-card absolute z-10 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2",
                d.end ? "block" : "hidden group-hover/mark:block group-focus-visible/mark:block",
              )}
              style={{
                left: `${((d.x - d.left) / d.width) * 100}%`,
                top: `${d.y}%`,
                background: DATA,
              }}
            />
            <Tip at={tipPosition(d.i, g.n)}>{d.tip}</Tip>
          </div>
        ))}
        {g.xLabels.map((x) => (
          <span
            key={`${x.t}-${x.x}`}
            className={cn(label, "top-full mt-1.5 -translate-x-1/2 whitespace-nowrap")}
            style={{ left: `${x.x}%` }}
          >
            {x.t}
          </span>
        ))}
      </div>
    </div>
  );
}

function BarsPlot({ plot, hrefOf }: { plot: Extract<Plot, { form: "bars" }>; hrefOf?: HrefOf }) {
  const g = hbarGeometry(plot.rows, { max: plot.max, marks: plot.marks?.map((m) => m.v) });
  const anyChip = plot.rows.some((r) => r.chip);
  const lw = plot.labelWidth ?? "8rem";
  const cols = `${lw} minmax(0, 1fr)${anyChip ? " 6.5rem" : ""}`;
  return (
    <div className="flex flex-col">
      {plot.marks?.length ? (
        <div className="hidden min-[601px]:grid" style={{ gridTemplateColumns: cols }}>
          <span />
          <div className="relative h-4">
            {plot.marks.map((m, i) => (
              <span
                key={m.label}
                className={cn(label, "top-0 -translate-x-1/2 font-semibold whitespace-nowrap")}
                style={{ left: trackX(g.reserve, g.marks[i]!) }}
              >
                {m.label}
              </span>
            ))}
          </div>
        </div>
      ) : null}
      {g.rows.map((r, i) => {
        const source = plot.rows[i]!;
        const body = (
          <>
            <span className="text-foreground truncate text-[13px] leading-5 max-[600px]:col-start-1">
              {r.label}
            </span>
            <span className="relative block h-5 min-w-0 max-[600px]:col-span-2 max-[600px]:row-start-2">
              {g.marks.map((f, k) => (
                <span
                  key={k}
                  className="absolute inset-y-0 w-px"
                  style={{ left: trackX(g.reserve, f), background: ZERO }}
                />
              ))}
              <span
                className="absolute top-1 h-3 rounded-r"
                style={{ left: 0, width: trackX(g.reserve, r.f), background: r.color }}
              />
              <span
                className="bg-card text-foreground absolute top-0 rounded px-1 text-[12px] leading-5 font-semibold whitespace-nowrap tabular-nums"
                style={{ left: `calc(${trackX(g.reserve, r.f)} + 4px)` }}
              >
                {r.val}
              </span>
              {source.tip ? <Tip at="start">{source.tip}</Tip> : null}
            </span>
            {anyChip ? (
              <span className="flex items-center max-[600px]:col-start-2 max-[600px]:row-start-1 max-[600px]:justify-end min-[601px]:justify-end">
                {source.chip ? <Chip tone={source.chip.tone}>{source.chip.text}</Chip> : null}
              </span>
            ) : null}
          </>
        );
        const row = cn(
          "group/mark grid min-h-7 items-center gap-x-2 rounded py-0.5 max-[600px]:grid-cols-[minmax(0,1fr)_auto]",
          markFocus,
        );
        const aria = `${source.tip ?? r.label}: ${r.val}`;
        return source.open && hrefOf ? (
          <Link
            key={`${r.label}-${i}`}
            href={hrefOf(source.open)}
            scroll={false}
            aria-label={aria}
            className={cn(row, "hover:bg-ink-50 no-underline")}
            style={{ gridTemplateColumns: undefined, ...gridStyle(cols) }}
          >
            {body}
          </Link>
        ) : (
          <div
            key={`${r.label}-${i}`}
            tabIndex={0}
            aria-label={aria}
            className={row}
            style={gridStyle(cols)}
          >
            {body}
          </div>
        );
      })}
    </div>
  );
}
/** Phones stack label and chip over the bar: the column template goes through a variable the class can drop. */
const gridStyle = (cols: string): CSSProperties =>
  ({ "--cols": cols, gridTemplateColumns: "var(--cols)" }) as CSSProperties;

function StackPlot({ plot, hrefOf }: { plot: Extract<Plot, { form: "stack" }>; hrefOf?: HrefOf }) {
  return (
    <div className="flex flex-col gap-2">
      {plot.rows.map((r) => {
        const segs = segments(r.parts, plot.keys);
        const tip = `${r.label}: ${r.parts.map((v, i) => `${plot.keys[i]!.label} ${v}`).join(" · ")}`;
        const inner = (
          <>
            <span className="text-foreground truncate text-[13px] leading-5">{r.label}</span>
            <span className="bg-ink-100 relative flex h-[22px] min-w-0 gap-0.5 overflow-hidden rounded">
              {segs.map((s) => (
                <span
                  key={s.key.label}
                  className="flex items-center justify-center overflow-hidden text-[11.5px] font-semibold"
                  style={{
                    flex: `${s.v} 1 0`,
                    minWidth: 6,
                    background: s.key.color,
                    color: s.key.ink,
                  }}
                >
                  {s.inside ? s.v : null}
                </span>
              ))}
            </span>
            <span className="text-ink-700 text-right text-[12px] whitespace-nowrap tabular-nums">
              {r.val}
            </span>
            <Tip at="start">{tip}</Tip>
          </>
        );
        const cls = cn(
          "group/mark relative grid grid-cols-[7.5rem_minmax(0,1fr)_4.2rem] items-center gap-2 rounded no-underline",
          markFocus,
        );
        return r.open && hrefOf ? (
          <Link
            key={r.label}
            href={hrefOf(r.open)}
            scroll={false}
            aria-label={tip}
            className={cn(cls, "hover:bg-ink-50")}
          >
            {inner}
          </Link>
        ) : (
          <div key={r.label} tabIndex={0} aria-label={tip} className={cls}>
            {inner}
          </div>
        );
      })}
    </div>
  );
}

function SegPlot({ plot }: { plot: Extract<Plot, { form: "seg" }> }) {
  const segs = segments(plot.parts, plot.keys);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex h-3 gap-0.5 overflow-hidden rounded">
        {segs.map((s) => (
          <span
            key={s.key.label}
            title={`${s.key.label}: ${s.v}`}
            style={{ flex: `${s.v} 1 0`, minWidth: 6, background: s.key.color }}
          />
        ))}
      </div>
      <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
        {plot.list.map((l) => (
          <li key={l.label} className="flex items-baseline gap-2 text-[13px]">
            <span
              aria-hidden
              className="size-2.5 shrink-0 self-center rounded-sm"
              style={{ background: l.color }}
            />
            <span className="text-foreground font-semibold">{l.label}</span>
            <span className="text-ink-600 text-[12px]">{l.sub}</span>
            <span className="text-foreground ml-auto tabular-nums">{l.val}</span>
            <span className="text-ink-600 w-9 text-right text-[12px] tabular-nums">{l.share}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function PlotView({ plot, hrefOf }: { plot: Plot; hrefOf?: HrefOf }) {
  if (plot.form === "col") return <ColPlot plot={plot} />;
  if (plot.form === "line") return <LinePlot plot={plot} />;
  if (plot.form === "bars") return <BarsPlot plot={plot} hrefOf={hrefOf} />;
  if (plot.form === "stack") return <StackPlot plot={plot} hrefOf={hrefOf} />;
  return <SegPlot plot={plot} />;
}

/** The tile's sparkline: a grey line and a teal end dot. */
export function Spark({ series }: { series: readonly (number | null)[] }) {
  const s = spark(series);
  if (!s) return null;
  return (
    <span className="relative block h-7 w-full" aria-hidden>
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="absolute inset-0 size-full overflow-visible"
      >
        <path
          d={s.d}
          fill="none"
          stroke={SPARK}
          strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <span
        className="absolute size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ left: `${s.x}%`, top: `${s.y}%`, background: DATA }}
      />
    </span>
  );
}
