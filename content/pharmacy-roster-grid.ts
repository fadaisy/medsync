import type { PlaceKind, Shift } from "@/lib/pharmacy/derive/roster";

import {
  dayLabel,
  LEAVE_KIND,
  longDate,
  monthName,
  SHIFT,
  shortDate,
} from "@/content/pharmacy-roster";

type LeaveKind = keyof typeof LEAVE_KIND;

/**
 * Set-up › People and roster, the top of the tab (PEOPLE-ROSTER.md §2–§5, §14): On duty now, the roster card, the
 * slot dialog and the hand over dialog. Verbatim from the spec and the prototype; shared words come from
 * pharmacy-roster.ts. Draft until the CSO signs (PHARMACY_ROSTER_COPY).
 */
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const time = (s: Shift) => SHIFT[s].time.replace(", by phone", "");
const DOW_CAPS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] as const;

export const RG = {
  notReady: {
    title: "The roster needs the database update",
    why: "The people and roster tables are not in this database yet (migration 0273).",
    next: "Ask the owner to apply it; the roster shows here once it is.",
  },

  // §2 On duty now
  onDuty: {
    title: "On duty now",
    line: (date: string, hhmm: string, day: boolean) =>
      `${dayLabel(date)} · ${hhmm} · ${day ? "Day shift 08:00–17:00" : "Night shift 17:00–08:00, with on call"}`,
    groups: { pharmacy: "Pharmacy", wards: "Doctors and nurses" },
    nobody: "Nobody on this shift.",
    sub: (cadre: string, place: string, call: boolean) =>
      `${cadre} · ${place}${call ? " · on call" : ""}`,
    att: { ok: (t: string) => `In ${t}`, late: "Late", none: "Not in" },
    callAria: (name: string, phone: string) => `Call ${name}, ${phone}`,
    signIn: "Sign in",
    signInAria: (place: string) => `Sign in at ${place}`,
    signedIn: "Signed in.",
  },

  // §3.1 Toolbar
  bar: {
    deptAria: "Department",
    dept: { pharmacy: "Pharmacy", wards: "Doctors and nurses" },
    viewAria: "View",
    view: { week: "Week", month: "Month" },
    weekLabel: (start: string, end: string) => `${shortDate(start)} – ${longDate(end)}`,
    monthLabel: (y: number, m: number) => `${monthName(m)} ${y}`,
    prev: { week: "Previous week", month: "Previous month" },
    next: { week: "Next week", month: "Next month" },
    today: "Today",
    monthAria: "Month",
    yearAria: "Year",
    placeAria: "Show place",
    allPlaces: "All places",
    draft: "Draft · not published",
    published: "Published · locked",
    copy: "Copy last week",
    fill: "Fill gaps",
    fillTitle: "Fill empty slots with the best fit, following the rules",
    print: "Print this week",
    publish: "Publish week",
    unlock: "Unlock to edit",
    monthHint: "Click a day to open its week and edit.",
  },
  flash: {
    published: "Week published. Staff see it, and witness pickers and handover use it.",
    unlocked: "Week unlocked for changes",
    publishOnly: "Only the pharmacy in-charge, or someone handed publishing, can do this.",
    noCopy: "Last week has no roster to copy.",
    copied: (left: number) =>
      `Copied last week into this week${left ? `. ${left} could not be copied without breaking a rule.` : ""}`,
    over: "That week is over.",
    filled: (n: number, left: number) =>
      n
        ? `Filled ${plural(n, "slot", "slots")} with the best fit.${left ? ` ${left} still open: nobody fits without breaking a rule.` : " Check, then publish."}`
        : `Nothing to fill${left ? `: nobody fits the ${left} open slots without breaking a rule.` : "."}`,
    noPrint: "Use your browser’s print to print this week.",
    notHere: (name: string, place: string) => `${name} does not work at ${place}`,
    moved: (name: string, s: Shift, place: string) =>
      `Moved ${name} to ${SHIFT[s].label} at ${place}`,
  },
  // Unlocking is logged with a reason (unlockWeek(reason), §18).
  unlockDlg: {
    title: "Unlock this week",
    sub: "Unlocking is logged. Say why, so the log shows it.",
    label: "Why",
    placeholder: "e.g. Brian is off sick on Thursday",
    error: "Say why you are unlocking it.",
    cancel: "Cancel",
  },

  // §3.2 Who makes the roster
  maker: {
    aria: "Who makes the roster",
    madeBy: "Made by",
    role: "· Pharmacy in-charge",
    handedTo: "Handed to",
    scope: (places: string[], until: string | null, pub: boolean) =>
      `· ${places.length ? places.join(", ") : "All places"}${until ? ` · until ${shortDate(until)}` : ""}${pub ? " · can publish" : ""}`,
    takeBack: "Take back",
    takeBackAria: (name: string) => `Take back the roster from ${name}`,
    takenBack: (name: string) => `Taken back from ${name}. They can no longer change the roster.`,
    viewOnly: "View only",
    youCanChange: (places: string[] | null) =>
      `You can change: ${places ? places.join(", ") : "all places"}`,
    handOver: "Hand over this duty",
    wardsNote:
      "Doctors' and nurses' rosters are made by each ward's in-charge. Click anyone to contact them, or to see what they prescribed or gave that day.",
  },
  wardsEmpty: {
    title: "No ward rosters here yet",
    next: "Each ward in-charge makes their ward's roster in the wards module; it shows here, view only, once it is shared.",
  },

  // §3.4 Coverage and legend
  cover: (filled: number, slots: number, empty: number, single: number) =>
    `${filled} of ${slots} shifts have someone${empty ? ` · ${empty} with nobody` : ""}${single ? ` · ${single} without a second person who can witness, so controlled doses there need a witness from elsewhere` : ""}.`,
  monthCover: (y: number, m: number, days: number, nDays: number, gaps: number, empty: number) =>
    `${monthName(m)} ${y}: ${days} of ${nDays} days rostered${days ? ` · ${gaps} shift gaps` : ""}${empty ? ` · ${empty} days not rostered yet` : ""}.`,
  legend: (s: Shift) => `${SHIFT[s].label} ${SHIFT[s].time}`,

  // §3.5 Week view
  week: {
    dow: DOW_CAPS,
    counts: (d: number, n: number) => `${d} day · ${n} night`,
    gaps: (n: number) => plural(n, "gap", "gaps"),
    holidayTitle: "Public holiday",
    holiday: (name: string, confirmed: boolean) => (confirmed ? name : `${name} (expected)`),
    leaveRow: "Leave and off",
    leaveSub: "Approved · asked",
    leaveChip: (name: string, approved: boolean) => `${name.split(" ")[0]}${approved ? "" : " ?"}`,
    leaveTip: (name: string, kind: LeaveKind, approved: boolean) =>
      `${name} · ${LEAVE_KIND[kind]} · ${approved ? "approved" : "waiting for approval"}`,
    nobody: "Nobody on duty",
    noWitness: "No witness",
    noWitnessDay: "No witness on this shift",
    addAria: (s: Shift, place: string, date: string) =>
      `Assign someone to ${SHIFT[s].label} at ${place}, ${DOW_CAPS[(new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7]} ${Number(date.slice(8))}`,
    dayAddAria: (s: Shift, place: string) => `Assign someone to ${SHIFT[s].label} at ${place}`,
    assign: "+ Assign",
    dayAria: "Day",
    cardAria: (name: string, s: Shift, place: string) =>
      `${name}, ${SHIFT[s].label} shift at ${place}. Open options`,
    removed: "[Removed]",
    sub: {
      licExpired: "Licence expired",
      onLeave: "On leave · take off",
      rest: (why: string) => `Rest rule: ${why}`,
      swap: "Swap requested",
      ok: (t: string) => `In ${t}`,
      late: (t: string) => `Late · in ${t}`,
      notIn: "Not signed in",
      didNot: "Did not sign in",
      plain: (cadre: string, s: Shift) => `${cadre} · ${time(s)}`,
    },
    printTitle: (start: string, end: string, published: boolean) =>
      `Pharmacy roster · ${shortDate(start)} – ${longDate(end)} · ${published ? "Published" : "Draft"}`,
  },
  placeKind: {
    store: "Store",
    dispensing_point: "Dispensing point",
    ward: "Ward",
    clinic: "Clinic",
  } satisfies Record<PlaceKind, string>,

  // §3.6 Month view
  month: {
    day: (n: number) => `Day ${n}`,
    night: (n: number) => `Night ${n}`,
    more: (n: number) => `+${n}`,
    notRostered: "Not rostered",
    aria: (date: string, dc: number, nc: number, gaps: number, any: boolean) => {
      const d = new Date(`${date}T00:00:00Z`);
      return `${DOW_CAPS[(d.getUTCDay() + 6) % 7]} ${d.getUTCDate()} ${monthName(d.getUTCMonth())} ${d.getUTCFullYear()}${
        any ? `: ${dc} on day, ${nc} on night${gaps ? `, ${gaps} gaps` : ""}` : ": not rostered"
      }. Open week`;
    },
  },

  // §4 Slot dialog
  slot: {
    close: "Close",
    when: (date: string, s: Shift) => `${dayLabel(date)} · ${SHIFT[s].label} ${SHIFT[s].time}`,
    assignTitle: (place: string) => `Assign to ${place}`,
    witness: (cadre: string, can: boolean) =>
      `${cadre} · ${can ? "can witness" : "cannot witness"}`,
    best: "Best fit",
    alreadyOn: (what: string) => `Already on ${what}`,
    shiftAt: (s: Shift, place: string) => `${SHIFT[s].label} at ${place}`,
    askedLeave: "Asked for leave",
    rest: (why: string) => `Rest rule: ${why}`,
    block: {
      not_here: "Not at this place",
      on_leave: "On leave",
      lic_expired: "Licence expired",
      lic_missing: "No licence recorded",
    },
    blocked: (name: string, why: string) => `${name}: ${why.toLowerCase()} on this date.`,
    assigned: (name: string, rest: string[], other: string[]) =>
      `${name} assigned${rest.length ? `. Breaks a rest rule: ${rest.join(", ").toLowerCase()}` : other.length ? `. Note: also on ${other.join(", ")}` : ""}`,
    noChoices: "Nobody else works at this place. Add a person below the roster.",
    cardSub: (when: string, place: string) => `${when} · ${place}`,
    cardLine: (cadre: string, can: boolean, ro: string | null) =>
      `${cadre}${can ? ", can witness controlled-drug doses on this shift." : ", cannot witness controlled-drug doses."}${ro ? ` ${ro}` : ""}`,
    restAlert: (why: string[]) => `Breaks a rest rule: ${why.join(", ").toLowerCase()}.`,
    remove: "Remove from this shift",
    replace: "Replace with someone else",
    removedFlash: (name: string) => `Removed ${name}`,
    askSwap: "Ask a colleague to swap or cover",
    tip: "Tip: drag a card onto an empty slot to move it.",
    wardRo: "View only. Ward rosters are made by the ward in-charge.",
    contactLine: (cadre: string, place: string) =>
      `${cadre} at ${place}. Ward rosters are made by the ward in-charge, so you can see and contact, not change.`,
    noPhone: "No phone recorded",
    call: "Call",
    sms: "SMS",
  },

  // §5 Hand over
  hand: {
    title: "Hand over making the roster",
    sub: "You stay responsible for it, and you can take it back at any time.",
    to: "Hand it to",
    pick: "Pick a person",
    for: "For",
    all: "All pharmacy places",
    until: "Until",
    untilHint: "Leave blank to keep it until you take it back.",
    clear: "Clear",
    publish: "May also publish and unlock weeks",
    err: {
      to: "Pick who to hand it to.",
      places: "Pick at least one place, or All places.",
      passed: "The end date has already passed.",
    },
    history: "History",
    cancel: "Cancel",
    submit: "Hand over",
    done: (name: string, what: string) => `${name} can now make the roster for ${what}.`,
    what: (places: string[]) => (places.length ? places.join(", ") : "all places"),
    logHanded: (
      date: string,
      from: string,
      what: string,
      to: string,
      until: string | null,
      pub: boolean,
    ) =>
      `${longDate(date)} · ${from} handed ${what} to ${to}${until ? ` until ${shortDate(until)}` : ""}${pub ? ", with publishing" : ", without publishing"}`,
    logTook: (date: string, from: string, to: string) =>
      `${longDate(date)} · ${from} took the roster back from ${to}`,
    someone: "The in-charge",
  },
} as const;

