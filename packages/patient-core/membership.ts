/**
 * Tether Plus and the membership card, the same on the phone and the web (patient app v2 §5.9, M10, M11).
 * Pure. Prices come only from the server's approved rows (D-MR-10): the apps hold no number. The tier a person
 * has right now follows the server's rule: a trial counts until it ends, a paid period until it ends, else Basic.
 * Plus never buys care (MR9): nothing here decides what is safe to show.
 */
export type Tier = "basic" | "plus_family" | "plus_care" | "family_care";
export type PlusTier = Exclude<Tier, "basic">;
export type Period = "monthly" | "quarterly" | "yearly";

export interface MembershipRow {
  tier: Tier;
  period: Period | null;
  status: "trial" | "active" | "lapsed" | "cancelled";
  trialEndsAtIso: string | null;
  periodEndsAtIso: string | null;
  trialUsed: boolean;
}

export interface PriceRow {
  tier: PlusTier;
  period: Period;
  amountUgx: number;
  effectiveFrom: string;
}

/** What the person has now; a trial or period that has run out reads Basic before the nightly lapse runs. */
export function tierNow(
  m: MembershipRow | null,
  now: Date,
): { tier: Tier; trial: boolean; endsIso: string | null } {
  if (!m || m.tier === "basic") return { tier: "basic", trial: false, endsIso: null };
  if (m.status === "trial" && m.trialEndsAtIso && new Date(m.trialEndsAtIso) > now)
    return { tier: m.tier, trial: true, endsIso: m.trialEndsAtIso };
  if (m.status === "active" && m.periodEndsAtIso && new Date(m.periodEndsAtIso) > now)
    return { tier: m.tier, trial: false, endsIso: m.periodEndsAtIso };
  return { tier: "basic", trial: false, endsIso: null };
}

export interface Plan {
  tier: PlusTier;
  monthlyUgx: number;
  quarterlyUgx: number | null;
  yearlyUgx: number | null;
}

/** One plan per tier from the newest approved price in force for each period; a tier with no monthly price is not offered. */
export function plansFrom(prices: PriceRow[], today: string): Plan[] {
  const pick = (tier: PlusTier, period: Period) =>
    prices
      .filter((p) => p.tier === tier && p.period === period && p.effectiveFrom <= today)
      .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0]?.amountUgx ?? null;
  return (["plus_family", "plus_care", "family_care"] as const).flatMap((tier) => {
    const monthly = pick(tier, "monthly");
    return monthly === null
      ? []
      : [
          {
            tier,
            monthlyUgx: monthly,
            quarterlyUgx: pick(tier, "quarterly"),
            yearlyUgx: pick(tier, "yearly"),
          },
        ];
  });
}

/**
 * The member number on the card: the patient's own MedSync ID, whole, in its own groups ("MS-2026-00035" reads
 * "MS 2026 00035", the same as the health card). A code with no separators is grouped in threes. Never cut short:
 * the last digits are what tell two members apart.
 */
export function memberNumber(code: string | null): string {
  if (!code) return "—";
  const groups = code
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter(Boolean);
  if (groups.length > 1) return groups.join(" ");
  return (groups[0] ?? "").match(/.{1,3}/g)?.join(" ") ?? "—";
}
