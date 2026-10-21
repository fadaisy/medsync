import type { StoreMovement } from "./ledger";
import type { LocationKind } from "./locations";

/**
 * Recall (Pharmacy Phase 2, 5.7, 6.9: RC-1 to RC-6; Law 8, D-PH2-17). Pure. A patient is on the exact
 * list only from a recorded supply of the batch; "may have received it" is a separate list, never merged.
 */

export interface Recall {
  productId: string;
  /** Null: every batch of the product. */
  batchNumber: string | null;
  startedAt: Date;
  closedAt: Date | null;
}

/**
 * RC-1: a batch matches on its product and on its current number or any earlier one (its first number
 * and every Phase 1 `batch_corrected` old number), case-insensitively. An open match blocks the batch.
 */
export function recallMatches(
  recall: Pick<Recall, "productId" | "batchNumber">,
  batch: {
    productId: string;
    batchNumber: string;
    firstBatchNumber: string;
    earlierNumbers: readonly string[];
  },
): boolean {
  if (recall.productId !== batch.productId) return false;
  if (recall.batchNumber === null) return true;
  const want = recall.batchNumber.toLowerCase();
  return [batch.batchNumber, batch.firstBatchNumber, ...batch.earlierNumbers].some(
    (n) => n.toLowerCase() === want,
  );
}

/** RC-1, SL-14: an open recall blocks a matching batch at once. */
export const blocks = (recall: Recall, batch: Parameters<typeof recallMatches>[1]): boolean =>
  recall.closedAt === null && recallMatches(recall, batch);

export interface SupplyRow {
  patientId: string;
  batchId: string;
  locationId: string;
  at: Date;
  /** Supplied as positive; a reversal as negative. */
  quantity: number;
}

/**
 * RC-2: list 2, exact: every supply of the matched batches net of its reversals, per patient. A patient
 * whose supplies were all reversed is not listed.
 */
export function exactList(
  rows: readonly SupplyRow[],
): { patientId: string; quantity: number; supplies: SupplyRow[] }[] {
  const by = new Map<string, SupplyRow[]>();
  for (const r of rows) by.set(r.patientId, [...(by.get(r.patientId) ?? []), r]);
  return [...by]
    .map(([patientId, supplies]) => ({
      patientId,
      quantity: supplies.reduce((s, r) => s + r.quantity, 0),
      supplies,
    }))
    .filter((p) => p.quantity > 0)
    .sort((a, b) => a.patientId.localeCompare(b.patientId));
}

export interface HoldWindow {
  locationId: string;
  batchId: string;
  source: "ward" | "cart";
  from: Date;
  to: Date;
  /** SL-18: the ward counts one figure per product; recall views say "allocated, not counted". */
  allocated: boolean;
}

/**
 * RC-3: when each ward or cart held a matched batch. A ward's window runs from the batch's first receipt
 * there to the earliest of its balance reaching zero by a count, its quarantine, or the recall's start;
 * where the ward's use is allocated (SL-18) only quarantine or the recall's start end it. A cart's runs
 * from its first restock to the batch's removal (balance zero or quarantine), or the recall's start.
 */
export function holdWindows(input: {
  movements: readonly StoreMovement[];
  locationKind: ReadonlyMap<string, LocationKind>;
  recallStartedAt: Date;
}): HoldWindow[] {
  const groups = new Map<string, StoreMovement[]>();
  for (const m of input.movements) {
    const k = input.locationKind.get(m.pointId);
    if (k !== "ward" && k !== "cart") continue;
    const key = `${m.pointId}|${m.batchId}`;
    groups.set(key, [...(groups.get(key) ?? []), m]);
  }
  const out: HoldWindow[] = [];
  for (const ms of groups.values()) {
    ms.sort((a, b) => a.effectiveAt.getTime() - b.effectiveAt.getTime());
    const first = ms.find((m) => m.kind === "received_from_issue");
    if (!first) continue;
    const source = input.locationKind.get(first.pointId) === "cart" ? "cart" : "ward";
    const allocated = source === "ward" && ms.some((m) => m.allocated);
    let to = input.recallStartedAt;
    let bal = 0;
    for (const m of ms) {
      if (m.effectiveAt >= to) break;
      bal += m.quantity;
      const ends =
        m.kind === "quarantined_out" ||
        (bal <= 0 && (source === "cart" || (!allocated && m.sourceKind === "count")));
      if (ends && m !== first) {
        to = m.effectiveAt;
        break;
      }
    }
    out.push({
      locationId: first.pointId,
      batchId: first.batchId,
      source,
      from: first.effectiveAt,
      to,
      allocated,
    });
  }
  return out;
}

export interface MayHave {
  patientId: string;
  source: "ward" | "cart";
  locationId: string;
  firstAt: Date;
  allocated: boolean;
}

/**
 * RC-3: list 4, "may have received it; the administration record does not name the batch". Patients with
 * an administration of the same medicine (filtered by the caller) charted on a ward, or given from a
 * cart, inside that place's window. Never a patient already on list 2; empty when no ward or cart
 * received the batch.
 */
