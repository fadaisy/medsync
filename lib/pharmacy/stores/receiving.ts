import { daysBetween, expiresOn, isExpired } from "@/lib/pharmacy/stock/ledger";

/**
 * Receiving against a delivery note (Pharmacy Phase 2, 5.2, 6.3: RG-1 to RG-6). Pure. The expiry
 * look-ahead is Phase 1's setting (D-PH1-23, Law 6), passed in; unset, the short-dated check does not run
 * and the result says which setting is missing.
 */

/** "YYYY-MM-DD HH:MM" in Kampala time (UTC+3, no daylight saving): the arrival field's default, read back by `parseArrival`. */
export const arrivalText = (at: Date): string =>
  new Date(at.getTime() + 3 * 3_600_000).toISOString().slice(0, 16).replace("T", " ");

export type DeliveryState = "counting" | "received" | "abandoned";
export type RejectReason = "damaged" | "wrong_product" | "expired" | "short_dated" | "other";
export type ShortDatedDecision = "accept" | "accept_tell" | "reject";

/** One delivery line, as 0181 `pharmacy_delivery_lines` holds it. */
export interface DeliveryLine {
  lineNo: number;
  /** The product actually delivered. */
  productId: string;
  /** The product on the note, when it differs (a wrong product). */
  noteProductId: string | null;
  orderLineId: string | null;
  noteQuantity: number | null;
  acceptedQuantity: number;
  rejectedKeptQuantity: number;
  rejectedReturnedQuantity: number;
  rejectReason: RejectReason | null;
  batchNumber: string | null;
  expiry: string | null;
  expiryMonthOnly: boolean;
  unitCost: number | null;
  shortDatedDecision: ShortDatedDecision | null;
}

export type LineResult =
  | { kind: "matches" }
  | { kind: "fewer_than_note"; n: number }
  | { kind: "more_than_note"; n: number }
  | { kind: "short_of_order"; n: number }
  | { kind: "not_on_order" }
  | { kind: "expires_within"; lookaheadDays: number }
  | { kind: "expired" }
  | { kind: "damaged" }
  | { kind: "wrong_product" };

/** RG-3: counted = accepted + rejected kept + rejected sent back. */
export const countedOf = (l: DeliveryLine): number =>
  l.acceptedQuantity + l.rejectedKeptQuantity + l.rejectedReturnedQuantity;

const shortDated = (l: DeliveryLine, today: string, lookaheadDays: number) =>
  l.expiry !== null &&
  !isExpired({ expiry: l.expiry, expiryMonthOnly: l.expiryMonthOnly }, today) &&
  daysBetween(today, expiresOn({ expiry: l.expiry, expiryMonthOnly: l.expiryMonthOnly })) <=
    lookaheadDays;

/**
 * RG-2: a line's results from note, counted, order and expiry; several may apply. `owedBefore` is what
 * the named order line still owed before this delivery (RG-6), null when no order line is linked.
 */
export function lineResults(
  line: DeliveryLine,
  ctx: {
    today: string;
    lookaheadDays: number | null;
    orderNamed: boolean;
    owedBefore: number | null;
  },
): { results: LineResult[]; missing: "expiry_lookahead"[] } {
  const r: LineResult[] = [];
  const counted = countedOf(line);
  if (line.noteQuantity !== null && counted < line.noteQuantity)
    r.push({ kind: "fewer_than_note", n: line.noteQuantity - counted });
  if (line.noteQuantity !== null && counted > line.noteQuantity)
    r.push({ kind: "more_than_note", n: counted - line.noteQuantity });
  if (ctx.orderNamed && line.orderLineId === null) r.push({ kind: "not_on_order" });
  if (ctx.owedBefore !== null && line.acceptedQuantity < ctx.owedBefore)
    r.push({ kind: "short_of_order", n: ctx.owedBefore - line.acceptedQuantity });
  if (expiredOnArrival(line, ctx.today)) r.push({ kind: "expired" });
  else if (ctx.lookaheadDays !== null && shortDated(line, ctx.today, ctx.lookaheadDays))
    r.push({ kind: "expires_within", lookaheadDays: ctx.lookaheadDays });
  if (
    line.rejectReason === "damaged" &&
    line.rejectedKeptQuantity + line.rejectedReturnedQuantity > 0
  )
    r.push({ kind: "damaged" });
  if (line.noteProductId !== null && line.noteProductId !== line.productId)
    r.push({ kind: "wrong_product" });
  return {
    results: r.length === 0 ? [{ kind: "matches" }] : r,
    missing: ctx.lookaheadDays === null ? ["expiry_lookahead"] : [],
  };
}

