import type { StoreMed, StoreWorld, WeekFlow } from "./types";
import type { ColDatum, LinePoint, LineRef, SegKey } from "@/components/pharmacy/charts/geometry";
import type { StoreSection } from "@/content/pharmacy-store";

import { niceStep } from "@/components/pharmacy/charts/geometry";
import { DATA, DATA2, STATUS_MARK as SB, VEN_RAMP } from "@/components/pharmacy/charts/palette";
import { SECTION_LABEL, ST } from "@/content/pharmacy-store";
import { fill } from "@/content/pharmacy-workspace-v2";
import { insideLimits, shelfDue, shelvesDue } from "./counts";
import { atRisk, atRiskValue, expByMonth, expRows } from "./expiry";
import {
  addDays,
  dayOf,
  fmtDay,
  fmtDow,
  hrs,
  isoWeekday,
  kampala,
  monthOf,
  num,
  ugx,
  units,
} from "./format";
import { budgetPct, planTotal } from "./orders";
import { coverBuckets, daysAt, lowList, placeBalance, runLines } from "./places";
import { fillRate, lineQtyAsked, openReqs, turnaround } from "./requisitions";
import { medOf, mosOf, notMoving, onHand, placeName, stateOf, storeValue } from "./stock";

/**
 * Figures and charts per section (STORE.md §B4, §B5): every number from the world, every series from the ledger.
 * The prototype's history arrays are gone (§L). Chart specs are data; `components/pharmacy/charts` renders them. Pure.
 */
const C = ST.charts;
const T = ST.tile;

export type OpenTarget = { section: StoreSection; med?: string; shelf?: string };

export interface Tile {
  label: string;
  value: string;
  delta: string;
  good: boolean | null;
  series?: readonly (number | null)[];
  open?: StoreSection;
  /** A filtering tile toggles this filter instead of opening. */
  filter?: string;
}

export type Plot =
  | { form: "col"; cols: ColDatum[]; fmt: "compact" | "plain"; h: number }
  | {
      form: "line";
      pts: LinePoint[];
      lo: number;
      hi: number;
      step: number;
      fmt: "compact" | "percent" | "celsius";
      h: number;
      stepped?: boolean;
      noArea?: boolean;
      refs?: LineRef[];
    }
  | {
      form: "bars";
      rows: {
        label: string;
        v: number;
        val: string;
        color: string;
        chip?: { text: string; tone: "bad" | "warn" | "info" | "neutral" | "ok" };
        tip?: string;
        open?: OpenTarget;
      }[];
      max?: number;
      labelWidth?: string;
      marks?: { v: number; label: string }[];
    }
  | {
      form: "stack";
      rows: { label: string; parts: number[]; val: string; open?: OpenTarget }[];
      keys: SegKey[];
    }
  | {
      form: "seg";
      parts: number[];
      keys: SegKey[];
      list: { color: string; label: string; sub: string; val: string; share: string }[];
    };

export interface ChartSpec {
  key: string;
  title: string;
  sub: string;
  head?: string;
  headSub?: string;
  /** Of 6 columns. */
  span: 2 | 3 | 4 | 6;
  tall?: boolean;
  legend?: { label: string; color: string }[];
  table: { cols: readonly string[]; rows: string[][] };
  open?: { label: string; target: OpenTarget };
  plot: Plot;
}

/* ─── Series ─── */

/** End-of-week value, worked backwards from today: value[w−1] = value[w] − in[w] + out[w]. */
export function storeValueByWeek(now: number, weeks: readonly WeekFlow[]): number[] {
  const out = new Array<number>(weeks.length);
  if (!weeks.length) return out;
  out[weeks.length - 1] = now;
  for (let w = weeks.length - 1; w > 0; w--)
    out[w - 1] = out[w]! - weeks[w]!.inValue + weeks[w]!.outValue;
  return out;
}

export const inOutByWeek = (weeks: readonly WeekFlow[]) => ({
  in: weeks.map((w) => w.inValue),
  out: weeks.map((w) => w.outValue),
});

/** Each medicine's balance at the end of each of the last `n` days (oldest first), walked back from today. */
export function balanceByDay(w: StoreWorld, n: number): Map<string, number[]> {
  const deltas = new Map<string, Map<string, number>>();
  for (const d of w.storeDays) {
    const m = deltas.get(d.medId) ?? new Map<string, number>();
    m.set(d.day, (m.get(d.day) ?? 0) + d.delta);
    deltas.set(d.medId, m);
  }
  const out = new Map<string, number[]>();
  for (const m of w.meds) {
    const series = new Array<number>(n);
    let bal = onHand(w, m.id);
    for (let i = n - 1; i >= 0; i--) {
      series[i] = bal;
      bal -= deltas.get(m.id)?.get(addDays(w.today, i - n + 1)) ?? 0;
    }
    out.set(m.id, series);
  }
  return out;
}

/** Medicine × days at nothing, counted only for lines the store uses (a line never stocked is not "out"). */
export function stockOutDays(w: StoreWorld, n: number): number {
  const by = balanceByDay(w, n);
  return w.meds.reduce(
    (a, m) =>
      a +
      (m.use > 0 || by.get(m.id)!.some((b) => b > 0)
        ? by.get(m.id)!.filter((b) => b <= 0).length
        : 0),
    0,
  );
}

const vital = (w: StoreWorld) => w.meds.filter((m) => m.ven === "V");
export const availabilityV = (w: StoreWorld) => {
  const v = vital(w);
  return { in: v.filter((m) => onHand(w, m.id) > 0).length, of: v.length };
};

/** Weekly V availability (%) and days out, aligned with `w.weeks`. */
function weeklyStock(w: StoreWorld) {
  const n = w.weeks.length * 7;
  const by = balanceByDay(w, n);
  const v = vital(w);
  return w.weeks.map((_, i) => {
    const end = n - 1 - (w.weeks.length - 1 - i) * 7;
    const days = Array.from({ length: 7 }, (_, k) => end - k).filter((x) => x >= 0);
    return {
      avail: v.length
        ? Math.round((v.filter((m) => (by.get(m.id)![end] ?? 0) > 0).length / v.length) * 100)
        : null,
      out: w.meds.reduce(
        (a, m) => a + (m.use > 0 ? days.filter((d) => by.get(m.id)![d]! <= 0).length : 0),
        0,
      ),
    };
  });
}

