/**
 * The Main store's chart geometry (STORE.md §B3): the prototype's `niceStep`, `colChart`, `lineChart`, `hbar`, `segOf`,
 * `spark`, as numbers only (percentages of the plot). Rendering is in the sibling components. Pure.
 */
export function niceStep(span: number) {
  const raw = span / 4;
  const p = 10 ** Math.floor(Math.log10(raw || 1));
  const f = raw / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
}

/** Where a tooltip anchors so it never leaves the plot. */
export type TipAt = "start" | "center" | "end";
export const tipPosition = (i: number, n: number): TipAt =>
  i < n * 0.25 ? "start" : i >= n * 0.75 ? "end" : "center";

export interface GridLine {
  y: number;
  value: number;
  zero: boolean;
}

export interface ColSeg {
  v: number;
  color: string;
}
export interface ColDatum {
  x: string;
  showX: boolean;
  tip: string;
  segs: ColSeg[];
}
export interface ColBarSeg {
  top: number;
  height: number;
  color: string;
  /** The data end, rounded; the baseline stays square. */
  round: "top" | "bottom" | null;
  /** A 2 px white gap between stacked segments. */
  gap: "top" | "bottom" | null;
}

export function colGeometry(cols: readonly ColDatum[]) {
  let hi = 0;
  let lo = 0;
  for (const c of cols) {
    let pos = 0;
    let neg = 0;
    for (const g of c.segs) {
      if (g.v > 0) pos += g.v;
      else neg += g.v;
    }
    hi = Math.max(hi, pos);
    lo = Math.min(lo, neg);
  }
  const step = Math.max(1, niceStep(Math.max(hi - lo, 1)));
  const top = Math.max(step, Math.ceil(hi / step) * step);
  const bot = lo < 0 ? Math.floor(lo / step) * step : 0;
  const span = top - bot;
  const Y = (v: number) => ((top - v) / span) * 100;
  const grid: GridLine[] = [];
  for (let g = bot; g <= top + step / 2; g += step)
    grid.push({ y: Y(g), value: g, zero: Math.abs(g) < step / 2 });
  const bars = cols.map((c) => {
    const pos = c.segs.filter((q) => q.v > 0);
    const neg = c.segs.filter((q) => q.v < 0);
    const segs: ColBarSeg[] = [];
    let acc = 0;
    pos.forEach((q, k) => {
      segs.push({
        top: Y(acc + q.v),
        height: (q.v / span) * 100,
        color: q.color,
        round: k === pos.length - 1 ? "top" : null,
        gap: k > 0 ? "bottom" : null,
      });
      acc += q.v;
    });
    acc = 0;
    neg.forEach((q, k) => {
      segs.push({
        top: Y(acc),
        height: (-q.v / span) * 100,
        color: q.color,
        round: k === neg.length - 1 ? "bottom" : null,
        gap: k > 0 ? "top" : null,
      });
      acc += q.v;
    });
    return { segs, x: c.x, showX: c.showX, tip: c.tip };
  });
  return { grid, bars, top, bot, step };
}

export interface LinePoint {
  x: string;
  showX: boolean;
  v: number | null;
  tip: string;
}
export type LineRef = { v: number; label: string } | { band: [number, number]; label: string };
export interface LineOpts {
  lo: number;
  hi: number;
  step: number;
  stepped?: boolean;
  noArea?: boolean;
  refs?: readonly LineRef[];
}

