import type { SignedCopy } from "@/content/signed-copy";
import type { Cadre, RestBreak, RestWhy, Shift } from "@/lib/pharmacy/derive/roster";

/**
 * Set-up › People and roster (docs/pharmacy/rework/PEOPLE-ROSTER.md): the shared words — shifts, cadres, the rule
 * badges (§11, verbatim, numbers from the signed registry) and the server's refusals. The grid's and the sections'
 * own words are in pharmacy-roster-grid.ts and pharmacy-roster-sections.ts. Draft until the CSO signs.
 */
export const PHARMACY_ROSTER_COPY: SignedCopy = { status: "draft", signedBy: null, signedOn: null };

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const parts = (iso: string) => {
  const d = new Date(`${iso}T00:00:00Z`);
  return {
    d: d.getUTCDate(),
    m: d.getUTCMonth(),
    y: d.getUTCFullYear(),
    w: (d.getUTCDay() + 6) % 7,
  };
};
/** `Tue 3 Nov` */
export const dayLabel = (iso: string) => {
  const p = parts(iso);
  return `${DOW[p.w]} ${p.d} ${MON[p.m]}`;
};
/** `3 Nov` */
export const shortDate = (iso: string) => {
  const p = parts(iso);
  return `${p.d} ${MON[p.m]}`;
};
/** `20 Nov 2026` */
export const longDate = (iso: string) => {
  const p = parts(iso);
  return `${p.d} ${MON[p.m]} ${p.y}`;
};
export const monthName = (m: number) =>
  [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ][m]!;
export const DOW_SHORT = DOW;

export const SHIFT: Record<Shift, { label: string; time: string }> = {
  day: { label: "Day", time: "08:00–17:00" },
  night: { label: "Night", time: "17:00–08:00" },
  call: { label: "On call", time: "17:00–08:00, by phone" },
};
export const slotText = (s: { shift: Shift; date: string; place: string }) =>
  `${SHIFT[s.shift].label} · ${dayLabel(s.date)} · ${s.place}`;

export const CADRE: Record<Cadre, string> = {
  pharmacist: "Pharmacist",
  technician: "Pharmacy technician",
  dispenser: "Dispenser",
  store_keeper: "Store keeper",
  nurse: "Nurse",
  nurse_in_charge: "Nurse in-charge",
  midwife: "Midwife",
  doctor: "Doctor",
  clinical_officer: "Clinical officer",
};
export const LICENCE_BODY = { PSU: "PSU", AHPC: "AHPC" } as const;

const dn = (iso: string) => DOW[parts(iso).w]!;
export const breakText = (b: RestBreak) =>
  b.kind === "after_night"
    ? `day on ${dn(b.date)} after a night`
    : b.kind === "same_date"
      ? `day and night on ${dn(b.date)}`
      : `${b.n} shifts that week`;
export const restWhyText = (r: RestWhy) =>
  r.kind === "night_before"
    ? "Night shift the evening before"
    : r.kind === "day_after"
      ? "Day shift the next morning"
      : r.kind === "also_night"
        ? "Also on night the same date"
        : r.kind === "also_day"
          ? "Also on day the same date"
          : `${r.n} shifts this week`;

/**
 * §11 rule badges, verbatim. `{n}` takes the signed number of the registry rule named in `n` (content/pharmacy-rules.ts
 * group `roster`), so a signed change shows here and in the checks at once.
 */
