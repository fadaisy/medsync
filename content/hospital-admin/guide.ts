/**
 * The new-admin guide (ADR 0522): the welcome, the walkthroughs, "Set up Tether" on Today, the guide's how-tos and
 * the motion demos. Every string the guide shows lives here, with the route and the `data-tour` target of each
 * step. Wording from the approved prototype, corrected to the pages as they are built. Draft until the CSO signs;
 * Claude never edits the status.
 *
 * A step is [target, route, title, words]. The target is a `data-tour` key on the real page; the route is the real
 * URL with the query that page reads, or null to stay where the admin is. `{pick:list}` in a route is the first
 * record of that list on its page (see lib/hospital-admin/guide/route.ts).
 */
import type { SignedCopy } from "@/content/signed-copy";
import type { SetupKey } from "@/lib/hospital-admin/guide/setup";

export const GUIDE_COPY_STATUS: SignedCopy = {
  status: "draft",
  signedBy: null,
  signedOn: null,
};

/* ─── routes ─────────────────────────────────────────────────────────── */

const H = "/hospital-admin";
const TODAY = `${H}/today`;
const cs = (view: string) => `${H}/clinics?view=${view}`;
const clinic = (tab: string) => `${H}/clinics?view=clinics&clinic={pick:clinic}&tab=${tab}`;
const STAFF = `${H}/staff`;
const DEPTS = `${H}/departments`;
const WARDS = `${H}/departments/wards`;
const LAB = `${H}/lab`;
const EMERG = `${H}/departments/emergency`;
const PROFILE = `${H}/profile`;
const REQ = `${H}/requests`;
const REPORTS = `${H}/reports`;
const ACT = `${H}/activity`;

/* ─── types ──────────────────────────────────────────────────────────── */

export type WalkKey =
  | "menu"
  | "today"
  | "clinic"
  | "launch"
  | "week"
  | "closures"
  | "history"
  | "team"
  | "people"
  | "devices"
  | "depts"
  | "wards"
  | "lab"
  | "emerg"
  | "profile"
  | "follow";

export type DemoKey = "clinic" | "invite" | "dept" | "emerg" | "ward" | "lab";

/** [data-tour target, route or null, title, what to know]. */
export type WalkStep = readonly [tour: string, at: string | null, title: string, body: string];

export interface Walk {
  key: WalkKey;
  title: string;
  sub: string;
  steps: readonly WalkStep[];
  /** Show "Set up Tether" again before this walkthrough (it points at the card). */
  showsSetup?: boolean;
}

export interface HowTo {
  q: string;
  what: string;
  steps: readonly string[];
  note: string;
  /** "Take me there". */
  go: string | null;
  /** "Walk me through it". */
  walk: WalkKey | null;
}

export interface Topic {
  key: string;
  label: string;
  items: readonly HowTo[];
}

/**
 * One step of a demo: where it plays, what the cursor points at, and what it says. A demo only navigates (read-only)
 * and points: it never presses, types or saves. A target of null is a step inside a dialog that only opens by a
 * click, so its caption is shown in the middle of the page instead.
 */
export interface DemoStep {
  at?: string;
  tour: string | null;
  cap: string;
}

export interface Demo {
  key: DemoKey;
  title: string;
  /** "Try it yourself" starts this walkthrough. */
  walk: WalkKey;
  steps: readonly DemoStep[];
}

/* ─── the guide's own words ──────────────────────────────────────────── */

export const GUIDE = {
  button: "Guide",
  welcome: {
    label: "Welcome to Tether",
    cap: "Getting started",
    title: "Welcome to Tether",
    body: "Tether is where patients book your clinics. You set up the hospital they book into: clinics and sessions, your team, and what ambulances and the public see.",
    list: [
      ["Take a two-minute tour", "Each part of the menu, in order"],
      ["Follow Set up Tether on Today", "Seven steps, ticked off as you go"],
      ["Open the guide any time", "Under the ? in the sidebar"],
    ] as ReadonlyArray<readonly [string, string]>,
    start: "Show me around",
    skip: "I’ll explore on my own",
  },
  tour: {
    count: "{walk} · step {n} of {m}",
    next: "Next",
    done: "Done",
    startSetup: "Start setting up",
    back: "Back",
    watch: "▶ Watch it done",
    skip: "Skip the tour",
    dots: "Steps",
    dot: "Step {n}",
    walkDone: "{walk} · done. Every walkthrough is in the guide.",
    skipped: "Every walkthrough is in the guide, under the ? in the sidebar.",
  },
  dialog: {
    label: "The Tether guide",
    title: "The Tether guide",
    lead: "Short how-tos for running the hospital’s admin",
    topics: "Topics",
    walks: "Walkthroughs",
    walksTitle: "Walkthroughs · the page itself, step by step",
    find: "Search the guide · {walks} walkthroughs and {howtos} how-tos",
    findLabel: "Search the guide",
    none: "Nothing matches. Try another word, or pick a topic.",
    hits: ["{n} how-to for “{q}”", "{n} how-tos for “{q}”"] as const,
    noHit: "No how-to for “{q}”",
    steps: ["{n} step", "{n} steps"] as const,
    watchShort: "▶ Watch",
    watchAria: "Watch a demo: {title}",
    good: "Good to know",
    walk: "Walk me through it",
    watch: "▶ Watch it done",
    go: "Take me there",
    tour: "Tour the menu again",
    showSetup: "Show Set up Tether on Today",
    close: "Close",
  },
  demo: {
    badge: "Demo",
    count: "Step {n} of {m}",
    doneCount: "Done",
    note: "A demo: nothing is changed",
    doneCap: "That’s it. Replay it, or try it yourself.",
    pause: "Pause",
    play: "Continue",
    replay: "Replay",
    close: "Close",
    tryIt: "Try it yourself",
    label: "Demo: {title}",
    closed: "Demo closed. Nothing was changed.",
  },
  setup: {
    title: "Set up Tether",
    sub: "{n} of {m} done",
    ready: " · the hospital is ready",
    tour: "Take the tour",
    hide: "Hide",
    done: "Done",
    todo: "To do",
    show: "Show me how: {item}",
    showTitle: "Show me how",
    hidden: "Set up Tether is hidden. Bring it back from the guide, under the ? in the sidebar.",
  },
} as const;

