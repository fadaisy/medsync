/**
 * Stock at the dispensing point (Pharmacy Phase 1, 5.8, 5.3.1; gate-a-content.md Part 1 and §2.7,
 * gate-a-wireframes.md §1 and §8). Every visible string on /pharmacy/stock and the acting-point
 * chooser. All `draft` under PHARMACY_PHASE1_COPY_STATUS: the flag stays off in production until the
 * Phase 1 wording is signed (RD-4). Reason lists are Appendix D's drafted codes (§2.7); unsigned, a
 * point cannot go live (RD-1), and set-up may use them.
 */

import type { StockState } from "@/lib/pharmacy/stock/ledger";

/** §2.7, Adjustment (Appendix D). `other` needs text. */
export const ADJUSTMENT_REASONS = {
  damaged: "Damaged",
  expired_removed: "Expired, removed",
  lost: "Lost",
  found: "Found on the shelf",
  other: "Other (with text)",
} as const;
export type AdjustmentReason = keyof typeof ADJUSTMENT_REASONS;

/** §2.7, Count difference (drafted in the annex). `other` needs text. */
export const COUNT_DIFFERENCE_REASONS = {
  supply_unrecorded: "A supply or issue was not recorded",
  receipt_unrecorded: "A receipt was not recorded",
  damaged: "Damaged or broken",
  unknown: "Cause not known",
  other: "Other (with text)",
} as const;
export type CountDifferenceReason = keyof typeof COUNT_DIFFERENCE_REASONS;

