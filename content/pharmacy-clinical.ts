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

/**
 * 5.1, Law 4: with signed pairs in force, the notice's "does not check drug interactions" clause becomes the signed
 * partial sentence; the rest of the Phase 1 wording is kept as it is. With none in force, the text is unchanged.
 */
export const withSignedPairs = (text: string, pairs: number | null): string =>
  pairs
    ? text.replace(
        /MedSync does not check drug interactions at this hospital, and (.)/,
        (_, c: string) => `${CLINICAL_B.noticePartial(pairs)} ${c.toUpperCase()}`,
      )
    : text;

/** The Clinical content page (5.2) and the shared action words. Draft with the rest of this file. */
export const CLINICAL_UI = {
  group: "Clinical",
  flagOff: "Clinical pharmacy is not switched on at this hospital.",
  failed: "That did not save. Try again; if it keeps failing, tell the pharmacy in charge.",
  title: "Clinical content",
  lead: "Interaction pairs and the settings that decide how they show. Nothing here acts until it is signed, and a draft is seen only on this page.",
  packs: {
    interaction_pair: "Interaction pairs",
    alert_levels: "Alert levels",
    lookback_windows: "Look-back windows",
    check_worth_signing: "A check worth signing",
    query_codes_added: "Query codes added",
    pcne_map: "PCNE map",
    aware_pack: "AWaRe groups",
    review_settings: "Antibiotic review settings",
    reaction_timelines: "Reaction reporting timelines",
  },
  status: {
    draft: "Draft",
    reviewer_signed: "Signed once",
    in_force: "In force",
    withdrawn: "Withdrawn",
  },
  blocked: {
    not_matched: "Not matched to a medicine on this hospital's list",
    waits_for_class_map: "Waits for the drug-class map",
  },
  inForce: (n: number) => `${n} in force`,
  drafts: (n: number) => `${n} waiting`,
  importLabel: "Import candidate pairs",
  importDone: (c: {
    matched: number;
    not_matched: number;
    waits_for_class_map: number;
    skipped: number;
  }) =>
    `Imported as drafts: ${c.matched} matched, ${c.not_matched} not matched, ${c.waits_for_class_map} waiting for the drug-class map, ${c.skipped} already here.`,
  importAgain: "This file was imported before. Nothing changed.",
  newPair: "New pair",
  edit: "Edit",
  editTitle: (k: string) => `Edit ${k}`,
  saveDraft: "Save as draft",
  sign: "Sign",
  signTitle: (k: string) => `Sign ${k}`,
  signLead:
    "You confirm with your password and code. The entry goes into force with two signers, or with one and the exception written.",
  role: "Signing as",
  roles: {
    cso: "Clinical Safety Officer",
    pharmacist_reviewer: "Pharmacist reviewer",
    ams_chair: "AMS committee chair",
    pharmacy_in_charge: "Pharmacy in charge",
  },
  exception: "Exception, if you sign alone",
  exceptionHint:
    "For example: CSO signs alone (ADR 0281). No second signer is named at this hospital yet.",
  withdraw: "Withdraw",
  withdrawTitle: (k: string) => `Withdraw ${k}`,
  withdrawReason: "Why",
  fields: {
    a: "First medicine",
    b: "Second medicine",
    severity: "Severity",
    effect: "What happens",
    management: "What to do",
    source: "Source (reference, edition, section or page)",
    byDesign: "Given together by design (never above Note in the dialog)",
    restricted: "Restricted class",
    none: "None",
    dialog: "In the prescribing dialog",
    review: "On the review screen",
    suppressionDays: "Suppression window, days",
    chartedHours: "Charted doses count for, hours",
    suppliedDays: "Supplies count for, days",
    minimum: "Minimum acted-on queries in the period",
    intervalAccess: "Review Access antibiotics on day (leave empty for no prompt)",
    intervalWatch: "Review Watch antibiotics on day (leave empty for no prompt)",
    intervalReserve: "Review Reserve antibiotics on day (leave empty for no prompt)",
    noCultureWindowHours: "Started with no culture sent: window either side of the start, hours",
    seriousHours: "Serious reports due within, hours",
    otherDays: "Other reports due within, days",
  },
  importAware: "Import the AWaRe edition",
  levels: { stop: "Stop", check: "Check", note: "Note", hidden: "Not shown" },
  reference: "Reference only, never filled in for you.",
  nothing: "Nothing here yet.",
  source: (s: string | null) => (s ? `Source: ${s}` : "No source yet"),
  version: (v: number) => `Version ${v}`,
} as const;

/** Interventions (5.4). Draft with the rest of this file. */
export const INTERVENTIONS_UI = {
  title: "Interventions",
  lead: "What the pharmacy's queries add up to, by type and by dispensing point. Counts only: open a query from the queue to see who it was for.",
  period: (days: number) => `Last ${days} days`,
  periods: [7, 30, 90] as const,
  figures: {
    sent: (n: number, withdrawn: number, open: number) =>
      `${n} sent (${withdrawn} withdrawn, ${open} still waiting)`,
    answered: (n: number) => `${n} answered`,
    acted: (n: number, share: string) => `${n} changed or stopped (${share} of answered)`,
    kept: (n: number, clarified: number) =>
      `${n} kept as written, each with a reason; ${clarified} questions answered`,
  },
  byType: "By type",
  byWard: "By dispensing point",
  cols: [
    "Type",
    "Sent",
    "Answered",
    "Changed",
    "Stopped",
    "Kept",
    "Median time to answer",
  ] as const,
  minutes: (m: number | null) =>
    m === null ? "No answers" : m < 60 ? `${Math.round(m)} min` : `${(m / 60).toFixed(1)} h`,
  waiting: (n: number) => `${n} waiting for an answer. Nothing escalates by itself.`,
  worth: "A check worth signing",
  worthLine: (type: string, n: number) =>
    `${type}: ${n} queries were acted on. A prescribing check might catch these before they reach the window.`,
  worthNone: "No query type reached the signed minimum in this period.",
  draftCheck: "Draft a check for review",
  download: "Download counts (CSV)",
  barAlt: (name: string, acted: number, other: number) =>
    `${name}: ${acted} changed or stopped, ${other} kept or unanswered.`,
  scale: (max: number) => `Each bar is drawn on one scale, 0 to ${max} queries.`,
} as const;
