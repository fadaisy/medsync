/**
 * Patient app v2 · Care mode words for Today, the reading cards and the plan (§5.6–5.7). Drafts for the CSO.
 * No dose amounts (MR3); out of target is amber with words, never red (MR5). Claude never edits the status.
 */
import type { SignedCopy } from "../signed-copy";

export const CARE_V2_COPY_STATUS: SignedCopy = {
  status: "draft",
  signedBy: null,
  signedOn: null,
};

export const CARE_V2_COPY = {
  hero: {
    danger: "Your last reading needs action now",
    dangerAction: "What to do now",
    team: "Your care team asked you something",
    teamAction: "Reply",
    due: "Due now",
    dueAction: "Mark as taken",
    visit: "You have a visit today",
    visitAction: "See your ticket",
    next: "Next on your plan",
    rest: "Nothing due until",
    restNone: "Nothing else due today",
    teamFrom: "Your care team",
    title: "Today",
  },
  readings: {
    titles: { sugar: "Sugar", bp: "Blood pressure", weight: "Weight", pulse: "Pulse" },
    inTarget: "In target",
    outOfTarget: "Above target",
    noReading: "No reading yet",
    log: "Log",
    details: "Details",
    first: "10 days ago",
    today: "Today",
    target: "Target",
    nextStep: "Next step",
    chartSummary: "{title}, last 10 days. {count}. Latest {value} on {date}.",
  },
  plan: {
    now: "Now",
    tick: "Mark {item} as done",
    untick: "Mark {item} as not done",
    label: "As on your pharmacy label",
    taken: "Taken",
    missed: "Missed",
    due: "Due",
    skipped: "Skipped",
    snoozed: "Later",
    title: "Your plan today",
    seePlan: "See your plan",
    week: "This week",
    weekMarks: {
      taken: "All taken",
      some: "Some missed",
      missed: "Missed",
      due: "Due today",
      none: "Nothing planned",
    },
    medicines: "Medicines",
    readings: "Readings",
    empty: "Your care team has not written your plan yet.",
    offline: "Saved on this phone. It will send when you are online.",
  },
} as const;