/** 5.8 Receive stock, "from". */
export const DELIVERY_FROM = {
  main_store: "Main store",
  supplier: "A supplier",
  borrowed: "Borrowed from another facility",
  ward_return: "Returned from a ward",
} as const;
export type DeliveryFrom = keyof typeof DELIVERY_FROM;

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/** An expiry as the pack gives it: "03/2027" for a month, "31 Mar 2027" for a day (DD MMM YYYY). */
export function expiryText(b: { expiry: string; expiryMonthOnly: boolean }): string {
  const [y, m, d] = b.expiry.split("-");
  if (b.expiryMonthOnly) return `${m}/${y}`;
  return `${d} ${MONTHS[Number(m) - 1] ?? m} ${y}`;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export const STOCK = {
  title: "Stock",
  /** Replaces X-16 now that Step 7 is built (draft staff copy). */
  controlledWitnessed:
    "A controlled drug is received, counted and moved with a witness, on the Controlled drugs page.",
  toControlled: "Open Controlled drugs",
  /** X-15. */
  noLevelNeverLow: "A medicine with no reorder level set is never shown as low.",
  /** X-3. */
  addedAtWindow: "Added at the window",
  /** B-18. */
  expiredRemove: (date: string) => `Expired ${date}. Remove it from the shelf.`,
  /** X-14. */
  matched: (n: number) => `Counted ${n} · matched the record`,
  /** Wireframe §8.2, after saving a count that differs. */
  differs: (n: number, recorded: number) => `Counted ${n} · the record said ${recorded}.`,
  /** Wireframe §8.2, SL-3. */
  expiryClash: (batch: string, held: string, typed: string) =>
    `${batch} is already here with expiry ${held}, not ${typed}. Check the label.`,
  alreadyHere: (batch: string) => `${batch} is already recorded here. Count it instead.`,
  noPoint: "Choose the dispensing point you are working at.",
  flagOff: "Stock is not switched on at this hospital.",
  failed: "Nothing was recorded. Try again.",

  /** X-17: the state words (5.8). */
  state: {
    in_stock: "In stock",
    low: "Low",
    out: (days: number | null) => (days === null ? "Out" : `Out · ${plural(days, "day", "days")}`),
    expiring: (days: number) => `Expiring · ${plural(days, "day", "days")}`,
    expired_remove: "Expired, remove",
    count_needed: "Count needed",
  },

  figures: {
    out: "Out of stock now",
    outVital: (n: number) => `${n} vital`,
    vitalNotImported: "Vital: national list not imported",
    expiring: (days: number | null) =>
      days === null ? "Expiring" : `Expiring within ${plural(days, "day", "days")}`,
    expiringHint: (n: number) => plural(n, "batch", "batches"),
    noLookahead: "No look-ahead set: no batch is counted as expiring",
    counted: "Counted this week",
    countedHint: (a: number, b: number) => `${a} of ${b} medicines`,
  },
  /** RD-1 condition 3. */
  opening: (n: number) =>
    n === 0
      ? "Opening count: every product here has one."
      : `Opening count: ${plural(n, "product still needs", "products still need")} one before this point can go live.`,

  tabs: {
    label: "Stock filter",
    all: "All",
    out: "Out",
    low: "Low",
    expiring: "Expiring",
    not_counted: "Not counted this week",
  },
  columns: {
    medicine: "Medicine",
    onShelf: "On the shelf",
    firstExpiry: "First batch to expire",
    counted: "Counted",
    state: "State",
    supplied: "Supplied in the last 7 days",
  },
  never: "Never",
  empty: "No medicine is set up at this point yet. Add a product to begin.",
  emptyTab: "No medicine matches this filter.",
  ven: { V: "Vital", E: "Essential", N: "Necessary" } as Record<string, string>,

  requests: {
    title: "Requests from other points",
    line: (point: string, medicine: string, n: number | null) =>
      `${point} asks for ${medicine}${n === null ? "" : ` · ${n}`}`,
    send: "Send",
    close: "Close",
    closeTitle: "Close the request",
    closeReason: "Reason",
  },

  actions: {
    receive: "Receive stock",
    count: "Count",
    fullCount: "Count everything",
    transfer: "Send to another point",
    addProduct: "Add a product",
    setLevel: "Set reorder level",
    adjust: "Adjust",
    correct: "Correct batch details",
    found: "Add a batch found on the shelf",
    cancel: "Cancel",
    back: "Back to stock",
  },

  detail: {
    products: "Products and batches",
    movements: "Today's movements",
    noMovements: "Nothing has moved today.",
    noBatches: "No batch is recorded for this product here.",
    notAtPoint: "Not at this point",
    columns: {
      batch: "Batch",
      expires: "Expires",
      onShelf: "On the shelf",
      time: "Time",
      what: "What",
      quantity: "Quantity",
      source: "Source",
      who: "Who",
    },
    level: (n: number | null) => (n === null ? "No reorder level set" : `Reorder level ${n}`),
    product: (p: {
      name: string;
      strength: string | null;
      packSize: string | null;
      issueUnit: string;
    }) =>
      [p.name, p.strength, p.packSize ? `pack ${p.packSize}` : null, `issued as ${p.issueUnit}`]
        .filter(Boolean)
        .join(" · "),
    differences: "Counts waiting for a reason",
  },

  movementKind: {
    received: "Received",
    supplied: "Supplied",
    reversed: "Reversed",
    adjusted: "Adjusted",
    count_correction: "Count correction",
    transfer_out: "Sent to another point",
    transfer_in: "Received from another point",
  } as Record<string, string>,
  source: {
    delivery: "Delivery",
    supply: "Supply",
    reversal: "Reversal",
    count: "Count",
    adjustment: "Adjustment",
    transfer: "Transfer",
    found_on_shelf: "Found on the shelf",
    downtime: "Entered after downtime",
  } as Record<string, string>,

  receive: {
    title: "Receive stock",
    product: "Product",
    batch: "Batch number",
    expiry: "Expiry",
    monthOnly: "The pack gives a month only",
    quantity: (medicine: string, unit: string) => `${medicine}, quantity in ${unit}`,
    from: "From",
    ref: "Delivery reference (optional)",
    submit: "Add to stock",
    noProduct: "Add a product first.",
  },
  count: {
    title: (what: string) => `Count · ${what}`,
    lede: "Type what is on the shelf, batch by batch.",
    onShelf: (batch: string, expires: string) => `${batch} · exp ${expires}, on the shelf`,
    submit: "Save count",
    reason: "Reason",
    note: "Note",
    record: "Record the correction",
    done: "Done",
    nothing: "No batch is recorded here. Saving records that the shelf was counted.",
  },
  adjust: {
    title: (what: string) => `Adjust · ${what}`,
    batch: "Batch",
    quantity: "Give a minus quantity to take stock away.",
    reason: "Reason",
    note: "Say what happened",
    submit: "Adjust",
  },
  transfer: {
    title: "Send to another point",
    to: "To",
    batch: "Batch",
    quantity: "Quantity",
    together: "Both movements are recorded together.",
    submit: "Send",
  },
  correct: {
    title: (batch: string) => `Correct batch details · ${batch}`,
    batch: "Batch number",
    expiry: "Expiry",
    reason: "Reason",
    keeps: "The old value stays in the record. Movements are unchanged.",
    submit: "Correct",
  },
  product: {
    title: "Add a product",
    medicine: "Medicine",
    name: "Product name",
    manufacturer: "Manufacturer (optional)",
    strength: "Strength, as on the pack (optional)",
    packSize: "Pack size (optional)",
    issueUnit: "Issue unit",
    registration: "Registration number (optional)",
    unitLocks:
      "The issue unit cannot change once stock has moved. A different unit is a new product.",
    submit: "Add the product",
  },
  level: {
    title: (what: string) => `Set reorder level · ${what}`,
    field: (unit: string) => `Reorder level, in ${unit}`,
    clear: "Leave empty for no level.",
    submit: "Save",
  },
  found: {
    title: (what: string) => `Add a batch found on the shelf · ${what}`,
    unknownUnit: "the issue unit above",
    reason: "Reason",
    newProduct: "This product is not set up here. Add it first.",
    submit: "Add the batch",
  },

  /** Wireframe §1: the acting-point chooser. */
  point: {
    label: "Working at",
    live: (name: string) => `${name} · Live`,
    notLive: (name: string) => `${name} · Not live: read-only queue and stock set-up`,
    stored: "Your choice is stored on everything you record.",
  },
} as const;

/** X-17: a state in words. Every state but In stock is amber with an icon where it is drawn. */
export function stateWord(state: StockState, days: number | null): string {
  if (state === "out") return STOCK.state.out(days);
  if (state === "expiring") return STOCK.state.expiring(days ?? 0);
  return STOCK.state[state];
}
