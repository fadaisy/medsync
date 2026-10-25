import type { SignedCopy } from "@/content/signed-copy";

/**
 * Pharmacy Phase 2, lane C: signed packs, expiry and recall, month end and the order. Every string staff read on
 * those pages. Signed by the CSO on 25 Oct 2026 with the rest of the Phase 2 wording; Appendix B strings stay in
 * `content/pharmacy-stores.ts` (STORES_B). Any change returns it to `draft` until it is signed again.
 */
export const PHARMACY_STORES_SUPPLY_COPY: SignedCopy = {
  status: "signed",
  signedBy: "Fadhul (CSO)",
  signedOn: "2026-10-25",
};

/** The D-PH2-22 exception, word for word (gate-a-proposal, signed 21 Oct 2026). */
export const CSO_ALONE = "CSO signs alone (ADR 0281)";

export const SUPPLY_COMMON = {
  cancel: "Cancel",
  save: "Save",
  failed: "That did not save. Nothing was recorded. Try again.",
  flagOff: "This part of the pharmacy is not switched on at your hospital.",
  manageOnly: "Only the pharmacy in charge can do this.",
  notHere: "That record is not at your hospital.",
  print: "Print",
  printed: "Printed. The print is logged.",
  none: "None.",
  quantity: "Quantity",
  upTo: (n: number) => `Quantity (up to ${n})`,
  you: "You",
  actions: "Actions",
  location: "Place",
  product: "Product",
  batch: "Batch",
  expiry: "Expiry",
  patient: "Patient",
  date: "Date",
  contact: "How to reach them",
  status: "Status",
  reason: "Reason",
  note: "Note (optional)",
  witness: "Witness confirmation",
  witnessHint:
    "The witness confirms with their own password and code, then the confirmation is used here within 15 minutes.",
  dateHint: "Write the date as YYYY-MM-DD.",
  who: "Who",
  choose: "Choose",
  theirPassword: "Their password",
  theirCode: "Their 6-digit code",
  confirm: "Confirm",
  confirmed: (who: string) => `${who} confirmed.`,
  copied: "Copied as plain text.",
  showWorking: "Show the arithmetic",
  hideWorking: "Hide the arithmetic",
} as const;

/* ─── Signed packs (Appendix D) ─────────────────────────────────────── */

export const PACKS = {
  noEmergencyOrderPoint: "This hospital keeps no emergency order point",
  title: "Signed packs",
  intro:
    "Each pack is a hospital's own figures and lists. Nothing here is pre-filled; the national figure is shown beside a field as a reference only. A pack acts only once signed.",
  status: { draft: "Draft", signed: "Signed", retired: "Retired", none: "Not written" },
  version: (v: number) => `Version ${v}`,
  blocked: "While unsigned",
  signers: "Signed by",
  columns: { pack: "Pack", status: "Status", actions: "Actions" },
  csoRole: "CSO",
  edit: "Write a draft",
  editTitle: (name: string) => `Draft: ${name}`,
  sign: "Sign",
  signTitle: (name: string) => `Sign: ${name}`,
  signIntro:
    "Signing puts this version in force and retires the version before it. Each signer confirms with their own password and code.",
  firstSigner: "You sign as",
  secondSigner: "Second signer",
  secondSignerRole: "They sign as",
  alone: "The CSO signs alone (D-PH2-22)",
  attest: "Confirm the signer",
  attested: (who: string) => `${who} confirmed.`,
  content: "Content (as written)",
  jsonHint:
    "This pack is kept as written. Type it in the shape its reader expects; it is checked when you save.",
  reference: (text: string) => `Reference only, not a value: ${text}`,
  phase1: "Phase 1 packs",
  phase2: "Phase 2 packs",
  unsupported:
    "Phase 1 packs whose shape no reader states (lane rule, high-risk list, controlled classes, availability mapping, and the lists no screen reads yet) are not signed here.",
  saved: "Draft saved.",
  signedNow: "Signed. The previous version is retired.",
  refused: {
    notDraft: "Only a draft can be signed.",
    secondSame: "The second signer must be someone else.",
    needSecond: "A second signer, or the CSO signing alone, is needed.",
    attestation: "The signer has to confirm again, with their password and code.",
    invalid: (why: string) => `The content does not fit this pack: ${why}`,
    banned: (terms: string) =>
      `The template names something a patient message never says: ${terms}.`,
  },
} as const;