/* ─── Set up Tether ──────────────────────────────────────────────────── */

/** [key, title, what it means, the page that does it, the walkthrough that shows it]. */
export const SETUP_TASKS: ReadonlyArray<
  readonly [key: SetupKey, title: string, sub: string, href: string, walk: WalkKey]
> = [
  [
    "profile",
    "Check the hospital profile",
    "Name, level and where the hospital is",
    PROFILE,
    "profile",
  ],
  [
    "depts",
    "Set your departments live",
    "Staff pick them at sign-up; their clinics can open",
    DEPTS,
    "depts",
  ],
  [
    "invite",
    "Invite your team",
    "Each person gets a link to join",
    `${STAFF}?tab=invites`,
    "people",
  ],
  [
    "emerg",
    "Set emergency routing and the location",
    "A second admin verifies routing changes",
    EMERG,
    "emerg",
  ],
  [
    "clinic",
    "Open your first clinic for booking",
    "Get ready shows what each clinic still needs",
    cs("ready"),
    "clinic",
  ],
  [
    "publish",
    "Publish the week plan",
    "Patients can book the sessions you publish",
    cs("week"),
    "week",
  ],
  [
    "desk",
    "Pair the front desk and the waiting-room screen",
    "In Desks and screens",
    cs("devices"),
    "devices",
  ],
];

/* ─── the walkthroughs ───────────────────────────────────────────────── */

