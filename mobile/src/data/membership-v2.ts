/**
 * Membership and Plus on the phone, v2 (Step 10). Reads under RLS (0300): the patient's membership row and the
 * approved prices. Writes through `pt-plus` (trial, pay in the sandbox) and `pt-medical-id-token` (the QR).
 * Fails soft: before 0300 the Me tab shows Basic and no plans.
 */
import type { MembershipRow, PriceRow } from "@patient-core/membership";
import type { Network, PromptView } from "@patient-core/payments";

async function db() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return (require("@/lib/supabase") as typeof import("@/lib/supabase")).supabase;
}
function edge() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return (require("@/lib/edge") as typeof import("@/lib/edge")).callEdge;
}

export async function loadMembership(): Promise<{ row: MembershipRow | null; prices: PriceRow[] }> {
  try {
    const sb = await db();
    const [m, p] = await Promise.all([
      sb.from("memberships").select("tier, period, status, trial_ends_at, period_ends_at, trial_used").maybeSingle(),
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
  } catch {
    return { row: null, prices: [] };
  }
}

export async function startTrial(tier: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const r = await edge()("pt-plus", { action: "trial", tier });
  return r.ok ? { ok: true } : { ok: false, error: r.error };
}

export async function payPlus(input: {
  tier: string;
  period: "monthly" | "yearly";
  network: Network;
  msisdn: string;
  idempotencyKey: string;
}): Promise<{ ok: true; view: PromptView } | { ok: false; error: string }> {
  const r = await edge()<{ view: PromptView }>("pt-plus", { action: "pay", ...input });
  return r.ok ? { ok: true, view: r.data.view } : { ok: false, error: r.error };
}

export async function medicalIdToken(): Promise<{ ok: true; modules: string[]; expiresAt: string } | { ok: false }> {
  const r = await edge()<{ modules: string[]; expiresAt: string }>("pt-medical-id-token", {});
  return r.ok ? { ok: true, modules: r.data.modules, expiresAt: r.data.expiresAt } : { ok: false };
}
