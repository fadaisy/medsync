/**
 * The hospital-admin menu outside Clinics & schedule's own views (ADR 0520), and the Requests page. Every string an
 * admin reads in the shared frame lives here. Draft until the CSO signs; Claude never edits the status.
 */
import type { SignedCopy } from "@/content/signed-copy";

export const ADMIN_NAV_COPY_STATUS: SignedCopy = {
  status: "draft",
  signedBy: null,
  signedOn: null,
};

export const ADMIN_NAV = {
  label: "Hospital admin",
  role: "Hospital admin",
  online: "Online",
  signOut: "Sign out",
  groups: { hospital: "Hospital", followUp: "Follow-up" },
  items: {
    today: "Today",
    activity: "Activity",
    departments: "Departments",
    wards: "Wards and beds",
    lab: "Laboratory and imaging",
    emergency: "Emergency and support",
    staff: "People",
    profile: "Hospital profile",
    intake: "Intake",
    requests: "Requests",
    reports: "Reports",
  },
  unavailable: "{n} unavailable",
  toReview: "{n} to review",
  keys: {
    title: "Keyboard shortcuts",
    sub: "They never fire while you type",
    list: [
      ["Find anything", ["⌘", "K"]],
      ["Collapse the sidebar", ["["]],
      ["This list", ["?"]],
    ] as ReadonlyArray<readonly [string, readonly string[]]>,
  },
} as const;

export const REQUESTS = {
  title: "Requests",
  lead: "Waiting on someone · each has an owner and a next step",
  tabs: { clinician: "Waiting for a clinician", copies: "Copies of results" },
  clinician: {
    note: "Booking requests a clinician still has to confirm. Clinicians confirm or decline these from their own schedule; open the session in the week plan to change who runs it.",
    empty: "Nothing is waiting for a clinician.",
    provisional: "Provisional",
    virtual: "Virtual",
    waiting: "waiting {t}",
    urgent: "Urgent",
    stale: "Over 2 days",
    open: "Open in week plan",
    more: "Showing the oldest {shown}. More are waiting.",
  },
  copies: {
    note: "A patient's right to a copy of their results. Reply within 30 days. A result held in the app is still included: ask the clinician first.",
    empty: "No open requests.",
    title: "Copy of results · {code}",
    noNumber: "No number",
    due: "Reply by {date}",
    held: "a result is held in the app: ask the clinician first",
    mark: "Mark sent",
    dialogTitle: "Mark the copy sent",
    dialogLead: "{code} · reply by {date}",
    how: "How was it sent?",
    howPh: "e.g. Printed and handed over at the desk",
    hint: "At least 8 characters. Kept with the request, with your name and the time.",
    cancel: "Cancel",
    done: "Marked sent.",
  },
  errors: {
    invalid: "Write how it was sent, in 8 characters or more.",
    gone: "This request is already closed, or is not at this hospital.",
    failed: "Could not save. Try again.",
  },
} as const;

export const TODAY = {
  title: "Today",
  lead: "{date} · what needs you across the hospital",
  unknown: "—",
  stats: {
    booked: ["Booked today", "visits across the open clinics"],
    waiting: ["Waiting for a clinician", "booking requests"],
    review: ["People to review", "asked to join"],
    unavailable: ["Unavailable now", "services reported"],
  },
  doNext: "Do next",
  doNextSub: "The oldest first. Each opens where it is done.",
  none: "Nothing needs you right now.",
  todo: {
    review: ["{n} people asked to join", "Approve or decline in People", "Review"],
    urgent: ["{n} urgent requests wait for a clinician", "The oldest has waited {t}", "Open"],
    stale: [
      "{n} requests have waited over 2 days",
      "Open the session in the week plan to change who runs it",
      "Open",
    ],
    verify: [
      "{n} changes to emergency and support wait for you to verify",
      "Proposed by {names}",
      "Verify",
    ],
    mine: [
      "{n} of your changes wait for another admin",
      "A second admin verifies them before they go live",
      "Open",
    ],
    copy: ["Copy of results for {code}", "Reply by {date}", "Open"],
    unavailable: ["{n} services are unavailable now", "Clear each one when it is back", "Open"],
  },
  launch: [
    "Clinics and schedule",
    "Get ready, clinics, the week plan and closures",
    "Open Get ready",
  ],
  desk: [
    "Arrivals",
    "Patients are registered and checked in at the front desk, not in admin.",
    "Open the front desk",
  ],
} as const;

export const ACTIVITY = {
  title: "Activity",
  lead: "What admins changed at this hospital, with who, when and why",
  tabs: { all: "Everything", schedule: "Schedule", people: "People", hospital: "Hospital" },
  empty: "Nothing recorded in the last {days} days.",
  more: "Showing the latest {n}.",
  note: "Schedule drafts and published versions, with undo and bring back, stay under History in Clinics & schedule.",
  someone: "An admin",
  failed: "Activity could not be read just now. Try again later.",
  windowNote: "The last {days} days.",
  areas: { schedule: "Schedule", people: "People", hospital: "Hospital" },
} as const;
