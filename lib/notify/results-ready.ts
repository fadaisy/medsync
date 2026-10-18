/**
 * The results-ready SMS (Lab Phase 5 §6.2, PS-1..PS-6; ADR 0332). Pure: the template check, who gets one, when it
 * may go, and the batching window. Sending runs in the existing notification worker (lib/notifications); a failure
 * is retried there and never reaches the release path (PS-6). No message body is stored.
 */
import { z } from "zod";

/** PS-1: one signed template per language. `{Hospital}` is the only placeholder allowed. */
export const SmsTemplatePayload = z.object({
  language: z.string().regex(/^[a-z]{2,3}$/),
  text: z.string().trim().min(20).max(300),
  /** The sender ID the deployment registered; it must name no condition-specific clinic (PS-4). */
  senderId: z.string().trim().min(3).max(11),
});

export type SmsTemplate = z.infer<typeof SmsTemplatePayload>;

/** Words that reveal a test, a value or a condition-specific clinic, refused in the template and the sender ID. */
const REVEALING =
  /\b(hiv|art|arv|tb|tuberculosis|pregnan\w*|viral load|cd4|syphilis|hepatitis|psychiatr\w*|mental|cancer|biopsy|clinic|positive|negative|result of|test for|\d)/i;

/** PS-1, PS-4: the template carries no test, value, clinic or link, names only the hospital, and offers STOP. */
export function templateErrors(t: { text: string; senderId: string }): string[] {
  const e: string[] = [];
  const withoutHospital = t.text.replace(/\{Hospital\}/g, "");
  if (/\{(?!Hospital\})[^}]*\}/.test(t.text)) e.push("placeholder_not_allowed");
  if (REVEALING.test(withoutHospital)) e.push("reveals_condition_or_value");
  if (/https?:\/\/|www\./i.test(t.text)) e.push("link_not_allowed");
  if (!/\bSTOP\b/.test(t.text)) e.push("stop_route_missing");
  if (REVEALING.test(t.senderId)) e.push("sender_reveals_condition");
  // One GSM-7 part (lib/notifications/sink.ts refuses more), with room for a hospital name of 40 characters.
  if (withoutHospital.length + 40 > 160 || !/^[\x20-\x7E\n{}]*$/.test(t.text))
    e.push("too_long_or_not_gsm");
  return e;
}

export const render = (text: string, hospital: string) => text.replace(/\{Hospital\}/g, hospital);

/**
 * PS-2: send only when a result has just become visible, for a group whose rule allows SMS, to a patient who opted
 * in with a verified number and is not opted out. The never-shown floor never reaches here (visibleToPatient).
 */
export function shouldSend(s: {
  becameVisible: boolean;
  groupAllowsSms: boolean;
  smsConsent: boolean;
  phoneVerified: boolean;
  optedOut: boolean;
}): boolean {
  return s.becameVisible && s.groupAllowsSms && s.smsConsent && s.phoneVerified && !s.optedOut;
}

/** PS-3: messages go between 06:00 and 19:00 Kampala time; later ones wait for 06:00. Never dropped. */
export const SEND_FROM_HOUR = 6;
export const SEND_UNTIL_HOUR = 19;
const KAMPALA_OFFSET_H = 3; // East Africa Time, no daylight saving
export function nextSendTime(now: Date): Date {
  const local = new Date(now.getTime() + KAMPALA_OFFSET_H * 3_600_000);
  const h = local.getUTCHours();
  if (h >= SEND_FROM_HOUR && h < SEND_UNTIL_HOUR) return now;
  const day = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()));
  if (h >= SEND_UNTIL_HOUR) day.setUTCDate(day.getUTCDate() + 1);
  return new Date(day.getTime() + (SEND_FROM_HOUR - KAMPALA_OFFSET_H) * 3_600_000);
}

/** PS-3: at most one SMS per patient per batching window (operational). */
export const BATCH_WINDOW_MINUTES = 60;
export function inBatch(
  lastQueuedAt: Date | null,
  now: Date,
  windowMinutes = BATCH_WINDOW_MINUTES,
): boolean {
  return lastQueuedAt !== null && now.getTime() - lastQueuedAt.getTime() < windowMinutes * 60_000;
}
/** The idempotency key that makes one dispatch per patient per window (lib/notifications/dispatches). */
export function batchKey(
  patientUserId: string,
  at: Date,
  windowMinutes = BATCH_WINDOW_MINUTES,
): string {
  const slot = Math.floor(at.getTime() / (windowMinutes * 60_000));
  return `results_ready:patient:${patientUserId}:${slot}`;
}