export const WALKS: readonly Walk[] = [
  {
    key: "menu",
    title: "A tour of the menu",
    sub: "Every part of the admin, in order",
    steps: [
      [
        "nav-today",
        TODAY,
        "Today is your home",
        "What needs you across the hospital, and a Do next list. Each count opens the page where the work is done.",
      ],
      [
        "nav-get-ready",
        cs("ready"),
        "Get ready",
        "Every clinic, and what it still needs before patients can book it. When a clinic is ready, you open it here.",
      ],
      [
        "nav-clinics",
        cs("clinics"),
        "Clinics",
        "Each clinic’s rooms, fees, who runs it, and what patients read before they book.",
      ],
      [
        "nav-week-plan",
        cs("week"),
        "Week plan",
        "Sessions by day. A change stays a draft until you publish it, and patients are told about anything that moves.",
      ],
      [
        "nav-closures",
        cs("closures"),
        "Closures",
        "Holidays, leave and extra sessions on top of the usual week, so nobody books a day a clinic is shut.",
      ],
      [
        "nav-people",
        cs("people"),
        "People in Clinics & schedule",
        "Who runs each clinic’s sessions, and their leave and time away.",
      ],
      [
        "nav-desks-and-screens",
        cs("devices"),
        "Desks and screens",
        "The front desk and the waiting-room screens, and which clinics each one covers.",
      ],
      [
        "nav-history",
        cs("history"),
        "History",
        "Every published week, so a change can be undone or an earlier week brought back.",
      ],
      [
        "nav-departments",
        DEPTS,
        "Departments",
        "What the hospital runs. Set a department live so staff can pick it and its clinics can open.",
      ],
      [
        "nav-wards-and-beds",
        WARDS,
        "Wards and beds",
        "Each ward, its beds and who is in charge, the ward builder, and the live bed board.",
      ],
      [
        "nav-laboratory-and-imaging",
        LAB,
        "Laboratory and imaging",
        "Which tests clinicians can order here, where each is done and how long it takes.",
      ],
      [
        "nav-emergency-and-support",
        EMERG,
        "Emergency and support",
        "What ambulances and the public Help screen see. A change to emergency routing waits for a second admin to verify it.",
      ],
      [
        "nav-hospital-people",
        STAFF,
        "People",
        "Joining the hospital: invite staff, approve people who ask to join, the directory, and who the admins are.",
      ],
      [
        "nav-hospital-profile",
        PROFILE,
        "Hospital profile",
        "The hospital’s name and level, its emergency details and location, and outbreak mode.",
      ],
      [
        "nav-requests",
        REQ,
        "Requests, Reports and Activity",
        "What is waiting on someone, how booking is going, and who changed what.",
      ],
      [
        "search",
        null,
        "Find anything",
        "Search finds a page, a department, a ward, a clinic or a test; in Clinics & schedule it finds a clinic, a person or a room. Press ? for the keyboard shortcuts.",
      ],
      [
        "guide-btn",
        null,
        "The guide is always here",
        "Your setup list is on Today. Every walkthrough and how-to is here, whenever you need it.",
      ],
    ],
  },
  {
    key: "today",
    title: "Today",
    sub: "Your home page, and the setup list",
    showsSetup: true,
    steps: [
      [
        "wt-setup",
        TODAY,
        "Set up Tether",
        "Seven steps to a hospital patients can book. Each opens its page and is ticked off when it is done; the ? beside it walks you through it.",
      ],
      [
        "wt-today-stats",
        TODAY,
        "What needs you",
        "Visits booked today, booking requests waiting for a clinician, people asking to join, and services unavailable now. Each opens where it is dealt with.",
      ],
      [
        "wt-today-todo",
        TODAY,
        "Do next",
        "The things that need you: people to review, urgent requests, changes waiting for your verification, copies of results due.",
      ],
    ],
  },
  {
    key: "clinic",
    title: "Set up a clinic",
    sub: "From a new clinic to one patients can book",
    steps: [
      [
        "wt-add-clinic",
        cs("clinics"),
        "Add a clinic, or pick one",
        "Press + Add a clinic, or pick one from the list to finish it. A new clinic is not bookable until it is open and its week is published.",
      ],
      [
        "wt-clinic-panel",
        clinic("basics"),
        "The clinic’s setup",
        "Everything about one clinic, in five tabs: Basics, Sessions, Booking, Fee and Desks.",
      ],
      [
        "wt-clinic-blockers",
        clinic("basics"),
        "What stops it opening",
        "Before it can open lists each thing that blocks booking. Press one to jump to the tab that fixes it.",
      ],
      [
        "wt-clinic-name",
        clinic("basics"),
        "Its name",
        "The name patients see. The short name is what the front desk and the waiting-room screen show.",
      ],
      [
        "wt-clinic-dept",
        clinic("basics"),
        "Its department",
        "A clinic belongs to one department. Only a live department’s clinics can open.",
      ],
      [
        "wt-clinic-rooms",
        clinic("basics"),
        "Where it is",
        "Pick the block or wing, then the rooms it uses. Patients are told where to go.",
      ],
      [
        "wt-clinic-serves",
        clinic("basics"),
        "Who it serves",
        "General, private or both, and the age group. Children’s clinics stay desk only until children can be booked online.",
      ],
      [
        "wt-clinic-words",
        clinic("basics"),
        "Words for patients",
        "Up to 140 characters: who the clinic is for and what to bring. Patients read it when they book.",
      ],
      [
        "wt-clinic-preview",
        clinic("basics"),
        "How patients see it",
        "A preview of the clinic as patients will see it. Preview as a patient, at the top, shows the whole page.",
      ],
      [
        "wt-clinic-sessions",
        clinic("sessions"),
        "Sessions",
        "The usual week. Press + on a day to add a session, then choose its time, room, how many places and who runs it.",
      ],
      [
        "wt-clinic-booking",
        clinic("booking"),
        "Booking",
        "How far ahead patients can book, when booking closes, walk-ins and the reminder text.",
      ],
      [
        "wt-clinic-fee",
        clinic("fee"),
        "Fee",
        "Free, one fee, or a fee by who sees the patient, and how and when patients pay.",
      ],
      [
        "wt-clinic-desk",
        clinic("desks"),
        "Desks",
        "Which front desks call this clinic “Mine”, and which waiting-room screens show its codes. A clinic needs a desk before it can open.",
      ],
      [
        "wt-clinic-open",
        clinic("desks"),
        "Open for booking",
        "When nothing blocks it, Open for booking appears here. Patients can book its published sessions from then on.",
      ],
    ],
  },
  {
    key: "launch",
    title: "Get ready",
    sub: "See every clinic’s state and open them",
    steps: [
      [
        "wt-stages",
        cs("ready"),
        "Where every clinic stands",
        "Needs setup, Ready to open, and Taking bookings. Press a stage to filter the list below.",
      ],
      [
        "wt-launch-todo",
        cs("ready"),
        "What to do next",
        "The next things to fix across all clinics, each with a button that opens the fix.",
      ],
      [
        "wt-ltabs",
        cs("ready"),
        "Clinics by state",
        "Filter the list to the clinics that need setup, are ready, are taking bookings, or are children’s clinics.",
      ],
      [
        "wt-lrow",
        cs("ready"),
        "One clinic",
        "The bar shows how many checks pass, and each missing item is named. Fix opens the first one; Open appears when nothing blocks it.",
      ],
      [
        "wt-openall",
        cs("ready"),
        "Open every ready clinic",
        "Opens all clinics marked Ready at once, after you confirm. It shows only when a clinic is ready.",
      ],
      [
        "wt-tpl",
        cs("ready"),
        "Start from a template",
        "A usual week for each clinic, based on how hospitals of your level often run. Change anything after.",
      ],
    ],
  },
  {
    key: "week",
    title: "Plan and publish the week",
    sub: "Sessions, changes and publishing",
    steps: [
      [
        "wt-week-grid",
        cs("week"),
        "The usual week",
        "Every clinic’s sessions by day. Tap a session to change its time, room, places or who runs it.",
      ],
      [
        "wt-bulk",
        cs("week"),
        "Change many at once",
        "Move or change several sessions together, for example a new start time for a whole clinic.",
      ],
      ["wt-print", cs("week"), "Print the timetable", "A printable week for the notice board."],
      [
        "wt-publish",
        cs("week"),
        "Review and publish",
        "Your changes wait here as a draft. Review what changes and who is told, then publish now or schedule it for later. When there is nothing to publish this button is hidden.",
      ],
    ],
  },
  {
    key: "closures",
    title: "Closures and holidays",
    sub: "Days a clinic or the hospital is shut",
    steps: [
      [
        "wt-add-cx",
        cs("closures"),
        "Add a closure or a change",
        "Close clinics for some days, add time away, or add an extra session. Say why; anyone booked is told when you publish.",
      ],
      [
        "wt-cal",
        cs("closures"),
        "The month",
        "Closures and changes on the calendar, so you can see a busy week at a glance.",
      ],
      [
        "wt-xl",
        cs("closures"),
        "What is planned",
        "Every closure and change coming up, with who it affects.",
      ],
      [
        "wt-hol",
        cs("closures"),
        "Public holidays",
        "The next twelve months of public holidays. Close for each one, or keep chosen clinics open.",
      ],
    ],
  },
  {
    key: "history",
    title: "History",
    sub: "Undo a change, bring back an earlier week",
    steps: [
      [
        "wt-hx",
        cs("history"),
        "Drafts and versions",
        "Your unpublished changes, each one undoable, then every version you published.",
      ],
      [
        "wt-hist-row",
        cs("history"),
        "A published version",
        "Who published it, when, and what changed. Bring this version back makes it a new draft if you need it.",
      ],
    ],
  },
  {
    key: "team",
    title: "Your team",
    sub: "Who runs each clinic, and their time away",
    steps: [
      [
        "wt-addp",
        cs("people"),
        "Add a person",
        "Add someone to a clinic’s team, or someone new to the hospital.",
      ],
      [
        "wt-lr",
        cs("people"),
        "Leave and time away",
        "Requests to be away. Deciding one shows which sessions it touches.",
      ],
      [
        "nav-hospital-people",
        cs("people"),
        "The hospital’s People",
        "To review, Invitations, Directory and Admins are on People, under Hospital: joining the hospital, rather than running clinics.",
      ],
    ],
  },
  {
    key: "people",
    title: "Invite and approve staff",
    sub: "Joining the hospital, and the admins",
    steps: [
      [
        "wt-review",
        STAFF,
        "To review",
        "People who signed up and asked to join. Check their role and council number, then approve, ask for more, or decline with a reason.",
      ],
      [
        "wt-invite",
        `${STAFF}?tab=invites`,
        "Invite people",
        "Invite by email and say why. Each person gets a sign-up link you send them; they pick their role when they sign up, and you check it under To review.",
      ],
      [
        "wt-invites",
        `${STAFF}?tab=invites`,
        "Invitations",
        "Who you invited, and whether they joined. Revoke a link that should not be used.",
      ],
      [
        "wt-admins",
        `${STAFF}?tab=admins`,
        "Admins",
        "Who holds the hospital admin role, and who is primary or backup. Some changes, like emergency routing, need a second admin.",
      ],
    ],
  },
  {
    key: "devices",
    title: "Desks and screens",
    sub: "The front desk and waiting-room screens",
    steps: [
      [
        "wt-add-device",
        cs("devices"),
        "Add a device",
        "Add the front desk’s device or a waiting-room screen, pair it with a code, then choose which clinics it covers.",
      ],
    ],
  },
  {
    key: "depts",
    title: "Departments",
    sub: "What the hospital runs, and its booking rules",
    steps: [
      [
        "wt-dp-stats",
        DEPTS,
        "At a glance",
        "Departments, how many are live, how many have no head, and anything unavailable now.",
      ],
      [
        "wt-dp-filters",
        DEPTS,
        "Filter",
        "All departments, the live ones, or the ones not on Tether yet.",
      ],
      [
        "wt-dp-cards",
        DEPTS,
        "A department",
        "Its clinics, wards and beds, whether it is live, and its head. Open one to change it.",
      ],
      [
        "wt-dp-live",
        `${DEPTS}?open={pick:dept}`,
        "Live on Tether",
        "Switch it on so staff can pick the department at sign-up and its clinics can open. Name its head below.",
      ],
      [
        "wt-dp-tabs",
        `${DEPTS}?open={pick:dept}`,
        "Booking rules",
        "Overview, Booking rules, and Clinics and wards. Booking rules are the widest a clinic in this department can book: days, hours, the shortest slot, and whether bookings are confirmed at once.",
      ],
      [
        "wt-dp-add",
        DEPTS,
        "Add departments",
        "Add departments from the Ministry’s list. They stay off Tether until you set them live.",
      ],
      [
        "wt-dp-prob",
        `${DEPTS}?view=unavailable`,
        "Unavailable now",
        "Report a service that is down, such as an X-ray room, so clinicians know before they order. Mark it back to normal when it is fixed.",
      ],
    ],
  },
  {
    key: "wards",
    title: "Wards and beds",
    sub: "Wards, the ward builder and the bed board",
    steps: [
      [
        "wt-w-stats",
        WARDS,
        "Beds at a glance",
        "Beds open, free now, how full the wards are, beds being cleaned or out of service, and wards with no floor plan.",
      ],
      [
        "wt-w-cards",
        WARDS,
        "Each ward",
        "A small live plan of the ward, how full it is, and a button to its ward builder. Open a ward to change its details.",
      ],
      [
        "wt-w-modes",
        WARDS,
        "The ward builder and the bed board",
        "Each ward’s ward builder, and its live bed board once its layout is published: each bed’s state now. Staff set Free, Cleaning or Reserved; admissions set the rest.",
      ],
      [
        "wt-w-start",
        `${WARDS}/{pick:ward-new|ward}/layout`,
        "Start a ward’s layout",
        "A ward with no layout starts from its register, keeping its bed numbers, or from a template.",
      ],
      [
        "wt-w-pal",
        `${WARDS}/{pick:ward-laid|ward}/layout`,
        "The palette",
        "Beds, dividers, rooms and fixtures. Pick one, then click the floor to place it.",
      ],
      [
        "wt-w-plan",
        `${WARDS}/{pick:ward-laid|ward}/layout`,
        "The floor plan",
        "Drag to move and rotate. Show switches the plan to oxygen, suction, monitors or what is out of service.",
      ],
      [
        "wt-w-insp",
        `${WARDS}/{pick:ward-laid|ward}/layout`,
        "The ward and its checks",
        "The ward’s details, its bedside services, and the checks. Pick a bed to number it and mark what it has.",
      ],
      [
        "wt-w-publish",
        `${WARDS}/{pick:ward-laid|ward}/layout`,
        "Save and publish",
        "Your layout is a draft. Publish it to put the beds on the live bed board; a check that stops publishing must be fixed first.",
      ],
    ],
  },
  {
    key: "lab",
    title: "Laboratory and imaging",
    sub: "The test menu and imaging",
    steps: [
      [
        "wt-lab-stats",
        LAB,
        "Your menu at a glance",
        "Tests on your menu, done in-house or referred, and any without a turnaround.",
      ],
      [
        "wt-lab-tabs",
        LAB,
        "The parts of the page",
        "The test menu, where referrals go, hours by section, imaging, profiles, and a comparison with your level.",
      ],
      [
        "wt-lab-secs",
        LAB,
        "Sections",
        "Haematology, chemistry and the rest. Pick one to see only its tests.",
      ],
      [
        "wt-lab-table",
        LAB,
        "Each test",
        "Where it is done, its hours and turnaround. Tick several to change them together; open one to change it.",
      ],
      [
        "wt-lab-level",
        LAB,
        "Start from your level",
        "The Ministry’s menu for a hospital like yours. Adjust any test after.",
      ],
      [
        "wt-lab-add",
        LAB,
        "Add tests",
        "Add tests from the signed catalogue that are not on your menu yet.",
      ],
    ],
  },
  {
    key: "emerg",
    title: "Emergency and support",
    sub: "What ambulances and the public see",
    steps: [
      [
        "wt-em-hero",
        EMERG,
        "Receiving emergencies",
        "Whether the hospital takes emergencies now, and pre-alerts from ambulances. Ambulances and the Help screen read this first.",
      ],
      [
        "wt-em-routes",
        EMERG,
        "Emergency routing",
        "Receiving, pre-alerts, numbers, directions and the map location. Press Change, pick the new value and say why; a second admin verifies a routing change. The location is changed by one admin and audited.",
      ],
      [
        "wt-em-help",
        EMERG,
        "What the public sees",
        "The Help screen as people asking for help see it, with only verified numbers.",
      ],
      [
        "wt-em-sup",
        EMERG,
        "What you can take in",
        "Theatres, critical care, blood, oxygen and more. Ambulances choose a hospital by these.",
      ],
    ],
  },
  {
    key: "profile",
    title: "Hospital profile",
    sub: "Name, location and outbreak mode",
    steps: [
      [
        "wt-pf-id",
        PROFILE,
        "The hospital’s identity",
        "Its name, level and state. The superadmin sets these when the hospital joins; ask them for a change.",
      ],
      [
        "wt-pf-em",
        PROFILE,
        "Emergency details and location",
        "How the Emergency sheet lists the hospital, and where it is. The location orders hospitals nearest first on the public Help screen.",
      ],
      [
        "wt-ob",
        PROFILE,
        "Outbreak mode",
        "Switch it on during an outbreak so the clerking desk screens every fever. It asks for a reason.",
      ],
    ],
  },
  {
    key: "follow",
    title: "Requests, reports and activity",
    sub: "Following up",
    steps: [
      [
        "wt-rq-tabs",
        REQ,
        "Requests",
        "Booking requests a clinician still has to confirm, and copies of results to send.",
      ],
      [
        "wt-rq-rows",
        REQ,
        "A waiting request",
        "The oldest first, urgent ones marked. Open in week plan to change who runs the session.",
      ],
      [
        "wt-cp-rows",
        `${REQ}?tab=copies`,
        "Copies of results",
        "A patient’s right to a copy within 30 days. Send it, then press Mark sent and say how.",
      ],
      ["wt-rep-win", REPORTS, "Reports", "Pick 7, 28 or 90 days."],
      [
        "wt-rep-stats",
        REPORTS,
        "How booking is going",
        "Fill rate, no-shows, how near the time given patients are seen, demand, and messages sent.",
      ],
      [
        "wt-ac-tabs",
        ACT,
        "Activity",
        "This hospital’s admin changes from the last 90 days, with who, when and why. Filter by Schedule, People or Hospital.",
      ],
    ],
  },
];

