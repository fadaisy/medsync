/**
 * Review, queries and outcomes (Pharmacy Phase 1, 5.2 to 5.5, 5.7; gate-a-content.md Part 1 and §2.6,
 * §2.8, §2.11; gate-a-wireframes.md §2 to §5 and §7). Every visible string on the review queue, the
 * review screen, Open lines and the slip page. Appendix B rows are quoted exactly as written (B-xx,
 * N-x, X-x); the rest are interface words. All `draft` under PHARMACY_PHASE1_COPY_STATUS: the flag stays
 * off in production until the Phase 1 wording is signed (RD-4). The reason and code lists are
 * Appendix D's drafted codes: unsigned, a point cannot go live (RD-1).
 *
 * "Pharmacist first" is the name of a review lane (5.2), not a title for a person: a pharmacy
 * technician is never called a pharmacist (Law 4; tests/pharmacy/ui.test.ts allows this one name).
 */

import type { PaymentStatus } from "@/lib/pharmacy/review/load";

/** §2.11 Type of problem (Appendix D). `other` needs text. */
export const QUERY_CODES = {
  allergy: "Allergy",
  dose: "Dose unclear or unusual",
  duplicate: "Duplicate",
  renal: "Renal function",
  not_available: "Not available, alternative needed",
  other: "Other (with text)",
} as const;
export type QueryCode = keyof typeof QUERY_CODES;

/** §2.11 The pharmacy's reason for withdrawing (Appendix D). */
export const WITHDRAW_REASONS = {
  answered_otherwise: "Answered another way",
  unreachable: "Prescriber could not be reached",
  sent_in_error: "Sent in error",
  other: "Other (with text)",
} as const;
export type WithdrawReason = keyof typeof WITHDRAW_REASONS;

/** §2.6 Not supplied (Appendix D). */
export const NOT_SUPPLIED_REASONS = {
  out_point: "Out of stock at this dispensing point",
  out_hospital: "Out of stock in the hospital",
  expired_only: "Expired or damaged stock only",
  not_stocked: "Not stocked at this hospital",
  other: "Other (with text)",
} as const;
export type NotSuppliedReason = keyof typeof NOT_SUPPLIED_REASONS;

/** §2.6 Closed (Appendix D). */
export const CLOSE_REASONS = {
  not_collected: "Not collected",
  patient_declined: "The patient declined",
  filled_elsewhere: "Filled elsewhere",
  other: "Other (with text)",
} as const;
export type CloseReason = keyof typeof CLOSE_REASONS;

/** §2.6 Declined by the pharmacist (drafted in the annex). */
export const DECLINE_REASONS = {
  concern_stands: "Query answered; the concern stands",
  no_answer: "No answer from the prescriber; cannot supply as written",
  incomplete: "Prescription incomplete or unclear",
  other: "Other (with text)",
} as const;
export type DeclineReason = keyof typeof DECLINE_REASONS;

/** §2.8 Supply without a pharmacist (only if D-PH1-05 is on). */
export const WITHOUT_PHARMACIST_REASONS = {
  no_pharmacist: "No pharmacist on duty",
  cannot_be_reached: "The pharmacist on duty cannot be reached",
  other: "Other (with text)",
} as const;
export type WithoutPharmacistReason = keyof typeof WITHOUT_PHARMACIST_REASONS;

/** 5.7 Confirm filled: who said so. */
export const FILLED_SAID_BY = {
  patient: "The patient",
  other_pharmacy: "The other pharmacy",
} as const;
export type FilledSaidBy = keyof typeof FILLED_SAID_BY;

/** §2.11 The prescriber's reason for keeping (drafted; the prescriber's list), for a logged call. */
export const KEEP_REASONS = {
  intended: "Intended as written",
  senior_advice: "A senior or specialist advised it",
  discussed: "Already discussed with the patient",
  other: "Other (with text)",
} as const;

/** 5.4 Log a phone answer: what they said. */
export const PHONE_SAID = {
  keep: "Keep it as written, with their reason",
  change: "They will change it",
  stop: "Stop it",
} as const;
export type PhoneSaid = keyof typeof PHONE_SAID;

