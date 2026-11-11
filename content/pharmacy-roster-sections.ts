import { longDate, shortDate } from "@/content/pharmacy-roster";

/**
 * Set-up › People and roster, the sections below the roster card (PEOPLE-ROSTER.md §6, §7, §9, §10, §13, §15):
 * every word, verbatim from the spec and the prototype. Shifts, cadres, dates and refusals are the shared words in
 * content/pharmacy-roster.ts. Draft until the CSO signs (PHARMACY_ROSTER_COPY).
 */
const s = (n: number, one: string, many: string) => (n === 1 ? one : many);
const first = (name: string) => name.split(" ")[0] ?? name;

/** `2 Nov, 16:05` (Africa/Kampala) from a Postgres timestamptz string. */
export const stamp = (at: string) => {
  const t = new Date(
    Date.parse(at.replace(" ", "T").replace(/([+-]\d\d)$/, "$1:00")) + 3 * 3_600_000,
  );
  const iso = t.toISOString();
  return `${shortDate(iso.slice(0, 10))}, ${iso.slice(11, 16)}`;
};

const VERB: Record<string, string> = {
  accepted: "accepted",
  declined: "declined",
  approved: "approved",
  rejected: "rejected",
  withdrawn: "withdrew",
};
/** One line of a request's trail: `Asked 2 Nov, 16:05` or `Prossy Nakato accepted 2 Nov, 18:20`. */
const trailEvent = (action: string, who: string, at: string) =>
  action === "asked" ? `Asked ${at}` : `${who} ${VERB[action] ?? action} ${at}`;

