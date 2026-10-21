import { STORES_B } from "@/content/pharmacy-stores";

/**
 * Pharmacy Phase 2, Steps 5 and 6: the ward stock page (5.4), the cart check (5.5) and the ward side of
 * issues (5.3). Every string staff read there that Appendix B does not already word (those come from
 * STORES_B). Draft under PHARMACY_STORES_COPY until the CSO signs.
 */

export { STORES_B };

/** D-PH2-05: a ward's supply model; nothing defaults. */
export const SUPPLY_MODEL = {
  stocked: "Keeps ward stock (counted)",
  issue_only: "Issue-only (what is issued is used)",
} as const;

/** 5.3 returns, as listed in the prompt. */
export const RETURN_REASONS = {
  no_longer_needed: "No longer needed",
  near_expiry: "Near expiry",
  patient_discharged: "Patient discharged",
  other: "Other",
} as const;

/** IS-3: a difference at receipt. */
export const RECEIPT_DIFFERENCE_REASONS = {
  short: "Fewer arrived than were issued",
  damaged: "Arrived damaged",
  other: "Other",
} as const;

/** EC-3: what the person found (MedSync never decides which it was). */
export const GAP_EXPLANATIONS = {
  recorded_uses_accepted: "The recorded uses explain it",
  used_not_recorded: "Used, not recorded",
  broken_or_discarded: "Broken or discarded",
  moved_to_another_cart: "Moved to another cart",
  cannot_explain: "Cannot explain",
} as const;

export const WARDS = {
  title: "Ward stock",
  cartsTitle: "Emergency carts",
  notOnWard: "Ward use is counted on the ward, never worked out from the doses charted.",
  noWards: "No ward keeps stock through MedSync yet.",
  nurseNoWard: "You are not in charge of a ward that keeps stock through MedSync.",
  open: "Open",
  live: "Live",
  notLive: "Not live",
  modeUnset: "Supply model not set",
  anyNurse: "Any nurse on the ward may confirm receipt",
  inChargeOnly: "Only the nurse in charge confirms receipt",
  add: {
    ward: "Add a ward",
    cart: "Add a cart",
    wardField: "Ward",
    cartField: "Cart",
    choose: "Choose",
    model: "How the ward is supplied",
    anyNurse: "Any nurse on the ward may confirm receipt",
    save: "Add",
    none: "Every ward already has a place here.",
    noCarts: "Every cart already has a place here.",
  },
  settings: { open: "Supply settings", title: "How this ward is supplied", save: "Save" },
  table: {
    caption: "Ward stock, one row per product",
    product: "Product",
    level: "Ward level",
    last: "Last counted on the ward",
    issued: "Issued since that count",
    returned: "Returned since",
    doses: "Doses charted since",
    topUp: "Suggested top-up",
    requisition: "Requisition",
    notCounted: "Not counted yet",
    counted: (n: number, when: string, by: string) => `${n} on ${when}, by ${by}`,
    noLevel: "Not signed",
    asked: (n: number, state: string) => `${n} asked, ${state}`,
    none: "None open",
    allocated: "allocated, not counted",
  },
  missing: {
    ward_level: STORES_B.parameterMissing(
      "a signed ward level",
      "The pharmacy in charge with the ward's nurse in charge",
    ),
    count_freshness: STORES_B.parameterMissing(
      "the count freshness setting",
      "The pharmacy in charge",
    ),
  },
  levels: {
    open: "Ward levels",
    title: "Ward levels",
    lede: "The quantity the ward keeps of each product. Signed by the pharmacy in charge and the ward's nurse in charge.",
    level: (product: string, unit: string) => `${product}, level in ${unit}`,
    save: "Save draft",
    draft: (v: number) => `Draft, version ${v}. Not used until it is signed.`,
    signed: (v: number, on: string) => `Signed, version ${v}, on ${on}.`,
    unsigned: "No ward levels are signed. No top-up is suggested.",
  },
  sign: {
    open: "Sign",
    title: "Sign this list",
    lede: "Each signer types their own password and authenticator code.",
    first: "You, as pharmacy in charge",
    second: "The second signer",
    exception: "CSO signs alone (ADR 0281)",
    useException: "Sign with the exception: CSO signs alone (ADR 0281)",
    confirm: "Confirm",
    save: "Sign",
    confirmed: (who: string) => `Confirmed: ${who}.`,
    password: "Password",
    code: "Authenticator code",
    person: "Who is signing",
  },
  count: {
    open: "Count the ward",
    title: (ward: string) => `Count ${ward}`,
    lede: "Type what you find. Nothing MedSync holds is shown until the count is saved.",
    perProduct: "This ward keeps one figure per product",
    perProductRefused:
      "One figure per product is not allowed until the ward's allocation rule is signed.",
    controlledPerBatch: "Controlled: counted batch by batch.",
    batch: (number: string, expiry: string) => `Batch ${number}, expires ${expiry}`,
    product: (unit: string) => `Quantity in ${unit}`,
    save: "Save the count",
    reasons: "Record the reasons",
    back: "Back to ward stock",
    saved: "The count is saved.",
    used: (product: string, n: number) => `${product}: ${n} used since the last count.`,
    same: (product: string) => `${product}: no use since the last count.`,
    reason: "What happened",
    note: "Note",
    nothing: "The ward holds no batches yet. A count is taken once something has been issued.",
    pending: "A count found more than was issued and is waiting for a reason.",
  },
  requisition: {
    open: "Raise a requisition",
    title: "Raise a requisition",
    lede: "Suggested top-ups are filled in. Change any line before you send it.",
    from: "Ask from",
    line: (product: string, unit: string) => `${product}, quantity in ${unit}`,
    save: "Send the requisition",
    empty: "Type a quantity on at least one line.",
    states: {
      raised: "raised",
      issued: "issued",
      part_issued: "part issued",
      refused: "refused",
      withdrawn: "withdrawn",
      confirmed: "confirmed",
      confirmed_with_difference: "confirmed with a difference",
    },
  },
  receipts: {
    title: "Waiting for the ward to confirm",
    none: "Nothing is waiting to be confirmed.",
    confirm: "Confirm receipt",
    titleOne: "Confirm what arrived",
    lede: "Type what arrived. A difference is recorded with its reason and sent to both in-charges.",
    arrived: (product: string, batch: string, unit: string) =>
      `${product}, batch ${batch}, arrived (${unit})`,
    reason: "Reason for a difference",
    save: "Confirm",
    controlled:
      "Controlled line: issued with a witness at the pharmacy; you confirm with your second factor.",
  },
  returns: {
    open: "Return stock",
    title: "Return stock to the pharmacy",
    to: "Return to",
    batch: "Batch",
    quantity: "Quantity",
    reason: "Reason",
    fit: "Fit to go back on the shelf",
    unfit: "Not fit: it goes to quarantine",
    save: "Return",
  },
  notices: {
    title: "Recall notices for this ward",
    line: (product: string, batch: string | null) =>
      batch
        ? `${product}, batch ${batch}: recalled. Set it aside for the pharmacy.`
        : `${product}, every batch: recalled. Set it aside for the pharmacy.`,
  },
  surplus: "Counts found more on the ward than was issued",
  controlledPaper: `${STORES_B.paperStillApplies} MedSync keeps no running ward controlled drugs register.`,
  factor: {
    title: "Your second factor",
    lede: "Type your password and authenticator code to confirm.",
    confirm: "Confirm it is me",
    done: "Confirmed with your second factor.",
  },
  failed: "That did not save. Try again.",
  flagOff: "Ward stock is not switched on at this hospital.",
} as const;

