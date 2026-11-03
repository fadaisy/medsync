/**
 * The medicine master's derivations (MEDICINES-TAB.md §15), pure and unit-tested: ported from the prototype's
 * `renderVals` behaviour for behaviour. No I/O: the server loads the payload, the grid and the checks read it.
 */
import type { FlagKey, QcName } from "@/content/pharmacy-medicines";

import {
  CLASSES,
  FLAGS,
  QC,
  RULE_GROUPS,
  RX_CHECKS,
  SALE,
  VEN,
} from "@/content/pharmacy-medicines";

export type Ven = "V" | "E" | "N";
export type Status = "Out" | "Low" | "OK" | "Over";
export type Flags = Record<FlagKey, boolean>;

export interface Batch {
  no: string;
  /** Days to expiry from today (negative once expired). */
  days: number;
  qty: number;
}

export interface Brand {
  id: string;
  name: string;
  maker: string | null;
  price: number | null;
}

export interface Line {
  id: string;
  name: string;
  generic: string;
  strength: string | null;
  form: string | null;
  route: string | null;
  unit: string;
  cls: string | null;
  group: string | null;
  sale: keyof typeof SALE | null;
  ven: Ven | null;
  flags: Flags;
  packs: number[];
  /** The pack's GS1 GTIN, when one is linked (a scan finds the line by it). */
  gtin?: string | null;
  loose: boolean;
  free: boolean;
  /** Prices per payer id, UGX per issue unit. */
  prices: Record<string, number>;
  brands: Brand[];
  local: boolean;
  localReason: string | null;
  nationalControlled: boolean;
  /** Last received unit cost. */
  cost: number | null;
  /** Average daily use over the last 90 days (issues to patients). */
  usePerDay: number;
  lastMovedDays: number | null;
  reviewedDays: number | null;
  batches: Batch[];
  /** Each batch at each place, for correcting its expiry from Set-up. */
  batchRows?: { id: string; no: string; placeId: string; expiry: string; qty: number }[];
  /** Top-up level per place id. */
  levels: Record<string, number>;
  /** On hand per place id. */
  stock: Record<string, number>;
}

export interface Fridge {
  code: string;
  name: string;
  temp: number | null;
  sensor: boolean;
  /** "08:00", the reading's time. */
  at: string | null;
}

export interface Place {
  id: string;
  name: string;
  short: string;
  isStore: boolean;
  fridge: Fridge | null;
}

export interface Ctx {
  places: Place[];
  lines: Line[];
  cashPayerId: string | null;
  namedLasa: readonly (readonly [string, string])[];
}

export const lineIdentityKey = (l: Pick<Line, "generic" | "strength" | "form" | "route">) =>
  [l.generic, l.strength ?? "", l.form ?? "", l.route ?? ""].join("|").toLowerCase();

export function placeStatus(onHand: number, level: number | null | undefined): Status | null {
  if (!level || level <= 0) return null;
  if (onHand <= 0) return "Out";
  if (onHand < level / 2) return "Low";
  if (onHand > level) return "Over";
  return "OK";
}

export const topUpSuggestion = (level: number, onHand: number) => Math.max(level - onHand, 0);

export const flagList = (f: Flags): FlagKey[] =>
  (["controlled", "cold", "high", "freeze", "cyto"] as FlagKey[]).filter((k) => f[k]);
export const flagNames = (f: Flags) => flagList(f).map((k) => FLAGS[k][0]);

export const cashOf = (l: Line, cashPayerId: string | null) =>
  cashPayerId && (l.prices[cashPayerId] ?? 0) > 0 ? l.prices[cashPayerId]! : null;

export interface PlaceStat {
  id: string;
  short: string;
  have: number;
  lvl: number;
  flag: Status | null;
}

export interface Metrics {
  st: PlaceStat[];
  have: number;
  lvl: number;
  cnt: Record<Status, number>;
  /** "Stock status any place is …" values that hold. */
  sf: Set<string>;
  pct: number | null;
  cover: number | null;
  price: number | null;
  /** Out 0 < Low 1 < Not set 2 < OK 3 < Over 4. */
  sev: number;
  exp: number | null;
}

