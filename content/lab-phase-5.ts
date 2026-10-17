/**
 * Lab Phase 5 copy (docs/lab/phase-5/PROMPT-LAB-PHASE-5.md Appendix A, word for word). Every string a patient,
 * clinician, lab user or IPC user reads in this slice lives here as a template: `{name}` marks a value filled in by
 * the caller. It is clinical-safety wording: while the status is `draft`, the Phase 5 flags stay off in production
 * (lib/lab/feature.ts, CF-3). The CSO signs patient and clinician text; the IPC lead signs the IPC text first.
 */
import type { SignedCopy } from "@/content/signed-copy";

export const LAB5_COPY_STATUS: SignedCopy = {
  status: "draft",
  signedBy: null,
  signedOn: null,
};

/** Each line's comment is who reads it. */
export const LAB5 = {
  /** patient */
  notReadyReview: "Your doctor looks at this first. It will appear here after that.",
  /** patient */
  notReadyLab: "Waiting for the lab.",
  /** patient */
  notReadyReferred: "Sent to another lab. Expected back about {date}.",
  /** patient */
  notReadyHeld: "Not ready to show yet.",
  /** patient */
  inPerson: "Some tests are always given to you in person by a health worker, not in the app.",
  /** patient */
  statusWithin: "Within the usual range",
  /** patient */
  statusHigher: "Higher than the usual range",
  /** patient */
  statusLower: "Lower than the usual range",
  /** patient */
  statusNoRange: "No range for this test",
  /** patient */
  rangeNote: "The shaded part is the usual range for this lab. Ranges differ between labs.",
  /** patient */
  noPlainWords: "Ask your doctor what this means.",
  /** patient */
  nextFixed:
    "If you feel very unwell before then, press Emergency or go to the nearest health facility.",
  /** patient */
  seenByDoctor: "Your doctor has seen this and will talk with you on {date}.",
  /** patient */
  beingChecked: "This result is being checked.",
  /** patient */
  corrected: "Corrected on {date}.",
  /** patient */
  provenance:
    "Checked and released by the {hospital} laboratory on {date}. Seen by your doctor on {date2}.",
  /** patient (SMS) */
  resultsReadySms:
    "{Hospital}: you have new results in MedSync. Open the app, or ask at your next visit. Reply STOP to stop these messages.",
  /** patient */
  consent: "Show my results in the app. You can turn this off at any time.",
  /** clinician */
  criticalToPatient:
    "A critical result appears in the patient's app only after you record that you have spoken with them about it.",
  /** clinician */
  holdClinician:
    'Holding is recorded with your reason and reviewed. The patient sees "Not ready to show yet".',
  /** lab */
  deltaCheck:
    "{Component} changed more than this lab expects in {interval}. {meaning}. Check the label and the request, and the previous specimen, before releasing.",
  /** lab */
  deltaNote: "Delta checks inform. Release needs a decision on each one.",
  /** lab */
  releasedByRule: "Released by rule {ruleSet} v{version}: {passed} of {total} checks passed.",
  /** lab */
  waited: "Waited for a person: {check}.",
  /** lab */
  suspended:
    "Autoverification for {test} on {analyser} is suspended: {reason}. Results wait for a person.",
  /** IPC */
  ipcMinimum:
    "Alerts come from released results that match the signed alert list. IPC sees the condition, the place and the precaution, not the whole result or chart.",
  /** IPC (SMS to staff) */
  ipcAlertSms: "New IPC lab alert at {hospital}. Open MedSync.",
  /** IPC */
  screeningResult: "Screening result: confirm.",
  /** IPC, ward */
  patientFlag:
    "A flag now sits on this patient's record. If they are readmitted or moved, the ward and IPC see it at once. Only IPC clears it.",
  /** IPC, ward */
  readmissionAlert: "Flagged patient {movement} to {place}: {condition}.",
  /** IPC */
  idsrSupport:
    "These support the surveillance focal person. Cases are reported by the focal person, not sent from here.",
  /** IPC */
  needsMicrobiology: "Waiting for the microbiology module.",
  /** all */
  noData: "No data",
  /** clinician: the "The patient sees it" chip (§5.4's table; the extra states are drafted for the CSO's signature) */
  sees: {
    in_person: "In person only",
    minor: "Under the minors rule: not in the app",
    no_consent: "Patient has not agreed to see results",
    not_released: "Not released",
    rules_unsigned: "Release rules not signed",
    when_reviewed: "When you mark it reviewed",
    after_told: "After you have spoken to them",
    held: "Held until {date}",
    being_checked: "Being checked",
    visible: "Can see it",
    seen: "Seen by the patient {date}",
  },
  /** clinician */
  agedResults: "Released more than {days} days ago and not yet reviewed.",
} as const;

export { fill } from "@/content/lab-phase-3";
