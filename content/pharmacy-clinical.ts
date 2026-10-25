import type { SignedCopy } from "@/content/signed-copy";

/**
 * Pharmacy Phase 3: clinical pharmacy and stewardship. Every string staff or patients read on the Clinical pages,
 * the dialog's interaction line and the notice. Draft until the CSO signs (Appendix B); in production the Phase 3
 * flags stay off while this is draft (CS-5). Never edit the status here without a signature.
 */
export const PHARMACY_CLINICAL_COPY: SignedCopy = {
  status: "draft",
  signedBy: null,
  signedOn: null,
};

/** Appendix B, word for word (first merge). */
export const CLINICAL_B = {
  noticePartial: (n: number) =>
    `MedSync checks ${n} signed interaction ${n === 1 ? "pair" : "pairs"} between medicines on this hospital's list. It does not check medicines bought outside, herbal medicines, or pairs not yet signed. No alert does not mean no interaction.`,
  dialogNothingFired: (n: number) =>
    `Checked against ${n} signed ${n === 1 ? "pair" : "pairs"}. Medicines bought outside and herbal medicines are not checked.`,
  levelsUnsigned: "Interaction alert levels are not signed yet.",
  suppressed: (date: string, cadre: string, reason: string) =>
    `Answered ${date} by ${cadre}: ${reason}.`,
  firedAfter: "Fired after prescribing. The prescriber has not seen this alert.",
  restrictedPair:
    "This alert involves a medicine in a restricted class. Ask a clinician who may see this patient's full record.",
  reportProblem: "Report a problem with this entry",
  checkWorthSigningUnsigned: "The minimum for this suggestion is not set. The CSO sets it.",
} as const;

export const SEVERITY_WORD = {
  contraindicated: "Contraindicated",
  serious: "Serious",
  monitor: "Monitor",
} as const;

/** The dialog's line for one fired pair: as signed, with its source and version (Law 8, rule 1). */
export const firedLine = (f: {
  severity: keyof typeof SEVERITY_WORD;
  adding: string;
  other: string;
  effect: string;
  management: string;
  source: string | null;
  key: string;
  version: number;
}) =>
  `${SEVERITY_WORD[f.severity]}: ${f.adding} with ${f.other}. ${f.effect} ${f.management} Source: ${f.source ?? "not recorded"}. Entry ${f.key}, version ${f.version}.`;
