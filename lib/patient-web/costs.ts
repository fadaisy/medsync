import type { Charge, LabPriceRow } from "@/lib/lab/prices";

import { chargeFor } from "@/lib/lab/prices";

/*
 * What a patient's waiting tests and medicines cost (ADR 0527). Pure: the loaders hand over rows, this adds them
 * up. The laws: a thing nobody priced is "not set" and is left out of the total, which then says it is partial;
 * free is said as free; nothing is ever shown as zero. Nothing is charged here.
 */

export interface CostLine {
  key: string;
  name: string;
  charge: Charge;
}
export interface Costs<L extends CostLine = CostLine> {
  lines: L[];
  /** The total of the priced lines; free lines add nothing. */
  totalUgx: number;
  /** Lines with no price set: left out of the total. */
  notSet: number;
  /** Something has a price or is free, so there is a total worth showing. */
  hasTotal: boolean;
}

export function addUp<L extends CostLine>(lines: L[]): Costs<L> {
  return {
    lines,
    totalUgx: lines.reduce((n, l) => n + (l.charge.kind === "priced" ? l.charge.ugx : 0), 0),
    notSet: lines.filter((l) => l.charge.kind === "price_not_set").length,
    hasTotal: lines.some((l) => l.charge.kind !== "price_not_set"),
  };
}

export interface WaitingTest {
  /** The order's id. */
  key: string;
  code: string;
  name: string;
  fasting: boolean;
}
export interface TestCostLine extends CostLine {
  /** The clinician ordered it fasting. */
  fasting: boolean;
  /** The laboratory's own stated turnaround, in words; null when it never stated one. */
  readyIn: string | null;
  /** The laboratory has reported it cannot run this test right now. */
  unavailable: boolean;
}

/** A person's waiting tests with the hospital's price for each today. */
export function testCosts(
  tests: readonly WaitingTest[],
  prices: readonly LabPriceRow[],
  statedTurnaround: Readonly<Record<string, string | null>>,
  unavailable: ReadonlySet<string>,
  today: string,
): Costs<TestCostLine> {
  return addUp(
    tests.map((t) => ({
      key: t.key,
      name: t.name,
      charge: chargeFor(prices, t.code, today),
      fasting: t.fasting,
      readyIn: statedTurnaround[t.code] ?? null,
      unavailable: unavailable.has(t.code),
    })),
  );
}

/** One supply that stands (not reversed), with the price snapshot the pharmacy took at hand-over. */
export interface SupplyPrice {
  /** The prescription line it was given against. */
  lineId: string;
  quantity: number;
  kind: "priced" | "free" | "price_not_set" | null;
  /** The price of one issue unit at supply; null when none was in force. */
  unitUgx: number | null;
}

/**
 * What one given medicine cost: the units given times the unit price recorded at hand-over, added over its
 * supplies. If any supply had no price the line is "not set" (a part total would mislead); all free is free.
 * A supply from before prices were recorded carries no kind: a positive snapshot reads as priced, none as not set.
 */
export function medicineCharge(supplies: readonly SupplyPrice[]): Charge {
  if (!supplies.length) return { kind: "price_not_set" };
  let total = 0;
  let priced = false;
  for (const s of supplies) {
    const kind = s.kind ?? (s.unitUgx !== null && s.unitUgx > 0 ? "priced" : "price_not_set");
    if (kind === "price_not_set" || (kind === "priced" && !(s.unitUgx && s.unitUgx > 0)))
      return { kind: "price_not_set" };
    if (kind === "priced") {
      priced = true;
      total += Math.round(s.unitUgx! * s.quantity);
    }
  }
  return priced && total > 0 ? { kind: "priced", ugx: total } : { kind: "free" };
}

/** The medicines a person was given, each with what it cost, in the order asked for. */
export function medicineCosts(
  medicines: readonly { lineId: string; name: string }[],
  supplies: readonly SupplyPrice[],
): Costs {
  return addUp(
    medicines.map((m) => ({
      key: m.lineId,
      name: m.name,
      charge: medicineCharge(supplies.filter((s) => s.lineId === m.lineId)),
    })),
  );
}
