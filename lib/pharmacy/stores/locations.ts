import type { MovementKind } from "@/db/schema/pharmacy-dispensing";
import type { LocationKind } from "@/db/schema/pharmacy-stores";

/**
 * Stock locations (Pharmacy Phase 2, 6.1: LC-1 to LC-5; D-PH2-01, D-PH2-05). Pure.
 *
 * LC-1 A location has a kind, a hub unit, a live state, an in-charge and settings (0180
 *      `pharmacy_locations`); Phase 1 points are rows of kind `dispensing_point` under their own id.
 * LC-2 `external` (a supplier or facility, `pharmacy_counterparties`) is a counterparty, never a place:
 *      it has no balance here, so it is not a LocationKind and `allows` never sees it.
 */

export type { LocationKind };
/** D-PH2-05: a ward is stocked or issue-only; nothing defaults (null means not yet set). */
export type WardModel = "stocked" | "issue_only";
export type Direction = "in" | "out";

/** The six columns of LC-3. */
export type Place =
  | "store"
  | "dispensing_point"
  | "ward_stocked"
  | "ward_issue_only"
  | "cart"
  | "quarantine";

/** The way each kind moves stock (0180 `psm_sign`); adjustments and corrections go either way. */
export const DIRECTION: Readonly<Record<MovementKind, Direction | "either">> = {
  received: "in",
  reversed: "in",
  transfer_in: "in",
  received_from_issue: "in",
  returned_in: "in",
  borrowed: "in",
  loan_returned_in: "in",
  quarantined_in: "in",
  supplied: "out",
  transfer_out: "out",
  issued: "out",
  returned_out: "out",
  lent: "out",
  loan_returned_out: "out",
  ward_used: "out",
  cart_used: "out",
  quarantined_out: "out",
  written_off: "out",
  returned_to_supplier: "out",
  adjusted: "either",
  count_correction: "either",
};

const LOANS = ["lent", "borrowed", "loan_returned_out", "loan_returned_in"] as const;

/**
 * LC-3: the kinds each place may take, as data. Direction follows from the kind (`issued` is the out
 * leg, `received_from_issue` the in leg). `counted` is a count record, not a movement kind (gate A): a
 * ward or cart takes `adjusted` but never `count_correction` (WS-3, EC-3); quarantine takes
 * `count_correction` but not `adjusted`. A point's `received` holds "if it receives directly", which is
 * the delivery screen's choice of receiving location, not a kind rule.
 */
export const LC3: Readonly<Record<Place, readonly MovementKind[]>> = {
  store: [
    "received",
    "issued",
    "received_from_issue",
    "returned_in",
    ...LOANS,
    "quarantined_out",
    "adjusted",
    "count_correction",
    "transfer_out",
    "transfer_in",
  ],
  dispensing_point: [
    "received",
    "issued",
    "received_from_issue",
    "returned_out",
    "returned_in",
    ...LOANS,
    "supplied",
    "reversed",
    "quarantined_out",
    "adjusted",
    "count_correction",
    "transfer_out",
    "transfer_in",
  ],
  ward_stocked: ["received_from_issue", "returned_out", "ward_used", "quarantined_out", "adjusted"],
  ward_issue_only: ["received_from_issue"],
  // `issued` out only to another cart (EC-3 "moved to another cart"; decided 21 Oct 2026, see issueAllowed).
  cart: [
    "received_from_issue",
    "issued",
    "returned_out",
    "cart_used",
    "quarantined_out",
    "adjusted",
  ],
  quarantine: [
    "received",
    "quarantined_in",
    "written_off",
    "returned_to_supplier",
    "count_correction",
  ],
};

/** LC-3: the column a location falls in; a ward with no supply model set has none. */
export function placeOf(kind: LocationKind, model: WardModel | null): Place | null {
  if (kind !== "ward") return kind;
  if (model === "stocked") return "ward_stocked";
  if (model === "issue_only") return "ward_issue_only";
  return null;
}

/** LC-3: may a location of this kind (and ward model) take this movement in this direction? */
export function allows(
  kind: LocationKind,
  model: WardModel | null,
  movement: MovementKind,
  direction: Direction,
): boolean {
  const place = placeOf(kind, model);
  if (!place || !LC3[place].includes(movement)) return false;
  const d = DIRECTION[movement];
  return d === "either" || d === direction;
}

/** LC-4: an issue-only ward receives issues that are use, is never counted, and needs no go-live. */
export const isIssueOnlyWard = (kind: LocationKind, model: WardModel | null): boolean =>
  kind === "ward" && model === "issue_only";

/** LC-4: every location is counted except an issue-only ward. */
export const mayBeCounted = (kind: LocationKind, model: WardModel | null): boolean =>
  placeOf(kind, model) !== null && !isIssueOnlyWard(kind, model);

/** LC-4, 5.12: an issue-only ward needs no go-live of its own beyond being named. */
export const needsOwnGoLive = (kind: LocationKind, model: WardModel | null): boolean =>
  !isIssueOnlyWard(kind, model);

/**
 * LC-3 with Law 7: a movement at a location that is not live is refused, except an issue received by
 * an issue-only ward (D-PH2-05).
 */
export function admitsAt(
  location: { kind: LocationKind; model: WardModel | null; live: boolean },
  movement: MovementKind,
  direction: Direction,
): { ok: true } | { ok: false; reason: "not_allowed" | "not_live" } {
  if (!allows(location.kind, location.model, movement, direction))
    return { ok: false, reason: "not_allowed" };
  if (location.live) return { ok: true };
  if (isIssueOnlyWard(location.kind, location.model) && movement === "received_from_issue")
    return { ok: true };
  return { ok: false, reason: "not_live" };
}

const INTERNAL_PLACES: ReadonlySet<LocationKind> = new Set([
  "store",
  "dispensing_point",
  "quarantine",
]);

/**
 * LC-5: issues between store, dispensing points and quarantine, and Phase 1 transfers, are internal
 * transfers, by one rule; neither is consumption. An issue to a ward or cart is not internal.
 */
export function isInternalTransfer(
  kind: MovementKind,
  from: LocationKind,
  to: LocationKind,
): boolean {
  if (kind === "transfer_out" || kind === "transfer_in") return true;
  if (kind !== "issued" && kind !== "received_from_issue") return false;
  return INTERNAL_PLACES.has(from) && INTERNAL_PLACES.has(to);
}

/** EC-3 over LC-3 (decided 21 Oct 2026): a cart issues out only to another cart; everything else as LC-3. */
export const issueAllowed = (from: LocationKind, to: LocationKind): boolean =>
  from !== "cart" || to === "cart";
