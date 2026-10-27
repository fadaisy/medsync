/**
 * Distribution checks, pure (catalogue slice Step 10; ADRs 0463–0465). A pick, a ward-use comparison and a cart
 * signal each check stock; none writes a movement (S43). Words are draft copy (content/pharmacy-catalogue.ts).
 */
import { CATALOGUE as C } from "@/content/pharmacy-catalogue";

export interface PickProduct {
  productId: string;
  name: string;
  strength: string | null;
}

export type PickResult =
  | { kind: "ok"; later: boolean }
  | { kind: "refused"; words: string }
  | { kind: "later_batch"; words: string };

const label = (p: PickProduct) => [p.name, p.strength].filter(Boolean).join(" ");

/**
 * S38: the pack scanned for a line. Another product, another strength included, is refused in words naming both;
 * a batch that expires after the planned first-to-expire needs the coded reason (D-CAT-15 keeps the existing list).
 */
export function pickCheck(input: {
  line: PickProduct;
  scanned: PickProduct | null;
  batch: { id: string; batchNumber: string; expiry: string } | null;
  /** The plan's batches, first to expire first. */
  planned: readonly { batchId: string; batchNumber: string; expiry: string }[];
  laterReason: string | null;
}): PickResult {
  const { line, scanned } = input;
  if (!scanned) return { kind: "refused", words: C.pickNoCode };
  if (scanned.productId !== line.productId)
    return { kind: "refused", words: C.pickWrongProduct(label(scanned), label(line)) };
  const first = input.planned[0];
  if (!input.batch || !first || input.planned.some((p) => p.batchId === input.batch!.id))
    return { kind: "ok", later: false };
  if (input.batch.expiry <= first.expiry) return { kind: "ok", later: false };
  if (input.laterReason?.trim()) return { kind: "ok", later: true };
  return {
    kind: "later_batch",
    words: C.pickLaterBatch(input.batch.batchNumber, input.batch.expiry, first.batchNumber),
  };
}

/** "Issue {n} lines" stays disabled, with its reason, while a line with a quantity has no pick (S38, S39). */
export function pickProblems(
  lines: readonly { lineId: string; name: string; quantity: number }[],
  picked: ReadonlySet<string>,
): { lineId: string; words: string }[] {
  return lines
    .filter((l) => l.quantity > 0 && !picked.has(l.lineId))
    .map((l) => ({ lineId: l.lineId, words: C.pickUnpicked(l.name) }));
}

export interface UseRow {
  productId: string;
  name: string;
  /** Used between the last two counts (the count's `ward_used`). */
  used: number;
  /** Doses charted from ward stock in the same days; null when nothing records a ward-stock source. */
  charted: number | null;
  /** The signed gap reason given for this count, if any. */
  reason: string | null;
}
export type Compared =
  | { kind: "match"; words: string }
  | { kind: "not_charted"; words: string }
  | { kind: "explained"; gap: number; words: string }
  | { kind: "gap"; gap: number; words: string };

/**
 * S41: counted use against charted doses. Equal reads "Matches the charts"; a gap with no reason reads in amber and
 * sends one item to the nurse in charge (law 16); with a reason it reads as explained; a product with no charted
 * source reads "Not charted from ward stock", never a gap.
 */
export function wardUseCheck<R extends UseRow>(
  rows: readonly R[],
  inChargeUserId: string | null,
): {
  rows: (R & { compared: Compared })[];
  notify: { userId: string; productId: string; words: string }[];
} {
  const notify: { userId: string; productId: string; words: string }[] = [];
  const out = rows.map((r) => {
    let compared: Compared;
    if (r.charted === null) compared = { kind: "not_charted", words: C.wardNotCharted };
    else if (r.used === r.charted) compared = { kind: "match", words: C.wardMatch };
    else {
      const gap = r.used - r.charted;
      const n = Math.abs(gap);
      if (r.reason)
        compared = {
          kind: "explained",
          gap,
          words: gap > 0 ? C.wardMore(n) : C.wardFewer(n),
        };
      else {
        compared = {
          kind: "gap",
          gap,
          words: gap > 0 ? C.wardGap(n) : C.wardFewer(n),
        };
        if (inChargeUserId)
          notify.push({
            userId: inChargeUserId,
            productId: r.productId,
            words: C.wardGapNotify(r.name, compared.words),
          });
      }
    }
    return { ...r, compared };
  });
  return { rows: out, notify };
}

export interface CartSignal {
  due: boolean;
  why: ("seal_broken" | "resus_dose")[];
}

/**
 * S42: a seal reported broken, or a resus dose recorded from the cart, since its last check puts the cart on the
 * check list. Read on each load, so the list changes within one refresh.
 */
export function cartSignals(input: {
  lastCheckAt: Date | null;
  seals: readonly { kind: "applied" | "broken"; at: Date }[];
  resusDoses: readonly { at: Date }[];
}): CartSignal {
  const after = (at: Date) => !input.lastCheckAt || at > input.lastCheckAt;
  const lastSeal = [...input.seals].sort((a, b) => +b.at - +a.at)[0];
  const why: CartSignal["why"] = [];
  if (lastSeal?.kind === "broken" && after(lastSeal.at)) why.push("seal_broken");
  if (input.resusDoses.some((d) => after(d.at))) why.push("resus_dose");
  return { due: why.length > 0, why };
}

/** S42: a cart-check gap on a medicine given from that cart in a resus since the last check is explained by it. */
export function explainCartGaps<G extends { medicineKey: string; gap: number }>(
  gaps: readonly G[],
  resusDoses: readonly { medicineKey: string }[],
): (G & { byResus: number })[] {
  const given = new Map<string, number>();
  for (const d of resusDoses) given.set(d.medicineKey, (given.get(d.medicineKey) ?? 0) + 1);
  return gaps.map((g) => ({
    ...g,
    byResus: Math.min(Math.max(-g.gap, 0), given.get(g.medicineKey) ?? 0),
  }));
}

export type NextStep = keyof typeof C.map.next;

/** S46: the one next step for a place, from the fixed list, by its state (most urgent first). */
export function nextStep(p: {
  kind: string;
  sealBroken: boolean;
  cartDue: boolean;
  overdueIssues: number;
  stale: boolean;
  out: number;
  expiring: number;
  held: number;
}): NextStep {
  if (p.sealBroken) return "seal";
  if (p.cartDue) return "cartDue";
  if (p.overdueIssues > 0) return "confirm";
  if (p.kind === "quarantine" && p.held > 0) return "quarantine";
  if (p.stale) return "count";
  if (p.out > 0) return "out";
  if (p.expiring > 0) return "expiring";
  return "none";
}

export type MovementGroup = "arrived" | "between" | "patients" | "wards" | "losses";

/** 4.15: the trace's filters, each movement kind in one group. */
export const MOVEMENT_GROUP: Record<string, MovementGroup> = {
  received: "arrived",
  borrowed: "arrived",
  loan_returned_in: "arrived",
  supplied: "patients",
  reversed: "patients",
  ward_used: "wards",
  cart_used: "wards",
  written_off: "losses",
  returned_to_supplier: "losses",
  adjusted: "losses",
  count_correction: "losses",
};
export const groupOf = (kind: string): MovementGroup => MOVEMENT_GROUP[kind] ?? "between";