/** RG-4: expired on arrival (Phase 1 SL-5). */
export const expiredOnArrival = (line: DeliveryLine, today: string): boolean =>
  line.expiry !== null &&
  isExpired({ expiry: line.expiry, expiryMonthOnly: line.expiryMonthOnly }, today);

export type LineRefusal =
  | "expired_cannot_enter_stock"
  | "short_dated_decision_needed"
  | "rejected_short_dated_accepted"
  | "batch_and_expiry_needed"
  | "batch_expiry_conflict"
  | "reject_reason_needed"
  | "expiry_lookahead_not_set";

/**
 * RG-3, RG-4, SL-3: what stops a line being added to stock. An expired item never enters usable stock;
 * a short-dated one needs a recorded decision, and "reject" means none of it is accepted; a batch number
 * already at the location with another expiry is refused. `existing` is the location's batches.
 */
export function lineRefusals(
  line: DeliveryLine,
  ctx: {
    today: string;
    lookaheadDays: number | null;
    existing: readonly { productId: string; batchNumber: string; expiry: string }[];
  },
): LineRefusal[] {
  const out: LineRefusal[] = [];
  const stocked = line.acceptedQuantity + line.rejectedKeptQuantity;
  if (stocked > 0 && (line.batchNumber === null || line.expiry === null))
    out.push("batch_and_expiry_needed");
  if (line.rejectedKeptQuantity + line.rejectedReturnedQuantity > 0 && line.rejectReason === null)
    out.push("reject_reason_needed");
  if (line.acceptedQuantity > 0 && expiredOnArrival(line, ctx.today))
    out.push("expired_cannot_enter_stock");
  if (line.acceptedQuantity > 0 && !expiredOnArrival(line, ctx.today)) {
    if (ctx.lookaheadDays === null) out.push("expiry_lookahead_not_set");
    else if (shortDated(line, ctx.today, ctx.lookaheadDays)) {
      if (line.shortDatedDecision === null) out.push("short_dated_decision_needed");
      else if (line.shortDatedDecision === "reject") out.push("rejected_short_dated_accepted");
    }
  }
  if (line.batchNumber !== null && line.expiry !== null) {
    const clash = ctx.existing.find(
      (b) =>
        b.productId === line.productId &&
        b.batchNumber.toLowerCase() === line.batchNumber?.toLowerCase() &&
        b.expiry !== line.expiry,
    );
    if (clash) out.push("batch_expiry_conflict");
  }
  return out;
}

/** A `received` movement a closed delivery writes (one per line and place). */
export interface PlannedReceipt {
  lineNo: number;
  locationId: string;
  productId: string;
  batchNumber: string;
  expiry: string;
  expiryMonthOnly: boolean;
  quantity: number;
  unitCost: number | null;
  /** Set on a rejected quantity kept in quarantine. */
  reasonCode: RejectReason | null;
}

/**
 * RG-1, RG-3: the movements a delivery writes. Only a `received` delivery moves stock. Accepted enters
 * the receiving location; rejected and kept enters quarantine directly, with its reason; rejected and
 * sent back writes nothing (HMIS 087 only); a counted zero writes nothing. A wrong-product line is
 * received as the product actually delivered, never the product on the note.
 */
