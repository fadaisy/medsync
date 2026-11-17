/**
 * Patient app v2 · Visit mode Home on the web (board 16): today's or the next visit, booking, free results, the
 * household and the small membership card. Drafts; the CSO signs; Claude never edits the status.
 */
import type { SignedCopy } from "../signed-copy";

export const HOME_V2_COPY_STATUS: SignedCopy = {
  status: "draft",
  signedBy: null,
  signedOn: null,
};

export const HOME_V2_COPY = {
  greeting: { morning: "Good morning", afternoon: "Good afternoon", evening: "Good evening" },
  today: "Today's visit",
  next: "Your next visit",
  none: "No visit booked",
  noneNote: "Book a clinic day, or come today if it cannot wait.",
  seeVisit: "Open your visit",
  book: {
    title: "Book a clinic",
    today: "Come today",
    todayNote: "Join today's list at your hospital.",
    day: "Ask for a day",
    dayNote: "Pick a clinic and a day that suits you.",
  },
  results: {
    title: "Results",
    free: "Always free",
    ready: "{n} ready to read",
    noneReady: "Nothing new",
    waiting: "{n} not ready yet",
    off: "Results will show here when your hospital shares them.",
    open: "See results",
  },
  household: {
    title: "People you book for",
    add: "Add someone",
    none: "Book for a parent or a child from here.",
    book: "Book for {name}",
  },
  card: { title: "Your card", open: "Open your card" },
} as const;
