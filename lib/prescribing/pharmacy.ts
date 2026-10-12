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
    movements
      .filter((m) => m.kind === "received")
      .map((m) => m.effectiveAt)
      .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
  const lastCountAt = facts?.lastCountAt ?? null;
  const base = { lastCountAt, lastReceiptAt, since: null };

  if (!facts?.products.some((p) => p.medicineId === medicineId))
    return { ...base, state: "not_stocked" };
  const bal = balances(movements);
  const stale =
    lastCountAt !== null &&
    facts.countFreshnessDays !== null &&
    now.getTime() - lastCountAt.getTime() > facts.countFreshnessDays * 86_400_000;
  if (needsCount(bal) || (lastCountAt === null && lastReceiptAt === null) || stale)
    return { ...base, state: "not_counted" };
  const total = medicineTotal(batches, bal, medicineId, pointId, localDate(now));
  if (total <= 0) {
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