export function deliveryMovements(delivery: {
  state: DeliveryState;
  locationId: string;
  quarantineLocationId: string;
  lines: readonly DeliveryLine[];
}): PlannedReceipt[] {
  if (delivery.state !== "received") return [];
  const out: PlannedReceipt[] = [];
  for (const l of delivery.lines) {
    if (l.batchNumber === null || l.expiry === null) continue;
    const base = {
      lineNo: l.lineNo,
      productId: l.productId,
      batchNumber: l.batchNumber,
      expiry: l.expiry,
      expiryMonthOnly: l.expiryMonthOnly,
      unitCost: l.unitCost,
    };
    if (l.acceptedQuantity > 0)
      out.push({
        ...base,
        locationId: delivery.locationId,
        quantity: l.acceptedQuantity,
        reasonCode: null,
      });
    if (l.rejectedKeptQuantity > 0)
      out.push({
        ...base,
        locationId: delivery.quarantineLocationId,
        quantity: l.rejectedKeptQuantity,
        reasonCode: l.rejectReason,
      });
  }
  return out;
}

/** RG-1: the delivery states. Only `counting` changes; abandoning needs a reason (0181: 3–300). */
export function deliveryNext(
  state: DeliveryState,
  event: { type: "save" } | { type: "finish" } | { type: "abandon"; reason: string },
): { ok: true; state: DeliveryState } | { ok: false; reason: "closed" | "reason_needed" } {
  if (state !== "counting") return { ok: false, reason: "closed" };
  if (event.type === "save") return { ok: true, state: "counting" };
  if (event.type === "finish") return { ok: true, state: "received" };
  const r = event.reason.trim();
  if (r.length < 3 || r.length > 300) return { ok: false, reason: "reason_needed" };
  return { ok: true, state: "abandoned" };
}

/**
 * RG-5: the discrepancy report, a projection of the closed delivery: every line that is not Matches,
 * with its results and any short-dated decision.
 */
export function discrepancyLines(
  lines: readonly DeliveryLine[],
  ctx: {
    today: string;
    lookaheadDays: number | null;
    orderNamed: boolean;
    owed: ReadonlyMap<string, number>;
  },
): { line: DeliveryLine; results: LineResult[] }[] {
  return lines
    .map((line) => ({
      line,
      results: lineResults(line, {
        ...ctx,
        owedBefore: line.orderLineId === null ? null : (ctx.owed.get(line.orderLineId) ?? null),
      }).results,
    }))
    .filter(
      (x) => x.results.some((r) => r.kind !== "matches") || x.line.shortDatedDecision !== null,
    );
}

export type OrderLineState = "open" | "part_received" | "received" | "closed";

/**
 * RG-6, 5.10: what each order line still owes, by projection over received deliveries (accepted
 * quantities only), never by editing the order. A line closed with a reason owes nothing.
 */
export function stillOwed(
  orderLines: readonly { id: string; units: number; closedReason: string | null }[],
  deliveries: readonly { state: DeliveryState; lines: readonly DeliveryLine[] }[],
): {
  orderLineId: string;
  ordered: number;
  received: number;
  owed: number;
  state: OrderLineState;
}[] {
  const got = new Map<string, number>();
  for (const d of deliveries) {
    if (d.state !== "received") continue;
    for (const l of d.lines)
      if (l.orderLineId) got.set(l.orderLineId, (got.get(l.orderLineId) ?? 0) + l.acceptedQuantity);
  }
  return orderLines.map((o) => {
    const received = got.get(o.id) ?? 0;
    const owed = o.closedReason !== null ? 0 : Math.max(0, o.units - received);
    const state: OrderLineState =
      received >= o.units
        ? "received"
        : o.closedReason !== null
          ? "closed"
          : received > 0
            ? "part_received"
            : "open";
    return { orderLineId: o.id, ordered: o.units, received, owed, state };
  });
}

/** 5.10: an order's status from its lines. */
export function orderStatus(states: readonly OrderLineState[]): OrderLineState {
  if (states.every((s) => s === "received")) return "received";
  if (states.every((s) => s === "received" || s === "closed")) return "closed";
  if (states.some((s) => s !== "open")) return "part_received";
  return "open";
}
