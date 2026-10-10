/**
 * Laboratory workspace copy (Lab Phase 0, docs/lab/phase-0 Appendix B). Every visible string on
 * /lab lives here. The critical-flagging notice is clinical-safety wording: it carries a status,
 * and `labWorkspaceLiveFor` keeps the workspace off in production while it is `draft` (CF-3).
 * To sign it, the CSO sets status "signed" with signedBy and signedOn.
 */

export interface SignedCopy {
  status: "draft" | "signed";
  signedBy: string | null;
  signedOn: string | null;
}

export const CRITICAL_FLAGGING_NOTICE: SignedCopy & { lead: string; body: string } = {
  status: "draft",
  signedBy: null,
  signedOn: null,
  lead: "Automatic critical flagging is off.",
  body: "MedSync will not flag critical values at this hospital. Follow the lab's critical-call procedure and phone critical results to the ward.",
};

export const LAB = {
  place: "Laboratory",
  nav: {
    label: "Laboratory",
    worklist: "Worklist",
    released: "Released today",
    rejected: "Rejected",
  },
  worklist: {
    title: "Worklist",
    updated: "Updated",
    refresh: "Refresh",
    refreshed: (n: number) => `Worklist updated, ${n} ${n === 1 ? "specimen" : "specimens"}`,
    sectionLabel: "Section",
    stageLabel: "Stage",
    deptLabel: "Ward or department",
    allSections: "All sections",
    mySections: "My sections",
    noSection: "No section",
    allStages: "All stages",
    allDepts: "All wards and departments",
    notRecorded: "Not recorded",
    columns: {
      patient: "Patient",
      test: "Test",
      from: "From",
      priority: "Priority",
      stage: "Stage",
      waiting: "Waiting",
      action: "Action",
    },
    footer: (n: number, total: number, section: string) =>
      `${n} of ${total} specimens, in ${section}. The clock starts when the lab receives the specimen. "Late" means past this lab's stated turnaround for the test.`,
    emptyMine: (section: string, others: number) =>
      `Nothing waiting in ${section}. ${others} in other sections.`,
    showAll: "Show all sections",
    emptyAll: "No specimens are waiting.",
    noSectionAssigned: "You are not assigned to a lab section, so this shows all sections.",
    legacy: "This hospital is still on the old lab list.",
  },
  stage: {
    to_receive: "To receive",
    to_result: "To result",
    preliminary: "Preliminary",
  },
  action: {
    receive: "Receive",
    enter: "Enter results",
    continue: "Continue",
  },
  turnaround: {
    late: (overrun: string) => `Late by ${overrun}`,
    notReceived: (since: string) => `Collected ${since} ago · not received`,
    noTarget: (elapsed: string) => `${elapsed} · no target set`,
    withTarget: (elapsed: string, target: string) => `${elapsed} · target ${target}`,
    target: (target: string) => `target ${target}`,
    defaultMark: "default",
  },
  released: {
    title: "Released today",
    columns: {
      patient: "Patient",
      test: "Test",
      released: "Released",
      turnaround: "Turnaround",
      state: "State",
    },
    final: "Final",
    amended: "Amended",
    empty: "Nothing has been released today.",
    footer: (n: number) =>
      `${n} ${n === 1 ? "result" : "results"} released since midnight. Turnaround runs from receipt to final release.`,
  },
  rejected: {
    title: "Rejected",
    columns: {
      patient: "Patient",
      test: "Test",
      rejected: "Rejected",
      reason: "Reason",
      now: "Now",
    },
    awaiting: "Awaiting re-collection",
    recollected: (time: string) => `Re-collected ${time}`,
    empty: "No specimens were rejected in the last 7 days.",
    footer: (n: number) =>
      `${n} ${n === 1 ? "specimen" : "specimens"} rejected in the last 7 days. Each order went back to "to collect".`,
  },
  refused: {
    title: "No access",
    body: "You do not have access to the laboratory workspace. Ask your hospital admin.",
    home: "Go to the home page",
  },
} as const;