/** Days and lines out at places this month, walked back from what is there now. */
export function daysOutAtPlaces(w: StoreWorld) {
  const from = `${w.today.slice(0, 7)}-01`;
  const n = Math.round((Date.parse(w.today) - Date.parse(from)) / 86_400_000) + 1;
  let out = 0;
  const names = new Map<string, Set<string>>();
  for (const p of w.placeStock) {
    const d = new Map<string, number>();
    for (const r of w.placeDays)
      if (r.medId === p.medId && r.placeId === p.placeId) d.set(r.day, r.delta);
    let bal = p.here;
    for (let i = 0; i < n; i++) {
      const day = addDays(w.today, -i);
      if (bal <= 0) {
        out++;
        const short = medOf(w, p.medId)?.short ?? "";
        if (!names.has(short)) names.set(short, new Set());
        names.get(short)!.add(placeName(w, p.placeId));
      }
      bal -= d.get(day) ?? 0;
    }
  }
  return { out, names };
}

const dispatchValue = (w: StoreWorld, d: StoreWorld["dispatches"][number]) =>
  d.lines.reduce((a, l) => a + l.qty * (medOf(w, l.medId)?.cost ?? 0), 0);

export function issuedByPlace(w: StoreWorld, days = 30) {
  const since = addDays(w.today, -days + 1);
  return w.places
    .map((p) => ({
      id: p.id,
      name: p.name,
      value: w.dispatches
        .filter((d) => d.toId === p.id && d.fromId === w.storeId && dayOf(d.sentAt) >= since)
        .reduce((a, d) => a + dispatchValue(w, d), 0),
    }))
    .sort((a, b) => b.value - a.value);
}

export function venSplit(w: StoreWorld) {
  return (["V", "E", "N"] as const).map((k) => {
    const meds = w.meds.filter((m) => m.ven === k);
    return { k, n: meds.length, value: meds.reduce((a, m) => a + onHand(w, m.id) * m.cost, 0) };
  });
}

export function dispatchesPerDay(w: StoreWorld, days = 14) {
  return Array.from({ length: days }, (_, i) => {
    const day = addDays(w.today, i - days + 1);
    return { day, n: w.dispatches.filter((d) => dayOf(d.sentAt) === day).length };
  });
}

/** Confirmed within 24 h among dispatches sent since `from`. */
export function confirmedWithin24h(w: StoreWorld, from: string, to = "9999") {
  const list = w.dispatches.filter((d) => dayOf(d.sentAt) >= from && dayOf(d.sentAt) < to);
  const ok = list.filter(
    (d) => d.receivedAt && Date.parse(d.receivedAt) - Date.parse(d.sentAt) <= 24 * 3_600_000,
  ).length;
  return { ok, of: list.length, pct: list.length ? Math.round((ok / list.length) * 100) : null };
}

export function lossesByReason(w: StoreWorld, since: string) {
  const by = new Map<string, number>();
  for (const l of w.losses)
    if (dayOf(l.at) >= since) by.set(l.reason, (by.get(l.reason) ?? 0) + l.value);
  return [...by].map(([reason, value]) => ({ reason, value })).sort((a, b) => b.value - a.value);
}

/** Change in words: "up 4 points" or "Same as last week", and whether that is good. */
export function change(
  now: number | null,
  before: number | null,
  unit: string,
  upGood: boolean | null,
  fmt: (x: number) => string = (x) => String(Math.round(Math.abs(x))),
  vs?: string,
): { delta: string; good: boolean | null } {
  if (now === null || before === null) return { delta: "", good: null };
  const d = now - before;
  const tail = vs === undefined ? ` ${T.onLastWeek}` : vs ? ` ${vs}` : "";
  if (Math.abs(d) < 0.05) return { delta: vs === "" ? T.noChange : T.sameWeek, good: null };
  const word = d > 0 ? (vs === "" ? T.upLower : T.up) : vs === "" ? T.downLower : T.down;
  return {
    delta: `${word} ${fmt(Math.abs(d))}${unit ? ` ${unit}` : ""}${tail}`,
    good: upGood === null ? null : d > 0 === upGood,
  };
}

/* ─── Shared chart pieces ─── */

const weekLabels = (w: StoreWorld) => w.weeks.map((x) => fmtDay(x.start));
const showEvery = (i: number, n: number, every: number) => (n - 1 - i) % every === 0;
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** The latest week that has a value, and the one before it. */
function lastOf(a: readonly (number | null)[]) {
  const n = a.length;
  return a[n - 1] !== null
    ? { now: a[n - 1]!, before: a[n - 2] ?? null, when: T.thisWeek as string }
    : { now: a[n - 2] ?? null, before: a[n - 3] ?? null, when: T.lastWeek as string };
}

function series(w: StoreWorld) {
  const weeks = w.weeks.map((x) => ({ start: x.start, end: addDays(x.start, 7) }));
  return {
    fill: weeks.map((x) => fillRate(w.requisitions, x.start, x.end)),
    tat: weeks.map((x) => turnaround(w.requisitions, x.start, x.end)),
    val: storeValueByWeek(storeValue(w), w.weeks),
    stock: weeklyStock(w),
  };
}

function flowChart(w: StoreWorld): ChartSpec {
  const labels = weekLabels(w);
  const val = storeValueByWeek(storeValue(w), w.weeks);
  const total = w.weeks.reduce((a, x) => a + x.outValue, 0);
  const n = w.weeks.length;
  return {
    key: "flow",
    title: C.flow.title,
    sub: C.flow.sub,
    head: ugx(total),
    headSub: C.flow.headSub,
    span: 3,
    legend: [
      { label: C.flow.received, color: DATA },
      { label: C.flow.issued, color: DATA2 },
    ],
    table: {
      cols: C.flow.cols,
      rows: w.weeks.map((x, i) => [
        labels[i]! + (i === n - 1 ? C.flow.soFar : ""),
        ugx(x.inValue),
        ugx(x.outValue),
        ugx(val[i]!),
      ]),
    },
    plot: {
      form: "col",
      fmt: "compact",
      h: 190,
      cols: w.weeks.map((x, i) => ({
        x: labels[i]!,
        showX: showEvery(i, n, 2),
        segs: [
          { v: x.inValue, color: DATA },
          { v: -x.outValue, color: DATA2 },
        ],
        tip: fill(C.flow.tip, {
          x: labels[i]!,
          so: i === n - 1 ? C.flow.soFar : "",
          in: ugx(x.inValue),
          out: ugx(x.outValue),
        }),
      })),
    },
  };
}

