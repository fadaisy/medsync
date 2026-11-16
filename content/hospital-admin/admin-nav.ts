/**
 * The hospital-admin menu outside Clinics & schedule's own views (ADR 0515), and the Requests page. Every string an
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
    departments: "Departments",
    emergency: "Emergency and support",
    staff: "Staff",
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
