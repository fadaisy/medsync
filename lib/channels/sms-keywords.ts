/**
 * Inbound SMS keywords (Gate F, ADR 0091; PRD §3.3.7 "keyword-based, not
 * conversational"). Pure. Three verbs and a stop word; anything else is
 * `help`, answered once with the three keywords.
 *
 *   YES <code> | CONFIRM <code> | OK <code>   → confirm attendance
 *   CANCEL <code> | NO <code>                 → cancel the visit
 *   STOP | STOPALL | UNSUBSCRIBE | END        → opt out of SMS
 *
 * Case-insensitive; the code is six characters from the booking alphabet
 * (no 0/O/1/I). A verb with no code, or with a malformed one, is `help` too
 * — the reply says how to write it, which is more useful than "invalid".
 */

import { BOOKING_CODE_ALPHABET, BOOKING_CODE_LENGTH } from "@/supabase/functions/_shared/slots";

export type ParsedKeyword =
  | { keyword: "confirm"; code: string }
  | { keyword: "cancel"; code: string }
  | { keyword: "stop" }
  | { keyword: "help" }
  | { keyword: "unknown" };

const CONFIRM = new Set(["YES", "Y", "CONFIRM", "OK", "COMING"]);
const CANCEL = new Set(["CANCEL", "NO", "N"]);
const STOP = new Set(["STOP", "STOPALL", "UNSUBSCRIBE", "END", "QUIT"]);
const HELP = new Set(["HELP", "INFO", "?"]);

const CODE_RE = new RegExp(`^[${BOOKING_CODE_ALPHABET}]{${BOOKING_CODE_LENGTH}}$`);

/**
 * Upper-case, spaces and dashes removed. No look-alike guessing: the alphabet
 * has no 0/O/1/I, so a code carrying one is not a code — guessing which
 * glyph was meant could act on someone else's visit.
 */
export function normaliseCode(raw: string): string {
  return raw.toUpperCase().replace(/[\s-]/g, "");
}

const VERBS = new Set([...CONFIRM, ...CANCEL, ...STOP, ...HELP]);

export function parseKeyword(body: string): ParsedKeyword {
  let words = body.trim().toUpperCase().split(/\s+/).filter(Boolean);
  // On a SHARED shortcode the operator's keyword may arrive unstripped
  // ("MEDSYNC YES K7M2XQ"): when the first word is no verb but the second
  // is, the first was the keyword. One word of tolerance, never more.
  if (words.length > 1 && !VERBS.has(words[0] as string) && VERBS.has(words[1] as string)) {
    words = words.slice(1);
  }
  const verb = words[0] ?? "";
  if (!verb) return { keyword: "unknown" };
  if (STOP.has(verb)) return { keyword: "stop" };
  if (HELP.has(verb)) return { keyword: "help" };
  const code = words[1] ? normaliseCode(words[1]) : "";
  if (CONFIRM.has(verb))
    return CODE_RE.test(code) ? { keyword: "confirm", code } : { keyword: "help" };
  if (CANCEL.has(verb))
    return CODE_RE.test(code) ? { keyword: "cancel", code } : { keyword: "help" };
  return { keyword: "unknown" };
}
