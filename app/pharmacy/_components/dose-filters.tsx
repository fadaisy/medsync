"use client";

import { useRouter } from "next/navigation";

import { TabList } from "@/components/medsync/tab-list";
import { PHARMACY } from "@/content/pharmacy";

/** Cart tabs and the period (§5.5). The view is in the URL; a switch reloads the list. */
export function DoseFilters({
  carts,
  cart,
  period,
  controls,
}: {
  carts: { value: string; label: string; count: number }[];
  cart: string;
  period: string;
  controls: string;
}) {
  const router = useRouter();
  const go = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams(window.location.search);
    for (const [k, v] of Object.entries(patch)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    const qs = p.toString();
    router.push(qs ? `?${qs}` : window.location.pathname);
  };
  const E = PHARMACY.emergency;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <TabList
        label={E.cartLabel}
        controls={controls}
        value={cart}
        options={carts}
        onChange={(c) => go({ cart: c === "all" ? null : c })}
      />
      <span className="flex-1" />
      <label className="flex items-center">
        <span className="sr-only">{PHARMACY.queue.periodLabel}</span>
        <select
          value={period}
          onChange={(e) => go({ period: e.target.value === "7d" ? null : e.target.value })}
          className="border-input bg-card text-body-s focus-visible:shadow-focus h-9 min-h-11 rounded-md border px-2 outline-none sm:min-h-9"
        >
          {(["today", "7d", "30d"] as const).map((p) => (
            <option key={p} value={p}>
              {PHARMACY.period[p]}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
