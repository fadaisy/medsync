/**
 * Pharmacy Workspace v2 copy: the shell, the six places, Find and the shared pieces (docs/pharmacy/workspace-v2,
 * the canvas boards word for word where they hold real words; bracketed placeholders on the boards are never
 * copied). Each place keeps its own words in `content/pharmacy-workspace-v2-<place>.ts` under this one status.
 * While the status is `draft`, PHARMACY_WORKSPACE_V2 stays off in production (lib/pharmacy/feature.ts). The CSO
 * signs; Claude never edits the status. Law 4: no role words, only cadres and places.
 */
import type { SignedCopy } from "@/content/signed-copy";

export const PHWS2_COPY_STATUS: SignedCopy = {
  status: "draft",
  signedBy: null,
  signedOn: null,
};

/** Fills `{name}` slots. A missing value leaves the slot visible, so a gap is never silent. */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in values ? String(values[k]) : m));
}

export type PharmacyPlace = "today" | "window" | "shelf" | "store" | "clinical" | "setup";

export const PHWS2 = {
  shell: {
    overline: "Pharmacy · {hospital}",
    places: {
      today: "Today",
      window: "Window",
      shelf: "Shelf",
      store: "Store",
      clinical: "Clinical",
      setup: "Set-up",
    } satisfies Record<PharmacyPlace, string>,
    titles: {
      today: "Today",
      window: "Window",
      shelf: "Shelf",
      store: "Store",
      clinical: "Clinical",
      setup: "Set-up",
      needsYou: "Needs you",
    },
    placesLabel: "Pharmacy places",
    placeCount: {
      window: "{n} waiting",
      store: "{n} needing action",
      clinical: "{n} to review",
      setup: "{n} packs not signed",
    },
    home: "MedSync pharmacy",
    mark: "M",
    needsYou: "Needs you",
    needsYouCount: "Needs you, {n} items",
    find: "Find a patient, prescription, batch, slip code or page",
    findKey: "Ctrl K",
    point: "{point} · {state}",
    pointLabel: "Working at {point}, {state}. Change",
    pointLive: "Live",
    pointNotLive: "Not live",
    pointNone: "No dispensing point",
    account: "Account",
    switchAccount: "Switch account",
    signOut: "Sign out",
    skip: "Skip to the page",
    emergency: "Emergency",
    close: "Close",
    pointsLabel: "Choose where you are working",
  },
  tabs: {
    window: {
      queue: "Queue",
      ready: "Ready to hand over",
      open: "Open lines",
      refills: "Refills",
      supplied: "Supplied today",
    },
    shelf: { stock: "Stock", controlled: "Controlled drugs", emergency: "Emergency doses" },
    store: {
      deliveries: "Deliveries",
      issues: "Issues",
      wards: "Wards",
      carts: "Carts",
      expiry: "Expiry and recall",
      orders: "Orders",
      monthEnd: "Month end",
    },
    clinical: {
      reconciliation: "Reconciliation",
      reactions: "Reactions",
      stewardship: "Stewardship",
      interventions: "Interventions",
    },
    setup: {
      packs: "Signed packs",
      places: "Places and suppliers",
      content: "Clinical content",
      national: "National list",
      downtime: "Downtime records",
    },
  },
  where: {
    title: "Where everything went",
    body: "The pharmacy is now six places. The queue, ready to hand over, open lines, refills and supplied today are views of Window. Stock, controlled drugs and emergency doses are on Shelf. Every store page is a tab of Store. Reconciliation, reactions, stewardship and interventions are on Clinical. Signed packs, clinical content and places are in Set-up. Old links still work.",
    dismiss: "Got it",
  },
  limits: {
    line: "What MedSync checks here: {pairs} and {doses}. No alert does not mean no interaction.",
    pairs: "{n} signed interaction pairs",
    pairsOne: "1 signed interaction pair",
    pairsNone: "no signed interaction pairs",
    doses: "{n} of {total} signed dose references",
    dosesNone: "no signed dose references",
    read: "Read the full notice",
    title: "What MedSync checks here",
  },
  find: {
    label: "Find",
    placeholder: "Find a patient, prescription, batch, slip code or page",
    hint: "Finds patients, prescriptions, batches, slip codes, deliveries and pages",
    keys: { move: "move", open: "open", close: "close" },
    groups: {
      patient: "Patients",
      prescription: "Prescriptions",
      batch: "Batch",
      supplied: "Supplied from this batch",
      slip: "Slip codes",
      delivery: "Deliveries",
      page: "Pages",
    },
    searching: "Searching",
    nothing: "Nothing found for “{q}”.",
    short: "Type at least 2 characters.",
    failed: "Search did not run. Try again.",
  },
  kit: {
    more: "More",
    moreLabel: "More actions for {what}",
    next: "Next:",
    noData: "No data",
    notSet: "Not set",
    seeAll: "See all {n}",
    oldest: "oldest {wait}",
    asOf: "As of {time}",
    refresh: "Refresh",
    late: "late",
    vital: "Vital",
    working: "Working…",
    place: "Loading {place}",
    error: "This page did not load. Nothing was changed.",
    errorRetry: "Try again",
    notFound: "There is no such page in the pharmacy.",
    notFoundBack: "Back to {place}",
  },
} as const;
