import type { LabPermission } from "./access";
import type { LabNavFlags, LabNavId } from "./nav";

import { navFor } from "./nav";

/**
 * Lab Workspace v2 (prompt 5.1, D-UI-03): six places in the rail, tabs inside each. Visibility is not decided
 * again here: a tab is shown exactly when one of the registered nav items it replaces (`from`) is visible to
 * the viewer under `visibleFor(perms, flags)` (lib/lab/nav.ts). A place is shown when one of its tabs is.
 * Labels live in content/lab-workspace-v2.ts (`LABWS2.tabs`).
 */
export type LabPlaceId = "today" | "bench" | "send_outs" | "quality" | "reports" | "setup";

export interface LabTabDef {
  place: LabPlaceId;
  /** The `?tab=` key (or a path segment for the bench and set-up). */
  key: string;
  href: string;
  from: readonly LabNavId[];
}

export const PLACE_HREF: Record<LabPlaceId, string> = {
  today: "/lab/today",
  bench: "/lab/bench",
  send_outs: "/lab/send-outs",
  quality: "/lab/quality",
  reports: "/lab/reports",
  setup: "/lab/setup",
};

/** Keyboard: `g` then this letter (5.1). */
export const PLACE_KEY: Record<LabPlaceId, string> = {
  today: "t",
  bench: "b",
  send_outs: "s",
  quality: "q",
  reports: "r",
  setup: "u",
};

export const PLACE_ORDER: readonly LabPlaceId[] = [
  "today",
  "bench",
  "send_outs",
  "quality",
  "reports",
  "setup",
];

export const LAB_TABS: readonly LabTabDef[] = [
  { place: "today", key: "today", href: "/lab/today", from: ["worklist"] },
  { place: "bench", key: "to_receive", href: "/lab/bench?stage=to_receive", from: ["worklist"] },
  { place: "bench", key: "to_result", href: "/lab/bench?stage=to_result", from: ["worklist"] },
  { place: "bench", key: "preliminary", href: "/lab/bench?stage=preliminary", from: ["worklist"] },
  { place: "bench", key: "released", href: "/lab/bench?stage=released", from: ["released"] },
  { place: "bench", key: "rejected", href: "/lab/bench?stage=rejected", from: ["rejected"] },
  { place: "bench", key: "downtime", href: "/lab/bench/downtime", from: ["downtime"] },
  {
    place: "send_outs",
    key: "board",
    href: "/lab/send-outs?tab=board",
    from: ["to_refer", "referrals"],
  },
  {
    place: "send_outs",
    key: "manifests",
    href: "/lab/send-outs?tab=manifests",
    from: ["referrals"],
  },
  { place: "send_outs", key: "match", href: "/lab/send-outs?tab=match", from: ["matches"] },
  { place: "send_outs", key: "partners", href: "/lab/send-outs?tab=partners", from: ["partners"] },
  {
    place: "send_outs",
    key: "connections",
    href: "/lab/send-outs?tab=connections",
    from: ["connections"],
  },
  { place: "quality", key: "today", href: "/lab/quality?tab=today", from: ["quality"] },
  { place: "quality", key: "plans", href: "/lab/quality?tab=plans", from: ["qc"] },
  { place: "quality", key: "runs", href: "/lab/quality?tab=runs", from: ["qc"] },
  { place: "quality", key: "stock", href: "/lab/quality?tab=stock", from: ["stock"] },
  { place: "quality", key: "equipment", href: "/lab/quality?tab=equipment", from: ["equipment"] },
  { place: "quality", key: "eqa", href: "/lab/quality?tab=eqa", from: ["eqa"] },
  { place: "quality", key: "bedside", href: "/lab/quality?tab=bedside", from: ["bedside_quality"] },
  { place: "quality", key: "nc", href: "/lab/quality?tab=nc", from: ["nonconformities"] },
  { place: "reports", key: "indicators", href: "/lab/reports?tab=indicators", from: ["reports"] },
  { place: "reports", key: "register", href: "/lab/reports?tab=register", from: ["register"] },
  { place: "reports", key: "hmis", href: "/lab/reports?tab=hmis", from: ["hmis"] },
  {
    place: "reports",
    key: "downloads",
    href: "/lab/reports?tab=downloads",
    from: ["reports", "hmis"],
  },
  { place: "setup", key: "hub", href: "/lab/setup", from: SETUP_IDS() },
];

function SETUP_IDS(): LabNavId[] {
  return [
    "setup_menu",
    "setup_catalogue",
    "setup_profiles",
    "setup_ranges",
    "setup_limits",
    "setup_criticals",
    "setup_delta",
    "setup_patient_release",
    "setup_demo",
    "setup_drafts",
    "setup_settings",
  ];
}

export interface LabPlaces {
  /** Visible places in rail order. */
  places: LabPlaceId[];
  /** Visible tabs per place. */
  tabs: Record<LabPlaceId, LabTabDef[]>;
  /** The registered nav ids visible to the viewer (for set-up links, search and parity). */
  visible: ReadonlySet<LabNavId>;
}

export function placesFor(permissions: ReadonlySet<LabPermission>, flags: LabNavFlags): LabPlaces {
  const visible = new Set(navFor(permissions, flags).map((i) => i.id));
  // Analysers and the HMIS mapping move into set-up (Appendix C): set-up opens for the lead whenever any of
  // its links does.
  const tabs = Object.fromEntries(PLACE_ORDER.map((p) => [p, [] as LabTabDef[]])) as Record<
    LabPlaceId,
    LabTabDef[]
  >;
  for (const t of LAB_TABS) if (t.from.some((id) => visible.has(id))) tabs[t.place].push(t);
  if (
    permissions.has("lab.manage") &&
    (visible.has("analysers") || visible.has("hmis")) &&
    !tabs.setup.length
  )
    tabs.setup.push(LAB_TABS.find((t) => t.place === "setup")!);
  // Set-up is the laboratory lead's (D-UI-03).
  if (!permissions.has("lab.manage")) tabs.setup = [];
  return { places: PLACE_ORDER.filter((p) => tabs[p].length > 0), tabs, visible };
}

/** D-UI-04: the lead lands on Today, everyone else on the Bench. */
export function landingFor(
  permissions: ReadonlySet<LabPermission>,
  places: readonly LabPlaceId[],
): string {
  if (permissions.has("lab.manage") && places.includes("today")) return PLACE_HREF.today;
  return places.includes("bench") ? PLACE_HREF.bench : PLACE_HREF[places[0] ?? "bench"];
}

/** Which place a pathname belongs to (for the rail's current mark). */
export function placeOf(pathname: string): LabPlaceId | null {
  for (const p of PLACE_ORDER)
    if (pathname === PLACE_HREF[p] || pathname.startsWith(`${PLACE_HREF[p]}/`)) return p;
  if (pathname.startsWith("/lab/needs-you")) return null;
  return null;
}