/** Appendix D, by pack: what it is, who signs, what is blocked while unsigned, and the sourced reference. */
export const PACK_TEXT = {
  order_parameters: {
    name: "Order parameters",
    signers: ["Pharmacy in charge", "CSO"],
    whileUnsigned: "No proposal is calculated; the screen names what is missing.",
  },
  tracer_list: {
    name: "Tracer list",
    signers: ["Pharmacy in charge", "CSO"],
    whileUnsigned: "The stock status report and the tracer audit do not print.",
  },
  cart_lookahead: {
    name: "Cart look-ahead",
    signers: ["Pharmacy in charge", "CSO"],
    whileUnsigned: "Carts use the hospital's expiry look-ahead.",
  },
  month_end_rules: {
    name: "Month-end rules and data warnings",
    signers: ["Pharmacy in charge", "CSO"],
    whileUnsigned:
      "The month cannot close; the order's data warnings do not show; the report covers stores and dispensing points.",
  },
  ward_rules: {
    name: "Ward rules",
    signers: ["Pharmacy in charge", "Ward nurse in charge"],
    whileUnsigned:
      "Counts are still accepted; per-product ward counts are refused until the allocation rule is signed.",
  },
  stores_reason_lists: {
    name: "Store reason lists",
    signers: ["Pharmacy in charge", "CSO"],
    whileUnsigned: "An action that needs a list cannot be completed.",
  },
  hmis_column_maps: {
    name: "HMIS column maps",
    signers: ["Pharmacy in charge", "CSO"],
    whileUnsigned: "Prints carry “Columns not yet confirmed”.",
  },
  recall_template: {
    name: "Recall patient template",
    signers: ["CSO", "Pharmacist reviewer"],
    whileUnsigned: "No recall message can be sent; the list prints.",
  },
  stockout_day_rule: {
    name: "Day-out-of-stock rule",
    signers: ["Pharmacy in charge", "CSO"],
    whileUnsigned: "Days out of stock are not reported.",
  },
  message_name: {
    name: "Message name (Phase 1)",
    signers: ["Pharmacy in charge", "CSO"],
    whileUnsigned: "No message to a patient can be sent.",
  },
  witness_list: {
    name: "Witness list (Phase 1)",
    signers: ["Pharmacy in charge", "CSO"],
    whileUnsigned: "In production nobody may witness.",
  },
  keep_reasons: {
    name: "Keep reasons (Phase 1)",
    signers: ["Pharmacy in charge", "CSO"],
    whileUnsigned: "In production the list is empty.",
  },
  query_codes: {
    name: "Query codes (Phase 1)",
    signers: ["Pharmacy in charge", "CSO"],
    whileUnsigned: "In production the list is empty.",
  },
  outcome_reasons: {
    name: "Not-supplied reasons (Phase 1)",
    signers: ["Pharmacy in charge", "CSO"],
    whileUnsigned: "In production the list is empty.",
  },
  identity_routes: {
    name: "Identity routes (Phase 1)",
    signers: ["Pharmacy in charge", "CSO"],
    whileUnsigned: "In production identification another way is refused.",
  },
  counselling_points: {
    name: "Counselling points (Phase 1)",
    signers: ["Pharmacy in charge", "CSO"],
    whileUnsigned: "In production no counselling point can be ticked.",
  },
} as const;

/** The sourced national figures, shown beside a field as reference only (Law 6). */
export const PACK_REFERENCE = {
  maxMonths: "EMHS Manual 2023 §4.1.1.2: four months of stock for most medicines.",
  minMonths: "NMS SOP 2019: minimum two months of stock.",
  reviewWindow: "EMHS Manual 2023 §3.3.1.1: consumption adjusted for stock-out days.",
  cycle: "The NMS order schedule by facility level was not established.",
  tracer: "The current national tracer list was not established; enter it from the MoH document.",
  dayRule: "NMS SOP 2019: the stock book's days out of stock.",
} as const;

