/**
 * Lab Phase 2 copy (PROMPT-LAB-PHASE-2-ONE-MENU.md Appendix A, word for word). Every string a clinician,
 * collector or cashier reads in this slice lives here. It is clinical-safety wording: while the status is
 * `draft`, all eight Phase 2 flags stay off in production (lib/lab/feature.ts, CF-3). To sign it, the CSO
 * sets status "signed" with signedBy and signedOn.
 */
import type { SignedCopy } from "@/content/signed-copy";

export const LAB2_COPY_STATUS: SignedCopy = {
  status: "signed",
  signedBy: "Fadhul (CSO)",
  signedOn: "2026-10-13",
};

export const LAB2 = {
  availability: {
    inHouse: (hours: string, turnaround: string | null) =>
      `In the lab here · ${hours}${turnaround ? ` · usually ${turnaround}` : ""}`,
    referred: (n: string | null) => `Will be referred${n ? `, result in about ${n}` : ""}`,
    down: (time: string, n: string | null) =>
      `Analyser down since ${time}. Will be referred${n ? `, result in about ${n}` : ""}`,
    outsideHours: (time: string) => `Done from ${time}`,
    notOffered: (hospital: string) => `Not offered at ${hospital}`,
    unknown: "Not known today",
    notLinked: "Not linked to a service",
  },
  bedsideAlternative: (test: string, deviceKind: string) =>
    `Also at the bedside. ${test} can be measured on the ward ${deviceKind}.`,
  deviceKinds: {
    glucometer: "glucometer",
    ketone_meter: "ketone meter",
    hba1c_analyser: "HbA1c analyser",
    rdt_kit: "rapid test kit",
    dipstick: "dipstick",
  } as Record<string, string>,
  payment: {
    orderingLine:
      "Payment is taken at the cashier before the sample is drawn. An Immediate order is never held for payment.",
    chips: {
      paid: (receipt: string) => `Paid · ${receipt}`,
      insured: "Insured",
      waived: "Waived",
      emergency: "Emergency · not held",
      awaiting: "Awaiting payment",
    },
    collectInform: "Payment not recorded. Give a reason to collect now.",
    collectHold:
      "Payment not recorded. The cashier must record it before this sample is collected.",
    cashierRestricted: (tests: string, n: number) =>
      `${tests}, and ${n} restricted test${n === 1 ? "" : "s"}`,
    cashierFooter:
      "Restricted tests (for example HIV or TB tests) are counted, never named, on this screen.",
    neverHeld: "An Immediate order, or one from the resus desk, is never held for payment.",
  },
  label: {
    match: (label: string, patient: string, mrn: string, test: string) =>
      `${label} is ${patient}, ${mrn}. ${test}.`,
    mismatch: (label: string, other: string, otherMrn: string, patient: string) =>
      `${label} belongs to ${other}, ${otherMrn}, not ${patient}. Do not use this tube. Print a new label for ${patient}.`,
    unknown: (label: string) =>
      `No label ${label} at this hospital. Check the number or print a new label.`,
    voided: (label: string) => `${label} was voided. Use the new label.`,
    otherOrder: (label: string) =>
      `${label} is this patient's, but for another test. Use the label for this test.`,
    wristband: "Wristband checked: name and hospital number match.",
  },
  highRisk: {
    block:
      "High-risk specimen: suspected viral haemorrhagic fever. Follow this hospital's high-risk specimen procedure before you collect or handle these tubes.",
    manual:
      "High-risk specimen: suspected high-risk infection. Follow this hospital's high-risk specimen procedure before you collect or handle these tubes.",
    labelBox: "HIGH-RISK SPECIMEN",
    formBox:
      "HIGH-RISK SPECIMEN: SUSPECTED VIRAL HAEMORRHAGIC FEVER. Follow the hospital's high-risk specimen procedure before handling. Do not open or process on the open bench.",
    formFooter:
      "MedSync shows this warning because the clerking desk flagged the patient. The testing pathway for suspected viral haemorrhagic fever is set by the Ministry of Health.",
    tag: "High-risk specimen",
  },
  scan: {
    received: (label: string, test: string, patient: string, time: string) =>
      `Received ${label} · ${test} · ${patient} · ${time}`,
    already: (time: string, cadre: string) => `Already received at ${time} by ${cadre}.`,
    notFound: (label: string) => `No specimen with label ${label} at this hospital.`,
    notCollected: "Not marked collected. Check with the ward.",
  },
  live: {
    on: "Live · new specimens appear by themselves",
    paused: "Live updates paused. Refreshing every 15 seconds.",
  },
  workingDiagnosis: {
    button: "Show the working diagnosis",
    recorded: (time: string) => `You opened this at ${time}. Each opening is recorded.`,
    masked: "A diagnosis is recorded that you do not have access to.",
  },
  basis: {
    scheme: (result: string, scheme: string, band: string) =>
      `${result} is flagged against ${scheme} at this hospital. The lab's reference interval, ${band}, is shown to the doctor for information.`,
    fallback: (reason: string) => `Flagged on the reference interval: ${reason}.`,
    pregnancyNotRecorded: "Pregnancy not recorded: the non-pregnant cut-off was used.",
    altitudeNotAdjusted: "Altitude not adjusted: no elevation is signed for this hospital.",
  },
  egfr: {
    caveat: "eGFR assumes creatinine is stable. It is not valid in acute kidney injury.",
    notReported: (reason: string) => `eGFR not reported: ${reason}.`,
  },
  profile: {
    labOnly: (n: number) => `${n} kept for the lab only`,
    researchUse: "The analyser's research-use parameters are never imported or released.",
  },
  bedside: {
    notForDiagnosisGlucose:
      "Not for diagnosis. The diabetes thresholds signed at this hospital apply to laboratory plasma glucose, so a glucometer reading gets no category.",
    doctorLine: "Not for diagnosis: confirm with a laboratory plasma glucose.",
    expiredLot: (lot: string, date: string) =>
      `Lot ${lot} expired on ${date}. A result from an expired lot cannot be saved. Use a strip from a current lot.`,
    hiPrompt: "The meter reads above its range. Consider marking this result critical.",
    notChecked: "Bedside results are not checked by the lab.",
    tag: "Bedside",
  },
  ncd: {
    filled: (source: string, when: string) => `${source}, released ${when}`,
    readOnly: "A filled value cannot be typed over. To correct it, the lab amends the result.",
    none: (window: string) => `No result in the last ${window}`,
    unitDiffers: (value: string, unit: string, date: string) =>
      `${value} ${unit} on ${date} could not be used: unit differs.`,
    amended: (time: string) => `Updated from an amended result at ${time}.`,
    outside: (laboratory: string, date: string) => `Outside result · ${laboratory} · ${date}`,
  },
  drafts: {
    check:
      "Read {table or page} in the paper before this goes for sign-off. Two readings of the table gave different numbers.",
    header:
      "Nothing here is in force. A draft is used only after you and the Clinical Safety Officer sign it.",
  },
} as const;
