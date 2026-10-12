/**
 * Messages off the platform (Lab Phase 1, §6.7, rules MS-1 to MS-4; ADR 0245). Pure.
 *
 * An SMS is rendered from an approved template with two fields only: the place and the lab's number
 * (MS-1). Every rendered text is scanned before it may go (MS-2): a hit means the message is skipped
 * and the lab is told, never sent (Law 7). The in-app channel carries `{alertId, kind, at}` and nothing
 * else (MS-4, `private.notify_user` in 0106).
 */

export type MessageKind = "level0" | "escalation";

export interface BannedTerms {
  /** Patient names known to the context (fixtures in CI; the patient at send time). */
  names: readonly string[];
  /** Every catalogue test name and synonym. */
  testNames: readonly string[];
  /** Unit displays and codes; a digit next to one is a value. */
  units: readonly string[];
}

/** Law 12: the restricted classes, by every word that would reveal one. */
export const RESTRICTED_TERMS = [
  "hiv",
  "aids",
  "arv",
  "art clinic",
  "viral load",
  "cd4",
  "tb",
  "tuberculosis",
  "genexpert",
  "mental health",
  "psychiatry",
  "psychiatric",
  "sexual",
  "reproductive",
  "sti",
  "syphilis",
  "pregnancy",
  "pregnant",
] as const;

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** A whole word or phrase, any case: "sti" never matches "still". */
const word = (t: string) => new RegExp(`(^|[^\\p{L}\\p{N}])${escape(t)}(?![\\p{L}\\p{N}])`, "iu");

/** MS-2: every banned term found in a text. `allow` (the lab's own number) is removed first. */
export function bannedTermScan(
  text: string,
  terms: BannedTerms,
  allow: readonly string[] = [],
): string[] {
  let t = text;
  for (const a of allow) if (a) t = t.split(a).join(" ");
  const hits: string[] = [];
  for (const n of terms.names)
    if (n.trim().length >= 2 && word(n.trim()).test(t)) hits.push(`name:${n}`);
  for (const n of terms.testNames)
    if (n.trim().length >= 2 && word(n.trim()).test(t)) hits.push(`test:${n}`);
  for (const r of RESTRICTED_TERMS) if (word(r).test(t)) hits.push(`restricted:${r}`);
  if (/\b\d{5,}\b|\b[A-Z]{1,4}-?\d{4,}\b/.test(t)) hits.push("identifier"); // MRN-like
  for (const u of terms.units) {
    if (u.trim() && new RegExp(`\\d\\s*${escape(u.trim())}(?![\\p{L}])`, "iu").test(t))
      hits.push(`value:${u}`);
  }
  return hits;
}

const FIELDS = /\{([^}]+)\}/g;
/** One GSM-7 SMS part (lib/notifications/sink.ts SMS_MAX_BODY_CHARS). */
export const SMS_ONE_PART = 160;

/** MS-1: an approved template with the place and the lab's number, and nothing else. */
export function renderSms(
  template: { body: string; status: string },
  fields: { place: string; labNumber: string },
  terms: BannedTerms,
):
  | { ok: true; text: string }
  | {
      ok: false;
      reason: "not_approved" | "unknown_field" | "no_lab_number" | "too_long" | "banned_term";
      detail?: string[];
    } {
  if (template.status !== "approved") return { ok: false, reason: "not_approved" };
  const unknown = [...template.body.matchAll(FIELDS)]
    .map((m) => m[1]!)
    .filter((f) => f !== "place" && f !== "lab number");
  if (unknown.length > 0) return { ok: false, reason: "unknown_field", detail: unknown };
  if (template.body.includes("{lab number}") && !fields.labNumber.trim())
    return { ok: false, reason: "no_lab_number" };
  const text = template.body
    .split("{place}")
    .join(fields.place)
    .split("{lab number}")
    .join(fields.labNumber);
  // One GSM-7 part: the transport refuses more rather than bill twice (lib/notifications/sink.ts).
  if (text.length > SMS_ONE_PART || !/^[\x20-\x7E\n]*$/.test(text))
    return { ok: false, reason: "too_long" };
  const hits = bannedTermScan(text, terms, [fields.labNumber]);
  return hits.length > 0 ? { ok: false, reason: "banned_term", detail: hits } : { ok: true, text };
}

export type SmsDecision =
  | { send: true }
  | { send: false; outcome: "off" | "skipped"; reason: string };

/** MS-3: SMS only when live, from an approved template, to a number on file, once per recipient per level. */
export function smsDecision(input: {
  smsLive: boolean;
  templateApproved: boolean;
  staffPhone: string | null;
  restricted: boolean;
  alreadySent: boolean;
}): SmsDecision {
  if (!input.smsLive) return { send: false, outcome: "off", reason: "sms_off" };
  if (input.restricted) return { send: false, outcome: "skipped", reason: "restricted" }; // Law 12
  if (!input.templateApproved)
    return { send: false, outcome: "skipped", reason: "no_approved_template" };
  if (!input.staffPhone) return { send: false, outcome: "skipped", reason: "no_number" };
  if (input.alreadySent) return { send: false, outcome: "skipped", reason: "already_sent" };
  return { send: true };
}

/** MS-4: the realtime payload. No patient detail; the client reads the alert under RLS. */
export const realtimePayload = (alertId: string, kind: string, at: Date) => ({
  alertId,
  kind,
  at: at.toISOString(),
});

/** MS-4: when the browser cannot subscribe, poll while visible. */
export const ALERT_POLL_MS = 15_000;