/** Field labels for the structured packs. */
export const PACK_FIELDS = {
  cycleMonths: "Order cycle, in months",
  maxMonths: "Maximum stock, in months",
  minMonths: "Minimum stock, in months (leave empty if not kept)",
  emergencyOrderPointMonths: "Emergency order point, in months (leave empty if not kept)",
  reviewWindowMonths: "Review window, in whole months",
  minHistoryDays: "Minimum history, in days",
  unclassedTrimAs: "Products with no VEN class are trimmed as",
  budgetSource: "Budget source (optional)",
  source: "Source document",
  medicines: "Medicines (one catalogue id per line)",
  days: "Days",
  daysBefore: "Count window: days before the month's last day",
  daysAfter: "Count window: days after the month's last day",
  outOfStockShare: "Out-of-stock share of the window that warns (0 to 1)",
  largeDifferenceUnits: "An unexplained difference of this many units or more is large",
  reportKinds: "Locations in the stock status report",
  confirmationWindowHours: "Confirmation window, in hours",
  allocationRule: "Per-product allocation rule",
  body: "Template",
  rule: "A day out of stock is",
  name: "Message name",
  ven: { V: "Vital", E: "Essential", N: "Necessary" },
  dayRules: {
    end_of_day: "Zero at the end of the local day",
    any_part: "Zero at any moment of the day",
  },
  firstExpiry: "First expiry first",
} as const;

/* ─── Expiry, quarantine, write-off (5.6) ───────────────────────────── */

export const EXPIRY = {
  title: "Expiry and recall",
  sections: {
    expiring: "Expiring",
    expired: "Expired",
    quarantine: "Quarantine",
    writeOffs: "Write-offs",
    recalls: "Recalls",
  },
  noLookahead:
    "The expiry look-ahead is not set, so expiring stock is not listed. The pharmacy in charge sets it on the Stock page.",
  noQuarantine: "This hospital has no quarantine location yet. The pharmacy in charge adds one.",
  expiresIn: (days: number) => (days === 0 ? "Expires today" : `Expires in ${days} days`),
  expiredOn: (date: string) => `Expired on ${date}`,
  actions: {
    issue_first: "Issue first",
    move_to_use: "Move to where it will be used",
    return_to_supplier: "Return to the supplier",
    lend: "Lend",
  },
  moveToQuarantine: "Move to quarantine",
  moveTitle: (what: string) => `Move ${what} to quarantine`,
  reasons: {
    expired: "Expired",
    damaged: "Damaged",
    recalled: "Recalled",
    rejected: "Rejected at receipt",
    returned_not_fit: "Returned, not fit",
  },
  why: "Why",
  suggested: "Suggested action",
  since: "Since",
  held: "Held",
  writeOff: "Write off",
  writeOffTitle: (what: string) => `Write off ${what}`,
  registerNumber: "Expired or Spoiled Medicines Register entry number",
  writeOffReason: "Reason, from the signed list",
  noReasonList:
    "The write-off reason list is not signed, so nothing can be written off. The pharmacy in charge and the CSO sign it on Signed packs.",
  noQuarantineList:
    "The quarantine reason list is not signed, so stock cannot be moved to quarantine. The pharmacy in charge and the CSO sign it on Signed packs.",
  disposal: "Record the disposal",
  disposalTitle: "Disposal reference",
  disposalRef: "Reference (board of survey, NDA supervision or the supplier's note)",
  disposalOn: "Date of disposal",
  disposalNote:
    "Disposal is done outside MedSync under the hospital's procedure. MedSync records the reference and the date; it does not record or certify destruction.",
  returnToSupplier: "Return to supplier",
  returnTitle: (what: string) => `Return ${what} to the supplier`,
  supplier: "Supplier (one that takes returns)",
  noSupplier: "No supplier on the list takes returns.",
  registerEntry: "Print the register entry",
  registerTitle: "Expired or Spoiled Medicines Register entry",
  useQuarantine:
    "Damaged and expired stock is moved to quarantine and written off there, not adjusted. Use Expiry and recall.",
  blocked: "Blocked: expired, recalled or in quarantine",
  backEntryFlag: "Batch was recalled or quarantined",
  writtenOff: "Written off",
} as const;

