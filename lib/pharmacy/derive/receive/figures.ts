import type { FigureRow, ReceiveClaim, ReceiveRules, SupplierRow } from "./types";

import { RC } from "@/content/pharmacy-receive";
import { daysBetween, hm, minsBetween, num } from "./format";

const median = (a: readonly number[]) => {
  const b = [...a].sort((x, y) => x - y);
  return b.length ? b[Math.floor((b.length - 1) / 2)]! : 0;
};

export interface MiniBar {
  height: number;
  good: boolean;
  last: boolean;
  tip: string;
}
export interface MiniChart {
  yMax: string;
  refBottom: number;
  refLabel: string;
  xFirst: string;
  bars: MiniBar[];
}
export interface ReceiveFigure {
  key: "stock" | "shelf" | "matched" | "claims";
  label: string;
  value: string;
  sub: string;
  subTone: "ok" | "warn" | "";
  /** The On / Off target chip, none for claims. */
  onTarget: boolean | null;
  chart: MiniChart | null;
  split: { name: string; share: number; value: string }[];
  oldestClaimId: string | null;
}

const WINDOW = 8;

function miniBars(
  points: readonly { note: string; v: number }[],
  o: { target: number; lowerBetter: boolean; pct: boolean },
): MiniChart {
  const v = points.slice(-WINDOW);
  const fmt = (x: number) => (o.pct ? `${x}%` : hm(x));
  const top = o.pct ? 100 : Math.ceil(Math.max(...v.map((x) => x.v), o.target * 1.15) / 30) * 30;
  return {
    yMax: o.pct ? "100%" : hm(top),
    refBottom: (o.target / top) * 100,
    refLabel: RC.figure.target(fmt(o.target)),
    xFirst: RC.figure.ago(v.length),
    bars: v.map((x, i) => {
      const good = o.lowerBetter ? x.v <= o.target : x.v >= o.target;
      return {
        height: Math.max(2, (x.v / top) * 100),
        good,
        last: i === v.length - 1,
        tip: `${x.note}: ${fmt(x.v)} · ${good ? RC.figure.on : RC.figure.missed}`,
      };
    }),
  };
}

function delta(a: readonly number[], kind: "mins" | "pct"): [string, "ok" | "warn" | ""] {
  const x = a[a.length - 1];
  const y = a[a.length - 2];
  if (x === undefined || y === undefined) return ["", ""];
  const d = x - y;
  if (!d) return [RC.figure.same, ""];
  const size = kind === "pct" ? RC.figure.points(Math.abs(d)) : hm(Math.abs(d));
  return [RC.figure.moved(d > 0, size), (kind === "mins" ? d < 0 : d > 0) ? "ok" : "warn"];
}

/** The four cards (§G1), from finished deliveries oldest first and open claims newest first. */
export function figures(
  rows: readonly FigureRow[],
  claims: readonly ReceiveClaim[],
  r: ReceiveRules,
): ReceiveFigure[] {
  const stockP = rows.flatMap((x) => {
    const v = minsBetween(x.arrived, x.finished);
    return v === null ? [] : [{ note: x.note, v }];
  });
  const shelfP = rows.flatMap((x) => {
    const v = x.shelvedAt ? minsBetween(x.finished, x.shelvedAt) : null;
    return v === null ? [] : [{ note: x.note, v }];
  });
  const matchP = rows
    .filter((x) => x.lines > 0)
    .map((x) => ({ note: x.note, v: Math.round((x.matched / x.lines) * 100) }));
  const stock = stockP.map((x) => x.v);
  const shelf = shelfP.map((x) => x.v);
  const matched = matchP.map((x) => x.v);
  const m1 = median(stock);
  const m2 = median(shelf);
  const lastM = matched[matched.length - 1] ?? 0;
  const F = RC.figure;
  const card = (
    key: ReceiveFigure["key"],
    label: string,
    value: string,
    lead: string,
    d: [string, "ok" | "warn" | ""],
    fallback: string,
    onTarget: boolean | null,
    chart: MiniChart | null,
  ): ReceiveFigure => ({
    key,
    label,
    value,
    sub: `${lead} · ${d[0] || fallback}`,
    subTone: d[1],
    onTarget,
    chart,
    split: [],
    oldestClaimId: null,
  });
  const open = claims.filter((c) => c.state !== "credit");
  const openTotal = open.reduce((a, c) => a + c.total, 0);
  const bySupplier = new Map<string, number>();
  for (const c of open) bySupplier.set(c.supplier, (bySupplier.get(c.supplier) ?? 0) + c.total);
  const maxBy = Math.max(1, ...bySupplier.values());
  return [
    card(
      "stock",
      F.stock,
      hm(m1),
      F.median,
      delta(stock, "mins"),
      F.last(stock.length),
      stock.length ? m1 <= r.targetStock : null,
      stock.length
        ? miniBars(stockP, { target: r.targetStock, lowerBetter: true, pct: false })
        : null,
    ),
    card(
      "shelf",
      F.shelf,
      hm(m2),
      F.median,
      delta(shelf, "mins"),
      F.last(shelf.length),
      shelf.length ? m2 <= r.targetShelf : null,
      shelf.length
        ? miniBars(shelfP, { target: r.targetShelf, lowerBetter: true, pct: false })
        : null,
    ),
    card(
      "matched",
      F.matched,
      `${lastM}%`,
      F.lastDelivery,
      delta(matched, "pct"),
      F.last(matched.length),
      matched.length ? lastM >= r.targetMatched : null,
      matched.length
        ? miniBars(matchP, { target: r.targetMatched, lowerBetter: false, pct: true })
        : null,
    ),
    {
      key: "claims",
      label: F.claims,
      value: `UGX ${num(openTotal)}`,
      sub: F.waiting(open.length),
      subTone: open.length ? "warn" : "ok",
      onTarget: null,
      chart: null,
      split: [...bySupplier].map(([name, v]) => ({
        name,
        share: v / maxBy,
        value: v >= 1e6 ? `UGX ${Math.round(v / 1e5) / 10} m` : `UGX ${Math.round(v / 1000)}k`,
      })),
      oldestClaimId: open[open.length - 1]?.id ?? null,
    },
  ];
}

export interface SupplierStat {
  supplierId: string;
  /** Share of ordered lines delivered in full. */
  fill: number;
  lead: number;
  promised: number;
  onTime: number;
  differences: number;
}

/** The suppliers table (§G2), over the rows the loader gives (last 6 months). */
export function supplierStats(
  rows: readonly SupplierRow[],
  differencesBy: ReadonlyMap<string, number>,
): SupplierStat[] {
  const ids = [...new Set(rows.map((r) => r.supplierId))];
  return ids.map((id) => {
    const own = rows.filter((r) => r.supplierId === id);
    const full = own.filter((r) => r.received >= r.packs).length;
    const orders = new Map(own.map((r) => [r.orderId, r]));
    const arrived = [...orders.values()].filter((o) => o.firstAt);
    const leads = arrived.map((o) => daysBetween(o.sentOn, o.firstAt));
    const onTime = arrived.filter((o) => daysBetween(o.sentOn, o.firstAt) <= o.leadDays).length;
    return {
      supplierId: id,
      fill: own.length ? Math.round((full / own.length) * 100) : 0,
      lead: median(leads),
      promised: own[0]!.leadDays,
      onTime: arrived.length ? Math.round((onTime / arrived.length) * 100) : 0,
      differences: differencesBy.get(id) ?? 0,
    };
  });
}
