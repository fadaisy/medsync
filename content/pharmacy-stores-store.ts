/**
 * Pharmacy Phase 2, Step 4: the store (5.2 deliveries, 5.3 issues, requisitions, returns and loans, store counts,
 * 5.11 scanning, 5.12 going live per location). Every visible string on /pharmacy/store/{places,deliveries,issues}
 * and the location go-live panel. Draft with the rest of Phase 2 (PHARMACY_STORES_COPY, Appendix B): the status
 * lives there and is never edited here. Appendix B's own strings come from STORES_B, word for word.
 */

import type { RequisitionState } from "@/lib/pharmacy/stores/issue";
import type { LineResult, RejectReason, ShortDatedDecision } from "@/lib/pharmacy/stores/receiving";

export { PHARMACY_STORES_COPY, STORES_B } from "@/content/pharmacy-stores";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export const LOCATION_KIND_WORDS = {
  store: "Store",
  dispensing_point: "Dispensing point",
  ward: "Ward",
  cart: "Emergency cart",
  quarantine: "Quarantine",
} as const;

/** 5.2 RG-3: why a counted quantity was rejected (0181 `reject_reason`). */
export const REJECT_REASONS: Readonly<Record<RejectReason, string>> = {
  damaged: "Damaged",
  wrong_product: "Wrong product",
  expired: "Expired",
  short_dated: "Rejected as short-dated",
  other: "Other",
};

/** 5.2 RG-4: the decision a short-dated line needs. */
export const SHORT_DATED_DECISIONS: Readonly<Record<ShortDatedDecision, string>> = {
  accept: "Accept",
  accept_tell: "Accept and tell the supplier",
  reject: "Reject",
};

/** 5.3: why stock is returned to its issuer (the prompt's own list). */
export const RETURN_REASONS = {
  no_longer_needed: "No longer needed",
  near_expiry: "Near expiry",
  patient_discharged: "Patient discharged",
  other: "Other",
} as const;
export type ReturnReason = keyof typeof RETURN_REASONS;

/** RG-2: a line's result in words. Every result except Matches is amber with an icon. */
export function resultWords(r: LineResult): string {
  switch (r.kind) {
    case "matches":
      return "Matches";
    case "fewer_than_note":
      return `${r.n} fewer than the note`;
    case "more_than_note":
      return `${r.n} more than the note`;
    case "short_of_order":
      return `${r.n} short of the order`;
    case "not_on_order":
      return "Not on the order";
    case "expires_within":
      return `Expires in under ${plural(r.lookaheadDays, "day", "days")}`;
    case "expired":
      return "Expired";
    case "damaged":
      return "Damaged";
    case "wrong_product":
      return "Wrong product";
  }
}

export const REQUISITION_STATE_WORDS: Readonly<Record<RequisitionState, string>> = {
  raised: "Raised",
  part_issued: "Part issued",
  issued: "Issued",
  refused: "Refused",
  withdrawn: "Withdrawn",
  confirmed: "Confirmed",
  confirmed_with_difference: "Confirmed with a difference",
};

