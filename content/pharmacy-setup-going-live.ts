import type { ItemKey, SetupTab } from "@/content/pharmacy-setup";
import type { SignedCopy } from "@/content/signed-copy";

import { dayLabel } from "@/content/pharmacy-roster";
import { CHECKLIST } from "@/content/pharmacy-setup";

/**
 * Set-up › Going live (SETUP-TABS.md §A): every word of the tab, verbatim from `going-live.dc.html` where the
 * prototype has it. The checklist, owners, groups and phases are the shared data in content/pharmacy-setup.ts.
 * Draft until the CSO signs.
 */
export const PHARMACY_SETUP_GOLIVE_COPY: SignedCopy = {
  status: "draft",
  signedBy: null,
  signedOn: null,
};

const pl = (n: number, one: string, many: string) => (n === 1 ? one : many);
const nameOf = (k: ItemKey | null) => CHECKLIST.find((c) => c.key === k)?.name ?? "";

/** `Tue 3 Nov, 15:00` and `3 Nov, 15:00` in Africa/Kampala, from an ISO instant. */
const kla = (at: string) => new Date(Date.parse(at) + 3 * 3_600_000).toISOString();
export const whenLong = (at: string) =>
  `${dayLabel(kla(at).slice(0, 10))}, ${kla(at).slice(11, 16)}`;
export const whenShort = (at: string) => whenLong(at).replace(/^\S+ /, "");

const ROLE = { in_charge: "In-charge", ms: "Medical superintendent" } as const;

