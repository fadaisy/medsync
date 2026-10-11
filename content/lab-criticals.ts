/**
 * Lab Phase 1 copy (PROMPT-LAB-PHASE-1 Appendix A). Clinical-safety wording: `draft` until the CSO signs
 * it, and the flags that need it are refused in production while it is (cutover CO-1, gate-a §9). The
 * SMS bodies are the drafts a hospital's first templates start from; every rendering of them passes the
 * banned-term scan in CI (MS-2, tests/lab/phase-1/messages-downtime-cutover.test.ts).
 */
import type { SignedCopy } from "@/content/lab";

export const CRITICALS_COPY_STATUS: SignedCopy = {
  status: "draft",
  signedBy: null,
  signedOn: null,
};

export const CRITICALS_COPY = {
  noticeOff: {
    lead: "Automatic critical flagging is off.",
    body: "MedSync will not flag critical values at this hospital until the critical limits are signed. Follow the lab's critical-call procedure and mark critical results by hand.",
  },
  noticeOn: {
    lead: "Critical limits are signed.",
    body: "MedSync flags critical values itself. You can still mark any other result critical by hand.",
  },
  sampleChecks: "The label matches this patient, and there is no visible haemolysis or clot.",
  couldNotCheck: {
    not_enough_sample: "Not enough sample",
    analyser_down: "Analyser down",
    no_reagent: "No reagent",
    other: "Other",
  },
  panelFootnote:
    "All results on this report are released as final. The mark, the check and every alert are recorded against your name.",
  notSent: "Released. The alert was NOT sent. Phone the ward now and log the call.",
  emptyLevel: "Nobody is set up to receive this at the next level. Phone the ward now.",
  noResponseTimes:
    "No response time is signed for this hospital, so this alert will not escalate by itself. Phone the ward now.",
  escalationsDelayed: "Escalations may be delayed. Phone the ward for any open critical.",
  alertTitle: (test: string, value: string, unit: string, direction: "low" | "high") =>
    `Critical result: ${test} ${value} ${unit}, ${direction}.`,
  escalatedTitle: "Escalated to you",
  escalatedLine: (minutes: number, rolePlace: string) =>
    `Not acknowledged for ${minutes} minutes by ${rolePlace}.`,
  correctionTitle: (test: string, was: string, now: string, unit: string) =>
    `Corrected result: ${test} was ${was}, is now ${now} ${unit}.`,
  responses: {
    reviewing: "Reviewing the patient now",
    asked_team: "Asked the ward team to act",
    already_aware: "Already aware",
  },
  phoneAck: (time: string) =>
    `The lab recorded your phone acknowledgement at ${time}. Not you? Tell us.`,
  smsDraft: {
    level0:
      "MedSync: a critical lab result on {place} needs your acknowledgement. Open MedSync, or call the lab on {lab number}.",
    escalation:
      "MedSync: a critical lab result on {place} has not been acknowledged. It is now with you. Open MedSync, or call the lab on {lab number}.",
  },
  noRange: {
    no_band_for_age: "No range for this age",
    sex_or_age_missing: "No range: sex or age not recorded",
    no_signed_range: "Unsigned range",
  },
  noLimitForAge: "No critical limit for this age",
  entryCheck: (value: string, unit: string, test: string) =>
    `${value} ${unit} is outside the usual entry range for ${test}. Confirm this is the value on the analyser.`,
  noUnit:
    "This test has no unit yet, so it cannot be resulted. Ask the laboratory lead to set it in the test catalogue.",
  downtimeTag: (resulted: string, entered: string, form: number) =>
    `Entered after downtime · Resulted ${resulted} · entered ${entered} · paper form ${form}`,
  notRegistered: "Register this patient at reception first.",
} as const;
