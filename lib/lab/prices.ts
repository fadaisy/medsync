/*
 * A hospital's own price per laboratory test (ADR 0527). Pure: nothing here reads the database. The laws are the
 * pharmacy's (migration 0257, Law 11): a price is whole Uganda shillings above zero or the test is free, UGX 0 is
 * never stored or shown, and a test nobody priced is "not set", never zero. History is append-only: the price in
 * force on a day is the latest row on or before it, so a price can be entered ahead of the day it starts.
 */

export interface LabPriceRow {
  /** `test_catalogue.code`. */
  code: string;
  priceUgx: number | null;
  free: boolean;
  /** YYYY-MM-DD, the first day the price applies. */
  fromDate: string;
  /** ISO time the row was written: the later row wins on the same day. */
  createdAt: string;
}

export type Charge = { kind: "priced"; ugx: number } | { kind: "free" } | { kind: "price_not_set" };

/** The charge for one test on a day. */
export function chargeFor(rows: readonly LabPriceRow[], code: string, onDate: string): Charge {
  let best: LabPriceRow | null = null;
  for (const r of rows) {
    if (r.code !== code || r.fromDate > onDate) continue;
    if (
      !best ||
      r.fromDate > best.fromDate ||
      (r.fromDate === best.fromDate && r.createdAt > best.createdAt)
    )
      best = r;
  }
  if (!best) return { kind: "price_not_set" };
  if (best.free) return { kind: "free" };
  return best.priceUgx && best.priceUgx > 0
    ? { kind: "priced", ugx: best.priceUgx }
    : { kind: "price_not_set" };
}

export interface Quote {
  lines: { code: string; charge: Charge }[];
  /** The total of the tests that have a price; free tests add nothing. */
  totalUgx: number;
  /** Tests with no price set: the total leaves them out, and the screen must say so. */
  notSet: number;
  /** True only when there is at least one test and every one is priced or free. */
  complete: boolean;
}

/** What a set of tests costs on a day: a lab visit is the total of its tests. */
export function quote(
  codes: readonly string[],
  rows: readonly LabPriceRow[],
  onDate: string,
): Quote {
  const lines = codes.map((code) => ({ code, charge: chargeFor(rows, code, onDate) }));
  const notSet = lines.filter((l) => l.charge.kind === "price_not_set").length;
  return {
    lines,
    totalUgx: lines.reduce((n, l) => n + (l.charge.kind === "priced" ? l.charge.ugx : 0), 0),
    notSet,
    complete: lines.length > 0 && notSet === 0,
  };
}

export const MAX_PRICE_UGX = 50_000_000;

/** A typed price: whole shillings above zero ("15,000", "UGX 15 000"). Anything else is null. */
export function parseUgx(text: string): number | null {
  const t = text.replace(/ugx/i, "").replace(/[\s,]/g, "");
  if (!/^\d{1,9}$/.test(t)) return null;
  const n = Number(t);
  return n > 0 && n <= MAX_PRICE_UGX ? n : null;
}

export const ugxWords = (n: number) => `UGX ${n.toLocaleString("en-US")}`;
