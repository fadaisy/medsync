/**
 * The laboratory stock ledger (Lab Phase 3 §6.1, ST-1..ST-10; GATE A §3.2 0112, §5.1). Pure: rows in, answers
 * out; no clock (every function takes `at`/`now` and the hospital's time zone).
 *
 * Stock on hand is never stored: it is the signed sum of the append-only ledger (receipts and returns positive;
 * issues and write-offs negative; adjustments and counts carry their signed discrepancy). `expired` is never
 * stored either: it is the clock's verdict at the end of the use-by day, hospital-local (ST-2, ST-8).
 * Every level, window and tolerance here arrives as an argument (operational settings, never defaulted).
 */
import { endOfLocalDay, localDateKey } from "@/supabase/functions/_shared/slots";

// ─── Hospital-local days (shared by the Phase 3 engines) ────────────────────

/** "2026-09-30" + n days, on the calendar (no zone involved: a date key is already local). */
export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Whole calendar days from `a` to `b` (date keys). */
export const daysBetween = (a: string, b: string) =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

/**
 * The instant a hospital-local day ends (the next day's local midnight). Noon UTC of the key is inside that
 * local day for every zone within ±12 h, which covers every hospital MedSync serves (DEFAULT_TIME_ZONE).
 */
export const endOfDay = (day: string, timeZone: string) =>
  endOfLocalDay(new Date(`${day}T12:00:00Z`), timeZone);

/** The hospital-local day of an instant. */
export const dayOf = (at: Date, timeZone: string) => localDateKey(at, timeZone);

/** Every day key of a month "2026-09". */
export function daysOfMonth(month: string): string[] {
  const out: string[] = [];
  for (let d = `${month}-01`; d.startsWith(month); d = addDays(d, 1)) out.push(d);
  return out;
}

// ─── ST-1, ST-2: items and lots ─────────────────────────────────────────────

export type StockKind =
  | "reagent"
  | "kit"
  | "control"
  | "calibrator"
  | "stain"
  | "consumable"
  | "strip";

/** ST-1 (`lab_stock_items`). Levels are months of stock, set by the lead (operational, ST-5). */
export interface StockItem {
  id: string;
  hospitalId: string;
  name: string;
  kind: StockKind;
  testsPerUnit: number | null;
  testCodes: string[];
  hmisTracerCode: string | null;
  minMonths: number | null;
  maxMonths: number | null;
}

export type LotState =
  | "received"
  | "in_acceptance"
  | "accepted"
  | "in_use"
  | "finished"
  | "quarantined"
  | "rejected";

/** ST-2 (`lab_stock_lots`). `useBy` is a date key; null = no use-by printed. */
export interface StockLot {
  id: string;
  hospitalId: string;
  itemId: string;
  lot: string;
  useBy: string | null;
  receivedAt: Date;
  state: LotState;
}

/** ST-2, GATE A §5.1: the only moves a lot may make (the 0112 trigger enforces the same list). */
export const LOT_TRANSITIONS: Record<LotState, readonly LotState[]> = {
  received: ["in_acceptance", "accepted", "quarantined"],
  in_acceptance: ["accepted", "rejected", "quarantined"],
  accepted: ["in_use", "quarantined"],
  in_use: ["finished", "quarantined"],
  quarantined: ["accepted", "rejected"],
  finished: [],
  rejected: [],
};

export const canMoveLot = (from: LotState, to: LotState) => LOT_TRANSITIONS[from].includes(to);

/** ST-2, ST-8: past the end of its use-by day in the hospital's zone. */
export const isExpired = (lot: Pick<StockLot, "useBy">, at: Date, timeZone: string) =>
  lot.useBy !== null && dayOf(at, timeZone) > lot.useBy;

export type LotRefusal = "not_accepted" | "quarantined" | "rejected" | "finished" | "expired";

/**
 * LA-4, ST-8, LU-2: the one lot check shared by lots in use, issue and the bedside form. Selectable for patients
 * = `accepted` or `in_use`, and not expired.
 */
export function lotRefusal(
  lot: Pick<StockLot, "state" | "useBy">,
  at: Date,
  timeZone: string,
): LotRefusal | null {
  if (lot.state === "quarantined" || lot.state === "rejected" || lot.state === "finished")
    return lot.state;
  if (lot.state !== "accepted" && lot.state !== "in_use") return "not_accepted";
  return isExpired(lot, at, timeZone) ? "expired" : null;
}