export interface BadgeGroup {
  id:
    | "witness"
    | "cover"
    | "rest"
    | "elig"
    | "hand"
    | "maker"
    | "swap"
    | "leave"
    | "licence"
    | "attend"
    | "pub"
    | "presc";
  scope: string;
  affects: string;
  rules: readonly { text: string; n?: string }[];
}
const t = (text: string, n?: string) => ({ text, n });
export const ROSTER_RULE_GROUPS: readonly BadgeGroup[] = [
  {
    id: "witness",
    scope: "Witnessing",
    affects: "Every ward and the pharmacy",
    rules: [
      t("On a ward: a second nurse on shift, the nurse in-charge or the doctor on duty"),
      t("In the pharmacy: a pharmacy technician, a second pharmacist or the in-charge"),
      t("Store keepers cannot witness"),
      t("Nobody witnesses a dose they gave"),
      t("The witness approves on their own device"),
    ],
  },
  {
    id: "cover",
    scope: "Shift cover",
    affects: "Every staffed shift",
    rules: [
      t("Every staffed shift has at least one person"),
      t(
        "Ward and pharmacy day and night shifts have {n} people who can witness, so a controlled dose is witnessed on the shift",
        "per_shift",
      ),
      t("On call is one person, reachable by phone"),
      t("At most {n} people on a shift at one place", "per_shift"),
    ],
  },
  {
    id: "rest",
    scope: "Rest and hours",
    affects: "Every person on the roster",
    rules: [
      t("No day shift the morning after a night shift"),
      t("No day and night shift on the same date"),
      t(
        "At most {n} day or night shifts a week per person (on call does not count)",
        "shifts_week",
      ),
    ],
  },
  {
    id: "elig",
    scope: "Who works where",
    affects: "Every person on the roster",
    rules: [
      t("Only people listed at a place can be rostered there"),
      t("A person is at one place per shift"),
    ],
  },
  {
    id: "hand",
    scope: "Handover",
    affects: "Every change of shift",
    rules: [
      t("Controlled and high-risk medicines are counted blind at every handover"),
      t("The outgoing and incoming person both sign the count"),
      t("You hand over only the place you are working at"),
    ],
  },
  {
    id: "maker",
    scope: "Who makes the roster",
    affects: "Every place",
    rules: [
      t("The pharmacy in-charge makes and publishes the roster"),
      t(
        "The in-charge can hand this duty to someone else, for all places or only some, with an end date",
      ),
      t("Someone handed only some places can change only those places"),
      t("Publishing and unlocking need the in-charge, or someone handed that too"),
      t("The in-charge can take the duty back at any time; every handover is logged"),
    ],
  },
  {
    id: "swap",
    scope: "Swaps",
    affects: "Every person on the roster",
    rules: [
      t(
        "Anyone on the roster can ask a colleague who works at the same place to swap or cover a shift",
      ),
      t(
        "The colleague accepts first; only then can the in-charge (or whoever makes the roster for that place) approve",
      ),
      t("Nothing changes on the roster until the request is approved"),
      t("Rest rules are checked before approval"),
      t("A request not answered before the shift starts expires"),
    ],
  },
  {
    id: "leave",
    scope: "Leave",
    affects: "Pharmacy staff",
    rules: [
      t("Leave and days off are asked for here and approved by the in-charge"),
      t("Once approved, the person is taken off their shifts on those days"),
      t("Nobody can be rostered on a day they are on approved leave"),
      t("Ask at least {n} ahead, except sick leave", "leave_notice"),
    ],
  },
  {
    id: "licence",
    scope: "Licences",
    affects: "Pharmacists, technicians and dispensers",
    rules: [
      t("Pharmacists need a current practising licence from the Pharmaceutical Society of Uganda"),
      t(
        "Pharmacy technicians and dispensers need a current licence from the Allied Health Professionals Council",
      ),
      t("Nobody can be rostered on a date after their licence expires"),
      t("The in-charge is warned {n} before a licence expires", "licence_warn"),
    ],
  },
  {
    id: "attend",
    scope: "Attendance",
    affects: "Pharmacy day and night shifts",
    rules: [
      t("Everyone signs in at the start of their shift on the pharmacy device"),
      t("Signing in more than {n} after the start counts as late", "late"),
      t("The in-charge is alerted if someone has not signed in {n} after the start", "not_in"),
      t("The person who signed in signs the handover count"),
    ],
  },
  {
    id: "pub",
    scope: "Publishing",
    affects: "Every week",
    rules: [
      t("Publish the week by the Thursday before it starts"),
      t("A published week is locked; unlocking it is logged"),
      t("People get an SMS when their shift changes after publishing"),
    ],
  },
  {
    id: "presc",
    scope: "Prescribers",
    affects: "Controlled-drug entries",
    rules: [
      t("Controlled entries pick the prescriber from the Prescribers list"),
      t("Changes to that list are confirmed by the medical superintendent"),
      t('A prescriber limit (e.g. "Oral morphine only") blocks other controlled drugs'),
    ],
  },
];

/** The server's refusals, in words (lib/pharmacy/write.ts databaseRefusal maps the guard's messages to these). */
export const ROSTER_REFUSAL = {
  viewOnly: "View only. You are not making the roster for this place.",
  locked: "This week is published. Unlock it to change.",
  onLeave: "On leave on this date.",
  licence: "Licence expired or not recorded for this date.",
  full: "That shift is full.",
  notHere: "They do not work at this place.",
  oneDuty: "One duty is one date at one place.",
  pharmacyOnly: "Ward rosters are made by the ward in-charge.",
  requestMoved: "This request has moved on. Look again.",
  publishOnly: "Only the in-charge, or someone handed publishing, can do this.",
  inChargeOnly: "Only the in-charge can do this.",
  proposerNotSecond: "You proposed this change, so someone else signs as the second signer.",
  endPassed: "The end date has already passed.",
  already: (shift: Shift) => `Already on ${SHIFT[shift].label.toLowerCase()}`,
  weekState: "The week has already changed. Look again.",
} as const;
