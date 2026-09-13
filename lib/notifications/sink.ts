import { logger } from "@/lib/logger";
import { composeReceiptSms } from "@/lib/notifications/receipt";
import { DEFAULT_TIME_ZONE, LIVE_APPOINTMENT_STATUSES } from "@/supabase/functions/_shared/slots";

/**
 * The notification seam: transports, and the decision about what to send.
 *
 * Two halves, deliberately in one file because they are one contract:
 *
 *   1. `NotificationSink` — promoted verbatim out of lib/triage/notify.ts
 *      when appointment reminders became its second consumer. Triage and
 *      resus re-export it from there, so nothing moved for them.
 *   2. `planReminderDispatch` — the pure decision layer for the appointment
 *      reminder cron. No DB, no network, NO PHI (phone numbers never enter
 *      this file's inputs), so every rule below is unit-testable, which is
 *      what you want of code that spends real money on every `send`.
 *
 * Imports are limited to the zero-import slot engine and the logger on
 * purpose — the planner must stay cheap to import from a test.
 */

/* ─── out-of-band sink (triage / resus) ──────────────────────────── */

export interface NotificationSink {
  /** Best-effort out-of-band alert (SMS/push). Must never throw. */
  sendUrgent(args: { recipientUserId: string; subject: string; body: string }): Promise<void>;
}

/**
 * The staff-alert sink still logs and returns, and that is now a data
 * problem rather than a transport one: an SMS transport exists (see
 * ./africastalking.ts), but no table stores a staff phone number —
 * `staff_identity_profiles` has no phone column at all. Wiring this to
 * SMS therefore needs a schema change and an explicit decision to spend
 * money on every Red/Orange triage, neither of which is a one-file swap.
 * Until then the log line is the honest surface.
 */
export const stubbedNotificationSink: NotificationSink = {
  async sendUrgent({ recipientUserId, subject }) {
    logger.info("notify.sms_push.stubbed", {
      recipient: recipientUserId,
      subject,
      todo: "no staff phone column exists; see lib/notifications/sink.ts",
    });
  },
};

/* ─── SMS transport ──────────────────────────────────────────────── */

export type SmsSendResult =
  | {
      ok: true;
      providerMessageId?: string;
      /** Africa's Talking `cost`, e.g. "UGX 35.0000" — recorded per row (PRD §1.5). */
      cost?: { amount: string; currency: string };
    }
  | { ok: false; reason: string };

/** One SMS to one number. Implementations must never throw. */
export interface SmsSender {
  send(args: { toE164: string; body: string }): Promise<SmsSendResult>;
}

/**
 * One SMS part in GSM-7. Past this the message splits and the bill
 * multiplies, so `composeReminderSms` is required to fit inside it and the
 * transport refuses anything longer rather than quietly paying twice.
 */
export const SMS_MAX_BODY_CHARS = 160;

/**
 * A single non-GSM character (a curly apostrophe, an en dash) re-encodes
 * the whole message as UCS-2 and drops the per-part budget to 70 — a 160
 * character message silently becomes three billed parts. Compose in plain
 * ASCII and this cannot happen.
 */
export function isGsmSafe(body: string): boolean {
  return /^[\x20-\x7E\n]*$/.test(body);
}

/* ─── reminder dispatch: the ceilings ────────────────────────────── */

/**
 * ponytail: a per-run cap, not a budget. It is the blast radius of a loop
 * bug — at ~UGX 35 a message this bounds one run to pocket change, and the
 * cron is the only caller. Ceiling: nothing tracks spend ACROSS runs, so a
 * bug that re-queues rows could still burn money slowly. Upgrade path: a
 * daily spend row checked before the cap, once real volume exists to size
 * it against. Mulago OPD at ~2 reminders per appointment sits an order of
 * magnitude under this at a 15-minute cadence.
 */
export const MAX_SENDS_PER_RUN = 100;

/**
 * Bounds the scan itself so a backlog cannot page the whole queue into a
 * serverless function. Above the send cap because reaping stale rows is
 * most of what a backlog run does.
 */
export const MAX_ROWS_SCANNED_PER_RUN = 500;

/**
 * How late a reminder may be and still go out. A reminder more than this
 * far past its scheduled instant either misinforms (a "tomorrow" text
 * arriving in a different day-part) or is about to be superseded by a
 * nearer one, and after downtime the whole backlog would otherwise land on
 * patients at once. At a 15-minute cadence this tolerates eight
 * consecutive failed runs before anything is dropped.
 */