/* ─── Recall (5.7) ──────────────────────────────────────────────────── */

export const RECALL = {
  title: "Recalls",
  open: "Open recalls",
  closed: "Closed recalls",
  none: "No recall is open.",
  start: "Start a recall",
  startTitle: "Start a recall",
  product: "Product",
  batch: "Batch number (leave empty for every batch of the product)",
  source: "Source of the notice",
  sources: {
    nda: "NDA",
    supplier: "Supplier",
    manufacturer: "Manufacturer",
    hospital: "This hospital's own finding",
  },
  noticeRef: "Notice reference",
  noticeDate: "Notice date",
  statedClass: "Class, as stated in the notice",
  classes: { A: "Class A", B: "Class B", C: "Class C", not_stated: "Not stated" },
  classNote: "MedSync never assigns a class.",
  level: "Level the notice names",
  instructions: "What the notice says to do",
  blockedNow:
    "The batch is blocked from now: it cannot be issued, supplied or moved except into quarantine.",
  allBatches: "Every batch",
  trace: {
    received: "1. Received",
    supplied: "2. Supplied to patients",
    issued: "3. Issued to wards and carts",
    mayHave: "4. Patients who may have received it",
    shelves: "5. Still on shelves",
    lent: "6. Lent to other facilities",
    accounted: "7. Accounted for",
  },
  exactNote: "Exact: from recorded supplies of this batch.",
  allocated: "Allocated, not counted",
  fromWard: "From a ward",
  fromCart: "From a cart",
  contact: {
    phone: "Phone on file",
    guardian: "A guardian's phone",
    none: "No phone on file",
  },
  status: {
    not_yet_contacted: "Not yet contacted",
    told_by_message: "Told by message",
    reached_by_phone: "Reached by phone",
    reached_at_visit: "Reached at a visit",
    could_not_reach: "Could not reach",
  },
  lentTell: "Tell this facility the batch is recalled and ask what it still holds.",
  gap: (n: number) => (n === 0 ? "Nothing unaccounted for." : `${n} unaccounted for. Explain it.`),
  terms: {
    received: "Received",
    borrowed: "Borrowed",
    loanReturnedIn: "Loans returned to us",
    suppliedNet: "Supplied (net of reversals)",
    wardUsed: "Used on wards",
    cartUsed: "Used from carts",
    writtenOff: "Written off",
    returnedToSupplier: "Returned to supplier",
    lent: "Lent",
    loanReturnedOut: "Loans we returned",
    adjustedNet: "Adjusted and count corrections (net)",
    balance: "Still held, quarantine included",
  },
  quarantineAll: "Quarantine everything",
  quarantineAllNote:
    "Moves every balance of the batch, at every location, into quarantine, in one action.",
  quarantineNone: "Nothing of this batch is outside quarantine.",
  tellWards: "Tell the wards",
  wardTold: (at: string) => `Told ${at}`,
  wardNotice: (product: string, batch: string) =>
    `Recall: ${product}, batch ${batch}. Move it to quarantine.`,
  tellPatients: "Tell the patients",
  tellNote:
    "A message goes only to a patient with a number on file, sent by a person. Patients with no number stay on the printed list for follow-up.",
  noTemplate:
    "The recall patient template is not signed, so no message can be sent. The list still prints.",
  send: "Send the message",
  printedForFollowUp: "Printed list for follow-up",
  approveMayHave: "Approve messages to list 4 (CSO)",
  mayHaveApproved: (at: string) => `List 4 messages approved ${at}`,
  mayHaveNotApproved: "List 4 is not messaged unless the CSO approves it for this recall.",
  record: "Record a contact",
  recordTitle: "Record a contact",
  outcome: "Outcome",
  close: "Close the recall",
  closeTitle: "Close the recall",
  returnedQty: "Returned to the supplier",
  destroyedQty: "Destroyed",
  closeNote: "Outcome note",
  printList: "Print the recall list",
  printReconciliation: "Print the reconciliation",
  reconciliationTitle: "Recall stock reconciliation",
  reconciliationNote:
    "For the hospital to give its supplier or the NDA on request. MedSync does not send it.",
  listPrintNote: "For pharmacy staff only. This print is logged.",
  sent: (n: number, printed: number) => `${n} sent; ${printed} on the printed list for follow-up.`,
  ncdNote: "Only a person sends; MedSync never sends on its own.",
  figures: {
    received: "Received",
    issued: "Issued",
    returned: "Returned",
    writtenOff: "Written off",
    adjusted: "Adjusted",
    outstanding: "Outstanding",
    gap: "Unaccounted for",
  },
} as const;

