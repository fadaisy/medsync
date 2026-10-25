import type { SignedCopy } from "@/content/signed-copy";

import { CLINICAL_UI } from "@/content/pharmacy-clinical";

/**
 * Pharmacy Phase 3, Step 9: reconciliation at discharge. Every string the prescriber, the pharmacist and the patient
 * read for it, the patient's sheet included. Signed by the CSO on 25 Oct 2026 as written. Any change returns it to
 * `draft` until it is signed again; in production `PHARMACY_RECONCILIATION` stays off while it is draft (CS-5).
 */
export const PHARMACY_RECONCILIATION_COPY: SignedCopy = {
  status: "signed",
  signedBy: "Fadhul (CSO)",
  signedOn: "2026-10-25",
};

export const RECON_UI = {
  title: "Reconciliation",
  lead: "Medicines at discharge: before admission, on the ward and for home, side by side. The prescriber decides every line; the pharmacist checks and confirms the list. Nothing here holds a discharge.",
  packLabel: "Reconciliation rules",
  nothing: "No reconciliation is open.",
  open: "Open",
  noRules:
    "The reconciliation rules are not signed, so MedSync finds no discrepancies. Every line still needs a decision.",
  notChecked: (rules: string) => `Not checked by MedSync yet: ${rules}.`,
  states: {
    open: "Open",
    confirmed: "Confirmed",
    closed: "Closed",
    reopened: "Changed after confirmation",
  },
  cols: {
    medicine: "Medicine",
    before: "Before admission",
    ward: "On the ward",
    home: "For home",
    decision: "Decision",
  },
  admission: { continued: "Continue", stopped: "Stop", changed: "Changed", held: "Hold" } as Record<
    string,
    string
  >,
  notRecorded: "Not recorded",
  notOnWard: "—",
  lastDose: (d: string) => `last dose ${d}`,
  onHome: "On the discharge prescription",
  notOnHome: "Not prescribed for home",
  uncoded: "uncoded",
  from: (who: string) => `from ${who}`,
  decisions: {
    continue: "Continue",
    restart: "Restart",
    changed: "Changed",
    stay_stopped: "Stay stopped",
    paused: "Paused until review",
    ends_on_ward: "Ends on the ward",
    new_for_home: "New for home",
  },
  noDecision: "No decision",
  rules: {
    R1: "Continued on admission, not on the discharge prescription, no stop recorded",
    R2: "Stopped on admission, back on the discharge prescription",
    R3: "Held on admission, no decision for home",
    R4: "Given on the ward in the last 24 hours, not on the discharge prescription, no stop",
    R5: "Stopped during the stay, on the discharge prescription",
    R6: "New at discharge, never given in hospital and not taken before: confirm the indication",
    R7: "Directions differ from the admission record or the last dose, with no reason",
    R8: "The same medicine twice on the discharge prescription",
    R9: "A course with no stop date or duration",
    R10: "A discharge line missing its directions",
    R11: "On the allergy record",
    R12: "History before admission from one source only, or not recorded",
    R13: "An open pharmacy query on this patient",
    R14: "Not matched to the medicine list",
  },
  discrepancies: "Discrepancies",
  noDiscrepancy: "None found.",
  explained: (reason: string) => `Explained: ${reason}`,
  explain: "Explain",
  explainReason: "Reason",
  addTitle: "Add a discrepancy the records cannot show",
  addKinds: {
    not_recorded: "The patient says they take something not recorded",
    dose_differs: "The dose at home differs from the record",
    other: "Other",
  },
  note: "Note",
  confirm: "Confirm the list",
  confirmOff: "Confirm the list is off:",
  confirmed: (d: string) => `Confirmed ${d}`,
  reopened: "A prescriber changed a line after confirmation. Check it and confirm again.",
  close: "Close without confirming",
  closeReasons: {
    confirmed_by_phone: "Confirmed by phone",
    at_next_visit: "At the next visit",
    other: "Other",
  },
  printSheet: "Print the patient's sheet",
  save: "Save",
  // Doctor side.
  homeTitle: "Medicines for home",
  homeLead:
    "Decide every medicine for home. Changed and new medicines are prescribed as usual; then mark them here.",
  prepare: "Prepare medicines for home",
  notAdmitted: "This patient has no admission at this hospital, so there is nothing to reconcile.",
  decide: "Decide",
  reason: "Reason (needed to stop, pause or change)",
  prescribe: "Prescribe for home",
  // The patient's sheet (MR-7).
  sheetTitle: "Medicines after your stay",
  sheetIntro:
    "These are your medicines after your stay in hospital. Bring this sheet to your next visit.",
  sheetDoing: {
    carry_on: "Carry on",
    new: "New: start this",
    changed: "Changed: follow the new directions on the label",
    do_not_restart: "Stopped in hospital. Do not restart",
    paused: "Paused. Your doctor will tell you when to start again",
  },
  sheetFoot:
    "If you are unsure about any medicine, ask a pharmacist or your doctor before you take it.",
  rulesOn: "Rules switched on",
  explainReasons: "Reasons a pharmacist may give (one per line)",
  sheetNoList: "MedSync's medicine list for patients is not built yet, so this sheet is your copy.",
} as const;

/** Every pack's label: the signed Phase 3 ones plus this step's. */
export const PACK_LABEL = { ...CLINICAL_UI.packs, reconciliation_rules: RECON_UI.packLabel };
