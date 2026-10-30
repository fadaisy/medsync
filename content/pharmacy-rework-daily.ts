import type { SignedCopy } from "@/content/signed-copy";

/**
 * The reworked pharmacy's daily work, in its own words (docs/pharmacy/rework/PRD.md §6.1, §6.2, §6.4): Today, the
 * checks panel at Dispense, Medicines and the Store's count and order. Draft until the Clinical Safety Officer and a
 * registered pharmacist outside the build sign it.
 */
export const PHARMACY_REWORK_DAILY_COPY: SignedCopy = {
  status: "draft",
  signedBy: null,
  signedOn: null,
};

export const RX_CHECKS = {
  title: "Checks before hand-over",
  lead: "What the prescriber was warned about. Answer each one on a line you are giving.",
  none: "No checks were raised when this was prescribed.",
  level: { stop: "Stop", check: "Check" },
  prescriberSaid: "Prescriber answered: {answer}",
  answers: {
    checked: "Checked, give it",
    prescriber_confirmed: "Prescriber confirmed",
    query: "Talk to the prescriber",
  },
  answered: {
    checked: "Checked: {reason}",
    prescriber_confirmed: "Prescriber confirmed",
    query: "Held for the prescriber",
  },
  reasons: ["Dose checked against the reference", "Benefit outweighs the risk", "Counselled the patient", "Already discussed on the ward round"],
  stopOnly: "A stop is given only when the prescriber confirms.",
  queryNext: "The line is held. Send the query from the line's own menu so the prescriber sees it.",
  blocked: "{n} checks on lines you are giving are not answered yet.",
  refused: {
    notHere: "That line is not at your hospital.",
    noFlag: "That check is not on this line.",
    stopNeedsPrescriber: "A stop is given only when the prescriber confirms.",
    why: "Choose why it is safe to give.",
    open: "Answer the checks first: {titles}.",
  },
} as const;