export function lineMetrics(l: Line, places: Place[], cashPayerId: string | null): Metrics {
  const st: PlaceStat[] = places
    .map((p) => {
      const have = l.stock[p.id] ?? 0;
      const lvl = l.levels[p.id] ?? 0;
      return { id: p.id, short: p.short, have, lvl, flag: placeStatus(have, lvl) };
    })
    .filter((x) => x.have > 0 || x.lvl > 0);
  let have = 0;
  let lvl = 0;
  const cnt: Record<Status, number> = { Out: 0, Low: 0, OK: 0, Over: 0 };
  const sf = new Set<string>();
  for (const x of st) {
    have += x.have;
    if (x.lvl > 0 && x.flag) {
      lvl += x.lvl;
      cnt[x.flag]++;
      sf.add(x.flag);
    }
  }
  if (!lvl) sf.add("Top-up not set");
  if (cnt.Out || cnt.Low) sf.add("Low or out");
  const live = l.batches.filter((b) => b.qty > 0);
  return {
    st,
    have,
    lvl,
    cnt,
    sf,
    pct: lvl ? Math.round((have / lvl) * 100) : null,
    cover: l.usePerDay > 0 ? Math.floor(have / l.usePerDay) : null,
    price: l.free ? 0 : cashOf(l, cashPayerId),
    sev: cnt.Out ? 0 : cnt.Low ? 1 : !lvl ? 2 : cnt.Over && !cnt.OK ? 4 : 3,
    exp: live.length ? Math.min(...live.map((b) => b.days)) : null,
  };
}

/** FEFO: for batches by expiry, what can be used before each expires; the rest is waste. */
export function fefoWaste(batches: Batch[], usePerDay: number): number {
  if (!(usePerDay > 0)) return 0;
  let used = 0;
  let waste = 0;
  for (const b of [...batches].filter((x) => x.qty > 0).sort((a, c) => a.days - c.days)) {
    const cap = Math.max(0, usePerDay * Math.max(b.days, 0) - used);
    const u = Math.min(b.qty, cap);
    waste += b.qty - u;
    used += u;
  }
  return Math.round(waste);
}

export function lasaPartners(l: Line, lines: Line[], named: Ctx["namedLasa"]): Line[] {
  const g = l.generic.toLowerCase();
  const out = lines.filter((o) => o.id !== l.id && o.generic.toLowerCase() === g);
  for (const [a, b] of named) {
    const other = a === g ? b : b === g ? a : null;
    if (other) out.push(...lines.filter((o) => o.generic.toLowerCase() === other));
  }
  return out;
}

export interface FridgeLine {
  where: string;
  fridge: string;
  temp: string;
  tone: "ok" | "near" | "bad" | "none";
}

/** §13: per place that holds or levels the line, its fridge and the latest temperature. */
export function fridgeLines(
  l: Pick<Line, "stock" | "levels">,
  places: Place[],
  words: {
    noFridge: string;
    moveIt: string;
    live: (t: string, at: string | null) => string;
    typed: (t: string, at: string | null) => string;
    noReading: string;
  },
): FridgeLine[] {
  const out: FridgeLine[] = [];
  for (const p of places) {
    if (!((l.stock[p.id] ?? 0) > 0 || (l.levels[p.id] ?? 0) > 0)) continue;
    const f = p.fridge;
    if (!f) {
      out.push({ where: p.short, fridge: words.noFridge, temp: words.moveIt, tone: "bad" });
      continue;
    }
    if (f.temp === null) {
      out.push({
        where: p.short,
        fridge: `${f.code} · ${f.name}`,
        temp: words.noReading,
        tone: "none",
      });
      continue;
    }
    const t = f.temp;
    const bad = t < 2 || t > 8;
    const near = !bad && (t < 2.5 || t > 7.5);
    out.push({
      where: p.short,
      fridge: `${f.code} · ${f.name}`,
      temp: (f.sensor ? words.live : words.typed)(t.toFixed(1), f.at),
      tone: bad ? "bad" : near ? "near" : "ok",
    });
  }
  return out;
}

export interface Issue {
  k: QcName;
  t: string;
}

