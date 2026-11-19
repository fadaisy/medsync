import type { Charge } from "@/lib/lab/prices";
import type { Costs } from "@/lib/patient-web/costs";

import { fill } from "@/content/lab-workspace-v2";
import { PATIENT_PRICES } from "@/content/patient-prices";
import { ugxWords } from "@/lib/lab/prices";

/** One price in words: the amount, "Free", or to ask at the hospital. Never a zero (ADR 0527). */
export function ChargeWords({ charge }: { charge: Charge }) {
  if (charge.kind === "priced")
    return <span className="font-pw-mono text-[15px] font-semibold">{ugxWords(charge.ugx)}</span>;
  return (
    <span className="text-pw-ink-2 text-[13px] font-medium">
      {charge.kind === "free" ? PATIENT_PRICES.free : PATIENT_PRICES.notSet}
    </span>
  );
}

/** The total line under a list of prices: partial when something has no price, and where to pay. */
export function CostTotal({
  costs,
  total,
  partial,
}: {
  costs: Costs;
  /** "Total for these tests". */
  total: string;
  /** "Total so far. {n} not priced yet…". */
  partial: string;
}) {
  return (
    <div className="border-pw-surface-3 flex flex-col gap-1 border-t px-4 py-3">
      {costs.hasTotal ? (
        <p className="flex items-baseline justify-between gap-3">
          <span className="text-[15px] font-semibold">
            {costs.notSet ? fill(partial, { n: costs.notSet }) : total}
          </span>
          <span className="font-pw-mono text-[17px] font-semibold">{ugxWords(costs.totalUgx)}</span>
        </p>
      ) : null}
      <p className="text-pw-ink-2 text-[13px] font-medium">{PATIENT_PRICES.payThere}</p>
    </div>
  );
}