export const CARTS = {
  title: "Emergency carts",
  none: "No emergency cart is kept through MedSync yet.",
  overdue: "Overdue for a check",
  neverChecked: "Not checked yet",
  lastCheck: (when: string) => `Last checked ${when}`,
  interval: (days: number) => `Checked every ${days} days`,
  listUnsigned: "No cart list is signed. The cart cannot go live.",
  unmatched: "Cart names typed on the resus desk that match no cart",
  unmatchedLine: (name: string, n: number) => `"${name}": ${n} ${n === 1 ? "use" : "uses"}`,
  list: {
    open: "Cart list",
    title: "Cart list",
    lede: "What the cart holds and how often it is checked. Signed by the pharmacy in charge and the unit's clinical lead.",
    quantity: (product: string, unit: string) => `${product}, quantity in ${unit}`,
    interval: "Check every (days)",
    names: "Names the resus desk uses for this cart, one per line",
    save: "Save draft",
  },
  check: {
    open: "Check the cart",
    title: (cart: string) => `Check ${cart}`,
    lede: "Count each batch and type its expiry as you see it. The list and recorded uses are shown after the count is saved.",
    save: "Save the count",
    complete: "Finish the check",
    from: "Restock from",
    seal: "Seal number (if the cart is sealed)",
    confirmer: "Unit nurse in charge confirms",
    gap: (product: string, batch: string, before: number, counted: number) =>
      `${product}, batch ${batch}: ${before} expected, ${counted} counted`,
    explain: "What you found",
    toCart: "Moved to which cart",
    reason: "Reason",
    restock: (product: string, n: number) => `${product}: restock ${n}`,
    restockShort: (product: string, n: number) =>
      `${product}: ${n} more needed than the pharmacy holds`,
    swap: (batch: string, days: number) =>
      `Batch ${batch} expires in ${days} days: swapped by default`,
    swapRoute: "Old batch goes",
    routes: {
      return_to_issuer: "Back to the pharmacy",
      quarantine: "To quarantine",
      keep: "Keep on the cart",
    },
    uses: "Recorded uses since the last check (context only)",
    recordedUse: (when: string, episode: string, medicine: string) =>
      `${when} · episode ${episode} · ${medicine}`,
    controlledRestock: "Controlled: restock it from Issues, with a witness.",
    listHolds: (product: string, n: number) => `${product}: the cart list holds ${n}`,
    matches: (product: string, batch: string, n: number) =>
      `${product}, batch ${batch}: ${n}, as expected`,
    done: "The check is recorded.",
    noList: "Sign the cart list first.",
  },
} as const;
