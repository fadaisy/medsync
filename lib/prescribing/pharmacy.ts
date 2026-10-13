/**
 * The pharmacy seam (ADR 0190). The prescribing dialog and the stock check read availability
 * through this interface only. MedSync is linked to no pharmacy system, so today every drug is
 * `not_linked`: no stock is ever shown as fact until a real feed replaces this implementation.
 */
import type { DispensingServes } from "@/db/schema/pharmacy";
import type { Batch, Movement } from "@/lib/pharmacy/stock/ledger";

import {
  balances,
  localDate,
  medicineTotal,
  needsCount,
  stockoutSpans,
} from "@/lib/pharmacy/stock/ledger";

export type PharmacyStatus = "not_linked" | "in" | "low" | "out";

export interface PharmacyAvailability {
  status: PharmacyStatus;
  /** The dispensing point, when known. */
  point?: string;
}

export function pharmacyAvailability(_drugId: string, _hospitalId?: string): PharmacyAvailability {
  return { status: "not_linked" };
}

export const PHARMACY_WORD: Record<PharmacyStatus, string> = {
  not_linked: "Stock: not linked",
  in: "In stock",
  low: "Low stock",
  out: "Out of stock",
};

/* ─── Pharmacy Phase 1: the stock answer (AV-1..AV-9, D-PH1-22) ─────────────────────────────── */

/**
 * `getAvailability` answers from facts already read (the read lands with Step 9), so it stays pure and
 * the dialog never sees a quantity: balances are reduced to a state inside this function and dropped
 * (AV-6). The old `pharmacyAvailability` above stays as it is until the read replaces its body.
 */

export type AvailabilityState =
  | "not_linked"
  | "not_stocked"
  | "not_counted"
  | "out"
  | "low"
  | "in_stock";

/** Where the prescription is being written (AV-2): the clinic → window, a ward → wards. */
export type AvailabilityOrigin = "window" | "wards" | "emergency";

export interface LivePoint {
  id: string;
  name: string;
  hospitalId: string;
  serves: DispensingServes;
}

/** What Step 9 reads for one medicine at one point. Quantities go in; none come out. */
export interface PointStockFacts {
  /** Products with an active product-at-point row here (CT-2). */
  products: readonly { id: string; medicineId: string }[];
  batches: readonly Batch[];
  movements: readonly Movement[];
  /** The last count of this medicine here (AV-4). */
  lastCountAt: Date | null;
  /** D-PH1-23: none set → never low. */
  reorderLevel: number | null;
  /** D-PH1-23: none set → a count never goes stale. */
  countFreshnessDays: number | null;
  /**
   * Step 9's read sums the ledger in SQL (one round trip), so it hands over each batch's balance, the
   * last receipt and the open stock-out (0124's projection) instead of every movement. When given, these
   * replace what `movements` would give.
   */
  balances?: ReadonlyMap<string, number>;
  lastReceiptAt?: Date | null;
  openStockoutSince?: Date | null;
}

export interface Availability {
  state: AvailabilityState;
  point: { id: string; name: string } | null;
  lastCountAt: Date | null;
  lastReceiptAt: Date | null;
  /** The open stock-out's start (SL-9), when `out` and one is on record. */
  since: Date | null;
  /** Other live points of this hospital that hold it, by name (AV-5). */
  elsewhere: string[];
}

const NOT_LINKED: Availability = {
  state: "not_linked",
  point: null,
  lastCountAt: null,
  lastReceiptAt: null,
  since: null,
  elsewhere: [],
};

function pointAnswer(
  medicineId: string,
  pointId: string,
  facts: PointStockFacts | undefined,
  now: Date,
): Omit<Availability, "point" | "elsewhere"> {
  // AV-9: the exact medicine only; another medicine's products and batches are not looked at.
  const batches = (facts?.batches ?? []).filter(
    (b) => b.medicineId === medicineId && b.pointId === pointId,
  );
  const ids = new Set(batches.map((b) => b.id));
  const movements = (facts?.movements ?? []).filter((m) => ids.has(m.batchId));
  const lastReceiptAt =
    facts?.lastReceiptAt !== undefined
      ? facts.lastReceiptAt
      : (movements
          .filter((m) => m.kind === "received")
          .map((m) => m.effectiveAt)
          .sort((a, b) => b.getTime() - a.getTime())[0] ?? null);
  const lastCountAt = facts?.lastCountAt ?? null;
  const base = { lastCountAt, lastReceiptAt, since: null };

  if (!facts?.products.some((p) => p.medicineId === medicineId))
    return { ...base, state: "not_stocked" };
  const bal = facts.balances
    ? new Map([...facts.balances].filter(([id]) => ids.has(id)))
    : balances(movements);
  const stale =
    lastCountAt !== null &&
    facts.countFreshnessDays !== null &&
    now.getTime() - lastCountAt.getTime() > facts.countFreshnessDays * 86_400_000;
  if (needsCount(bal) || (lastCountAt === null && lastReceiptAt === null) || stale)
    return { ...base, state: "not_counted" };
  const total = medicineTotal(batches, bal, medicineId, pointId, localDate(now));
  if (total <= 0) {
    if (facts.openStockoutSince !== undefined)
      return { ...base, state: "out", since: facts.openStockoutSince };
    const open = stockoutSpans(movements, batches, medicineId, pointId, localDate, now).find(
      (s) => s.endedAt === null,
    );
    return { ...base, state: "out", since: open?.startedAt ?? null };
  }
  if (facts.reorderLevel !== null && total < facts.reorderLevel) return { ...base, state: "low" };
  return { ...base, state: "in_stock" };
}