export const GL = {
  needsDb:
    "Going live needs the 0274 database update. Until it is applied, nothing here can be shown.",
  hero: {
    label: "Readiness",
    ready: "READY",
    status: {
      setup: "Preparing",
      practice: "Practice day running",
      parallel: "Live · parallel run",
      retired: "Live · paper retired",
    },
    headline: (blockers: number, liveAt: string | null) =>
      liveAt
        ? `Live since ${whenLong(liveAt)}.`
        : blockers
          ? `${blockers} ${pl(blockers, "thing blocks", "things block")} going live`
          : "Ready to go live",
    liveSub:
      "Paper registers continue for the 2-week parallel run. Differences between paper and MedSync are checked daily.",
    sub: (done: number, all: number, overdue: number, late: number) =>
      `${done} of ${all} done` +
      (overdue ? ` · ${overdue} overdue` : "") +
      (late
        ? ` · ${late} ${pl(late, "blocker is", "blockers are")} due after the go-live date`
        : "") +
      ".",
    date: "Go-live date",
    noDate: "Not set",
    targetLabel: (d: string) => dayLabel(d),
    countdown: (days: number) => (days > 0 ? `in ${days} ${pl(days, "day", "days")}` : "today"),
    live: "Live",
    goLive: "Go live",
    goHintLive: "Switched on by the in-charge and the medical superintendent.",
    goHintReady: "Needs two signatures: the in-charge and the medical superintendent.",
    goHintBlocked: (names: string[], more: number) =>
      `Opens when nothing blocks. Left: ${names.map((n) => n.split(",")[0]!.toLowerCase()).join("; ")}${more > 0 ? `; and ${more} more` : ""}.`,
    goHintPhase: "Going live is done once, from set-up or a practice day.",
    signedLine: (role: keyof typeof ROLE, by: string, at: string) =>
      `${ROLE[role]} signed: ${by}, ${whenShort(at)}.`,
  },
  phases: {
    title: "How the switch happens",
    done: "Done",
    now: "Now",
    next: "Next",
    startPractice: "Start practice day",
    endPractice: "End practice day",
    retire: "Retire paper",
  },
  practice: {
    title: "Practice day",
    note: "Practice mode is on. Sample patients only: nothing here touches real stock or records.",
    sample: "Sample prescription",
    sampleHint: "Any made-up prescription. It is wiped when the practice day ends.",
    samplePh: "e.g. Sample prescription 1",
    dispense: "Dispense sample",
    tooShort: "Type at least 2 letters.",
    trainedMe: "You have dispensed a sample. You count as trained.",
    notTrainedMe: "Dispense one sample prescription to count as trained.",
    done: "Sample dispensed. You count as trained.",
  },
  checklist: {
    title: "Checklist",
    doneLine: (done: number, all: number) => `· ${done} of ${all} done`,
    show: "Show",
    views: {
      all: (n: number) => `All · ${n}`,
      blocking: (n: number) => `Blocking · ${n}`,
      overdue: (n: number) => `Overdue · ${n}`,
      auto: "Checked automatically",
      done: (n: number) => `Done · ${n}`,
    },
    empty: {
      blocking: "Nothing blocks going live.",
      overdue: "Nothing is overdue.",
      other: "Nothing here.",
    },
    viewOnly: "Only the in-charge changes the checklist. You can view it.",
    groupCount: (done: number, all: number) => `${done} of ${all}`,
    blocks: "BLOCKS GO-LIVE",
    prog: (d: number, t: number, unit: string) => `${d} of ${t} ${unit}`,
    auto: "· checked automatically",
    status: { done: "Done", doing: "In progress", overdue: "Overdue", todo: "To do" },
    open: {
      places: ["Open Places", "places"],
      medicines: ["Open Medicines", "medicines"],
      rules: ["Open Rules", "rules"],
      people: ["Open People and roster", "people"],
      messages: ["Open Messages", "messages"],
    } satisfies Record<SetupTab, [string, string]>,
    recordAnswer: "Record answer",
    changeAnswer: "Change answer",
    markDone: "Mark done",
    undo: "Undo",
    checkAgain: "Check again",
    ownerAndDate: "Owner and date",
    ownerAria: (name: string) => `Change the owner and due date of: ${name}`,
    owner: "Owner",
    due: "Due",
    doneEdit: "Done",
    meta: {
      doneBy: (by: string, at: string | null) =>
        `Done by ${by}${at ? ` · ${whenShort(at)}` : ""} · `,
      owner: (o: string) => `Owner: ${o}`,
      noDue: " · no due date",
      wasDue: (d: string) => ` · was due ${dayLabel(d)}`,
      late: (d: string, n: number) =>
        ` · was due ${dayLabel(d)} (${n} ${pl(n, "day", "days")} late)`,
      dueIn: (d: string, n: number) =>
        ` · due ${dayLabel(d)} (${n === 0 ? "today" : `in ${n} ${pl(n, "day", "days")}`})`,
      afterTarget: " · due after the go-live date",
    },
  },
  answer: {
    lead: (why: string) =>
      `${why} The answer is kept with who decided it, and shows on the Rules tab.`,
    choices: "Answer",
    details: "Details (optional)",
    theAnswer: "The answer",
    detailsPh: "Anything to add, e.g. which nurses",
    answerPh: "e.g. Second nurse on shift, the nurse in-charge or the doctor on duty",
    decidedBy: "Decided by",
    decidedByPh: "e.g. The in-charge with the medical superintendent",
    save: "Save answer",
    pick: "Pick an answer.",
    type: "Type the answer.",
    who: "Say who decided.",
  },
  go: {
    title: (target: string | null) => (target ? `Go live on ${dayLabel(target)}` : "Go live"),
    lead: "From then, every dispense, count and handover is recorded in MedSync. Paper registers continue beside it for the 2-week parallel run.",
    nothingBlocks: "Nothing blocks",
    practiceDone: "Practice day done",
    left: (n: number) =>
      n ? `${n} non-blocking items left, to finish during the parallel run` : "Every item done",
    ok: "Done",
    notYet: "Not yet",
    sigTitle: "Two signatures switch it on",
    sign: (role: keyof typeof ROLE) => `Sign as ${ROLE[role].toLowerCase()}`,
    signed: (role: keyof typeof ROLE, by: string) => `${ROLE[role]} signed · ${by}`,
    cantInCharge: "Only the in-charge signs as in-charge.",
    cantMs:
      "Only the medical superintendent signs here, and not the person who signed as in-charge.",
    close: "Close",
  },
  activity: { title: "Activity", empty: "Nothing yet." },
  cancel: "Cancel",
  toast: {
    date: (d: string) => `Go-live date set to ${dayLabel(d)}`,
    answer: "Answer recorded",
    marked: "Marked done",
    reopened: "Reopened",
    checked: "Checked again",
    owner: "Owner and due date saved",
    practiceOn: "Practice mode is on for everyone. Sample patients only.",
    practiceOff: "Practice day ended. Practice data was wiped.",
    retired: "Paper registers retired. MedSync is the only record.",
    live: "MedSync is live. The parallel run has started.",
    signed: "Signed. Waiting for the other signature.",
  },
};

/** One activity line (§A4), from an event row. */
export function eventText(e: {
  who: string | null;
  kind: string;
  item: ItemKey | null;
  detail: string | null;
}) {
  const who = e.who ?? "MedSync";
  const name = nameOf(e.item);
  switch (e.kind) {
    case "target":
      return `${who} set the go-live date to ${e.detail ? dayLabel(e.detail) : ""}`;
    case "answer":
      return `${e.detail || who} recorded the answer to "${name}"`;
    case "mark":
      return `${who} marked "${name}" done`;
    case "unmark":
      return `${who} reopened "${name}"`;
    case "owner": {
      const [owner, due] = (e.detail ?? "").split(" · ");
      return `${who} gave "${name}" to ${owner}${due ? `, due ${dayLabel(due)}` : ""}`;
    }
    case "done":
      return `"${name}" now complete (checked automatically)`;
    case "practice_start":
      return `${who} started a practice day`;
    case "practice_end":
      return "Practice day ended; practice data wiped";
    case "retire":
      return "Paper registers retired";
    case "sign":
      return `${ROLE[e.detail === "ms" ? "ms" : "in_charge"]} signed to go live`;
    case "live":
      return "Went live: signed by the in-charge and the medical superintendent";
    default:
      return `${who}: ${e.kind}`;
  }
}