/** §10, in the §10 wording. `dupKeys` counts each identity among the stocked lines. */
export function qcChecks(
  l: Line,
  mx: Metrics,
  ctx: Ctx,
  dupKeys: Map<string, number>,
  localWord: (r: string | null) => string,
): Issue[] {
  const iss: Issue[] = [];
  const miss: string[] = [];
  const W = QC.missingWords;
  const cash = cashOf(l, ctx.cashPayerId);
  if (!l.ven) miss.push(W.ven);
  if (!mx.lvl) miss.push(W.level);
  if (!l.free && !cash) miss.push(W.price);
  if (!l.packs.length && !l.loose) miss.push(W.pack);
  if (miss.length) iss.push({ k: "Missing details", t: QC.missing(miss) });
  if ((dupKeys.get(lineIdentityKey(l)) ?? 0) > 1)
    iss.push({ k: "Duplicate line", t: QC.duplicate });
  if (l.nationalControlled && !l.flags.controlled)
    iss.push({ k: "Controlled flag missing", t: QC.controlled });
  if (!l.free && cash && l.cost && cash < l.cost)
    iss.push({ k: "Below cost", t: QC.belowCost(cash, l.cost) });
  const store = ctx.places.find((p) => p.isStore);
  const sl = store ? (l.levels[store.id] ?? 0) : 0;
  if (sl > 0 && l.usePerDay > 0) {
    const dd = Math.round(sl / l.usePerDay);
    if (dd < 7 || dd > 90) iss.push({ k: "Top-up cover", t: QC.topUpCover(dd) });
  }
  for (const p of ctx.places)
    if (!p.isStore && sl > 0 && (l.levels[p.id] ?? 0) > sl)
      iss.push({ k: "Ward above store", t: QC.wardAbove(p.short) });
  if (l.free && cash) iss.push({ k: "Free with a price", t: QC.freeWithPrice });
  const waste = fefoWaste(l.batches, l.usePerDay);
  if (waste > 0) iss.push({ k: "Expires before use", t: QC.expires(waste, l.unit) });
  if (l.lastMovedDays !== null && l.lastMovedDays >= 90)
    iss.push({ k: "Not moved in 90 days", t: QC.notMoved(l.lastMovedDays) });
  if (l.reviewedDays !== null && l.reviewedDays > 90)
    iss.push({ k: "Review due", t: QC.reviewDue(l.reviewedDays) });
  if (l.flags.cold) {
    const none = ctx.places.filter(
      (p) => !p.fridge && ((l.stock[p.id] ?? 0) > 0 || (l.levels[p.id] ?? 0) > 0),
    );
    if (none.length) iss.push({ k: "No fridge", t: QC.noFridge(none.map((p) => p.short)) });
  }
  if (l.local) iss.push({ k: "Local item", t: QC.local(localWord(l.localReason)) });
  return iss;
}

/** A red dot when any issue is one of these; otherwise amber. */
export const SEVERE: ReadonlySet<QcName> = new Set([
  "Duplicate line",
  "Controlled flag missing",
  "Below cost",
  "Expires before use",
]);

/* ─── Conditions (§7) ─────────────────────────────────────────────────── */

export type ColType = "text" | "enum" | "route" | "flag" | "status" | "num" | "qc";
export const OPS: Record<ColType, string[]> = {
  qc: ["shows", "does not show"],
  route: ["includes", "does not include"],
  text: ["contains", "does not contain"],
  enum: ["is", "is not"],
  flag: ["has", "does not have"],
  status: ["any place is", "no place is"],
  num: ["less than", "more than", "equals", "is empty", "is not empty"],
};

export const FCOLS = {
  name: { label: "Medicine name", type: "text" },
  strength: { label: "Strength", type: "text" },
  form: {
    label: "Form",
    type: "enum",
    opts: [
      "Tablet",
      "Dispersible tablet",
      "Capsule",
      "Syrup",
      "Suspension",
      "Oral solution",
      "Oral drops",
      "Powder (sachet)",
      "Injection",
      "Powder for injection",
      "Suspension for injection",
      "Infusion",
    ],
  },
  route: {
    label: "Route",
    type: "route",
    opts: ["Oral", "IV", "IM", "SC", "Intradermal", "Rectal"],
  },
  cls: { label: "Class", type: "enum", opts: [...CLASSES] },
  group: { label: "Pharmacological group", type: "text" },
  sale: { label: "Sale category", type: "enum", opts: Object.values(SALE) },
  ven: { label: "VEN", type: "enum", opts: ["Vital", "Essential", "Necessary", "Not set"] },
  handling: { label: "Handling", type: "flag", opts: Object.values(FLAGS).map((f) => f[0]) },
  status: {
    label: "Stock status",
    type: "status",
    opts: ["Low or out", "Out", "Low", "OK", "Over", "Top-up not set"],
  },
  onhand: { label: "On hand", type: "num" },
  topup: { label: "% of top-up", type: "num" },
  cover: { label: "Days of cover", type: "num" },
  price: { label: "Cash price, UGX", type: "num" },
  brands: { label: "Brands mapped", type: "num" },
  expiry: { label: "Days to nearest expiry", type: "num" },
  qc: {
    label: "Checks",
    type: "qc",
    opts: [
      "Any issue",
      "Missing details",
      "Below cost",
      "Top-up cover",
      "Ward above store",
      "Free with a price",
      "Expires before use",
      "Not moved in 90 days",
      "Review due",
      "Controlled flag missing",
      "Duplicate line",
      "Local item",
      "No fridge",
    ],
  },
} as const satisfies Record<string, { label: string; type: ColType; opts?: readonly string[] }>;
export type ColKey = keyof typeof FCOLS;

