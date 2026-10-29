import type { SignedCopy } from "@/content/signed-copy";

/**
 * Stocking-up polish (29 Oct 2026): the few new words the reworked "Start a delivery" dialog and the delivery page
 * (canvas board 1, "Count a delivery") need. Every other string on those screens is the signed Phase 2 store copy
 * (PHARMACY_STORES_COPY) or CATALOGUE, reused as written. Item 9 adds the picker's multi-mode words; item 11 the words for a product made from the catalogue; item 12 the signed packs' starting drafts. Draft until the CSO signs it; not tied to any flag.
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
  /** The catalogue picker's multi mode, on a delivery only (owner item 9). */
  pick: {
    keys: "↑↓ move · Enter opens a medicine · Space or Enter on a pack ticks it · Esc closes",
    ticked: (n: number) => `${n} ticked`,
    add: (n: number) => (n === 1 ? "Add 1 line" : `Add ${n} lines`),
    untick: (name: string) => `Untick ${name}`,
  },
  /** Set-up › Catalogue › a medicine: correct its form and routes (owner item 10). */
  correction: {
    edit: "Edit",
    title: "Correct this medicine",
    lead: "The change waits for two catalogue curators to check it. Until then the medicine stays as it is, here and at every hospital.",
    fixed:
      "Strength, national list level and VEN come from the national list and are not changed here.",
    chooseForm: "Choose the form",
    addRoute: "Add a route",
    noRoute: "No route yet",
    removeRoute: (route: string) => `Remove ${route}`,
    none: "None",
    send: "Send to the catalogue team",
    field: { form: "Form", routes: "Route" },
    pending: (changes: string) => `A change is waiting for the catalogue team: ${changes}`,
    pendingLine: (field: string, to: string) => `${field} → ${to}`,
    waiting: "A change to this medicine is already waiting for the catalogue team.",
  },
  /** The curators' queue: corrections, each reviewed on its own (owner item 10). */
  queue: {
    title: "Changes to a medicine",
    lead: "Each change is checked on its own by two curators, neither of them the person who proposed it.",
    none: "No change is waiting.",
    line: (field: string, from: string, to: string) => `${field}: ${from} → ${to}`,
    by: (who: string | null, where: string | null) =>
      `Proposed by ${who ?? "someone at a hospital"}${where ? ` at ${where}` : ""}`,
    confirmations: (n: number) => `${n} of 2 confirmations`,
    youConfirmed: "You confirmed it",
  },
  /** A catalogue pick or scan on a delivery with no product here: the product is made from the catalogue, or an unlinked one linked (owner item 11). */
  make: {
    made: (name: string) => `${name} is now one of your products, set up from the catalogue.`,
    linked: (name: string) => `${name}, one of your products, is now linked to the catalogue.`,
    severalUnlinked:
      "More than one of your products is this medicine and none is linked to the catalogue yet. Open a line and choose the product.",
    severalLoose:
      "More than one of your products is linked to this medicine, loose. Open a line and choose the product.",
    unclear:
      "This medicine is linked to the prescribing list in a way MedSync cannot read on its own. Open a line and choose the product.",
    noIssueUnit:
      "The catalogue does not say how this medicine is issued. Open a line and choose the product.",
  },
  /** Signed packs start from MedSync's sourced drafts (owner item 12, ADR 0469). */
  packs: {
    intro:
      "Each pack is a hospital's own figures and lists. Write a draft opens with MedSync's starting draft: a national figure where one is printed, MedSync's proposal where none is, and empty where only your hospital can say. A pack acts only once signed.",
    unsigned: "MedSync's starting draft, not yet signed by MedSync's clinical safety officer.",
    fromTemplate:
      "Starts from MedSync's draft. Check each field, change what does not fit your hospital, then save.",
    fromSigned: "Starts from the version in force.",
    basis: {
      national: (source: string) => `National figure · ${source}`,
      medsync: (reason: string) => `MedSync's proposal · ${reason}`,
      hospital: (reason: string) => `Your hospital decides · ${reason}`,
    },
    choose: (value: string) => `Use ${value}`,
    fieldBasis: "Where each part comes from",
    unmapped: (items: string) => `Not on MedSync's medicine list, so not included: ${items}.`,
  },
} as const;
