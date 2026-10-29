import type { SignedCopy } from "@/content/signed-copy";

/**
 * Stocking-up polish (29 Oct 2026): the few new words the reworked "Start a delivery" dialog and the delivery page
 * (canvas board 1, "Count a delivery") need. Every other string on those screens is the signed Phase 2 store copy
 * (PHARMACY_STORES_COPY) or CATALOGUE, reused as written. Draft until the CSO signs it; not tied to any flag.
 */
export const STOCK_UP_POLISH_COPY: SignedCopy = {
  status: "draft",
  signedBy: null,
  signedOn: null,
};

export const STOCK_UP_POLISH = {
  start: {
    route: "Supplier and place",
    note: "The delivery note",
    people: "Who brought it",
  },
  next: {
    title: "What happens next",
    nothingMoves: "Nothing moves until you finish",
    newPacks: "New packs stay with the hospital",
  },
} as const;
