import type { PillTab } from "@/components/tide/work/space";
import type { LabPlaceId, LabTabDef } from "@/lib/lab/places";

import { LABWS2 } from "@/content/lab-workspace-v2";

/** A place's visible tabs as pill tabs, with optional counts. */
export function pillTabs(
  defs: readonly LabTabDef[],
  place: LabPlaceId,
  counts: Partial<
    Record<string, { count: number | null; attention?: boolean; countLabel?: string }>
  > = {},
): PillTab[] {
  const words = LABWS2.tabs[place] as Record<string, string>;
  return defs.map((d) => ({
    key: d.key,
    label: words[d.key] ?? d.key,
    href: d.href,
    ...counts[d.key],
  }));
}

/** First query value. */
export const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