function fillChart(
  w: StoreWorld,
  fillS: readonly (number | null)[],
  span: ChartSpec["span"],
): ChartSpec {
  const labels = weekLabels(w);
  const L = lastOf(fillS);
  const t = w.rules.fillTarget;
  const lows = fillS.flatMap((v) => (v === null ? [] : [v]));
  const lo = Math.min(60, Math.floor(Math.min(...lows, 60) / 10) * 10);
  return {
    key: "fill",
    title: C.fill.title,
    sub: fill(C.fill.sub, { t }),
    head: L.now === null ? "–" : `${L.now}%`,
    headSub: L.when,
    span,
    open: { label: C.fill.open, target: { section: "req" } },
    table: {
      cols: C.fill.cols,
      rows: labels.map((x, i) => [x, fillS[i] === null ? C.fill.none : `${fillS[i]}%`]),
    },
    plot: {
      form: "line",
      fmt: "percent",
      h: 200,
      lo,
      hi: 100,
      step: 10,
      refs: [{ v: t, label: fill(C.fill.target, { t }) }],
      pts: labels.map((x, i) => ({
        x,
        showX: showEvery(i, labels.length, 3),
        v: fillS[i] ?? null,
        tip: fill(C.fill.tip, { x, v: fillS[i] ?? "–" }),
      })),
    },
  };
}

function valueChart(w: StoreWorld, val: readonly number[]): ChartSpec {
  const labels = weekLabels(w);
  const hi = Math.max(...val, 1);
  const st = niceStep(hi);
  return {
    key: "value",
    title: C.value.title,
    sub: C.value.sub,
    head: ugx(storeValue(w)),
    headSub: C.value.headSub,
    span: 2,
    table: { cols: C.value.cols, rows: labels.map((x, i) => [x, ugx(val[i]!)]) },
    plot: {
      form: "line",
      fmt: "compact",
      h: 150,
      lo: 0,
      hi: Math.ceil(hi / st) * st,
      step: st,
      pts: labels.map((x, i) => ({
        x,
        showX: showEvery(i, labels.length, 3),
        v: val[i]!,
        tip: fill(C.value.tip, { x, v: ugx(val[i]!) }),
      })),
    },
  };
}

function placesChart(w: StoreWorld): ChartSpec {
  const rows = issuedByPlace(w).map((p) => ({
    label: p.name,
    v: p.value,
    val: ugx(p.value),
    color: DATA,
  }));
  return {
    key: "places",
    title: C.places.title,
    sub: C.places.sub,
    span: 2,
    open: { label: C.places.open, target: { section: "disp" } },
    table: { cols: C.places.cols, rows: rows.map((r) => [r.label, r.val]) },
    plot: { form: "bars", rows },
  };
}

function venChart(w: StoreWorld): ChartSpec {
  const split = venSplit(w);
  const tot = storeValue(w) || 1;
  const keys: SegKey[] = [
    { label: C.ven.V, color: VEN_RAMP.V, ink: "#ffffff" },
    { label: C.ven.E, color: VEN_RAMP.E, ink: "#ffffff" },
    { label: C.ven.N, color: VEN_RAMP.N, ink: "#0b0b0b" },
  ];
  const share = (v: number) =>
    v / tot < 0.01 && v > 0 ? "<1" : String(Math.round((v / tot) * 100));
  return {
    key: "ven",
    title: C.ven.title,
    sub: C.ven.sub,
    span: 2,
    table: {
      cols: C.ven.cols,
      rows: split.map((s, i) => [keys[i]!.label, ugx(s.value), `${share(s.value)}%`]),
    },
    plot: {
      form: "seg",
      parts: split.map((s) => s.value),
      keys,
      list: split.map((s, i) => ({
        color: keys[i]!.color,
        label: keys[i]!.label,
        sub: fill(s.n === 1 ? C.ven.medicine : C.ven.medicines, { n: s.n }),
        val: ugx(s.value),
        share: `${share(s.value)}%`,
      })),
    },
  };
}

const stateWord = (w: StoreWorld, m: StoreMed) => ST.state[stateOf(w, m)];
const stateChip = {
  out: { text: ST.state.chipOut, tone: "bad" },
  short: { text: ST.state.chipShort, tone: "warn" },
  over: { text: ST.state.chipOver, tone: "info" },
  still: { text: ST.state.chipStill, tone: "neutral" },
  ok: { text: ST.state.chipOk, tone: "ok" },
} as const;

function mosChart(w: StoreWorld, span: ChartSpec["span"], tall = false): ChartSpec {
  const color = { out: SB.bad, still: SB.still, short: SB.warn, over: SB.over, ok: SB.ok };
  const r = w.rules;
  const rows = w.meds
    .map((m) => {
      const mos = mosOf(w, m);
      const finite = Number.isFinite(mos) ? mos : 99;
      const st = stateOf(w, m);
      const txt = finite >= 10 ? String(Math.round(finite)) : finite.toFixed(1);
      return {
        mos: finite,
        label: m.short,
        v: Math.min(finite, 12),
        color: color[st],
        val: onHand(w, m.id) ? `${txt} ${C.mos.unit}` : "0",
        chip: stateChip[st],
        tip: fill(C.mos.tip, { name: m.short, m: txt, state: stateWord(w, m) }),
        open: { section: "card" as const, med: m.id },
        state: stateWord(w, m),
      };
    })
    .sort((a, b) => a.mos - b.mos);
  return {
    key: "mos",
    title: C.mos.title,
    sub: fill(C.mos.sub, { a: r.shortUnder, b: r.tooMuch }),
    span,
    tall,
    table: { cols: C.mos.cols, rows: rows.map((x) => [x.label, x.val, x.state]) },
    plot: {
      form: "bars",
      rows,
      max: 12,
      labelWidth: "11rem",
      marks: [
        { v: r.shortUnder, label: fill(C.mos.mark, { n: r.shortUnder }) },
        { v: r.tooMuch, label: fill(C.mos.mark, { n: r.tooMuch }) },
      ],
    },
  };
}

function coverChart(w: StoreWorld, span: ChartSpec["span"]): ChartSpec {
  const r = w.rules;
  const keys: SegKey[] = [
    { label: fill(C.cover.a, { n: r.runningOut }), color: SB.bad, ink: "#ffffff" },
    {
      label: fill(C.cover.b, { a: r.runningOut, b: r.coverAmber }),
      color: SB.warn,
      ink: "#0b0b0b",
    },
    { label: fill(C.cover.c, { n: r.coverAmber }), color: SB.ok, ink: "#ffffff" },
  ];
  const rows = w.places.map((p) => ({ p, c: coverBuckets(w, p.id) }));
  return {
    key: "cover",
    title: C.cover.title,
    sub: C.cover.sub,
    span,
    legend: keys.map((k) => ({ label: k.label, color: k.color })),
    open: span === 6 ? undefined : { label: C.cover.open, target: { section: "all" } },
    table: {
      cols: [...C.cover.cols, ...keys.map((k) => k.label)],
      rows: rows.map((x) => [x.p.name, ...x.c.map(String)]),
    },
    plot: {
      form: "stack",
      keys,
      rows: rows.map((x) => {
        const t = x.c[0] + x.c[1] + x.c[2];
        return {
          label: x.p.name,
          parts: [...x.c],
          val: fill(t === 1 ? C.cover.line : C.cover.lines, { n: t }),
          open: { section: "all" as const },
        };
      }),
    },
  };
}