export function mayHaveList(input: {
  windows: readonly HoldWindow[];
  administrations: readonly { patientId: string; locationId: string; at: Date }[];
  exactPatientIds: ReadonlySet<string>;
}): MayHave[] {
  const seen = new Map<string, MayHave>();
  for (const a of input.administrations) {
    if (input.exactPatientIds.has(a.patientId)) continue;
    const w = input.windows.find(
      (x) => x.locationId === a.locationId && a.at >= x.from && a.at < x.to,
    );
    if (!w) continue;
    const key = `${a.patientId}|${w.locationId}`;
    const prev = seen.get(key);
    if (!prev || a.at < prev.firstAt)
      seen.set(key, {
        patientId: a.patientId,
        source: w.source,
        locationId: w.locationId,
        firstAt: a.at,
        allocated: w.allocated,
      });
  }
  return [...seen.values()].sort(
    (a, b) => a.patientId.localeCompare(b.patientId) || a.locationId.localeCompare(b.locationId),
  );
}

export interface AccountedFor {
  externalIn: { received: number; borrowed: number; loanReturnedIn: number; total: number };
  out: {
    suppliedNet: number;
    wardUsed: number;
    cartUsed: number;
    writtenOff: number;
    returnedToSupplier: number;
    lent: number;
    loanReturnedOut: number;
    adjustedNet: number;
    total: number;
  };
  /** Summed over every location, quarantine included. */
  balance: number;
  /** Non-zero: a number to explain. */
  gap: number;
}

/**
 * RC-4: accounted for = external in (`received` + `borrowed` + `loan_returned_in`) − [supplied net of
 * reversals + `ward_used` + `cart_used` + `written_off` + `returned_to_supplier` + `lent` +
 * `loan_returned_out` + net `adjusted` and `count_correction`] − the balance over every location.
 * Internal transfers cancel. Outs are given as units that left (positive). One formula for 5.7 and the
 * reconciliation print.
 */
export function accountedFor(movements: readonly StoreMovement[]): AccountedFor {
  const sum = (...kinds: StoreMovement["kind"][]) =>
    movements.filter((m) => kinds.includes(m.kind)).reduce((s, m) => s + m.quantity, 0);
  const received = sum("received");
  const borrowed = sum("borrowed");
  const loanReturnedIn = sum("loan_returned_in");
  const o = {
    suppliedNet: 0 - sum("supplied", "reversed"),
    wardUsed: 0 - sum("ward_used"),
    cartUsed: 0 - sum("cart_used"),
    writtenOff: 0 - sum("written_off"),
    returnedToSupplier: 0 - sum("returned_to_supplier"),
    lent: 0 - sum("lent"),
    loanReturnedOut: 0 - sum("loan_returned_out"),
    adjustedNet: 0 - sum("adjusted", "count_correction"),
  };
  const outTotal = Object.values(o).reduce((s, v) => s + v, 0);
  const balance = movements.reduce((s, m) => s + m.quantity, 0);
  const inTotal = received + borrowed + loanReturnedIn;
  return {
    externalIn: { received, borrowed, loanReturnedIn, total: inTotal },
    out: { ...o, total: outTotal },
    balance,
    gap: inTotal - outTotal - balance,
  };
}

/**
 * RC-6: the reconciliation print's figures (the NDA guideline's received, issued, returned, outstanding),
 * from RC-4's terms.
 */
export const reconciliationFigures = (a: AccountedFor) => ({
  received: a.externalIn.total,
  issued: a.out.suppliedNet + a.out.wardUsed + a.out.cartUsed + a.out.lent + a.out.loanReturnedOut,
  returned: a.out.returnedToSupplier,
  writtenOff: a.out.writtenOff,
  adjusted: a.out.adjustedNet,
  outstanding: a.balance,
  gap: a.gap,
});

export type RecallOutcome =
  | "told_by_message"
  | "reached_by_phone"
  | "reached_at_visit"
  | "could_not_reach";

/**
 * RC-5: each patient's recall status is their event list, recorded by a person; the latest event is the
 * status, and a listed patient with none is "not yet contacted".
 */
export function patientStatuses(
  patients: readonly { patientId: string; list: "exact" | "may_have" }[],
  events: readonly {
    patientId: string;
    list: "exact" | "may_have";
    outcome: RecallOutcome;
    at: Date;
  }[],
): {
  patientId: string;
  list: "exact" | "may_have";
  status: RecallOutcome | "not_yet_contacted";
  events: typeof events;
}[] {
  return patients.map((p) => {
    const own = events
      .filter((e) => e.patientId === p.patientId && e.list === p.list)
      .sort((a, b) => a.at.getTime() - b.at.getTime());
    return { ...p, status: own.at(-1)?.outcome ?? "not_yet_contacted", events: own };
  });
}

/**
 * RC-6: closing records the returned and destroyed quantities (whole, not negative); an open recall stays
 * listed until then.
 */
export function closeRefusals(input: {
  closedAt: Date | null;
  returnedQuantity: number | null;
  destroyedQuantity: number | null;
}): ("already_closed" | "quantities_needed")[] {
  if (input.closedAt !== null) return ["already_closed"];
  const ok = (n: number | null) => n !== null && Number.isInteger(n) && n >= 0;
  return ok(input.returnedQuantity) && ok(input.destroyedQuantity) ? [] : ["quantities_needed"];
}

/** RC-6, Law 11: open recalls stay listed. */
export const openRecalls = <R extends Pick<Recall, "closedAt">>(recalls: readonly R[]): R[] =>
  recalls.filter((r) => r.closedAt === null);