export const STALE_GRACE_MINUTES = 120;

/** Concurrent SMS requests. Keeps a capped run inside the function timeout. */
const SEND_CONCURRENCY = 8;

/**
 * Only a confirmed appointment earns a reminder. Telling a patient "your
 * appointment is tomorrow" when the clinician has not accepted the request
 * is a promise the hospital has not made. A request that is still
 * unconfirmed when its reminder goes stale is reaped by the rule above.
 */
const REMINDABLE_STATUS = "confirmed";

/* ─── reminder dispatch: the decision ────────────────────────────── */

/** One `appointment_reminders` row joined to its appointment. No PHI. */
export interface ReminderRow {
  reminderId: string;
  appointmentId: string;
  /** The queued channel preference — see `hasTransport`. */
  channel: string;
  state: string;
  /**
   * `appointment_reminders.kind` (migration 0059, ADR 0088): 'reminder' |
   * 'receipt'. Absent means 'reminder' (every row born before 0059).
   */
  kind?: string;
  scheduledAtIso: string;
  appointmentStartsAtIso: string;
  appointmentStatus: string;
  /** NULL for a booking made for a provisional patient (migration 0060). */
  patientUserId: string | null;
  hospitalName: string;
  /**
   * Receipt fields — `composeReceiptSms` needs them and a reminder ignores
   * them. `serviceName` is the service line's name, or the department's.
   */
  serviceName?: string | null;
  bookingCode?: string | null;
  positionNumber?: number | null;
  arrivalWindowStartIso?: string | null;
  arrivalWindowEndIso?: string | null;
}

export interface ReminderSend {
  reminderId: string;
  appointmentId: string;
  patientUserId: string | null;
  body: string;
  /** Set when the queued channel had no transport and descended to SMS. */
  substitutedFrom?: string;
}

export type ReapState = "cancelled" | "failed";

export interface ReminderReap {
  reminderId: string;
  state: ReapState;
  reason: string;
}

export interface DispatchPlan {
  sends: ReminderSend[];
  reaps: ReminderReap[];
  /** Left `queued` on purpose, by reason, so a backlog is visible in the log. */
  held: Record<string, number>;
}

/**
 * The channel ladder. `appointment_reminders.channel` permits push / sms /
 * email / in_app, but SMS is the only rung with a transport: push needs a
 * service worker and a subscriptions table and on launch day reaches zero
 * patients, email is not collected for reminders, and in_app cannot be
 * written at all — `sa_notifications.kind` has no appointment value and
 * widening a CHECK is a migration, not this file.
 *
 * So every row descends to SMS, which is also the only rung that reaches a
 * feature phone. The substitution is recorded on the send and counted in
 * the run summary rather than hidden.
 *
 * ponytail: one rung. Ceiling: a row asking for in_app still costs money.
 * Upgrade path: add the channel to this set when its transport lands; rows
 * naming it stop descending with no other change.
 */
const CHANNELS_WITH_A_TRANSPORT: ReadonlySet<string> = new Set(["sms"]);

export function hasTransport(channel: string): boolean {
  return CHANNELS_WITH_A_TRANSPORT.has(channel);
}

/**
 * What a reminder says. No name, no reason, no clinician, no department:
 * an SMS is plaintext on a handset that may be shared, borrowed or read by
 * someone at the kiosk that charges it, so the message carries the least
 * that still makes the appointment attendable — where and when.
 *
 * ADR-0084 §13 wants reschedule one tap from the text. That needs a
 * tokenised public route that does not exist; until it does the message
 * points at the app rather than promising a link it cannot render.
 */
export function composeReminderSms(args: { startsAtIso: string; hospitalName: string }): string {
  const when = formatWhen(args.startsAtIso);
  const facility = asciiOnly(args.hospitalName).trim();
  const full = `MedSync: your appointment at ${facility} is on ${when}. Open MedSync to reschedule or cancel.`;
  if (facility && full.length <= SMS_MAX_BODY_CHARS) return full;
  // Always fits: the variable half is a fixed-width date.
  return `MedSync: your appointment is on ${when}. Open MedSync to reschedule or cancel.`;
}