export const STORE = {
  flagOff: "The store is not switched on at this hospital.",
  failed: "Nothing was recorded. Try again.",
  back: "Back to the store",
  amounts: (n: number, unit: string) => `${n} ${unit}`,
  /** Law 3 (S17a): Phase 1's Receive stock, once the store is on. */
  phase1ReceiveClosed:
    "This now arrives as an issue from the store, a loan or a return, on the Store pages. Receive from a supplier here.",

  scan: {
    label: "Scan or type",
    hint: "A scanner fills the product, batch and expiry. You can type them instead.",
    read: (what: string) => `Read from the scan: ${what}.`,
    unknownGtin: "This code is not linked to a product yet. Pick the product, then link the code.",
    ambiguous: "This code is linked to more than one product. Pick the product.",
    asText: "Not a GS1 code: kept as typed text.",
    linkGtin: "Link this code to the product",
    linked: "Code linked.",
  },

  places: {
    title: "Places and suppliers",
    lead: "Every place stock is kept, and the suppliers and facilities it comes from or goes to.",
    locations: "Places",
    counterparties: "Suppliers and other facilities",
    noLocations: "No store or quarantine is set up yet.",
    noCounterparties: "No supplier or facility is recorded yet.",
    add: "Add a place",
    addTitle: "Add a place",
    kind: "Kind of place",
    name: "Name",
    unit: "Hub unit",
    ward: "Ward",
    cart: "Emergency cart",
    supplyModel: "How the ward is supplied",
    supplyModels: { stocked: "Ward stock, counted", issue_only: "Issue only, counted as use" },
    supplyModelUnset: "Not set yet",
    setModel: "Set how it is supplied",
    inCharge: "In charge",
    noInCharge: "No one named",
    setInCharge: "Name the person in charge",
    live: (date: string) => `Live since ${date}`,
    notLive: "Not live",
    off: (date: string) => `Switched off ${date}`,
    save: "Save",
    cancel: "Cancel",
    addCounterparty: "Add a supplier or facility",
    editCounterparty: "Change",
    counterpartyKind: "Kind",
    counterpartyKinds: { supplier: "Supplier", facility: "Another facility" },
    code: "Code (optional)",
    takesReturns: "Takes returns",
    takesReturnsYes: "Takes returns",
    retired: "Retired",
    retire: "No longer used",
    count: "Count",
    opening: "Opening count",
    pointNote: "Dispensing points are made on the hospital hub.",
    manageOnly: "Only the pharmacy in charge changes places and suppliers.",
  },

  count: {
    title: (where: string) => `Count ${where}`,
    lede: "Count what is on the shelf and type each figure. The record is shown only after you save.",
    openingTitle: (where: string) => `Opening count · ${where}`,
    openingLede:
      "Count every product here before the place goes live. Each line is a product, its batch, its expiry and what you counted.",
    addLine: "Add a line",
    product: "Product",
    batch: "Batch",
    expiry: "Expiry (YYYY-MM or YYYY-MM-DD)",
    counted: "Counted",
    submit: "Save the count",
    record: "Record the reasons",
    done: "Done",
    nothing: "Nothing is held here to count.",
    reason: "Reason for the difference",
    note: "Note",
    matched: (n: number) => `Counted ${n} · matched the record`,
    differs: (n: number, recorded: number) => `Counted ${n} · the record said ${recorded}.`,
  },

  deliveries: {
    title: "Deliveries",
    lead: "Receive against the delivery note. Only what was counted goes into stock.",
    start: "Start a delivery",
    startTitle: "Start a delivery",
    supplier: "Supplier",
    noSuppliers: "Add a supplier on Places and suppliers first.",
    note: "Delivery note number",
    order: "Order it fills (optional)",
    noOrder: "No order",
    arrived: "Arrived at (YYYY-MM-DD HH:MM)",
    receivingAt: "Received at",
    counter: "Who is counting",
    witness: "Witness the procedure requires (name)",
    deliverer: "Deliverer's name",
    vehicle: "Vehicle registration",
    states: { counting: "Counting", received: "Received", abandoned: "Abandoned" },
    empty: "No delivery is recorded yet.",
    columns: {
      note: "Note",
      supplier: "Supplier",
      at: "Received at",
      arrived: "Arrived",
      lines: "Lines",
      state: "State",
    },
    open: "Open",
    orderLabel: (emergency: boolean, saved: string | null) =>
      `${emergency ? "Emergency order" : "Order"}${saved ? ` · ${saved}` : ""}`,
    stillCounting: (n: number) =>
      `${plural(n, "delivery is", "deliveries are")} still being counted. No stock has moved for ${n === 1 ? "it" : "them"}.`,
  },

  delivery: {
    title: (note: string, supplier: string) => `Delivery ${note} · ${supplier}`,
    header: "The delivery",
    lines: "Lines",
    finish: "Add to stock",
    linesLead:
      "Type the quantity on the note and what you counted, split into accepted, rejected and kept, and rejected and sent back.",
    product: "Product delivered",
    noteProduct: "Product on the note, if different",
    sameProduct: "Same as delivered",
    noteQty: "On the note",
    accepted: "Accepted",
    rejectedKept: "Rejected, kept",
    rejectedReturned: "Rejected, sent back",
    rejectReason: "Why rejected",
    batch: "Batch",
    expiry: "Expiry (YYYY-MM or YYYY-MM-DD)",
    cost: "Unit cost, UGX (optional)",
    orderLine: "Order line",
    result: "Result",
    shortDated: "Short-dated: decide",
    decision: "Decision",
    addLine: "Add a line",
    saveLine: "Save the line",
    editLine: "Change",
    removeLine: "Remove",
    noLines: "No line yet.",
    saveLater: "Save and finish later",
    savedLater: "Saved. The delivery stays listed as Counting; no stock has moved.",
    addToStock: (n: number) => `Add ${plural(n, "line", "lines")} to stock`,
    abandon: "Abandon this delivery",
    abandonTitle: "Abandon this delivery",
    abandonReason: "Why it is abandoned",
    received: (date: string) => `Received ${date}. The delivery is closed.`,
    abandoned: (reason: string) => `Abandoned: ${reason}`,
    noLookahead:
      "The expiry look-ahead is not set, so short-dated lines cannot be checked. The hospital admin sets it on the pharmacy settings.",
    quarantineAt: (name: string) => `Rejected and kept goes to ${name}.`,
    noQuarantine: "No quarantine is live, so nothing rejected can be kept on site.",
    controlled: "Controlled drug: the witness confirms this line.",
    owed: "Still owed on the order",
    owedLine: (product: string, n: number) => `${product}: ${n} still owed`,
    nothingOwed: "Nothing is still owed on this order.",
    printReport: "Print the discrepancy report",
    printGrn: "Print the goods received note",
  },

  report: {
    title: "Discrepancy report (HMIS 087)",
    grnTitle: "Goods received note",
    hospital: "Facility",
    supplier: "Supplier",
    note: "Delivery note",
    arrived: "Arrived",
    deliverer: "Deliverer",
    vehicle: "Vehicle",
    columns: {
      line: "Line",
      product: "Product",
      batch: "Batch",
      expiry: "Expiry",
      note: "On the note",
      counted: "Counted",
      accepted: "Accepted",
      rejected: "Rejected",
      result: "Discrepancy",
      decision: "Decision",
      cost: "Unit cost",
    },
    noDiscrepancy: "Every line matched the note.",
    noteSaid: (delivered: string, note: string) => `${delivered} (the note says ${note})`,
    signatures: ["Received by", "Witnessed by", "Delivered by"],
    signature: "Name, signature and date",
    neverSent: "MedSync does not send this report.",
    print: "Print",
  },

  issues: {
    title: "Issues and requisitions",
    lead: "Requisitions raised to the places you issue from, and stock issued without one.",
    raise: "Raise a requisition",
    raiseTitle: "Raise a requisition to the store",
    from: "Raised by (requesting place)",
    to: "Issued from",
    issueTo: "Issued to",
    line: "Line",
    product: "Product",
    asked: "Quantity asked",
    addLine: "Add a line",
    submit: "Raise it",
    direct: "Issue without a requisition",
    directTitle: "Issue without a requisition",
    empty: "No requisition is waiting.",
    columns: {
      raised: "Raised",
      from: "From",
      to: "To",
      lines: "Lines",
      state: "State",
    },
    open: "Open",
    waiting: "Waiting to be issued",
    unconfirmed: "Issued, not yet confirmed",
    closed: "Closed",
    toConfirm: "Issued to your place, to confirm",
    confirm: "Confirm receipt",
    confirmTitle: "Confirm what arrived",
    arrived: "Arrived",
    difference: "What was different",
    returns: "Return stock",
    returnTitle: "Return stock to the place that issued it",
    returnTo: "Return to",
    fit: "Fit for the shelf",
    notFit: "Not fit: it goes to quarantine",
    returnReason: "Reason",
    returnNote: "Note",
  },

  issue: {
    title: (from: string, to: string) => `Requisition from ${from} to ${to}`,
    raisedBy: (time: string) => `Raised ${time}`,
    header: "The requisition",
    lines: "Lines",
    columns: {
      product: "Product",
      asked: "Asked",
      held: "Held here",
      first: "First to expire",
      takeFrom: "Take from",
      issue: "To issue",
      notIssued: "Not issued, because",
    },
    noBatch: "None held",
    notIssued: "Not issued",
    issue: "Issue",
    refuse: "Refuse the requisition",
    refuseTitle: "Refuse the requisition",
    refuseReason: "Why it is refused",
    refuseLine: "Refuse this line",
    refuseLineTitle: "Refuse this line",
    printVoucher: "Print the requisition and issue voucher",
    issued: (time: string) => `Issued ${time}`,
    controlled: "Controlled drug: issued only with the witness here.",
    countOnWard: "No count from the requesting place was taken.",
    take: (batch: string, expiry: string, n: number) => `${batch} · exp ${expiry} · take ${n}`,
    only: (n: number, unit: string) => `Only ${n} ${unit} held here.`,
    short: (n: number, unit: string) => `${n} ${unit} short of what was asked.`,
    cool: "Cold chain: pack it in a cool box.",
    printPick: "Print the pick list",
    pickTitle: (from: string, to: string) => `Pick list · ${from} to ${to}`,
  },

  voucher: {
    title: "Requisition and Issue Voucher",
    requested: "Requested by",
    issued: "Issued by",
    received: "Received by",
    columns: {
      product: "Product",
      asked: "Asked",
      issued: "Issued",
      batch: "Batch",
      expiry: "Expiry",
    },
    zero: "0 · not issued",
    stamp: "The stamped paper voucher keeps its place. MedSync prints its entry.",
  },

  loans: {
    title: "Loans to and from other facilities",
    lead: "A loan stays listed until it is returned or closed with a reason.",
    lend: "Lend",
    lendTitle: "Lend to another facility",
    borrow: "Borrow",
    borrowTitle: "Borrow from another facility",
    facility: "Facility",
    noFacility: "Add the facility on Places and suppliers first.",
    batch: "Batch",
    quantity: "Quantity",
    from: "From",
    into: "Into",
    none: "No loan is outstanding.",
    columns: {
      facility: "Facility",
      product: "Product",
      direction: "Direction",
      outstanding: "Outstanding",
      since: "Since",
    },
    directions: { lent: "Lent to them", borrowed: "Borrowed from them" },
    close: "Close",
    closeTitle: "Close this loan",
    returned: "Returned",
    returnedQty: "Quantity returned",
    closeReason: "Or close it without a return, with a reason",
    print: "Print the loan record",
    controlledNever: "Controlled drugs are never lent or borrowed.",
    problems: (n: number) =>
      `${plural(n, "return does", "returns do")} not match a loan. Check the record.`,
  },

  attest: {
    who: "Witness",
    choose: "Choose the witness",
    password: "Witness's password",
    code: "Witness's 6-digit code",
    confirm: "Witness confirms",
    done: (time: string) => `Witnessed at ${time}.`,
    nobody: "No one at this hospital may witness yet.",
  },

  golive: {
    heading: "Stores, wards and carts",
    lead: "Each place goes live on its own, with its conditions met and a second hospital admin.",
    none: "No store, ward, cart or quarantine is set up yet.",
    conditions: {
      products_set_up: "Its products set up",
      opening_count: "An opening count of every product it holds, blind",
      levels_signed: "Its ward levels signed",
      cart_list_signed: "Its cart list signed",
      in_charge_named: "Its in-charge named",
      people_briefed: "Its people briefed",
      downtime_drill: "A downtime drill that included a delivery and an issue on paper",
      location_named: "Named",
    },
    met: "Met",
    notMet: "Not met",
    evidence: {
      products: (n: number) => plural(n, "product", "products"),
      counted: (a: number, b: number) => `${a} of ${b} counted`,
      at: (d: string) => `on ${d}`,
    },
    switchOn: "Switch on",
    switchOff: "Switch off",
    switchOnTitle: (name: string) => `Switch on ${name}`,
    switchOffTitle: (name: string) => `Switch off ${name}`,
    secondAdmin: "Second hospital admin",
    chooseAdmin: "Choose the second admin",
    password: "Their password",
    code: "Their 6-digit code",
    reason: "Why it is switched off (a sentence)",
    noSecond: "Another hospital admin is needed to approve.",
    recordBriefing: "Record a briefing",
    briefingTitle: (name: string) => `Briefing · ${name}`,
    heldOn: "Held on (YYYY-MM-DD)",
    notes: "Notes",
    recordDrill: "Record a drill",
    drillTitle: (name: string) => `Downtime drill · ${name}`,
    participants: "Who took part",
    whatWasDone: "What was done",
    problems: "Problems found",
    includedDelivery: "It included a delivery received on paper",
    includedIssue: "It included an issue made on paper",
    save: "Save",
    cancel: "Cancel",
    noMovements: "This page shows conditions only: no stock figures and no patient details.",
  },
} as const;