export interface Cond {
  join: "AND" | "OR";
  col: ColKey;
  op: string;
  val: string;
}

export const colOpts = (col: ColKey): readonly string[] =>
  "opts" in FCOLS[col] ? (FCOLS[col] as { opts: readonly string[] }).opts : [];

export function newCond(col: ColKey): Cond {
  const fc = FCOLS[col];
  const opts = colOpts(col);
  return { join: "AND", col, op: OPS[fc.type][0]!, val: opts[0] ?? "" };
}

export const needsVal = (c: Pick<Cond, "op">) => c.op !== "is empty" && c.op !== "is not empty";
export const validConds = (cs: Cond[]) =>
  cs.filter((c) => !needsVal(c) || String(c.val).trim() !== "");

export const venWord = (v: Ven | null) => (v ? VEN[v] : "Not set");
export const saleWord = (s: Line["sale"]) => (s ? SALE[s] : "");

export function condText(c: Cond, i: number): string {
  const fc = FCOLS[c.col];
  return `${i ? `${c.join} ` : ""}${fc.label} ${c.op}${needsVal(c) ? ` ${fc.type === "text" ? `“${c.val}”` : c.val}` : ""}`;
}

export interface Row {
  l: Line;
  mx: Metrics;
  qc: Issue[];
}

const has = (hay: string | null, needle: string) =>
  (hay ?? "").toLowerCase().includes(needle.toLowerCase());

export function evalCond(c: Cond, r: Row): boolean {
  const { l, mx } = r;
  const v = c.val;
  const pos = !(c.op.startsWith("does not") || c.op === "is not" || c.op === "no place is");
  switch (c.col) {
    case "name":
      return has(l.name, v) === pos;
    case "strength":
      return has(l.strength, v) === pos;
    case "group":
      return has(l.group, v) === pos;
    case "form":
      return (l.form === v) === pos;
    case "cls":
      return (l.cls === v) === pos;
    case "sale":
      return (saleWord(l.sale) === v) === pos;
    case "ven":
      return (venWord(l.ven) === v) === pos;
    case "route":
      return (
        (l.route ?? "")
          .toLowerCase()
          .split("/")
          .map((s) => s.trim())
          .includes(v.toLowerCase()) === pos
      );
    case "handling":
      return flagNames(l.flags).includes(v as never) === pos;
    case "status":
      return mx.sf.has(v) === pos;
    case "qc":
      return (v === "Any issue" ? r.qc.length > 0 : r.qc.some((q) => q.k === v)) === pos;
    default: {
      const x =
        c.col === "onhand"
          ? mx.have
          : c.col === "topup"
            ? mx.pct
            : c.col === "cover"
              ? mx.cover
              : c.col === "price"
                ? mx.price
                : c.col === "brands"
                  ? l.brands.length
                  : mx.exp;
      if (c.op === "is empty") return x === null;
      if (c.op === "is not empty") return x !== null;
      if (x === null || v === "") return false;
      const n = Number(v);
      return c.op === "less than" ? x < n : c.op === "more than" ? x > n : x === n;
    }
  }
}

/** Strictly left to right: OR widens what came before, AND narrows it. */
export function evalConditions(cs: Cond[], r: Row): boolean {
  if (!cs.length) return true;
  let ok = evalCond(cs[0]!, r);
  for (let i = 1; i < cs.length; i++) {
    const v = evalCond(cs[i]!, r);
    ok = cs[i]!.join === "OR" ? ok || v : ok && v;
  }
  return ok;
}

