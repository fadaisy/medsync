import type { LocationKind, WardModel } from "./locations";

import { needsOwnGoLive } from "./locations";

/**
 * Going live, per location (Pharmacy Phase 2, 5.12, 6.11: GL2-1). Pure: each condition's state and
 * evidence, computed from records. Switching on and off reuses Phase 1's two-person go-live.
 */

export type ConditionId =
  | "products_set_up"
  | "opening_count"
  | "levels_signed"
  | "cart_list_signed"
  | "in_charge_named"
  | "people_briefed"
  | "downtime_drill"
  | "location_named";

export interface Condition {
  id: ConditionId;
  met: boolean;
  evidence: Record<string, string | number | boolean | null>;
  /** What to do next when not met. */
  action: ConditionId | null;
}

const cond = (id: ConditionId, met: boolean, evidence: Condition["evidence"]): Condition => ({
  id,
  met,
  evidence,
  action: met ? null : id,
});

/**
 * GL2-1, 5.12: a store, ward or cart goes live with its products set up, a blind opening count of every
 * product it holds, its levels (ward) or cart list (cart) signed, its in-charge named and its people
 * briefed; a store also needs a downtime drill that included a delivery and an issue on paper. An
 * issue-only ward needs only to be named (LC-4). Quarantine needs its in-charge named.
 */
export function locationConditions(input: {
  kind: LocationKind;
  model: WardModel | null;
  name: string | null;
  productIds: readonly string[];
  openingCounted: ReadonlySet<string>;
  packSigned: boolean;
  inChargeUserId: string | null;
  briefedAt: Date | null;
  drill: { at: Date; includedDelivery: boolean; includedIssue: boolean } | null;
}): Condition[] {
  if (!needsOwnGoLive(input.kind, input.model))
    return [cond("location_named", !!input.name?.trim(), { name: input.name })];
  const inCharge = cond("in_charge_named", input.inChargeUserId !== null, {
    userId: input.inChargeUserId,
  });
  if (input.kind === "quarantine") return [inCharge];
  const counted = input.productIds.filter((p) => input.openingCounted.has(p)).length;
  const out: Condition[] = [
    cond("products_set_up", input.productIds.length > 0, { products: input.productIds.length }),
    cond("opening_count", input.productIds.length > 0 && counted === input.productIds.length, {
      counted,
      of: input.productIds.length,
    }),
  ];
  if (input.kind === "ward")
    out.push(cond("levels_signed", input.packSigned, { signed: input.packSigned }));
  if (input.kind === "cart")
    out.push(cond("cart_list_signed", input.packSigned, { signed: input.packSigned }));
  out.push(
    inCharge,
    cond("people_briefed", input.briefedAt !== null, {
      at: input.briefedAt?.toISOString() ?? null,
    }),
  );
  if (input.kind === "store")
    out.push(
      cond("downtime_drill", !!input.drill?.includedDelivery && !!input.drill.includedIssue, {
        at: input.drill?.at.toISOString() ?? null,
        delivery: input.drill?.includedDelivery ?? false,
        issue: input.drill?.includedIssue ?? false,
      }),
    );
  return out;
}

/**
 * GL2-1, 5.12: month end goes live per hospital after one full month in which every live location was
 * counted at its start and at its end.
 */
export function monthEndReady(
  months: readonly {
    month: string;
    locations: readonly { id: string; countedAtStart: boolean; countedAtEnd: boolean }[];
  }[],
): { met: boolean; evidence: { month: string | null }; action: "count_a_full_month" | null } {
  const full = months.find(
    (m) => m.locations.length > 0 && m.locations.every((l) => l.countedAtStart && l.countedAtEnd),
  );
  return {
    met: !!full,
    evidence: { month: full?.month ?? null },
    action: full ? null : "count_a_full_month",
  };
}

/**
 * GL2-1, 5.12: ordering goes live after one cycle's proposal was checked against the in-charge's own
 * paper calculation and every difference was explained in writing.
 */
export function orderingReady(
  comparison: { recordedAt: Date; differences: readonly { explanation: string | null }[] } | null,
): {
  met: boolean;
  evidence: { recordedAt: string | null; unexplained: number };
  action: "record_paper_comparison" | "explain_differences" | null;
} {
  if (!comparison)
    return {
      met: false,
      evidence: { recordedAt: null, unexplained: 0 },
      action: "record_paper_comparison",
    };
  const unexplained = comparison.differences.filter((d) => !d.explanation?.trim()).length;
  return {
    met: unexplained === 0,
    evidence: { recordedAt: comparison.recordedAt.toISOString(), unexplained },
    action: unexplained === 0 ? null : "explain_differences",
  };
}
