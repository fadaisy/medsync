/**
 * Hand-over and supply (Pharmacy Phase 1, 5.3.1, 5.6, 5.7, 5.7.1; gate-a-content.md Part 1 and §2.7,
 * §2.10, §2.13, §2.15; gate-a-wireframes.md §3.4, §6, §7.2 to §7.4, §14). Every visible string on the
 * hand-over, the label page, Supplied today, the look-back tab and the reverse and correct dialogs.
 * Appendix B rows are quoted exactly as written (B-xx, X-x); the rest are interface words. Signed
 * under PHARMACY_PHASE1_COPY_STATUS on 13 Oct 2026 (RD-4). The reason and route lists are Appendix D's drafted codes:
 * unsigned, a point cannot go live (RD-1), and outside production they act, labelled draft.
 */

/** §2.7 Batch other than first to expire (drafted). `other` needs text. */
export const BATCH_CHOICE_REASONS = {
  first_not_found: "First-to-expire batch not found on the shelf",
  first_unfit: "First-to-expire batch damaged or unfit",
  other: "Other (with text)",
} as const;
export type BatchChoiceReason = keyof typeof BATCH_CHOICE_REASONS;

/** §2.7 Reversal (Appendix D). */
export const REVERSAL_REASONS = {
  handed_back: "Handed back at the window",
  wrong_patient: "Recorded against the wrong patient",
  entered_in_error: "Entered in error",
  other: "Other (with text)",
} as const;
export type ReversalReason = keyof typeof REVERSAL_REASONS;

/** §2.7 Recorded in error (Appendix D). */
export const CORRECTION_REASONS = {
  wrong_patient: "Wrong patient",
  wrong_entry: "Wrong medicine or quantity entered",
  never_handed_over: "Never handed over",
  other: "Other (with text)",
} as const;
export type CorrectionReason = keyof typeof CORRECTION_REASONS;

/** §2.10 Identity routes, B-40 (Appendix B). */
export const IDENTITY_ROUTES = {
  card_shown: "The card or prescription with the patient's number was shown",
  known: "Known to staff",
  other: "Other (with a note)",
} as const;
export type IdentityRoute = keyof typeof IDENTITY_ROUTES;

/** §2.15 Counselling points (Appendix D). Recorded as ticked; never required. */
export const COUNSELLING_POINTS = {
  purpose: "What each medicine is for",
  how_when: "How and when to take it",
  missed_dose: "What to do about a missed dose",
  side_effects: "Side effects to come back for",
  outside: "The medicine to buy outside and where the paper is",
} as const;

/** §2.13, B-41: the proposed warning line. */
export const WARNING_LINES = ["Keep out of the reach of children."] as const;

/** Why a supply is on the look-back list (5.7). */
export const LOOK_BACK_REASONS: Record<string, string> = {
  supplied_without_review: "Supplied without a pharmacist",
  disputed_phone_answer: "Supplied on a phone answer the clinician later disputed",
  // Pharmacy Phase 2 (SL-14, S33b): a downtime back-entry of a recalled or quarantined batch.
  batch_recalled_or_quarantined: "Batch was recalled or quarantined",
};

