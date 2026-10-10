/**
 * Emergency doses by cart (Pharmacy Phase 0, ADR 0235; ED-1..ED-5, D-PH0-13). Every dose given on
 * the resus desk is a `resus_timeline_events` row of kind `drug` (migration 0038):
 *   - a grab-and-give dose (recordEmergencyAdministration) carries `payload.prescribing` with the
 *     medicine, dose and route as recorded, the cart as typed, the giver and any witness;
 *   - a protocol dose from an ABCDE step carries a `label` and a `state`; it counts once performed.
 * The table 0039 meant for these (`emergency_administrations`) is empty: nothing writes it. A
 * corrected event is replaced by the event that supersedes it. No stock figure is read (ED-5).
 */

export interface TimelineDrugEvent {
  id: string;
  episodeId: string;
  recordedAt: Date;
  recordedByUserId: string | null;
  payload: Record<string, unknown>;
  supersedesEventId: string | null;
}

export interface DoseRow {
  id: string;
  givenAt: Date;
  episodeId: string;
  /** Null when the episode has no identified patient (ED-3). */
  patientUserId: string | null;
  medicine: string;
  /** As recorded, character for character, or null when nothing was recorded (Law 5). */
  dose: string | null;
  route: string | null;
  /** The cart as typed; null is "No cart" (ED-2). */
  cart: string | null;
  givenByUserId: string | null;
  controlled: boolean;
  /** A witness who is a user, a name typed at the bedside, or none. The name is never shown. */
  witness: { userId: string } | "typed" | null;
}

const text = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);

export function toDoseRow(
  e: TimelineDrugEvent,
  patientOf: ReadonlyMap<string, string | null>,
): DoseRow | null {
  const rx = e.payload.prescribing as Record<string, unknown> | undefined;
  const base = {
    id: e.id,
    givenAt: e.recordedAt,
    episodeId: e.episodeId,
    patientUserId: patientOf.get(e.episodeId) ?? null,
  };
  if (rx && typeof rx === "object") {
    const witnessId = text(rx.witnessUserId);
    return {
      ...base,
      medicine: text(rx.drugName) ?? "Medicine not recorded",
      dose: text(rx.dose),
      route: text(rx.route),
      cart: text(rx.cart),
      givenByUserId: text(rx.giverUserId) ?? e.recordedByUserId,
      controlled: rx.controlled === true,
      witness: witnessId ? { userId: witnessId } : text(rx.witnessName) ? "typed" : null,
    };
  }
  // A protocol dose: only once performed (indicated and in-progress were not given).
  if (e.payload.state !== "performed") return null;
  return {
    ...base,
    medicine: text(e.payload.label) ?? "Medicine not recorded",
    dose: null,
    route: null,
    cart: null,
    givenByUserId: e.recordedByUserId,
    controlled: false,
    witness: null,
  };
}

export const NO_CART = "__no_cart__";

export interface DosesResult {
  rows: DoseRow[];
  /** Cart → count, "No cart" under NO_CART; they sum to `total` (ED-4). */
  cartCounts: Map<string, number>;
  total: number;
}

export function computeDoses(input: {
  events: readonly TimelineDrugEvent[];
  patientOf: ReadonlyMap<string, string | null>;
  cart: string | "all";
}): DosesResult {
  const superseded = new Set(input.events.map((e) => e.supersedesEventId).filter(Boolean));
  const all = input.events
    .filter((e) => !superseded.has(e.id))
    .map((e) => toDoseRow(e, input.patientOf))
    .filter((r): r is DoseRow => r !== null)
    .sort((a, b) => b.givenAt.getTime() - a.givenAt.getTime() || a.id.localeCompare(b.id));
  const cartCounts = new Map<string, number>();
  for (const r of all) {
    const k = r.cart ?? NO_CART;
    cartCounts.set(k, (cartCounts.get(k) ?? 0) + 1);
  }
  const rows = input.cart === "all" ? all : all.filter((r) => (r.cart ?? NO_CART) === input.cart);
  return { rows, cartCounts, total: all.length };
}