/* ─── Month end (5.8) ───────────────────────────────────────────────── */

export const MONTH_END = {
  title: "Month end",
  scope: "Location",
  hospital: "The hospital",
  show: "Show",
  month: "Month",
  open: "Open",
  closed: (at: string) => `Closed ${at}`,
  columns: {
    product: "Product",
    opening: "Opening",
    received: "Received",
    issuedIn: "Issued in",
    supplied: "Supplied to patients",
    issuedOut: "Issued out",
    used: "Used on wards and carts",
    returned: "Returned",
    adjusted: "Adjusted",
    writtenOff: "Written off",
    shouldBe: "Should be",
    counted: "Counted",
    difference: "Difference",
    explained: "Explained",
  },
  notCounted: "Not counted this month",
  unexplained: "Unexplained",
  carried: (month: string, n: number) => `Carried from ${month}: ${n}`,
  rowSentence: (
    name: string,
    shouldBe: number,
    counted: number | null,
    diff: number | null,
    explained: string,
  ) =>
    counted === null
      ? `${name}: should be ${shouldBe}, not counted this month`
      : `${name}: should be ${shouldBe}, counted ${counted}, ${
          diff === 0 ? "matches" : diff! < 0 ? `${-diff!} fewer` : `${diff} more`
        }, ${explained}`,
  count: "Month-end count",
  countTitle: (where: string) => `Month-end count: ${where}`,
  countIntro:
    "Count every product where it sits. No expected figure is shown until the count is saved.",
  countSaved: (n: number) => `Saved. ${n} ${n === 1 ? "difference" : "differences"} to explain.`,
  countWhere:
    "Counted only at a store, a dispensing point or quarantine. Wards and carts count on their own pages.",
  explain: "Explain",
  explainTitle: (name: string) => `Explain: ${name}`,
  notCountedReason: "Not counted: reason",
  leaveUnexplained: "Leave unexplained (carried to next month)",
  noReasonList:
    "The month-end difference list is not signed, so a difference can only be left unexplained.",
  close: "Close the month",
  closeTitle: (month: string) => `Close ${month}`,
  closeIntro:
    "Closing fixes every figure. A closed month never re-opens; anything recorded later for it appears in the next open month, labelled.",
  approver: "Second approver",
  noWindow:
    "The month-end count window is not signed, so no month can close. The pharmacy in charge and the CSO sign it.",
  blockers: {
    not_counted: (name: string) => `${name} moved this month and was not counted.`,
    count_outside_window: (where: string) =>
      `The count at ${where} is outside the signed count window.`,
    difference_without_reason: (name: string) => `${name} has a difference with no reason.`,
    second_approver_needed: "A second approver must confirm.",
    approver_is_closer: "The approver must be someone other than the person closing.",
  },
  money: "Money (recorded cost only)",
  moneyNote:
    "Each figure is at the batch's cost recorded at receipt. The patient price is never used as cost.",
  stockStatus: "Stock status report (HMIS 105 Section 6)",
  tracerAudit: "Quarterly tracer-medicine audit",
  noTracer:
    "The tracer list is not signed, so the stock status report and the tracer audit do not print.",
  noDayRule: "The day-out-of-stock rule is not signed, so days out of stock are not reported.",
  onHand: "Stock on hand at month end",
  daysOut: "Days out of stock",
  quarter: "Quarter",
  late: "Late entries",
  readiness: "Going live",
  readyMet: (month: string) =>
    `Ready: every live location was counted at the start and end of ${month}.`,
  readyNot:
    "Not ready: one full month with every live location counted at its start and end is needed.",
} as const;