export function lineGeometry(pts: readonly LinePoint[], o: LineOpts) {
  const n = pts.length;
  const span = o.hi - o.lo || 1;
  const X = (i: number) => (n < 2 ? 50 : (i / (n - 1)) * 100);
  const Y = (v: number) => Math.max(0, Math.min(100, ((o.hi - v) / span) * 100));
  const live = pts.flatMap((p, i) => (p.v === null ? [] : [{ v: p.v, i, tip: p.tip }]));
  const path = live
    .map((q, k) => {
      const here = `${X(q.i).toFixed(2)} ${Y(q.v).toFixed(2)}`;
      if (!k) return `M${here}`;
      return o.stepped
        ? `L${X(q.i).toFixed(2)} ${Y(live[k - 1]!.v).toFixed(2)} L${here}`
        : `L${here}`;
    })
    .join(" ");
  const area =
    live.length > 1 && !o.noArea
      ? `${path} L${X(live.at(-1)!.i).toFixed(2)} 100 L${X(live[0]!.i).toFixed(2)} 100 Z`
      : "";
  const grid: GridLine[] = [];
  for (let g = o.lo; g <= o.hi + o.step / 2; g += o.step)
    grid.push({ y: Y(g), value: g, zero: g === o.lo });
  const refs = (o.refs ?? []).map((r) =>
    "band" in r
      ? {
          kind: "band" as const,
          top: Y(r.band[1]),
          height: Y(r.band[0]) - Y(r.band[1]),
          label: r.label,
        }
      : { kind: "line" as const, top: Y(r.v), height: 0, label: r.label },
  );
  const w = 100 / Math.max(1, n - 1);
  const lastI = live.at(-1)?.i ?? -1;
  const dots = live.map((q) => ({
    x: X(q.i),
    y: Y(q.v),
    left: n < 2 ? 0 : X(q.i) - w / 2,
    width: n < 2 ? 100 : w,
    tip: q.tip,
    end: q.i === lastI,
    i: q.i,
  }));
  const xLabels = pts.flatMap((p, i) => (p.showX ? [{ t: p.x, x: X(i) }] : []));
  return { path, area, grid, refs, dots, xLabels, n };
}

export interface BarRow {
  label: string;
  v: number;
  val: string;
  color: string;
  tip?: string;
}

/** Bar rows: the reserve keeps the value pill at the bar's tip from ever clipping. */
export function hbarGeometry(
  rows: readonly BarRow[],
  o: { max?: number; marks?: readonly number[] },
) {
  const max = o.max || Math.max(...rows.map((r) => r.v), 1);
  const reserve = Math.round(Math.max(...rows.map((r) => String(r.val).length), 2) * 7.6 + 14);
  const clamp = (f: number) => Math.max(0, Math.min(1, f));
  return {
    max,
    reserve,
    rows: rows.map((r) => ({ ...r, f: r.v > 0 ? Math.max(0.01, clamp(r.v / max)) : 0 })),
    marks: (o.marks ?? []).map((m) => clamp(m / max)),
  };
}

/** `calc()` for a share of a bar-row track, less the reserve. */
export const trackX = (reserve: number, f: number) =>
  `calc((100% - ${reserve}px) * ${f.toFixed(4)})`;

export interface SegKey {
  label: string;
  color: string;
  ink: string;
}

/** Segments of a stacked row: the count is printed inside when ≥ 12 % wide. */
export function segments(parts: readonly number[], keys: readonly SegKey[]) {
  const tot = parts.reduce((a, b) => a + b, 0) || 1;
  return parts.flatMap((v, i) => {
    if (v <= 0) return [];
    const share = v / tot;
    return [{ v, share, key: keys[i]!, inside: share >= 0.12 }];
  });
}

/** A 12-point sparkline in a 0–100 box: a path and the end dot. Null values are skipped. */
export function spark(vals: readonly (number | null)[]) {
  const live = vals.flatMap((x) => (x === null ? [] : [x]));
  if (live.length < 2) return null;
  const lo = Math.min(...live);
  const sp = Math.max(...live) - lo || 1;
  const n = vals.length;
  const pts = vals.flatMap((x, i) =>
    x === null ? [] : [[(i / (n - 1)) * 100, 88 - ((x - lo) / sp) * 76] as const],
  );
  const last = pts.at(-1)!;
  return {
    d: pts.map((p, k) => `${k ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" "),
    x: last[0],
    y: last[1],
  };
}
