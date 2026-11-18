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
  /**
   * Phone only (finish pass 1, 18 Nov 2026). New strings, drafts like the rest of this file. `results.ordered`
   * is for the phone, which shows the tests a clinician ordered and no result values yet. `care` is the way to
   * the patient's own log while Care mode is locked: once Gate CG is signed, Today replaces it.
   */
  phone: {
    /** Under the wordmark on the splash: the landing hero's first line (content/tether-landing HERO). */
    tagline: "Book your clinic visit from home.",
    visitFailed: "Couldn't load your visits. Check your connection.",
    retry: "Try again",
    results: {
      ordered: "{n} tests ordered at your visits",
      orderedOne: "1 test ordered at your visits",
    },
    /** Visits: the v2 list, and the current week calendar kept beside it (7.10 is not built on the phone). */
    visits: { list: "List", week: "Week" },
    /** On the v2 visit page: opens the current screen for "I'm coming", Move it and Cancel (3.10, kept). */
    manageVisit: "Confirm, move or cancel",
    /** Where paying from the app is not switched on (`mobilePayments` off). */
    payOff: "Paying from the app is not switched on yet.",
    care: {
      title: "Your care",
      note: "Your medicines, readings, movement and mood.",
      open: "Open your care",
    },
  },
} as const;
