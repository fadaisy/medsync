/**
 * Pharmacy Workspace v2, Window place copy (GATE A §3, boards Window and OpenLines). Shares PHWS2_COPY_STATUS
 * (draft) in content/pharmacy-workspace-v2.ts; never a status of its own. Law 4: no role words. The lane the review
 * engine calls `pharmacist_first` is named here by what happens to it ("Review first"), not by who does it.
 */
export const PHWS2_WINDOW = {
  tabsLabel: "Window views",
  downtime: "Enter downtime sheets {n}",
  asOf: "As of {time}",
  refresh: "Refresh",
  queue: {
    listLabel: "Queue, oldest first",
    title: "Queue",
    oldestFirst: "oldest first",
    laneLabel: "Review lane",
    stageLabel: "Stage",
    pointLabel: "Dispensing point",
    allPoints: "All dispensing points",
    lanes: { pharmacist_first: "Review first", standard: "Standard", all: "All" },
    stages: {
      all: "All stages",
      to_review: "To review",
      queried: "Queried",
      awaiting_cosign: "Awaiting co-sign",
      ready: "Ready",
    },
    groups: {
      first: "Review first",
      to_review: "To review",
      queried: "Queried",
      awaiting_cosign: "Awaiting co-sign",
      ready: "Ready",
    },
    waiting: "waiting {wait}",
    written: "written {age} ago",
    selected: "Open",
    empty: "Nothing waits here",
    emptyWhy: "Every prescription in scope at {point} has an outcome.",
    pick: "Pick a prescription",
    pickWhy: "Choose one from the queue on the left. Its lines, checks and decisions open here.",
    nameWithheld: "Name withheld",
  },
  ready: {
    title: "Ready to hand over",
    explainer: "Every line has a decision. The patient collects at the window.",
    next: "hand over",
    action: "Hand over",
    open: "Open the prescription",
    empty: "Nothing is ready to hand over",
    emptyWhy: "A prescription shows here once every line has a decision.",
    notLive: "No data",
    notLiveWhy: "The acting point is not live, so the review queue is not read here.",
  },
  open: {
    explainer:
      "A line stays open until the patient has the medicine or someone closes it with a reason. Lines are grouped by what you can do now.",
    viewLabel: "How to show open lines",
    grouped: "By what you can do now",
    all: "Every action",
    groups: {
      shelf: {
        title: "Back on the shelf: supply now",
        explainer: "Owed lines whose medicine is on the shelf at this point now.",
      },
      patient: {
        title: "Waiting for the patient",
        explainer: "The patient is buying these outside. Record what they bought, or close the line.",
      },
      out: {
        title: "Still out",
        explainer: "Owed lines with nothing on the shelf here yet.",
      },
    },
    owedSince: "owed since {day}",
    outsideSince: "buying outside since {day}",
    nextSupply: "hand over",
    nextTell: "tell the patient it is here",
    nextRecord: "record what they bought",
    nextWait: "wait for stock",
    nextOpen: "open the prescription",
    controlledHint: "Controlled: supply from the prescription",
    supplyNow: "Supply now",
    openRx: "Open the prescription",
    allActions: "Change, close or print (every action)",
    empty: "No open lines",
    emptyWhy: "Every line has the medicine or was closed with a reason.",
  },
} as const;
