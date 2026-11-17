import "server-only";

import type { MembershipRow, PriceRow } from "@patient-core/membership";

import { createClient } from "@/lib/supabase/server";

/** The patient's membership row and the approved Plus prices, under RLS (0300). Fails soft to none. */
export async function loadMembership(): Promise<{ row: MembershipRow | null; prices: PriceRow[] }> {
  const sb = await createClient();
  const [m, p] = await Promise.all([
    sb
      .from("memberships")
      .select("tier, period, status, trial_ends_at, period_ends_at, trial_used")
      .maybeSingle(),
    sb.from("plus_prices").select("tier, period, amount_ugx, effective_from"),
  ]);
  const r = m.data as Record<string, unknown> | null;
  return {
    row: r
      ? {
          tier: r.tier as MembershipRow["tier"],
          period: (r.period as MembershipRow["period"]) ?? null,
          status: r.status as MembershipRow["status"],
          trialEndsAtIso: (r.trial_ends_at as string | null) ?? null,
          periodEndsAtIso: (r.period_ends_at as string | null) ?? null,
          trialUsed: Boolean(r.trial_used),
        }
      : null,
    prices: ((p.data ?? []) as Record<string, unknown>[]).map((x) => ({
      tier: x.tier as PriceRow["tier"],
      period: x.period as PriceRow["period"],
      amountUgx: x.amount_ugx as number,
      effectiveFrom: x.effective_from as string,
    })),
  };
}