export const matchesSearch = (l: Line, q: string) => {
  const s = q.trim().toLowerCase();
  return !s || l.name.toLowerCase().includes(s) || (l.cls ?? "").toLowerCase().includes(s);
};

/* ─── Sort (§3) ───────────────────────────────────────────────────────── */

export type SortKey = ColKey | "stock" | "expiry";
const VENR: Record<string, number> = { V: 0, E: 1, N: 2 };
const SALER = ["controlled", "prescription_only", "pharmacy_only", "over_the_counter"];
const BLANK = 1e12;

function sortKey(r: Row, k: SortKey): number | string {
  const { l, mx } = r;
  switch (k) {
    case "ven":
      return l.ven ? VENR[l.ven]! : 3;
    case "cls":
      return l.cls ? CLASSES.indexOf(l.cls as never) : 99;
    case "group":
      return (l.group ?? "").toLowerCase();
    case "sale":
      return l.sale ? SALER.indexOf(l.sale) : 9;
    case "strength":
      return parseFloat(l.strength ?? "") || 0;
    case "form":
      return (l.form ?? "").toLowerCase();
    case "route":
      return (l.route ?? "").toLowerCase();
    case "stock":
    case "onhand":
      return mx.have;
    case "expiry":
      return mx.exp ?? BLANK;
    case "qc":
      return -r.qc.length;
    case "handling":
      return -flagList(l.flags).length;
    case "topup":
      return mx.pct ?? BLANK;
    case "status":
      return mx.sev;
    case "cover":
      return mx.cover ?? BLANK;
    case "price":
      return mx.price ?? BLANK;
    case "brands":
      return l.brands.length;
    default:
      return `${l.generic.toLowerCase()} ${String(parseFloat(l.strength ?? "") || 0).padStart(12, "0")}`;
  }
}

/** Blanks sort last whichever way; ties fall back to the name. Grouping keeps class order, the sort inside. */
export function sortLines(rows: Row[], key: SortKey, dir: 1 | -1, group: boolean): Row[] {
  const out = [...rows].sort((a, b) => {
    const ka = sortKey(a, key);
    const kb = sortKey(b, key);
    const blankA = ka === BLANK;
    const blankB = kb === BLANK;
    if (blankA !== blankB) return blankA ? 1 : -1;
    const c =
      typeof ka === "string" && typeof kb === "string"
        ? ka.localeCompare(kb, undefined, { numeric: true })
        : ka < kb
          ? -1
          : ka > kb
            ? 1
            : 0;
    return c * dir || a.l.name.localeCompare(b.l.name, undefined, { numeric: true });
  });
  if (group) {
    const ci = (r: Row) => (r.l.cls ? CLASSES.indexOf(r.l.cls as never) : 99);
    out.sort((a, b) => ci(a) - ci(b));
  }
  return out;
}

/* ─── Rules mapped to lines (§9) ──────────────────────────────────────── */

export type RuleGroup = (typeof RULE_GROUPS)[number];

export const rxFor = (generic: string) => RX_CHECKS[generic.toLowerCase()] ?? null;

export function ruleApplies(g: RuleGroup, flags: Flags, cls: string | null, generic: string) {
  if ("flag" in g) return flags[g.flag as FlagKey];
  if ("cls" in g) return cls === g.cls;
  if ("rx" in g) return rxFor(generic) !== null;
  return true;
}

/** The groups that apply to a line's current draft, each with how many stocked lines share it. */
export function rulesFor(
  flags: Flags,
  cls: string | null,
  generic: string,
  lines: Pick<Line, "flags" | "cls" | "generic">[],
) {
  return RULE_GROUPS.filter((g) => ruleApplies(g, flags, cls, generic)).map((g) => ({
    group: g,
    shared: lines.filter((l) => ruleApplies(g, l.flags, l.cls, l.generic)).length,
  }));
}

/* ─── Display helpers ─────────────────────────────────────────────────── */

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "23 Dec 26": today + days, in the hospital's calendar date. */
export function dateIn(today: string, days: number): string {
  const [y, m, d] = today.split("-").map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return `${dt.getUTCDate()} ${MON[dt.getUTCMonth()]} ${String(dt.getUTCFullYear()).slice(2)}`;
}

export const packText = (
  packs: number[],
  loose: boolean,
  words: { loose: string; none: string },
) => {
  const p = [...packs].sort((a, b) => a - b).map(String);
  if (loose) p.push(words.loose);
  return p.length ? p.join(" · ") : words.none;
};