// ─── ST-3: the ledger ───────────────────────────────────────────────────────

export type TxKind = "receipt" | "issue" | "adjustment" | "count" | "write_off" | "return";

/** ST-3 (`lab_stock_transactions`). `quantity` is signed, in units of issue. */
export interface StockTx {
  hospitalId: string;
  itemId: string;
  lotId: string | null;
  kind: TxKind;
  quantity: number;
  reason: string | null;
  at: Date;
}

/** ST-3: on hand for an item (or one lot) at `at`, derived from the ledger. */
export function onHand(
  txs: readonly StockTx[],
  q: { hospitalId: string; itemId: string; lotId?: string; at: Date },
): number {
  let sum = 0;
  for (const t of txs)
    if (
      t.hospitalId === q.hospitalId &&
      t.itemId === q.itemId &&
      (q.lotId === undefined || t.lotId === q.lotId) &&
      t.at < q.at
    )
      sum += t.quantity;
  return sum;
}

/** Units consumed in [from, to): issues net of returns (HM-9 "quantity consumed", ST-4). */
export function consumed(
  txs: readonly StockTx[],
  q: { hospitalId: string; itemId: string; from: Date; to: Date },
): number {
  let sum = 0;
  for (const t of txs)
    if (
      t.hospitalId === q.hospitalId &&
      t.itemId === q.itemId &&
      (t.kind === "issue" || t.kind === "return") &&
      t.at >= q.from &&
      t.at < q.to
    )
      sum -= t.quantity;
  return sum;
}

// ─── ST-4, ST-5: use and levels ─────────────────────────────────────────────

const monthStart = (month: string, timeZone: string) =>
  endOfDay(addDays(`${month}-01`, -1), timeZone);
