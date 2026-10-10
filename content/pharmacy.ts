import type { SignedCopy } from "@/content/signed-copy";

/**
 * Pharmacy workspace copy (Pharmacy Phase 0, gate-a-proposal §5.7 / prompt Appendix B). Every
 * visible string on /pharmacy lives here. The notice and the cautions are clinical-safety wording:
 * each carries a status, and `pharmacyWorkspaceLiveFor` keeps the workspace off in production while
 * any is `draft` (CS-5). To sign, the CSO sets status "signed" with signedBy and signedOn.
 */

const DRAFT: SignedCopy = { status: "draft", signedBy: null, signedOn: null };

/** "What the pharmacy is not doing" (§5.6, D-PH0-07). {signed} and {total} come from data (CS-3). */
export const PHARMACY_NOTICE = {
  ...DRAFT,
  lead: "MedSync does not record dispensing yet.",
  bodyCounts:
    "Dispense from the signed prescription as you do today. MedSync does not check drug interactions at this hospital, and {signed} of the {total} medicines on its list have a signed dose reference. Check each prescription yourself.",
  bodyNoCounts:
    "Dispense from the signed prescription as you do today. MedSync does not check drug interactions at this hospital, and its dose references are still being signed. Check each prescription yourself.",
};

export const COSIGN_CAUTION = {
  ...DRAFT,
  text: "Not yet co-signed. A senior has not signed this prescription.",
};

/** D-PH0-19: a medicine stopped at a home discharge. */
export const NOT_CONTINUED_CAUTION = { ...DRAFT, text: "Not continued at home" };

export const OVERRIDE_CAUTION = {
  ...DRAFT,
  text: '{check} stop, overridden by the prescriber. Reasons given: "{reasons}".',
};

export const EMERGENCY_NOTICE = {
  ...DRAFT,
  text: "Cart restocking is not recorded in MedSync yet. Use this list beside the cart's own checklist when you restock.",
};

/** Every string CS-5 requires signed before production. */
export const PHARMACY_SIGNED_COPY: readonly SignedCopy[] = [
  PHARMACY_NOTICE,
  COSIGN_CAUTION,
  NOT_CONTINUED_CAUTION,
  OVERRIDE_CAUTION,
  EMERGENCY_NOTICE,
];

export const PHARMACY = {
  place: "Pharmacy",
  nav: { label: "Pharmacy", queue: "Queue", emergency: "Emergency doses" },
  state: {
    prescribed: "Prescribed",
    awaitingCosign: "Awaiting co-sign",
    cancelledRow: "Cancelled {time}",
    cancelledView: "Cancelled {time} by {cadre}",
    changed: "Changed {time}",
  },
  override: { answered: '{check}: answered "{answer}".' },
  notChecked: 'Drug interactions. · Stock. The prescriber saw "Pharmacy not linked yet".',
  view: {
    footer: "Read-only. To change this prescription, speak to the prescriber.",
    groupedByTime:
      "Grouped by time: written before MedSync recorded which medicines were placed together.",
  },
  queue: {
    footer:
      "{n} of {N} prescriptions written {period}, {lane}. Oldest first. This list is read-only: a prescription stays here until the end of the day.",
    oneLane:
      "MedSync cannot yet tell window prescriptions from ward prescriptions at this hospital, so all are shown together.",
    emptyLane: "Nothing {lane} yet today. {n} {other lane}.",
    emptyAll: "No prescriptions have been written today.",
  },
  find: {
    label: "Find by patient number",
    none: "No prescription with that number at this hospital.",
  },
  emergency: {
    unidentified: "Unidentified patient",
    witnessTyped: "Witness named at the bedside",
  },
  points: {
    note: "A dispensing point names where pharmacy staff work and which prescriptions their queue shows first. It holds no stock and records no dispensing yet.",
  },
  refused: {
    title: "No access",
    body: "You do not have access to the pharmacy workspace. Ask your hospital admin.",
  },
} as const;