/** 5.6 section 4, the statuses settable from the review head (exempt needs a signed reason list). */
export const PAYMENT_WORDS: Record<PaymentStatus, string> = {
  paid: "Paid",
  exempt: "Exempt",
  insured: "Insured",
  emergency: "Emergency",
  not_recorded: "Not recorded",
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const fill = (s: string, v: Record<string, string | number>) =>
  s.replace(/\{([\w ]+)\}/g, (m, k: string) => (k in v ? String(v[k]) : m));

export const REVIEW = {
  fill,
  /** B-02 and N-1, the queue at a live point (C1). */
  noticeQueue:
    "MedSync does not check drug interactions at this hospital, and {signed} of the {total} medicines on its list have a signed dose reference. Check each prescription yourself.",
  noticeQueueNoCounts:
    "MedSync does not check drug interactions at this hospital, and its dose references are still being signed. Check each prescription yourself.",
  /** B-01 and N-2, the review screen. */
  noticeReview: (n: number, total: number) =>
    `MedSync does not check drug interactions at this hospital, and ${n} of these ${total} doses ${n === 1 ? "has" : "have"} a signed reference. Check each line yourself.`,
  noticeReviewNoCounts:
    "MedSync does not check drug interactions at this hospital, and its dose references are still being signed. Check each line yourself.",

  lane: {
    pharmacist_first: "Pharmacist first",
    standard: "Standard",
    all: "All",
  },
  laneInFooter: {
    pharmacist_first: "pharmacist first",
    standard: "standard",
    all: "all lanes",
  },
  stage: {
    all: "All stages",
    to_review: "To review",
    queried: "Queried",
    ready: "Ready to hand over",
    awaiting_cosign: "Awaiting co-sign",
  },
  queriedFor: (minutes: string) => `Queried · ${minutes}`,
  outcome: {
    owed: "Owed",
    buying_outside: "Buying outside",
    supplied: "Supplied",
    cancelled_by_prescriber: "Stopped by the prescriber",
    replaced: "Replaced",
    declined: "Declined",
    closed: "Closed",
    reviewed: "Reviewed",
  },
  reason: {
    overridden_stop: "Stop overridden",
    controlled: "Controlled",
    high_risk: "High-risk medicine",
    child_check: "Child check",
    renal_check: "Renal check",
    preset_dose_changed: "Pre-set dose changed",
    typed_dose: "Typed dose",
  },
  /** B-04's "{reasons that are on}", one phrase per reason. */
  reasonPhrase: {
    overridden_stop: "the prescriber overrode a stop",
    controlled: "it has a controlled drug",
    high_risk: "a medicine is on the signed high-risk list",
    child_check: "the child check fired",
    renal_check: "the renal check fired",
    preset_dose_changed: "a pre-set dose was changed",
    typed_dose: "a dose was typed with no signed reference",
  },

  queue: {
    title: "Queue",
    updated: "Updated",
    refresh: "Refresh",
    refreshed: (n: number) => `Updated. ${plural(n, "prescription", "prescriptions")}.`,
    laneLabel: "Review lane",
    stageLabel: "Stage",
    pointLabel: "Dispensing point",
    allPoints: "All dispensing points",
    columns: {
      patient: "Patient",
      medicines: "Medicines",
      why: "Why a pharmacist first",
      stage: "Stage",
      waiting: "Waiting",
      payment: "Payment",
      action: "Action",
    },
    lines: (n: number) => plural(n, "line", "lines"),
    stock: {
      all: "all on the shelf",
      some: (n: number) => `${n} not on the shelf`,
      notCounted: "stock not counted",
    },
    more: (n: number) => `+${n}`,
    review: "Review",
    open: "Open",
    /** N-3. */
    cannotSupplyYet: "Cannot be supplied yet",
    /** B-08. */
    changedSincePrinting: "Changed since printing. The paper the patient carries is out of date.",
    changedChip: "Changed since printing",
    /** B-10. */
    earlier: "Written before today, still without an outcome",
    age: (days: number) => plural(days, "day", "days"),
    closeNotCollected: "Close as not collected",
    /** B-09. */
    footer:
      "{n} of {N} at {point}, {lane}. Waiting starts when the prescription was written. A prescription leaves the queue only with a recorded outcome for every line.",
    empty: "Nothing waits at {point}. Every prescription in scope has an outcome.",
    explainerTitle: "How the lanes work",
    /** B-04. */
    explainer:
      'A prescription goes to "Pharmacist first" when {reasons}. Everything else is "Standard". The list of reasons is signed by the Clinical Safety Officer.',
    /** B-05. */
    noHighRisk: "This hospital has no signed high-risk list, so that reason is not used.",
    /** B-03. */
    noRule:
      "This hospital has not signed its review rule, so every prescription needs a pharmacist.",
  },

  close: {
    title: "Close as not collected",
    lede: (written: string, lines: number) =>
      `Written ${written} · ${plural(lines, "line", "lines")}`,
    reason: "Reason",
    note: "Note (optional)",
    prescriberSees: "The prescriber sees this at the patient's next visit.",
    cancel: "Cancel",
    submit: "Close",
  },

  review: {
    back: "Back to the queue",
    payment: "Payment",
    set: "Set",
    paymentTitle: "Payment status",
    paymentDetail: {
      paid: "Receipt reference (optional)",
      insured: "Scheme",
    },
    exemptUnsigned: "Exempt can be chosen once the hospital's exemption reasons are signed.",
    paymentNote: "MedSync checks no payment. It never holds a supply back on its own.",
    save: "Save",
    cancel: "Cancel",
    stage: "Stage",
    forProblem: "For",
    directions: "Directions",
    onShelf: "On the shelf here",
    onShelfCounted: (n: number, unit: string, when: string) => `${n} ${unit} · counted ${when}`,
    onShelfNoCount: (n: number, unit: string) => `${n} ${unit}`,
    /** X-2. */
    outSince: (date: string) => `0 · out since ${date}`,
    out: "0",
    /** B-17. */
    notCounted: "Not counted yet.",
    elsewhere: "Elsewhere in the hospital",
    batchFirst: "Batch, first to expire",
    batchLine: (no: string, expiry: string) => `${no} · exp ${expiry}`,
    /** B-16. */
    noProduct: (point: string) => `No product is set up for this medicine at ${point}.`,
    alreadySupplied: (q: string, date: string) =>
      `Already supplied on an earlier version: ${q}, ${date}.`,
    accept: "Accept this line",
    acceptOverridden: "Reason accepted, supply",
    acceptRemaining: "Accept the remaining lines",
    acceptRemainingHint: (n: number) => `Takes ${plural(n, "line", "lines")} with no lane reason.`,
    accepted: (cadre: string, time: string) => `Accepted by ${cadre} · ${time}`,
    ask: "Ask the prescriber",
    decline: "Decline to supply",
    withoutPharmacist: "Supply without a pharmacist",
    decision: "Decision",
    full: "Supply in full",
    part: "Supply part",
    notOnShelf: "Not on the shelf",
    askChoice: "Ask the prescriber",
    quantityName: (medicine: string, unit: string) => `${medicine}, quantity in ${unit}`,
    quantity: "Quantity",
    now: "Supplied now",
    notSupplied: "Not supplied",
    rest: "What happens to the rest",
    restOwed: "owed",
    restOutside: "the patient buys it outside",
    daysCovered: "Days this supply covers (optional)",
    staged: (q: number, unit: string) => `Decision saved: supply ${q} ${unit}.`,
    stagedPart: (q: number, n: number | null, unit: string) =>
      `Decision saved: supply ${q} ${unit} now${n === null ? "" : `, ${n} not supplied`}.`,
    /** N-5 and N-4 (C3). */
    substitutionUnsigned:
      "A different pack of the same strength may be supplied. Any other change goes back to the prescriber.",
    substitutionSigned:
      "A different pack of the same strength may be supplied by anyone who may dispense. Only a pharmacist may change the strength, and only when the dose and the form the patient takes stay the same. Any other change goes back to the prescriber.",
    /** X-1. */
    footer: (n: number, total: number) =>
      `${n} of ${total} lines have an outcome. Each supply takes its quantity from the batch shown, in the same step.`,
    saveDecisions: "Save and keep in the queue",
    handover: "Continue to hand-over",
    handoverNext: "Hand-over comes in the next step",
    /** B-21. */
    changed: (medicine: string, time: string) =>
      `${medicine} was changed by the prescriber at ${time}. Review it again.`,
    replacedSr: "Replaced:",
    /** B-12. */
    ward: "Ward doses come from ward stock, which MedSync does not count yet.",
    /** B-13. */
    controlledBeforeStep7:
      "Supply this on paper as you do today. MedSync does not record controlled supplies yet.",
    /** B-07 (C2: the signed S-2 stays; N-3 leads). */
    cosignLead: "Cannot be supplied yet.",
    checksTitle: "Checks that came with it",
    noChecks: "No check needed an answer.",
    notCheckedTitle: "Not checked",
    notChecked: "Drug interactions.",
    outcomeLine: (word: string) => `Outcome: ${word}`,
    saved: "Saved.",
    nothingToSave: "Choose a decision for at least one line.",
    bringIn: "Bring into the queue",
    /** B-11. */
    beforeGoLive: "Written before this pharmacy began recording in MedSync.",
  },

  query: {
    title: "Ask the prescriber",
    about: "About",
    line: (n: number, medicine: string) => `Line ${n}: ${medicine}`,
    whole: "The whole prescription",
    type: "Type of problem",
    propose: "What you propose",
    count: (n: number) => `${n} / 500`,
    waiting: "The patient is waiting at the window",
    whoTold: "Who will be told",
    recipient: (
      cadre: string,
      place: string | null,
      role: "prescriber" | "responsible_clinician",
    ) =>
      `${[cadre, place].filter(Boolean).join(" · ")} (${role === "prescriber" ? "prescriber" : "responsible clinician"})`,
    skipped: (cadre: string) => `${cadre} (has left the hospital): skipped`,
    send: "Send query",
    cancel: "Cancel",
    history: "Queries",
    logPhone: "Log a phone answer",
    withdraw: "Withdraw",
    withdrawTitle: "Withdraw the query",
    withdrawReason: "Reason",
    note: "Note",
    phoneTitle: "Log a phone answer",
    spokeTo: "Who you spoke to",
    choose: "Choose",
    said: "What they said",
    keepReason: "Their reason",
    callTime: "Time of the call",
    callLogged: "Call logged. The line waits until the prescriber changes or stops it in MedSync.",
    keepNotPrescriber:
      "Call logged. This person may not prescribe here, so the query is still open.",
    sentToType: (type: string) => `Type: ${type}`,
    /** B-23. */
    notTold: "The prescriber has NOT been told. Call them and log the call.",
    /** B-24. */
    nobody: "Nobody can be told in MedSync. Call the ward or clinic.",
    patientWaitingWord: "Patient waiting at the window",
  },

  notOnShelf: {
    title: (medicine: string) => `Not on the shelf: ${medicine}`,
    /** X-6. */
    outSince: (date: string, days: number) => `Out since ${date} · ${plural(days, "day", "days")}.`,
    count: (point: string, n: number, when: string | null) =>
      `${point}: ${n}${when ? ` · counted ${when}` : ""}.`,
    inStockAt: (points: string) => `In stock at: ${points}.`,
    otherStrengths: "Other strengths here (for your information): none set up.",
    what: "What happens to this line",
    owed: "Owed to the patient. The patient comes back when stock arrives. Nothing is held for them.",
    outside: "The patient buys it outside. Prints the slip.",
    sendFor: (point: string) =>
      `Send for it from ${point}. The line is owed; ${point} sees the request on its Stock page.`,
    sendForLink: "Open Stock to send the request",
    returnTo:
      'Return to the prescriber for an alternative. Sends a query: "Not available, alternative needed".',
    /** B-53. */
    controlled:
      "A controlled drug cannot be sent to another pharmacy on this form. Return it to the prescriber, or record it as owed.",
    quantity: "Quantity not supplied (optional)",
    reason: "Reason recorded",
    note: "Note",
    whoTold: "Who is told",
    prescriber: "The prescriber, on the problem card.",
    /** B-29. */
    patient: "The patient: Tell the patient now.",
    /** B-62 and B-63 (the list's words, shown to staff). */
    listOutside:
      'Their list will say: "The hospital pharmacy had none. Take the paper you were given, with your prescription, to any licensed pharmacy."',
    listOwed: (phone: string) =>
      `Their list will say: "The hospital pharmacy had none today. Ask at the pharmacy, or call ${phone}, to find out when it has arrived."`,
    /** B-30. */
    noMessage: "No message is sent. The patient knows only what you tell them.",
    /** B-71. */
    smsOff: "SMS is off at this hospital.",
    /** B-28. */
    footer:
      "A line that is not supplied always carries a reason and a next step. It never closes on its own.",
    cancel: "Cancel",
    record: "Record",
    recordPrint: "Record and print",
    patientTold: "Told at the window.",
  },

  /** B-64, what the patient's list says for a declined line (written with the outcome, LO-7). */
  patientDeclined: "The pharmacy did not give this medicine. Speak to your doctor or the pharmacy.",
  decline: {
    title: "Decline to supply",
    reason: "Reason",
    note: "Note",
    patientReads: "The patient's list will say:",
    submit: "Decline",
  },
  without: {
    title: "Supply without a pharmacist",
    reason: "Reason",
    note: "Note",
    lookBack: "This supply goes on the look-back list for a pharmacist.",
    submit: "Record the reason",
  },

  open: {
    title: "Open lines",
    tabsLabel: "Open lines filter",
    tabs: { all: "All", owed: "Owed", buying_outside: "Buying outside" },
    columns: {
      patient: "Patient",
      medicine: "Medicine",
      outcome: "Outcome",
      reason: "Reason",
      since: "Open since",
      action: "Action",
    },
    supplied: (q: number, date: string) => `${q} supplied ${date}, rest owed`,
    slipPrinted: (when: string) => `Slip printed ${when}`,
    toOutside: "Change to buying outside",
    toOwed: "Change to owed",
    confirmFilled: "Confirm filled",
    close: "Close",
    printSlip: "Print the slip",
    closeTitle: "Close this line",
    filledTitle: "Confirm filled elsewhere",
    saidBy: "Who said so",
    name: "Their name (optional)",
    /** X-13. */
    explainer:
      "A line stays here until a person supplies it, confirms it was filled elsewhere, or closes it with a reason. Nothing leaves this list by itself.",
    empty: "No line is owed or being bought outside.",
    today: "today",
    ago: (n: number) => plural(n, "day", "days"),
  },

  slip: {
    box: "For the supplying pharmacy",
    nameStamp: "Name and stamp",
    supplied: "Quantity supplied",
    date: "Date",
    prescription: "Prescription",
    patient: "Patient",
    prescriber: "Prescriber",
    print: "Print",
    noPhone: (point: string) =>
      `${point} has no phone set, so the slip cannot carry its verification line. Ask the pharmacy in charge to set the point's phone, then print.`,
    controlled: "A controlled drug is never printed on this slip.",
    noLines: "No line of this prescription is being bought outside.",
    open: "Open the slip",
    found: "Slip found",
  },

  refused: {
    flagOff: "Dispensing is not switched on at this hospital.",
    failed: "Nothing was recorded. Try again.",
  },
} as const;

/** "the prescriber overrode a stop, it has a controlled drug or the child check fired" */
export function reasonList(phrases: readonly string[]): string {
  if (phrases.length <= 1) return phrases[0] ?? "";
  return `${phrases.slice(0, -1).join(", ")} or ${phrases.at(-1)}`;
}
