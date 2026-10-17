/**
 * Lab Phase 4 copy (docs/lab/phase-4/PROMPT-LAB-PHASE-4.md Appendix A, word for word, plus A20 from
 * gate-a-proposal.md §2). Every string a lab user, clinician or lead reads in this slice lives here as a template:
 * `{name}` marks a value filled in by the caller. It is clinical-safety wording: while the status is `draft`, the
 * Phase 4 flags stay off in production (lib/lab/feature.ts, CF-3). The CSO signs the set (the IPC lead signs
 * `highRiskReferral` first) by setting status "signed" with signedBy and signedOn.
 */
import type { SignedCopy } from "@/content/signed-copy";

export const LAB4_COPY_STATUS: SignedCopy = {
  status: "signed",
  signedBy: "Fadhul (CSO)",
  signedOn: "2026-10-17",
};

/** Each line's comment is who reads it. */
export const LAB4 = {
  /** clinician */
  orderSent: "Sent to {destination} on {date}. Expected about {expected}.",
  /** clinician */
  orderOverdue: "Sent to {destination} on {date}. Overdue since {since}; the lab is following up.",
  /** clinician */
  orderNotStated:
    "Sent to {destination} on {date}. The lab has no stated turnaround for this test.",
  /** clinician */
  rejectedByReferenceLab:
    "{Destination} could not test the {specimen}: {reason}. A new sample is needed.",
  /** clinician */
  lost: "The {specimen} sent to {destination} on {date} has not arrived. The lab has opened an investigation. Please decide whether to take a new sample.",
  /** clinician */
  cancelledAfterSending: "Cancelled by the doctor after sending.",
  /** clinician */
  provenancePaper:
    "Done at {partner}. Their report {number}, {time}, authorised by {name}. Ranges are theirs, as printed. Entered from the paper report by {enteredBy}, checked by {checkedBy}.",
  /** clinician */
  provenanceOnePerson: "Entered by one person. A second check is due.",
  /** clinician */
  provenanceElectronic:
    "From {partner}'s system, message {id}. Ranges are theirs. Filed by {user}.",
  /** clinician */
  filedAfterMismatch: "Filed by hand after a mismatch, confirmed with {partner} by {method}.",
  /** clinician */
  noRangePrinted: "No range printed.",
  /** clinician, lab */
  unknownUnit: "{Unit} is not in this hospital's unit list. Ask the laboratory lead to add it.",
  /** lab (A20) */
  unitNotConvertible:
    "{Unit} cannot be converted to this hospital's unit, so the critical check did not run. Read the value against the report and call the ward if it is dangerous.",
  /** lab */
  matchingRule:
    "A result files by itself only when its sample or form number matches an open order and one more thing agrees. Anything else waits here. MedSync never creates a patient from a result and never guesses.",
  /** lab (signed by the IPC lead) */
  highRiskReferral:
    "{labNo} is a high-risk specimen. Do not add it to a routine manifest or give it to the hub rider. Follow the outbreak procedure: it is packed as Category A by trained staff and goes to the national reference laboratory by the arranged transport. Tell the infection prevention lead and the district surveillance focal person now. MedSync records the referral; it does not arrange the transport.",
  /** lab, courier */
  manifestFooter:
    "No patient names on this sheet. Patient details are on each request form inside the package.",
  /** lab */
  addToManifestDisabled: "Scan {n} more form numbers and tick {m} packing items first.",
  /** lab */
  mapBeforeSending: "{Test} has no code for {partner}. Ask the laboratory lead to map it.",
  /** lab */
  notConnectedCphl:
    "Needs onboarding with NHLDS, a data-sharing agreement and their interface specification. Until then: their paper form, the hub rider, and results entered by hand.",
  /** lab */
  notConnectedLdr: "No submission specification is published yet.",
  /** lab */
  notUsedHereAlis: "This hospital's lab runs on MedSync.",
  /** lab */
  interfacedPreliminary: "From {analyser}, preliminary. A technologist releases it.",
  /** lab, clinician */
  interfacedEdited: "Changed from the analyser's {value} by {user}: {reason}.",
  /** lab */
  unitDiffers: "Not filed: the analyser sent {sent}; this test expects {expected}.",
  /** lab */
  mappingSource: "Codes and units come from the maker's interface document, never from memory.",
  /** lab */
  clockSkew:
    "The {analyser} clock is {n} minutes {direction}. Result times use the time the analyser finished, so set the analyser's clock.",
  /** lab */
  bridgeNotHeard:
    "Bridge {name} not heard since {time}. Results are kept on the bridge if it is running. Type results from the analyser's printout until it returns.",
  /** lab */
  crossBorderRefused:
    "{Partner} processes data outside Uganda. Record the patient's consent or the safeguards before sending.",
  /** lab, clinician */
  noData: "No data",
} as const;

export { fill } from "@/content/lab-phase-3";