function expChart(w: StoreWorld, span: ChartSpec["span"]): ChartSpec {
  const months = expByMonth(w);
  const label = (m: string) => `${monthOf(m)} ${m.slice(0, 4)}`;
  return {
    key: "exp",
    title: C.exp.title,
    sub: C.exp.sub,
    head: ugx(atRiskValue(expRows(w))),
    headSub: C.exp.headSub,
    span,
    legend: [
      { label: C.exp.used, color: DATA },
      { label: C.exp.risk, color: SB.bad },
    ],
    open: span === 4 ? undefined : { label: C.exp.open, target: { section: "exp" } },
    table: {
      cols: C.exp.cols,
      rows: months.map((e) => [label(e.month), String(e.n), ugx(e.used), ugx(e.risk)]),
    },
    plot: {
      form: "col",
      fmt: "compact",
      h: 150,
      cols: months.map((e, i) => ({
        x: monthOf(e.month),
        showX: showEvery(i, months.length, 2),
        segs: [
          { v: e.used, color: DATA },
          { v: e.risk, color: SB.bad },
        ],
        tip: e.n
          ? fill(C.exp.tip, {
              x: label(e.month),
              n: e.n,
              b: e.n === 1 ? C.exp.batch : C.exp.batches,
              v: ugx(e.used + e.risk),
            }) + (e.risk ? fill(C.exp.tipRisk, { r: ugx(e.risk) }) : "")
          : fill(C.exp.tipNone, { x: label(e.month) }),
      })),
    },
  };
}

/* ─── Per section ─── */

/** In full, part, not at all, per place, for requisitions first issued this month. */
export function linesFilled(w: StoreWorld) {
  const from = `${w.today.slice(0, 7)}-01`;
  const by = new Map(w.places.map((p) => [p.id, [0, 0, 0] as [number, number, number]]));
  for (const r of w.requisitions) {
    if (!r.firstIssuedAt || dayOf(r.firstIssuedAt) < from) continue;
    const c = by.get(r.placeId);
    if (!c) continue;
    for (const l of r.lines) c[l.issued >= l.asked ? 0 : l.issued > 0 ? 1 : 2]++;
  }
  return by;
}