const shiftMonth = (month: string, n: number) => {
  const d = new Date(`${month}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 7);
};

/**
 * ST-4: average monthly use over the last `lookBackMonths` whole hospital-local months before `now`'s month.
 * Null ("Not enough history") when the item's ledger does not reach back to the window's start.
 */
export function averageMonthlyUse(
  txs: readonly StockTx[],
  q: { hospitalId: string; itemId: string; now: Date; timeZone: string; lookBackMonths: number },
): number | null {
  const thisMonth = dayOf(q.now, q.timeZone).slice(0, 7);
  const from = monthStart(shiftMonth(thisMonth, -q.lookBackMonths), q.timeZone);
  const to = monthStart(thisMonth, q.timeZone);
  const mine = txs.filter((t) => t.hospitalId === q.hospitalId && t.itemId === q.itemId);
  if (!mine.some((t) => t.at <= from)) return null;
  return consumed(mine, { ...q, from, to }) / q.lookBackMonths;
}

export interface StockLevel {
  /** ST-4: null = "Not enough history"; Infinity = no use in the window. */
  monthsOfStock: number | null;
  belowMinimum: boolean;
  /** ST-5: max × average use − on hand, never negative; null without a maximum or a use figure. */
  toMaximum: number | null;
}

/** ST-4, ST-5. */
export function stockLevel(
  item: Pick<StockItem, "minMonths" | "maxMonths">,
  onHandNow: number,
  averageUse: number | null,
): StockLevel {
  if (averageUse === null) return { monthsOfStock: null, belowMinimum: false, toMaximum: null };
  const months = averageUse > 0 ? onHandNow / averageUse : Number.POSITIVE_INFINITY;
  return {
    monthsOfStock: months,
    belowMinimum: item.minMonths !== null && months < item.minMonths,
    toMaximum:
      item.maxMonths === null ? null : Math.max(0, item.maxMonths * averageUse - onHandNow),
  };
}

// ─── ST-6: first expiry, first out ──────────────────────────────────────────

/** ST-6: the selectable lot with the earliest use-by (a lot with no use-by goes last). */
export function nextLotToUse(
  lots: readonly StockLot[],
  q: { hospitalId: string; itemId: string; at: Date; timeZone: string },
): StockLot | null {
  return (
    lots
      .filter(
        (l) =>
          l.hospitalId === q.hospitalId &&
          l.itemId === q.itemId &&
          lotRefusal(l, q.at, q.timeZone) === null,
      )
      .sort((a, b) => (a.useBy ?? "9999").localeCompare(b.useBy ?? "9999"))[0] ?? null
  );
}

/** ST-6: choosing another lot than FEFO's needs a reason, which is recorded on the issue. */
export function fefoChoice(
  lots: readonly StockLot[],
  q: {
    hospitalId: string;
    itemId: string;
    chosenLotId: string;
    reason: string | null;
    at: Date;
    timeZone: string;
  },
):
  | { ok: true; fefoReason: string | null }
  | { ok: false; error: LotRefusal | "fefo_reason_required" | "unknown_lot" } {
  const chosen = lots.find(
    (l) => l.id === q.chosenLotId && l.hospitalId === q.hospitalId && l.itemId === q.itemId,
  );
  if (!chosen) return { ok: false, error: "unknown_lot" };
  const refusal = lotRefusal(chosen, q.at, q.timeZone);
  if (refusal) return { ok: false, error: refusal };
  if (nextLotToUse(lots, q)?.id === chosen.id) return { ok: true, fefoReason: null };
  const reason = q.reason?.trim();
  return reason ? { ok: true, fefoReason: reason } : { ok: false, error: "fefo_reason_required" };
}

// ─── ST-7, ST-8 ─────────────────────────────────────────────────────────────

/** ST-7: days in [fromDay, toDay] on which on hand was 0 (or less) at the end of the hospital-local day. */
export function daysOutOfStock(
  txs: readonly StockTx[],
  q: { hospitalId: string; itemId: string; fromDay: string; toDay: string; timeZone: string },
): string[] {
  const out: string[] = [];
  for (let d = q.fromDay; d <= q.toDay; d = addDays(d, 1))
    if (onHand(txs, { ...q, at: endOfDay(d, q.timeZone) }) <= 0) out.push(d);
  return out;
}

export interface ExpiryAlert {
  lotId: string;
  kind: "expired" | "expiring";
  daysLeft: number;
}

/** ST-8: lots expired, or expiring within the alert window (operational), that still matter. */
export function expiryAlerts(
  lots: readonly StockLot[],
  q: { hospitalId: string; at: Date; timeZone: string; windowDays: number },
): ExpiryAlert[] {
  const today = dayOf(q.at, q.timeZone);
  return lots
    .filter(
      (l) =>
        l.hospitalId === q.hospitalId &&
        l.useBy !== null &&
        l.state !== "finished" &&
        l.state !== "rejected",
    )
    .map((l) => ({ lotId: l.id, daysLeft: daysBetween(today, l.useBy!) }))
    .filter((a) => a.daysLeft <= q.windowDays)
    .map((a) => ({ ...a, kind: a.daysLeft < 0 ? ("expired" as const) : ("expiring" as const) }))
    .sort((a, b) => a.daysLeft - b.daysLeft);
}

// ─── ST-9: expected versus issued ───────────────────────────────────────────

/**
 * ST-9: for an item with tests per unit, the units released tests should have used beside the units issued.
 * `tolerancePct` is operational. It informs only.
 */
export function expectedVersusIssued(
  item: Pick<StockItem, "testsPerUnit">,
  releasedTests: number,
  issued: number,
  tolerancePct: number,
): { expected: number; issued: number; difference: number; listed: boolean } | null {
  if (!item.testsPerUnit) return null;
  const expected = releasedTests / item.testsPerUnit;
  const difference = issued - expected;
  const listed =
    expected === 0 ? issued > 0 : (Math.abs(difference) / expected) * 100 > tolerancePct;
  return { expected, issued, difference, listed };
}

// ─── ST-10: the count ───────────────────────────────────────────────────────

/** ST-10: items whose last count is older than the count frequency (operational), or never counted. */
export function countsDue(
  items: readonly Pick<StockItem, "id" | "hospitalId">[],
  lastCounted: ReadonlyMap<string, Date>,
  q: { hospitalId: string; now: Date; timeZone: string; everyDays: number },
): string[] {
  const today = dayOf(q.now, q.timeZone);
  return items
    .filter((i) => i.hospitalId === q.hospitalId)
    .filter((i) => {
      const last = lastCounted.get(i.id);
      return !last || daysBetween(dayOf(last, q.timeZone), today) >= q.everyDays;
    })
    .map((i) => i.id);
}

/** ST-10: one counted line. A discrepancy needs a reason and becomes a `count` transaction of that size. */
export function countLine(line: {
  expected: number;
  counted: number;
  reason: string | null;
}): { ok: true; discrepancy: number } | { ok: false; error: "reason_required" } {
  const discrepancy = line.counted - line.expected;
  if (discrepancy !== 0 && !line.reason?.trim()) return { ok: false, error: "reason_required" };
  return { ok: true, discrepancy };
}
