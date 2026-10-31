/**
 * Losses in UGX and stock that will expire before it is used (rework PRD §6.6, prototype audit.js `losses`, `atRisk`,
 * `causeOf`), ported logic for logic. Pure: plain rows in, plain rows out.
 */
export type LossCause =
  | "expired"
  | "opened_vial"
  | "cold_chain"
  | "damaged"
  | "unexplained"
  | "recall";
export const CAUSES: readonly LossCause[] = [
  "expired",
  "opened_vial",
  "cold_chain",
  "damaged",
  "unexplained",
  "recall",
];

/** A loss movement from the ledger: quantity is positive (what left), price is UGX per issue unit. */
export interface LossMovement {
  id: string;
  at: string;
  placeId: string | null;
  place: string | null;
  productId: string;
  product: string;
  unit: string;
  batchNumber: string;
  qty: number;
  reasonCode: string | null;
  reasonNote: string | null;
  who: string | null;
  unitPrice: number;
}

export interface LossLine {
  at: string;
  placeId: string | null;
  place: string | null;
  productId: string | null;
  product: string;
  unit: string;
  batchNumber: string | null;
  qty: number;
  cause: LossCause;
  note: string | null;
  who: string | null;
  value: number;
  epi: boolean;
  movementId: string | null;
}

/** The cause from the reason code first, then the note (prototype `causeOf`). */
export function causeOf(reasonCode: string | null, note: string | null): LossCause {
  const t = `${reasonCode ?? ""} ${note ?? ""}`.toLowerCase().replace(/_/g, " ");
  if (/expir/.test(t)) return "expired";
  if (/vvm|froze|freez|heat|cold|°c/.test(t)) return "cold_chain";
  if (/opened vial|opened/.test(t)) return "opened_vial";
  if (/broken|damag|dropped/.test(t)) return "damaged";
  if (/recall/.test(t)) return "recall";
  return "unexplained";
}

/**
 * Every loss line (safety test 10): the ledger's loss movements, one function. The immunisation clinic's opened-vial
 * wastage is a ledger line too (`adjusted`, reason `wastage:opened_vial`), so it is counted here and only here.
 */
export function losses(moves: readonly LossMovement[]): LossLine[] {
  return moves.map((m) => {
    const cause = causeOf(m.reasonCode, m.reasonNote);
    return {
      at: m.at,
      placeId: m.placeId,
      place: m.place,
      productId: m.productId,
      product: m.product,
      unit: m.unit,
      batchNumber: m.batchNumber,
      qty: m.qty,
      cause,
      note: m.reasonNote,
      who: m.who,
      value: m.qty * m.unitPrice,
      epi: cause === "opened_vial",
      movementId: m.id,
    };
  });
}

export const totalOf = (lines: readonly { value: number }[]) =>
  lines.reduce((a, l) => a + l.value, 0);

/** Single-series bars, largest first, zeros dropped. */
export function sumBy<K extends string>(
  lines: readonly LossLine[],
  key: (l: LossLine) => K | null,
) {
  const m = new Map<K, number>();
  for (const l of lines) {
    const k = key(l);
    if (k !== null) m.set(k, (m.get(k) ?? 0) + l.value);
  }
  return [...m]
    .map(([k, v]) => ({ k, v }))
    .filter((x) => x.v > 0)
    .sort((a, b) => b.v - a.v);
}

/** `YYYY-MM` of an ISO time in Kampala (UTC+3, no daylight saving). */
export const monthOf = (iso: string) =>
  new Date(new Date(iso).getTime() + 3 * 3_600_000).toISOString().slice(0, 7);

/** The last `n` months up to `now`'s month, each with its loss value. */
export function byMonth(lines: readonly LossLine[], nowIso: string, n: number) {
  const [y, m] = monthOf(nowIso).split("-").map(Number) as [number, number];
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 - (n - 1 - i), 1));
    const k = d.toISOString().slice(0, 7);
    return { k, v: totalOf(lines.filter((l) => monthOf(l.at) === k)) };
  });
}

/* ─── Will expire before it's used (prototype `atRisk`) ─── */

export interface RiskBatch {
  productId: string;
  product: string;
  unit: string;
  batchNumber: string;
  /** The last day it may be used, `YYYY-MM-DD`. */
  expires: string;
  recalled: boolean;
  have: number;
  /** Average monthly consumption of the medicine. */
  amc: number;
  unitPrice: number;
  places: { place: string; n: number }[];
  done: { action: string; by: string | null; at: string }[];
}

export interface RiskLine extends RiskBatch {
  months: number;
  waste: number;
  value: number;
}

/** Whole calendar months from `today` to the expiry (prototype `monthsTo`); 0 or less is expired. */
export function monthsTo(expires: string, today: string): number {
  const [ey, em] = expires.split("-").map(Number) as [number, number];
  const [ty, tm] = today.split("-").map(Number) as [number, number];
  return ey * 12 + em - (ty * 12 + tm);
}

/**
 * Earliest expiry is used first: a batch can use `AMC × months to expiry − what earlier batches hold`; the rest will
 * expire on the shelf. Batches more than `horizon` months out are counted as used before, never listed.
 */
export function atRisk(batches: readonly RiskBatch[], today: string, horizon: number): RiskLine[] {
  const out: RiskLine[] = [];
  const byProduct = new Map<string, RiskBatch[]>();
  for (const b of batches) {
    if (b.recalled || b.expires < today || b.have <= 0) continue;
    byProduct.set(b.productId, [...(byProduct.get(b.productId) ?? []), b]);
  }
  for (const list of byProduct.values()) {
    let usedBefore = 0;
    for (const b of [...list].sort((a, c) => (a.expires < c.expires ? -1 : 1))) {
      const months = Math.max(0, monthsTo(b.expires, today));
      if (months > horizon) {
        usedBefore += b.have;
        continue;
      }
      const canUse = Math.max(0, b.amc * months - usedBefore);
      const waste = Math.max(0, Math.round(b.have - canUse));
      usedBefore += b.have;
      out.push({ ...b, months, waste, value: waste * b.unitPrice });
    }
  }
  return out.sort((a, b) => b.value - a.value);
}
