import type { SignedCopy } from "@/content/signed-copy";

/**
 * The national list, searched from Stock (ADR 0282). Every visible string on /pharmacy/stock/national-list.
 * Draft: in production the page stays off until the CSO signs this set (CS-5). The VEN words are
 * STOCK.ven, signed with the Phase 1 wording.
 */
export const NATIONAL_LIST_COPY: SignedCopy = {
  status: "draft",
  signedBy: null,
  signedOn: null,
};

export const NATIONAL_LIST = {
  title: "National list",
  open: "National list",
  back: "Back to Stock",
  lead: (edition: string) =>
    `${edition} as printed: medicines and health supplies, with their level of care and class. It is for reference: medicines are prescribed and supplied from MedSync's prescribing list.`,
  notLoaded: "No edition of the national list is loaded yet.",
  search: "Search by name or class",
  submit: "Search",
  kind: { all: "All", medicine: "Medicines", supply: "Health supplies" } as const,
  vitalOnly: "Vital only",
  columns: {
    item: "Item",
    form: "Form",
    strength: "Strength or unit",
    level: "Level of care",
    ven: "Class",
    prescribing: "Prescribing list",
  },
  specialist: "Specialist",
  flagged: "Check against the printed list",
  flaggedPage: (page: number) => `Check against the printed list, page ${page}`,
  onList: "On the prescribing list",
  shownSome: (shown: number, total: number) =>
    `The first ${shown} of ${total}. Narrow the search to see the rest.`,
  shownAll: (total: number) => `${total} ${total === 1 ? "item" : "items"}.`,
  empty: "Nothing on the list matches.",
} as const;