const fill = (s: string, v: Record<string, string | number>) =>
  s.replace(/\{([\w ]+)\}/g, (m, k: string) => (k in v ? String(v[k]) : m));
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export const SUPPLY = {
  fill,

  handover: {
    title: "Hand-over",
    back: "Back to the prescription",
    /** X-8. */
    reviewed: (cadre: string, time: string) => `Reviewed by ${cadre} · ${time}`,
    /** X-9. */
    standard: "Standard lane: checked at supply",
    /** B-43. */
    without: (reason: string) =>
      `Supplied without a pharmacist: ${reason}. A pharmacist will look at this supply.`,
    nothing:
      "No line of this prescription is ready to hand over. Save a decision on the review screen first.",
    section: {
      who: "Confirm who is at the window",
      supplying: "Supplying now",
      explained: "Explained",
      payment: "Payment status",
    },
    collectedBy: "Collected by",
    patient: "The patient",
    someone: "Someone else",
    wardStaff: "A member of ward staff",
    name: "Their name",
    relationship: "Relationship to the patient",
    staffPick: "Who is collecting",
    choose: "Choose",
    ward: "Ward",
    first: "First",
    /** X-10. */
    firstAttest: "They said the patient's full name, and it matches.",
    second: "Second",
    secondLabel: "Date of birth or phone number on file, as the person says it",
    kind: { date_of_birth: "Date of birth", phone: "Phone number" },
    check: "Check",
    match: "Matches.",
    attempt: (n: number, of: number) => `(attempt ${n} of ${of})`,
    closed:
      "Five wrong tries today. The typed check is closed for this patient until the pharmacy in charge reopens it. Use Identified another way.",
    reopen: "Reopen the typed check",
    anotherWay: "Identified another way",
    note: "Note",
    noteOther: "Note (needed for Other)",
    wardRoute: "Collected by ward staff: the typed check is not asked.",
    columns: {
      medicine: "Medicine",
      quantity: "Quantity",
      batch: "Batch · expiry",
      outcome: "Outcome",
    },
    quantityName: (medicine: string, unit: string) => `${medicine}, quantity in ${unit}`,
    left: (n: number, unit: string) => `${n} ${unit} left to supply`,
    strengthCheck: "The strength on the pack matches the prescription.",
    restReason: "Why the rest is not supplied now",
    noStock: (n: number, unit: string) => `Only ${n} ${unit} on the shelf here.`,
    labelMode: {
      printed: "Labels at this point: Printed.",
      by_hand: "Labels at this point: Written by hand.",
    },
    /** B-42. */
    byHand: "I have written the label on each envelope.",
    labelsAfter: "Print the labels once the hand-over is recorded: one label per batch supplied.",
    counselling: "What was explained",
    language: "Language it was explained in (optional)",
    paymentDetail: { paid: "Receipt reference (optional)", insured: "Scheme" },
    paymentRequired: "This hospital needs a payment status before the hand-over.",
    when: "When you record it",
    record: "Record hand-over",
    backTo: "Back",
    outcome: {
      supplied: "Supplied",
      owed: "Owed (stays under Open lines)",
      buying_outside: "Buying outside (stays under Open lines)",
      part_supplied: "Part supplied (the rest stays under Open lines)",
    },
    recorded: (time: string) => `Hand-over recorded at ${time}.`,
    printLabels: "Print labels",
    printFailed: "Printing failed or was cancelled?",
    writeByHand: "Write them by hand instead",
    switched: "Recorded: the labels for this hand-over are written by hand.",
    printSlip: "Print the slip for the rest",
    toQueue: "Back to the queue",
    supplied: "Supplied today",
  },

  /** "When you record it" (5.6), with real numbers. */
  summary: {
    leaves: (n: number, unit: string, medicine: string, batches: string) =>
      `${n} ${unit} of ${medicine} leave ${batches}.`,
    stays: (medicine: string, outcome: string, n: number | null, unit: string) =>
      `${medicine} stays under Open lines (${outcome}${n === null ? "" : `, ${n} ${unit} not supplied`}).`,
    closes: (medicine: string) => `${medicine} is supplied in full and leaves Open lines.`,
    queue: "The prescription leaves the queue once every line has an outcome.",
  },

  change: {
    open: "Change",
    title: (medicine: string) => `${medicine} · product and batch`,
    product: "Product",
    onShelf: (n: number, unit: string) => `${n} ${unit} on the shelf`,
    batch: "Batch (first to expire is chosen)",
    batchQty: (batch: string) => `Quantity from ${batch}`,
    strength: "Different strength (pharmacist only)",
    strengthNot: "Not offered: no signed substitution rule.",
    reason: "Choosing another batch needs a reason",
    typeFirst: "Type the quantity first.",
    mustAdd: (n: number) => `The batches must add up to ${n}.`,
    use: "Use these",
    cancel: "Cancel",
    chosen: (rows: string) => `Chosen: ${rows}`,
  },

  supplied: {
    title: "Supplied today",
    on: (date: string) => `Supplied on ${date}`,
    day: "Day",
    show: "Show",
    tabsLabel: "Supplied today",
    today: "Today",
    /** B-44. */
    lookBack: (n: number) => `Look-back · ${n} waiting`,
    lookBackNone: "Look-back",
    filter: "Identified another way",
    columns: {
      time: "Time",
      patient: "Patient",
      lines: "Lines and quantities",
      batches: "Batches",
      by: "Supplied by",
      reviewed: "Reviewed by",
    },
    empty: "Nothing was supplied at this point on this day.",
    choosePoint: "Choose the dispensing point you are working at.",
    supplyNow: "Supply now",
    count: (n: number) => plural(n, "hand-over", "hand-overs"),
    reprint: "Reprint labels",
    reverse: "Reverse",
    correct: "Correct the record",
    /** B-45. */
    reversed: (time: string, cadre: string, reason: string) =>
      `Reversed ${time} by ${cadre}: ${reason}`,
    reversedSr: "Reversed:",
    /** B-46. */
    inError: (reason: string) => `Recorded in error. ${reason}`,
    another: (how: string) => `Identified another way: ${how}`,
    collectedBy: (name: string, relationship: string) => `Collected by ${name} (${relationship})`,
    wardStaff: "Collected by ward staff",
    byHand: "Labels written by hand",
  },

  look: {
    columns: { time: "Supplied", patient: "Patient", medicine: "Medicine", why: "Why" },
    empty: "Nothing is waiting for a look-back.",
    looked: "Looked at",
    title: "Record the look-back",
    note: "Note",
    submit: "Looked at",
  },

  reverse: {
    title: "Reverse this supply",
    reason: "Reason",
    fit: "Is the pack back and fit to return to the shelf?",
    fitYes: (n: number, unit: string, batch: string) => `Fit: ${n} ${unit} return to ${batch}`,
    fitNo: (n: number, unit: string, batch: string) =>
      `Not fit: ${n} ${unit} return to ${batch} and are written off, with the reason`,
    after:
      "The line returns to where it stood before this hand-over. The prescriber is told, and the entry leaves the patient's list.",
    submit: "Reverse",
    controlled:
      "A controlled supply is put right by a holder of the controlled drugs permission, with a witness.",
    notToday: "A supply can be reversed only on the day it was recorded. Use Correct the record.",
  },

  correct: {
    title: "Mark as recorded in error",
    reason: "Reason",
    note: "Note",
    noStock: "No stock moves: put the shelf right with a count.",
    after:
      "The entry leaves the patient's list and the line returns to where it stood before this hand-over.",
    submit: "Mark in error",
  },

  labels: {
    title: "Labels",
    print: "Print labels",
    reprint: "Reprint labels",
    count: (n: number) => plural(n, "label", "labels"),
    byHand: "The labels for this hand-over were written by hand.",
    notLogged: "The print was not logged. Print anyway, and tell the pharmacy in charge.",
    back: "Back to Supplied today",
  },

  refused: {
    notToday: "A supply can be reversed only on the day it was recorded.",
    later: "A later hand-over of this line stands. Put that one right first.",
    done: "This supply has already been reversed or marked in error.",
    notHere: "That hand-over is not at your hospital.",
    controlledReverse:
      "A controlled supply is put right by a holder of the controlled drugs permission, with a witness.",
    permission: "You do not have permission to do this.",
    closed:
      "Five wrong tries today. The typed check is closed for this patient until the pharmacy in charge reopens it.",
    notClosed: "The typed check is open for this patient.",
  },
} as const;