/* ─── the how-tos ────────────────────────────────────────────────────── */

export const TOPICS: readonly Topic[] = [
  {
    key: "first",
    label: "Your first day",
    items: [
      {
        q: "What Tether does",
        what: "Tether is where patients book your clinics and hear about any change to their visit. As the hospital admin you set up what they book into: clinics and sessions, your team, the departments and wards, and the emergency details ambulances and the public read.",
        steps: [],
        note: "Patients never see this workspace. They see your clinics, sessions and fees in the Tether app, by SMS and on the Help screen.",
        go: null,
        walk: null,
      },
      {
        q: "Your first hour",
        what: "Set up Tether on Today lists seven steps. Each opens the page where it is done and is ticked off when it is.",
        steps: [
          "Check the hospital profile: name, level and location.",
          "Set the departments you run live.",
          "Invite your team.",
          "Set emergency routing and pin the hospital’s location.",
          "Open your first clinic for booking.",
          "Publish the week plan.",
          "Pair the front desk and the waiting-room screen.",
        ],
        note: "You can hide the list and bring it back from this guide.",
        go: TODAY,
        walk: "today",
      },
      {
        q: "Finding your way",
        what: "The menu has four parts: Today, Clinics & schedule (from Get ready to History), Hospital (departments, wards, the laboratory, emergency, people and the profile) and Follow-up (requests, reports and activity).",
        steps: [
          "Press ⌘K (Ctrl+K) to jump to a page, a department, a ward, a clinic or a test. In Clinics & schedule the search box finds a clinic, a person or a room.",
          "Press ? for keyboard shortcuts, and [ to fold the menu.",
          "The red Emergency button at the top is for a real emergency only.",
        ],
        note: "Today is your home: every count on it opens the page where the work is done.",
        go: null,
        walk: "menu",
      },
      {
        q: "Admins and the second admin",
        what: "Your hospital has a primary and a backup admin. Some changes are too important for one person, so a second admin verifies them before they go live.",
        steps: [
          "See who the admins are in People, under Admins.",
          "Emergency routing changes wait for a second admin.",
          "You can never verify your own change.",
        ],
        note: "Admin changes are kept in Activity with who made them, when and why.",
        go: `${STAFF}?tab=admins`,
        walk: "people",
      },
    ],
  },
  {
    key: "clinics",
    label: "Clinics and booking",
    items: [
      {
        q: "Open a clinic for booking",
        what: "Get ready lists every clinic and what it still needs before patients can book it.",
        steps: [
          "Open Get ready.",
          "Pick a clinic that needs setup and add what is missing: who runs it, its rooms, its fee and its sessions.",
          "When the clinic shows Ready, open it.",
          "Open the next one, or open every ready clinic at once.",
        ],
        note: "Starting from a template fills in a usual week for each clinic; change anything after.",
        go: cs("ready"),
        walk: "clinic",
      },
      {
        q: "Plan and publish the week",
        what: "The week plan shows each clinic’s sessions by day. Your changes stay a draft until you publish them.",
        steps: [
          "Open Week plan.",
          "Add a session, or tap one to change its time, room or who runs it.",
          "Press Review and publish at the top, read what will change and who is told, then publish.",
          "To publish later, schedule it instead.",
        ],
        note: "Patients whose visit moves are told by SMS and in the app. History keeps every published version.",
        go: cs("week"),
        walk: "week",
      },
      {
        q: "Shut a clinic for a day",
        what: "A closure stops booking on the days you choose, for one clinic or the whole hospital.",
        steps: [
          "Open Closures and press Add a closure or change.",
          "Pick the clinics, the days and a reason.",
          "Check who is already booked, then add it and publish.",
        ],
        note: "Anyone already booked is told when you publish. Public holidays are listed for you to accept.",
        go: cs("closures"),
        walk: "closures",
      },
      {
        q: "Undo a change or bring back an earlier week",
        what: "History keeps your drafts and every published version of the schedule.",
        steps: [
          "Open History.",
          "Undo a draft change, or find an earlier version.",
          "Press Bring this version back: it comes back as a new draft. Then publish.",
        ],
        note: "Nothing in History is lost: bringing a version back makes a new one.",
        go: cs("history"),
        walk: "history",
      },
    ],
  },
  {
    key: "people",
    label: "People",
    items: [
      {
        q: "Invite staff",
        what: "Staff join Tether from a link you send them.",
        steps: [
          "Open People, then Invitations.",
          "Press + Invite people, enter their emails and say why.",
          "Copy each link and send it to them yourself.",
          "Revoke a link that should not be used.",
        ],
        note: "A link works until the date it shows. It is shown only once, right after sending, so copy it then.",
        go: `${STAFF}?tab=invites`,
        walk: "people",
      },
      {
        q: "Approve someone who asked to join",
        what: "Clinicians and other staff who sign up themselves wait for you in To review.",
        steps: [
          "Open People: To review is the first tab.",
          "Check their role, department and council number.",
          "Approve, ask for more, or decline with a reason.",
        ],
        note: "A request waiting a week or more is marked so you can spot it.",
        go: STAFF,
        walk: "people",
      },
      {
        q: "Decide who runs each clinic",
        what: "People in Clinics & schedule shows who works where, and who runs each clinic’s sessions.",
        steps: [
          "Open People under Clinics & schedule.",
          "Pick a person to see their clinics and sessions.",
          "Change who runs a session in the week plan.",
        ],
        note: "A clinic cannot open until someone runs its sessions.",
        go: cs("people"),
        walk: "team",
      },
      {
        q: "Change a role, suspend or remove someone",
        what: "The directory lists everyone who works at the hospital.",
        steps: [
          "Open People, then Directory.",
          "Pick the person.",
          "Change their role or department, reset their authenticator, suspend them or close their account, with a reason.",
        ],
        note: "Each change is recorded in Activity.",
        go: `${STAFF}?tab=directory`,
        walk: "people",
      },
    ],
  },
  {
    key: "desk",
    label: "Front desk and screens",
    items: [
      {
        q: "Pair the front desk",
        what: "The reception desk runs Tether on its own device, paired to your hospital.",
        steps: [
          "Open Desks and screens and press + Add a device.",
          "Choose Reception desk, name it, for example Main reception, and get a pairing code.",
          "On the desk’s own device, open tether.health/pair and type the code.",
        ],
        note: "Each device in the list shows when it was last seen.",
        go: cs("devices"),
        walk: "devices",
      },
      {
        q: "Set up the waiting-room screen",
        what: "A screen in the waiting room calls patients by ticket code, never by name.",
        steps: [
          "In Desks and screens, add a device and choose Waiting-room screen.",
          "Open tether.health/pair on the TV’s browser and type the code.",
        ],
        note: "The screen shows ticket codes only, so no patient is named in public.",
        go: cs("devices"),
        walk: "devices",
      },
    ],
  },
  {
    key: "hospital",
    label: "Hospital set-up",
    items: [
      {
        q: "Set a department live",
        what: "A department is live when staff can pick it at sign-up and its clinics can open.",
        steps: [
          "Open Departments and pick a department.",
          "Switch on Live on Tether.",
          "Name its head, and set its booking rules if it needs its own.",
        ],
        note: "Taking a department off asks you first, and says who is affected.",
        go: DEPTS,
        walk: "depts",
      },
      {
        q: "Report something unavailable",
        what: "When a service is down, such as the ultrasound or the X-ray room, clinicians are told before they order it.",
        steps: [
          "Open Departments, then Unavailable now.",
          "Press Report a problem: what, how bad, and why.",
          "Press Back to normal when it is fixed.",
        ],
        note: "Problems resolved in the last 90 days stay listed.",
        go: `${DEPTS}?view=unavailable`,
        walk: "depts",
      },
      {
        q: "Lay out a ward",
        what: "The ward builder puts each bed where it really stands, so the live bed board matches the ward.",
        steps: [
          "Open Wards and beds and press Lay it out, or Ward builder, on a ward.",
          "Start from the register or a template.",
          "Move, rotate and number the beds, and mark what each has: oxygen, suction, a monitor.",
          "Fix any check that stops publishing, then publish the layout.",
        ],
        note: "Nothing reaches the bed board until you publish.",
        go: WARDS,
        walk: "wards",
      },
      {
        q: "Set the laboratory’s tests",
        what: "The test menu says which tests clinicians can order here, where each is done and how long it takes.",
        steps: [
          "Open Laboratory and imaging.",
          "Start from your level, or add tests one by one.",
          "Mark each test in-house or referred, where it is referred to, and its turnaround.",
          "Group tests clinicians order together into profiles.",
        ],
        note: "Clinicians see the turnaround you set when they order.",
        go: LAB,
        walk: "lab",
      },
      {
        q: "Keep the hospital profile right",
        what: "The profile holds the hospital’s name, level and state, its emergency details and location, and outbreak mode.",
        steps: [
          "Open Hospital profile.",
          "Check the name and level. The superadmin sets these; ask them for a change.",
          "Change the location if it is wrong, with a reason.",
        ],
        note: "The location orders hospitals nearest first on the public Help screen.",
        go: PROFILE,
        walk: "profile",
      },
    ],
  },
  {
    key: "emergency",
    label: "Emergencies",
    items: [
      {
        q: "Change emergency routing",
        what: "Routing is what ambulances, the emergency map and the Help screen say about your hospital.",
        steps: [
          "Open Emergency and support.",
          "Press Change on a setting: receiving emergencies, pre-alerts, numbers or directions.",
          "Pick the new value and say why.",
          "Press Send for verification. Another admin verifies it before it goes live.",
        ],
        note: "What the public sees on the Help screen is previewed on the same page.",
        go: EMERG,
        walk: "emerg",
      },
      {
        q: "Verify another admin’s change",
        what: "A change waiting for you is listed at the top of Emergency and support, under Waiting for a second admin, and on Today.",
        steps: [
          "Open Emergency and support.",
          "Read what it is now and what is proposed.",
          "Verify it, or reject it with a reason.",
        ],
        note: "Your own changes wait for someone else; you cannot verify them.",
        go: EMERG,
        walk: "emerg",
      },
      {
        q: "Pin the hospital’s location",
        what: "One pin marks the hospital for the emergency map and the Help screen.",
        steps: [
          "Open Emergency and support and press Move the pin.",
          "Find the hospital by name, or click the map.",
          "Zoom in and put the pin on the emergency entrance, then save with a reason.",
        ],
        note: "Check it in Google Maps from the same card.",
        go: EMERG,
        walk: "emerg",
      },
    ],
  },
  {
    key: "follow",
    label: "Follow-up",
    items: [
      {
        q: "A booking request is waiting",
        what: "Requests lists bookings a clinician still has to confirm.",
        steps: [
          "Open Requests.",
          "The oldest is first; urgent ones are marked.",
          "Press Open in week plan to change who runs the session.",
        ],
        note: "Clinicians confirm or decline from their own schedule.",
        go: REQ,
        walk: "follow",
      },
      {
        q: "Send a patient a copy of their results",
        what: "A patient has the right to a copy of their results within 30 days.",
        steps: [
          "Open Requests, then Copies of results.",
          "Send the copy, then press Mark sent and say how it went out.",
        ],
        note: "If a result is held in the app, ask the clinician first.",
        go: `${REQ}?tab=copies`,
        walk: "follow",
      },
      {
        q: "Read the reports",
        what: "Reports show how booking is going over 7, 28 or 90 days: fill rate, no-shows, how near the time given patients are seen, demand, and messages sent.",
        steps: [],
        note: "A rate with too few visits behind it says Too few to say instead of showing a number.",
        go: REPORTS,
        walk: "follow",
      },
      {
        q: "See who changed what",
        what: "Activity lists this hospital’s admin changes from the last 90 days, with who, when and why.",
        steps: ["Open Activity.", "Filter by Schedule, People or Hospital."],
        note: "Schedule drafts and versions are in History; Activity is the record of the other admin changes.",
        go: ACT,
        walk: "follow",
      },
    ],
  },
];