/** Shift tints (§3.5: no side borders) and the prototype's six avatar pairs, kept out of .tsx (design ratchet). */
export const SHIFT_TINT: Record<Shift, string> = {
  day: "bg-[#fff1cc]",
  night: "bg-[#e4e7ee]",
  call: "bg-[#ede9fe]",
};
export const TODAY_TINT = "bg-[#f0fdfa]";
export const PICKED_TINT = "bg-[#ccfbf1]";
export const AVATAR_TINTS = [
  "bg-[#ccfbf1] text-[#0f766e]",
  "bg-[#dbeafe] text-[#1e40af]",
  "bg-[#e0e7ff] text-[#3730a3]",
  "bg-ink-150 text-ink-800",
  "bg-[#ede9fe] text-[#5b21b6]",
  "bg-ink-200 text-ink-900",
] as const;

/** Uganda numbers shown as `+256 7xx xxx xxx`; `tel:`/`sms:` take the digits. Anything else is shown as stored. */
const local9 = (raw: string) => {
  const d = raw.replace(/\D/g, "");
  const n = d.startsWith("256") ? d.slice(3) : d.startsWith("0") ? d.slice(1) : d;
  return n.length === 9 ? n : null;
};
export const phoneText = (raw: string | null) => {
  if (!raw?.trim()) return null;
  const n = local9(raw);
  return n ? `+256 ${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6)}` : raw.trim();
};
export const phoneHref = (raw: string) => {
  const n = local9(raw);
  return n ? `+256${n}` : raw.replace(/[^\d+]/g, "");
};
