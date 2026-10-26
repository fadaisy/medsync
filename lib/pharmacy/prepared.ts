import type { Batch } from "@/lib/pharmacy/stock/ledger";
import type { RepeatStatus } from "@/lib/prescribing/repeats";

import { expiresOn } from "@/lib/pharmacy/stock/ledger";
import { addDays, fefoOrder } from "@/lib/pharmacy/stores/ledger";

/**
 * Set aside and prepared stock (Pharmacy Phase 4, 6.3: SA-1 to SA-6; Law 8; D-PH4-06 reverses Phase 1 E-PH1-03 for
 * refills only). Pure. Balances are keyed by location, so stock in a `prepared` location is never in its point's
 * availability, stock-out or shelf count (SA-2): it is a different place, and LC-3 gives it no count kind.
 *
 * The pack (Appendix D: hold days, extensions, hold-longer maximum, miss threshold) is the pharmacy in charge's.
 * While it is unsigned (`null`) refills cannot be set aside.
 */

export interface HoldPack {
  holdDays: number;
  extensions: number;
  /** The latest a refill may be held, in days from preparation. */
  holdLongerMaxDays: number;
  missThreshold: number;
}

export interface Leg {
  batchId: string;
  locationId: string;
  kind: "set_aside_out" | "set_aside_in" | "released_out" | "released_in";
  quantity: number;
}

export type SetAsideResult =
  | { ok: true; heldUntil: string; legs: Leg[] }
  | { ok: false; reason: "unsigned" | "invalid_quantity" | "not_enough_in_date" };

/**
 * SA-1: first expiry first, under the caller's locks, from batches that last to the held-until date and are not
 * blocked. One two-leg pair per batch: out of the point, into its `prepared` location.
 */
export function planSetAside(input: {
  pack: HoldPack | null;
  today: string;
  quantity: number;
  pointId: string;
  preparedId: string;
  batches: readonly Batch[];
  /** Each batch's balance at the point. */
  balances: ReadonlyMap<string, number>;
  /** Recalled or quarantined (Phase 2 SL-14). */
  blocked: ReadonlySet<string>;
}): SetAsideResult {
  const { pack, quantity } = input;
  if (!pack) return { ok: false, reason: "unsigned" };
  if (!Number.isInteger(quantity) || quantity <= 0)
    return { ok: false, reason: "invalid_quantity" };
  const heldUntil = addDays(input.today, pack.holdDays);
  const legs: Leg[] = [];
  let left = quantity;
  for (const b of fefoOrder(input.batches)) {
    if (left === 0) break;
    if (input.blocked.has(b.id) || expiresOn(b) < heldUntil) continue;
    const take = Math.min(left, input.balances.get(b.id) ?? 0);
    if (take <= 0) continue;
    legs.push(
      { batchId: b.id, locationId: input.pointId, kind: "set_aside_out", quantity: -take },
      { batchId: b.id, locationId: input.preparedId, kind: "set_aside_in", quantity: take },
    );
    left -= take;
  }
  return left > 0 ? { ok: false, reason: "not_enough_in_date" } : { ok: true, heldUntil, legs };
}

/** Release: every held unit goes back to the shelf, by a person (Law 8). The mirror of the set-aside legs. */
export const releaseLegs = (held: readonly Leg[], pointId: string, preparedId: string): Leg[] =>
  held
    .filter((l) => l.kind === "set_aside_in")
    .flatMap((l) => [
      {
        batchId: l.batchId,
        locationId: preparedId,
        kind: "released_out" as const,
        quantity: -l.quantity,
      },
      {
        batchId: l.batchId,
        locationId: pointId,
        kind: "released_in" as const,
        quantity: l.quantity,
      },
    ]);

export interface Prepared {
  preparedOn: string;
  heldUntil: string;
  extensions: number;
  released: boolean;
}

/** SA-3: held until the date, then listed as not collected; it moves only by a person's Release or Hold longer. */
export const preparedState = (p: Prepared, today: string): "held" | "not_collected" | "released" =>
  p.released ? "released" : today <= p.heldUntil ? "held" : "not_collected";

/** SA-3: Hold longer, once per signed extension, never past the signed maximum. */
export function checkHoldLonger(
  p: Prepared,
  until: string,
  pack: HoldPack | null,
): "unsigned" | "released" | "no_extensions_left" | "past_maximum" | "not_later" | null {
  if (!pack) return "unsigned";
  if (p.released) return "released";
  if (p.extensions >= pack.extensions) return "no_extensions_left";
  if (until <= p.heldUntil) return "not_later";
  if (until > addDays(p.preparedOn, pack.holdLongerMaxDays)) return "past_maximum";
  return null;
}

export type HandOverRefusal =
  | "released"
  | "line_ended"
  | "repeat_not_allowed"
  | "batch_expired"
  | "batch_blocked";

/**
 * SA-4, SA-5, Law 11: the hand-over re-checks, under the instance lock, everything that may have changed since
 * preparation. Past its held-until date it may still be handed over: only a release ends it.
 */
export function handOverRefusals(input: {
  prepared: Prepared;
  today: string;
  /** RP-6 on the current version, read now, not counting this instance. */
  repeat: RepeatStatus["kind"];
  batches: readonly Pick<Batch, "id" | "expiry" | "expiryMonthOnly">[];
  blocked: ReadonlySet<string>;
}): HandOverRefusal[] {
  const out: HandOverRefusal[] = [];
  if (input.prepared.released) out.push("released");
  if (input.repeat === "stopped") out.push("line_ended");
  else if (input.repeat !== "allowed") out.push("repeat_not_allowed");
  if (input.batches.some((b) => expiresOn(b) < input.today)) out.push("batch_expired");
  if (input.batches.some((b) => input.blocked.has(b.id))) out.push("batch_blocked");
  return out;
}

/** SA-5: a recall while held moves the held units to quarantine (`quarantined_out` from `prepared`). */
export const recallLegs = (
  held: ReadonlyMap<string, number>,
  preparedId: string,
  quarantineId: string,
) =>
  [...held]
    .filter(([, q]) => q > 0)
    .flatMap(([batchId, q]) => [
      { batchId, locationId: preparedId, kind: "quarantined_out" as const, quantity: -q },
      { batchId, locationId: quarantineId, kind: "quarantined_in" as const, quantity: q },
    ]);

/** D-PH4-08: the clinic is told when the misses in a row reach the signed threshold. */
export const missesInARow = (outcomes: readonly ("collected" | "not_collected")[]) => {
  let n = 0;
  for (let i = outcomes.length - 1; i >= 0 && outcomes[i] === "not_collected"; i--) n++;
  return n;
};