/* ─── the demos ──────────────────────────────────────────────────────── */

/**
 * Motion demos: the real screens, played. Each demo goes to real pages (read-only), points the cursor at the real
 * control and says what you would do there. It never presses, types or saves, so nothing changes.
 */
export const DEMOS: readonly Demo[] = [
  {
    key: "clinic",
    title: "Set up a clinic",
    walk: "clinic",
    steps: [
      {
        at: clinic("basics"),
        tour: "wt-clinic-blockers",
        cap: "Before it can open lists what still stops this clinic opening.",
      },
      {
        tour: "wt-clinic-name",
        cap: "Check its name. Patients see it; the desk and the screen show the short name.",
      },
      {
        tour: "wt-clinic-words",
        cap: "A line for patients: who the clinic is for and what to bring.",
      },
      { at: clinic("sessions"), tour: "wt-clinic-tabs", cap: "Now its sessions." },
      { tour: "wt-ses-add", cap: "Press + on Monday to add a session." },
      { tour: null, cap: "Pick a time. A morning session fits most clinics." },
      { tour: null, cap: "Choose who runs it." },
      { tour: null, cap: "Save the session. It stays a draft until you publish the week." },
      {
        at: clinic("desks"),
        tour: "wt-clinic-open",
        cap: "When nothing blocks it, press Open for booking.",
      },
      { tour: null, cap: "Confirm. It takes bookings once its week is published." },
      {
        at: cs("week"),
        tour: "wt-publish",
        cap: "Your changes wait here. Press Review and publish.",
      },
      { tour: null, cap: "Publish. Patients can book its sessions from then on." },
    ],
  },
  {
    key: "invite",
    title: "Invite staff",
    walk: "people",
    steps: [
      {
        at: `${STAFF}?tab=invites`,
        tour: "wt-invite",
        cap: "In People, open Invitations and press + Invite people.",
      },
      { tour: null, cap: "Type their emails, one per line." },
      { tour: null, cap: "Say why you are inviting them. It is kept with the invitation." },
      {
        tour: null,
        cap: "Press Send invitations. Each person gets a link to join; copy it and send it to them.",
      },
      {
        tour: "wt-invites",
        cap: "Your invitations are listed here, with whether each person has joined.",
      },
    ],
  },
  {
    key: "dept",
    title: "Set a department live",
    walk: "depts",
    steps: [
      {
        at: DEPTS,
        tour: "wt-dp-filters",
        cap: "Filter to Not on Tether yet, and open a department.",
      },
      {
        at: `${DEPTS}?open={pick:dept}`,
        tour: "wt-dp-live",
        cap: "Switch on Live on Tether. Staff can pick it at sign-up, and its clinics can open.",
      },
      { tour: "wt-dp-heads", cap: "Name its head of department." },
      {
        tour: "wt-dp-tabs",
        cap: "Give it its own booking rules under Booking rules if it needs them.",
      },
    ],
  },
  {
    key: "emerg",
    title: "Change emergency routing",
    walk: "emerg",
    steps: [
      { at: EMERG, tour: "wt-em-routes", cap: "Find the setting to change." },
      { tour: "wt-em-change", cap: "Press Change." },
      { tour: null, cap: "Pick the new value. You see Now and Proposed side by side." },
      { tour: null, cap: "Say why." },
      {
        tour: null,
        cap: "Press Send for verification. A second admin checks it before ambulances see it.",
      },
    ],
  },
  {
    key: "ward",
    title: "Lay out a ward",
    walk: "wards",
    steps: [
      {
        at: WARDS,
        tour: "wt-w-modes",
        cap: "Open a ward’s ward builder: Lay it out, or Ward builder.",
      },
      {
        at: `${WARDS}/{pick:ward-new|ward}/layout`,
        tour: "wt-w-start",
        cap: "A ward with no layout starts from its register, keeping its bed numbers, or from a template.",
      },
      {
        at: `${WARDS}/{pick:ward-laid|ward}/layout`,
        tour: "wt-w-plan",
        cap: "The beds are placed, numbered from the register. Pick a bed to change it.",
      },
      { tour: "wt-w-insp", cap: "Mark what the bed has, such as a cardiac monitor." },
      {
        tour: "wt-w-pal",
        cap: "An isolation room needs hand-washing. Pick Hand-wash from Fixtures…",
      },
      { tour: "wt-w-plan", cap: "…then click the floor inside the room to place it." },
      {
        tour: "wt-w-publish",
        cap: "When every check passes, publish the layout: its beds go on the live bed board.",
      },
    ],
  },
  {
    key: "lab",
    title: "Refer a test and set its turnaround",
    walk: "lab",
    steps: [
      { at: LAB, tour: "wt-lab-secs", cap: "Pick a section, such as Molecular." },
      { tour: "wt-lab-table", cap: "Open a test." },
      {
        at: `${LAB}?test={pick:lab-test}`,
        tour: "wt-lab-where",
        cap: "If your lab cannot run it, mark it Referred.",
      },
      { tour: "wt-lab-labs", cap: "Write where it is referred to." },
      { tour: "wt-lab-tat", cap: "Set the turnaround clinicians are told when they order it." },
      {
        at: `${LAB}?tab=referrals`,
        tour: "wt-lab-refer",
        cap: "Referrals shows each lab with the tests sent to it.",
      },
      {
        at: `${LAB}?tab=imaging`,
        tour: "wt-lab-img",
        cap: "Imaging: each service’s machines, hours and state, as clinicians see them.",
      },
    ],
  },
];

/** The demo a walkthrough offers ("▶ Watch it done"). */
export const DEMO_OF: Partial<Record<WalkKey, DemoKey>> = {
  clinic: "clinic",
  launch: "clinic",
  people: "invite",
  depts: "dept",
  emerg: "emerg",
  wards: "ward",
  lab: "lab",
};
