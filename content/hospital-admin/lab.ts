/**
 * Laboratory and imaging in the admin workspace (phase 2 of ADR 0520): the page around the hospital's test menu
 * and its imaging services. The test menu's own words stay in content/lab-test-menu.ts and are reused as they are.
 * Wording follows the approved prototype. Draft until the CSO signs; Claude never edits the status.
 */
import type { SignedCopy } from "@/content/signed-copy";

export const LAB_ADMIN_COPY_STATUS: SignedCopy = {
  status: "draft",
  signedBy: null,
  signedOn: null,
};

const n = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`;

export const LAB_ADMIN = {
  title: "Laboratory and imaging",
  lead: "What clinicians can order here, where it is done, and how long it takes",
  startLevel: "Start from your level",
  addTests: "+ Add tests",
  stats: {
    onMenu: "On the menu",
    onMenuSub: "tests clinicians can order",
    inHouse: "In-house",
    inHouseSub: "done in your laboratory",
    referred: "Referred",
    referredSub: (k: number) => (k ? `${k} without a lab chosen` : "each with its lab"),
    noTat: "Without a turnaround",
    noTatSub: "your lab's own figure, not set yet",
  },
  tabs: {
    label: "Show",
    menu: "Test menu",
    referrals: "Referrals",
    hours: "Hours by section",
    imaging: "Imaging",
    profiles: "Profiles",
    compare: "Compare with your level",
  },
  noLab: {
    text: "The test menu hangs off the Laboratory department, and its sections are the department's units.",
    add: "Add the Laboratory",
  },
  sectionsLink: "Laboratory sections and their in-charges are in Departments",
  oneResultPath: "One result path for the laboratory",
  menu: {
    sections: "Sections",
    all: "All sections",
    hidden: "hidden",
    find: "Find a test",
    where: { all: "All", in_house: "In-house", referred: "Referred" },
    whereLabel: "Where",
    cols: {
      test: "Test",
      where: "Where",
      hours: "Hours",
      turnaround: "Turnaround",
      last: "Referred to, or now",
    },
    select: (name: string) => `Select ${name}`,
    none: "No test matches.",
    chooseLab: "Choose a lab",
    mixed: "Mixed hours",
  },
  bulk: {
    label: "Change selected tests",
    picked: (k: number, sections: string) => `${n(k, "test", "tests")} selected · ${sections}`,
    where: "Where",
    hours: "Hours",
    tat: "Stated turnaround (minutes)",
    to: "Referred to",
    apply: "Apply",
    clear: "Clear",
    keep: "Keep as set",
  },
  detail: {
    label: "Test",
    close: "Close",
    where: "Where it is done",
    hours: "Hours",
    tat: "Stated turnaround",
    tatHelp:
      "What your lab commits to, in minutes. Clinicians see it when they order. Leave it empty until you know it.",
    reportedAs: "Reported as",
    reportedLine: "From the signed catalogue. Reference ranges are not set here.",
    catalogue: "From the catalogue",
    inProfiles: "In profiles",
    noProfiles: "In no profile",
    save: "Save",
    remove: "Remove from the menu",
  },
  /** ADR 0527: the hospital's own price per test. Draft wording. */
  price: {
    cap: "Price",
    now: "Now: {price}",
    notSet: "No price set. Patients are told to ask at the hospital, never shown zero.",
    free: "Free",
    amount: "Price in shillings",
    amountHint: "whole shillings, above zero",
    isFree: ["This test is free", "Patients are told it is free", "It has a price"],
    from: "Starts on",
    fromHint: "today or later; the old price stays on record",
    save: "Save price",
    saved: "Price saved",
    bad: "Enter a price above zero, or mark the test free.",
    help: "A laboratory visit costs the total of its tests. There is no department fee.",
    priced: (k: number, of: number) => `${k} of ${of} tests on the menu have a price`,
  },
  referrals: {
    note: "Where referred samples go. Clinicians see the lab when they order.",
    noLab: (names: string) =>
      `Referred without a lab: ${names}. Open the test in Test menu to choose one.`,
    tests: (k: number) => n(k, "test", "tests"),
    none: "No test is referred out.",
  },
  hours: {
    note: "Hours are set per test; set them for a whole section at once here. Hide a section to keep its tests off clinicians' order list without losing your settings.",
    inHouse: (k: number) => `${n(k, "in-house test", "in-house tests")}`,
    set: "Set hours",
    shown: ["Shown", "In clinicians' order list", "Hidden from clinicians' order list"] as const,
    none: "No in-house tests",
    notSet: "Not set",
  },
  imaging: {
    note: "Each imaging service: where it is done, its machines and hours. What is down now is reported in Availability.",
    compare: (offered: number, all: number, level: string, gaps: string) =>
      `You offer ${offered} of the ${all} imaging services the MoH 2016 standards list for a ${level}${gaps ? `. Not yet: ${gaps}` : ""}.`,
    notSet: "Not set",
    planned: "Planned",
    plannedNote: "Planned from a standard or your application: confirm how you actually do it.",
    machines: (k: number) => n(k, "machine", "machines"),
    where: "Where",
    machinesLabel: "Machines",
    fewer: "Fewer",
    more: "More",
    hours: "Hours",
    hoursOpts: { "24h": "24 hours", scheduled: "Scheduled" },
    when: "When",
    whenPh: "Mon–Fri",
    tat: "Stated turnaround",
    tatHint: "Your operational figure, never a clinical target.",
    tatPh: "2 h, 1 day…",
    to: "Referred to",
    toHint: "The sample transport hub, a named facility or a private provider.",
    save: "Save",
    confirm: "Confirm",
    saved: "Saved.",
    now: {
      unavailable: "Unavailable",
      limited: "Limited",
      unconfirmed: "Unconfirmed: check",
      running: "Running",
    },
    report: "Report or clear a problem in Availability",
  },
  compare: {
    note: (level: string) =>
      `Your menu against the guide for a ${level}. A difference is not wrong: it is what your lab really does.`,
    cols: { test: "Test", guide: "Guide", yours: "Yours" },
    notInGuide: "Not in the guide",
    none: "Your menu matches the guide.",
    noLevel: "Your hospital's level is not set, so there is no guide to compare with.",
  },
  errors: {
    invalid: "Check the details and try again.",
  },
} as const;