export function sectionStats(
  w: StoreWorld,
  section: StoreSection,
  opts: {
    orderQty?: Map<string, number>;
    budget?: number;
    order?: { supplier: string } | null;
  } = {},
): { tiles: Tile[]; charts: ChartSpec[] } {
  const r = w.rules;
  const rows = expRows(w);
  const monthStart = `${w.today.slice(0, 7)}-01`;
  const outMeds = w.meds.filter((m) => !onHand(w, m.id));
  const lowMeds = w.meds.filter((m) => onHand(w, m.id) && stateOf(w, m) === "short");
  const overMeds = w.meds.filter((m) => stateOf(w, m) === "over");
  const stillMeds = w.meds.filter((m) => onHand(w, m.id) && notMoving(m, r));
  const names = (ms: readonly StoreMed[]) => ms.map((m) => m.short).join(", ");

  if (section === "home") {
    const s = series(w);
    const fl = lastOf(s.fill);
    const tt = lastOf(s.tat);
    const value = storeValue(w);
    const c1 = change(value, s.val.at(-2) ?? null, "", null, ugx, T.thisWeek);
    const c2 = change(fl.now, fl.before, "points", true, undefined, "");
    const c3 = change(tt.now, tt.before, "", false, hrs, "");
    const v = availabilityV(w);
    const outDays = stockOutDays(w, 30);
    return {
      tiles: [
        {
          label: T.home.value,
          value: ugx(value),
          delta: c1.delta,
          good: null,
          series: s.val,
          open: "health",
        },
        {
          label: T.home.filled,
          value: fl.now === null ? "–" : `${fl.now}%`,
          delta: `${cap(fl.when)} · ${c2.delta}`,
          good: c2.good,
          series: s.fill,
          open: "req",
        },
        {
          label: T.home.issue,
          value: tt.now === null ? "–" : hrs(tt.now),
          delta: `${cap(tt.when)} · ${c3.delta}`,
          good: c3.good,
          series: s.tat,
          open: "req",
        },
        {
          label: T.home.vital,
          value: fill(T.home.vitalOf, { n: v.in, m: v.of }),
          delta:
            v.in === v.of
              ? T.home.vitalAll
              : fill(T.home.vitalOut, { names: names(vital(w).filter((m) => !onHand(w, m.id))) }),
          good: v.in === v.of,
          series: s.stock.map((x) => x.avail),
          open: "health",
        },
        {
          label: T.home.outDays,
          value: String(outDays),
          delta: outMeds.length ? fill(T.home.outDelta, { names: names(outMeds) }) : T.home.outNone,
          good: !outMeds.length,
          series: s.stock.map((x) => x.out),
          open: "health",
        },
        {
          label: T.home.risk,
          value: ugx(atRiskValue(rows)),
          delta: fill(T.home.riskDelta, { n: atRisk(rows).length }),
          good: null,
          open: "exp",
        },
      ],
      charts: [
        flowChart(w),
        fillChart(w, s.fill, 3),
        valueChart(w, s.val),
        placesChart(w),
        venChart(w),
        mosChart(w, 4, true),
        coverChart(w, 2),
        expChart(w, 2),
      ],
    };
  }

  if (section === "req") {
    const s = series(w);
    const open = openReqs(w);
    const tt = lastOf(s.tat);
    const filled = linesFilled(w);
    const tot: [number, number, number] = [0, 0, 0];
    for (const c of filled.values()) c.forEach((v, i) => (tot[i as 0 | 1 | 2] += v));
    const all = tot[0] + tot[1] + tot[2];
    const urgent = open.filter((x) => x.urgent).length;
    const owed = open
      .filter((x) => x.state === "partial")
      .reduce((a, x) => a + x.lines.filter((l) => lineQtyAsked(l) > 0).length, 0);
    const keys: SegKey[] = [
      { label: C.rq.full, color: SB.ok, ink: "#ffffff" },
      { label: C.rq.part, color: SB.warn, ink: "#0b0b0b" },
      { label: C.rq.none, color: SB.bad, ink: "#ffffff" },
    ];
    return {
      tiles: [
        {
          label: T.req.waiting,
          value: String(open.length),
          delta: urgent ? fill(T.req.urgent, { n: urgent }) : T.req.noUrgent,
          good: urgent ? false : null,
        },
        {
          label: T.req.filled,
          value: all ? `${Math.round((tot[0] / all) * 100)}%` : "–",
          delta: fill(T.req.filledDelta, { n: tot[0], m: all }),
          good: null,
          series: s.fill,
        },
        {
          label: fill(T.req.issue, { when: tt.when }),
          value: tt.now === null ? "–" : hrs(tt.now),
          delta: change(
            tt.now,
            tt.before,
            "",
            false,
            hrs,
            tt.when === T.lastWeek ? T.onWeekBefore : T.onLastWeek,
          ).delta,
          good: change(tt.now, tt.before, "", false, hrs).good,
          series: s.tat,
        },
        {
          label: T.req.owed,
          value: String(owed),
          delta: owed ? T.req.owedYes : T.req.owedNo,
          good: null,
        },
      ],
      charts: [
        {
          key: "rq",
          title: fill(C.rq.title, { month: monthOf(w.today) }),
          sub: C.rq.sub,
          span: 4,
          legend: keys.map((k) => ({ label: k.label, color: k.color })),
          table: {
            cols: C.rq.cols,
            rows: w.places.map((p) => [p.name, ...filled.get(p.id)!.map(String)]),
          },
          plot: {
            form: "stack",
            keys,
            rows: w.places.map((p) => {
              const c = filled.get(p.id)!;
              const t = c[0] + c[1] + c[2];
              return {
                label: p.name,
                parts: [...c],
                val: fill(C.rq.val, { n: Math.round((c[0] / (t || 1)) * 100) }),
              };
            }),
          },
        },
        fillChart(w, s.fill, 2),
      ],
    };
  }

  if (section === "all") {
    const low = lowList(w);
    const allD = w.placeStock
      .map((p) => daysAt(w, p.medId, p.placeId))
      .flatMap((d) => (d === null ? [] : [d]))
      .sort((a, b) => a - b);
    const out = daysOutAtPlaces(w);
    const monthReqs = w.requisitions.filter((x) => dayOf(x.askedAt) >= monthStart);
    const urgent = monthReqs.filter((x) => x.urgent);
    const outNames = [...out.names]
      .map(([m, pls]) => `${m} at ${[...pls].join(" and ")}`)
      .join(", ");
    return {
      tiles: [
        {
          label: T.all.under,
          value: String(low.length),
          delta: low.length
            ? fill(T.all.underAt, { n: new Set(low.map((x) => x.placeId)).size })
            : T.all.underNone,
          good: !low.length,
          filter: "runout",
        },
        {
          label: T.all.median,
          value: fill(T.all.medianValue, { n: Math.round(allD[Math.floor(allD.length / 2)] ?? 0) }),
          delta: fill(T.all.medianDelta, { n: allD.length, m: w.places.length }),
          good: null,
        },
        {
          label: T.all.out,
          value: String(out.out),
          delta: outNames || T.all.outNone,
          good: out.out ? false : true,
        },
        {
          label: T.all.urgent,
          value: fill(T.all.of, { n: urgent.length, m: monthReqs.length }),
          delta:
            [...new Set(urgent.map((x) => placeName(w, x.placeId)))].join(", ") || T.all.urgentNone,
          good: null,
        },
      ],
      charts: [coverChart(w, 6)],
    };
  }

  if (section === "runs") {
    const dow = isoWeekday(w.today);
    const due = w.runs.filter((x) => x.weekdays.includes(dow) && !x.sentVoucher);
    const lines = due.flatMap((x) => runLines(w, x.placeId));
    return {
      tiles: [
        {
          label: T.runs.due,
          value: String(due.length),
          delta: due.map((x) => placeName(w, x.placeId)).join(", ") || T.runs.allSent,
          good: null,
        },
        {
          label: T.runs.lines,
          value: String(lines.filter((l) => l.give > 0).length),
          delta: fill(T.runs.linesDelta, { n: lines.filter((l) => l.give < l.need).length }),
          good: null,
        },
        {
          label: T.runs.value,
          value: ugx(lines.reduce((a, l) => a + l.give * medOf(w, l.medId).cost, 0)),
          delta: T.runs.valueDelta,
          good: null,
        },
      ],
      charts: [],
    };
  }

  if (section === "disp") {
    const days = dispatchesPerDay(w);
    const transit = w.dispatches.filter((d) => d.status === "transit");
    const month = confirmedWithin24h(w, monthStart);
    const diffs = w.dispatches.filter(
      (d) => d.status === "diff" && dayOf(d.sentAt) >= monthStart,
    ).length;
    const weekly = w.weeks.map((x) => confirmedWithin24h(w, x.start, addDays(x.start, 7)).pct);
    const total = days.reduce((a, d) => a + d.n, 0);
    return {
      tiles: [
        {
          label: T.disp.way,
          value: String(transit.length),
          delta: transit.length ? T.disp.wayYes : T.disp.wayNo,
          good: null,
          filter: "transit",
        },
        {
          label: T.disp.within,
          value: month.pct === null ? "–" : `${month.pct}%`,
          delta: month.of
            ? fill(T.disp.withinDelta, { n: month.ok, m: month.of })
            : T.disp.withinNone,
          good: null,
          series: weekly,
        },
        {
          label: T.disp.diff,
          value: String(diffs),
          delta: T.disp.diffDelta,
          good: diffs ? false : null,
        },
      ],
      charts: [
        {
          key: "disp",
          title: C.disp.title,
          sub: C.disp.sub,
          head: String(total),
          headSub: C.disp.headSub,
          span: 6,
          table: { cols: C.disp.cols, rows: days.map((d) => [fmtDay(d.day), String(d.n)]) },
          plot: {
            form: "col",
            fmt: "plain",
            h: 130,
            cols: days.map((d, i) => ({
              x: fmtDay(d.day),
              showX: showEvery(i, days.length, 2),
              segs: [{ v: d.n, color: DATA }],
              tip: fill(d.n === 1 ? C.disp.one : C.disp.many, { x: fmtDay(d.day), n: d.n }),
            })),
          },
        },
      ],
    };
  }

  if (section === "books") {
    const bk = w.places.map((p) => ({ p, b: placeBalance(w, p.id) }));
    const gap = bk.reduce((a, x) => a + x.b.gap, 0);
    return {
      tiles: [
        {
          label: T.books.unexplained,
          value: ugx(gap),
          delta: fill(T.books.across, { n: bk.filter((x) => x.b.gap > 0).length }),
          good: !gap,
        },
        {
          label: T.books.balance,
          value: `${bk.filter((x) => x.b.gap <= 0).length} of ${bk.length}`,
          delta: T.books.balanceDelta,
          good: null,
        },
        {
          label: T.books.cases,
          value: String(w.balanceCases.length),
          delta: fill(T.books.casesDelta, { value: ugx(r.balanceCase) }),
          good: null,
        },
      ],
      charts: [
        {
          key: "books",
          title: C.books.title,
          sub: fill(C.books.sub, { value: ugx(r.balanceCase) }),
          span: 6,
          table: { cols: C.books.cols, rows: bk.map((x) => [x.p.name, ugx(x.b.gap)]) },
          plot: {
            form: "bars",
            max: Math.max(r.balanceCase * 2.5, gap),
            marks: [{ v: r.balanceCase, label: ugx(r.balanceCase) }],
            rows: bk.map((x) => ({
              label: x.p.name,
              v: x.b.gap,
              val: ugx(x.b.gap),
              color: x.b.state === "bad" ? SB.bad : x.b.state === "warn" ? SB.warn : SB.ok,
            })),
          },
        },
      ],
    };
  }

  if (section === "health") {
    const ok = w.meds.filter((m) => stateOf(w, m) === "ok").length;
    return {
      tiles: [
        {
          label: T.health.out,
          value: String(outMeds.length),
          delta: names(outMeds) || T.health.none,
          good: !outMeds.length,
          filter: "out",
        },
        {
          label: T.health.under,
          value: String(lowMeds.length),
          delta: T.health.underDelta,
          good: lowMeds.length ? false : null,
          filter: "low",
        },
        {
          label: T.health.over,
          value: String(overMeds.length + stillMeds.length),
          delta: fill(T.health.overDelta, { n: overMeds.length, m: stillMeds.length }),
          good: null,
          filter: "over",
        },
        {
          label: T.health.between,
          value: fill(T.health.of, { n: ok, m: w.meds.length }),
          delta: T.health.betweenDelta,
          good: null,
        },
      ],
      charts: [mosChart(w, 4), venChart(w)],
    };
  }

  if (section === "order") {
    const budget = opts.budget ?? 0;
    const lines = w.meds
      .map((m) => ({ m, qty: opts.orderQty?.get(m.id) ?? 0, cost: m.cost }))
      .filter((l) => l.qty > 0)
      .sort((a, b) => b.qty * b.cost - a.qty * a.cost);
    const total = planTotal(lines);
    const over = total - budget;
    const pct = budgetPct(total, budget);
    return {
      tiles: [
        {
          label: T.order.total,
          value: ugx(total),
          delta: fill(T.order.lines, { n: lines.length, supplier: opts.order?.supplier ?? "" }),
          good: null,
        },
        {
          label: T.order.budget,
          value: pct === null ? "–" : `${pct}%`,
          delta:
            over > 0
              ? fill(T.order.overBudget, { value: ugx(over) })
              : fill(T.order.left, { value: ugx(-over) }),
          good: over <= 0,
        },
        {
          label: T.order.vital,
          value: fill(T.order.of, {
            n: lines.filter((l) => l.m.ven === "V").length,
            m: vital(w).length,
          }),
          delta: T.order.vitalDelta,
          good: null,
        },
      ],
      charts: [
        {
          key: "order",
          title: C.order.title,
          sub: C.order.sub,
          head: ugx(total),
          headSub: fill(C.order.headSub, { value: ugx(budget) }),
          span: 6,
          table: {
            cols: C.order.cols,
            rows: lines.map((l) => [l.m.short, ugx(l.qty * l.cost), l.m.ven ?? "–"]),
          },
          plot: {
            form: "bars",
            rows: lines.map((l) => ({
              label: l.m.short,
              v: l.qty * l.cost,
              val: ugx(l.qty * l.cost),
              color: DATA,
            })),
          },
        },
      ],
    };
  }

  if (section === "exp") {
    const lost = lostByMonth(w, 6);
    const before = lostByMonth(w, 12)
      .slice(0, 6)
      .reduce((a, l) => a + l.value, 0);
    const lostTotal = lost.reduce((a, l) => a + l.value, 0);
    const value = atRiskValue(rows);
    return {
      tiles: [
        { label: T.exp.risk, value: ugx(value), delta: T.exp.riskDelta, good: !value },
        {
          label: T.exp.batches,
          value: String(rows.length),
          delta: fill(T.exp.batchesDelta, { n: rows.filter((e) => e.risk > 0).length }),
          good: null,
        },
        {
          label: T.exp.lost,
          value: ugx(lostTotal),
          delta:
            lostTotal < before
              ? T.exp.lostDown
              : lostTotal > before
                ? T.exp.lostUp
                : T.exp.lostSame,
          good: lostTotal < before ? true : lostTotal > before ? false : null,
          series: lost.map((l) => l.value),
        },
      ],
      charts: [
        expChart(w, 4),
        {
          key: "lost",
          title: C.lost.title,
          sub: C.lost.sub,
          span: 2,
          table: { cols: C.lost.cols, rows: lost.map((l) => [monthOf(l.month), ugx(l.value)]) },
          plot: {
            form: "col",
            fmt: "compact",
            h: 150,
            cols: lost.map((l) => ({
              x: monthOf(l.month),
              showX: true,
              segs: [{ v: l.value, color: DATA2 }],
              tip: `${monthOf(l.month)}: ${ugx(l.value)}`,
            })),
          },
        },
      ],
    };
  }

  if (section === "card") return cardStats(w);

  if (section === "count") {
    const due = shelvesDue(w);
    const today = w.counts.filter((c) => dayOf(c.countedAt) === w.today);
    const last = lastStocktakeRight(w);
    const shelfRows = w.shelves.map((s) => {
      const late = !s.countedToday && shelfDue(s, r);
      const d = s.countedToday ? 0 : (s.days ?? 0);
      return {
        label: fill(C.count.shelf, { code: s.code }),
        v: s.controlled ? d * r.countEvery : d,
        color: late ? SB.warn : SB.ok,
        val: s.countedToday
          ? C.count.today
          : s.days === null
            ? C.count.never
            : fill(d === 1 ? C.count.day : C.count.days, { n: d }) +
              (s.controlled ? C.count.daily : ""),
        chip: late ? ({ text: C.count.due, tone: "warn" } as const) : undefined,
        tip: s.name,
        open: { section: "count" as const, shelf: s.id },
      };
    });
    return {
      tiles: [
        {
          label: T.count.due,
          value: String(due.length),
          delta: T.count.dueDelta,
          good: !due.length,
        },
        {
          label: T.count.right,
          value: last === null ? "–" : `${last}%`,
          delta: last === null ? T.count.rightNone : T.count.rightDelta,
          good: null,
        },
        {
          label: T.count.today,
          value: String(today.length),
          delta: fill(T.count.todayDelta, {
            n: today.filter((c) => c.needsSign && !c.signed).length,
          }),
          good: null,
        },
      ],
      charts: [
        {
          key: "count",
          title: C.count.title,
          sub: fill(C.count.sub, { n: r.countEvery }),
          span: 6,
          table: { cols: C.count.cols, rows: shelfRows.map((x) => [x.label, x.val]) },
          plot: {
            form: "bars",
            rows: shelfRows,
            max: Math.round(r.countEvery * 1.5),
            marks: [{ v: r.countEvery, label: fill(C.count.mark, { n: r.countEvery }) }],
          },
        },
      ],
    };
  }

  if (section === "put") {
    const waiting = w.batches.filter((b) => b.waiting);
    const cold = waiting.filter((b) => medOf(w, b.medId).cold);
    return {
      tiles: [
        {
          label: T.put.lines,
          value: String(waiting.length),
          delta: waiting[0]?.grn ? fill(T.put.from, { grn: waiting[0].grn }) : T.put.fromNone,
          good: null,
        },
        {
          label: T.put.cold,
          value:
            cold.length === 1
              ? T.put.coldLine
              : cold.length
                ? fill(T.put.coldLines, { n: cold.length })
                : T.put.coldNone,
          delta: cold[0]
            ? fill(T.put.coldFirst, {
                name: medOf(w, cold[0].medId).short,
                bin: medOf(w, cold[0].medId).bin ?? "",
              })
            : T.put.coldDone,
          good: !cold.length,
        },
        {
          label: T.put.value,
          value: ugx(waiting.reduce((a, b) => a + b.qty * medOf(w, b.medId).cost, 0)),
          delta: T.put.valueDelta,
          good: null,
        },
      ],
      charts: [],
    };
  }

  if (section === "quar") {
    const six = addDays(w.today, -182);
    const reasons = lossesByReason(w, six);
    const quarValue = w.quarantine.reduce((a, q) => a + q.qty * medOf(w, q.medId).cost, 0);
    const label = (k: string) => C.losses.reasons[k as keyof typeof C.losses.reasons] ?? k;
    return {
      tiles: [
        {
          label: T.quar.inQ,
          value: ugx(quarValue),
          delta: fill(T.quar.inQDelta, { n: w.quarantine.length }),
          good: null,
        },
        {
          label: T.quar.six,
          value: ugx(reasons.reduce((a, x) => a + x.value, 0)),
          delta: T.quar.sixDelta,
          good: null,
        },
        {
          label: T.quar.month,
          value: ugx(
            w.losses.filter((l) => dayOf(l.at) >= monthStart).reduce((a, l) => a + l.value, 0),
          ),
          delta: fill(T.quar.monthDelta, { month: monthOf(w.today) }),
          good: null,
        },
      ],
      charts: [
        {
          key: "losses",
          title: C.losses.title,
          sub: C.losses.sub,
          span: 6,
          table: { cols: C.losses.cols, rows: reasons.map((x) => [label(x.reason), ugx(x.value)]) },
          plot: {
            form: "bars",
            rows: reasons.map((x) => ({
              label: label(x.reason),
              v: x.value,
              val: ugx(x.value),
              color: DATA2,
            })),
          },
        },
      ],
    };
  }

  if (section === "cond") return condStats(w);
  return { tiles: [], charts: [] };
}

