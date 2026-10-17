import type { MobileTabIconKey } from "@/components/responsive/mobile-tab-bar";

/**
 * The patient workspace's one navigation tree.
 *
 * It used to be two — a four-slot `TAB_ITEMS` for the tab bar and a
 * three-link `DESKTOP_NAV` in the header — which disagreed. The desktop
 * tree had no "More" entry, so /patient/menu, /profile, /hospitals,
 * /settings, /consent and /care were unreachable above `md:`. One array
 * rendered by two components (MobileTabBar, PatientNavRail) cannot drift
 * apart again.
 *
 * `iconKey` is a string, never a component reference: this module is
 * imported by a Server Component and a lucide icon is a function, which
 * cannot cross the server → client boundary. Each renderer resolves the
 * key through its own local ICONS map.
 */
export interface PatientNavItem {
  href: string;
  label: string;
  iconKey: MobileTabIconKey;
  /** Light only on this exact path — the index, so /patient/track doesn't light Home. */
  exact?: boolean;
  /**
   * Extra paths that should light this item, beyond `href` itself.
   * Matching is longest-href-wins, so a child route listed on its own
   * item always beats the parent that also prefix-matches it.
   */
  matchPrefixes?: readonly string[];
  /** Rendered one step in on the desktop rail — a sub-route of the item above it. */
  indent?: boolean;
}

export const PATIENT_NAV: ReadonlyArray<PatientNavItem> = [
  { href: "/patient", label: "Home", iconKey: "home", exact: true },
  // /patient/track already prefix-matches /track/log and /track/medications;
  // /track/doses also matches here but loses to the longer Doses href below.
  { href: "/patient/track", label: "Track", iconKey: "activity" },
  { href: "/patient/track/doses", label: "Doses", iconKey: "pill", indent: true },
  {
    href: "/patient/appointments",
    label: "Visits",
    iconKey: "file-text",
    matchPrefixes: ["/patient/appointments", "/patient/book", "/patient/queue"],
  },
  {
    href: "/patient/menu",
    label: "More",
    iconKey: "menu",
    matchPrefixes: [
      "/patient/menu",
      "/patient/profile",
      "/patient/hospitals",
      "/patient/household",
      "/patient/settings",
      "/patient/consent",
      "/patient/care",
      "/patient/results",
    ],
  },
];

/**
 * Before a hospital is chosen the app is a directory: the tracking tools are
 * not hidden features, they are simply not the question yet.
 */
export const LANDING_NAV: ReadonlyArray<PatientNavItem> = PATIENT_NAV.filter(
  (item) => !item.href.startsWith("/patient/track"),
);