/* ─── Orders (5.9, 5.10) ─────────────────────────────────────────────── */

export const ORDERS = {
  title: "Orders",
  proposal: "Order proposal",
  emergency: "Emergency order",
  emergencyLabel: "Emergency order",
  cycleLabel: "Cycle order",
  saved: "Saved orders",
  noneSaved: "No order saved yet.",
  columns: {
    medicine: "Medicine",
    product: "Product",
    ven: "VEN class",
    consumption: "Consumption in the window",
    daysOut: "Days out of stock",
    amc: "Adjusted average monthly consumption",
    onHand: "Stock on hand",
    max: "Maximum stock",
    proposed: "Proposed quantity",
    yours: "Your quantity",
    reason: "Reason",
  },
  notClassed: "Not classed",
  packs: (n: number) => `${n} ${n === 1 ? "pack" : "packs"}`,
  noAmc: "No figure: no days in stock in the window",
  differentUnits: "Different units, not added",
  flags: {
    pack_size_not_whole: "Pack size not a whole number of units; not rounded",
    no_amc: "No adjusted consumption",
    below_emergency_order_point: "Below the emergency order point",
    not_counted_in_window: "Not counted in the window",
    short_history: "Short history",
    mostly_out_of_stock: "Out of stock for much of the window",
    large_unexplained_difference: "Large unexplained month-end difference",
  },
  notChecked: "Data warnings not checked: the month-end rules are not signed.",
  yoursRequired: "Type your quantity for every line before saving.",
  reasonRequired: (name: string) =>
    `${name}: your quantity differs from the proposal; give a reason.`,
  saveDraft: "Save the proposal",
  saveOrder: "Save as an order",
  savedNote: "Saving sends nothing.",
  budget: "Budget",
  trim: "Trim in VEN order",
  trimNote:
    "Necessary lines first, then essential, vital last. Nothing is cut until you confirm each cut.",
  cut: (from: number, to: number) => `Cut from ${from} to ${to}`,
  confirmCut: "Confirm this cut",
  vitalReason: "A vital line is cut only with a typed reason",
  unpriced: "Prices are not known for every line, so the budget cannot be checked.",
  total: (n: string) => `Total: ${n}`,
  closeLine: "Close the line",
  closeReasons: {
    supplier_out: "Supplier out of stock",
    cancelled: "Cancelled",
    substituted: "Substituted",
    other: "Other",
  },
  status: {
    open: "Open",
    part_received: "Part received",
    received: "Received",
    closed: "Closed",
    draft: "Draft",
  },
  ordered: "Ordered",
  received: "Received so far",
  owed: "Still owed",
  print085: "Print as HMIS 085",
  print084b: "Print as HMIS 084B",
  printPurchase: "Print as a purchase list",
  copy: "Copy the quantities",
  copied: "Copied as plain text.",
  appendix: "Appendix: inputs and formula",
  parameters: (v: string) => `Order parameters, version ${v}`,
  readiness: "Going live",
  paper: "Record the paper comparison",
  paperTitle: "Compare with the paper calculation",
  paperIntro:
    "Type the in-charge's own paper figure for each line. Every difference needs an explanation in writing before ordering goes live.",
  paperFigure: "Paper figure",
  explanation: "Explanation",
  readyMet:
    "Ready: a cycle was checked against the paper calculation and every difference is explained.",
  readyNot: "Not ready: record one cycle's comparison with the in-charge's paper calculation.",
  readyUnexplained: (n: number) =>
    `Not ready: ${n} ${n === 1 ? "difference has" : "differences have"} no explanation.`,
  supplier: "Supplier",
  cutAt: "Worked out at",
  roleSetsIt: "The pharmacy in charge and the CSO",
  parameterNames: {
    order_parameters: "a signed order parameter set",
    stockout_day_rule: "a signed day-out-of-stock rule",
    max_months: "the maximum stock in months",
    emergency_order_point: "the emergency order point (or that none is kept)",
    version: "a signed order parameter set",
    review_window: "the review window",
    minimum_history: "the minimum history",
  },
} as const;