/** Value destroyed, by month, oldest first. */
export function lostByMonth(w: StoreWorld, months: number) {
  const y = +w.today.slice(0, 4) * 12 + +w.today.slice(5, 7) - 1;
  return Array.from({ length: months }, (_, i) => {
    const t = y - months + 1 + i;
    const month = `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}-01`;
    return {
      month,
      value: w.losses
        .filter((l) => l.reason === "destroyed" && kampala(l.at).slice(0, 7) === month.slice(0, 7))
        .reduce((a, l) => a + l.value, 0),
    };
  });
}

/** Counted right first time, by value, in the latest closed stock-take. */
export function lastStocktakeRight(w: StoreWorld): number | null {
  const ids = [...new Set(w.counts.flatMap((c) => (c.stocktakeId ? [c.stocktakeId] : [])))];
  const id = w.stocktake?.closedAt ? w.stocktake.id : ids.at(-1);
  if (!id) return null;
  const counts = w.counts.filter((c) => c.stocktakeId === id);
  const total = counts.reduce((a, c) => a + c.totalValue, 0);
  if (!total) return null;
  const off = counts.reduce((a, c) => a + c.diffValue, 0);
  return Math.round((1 - off / total) * 1000) / 10;
}

function cardStats(w: StoreWorld): { tiles: Tile[]; charts: ChartSpec[] } {
  if (!w.card) return { tiles: [], charts: [] };
  const m = medOf(w, w.card.medId);
  const hand = onHand(w, m.id);
  const since = addDays(w.today, -30);
  const recent = w.card.rows.filter((x) => dayOf(x.at) >= since);
  const issued = recent.filter((x) => x.delta < 0).reduce((a, x) => a - x.delta, 0);
  const received = recent.filter((x) => x.delta > 0).reduce((a, x) => a + x.delta, 0);
  const st = stateOf(w, m);
  // Oldest first, day by day, worked back from today's balance.
  const asc = [...w.card.rows].reverse();
  const open = hand - asc.reduce((a, x) => a + x.delta, 0);
  const pts: { d: string; v: number }[] = [];
  if (open > 0 && asc[0]) pts.push({ d: dayOf(asc[0].at), v: open });
  let run = open;
  for (const x of asc) {
    run += x.delta;
    const d = dayOf(x.at);
    if (pts.at(-1)?.d === d) pts.at(-1)!.v = run;
    else pts.push({ d, v: run });
  }
  if (pts.at(-1)?.d !== w.today) pts.push({ d: w.today, v: hand });
  const r = w.rules;
  const hi = Math.max(...pts.map((p) => p.v), m.use * r.shortUnder, 1);
  const step = niceStep(hi);
  const mos = mosOf(w, m);
  return {
    tiles: [
      { label: T.card.hand, value: units(hand, m.unit), delta: ugx(hand * m.cost), good: null },
      {
        label: T.card.months,
        value: Number.isFinite(mos) ? mos.toFixed(1) : "–",
        delta: ST.state[st],
        good: st === "ok" ? true : st === "short" || st === "out" ? false : null,
      },
      {
        label: T.card.issued,
        value: num(issued),
        delta: fill(T.card.uses, { n: num(m.use) }),
        good: null,
      },
      {
        label: T.card.received,
        value: num(received),
        delta: m.onOrder ? fill(T.card.onOrder, { n: num(m.onOrder) }) : T.card.noOrder,
        good: null,
      },
    ],
    charts: [
      {
        key: "card",
        title: fill(C.card.title, { name: m.short }),
        sub: fill(C.card.sub, { a: r.shortUnder, b: r.tooMuch }),
        head: num(hand),
        headSub: fill(C.card.headSub, { unit: m.unit }),
        span: 6,
        table: { cols: C.card.cols, rows: pts.map((p) => [fmtDay(p.d), num(p.v)]) },
        plot: {
          form: "line",
          fmt: "compact",
          h: 170,
          stepped: true,
          lo: 0,
          hi: Math.ceil((hi * 1.05) / step) * step,
          step,
          refs: [
            {
              band: [m.use * r.shortUnder, m.use * r.tooMuch],
              label: fill(C.card.band, { a: r.shortUnder, b: r.tooMuch }),
            },
          ],
          pts: pts.map((p) => ({
            x: fmtDay(p.d),
            showX: true,
            v: p.v,
            tip: `${fmtDay(p.d)}: ${units(p.v, m.unit)}`,
          })),
        },
      },
    ],
  };
}

