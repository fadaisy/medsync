/**
 * Every user-facing string of the low-bandwidth channels (Gate F, ADR 0091;
 * PRD §6.4). ONE table, keyed by language: Luganda is a data change here
 * after CSO sign-off — never machine translation, and a language is fully on
 * or off (`LANGUAGES` lists what is on). The USSD machine and the SMS reply
 * composer read from this file alone; a test greps them for literals.
 *
 * ⚠ CSO-PROVISIONAL throughout. GSM-7/ASCII only: a USSD screen is 160
 * characters and an SMS is one part; a diacritic doubles the cost of both.
 *
 * `{name}` placeholders are filled by `t()`. Menu lines are built by the
 * machine from these fragments so the 160-character budget is the machine's
 * to keep (it truncates names, never sentences).
 */

export type Language = "en";

/** Languages that are ON. A second entry here is Luganda's launch switch. */
export const LANGUAGES: ReadonlyArray<{ code: Language; digit: string; name: string }> = [
  { code: "en", digit: "1", name: "English" },
];

export const DEFAULT_LANGUAGE: Language = "en";

const EN = {
  // ── USSD roots ──
  brand: "MedSync",
  root_book: "1 Book a visit",
  root_next: "2 My next visit",
  root_cancel: "3 Cancel my visit",
  root_confirm: "4 Confirm I'm coming",
  /** CSO-provisional; on the root and on the END of "my next visit" (the budget forbids it elsewhere). */
  emergency: "If very sick go to emergency now.",

  // ── paging + errors ──
  more: "0 More",
  back: "9 Back",
  invalid: "Not a valid choice.",
  too_many: "Too many requests from this phone. Try again in an hour.",
  timed_out: "This session ended. Dial again.",
  unavailable: "MedSync is busy. Try again in a moment.",

  // ── the booking path ──
  pick_language: "Choose a language",
  pick_hospital: "Choose a hospital",
  no_hospitals: "No hospital has days open right now. Try again later.",
  pick_line: "Choose a clinic",
  no_lines: "This hospital has no clinics open for booking right now.",
  pick_day: "Choose a day",
  no_days: "No days open in the next 2 weeks. The hospital sees walk-ins; ask at the desk.",
  /** One screen (the 6-level budget): name and age together. */
  ask_name_age: "Your name and age, e.g. Amina 34",
  name_age_invalid: "Type your name then your age, e.g. Amina 34",
  /** "Book as {name}?" when the phone matches an account — never auto-linked (PRD §2.8). */
  known_name: "Booking as {name}. 1 Yes 2 Another name",
  confirm: "Book {line} at {hospital}, {day}? 1 Yes 2 No",
  booked_position:
    "Booked. Position {position}, arrive {window}. Code {code}. The desk will ask for it.",
  booked_time: "Booked. {day} at {time}. Code {code}. The desk will ask for it.",
  book_failed: "Could not book: {reason}",
  cancelled_by_user: "Nothing booked.",

  // ── my next visit ──
  next_none: "No visit found for this phone. To book, dial again and choose 1.",
  next_visit: "Your next visit: {day}{time} at {hospital}. Code {code}.",

  // ── cancel / confirm by code ──
  ask_code_cancel: "Type the booking code to cancel",
  ask_code_confirm: "Type the booking code to confirm",
  code_unknown: "No visit with that code for this phone.",
  cancelled: "Cancelled. Your place is released. Code {code}.",
  not_cancellable: "This visit cannot be cancelled now. Code {code}.",
  confirmed: "Thank you. The clinic expects you. Code {code}.",
  not_confirmable: "This visit cannot be confirmed now. Code {code}.",

  // ── SMS replies (one each) ──
  sms_help: "MedSync: reply YES <code> to confirm, CANCEL <code> to cancel, STOP to end SMS.",
  sms_stopped:
    "MedSync: SMS is off for this number. Your bookings stand. Open the app or dial the code for messages.",
  sms_too_many: "MedSync: too many messages from this number. Try again in an hour.",
} as const;

export type StringKey = keyof typeof EN;

const TABLES: Record<Language, Readonly<Record<StringKey, string>>> = { en: EN };

/** The string for `key` in `language`, with `{placeholders}` filled. Missing values render as "". */
export function t(
  language: Language,
  key: StringKey,
  vars: Record<string, string | number | null | undefined> = {},
): string {
  const table = TABLES[language] ?? TABLES[DEFAULT_LANGUAGE];
  return table[key].replace(/\{(\w+)\}/g, (_, name: string) => {
    const v = vars[name];
    return v === null || v === undefined ? "" : String(v);
  });
}

/** True when `code` names a language that is ON. */
export function isLanguage(code: string): code is Language {
  return LANGUAGES.some((l) => l.code === code);
}