export const RS = {
  needsDb: "The roster needs database update 0273. Ask the owner to apply it.",
  cancel: "Cancel",
  save: "Save",
  send: "Send request",
  reasonLabel: "Reason (optional)",
  quoted: (t: string) => `“${t}”`,
  inChargeName: "The in-charge",

  swaps: {
    title: "Swap requests",
    needs: (n: number) => `${n} ${s(n, "needs you", "need you")}`,
    sub: "Ask a colleague to swap or cover a shift. They accept first, then the in-charge approves. The roster changes only once it is approved.",
    ask: "Ask for a swap",
    filtersAria: "Show requests",
    filter: {
      mine: (n: number) => `Needs me · ${n}`,
      open: (n: number) => `Pending · ${n}`,
      all: (n: number) => `All · ${n}`,
    },
    empty: {
      mine: "Nothing needs you right now.",
      open: "No pending requests.",
      all: "No requests yet.",
    },
    state: {
      colleague: (name: string) => `Waiting for ${first(name)}`,
      incharge: "Waiting for in-charge",
      approved: "Approved",
      declined: "Declined",
      rejected: "Rejected",
      withdrawn: "Withdrawn",
      expired: "Expired",
      stale: "Roster changed",
    },
    headline: (kind: "cover" | "swap", a: string, b: string) =>
      kind === "cover" ? `${a} asks ${b} to cover` : `${a} asks ${b} to swap`,
    detailSwap: (give: string, take: string) => `Gives ${give} · takes ${take}`,
    breaksRow: (list: string) => `Breaks a rest rule: ${list}`,
    breakItem: (name: string, text: string) => `${name}: ${text}`,
    progressAria: "Progress",
    step: {
      asked: "✓ Asked",
      colleague: (name: string, st: "done" | "no" | "now" | "wait") =>
        st === "done"
          ? `✓ ${first(name)} accepted`
          : st === "no"
            ? `✕ ${first(name)} declined`
            : `2 · ${first(name)} accepts`,
      incharge: (st: "done" | "no" | "now" | "wait") =>
        st === "done"
          ? "✓ In-charge approved"
          : st === "no"
            ? "✕ In-charge rejected"
            : "3 · In-charge approves",
    },
    event: trailEvent,
    published: "published week, both told by SMS",
    expired: "the shift started before anyone answered",
    stale: "the roster was changed, so this no longer applies",
    act: {
      accept: "Accept",
      decline: "Decline",
      approve: "Approve",
      reject: "Reject",
      withdraw: "Withdraw",
      why: "Why (optional)",
    },
    approveWait: (name: string) => `Waits for ${name} to accept first`,
    approveHint: (name: string) => `You can approve once ${first(name)} accepts.`,
    flash: {
      accepted: "Accepted. It now waits for the in-charge.",
      approved: (name: string, slot: string) =>
        `Approved. The roster now shows ${name} on ${slot}.`,
      notYet: (name: string) => `You can approve once ${name} has accepted.`,
      rejected: "Rejected. Both are told.",
      declined: (name: string) => `Declined. ${name} is told.`,
      withdrawn: "Request withdrawn",
      sent: (name: string) => `Request sent to ${name}. It shows as waiting for them.`,
    },
    form: {
      who: (name: string) =>
        `Asking as ${name}. Your colleague accepts first, then the in-charge approves.`,
      give: "Your shift",
      giveHint: "Pick one of your shifts",
      noGive: "You have no shifts this week or next to give.",
      kindAria: "Kind of request",
      kind: { cover: "Ask them to cover it", swap: "Swap with one of theirs" },
      to: "Colleague",
      toHint: (place: string | null, any: boolean) =>
        place === null
          ? "Pick your shift first"
          : any
            ? `Pick a colleague at ${place}`
            : `Nobody free at ${place}`,
      colleague: (name: string, cadre: string) => `${name} · ${cadre}`,
      take: "You take their shift",
      takeHint: (picked: boolean, any: boolean) =>
        !picked
          ? "Pick a colleague first"
          : any
            ? "Pick one of their shifts"
            : "They have no shift you can take",
      reasonEg: "e.g. Family function upcountry",
      preview: (name: string, give: string, take: string | null) =>
        take
          ? `${name} works your ${give}, and you work their ${take}.`
          : `${name} works your ${give}.`,
      warn: (list: string) =>
        `This would break a rest rule. ${list}. The in-charge sees this before approving.`,
      err: {
        give: "Pick the shift you want to give away.",
        to: "Pick the colleague you are asking.",
        take: "Pick which of their shifts you will take.",
      },
    },
  },

  leave: {
    title: "Leave and days off",
    toApprove: (n: number) => `${n} to approve`,
    sub: "The in-charge approves. Once approved, the person's shifts on those days are freed and nobody can be rostered on them.",
    ask: "Ask for leave or a day off",
    empty: "No leave requests.",
    kind: {
      annual: "Annual leave",
      day_off: "Day off",
      study: "Study leave",
      sick: "Sick leave",
    },
    state: {
      pending: "Waiting for in-charge",
      approved: "Approved",
      declined: "Declined",
      withdrawn: "Withdrawn",
    },
    when: (from: string, to: string, days: number, late: boolean, ahead: number) =>
      `${shortDate(from)}${to !== from ? ` – ${shortDate(to)}` : ""} ${to.slice(0, 4)} · ${days} ${s(days, "day", "days")}${
        late ? ` · asked less than ${ahead} days ahead` : ""
      }`,
    rowClash: (list: string[]) =>
      `Rostered on ${list.join("; ")}. Approving frees ${s(list.length, "it.", "them.")}`,
    event: trailEvent,
    act: { approve: "Approve", decline: "Decline", withdraw: "Withdraw" },
    flash: {
      approved: (freed: string[]) =>
        `Approved.${
          freed.length
            ? ` ${freed.length} ${s(freed.length, "shift is", "shifts are")} now open: ${freed.join("; ")}. Try Fill gaps.`
            : ""
        }`,
      declined: (name: string) => `Declined. ${name} is told.`,
      sent: (late: boolean, ahead: number) =>
        `Sent to the in-charge.${late ? ` Note: less than ${ahead} days ahead.` : ""}`,
    },
    form: {
      who: (name: string) => `Asking as ${name}. The in-charge approves.`,
      kindAria: "Kind",
      from: "From",
      to: "To (same day for one day)",
      clash: (list: string[]) =>
        `You are rostered on ${list.length} ${s(list.length, "shift", "shifts")} in these days: ${list.join("; ")}. Once approved, ${s(
          list.length,
          "it becomes a gap",
          "they become gaps",
        )} for the in-charge to fill.`,
      err: {
        from: "Pick the first day.",
        passed: "The first day has already passed.",
        order: "The last day is before the first day.",
      },
    },
  },

  load: {
    title: "Who carries the load",
    sub: (from: string, to: string) =>
      `Pharmacy staff, ${shortDate(from)} – ${longDate(to)} (the last 5 weeks). Flags anyone well above or below the average.`,
    col: {
      person: "Person",
      day: "Day",
      night: "Night",
      call: "On call",
      weekend: "Weekend",
      holiday: "Holiday",
      total: "Total",
    },
    heavy: "Heavy",
    light: "Light",
    empty: "Nobody on the roster yet.",
  },

  reminders: {
    title: "Reminders",
    sub: "Sent by SMS through Messages.",
    link: "Edit wording and Luganda versions",
    href: "/pharmacy/setup?tab=messages",
    items: [
      {
        key: "eveOn",
        label: "Evening before each shift",
        sub: "Everyone on tomorrow’s roster gets an SMS at the time below.",
      },
      {
        key: "changeOn",
        label: "When a published shift changes",
        sub: "Both people are told, e.g. after a swap or leave is approved.",
      },
      {
        key: "unpubOn",
        label: "Next week not published by Thursday",
        sub: "Reminds the in-charge, and whoever was handed the roster.",
      },
      {
        key: "licOn",
        label: "30 days before a licence expires",
        sub: "Reminds the person and the in-charge.",
      },
    ] as const,
    at: "Evening reminder at",
    times: ["17:00", "18:00", "19:00", "20:00"] as const,
    example: "Example SMS",
    toggled: (label: string, on: boolean) => `${label}${on ? ": on" : ": off"}`,
    sms: (
      name: string,
      shift: string,
      day: string,
      place: string,
      time: string,
      sent: string | null,
    ) =>
      `MedSync: Hello ${first(name)}, you are on ${shift} shift tomorrow, ${day}, at ${place}, ${time}.${
        sent ? ` (sent at ${sent})` : " (evening reminder is off)"
      }`,
    /** The spec's example, when nobody is on tomorrow's roster. */
    fallback: {
      name: "Brian",
      shift: "Day",
      day: "Wed 4 Nov",
      place: "OPD dispensary",
      time: "08:00–17:00",
    },
  },

  people: {
    title: "People",
    count: (n: number) => ` · ${n}`,
    sub: "Pharmacy staff who can be rostered, and where.",
    add: "Add a person",
    licLine: (body: string, number: string, expired: boolean, on: string) =>
      `${body} · ${number} · ${expired ? "expired" : "expires"} ${longDate(on)}`,
    licMissing: "Practising licence",
    lic: {
      ok: "Current",
      soon: "Expires soon",
      expired: "Expired",
      missing: "Not recorded",
    },
    renew: "Record renewal",
    newExpiry: "New expiry",
    number: "Licence number",
    renewErr: "Pick the new expiry date, after today.",
    numberErr: "Type the licence number.",
    renewed: (name: string, on: string) =>
      `Renewal recorded for ${name}. Valid to ${longDate(on)}.`,
    canWitness: "Can witness",
    cannotWitness: "Cannot witness",
    addPhoto: "Add my photo",
    changePhoto: "Change my photo",
    noPhoto: "No photo yet",
    close: "Close",
    form: {
      title: "Add a person",
      picture: "Profile picture",
      pictureNote:
        "They add their own photo after they sign in. Until then the roster shows their initials.",
      who: "Person",
      noStaff: "Everyone at this hospital is already on the roster.",
      cadre: "Cadre",
      worksAt: "Works at",
      save: "Add person",
      err: {
        who: "Pick who to add.",
        places: "Pick at least one place they work at.",
      },
    },
  },

  prescribers: {
    title: "Prescribers",
    sub: "Controlled entries pick the prescriber from this list. Changes here are confirmed by the medical superintendent.",
    witnessTitle: "Who may witness",
    fromRules: "From Rules.",
  },
} as const;