function condStats(w: StoreWorld): { tiles: Tile[]; charts: ChartSpec[] } {
  const charts: ChartSpec[] = [];
  const cr = w.coldRoom;
  if (cr) {
    const state =
      cr.temp === null
        ? C.cold.none
        : cr.temp < 2 || cr.temp > 8
          ? C.cold.out
          : cr.temp < 2 + w.rules.coldNear || cr.temp > 8 - w.rules.coldNear
            ? C.cold.near
            : C.cold.ok;
    const hist = cr.history;
    charts.push({
      key: "cold",
      title: fill(C.cold.title, { code: cr.code }),
      sub: cr.sensor ? fill(C.cold.sub, { sensor: cr.sensor }) : C.cold.subNoSensor,
      head: cr.temp === null ? "–" : `${cr.temp.toFixed(1)} °C`,
      headSub: state,
      span: 4,
      table: {
        cols: C.cold.cols,
        rows: hist.map((p) => [kampala(p.at).slice(11, 16), p.temp.toFixed(1)]),
      },
      plot: {
        form: "line",
        fmt: "celsius",
        h: 150,
        lo: 0,
        hi: 10,
        step: 2,
        noArea: true,
        refs: [{ band: [2, 8], label: C.cold.band }],
        pts: hist.map((p, i) => ({
          x: kampala(p.at).slice(11, 16),
          showX: i === 0 || i === hist.length - 1,
          v: p.temp,
          tip: `${kampala(p.at).slice(11, 16)}: ${p.temp.toFixed(1)} °C`,
        })),
      },
    });
  }
  const room = w.room.slice(-14);
  const lim = w.rules.roomTemp;
  charts.push({
    key: "room",
    title: C.room.title,
    sub: fill(C.room.sub, { n: lim }),
    head: room.at(-1) ? `${room.at(-1)!.temp.toFixed(1)} °C` : "–",
    headSub: C.room.headSub,
    span: cr ? 2 : 6,
    table: {
      cols: C.room.cols,
      rows: room.map((x) => [
        fmtDow(kampala(x.at)),
        kampala(x.at).slice(11, 16),
        x.temp.toFixed(1),
      ]),
    },
    plot: {
      form: "line",
      fmt: "celsius",
      h: 150,
      lo: 18,
      hi: 28,
      step: 2,
      noArea: true,
      refs: [{ v: lim, label: fill(C.room.limit, { n: lim }) }],
      pts: room.map((x, i) => ({
        x: fmtDow(kampala(x.at)).slice(0, 3),
        showX: (kampala(x.at).slice(11, 13) < "12" && i % 4 === 0) || i === room.length - 1,
        v: x.temp,
        tip: `${fmtDow(kampala(x.at))} ${kampala(x.at).slice(11, 16)}: ${x.temp.toFixed(1)} °C`,
      })),
    },
  });
  return { tiles: [], charts };
}