/** e.g. "Fri 13 Mar at 10:30" — East Africa Time, the only zone we serve. */
function formatWhen(startsAtIso: string): string {
  const at = new Date(startsAtIso);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: DEFAULT_TIME_ZONE,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(at);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? "";
  return `${get("weekday")} ${get("day")} ${get("month")} at ${get("hour")}:${get("minute")}`;
}

/** Strips anything that would flip the message to UCS-2 and triple the bill. */
function asciiOnly(value: string): string {
  // The curly apostrophe is the one that actually turns up in facility
  // names ("St Mary's"); everything else non-ASCII just goes.
  return value.replace(/[‘’]/g, "'").replace(/[^\x20-\x7E]/g, "");
}

/**
 * Decide what this run does. Pure — same inputs, same plan.
 *
 * Rule order is load-bearing:
 *   1. not `queued` — a row another run already claimed is never re-sent.
 *      The claiming UPDATE is the real guard; this is the second one.
 *   2. appointment no longer live (cancelled / declined / no_show /
 *      completed / rescheduled) — reaped `cancelled`, never sent.
 *   3. not due yet — held.
 *   4. appointment already started — reaped `failed`; a reminder for a
 *      visit in progress is noise the patient pays attention tax on.
 *   5. stale past the grace window — reaped `failed`, so a backlog after
 *      downtime does not blast every patient at once. REMINDERS ONLY: a
 *      receipt (kind 'receipt', ADR 0088) is the artifact the patient shows
 *      at the desk, so it is sent whenever it is found, late or not.
 *   6. still awaiting confirmation — held while fresh, reaped by (5) later.
 *      A receipt for a pending request is therefore sent the run after the
 *      clinician confirms it, which is what makes it a receipt.
 *   7. two due reminders for one appointment — the nearer lead wins, the
 *      older is reaped `failed` as superseded. One text per patient per
 *      run, whatever the outage did to the queue. Receipts stand apart: a
 *      receipt and a reminder due together both go.
 *   8. over the send cap — held, soonest appointments first.
 */