/**
 * AV-1..AV-9. The answering point is the first live point, in hub order, whose `serves` matches the
 * origin or is `all` (AV-2); with none, `not_linked`, as today. The state is the first of AV-3's order
 * that holds. `elsewhere` names the hospital's other live points whose own answer is in stock or low.
 */
export function getAvailability(input: {
  medicineId: string;
  hospitalId: string;
  origin: AvailabilityOrigin;
  /** Live points, in the hub's order. */
  points: readonly LivePoint[];
  stock: Readonly<Record<string, PointStockFacts>>;
  now: Date;
}): Availability {
  const points = input.points.filter((p) => p.hospitalId === input.hospitalId); // AV-5
  const answering = points.find((p) => p.serves === input.origin || p.serves === "all");
  if (!answering) return NOT_LINKED;
  const answer = (p: LivePoint) =>
    pointAnswer(input.medicineId, p.id, input.stock[p.id], input.now);
  return {
    ...answer(answering),
    point: { id: answering.id, name: answering.name },
    elsewhere: points
      .filter((p) => p !== answering && ["in_stock", "low"].includes(answer(p).state))
      .map((p) => p.name),
  };
}

export type AvailabilityLevel = "note" | "check" | "not_checked";

/** D-PH1-22's signed mapping: each linked state is a Note or a Check, never a Stop. */
export type AvailabilityMapping = Readonly<
  Record<Exclude<AvailabilityState, "not_linked">, "note" | "check">
>;

/**
 * AV-7, D-PH1-22: the level in the dialog. `not_linked`, or no signed mapping, keeps today's behaviour
 * (not checked: "Pharmacy not linked yet."). Anything a mapping holds other than a Note is a Check.
 */
export function availabilityLevel(
  state: AvailabilityState,
  mapping: AvailabilityMapping | null,
): AvailabilityLevel {
  if (state === "not_linked" || !mapping) return "not_checked";
  return mapping[state] === "note" ? "note" : "check";
}

/** D-PH1-22's proposal (gate-a-content 2.16): Note for on the shelf, low, not counted; Check otherwise. */
export const PROPOSED_MAPPING: AvailabilityMapping = {
  in_stock: "note",
  low: "note",
  not_counted: "note",
  out: "check",
  not_stocked: "check",
};

/**
 * The mapping in force: the hospital's signed `availability_mapping` set, else the proposal outside
 * production only. In production with none signed the stock line stays "Pharmacy not linked yet."
 */
export function mappingInForce(signed: unknown, production: boolean): AvailabilityMapping | null {
  if (signed && typeof signed === "object") {
    const o = signed as Record<string, unknown>;
    const keys = Object.keys(PROPOSED_MAPPING) as (keyof AvailabilityMapping)[];
    if (keys.every((k) => o[k] === "note" || o[k] === "check"))
      return Object.fromEntries(keys.map((k) => [k, o[k]])) as unknown as AvailabilityMapping;
  }
  return production ? null : PROPOSED_MAPPING;
}

/** What reaches the prescriber's side (AV-6): getAvailability's answer and its level, never a quantity. */
export interface StockLine {
  state: AvailabilityState;
  level: AvailabilityLevel;
  pointId: string | null;
  point: string | null;
  lastCountAt: string | null;
  lastReceiptAt: string | null;
  since: string | null;
  elsewhere: string[];
}

export function toStockLine(a: Availability, mapping: AvailabilityMapping | null): StockLine {
  const iso = (d: Date | null) => d?.toISOString() ?? null;
  return {
    state: a.state,
    level: availabilityLevel(a.state, mapping),
    pointId: a.point?.id ?? null,
    point: a.point?.name ?? null,
    lastCountAt: iso(a.lastCountAt),
    lastReceiptAt: iso(a.lastReceiptAt),
    since: iso(a.since),
    elsewhere: a.elsewhere,
  };
}

/** gate-a-content B-54..B-59, X-25. Draft wording for the CSO; the flag stays off in production. */
export const STOCK_LINE_COPY = {
  status: "draft",
  notLinked: "Pharmacy not linked yet.",
  footer: "Stock informs and never blocks. A dispensing point that has not counted says so.",
  /** D-PH1-22: the other choice at a Check (the answer itself is STOCK_REASONS in plan-rx). */
  pickElse: "Pick something else",
} as const;

const KAMPALA = "Africa/Kampala";
const when = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: KAMPALA,
  });
const date = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: KAMPALA });

/** 5.10's line for one medicine. Only times and names: no figure ever (AV-6). */
export function stockLineWords(l: StockLine): string {
  if (l.state === "not_linked" || !l.point) return STOCK_LINE_COPY.notLinked;
  // AV-4: "Counted" only from a count; a receipt with no count says so.
  const counted = l.lastCountAt
    ? `Counted ${when(l.lastCountAt)}.`
    : l.lastReceiptAt
      ? `Received ${when(l.lastReceiptAt)}, not yet counted.`
      : "";
  const at = l.point;
  switch (l.state) {
    case "in_stock":
      return `On the shelf at ${at}. ${counted}`.trim();
    case "low":
      return `Low at ${at}. ${counted}`.trim();
    case "out":
      return [
        `Not on the shelf at ${at}${l.since ? ` since ${date(l.since)}` : ""}.`,
        l.elsewhere.length ? `In stock at ${l.elsewhere.join(", ")}.` : "",
      ]
        .filter(Boolean)
        .join(" ");
    case "not_stocked":
      return `Not stocked at ${at}.`;
    case "not_counted":
      return `Stock at ${at} has not been counted ${l.lastCountAt ? `since ${date(l.lastCountAt)}` : "yet"}. This answer may be wrong.`;
  }
}