/** "n of n readings inside the limits", this month. */
export function roomMonth(w: StoreWorld) {
  const from = `${w.today.slice(0, 7)}-01`;
  const rows = w.room.filter((x) => dayOf(x.at) >= from);
  return {
    inside: rows.filter((x) => insideLimits(x.temp, x.humidity, w.rules)).length,
    of: rows.length,
  };
}

/* ─── The section bar ─── */

export type Tone = "bad" | "warn" | "info" | "neutral";
export interface NavItem {
  key: StoreSection | "receive";
  label: string;
  count: number;
  tone: Tone;
}
export interface NavGroup {
  key: "send" | "places" | "bring" | "look";
  label: string;
  items: NavItem[];
  count: number;
  tone: Tone;
}

const SEVERITY: Tone[] = ["bad", "warn", "info", "neutral"];

export function navGroups(w: StoreWorld): NavGroup[] {
  const dow = isoWeekday(w.today);
  const open = openReqs(w);
  const it = (key: NavItem["key"], label: string, count: number, tone: Tone): NavItem => ({
    key,
    label,
    count,
    tone,
  });
  const sec = (k: StoreSection, count: number, tone: Tone) => it(k, SECTION_LABEL[k], count, tone);
  const rows = expRows(w);
  const out = w.meds.filter((m) => !onHand(w, m.id)).length;
  const short = w.meds.filter((m) => onHand(w, m.id) && stateOf(w, m) === "short").length;
  const groups: Omit<NavGroup, "count" | "tone">[] = [
    {
      key: "send",
      label: ST.shell.groups.send,
      items: [
        sec("req", open.length, open.some((r) => r.urgent) ? "bad" : "info"),
        sec(
          "runs",
          w.runs.filter((r) => r.weekdays.includes(dow) && !r.sentVoucher).length,
          "info",
        ),
        sec("disp", w.dispatches.filter((d) => d.status === "transit").length, "neutral"),
      ],
    },
    {
      key: "places",
      label: ST.shell.groups.places,
      items: [
        sec("all", lowList(w).filter((l) => l.days < w.rules.runningOut).length, "bad"),
        sec("books", 0, "neutral"),
      ],
    },
    {
      key: "bring",
      label: ST.shell.groups.bring,
      items: [
        sec("order", w.orders.some((o) => o.state === "draft") ? 1 : 0, "warn"),
        sec("put", w.batches.filter((b) => b.waiting).length, "info"),
        it("receive", ST.shell.receive, 0, "neutral"),
      ],
    },
    {
      key: "look",
      label: ST.shell.groups.look,
      items: [
        sec("health", out + short, out ? "bad" : "warn"),
        sec("exp", atRisk(rows).length, "warn"),
        sec("card", 0, "neutral"),
        sec("count", shelvesDue(w).length, "warn"),
        sec("quar", w.quarantine.length, "neutral"),
        sec("cond", 0, "neutral"),
      ],
    },
  ];
  return groups.map((g) => {
    const counted = g.items.filter((i) => i.count > 0);
    return {
      ...g,
      count: counted.reduce((a, i) => a + i.count, 0),
      tone: SEVERITY.find((s) => counted.some((i) => i.tone === s)) ?? "neutral",
    };
  });
}