export function planReminderDispatch(args: {
  rows: ReadonlyArray<ReminderRow>;
  now: Date;
}): DispatchPlan {
  const nowMs = args.now.getTime();
  const staleBeforeMs = nowMs - STALE_GRACE_MINUTES * 60_000;
  const reaps: ReminderReap[] = [];
  const held: Record<string, number> = {};
  const hold = (reason: string) => {
    held[reason] = (held[reason] ?? 0) + 1;
  };

  const candidates: { row: ReminderRow; scheduledMs: number; startsMs: number }[] = [];

  for (const row of args.rows) {
    if (row.state !== "queued") {
      hold("not_queued");
      continue;
    }
    if (!(LIVE_APPOINTMENT_STATUSES as readonly string[]).includes(row.appointmentStatus)) {
      reaps.push({
        reminderId: row.reminderId,
        state: "cancelled",
        reason: `appointment_${row.appointmentStatus}`,
      });
      continue;
    }

    const scheduledMs = new Date(row.scheduledAtIso).getTime();
    const startsMs = new Date(row.appointmentStartsAtIso).getTime();
    if (!Number.isFinite(scheduledMs) || !Number.isFinite(startsMs)) {
      reaps.push({ reminderId: row.reminderId, state: "failed", reason: "unreadable_timestamp" });
      continue;
    }

    if (scheduledMs > nowMs) {
      hold("not_due");
      continue;
    }
    // The next three are deliberate skips, not dispatch failures: `cancelled`
    // is what cancel-appointment and reschedule-appointment already write for
    // a row that must never be sent. Only `unreadable_timestamp` above is a
    // genuine defect, so it alone stays `failed` — which is what makes
    // "failed" mean something an operator should act on.
    if (startsMs <= nowMs) {
      reaps.push({ reminderId: row.reminderId, state: "cancelled", reason: "appointment_elapsed" });
      continue;
    }
    const isReceipt = row.kind === "receipt";
    if (!isReceipt && scheduledMs < staleBeforeMs) {
      reaps.push({ reminderId: row.reminderId, state: "cancelled", reason: "stale" });
      continue;
    }
    if (isReceipt && !row.bookingCode) {
      // Only the Gate C writer queues receipts and it always writes a code;
      // a row without one is a defect, not a skip.
      reaps.push({ reminderId: row.reminderId, state: "failed", reason: "receipt_missing_code" });
      continue;
    }
    if (row.appointmentStatus !== REMINDABLE_STATUS) {
      hold("awaiting_confirmation");
      continue;
    }
    candidates.push({ row, scheduledMs, startsMs });
  }

  // (7) One reminder per appointment per run — the nearest lead wins.
  //     Keyed by kind as well, so a receipt never supersedes a reminder.
  const bestPerAppointment = new Map<string, (typeof candidates)[number]>();
  for (const candidate of candidates) {
    const key = `${candidate.row.kind === "receipt" ? "receipt" : "reminder"}:${candidate.row.appointmentId}`;
    const incumbent = bestPerAppointment.get(key);
    if (!incumbent) {
      bestPerAppointment.set(key, candidate);
      continue;
    }
    const [winner, loser] =
      candidate.scheduledMs > incumbent.scheduledMs
        ? [candidate, incumbent]
        : [incumbent, candidate];
    bestPerAppointment.set(key, winner);
    reaps.push({ reminderId: loser.row.reminderId, state: "cancelled", reason: "superseded" });
  }

  // (8) Soonest appointment first, so a capped run spends on the most imminent.
  const ordered = [...bestPerAppointment.values()].sort((a, b) => a.startsMs - b.startsMs);
  const sends: ReminderSend[] = [];
  for (const candidate of ordered) {
    if (sends.length >= MAX_SENDS_PER_RUN) {
      hold("over_cap");
      continue;
    }
    const substitutedFrom = hasTransport(candidate.row.channel) ? undefined : candidate.row.channel;
    sends.push({
      reminderId: candidate.row.reminderId,
      appointmentId: candidate.row.appointmentId,
      patientUserId: candidate.row.patientUserId,
      body:
        candidate.row.kind === "receipt"
          ? composeReceiptSms({
              hospitalName: candidate.row.hospitalName,
              serviceName: candidate.row.serviceName ?? "",
              startsAtIso: candidate.row.appointmentStartsAtIso,
              bookingCode: candidate.row.bookingCode ?? "",
              positionNumber: candidate.row.positionNumber,
              arrivalWindowStartIso: candidate.row.arrivalWindowStartIso,
              arrivalWindowEndIso: candidate.row.arrivalWindowEndIso,
            })
          : composeReminderSms({
              startsAtIso: candidate.row.appointmentStartsAtIso,
              hospitalName: candidate.row.hospitalName,
            }),
      ...(substitutedFrom ? { substitutedFrom } : {}),
    });
  }

  return { sends, reaps, held };
}

/* ─── delivery ───────────────────────────────────────────────────── */

export interface SmsJob {
  reminderId: string;
  toE164: string;
  body: string;
}

export interface SmsOutcome {
  reminderId: string;
  ok: boolean;
  reason?: string;
  providerMessageId?: string;
  cost?: { amount: string; currency: string };
}

/**
 * Fan the claimed jobs at the transport, a few at a time. One failure
 * never aborts the rest — the run has already claimed these rows, so a
 * thrown sender would strand every job behind it as sent-but-unsent.
 */
export async function deliverSms(args: {
  sender: SmsSender;
  jobs: ReadonlyArray<SmsJob>;
}): Promise<SmsOutcome[]> {
  const outcomes: SmsOutcome[] = [];
  for (let i = 0; i < args.jobs.length; i += SEND_CONCURRENCY) {
    const batch = args.jobs.slice(i, i + SEND_CONCURRENCY);
    const settled = await Promise.all(
      batch.map(async (job): Promise<SmsOutcome> => {
        if (!isGsmSafe(job.body) || job.body.length > SMS_MAX_BODY_CHARS) {
          return { reminderId: job.reminderId, ok: false, reason: "body_would_multi_part" };
        }
        try {
          const result = await args.sender.send({ toE164: job.toE164, body: job.body });
          return result.ok
            ? {
                reminderId: job.reminderId,
                ok: true,
                ...(result.providerMessageId ? { providerMessageId: result.providerMessageId } : {}),
                ...(result.cost ? { cost: result.cost } : {}),
              }
            : { reminderId: job.reminderId, ok: false, reason: result.reason };
        } catch (e) {
          return { reminderId: job.reminderId, ok: false, reason: String(e) };
        }
      }),
    );
    outcomes.push(...settled);
  }
  return outcomes;
}
