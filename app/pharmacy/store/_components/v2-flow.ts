import type { FlowStep } from "../../_components/v2/pieces";
import { fill } from "@/content/pharmacy-workspace-v2";
import { PHWS2_STORE } from "@/content/pharmacy-workspace-v2-store";

const F = PHWS2_STORE.flow;
const WEEK_MS = 7 * 86_400_000;

/** Store tabs, in v2.tabs order (GATE A §3). */
export const STORE_TABS = [
  "deliveries",
  "issues",
  "wards",
  "carts",
  "expiry",
  "orders",
  "monthEnd",
  "map",
] as const;
export type StoreTab = (typeof STORE_TABS)[number];

/**
 * The tab to show (the Month end form carries `tab=monthEnd` itself). A tab the viewer lacks falls back to their
 * first store tab.
 */
export function storeTab(
  sp: Record<string, string | string[] | undefined>,
  has: (key: StoreTab) => boolean,
): StoreTab | null {
  const asked = typeof sp.tab === "string" ? sp.tab : undefined;
  const wanted: StoreTab | undefined =
    STORE_TABS.find((t) => t === asked);
  if (wanted && has(wanted)) return wanted;
  return STORE_TABS.find(has) ?? null;
}

/** What the existing loaders returned; null = that tab is not the viewer's (flag off or no permission). */
export interface FlowInput {
  deliveries: readonly { state: string; arrivedAt: Date }[] | null;
  issues: {
    requisitions: readonly { state: string }[];
    toConfirm: readonly unknown[];
    places: readonly { kind: string }[];
  } | null;
  wards: readonly { supplyModel: string | null }[] | null;
  /** `overdue` is getCartsPage's own field (past the signed check interval). */
  carts: readonly { overdue: boolean }[] | null;
  now: Date;
}

const href = (tab: StoreTab, on: boolean) => (on ? `/pharmacy/store?tab=${tab}` : undefined);

/**
 * The flow strip (board Store, data-sources §Today "Medicines flow"): suppliers → stores → dispensing points → wards
 * → carts. Counts only from the loaders' rows; the one amber note is the carts engine's `overdue`.
 */
export function storeFlow(i: FlowInput): FlowStep[] {
  const week = i.now.getTime() - WEEK_MS;
  const recent = i.deliveries?.filter((d) => d.arrivedAt.getTime() >= week).length ?? null;
  const counting = i.deliveries?.filter((d) => d.state === "counting").length ?? 0;
  const toConfirm = i.issues?.toConfirm.length ?? 0;
  const keep = i.wards?.filter((w) => w.supplyModel === "stocked").length ?? 0;
  const overdue = i.carts?.filter((c) => c.overdue).length ?? 0;
  return [
    {
      label: F.suppliers,
      n: recent,
      href: href("deliveries", !!i.deliveries),
      sub: i.deliveries ? [F.deliveriesWeek, ...(counting ? [fill(F.counting, { n: counting })] : [])] : [],
    },
    {
      label: F.stores,
      n: i.issues ? i.issues.requisitions.filter((r) => r.state === "raised").length : null,
      href: href("issues", !!i.issues),
      sub: i.issues ? [F.toIssue] : [],
    },
    {
      label: F.points,
      n: i.issues ? i.issues.places.filter((p) => p.kind === "dispensing_point").length : null,
      href: href("issues", !!i.issues),
      sub: i.issues ? [F.live, ...(toConfirm ? [fill(F.toConfirm, { n: toConfirm })] : [])] : [],
    },
    {
      label: F.wards,
      n: i.wards?.length ?? null,
      href: href("wards", !!i.wards),
      sub: i.wards ? [fill(F.keepStock, { n: keep })] : [],
    },
    {
      label: F.carts,
      n: i.carts?.length ?? null,
      href: href("carts", !!i.carts),
      sub: i.carts ? [F.cartsSub] : [],
      notes: overdue ? [fill(F.overdue, { n: overdue })] : [],
    },
  ];
}
