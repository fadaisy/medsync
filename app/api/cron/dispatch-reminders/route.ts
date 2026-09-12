import type { ReminderRow, SmsJob } from "@/lib/notifications/sink";
import { NextResponse } from "next/server";
import { and, asc, eq, inArray, lte } from "drizzle-orm";

import { db } from "@/db";
import { hospitals } from "@/db/schema/hospitals";
import { patientProfiles } from "@/db/schema/patient-profiles";
import { appointmentReminders, appointments } from "@/db/schema/scheduling";
import { decrypt } from "@/lib/encryption";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { createAfricasTalkingSender } from "@/lib/notifications/africastalking";
import {
  deliverSms,
  MAX_ROWS_SCANNED_PER_RUN,
  planReminderDispatch,
} from "@/lib/notifications/sink";

export const dynamic = "force-dynamic";
/** A capped run is ~13 batches of 8 sends; 60s is head-room, not a target. */
export const maxDuration = 60;

/**
 * Appointment-reminder dispatcher — the consumer `appointment_reminders`
 * never had. Rows have been queued by pt-request-appointment and
 * system-propose-urgent-appointment, and reaped on cancel and reschedule,
 * since migration 0028; until this route nothing read them and no patient
 * was ever reminded. One-way SMS on attendance is OR 2.03 across twelve
 * sub-Saharan trials (ADR-0084 §13), so this is the cheapest attendance
 * intervention available at launch.
 *
 * Same `CRON_SECRET` Bearer auth as the other two crons. Wired in
 * vercel.json at `*∕15 * * * *` — a reminder with a 60-minute lead is
 * useless on a daily trigger, and REQUIRES the Vercel Pro plan for both
 * the cadence and the third cron slot. See the report at ship time.
 *
 * ── Idempotency, and which way it is allowed to fail ──
 * Rows are CLAIMED before the transport is touched: one conditional
 * `UPDATE … SET state='sent' WHERE id = ANY(…) AND state='queued'`, and
 * only the ids Postgres returns are sent. Two overlapping runs serialise
 * on the row lock and the loser claims nothing, so no message goes twice.
 *
 * The deliberate consequence: if the process dies between the claim and
 * the provider call, the row reads `sent` and no SMS left. AT-MOST-ONCE,
 * chosen over at-least-once because a missed reminder costs one patient
 * one nudge, while a duplicate costs real money on every retry, trains
 * patients to ignore the channel, and in a loop does both at volume. A
 * send that fails visibly is flipped back to `failed` with the provider's
 * own words, which is a re-queueable state; a send lost to a crash is not,
 * and that is the price.
 *
 * ── PHI ──
 * Patient phones live in `patient_profiles.phone_encrypted`. Ciphertext is
 * selected for the due rows; only the rows the planner actually decided to
 * send are decrypted. No number, name, or appointment reason is logged or
 * returned, and no reason text rides the SMS (see composeReminderSms).
 * Deliberately NOT written to `sa_audit_log`: the audit log records human
 * privileged access to PHI, and diluting it with one row per reminder
 * would bury the break-glass entries it exists to surface. The
 * `appointment_reminders` row is itself the durable record of what was
 * sent, to which appointment, when — the same call sa_notifications makes.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization") ?? "";
  const supplied = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7).trim() : "";

  if (!env.CRON_SECRET) {
    logger.error("cron.dispatch-reminders.missing_secret");
    return NextResponse.json(
      { error: "CRON_SECRET not configured on the server." },
      { status: 503 },
    );
  }
  if (!supplied || supplied !== env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Both of these are launch-blocking misconfigurations, and both return
  // 503 rather than a green 200-with-zero-sent: a cron that reports
  // success while every patient goes unreminded is the failure that hides
  // itself until the clinic is empty.
  const sender = createAfricasTalkingSender();
  if (!sender) {
    logger.error("cron.dispatch-reminders.sms_not_configured");
    return NextResponse.json(
      { error: "AFRICASTALKING_USERNAME / _API_KEY not configured — no reminder can be sent." },
      { status: 503 },
    );
  }
  if (!env.MEDSYNC_PHI_KEY) {
    logger.error("cron.dispatch-reminders.missing_phi_key");
    return NextResponse.json(
      { error: "MEDSYNC_PHI_KEY not configured — patient phones cannot be read." },
      { status: 503 },
    );
  }

  try {
    const now = new Date();

    // Hits `appointment_reminders_dispatcher_idx (state, scheduled_at)
    // WHERE state='queued'` head-on, and is bounded so a backlog cannot
    // page the whole queue into the function.
    const rows = await db
      .select({
        reminderId: appointmentReminders.id,
        appointmentId: appointmentReminders.appointmentId,
        channel: appointmentReminders.channel,
        state: appointmentReminders.state,
        scheduledAt: appointmentReminders.scheduledAt,
        appointmentStartsAt: appointments.startsAt,
        appointmentStatus: appointments.status,
        patientUserId: appointments.patientUserId,
        hospitalName: hospitals.name,
        phoneEncrypted: patientProfiles.phoneEncrypted,
      })
      .from(appointmentReminders)
      .innerJoin(appointments, eq(appointments.id, appointmentReminders.appointmentId))
      .innerJoin(hospitals, eq(hospitals.id, appointments.hospitalId))
      .leftJoin(patientProfiles, eq(patientProfiles.id, appointments.patientUserId))
      .where(
        and(eq(appointmentReminders.state, "queued"), lte(appointmentReminders.scheduledAt, now)),
      )
      .orderBy(asc(appointmentReminders.scheduledAt))
      .limit(MAX_ROWS_SCANNED_PER_RUN);

    const planRows: ReminderRow[] = rows.map((r) => ({
      reminderId: r.reminderId,
      appointmentId: r.appointmentId,
      channel: r.channel,
      state: r.state,
      scheduledAtIso: r.scheduledAt.toISOString(),
      appointmentStartsAtIso: r.appointmentStartsAt.toISOString(),
      appointmentStatus: r.appointmentStatus,
      patientUserId: r.patientUserId,
      hospitalName: r.hospitalName,
    }));

    const plan = planReminderDispatch({ rows: planRows, now });

    // Reap first — cheap, and it shrinks the queue even if the transport
    // is having a bad day. Grouped so a backlog is a handful of statements.
    const reapGroups = new Map<string, { state: string; reason: string; ids: string[] }>();
    for (const reap of plan.reaps) {
      const key = `${reap.state}:${reap.reason}`;
      const group = reapGroups.get(key) ?? { state: reap.state, reason: reap.reason, ids: [] };
      group.ids.push(reap.reminderId);
      reapGroups.set(key, group);
    }
    for (const group of reapGroups.values()) {
      await db
        .update(appointmentReminders)
        .set({ state: group.state, failureReason: group.reason, updatedAt: now })
        .where(
          and(
            inArray(appointmentReminders.id, group.ids),
            eq(appointmentReminders.state, "queued"),
          ),
        );
    }

    // Resolve contact BEFORE claiming: a read costs nothing, and a row
    // claimed for a patient we cannot reach would be a reminder burnt for
    // no message. Decryption happens only for rows we decided to send.
    const contactByReminder = new Map<string, string>();
    const unreachable: string[] = [];
    const ciphertextByReminder = new Map(rows.map((r) => [r.reminderId, r.phoneEncrypted]));
    for (const send of plan.sends) {
      const ciphertext = ciphertextByReminder.get(send.reminderId);
      if (!ciphertext) {
        unreachable.push(send.reminderId);
        continue;
      }
      try {
        contactByReminder.set(send.reminderId, decrypt(ciphertext));
      } catch {
        // Never log the payload — a decrypt failure is a key or a
        // corrupt-column problem, and the column is PHI either way.
        unreachable.push(send.reminderId);
      }
    }
    if (unreachable.length > 0) {
      await db
        .update(appointmentReminders)
        .set({ state: "failed", failureReason: "no_reachable_phone", updatedAt: now })
        .where(
          and(
            inArray(appointmentReminders.id, unreachable),
            eq(appointmentReminders.state, "queued"),
          ),
        );
    }

    const claimable = plan.sends.filter((s) => contactByReminder.has(s.reminderId));
    let claimedIds: string[] = [];
    if (claimable.length > 0) {
      // THE CLAIM. `AND state='queued'` is what makes an overlapping run
      // a no-op instead of a second bill.
      const claimed = await db
        .update(appointmentReminders)
        .set({ state: "sent", sentAt: now, failureReason: null, updatedAt: now })
        .where(
          and(
            inArray(
              appointmentReminders.id,
              claimable.map((s) => s.reminderId),
            ),
            eq(appointmentReminders.state, "queued"),
          ),
        )
        .returning({ id: appointmentReminders.id });
      claimedIds = claimed.map((c) => c.id);
    }

    const claimedSet = new Set(claimedIds);
    const jobs: SmsJob[] = claimable
      .filter((s) => claimedSet.has(s.reminderId))
      .map((s) => ({
        reminderId: s.reminderId,
        toE164: contactByReminder.get(s.reminderId) as string,
        body: s.body,
      }));

    const outcomes = await deliverSms({ sender, jobs });
    const failures = outcomes.filter((o) => !o.ok);
    for (const failure of failures) {
      // Back to a re-queueable, explained state. One statement each:
      // failures are rare, and the provider's words differ per row.
      await db
        .update(appointmentReminders)
        .set({
          state: "failed",
          sentAt: null,
          failureReason: (failure.reason ?? "send_failed").slice(0, 300),
          updatedAt: now,
        })
        .where(eq(appointmentReminders.id, failure.reminderId));
    }

    const summary = {
      scanned: rows.length,
      sent: outcomes.length - failures.length,
      failed: failures.length + unreachable.length,
      reaped: plan.reaps.length,
      held: plan.held,
      substituted: plan.sends.filter((s) => s.substitutedFrom).length,
      // A full scan means there is more queue behind this run.
      backlog: rows.length === MAX_ROWS_SCANNED_PER_RUN,
    };
    logger.info("cron.dispatch-reminders.ran", summary);
    return NextResponse.json({ ok: true, ...summary });
  } catch (e) {
    logger.error("cron.dispatch-reminders.failed", { reason: String(e) });
    return NextResponse.json({ error: "Dispatch failed" }, { status: 500 });
  }
}
