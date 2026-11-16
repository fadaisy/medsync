/**
 * Care programme and Plus pricing (docs/patient-app/business-model.md; ADR 0519). ZERO imports: the Next app,
 * the Edge Functions and the phone (through packages/patient-core/care-pricing.ts) share this one copy.
 *
 * A programme is priced from its team: each role costs its monthly pay divided by the patients it can follow,
 * plus Tether's platform cost per member. The price covers that cost, the collection fee and a margin:
 *
 *     monthly price = cost ÷ (1 − margin − collection fee), rounded up to the next UGX 1,000
 *
 * The hospital employs the team and receives the fee; Tether's share is paid by the provider's split at
 * settlement (ADR 0516). Programmes are named by condition and team, never by rank (UMDPC 2019 §4, §5(d)).
 * Safety is never priced: danger alerts, Help, results and the plan work whether or not a fee is paid (MR9 as
 * amended, pending the CSO's signature).
 */

export type CareRole =
  | "nurse"
  | "medical_officer"
  | "specialist"
  | "nutritionist"
  | "counsellor"
  | "pharmacist"
  | "physiotherapist"
  | "vht";

export const ROLE_WORDS: Record<CareRole, string> = {
  nurse: "Nurse",
  medical_officer: "Medical officer",
  specialist: "Specialist physician",
  nutritionist: "Nutritionist",
  counsellor: "Counsellor",
  pharmacist: "Pharmacist",
  physiotherapist: "Physiotherapist",
  vht: "Village health team worker",
};

/** One role on a programme's team: what it costs the hospital a month, and how many members it follows. */
export interface TeamRole {
  role: CareRole;
  monthlyCostUgx: number;
  caseload: number;
}

export type Period = "monthly" | "quarterly" | "yearly";

export interface PricingInputs {
  team: TeamRole[];
  /** Tether's own cost per member a month: texts, hosting, support. */
  platformCostUgx: number;
  /** The hospital's margin after paying its team, 0 to 0.6. */
  margin: number;
  /** The provider's collection fee as a share of the price, 0 to 0.1. */
  collectionRate: number;
}

const roundUp = (n: number, to: number) => Math.ceil(n / to) * to;

/** What one member costs a month, before margin and fees. */
export function costPerMember(team: TeamRole[], platformCostUgx: number): number {
  let cost = platformCostUgx;
  for (const r of team) {
    if (r.caseload <= 0 || r.monthlyCostUgx < 0) throw new Error(`bad role ${r.role}`);
    cost += r.monthlyCostUgx / r.caseload;
  }
  return Math.round(cost);
}

/** The monthly price, rounded up to the next UGX 1,000. */
export function monthlyPrice(p: PricingInputs): number {
  if (p.margin < 0 || p.margin > 0.6) throw new Error("margin out of range");
  if (p.collectionRate < 0 || p.collectionRate > 0.1)
    throw new Error("collection rate out of range");
  return roundUp(
    costPerMember(p.team, p.platformCostUgx) / (1 - p.margin - p.collectionRate),
    1000,
  );
}

/** A longer period: a quarter is 3 months less 5%; a year costs 10 months (business model §4). */
export function periodPrice(monthly: number, period: Period): number {
  if (period === "monthly") return monthly;
  if (period === "quarterly") return Math.round(monthly * 3 * 0.95);
  return monthly * 10;
}

/** How many months a period buys. */
export const PERIOD_MONTHS: Record<Period, number> = { monthly: 1, quarterly: 3, yearly: 12 };

/**
 * Tether's platform share of a programme fee: UGX 9,000 a member-month or 20% of the fee after the collection
 * fee, whichever is higher, never more than half the fee (business model §1).
 */
export function tetherShare(feeUgx: number, collectionRate: number, months: number): number {
  const afterFee = feeUgx * (1 - collectionRate);
  const share = Math.max(9000 * months, Math.round(afterFee * 0.2));
  return Math.min(share, Math.floor(feeUgx / 2));
}

/** Names that rank a programme are refused (UMDPC: never imply better care). */
export function programmeNameAllowed(name: string): boolean {
  return !/\b(premium|gold|silver|platinum|vip|elite|best|superior|executive|deluxe)\b/i.test(name);
}
