/**
 * Pharmacy Workspace v2, the Clinical hub (board Clinical). Shares `PHWS2_COPY_STATUS` (draft) in
 * content/pharmacy-workspace-v2.ts; the CSO signs. Law 4: no role words. The board's "not started" count, its
 * patient names and "Record one" have no source and are not here (data-sources.md).
 */
export const PHWS2_CLINICAL = {
  intro:
    "Clinical work about the patient, not the shelf. Each card says what is waiting and where to do it.",
  limits:
    "These lists come from what staff record, not from alerts. MedSync checks only what is signed here.",
  limitsLink: "See signed packs",
  asOf: "As of {time}",
  refresh: "Refresh",
  cards: {
    reconciliation: {
      lead: "Compare what the patient took before admission with what is prescribed now, and record each difference as intended or not.",
      count: "{n} waiting",
      open: "{n} open",
      reopened: "{n} reopened since they were confirmed",
      action: "Open reconciliation",
    },
    reactions: {
      lead: "Suspected adverse reactions recorded by any clinician. Review, then send to the national pharmacovigilance system.",
      count: "{n} to submit",
      pastDue: "{n} past due",
      action: "Open reactions",
    },
    stewardship: {
      lead: "Antibiotics on the hospital's watch list that need a review at the agreed day.",
      count: "{n} to review",
      running: "{n} courses running",
      notSigned: "The antibiotic pack is not signed",
      noSettings: "Review days are not signed",
      action: "Open stewardship",
    },
    interventions: {
      lead: "What was changed and why, recorded when a query to the prescriber is answered.",
      count: "{n} this month",
      acted: "{n} led to a change or a stop",
      open: "{n} still open",
      action: "Open interventions",
    },
  },
} as const;
