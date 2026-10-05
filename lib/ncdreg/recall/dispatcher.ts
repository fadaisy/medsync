/**
 * The reminder dispatcher (E3, E6, D1, §10.6 interlock 3). For one facility, as the `system`
 * principal, it takes the pending reminders due on or before today and re-checks everything AT SEND
 * TIME, never trusting what was true when the reminder was scheduled:
 *
 * - inside the facility's send window (default 08:00 to 18:00, facility time); outside it nothing
 *   is decided and every reminder stays pending;
 * - the person has no death, transfer-out or withdrawal event, is not merged away, not removed from
 *   recall;
 * - the appointment is still pending; a `before` reminder only before its date; a `missed` one only
 *   if no visit happened on or after the appointment date, and only the latest due one per appointment;
 * - SMS is allowed and not opted out (E6), a valid phone number exists;
 * - an APPROVED template exists for the purpose (E5), and the filled text has no banned term (E4).
 *
 * A failed check cancels (the reason no longer holds) or blocks (nothing to send with) the reminder
 * with its reason. Whatever passes goes through `sendGuarded`, which refuses synthetic persons.
 */
import "server-only";

import type { NcdContext } from "../context";
import type { Transport } from "./transport";
import { and, count, eq, inArray, lte } from "drizzle-orm";

import { ncdAppointment, ncdEvent, ncdPerson, ncdReminder, ncdSmsLog, ncdVisit } from "@/db/schema";
import { facilitySettings } from "../commands/shared";
import { dec } from "../crypto";
import { withNcd } from "../db";
import { normalisePhone } from "../identity";
import { bannedTermsIn } from "./banned";
import { approvedTemplate } from "./templates";
import { sendGuarded, transportFor } from "./transport";

const ENDING_EVENTS = ["death", "transfer_out", "withdrawal"];
const MAX_SEND_ATTEMPTS = 3;

export type DispatchSummary = {
  facilityId: string;
  outsideWindow: boolean;
  considered: number;
  sent: number;
  cancelled: number;
  blocked: number;
  failed: number;
};

/** "HH:MM" of `at` in `timeZone`. */
export function localClock(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(at);
}

/** Inside [start, end) of the send window; times as "HH:MM" or "HH:MM:SS". */
export function insideWindow(clock: string, start: string, end: string): boolean {
  const hm = (s: string) => s.slice(0, 5);
  return clock >= hm(start) && clock < hm(end);
}

const fmtDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

/**
 * Run once for `ctx.facilityId`. `ctx` must be the `system` principal; `ctx.enteredAt` is "now".
 * `transport` is for tests; otherwise the facility's settings choose it (the logging mock unless live
 * sending is switched on).
 */
export async function dispatchReminders(
  ctx: NcdContext,
  o: { transport?: Transport } = {},
): Promise<DispatchSummary> {
  const summary: DispatchSummary = {
    facilityId: ctx.facilityId,
    outsideWindow: false,
    considered: 0,
    sent: 0,
    cancelled: 0,
    blocked: 0,
    failed: 0,
  };
  if (ctx.principal !== "system")
    throw new Error("The reminder dispatcher runs as the system principal.");
  return withNcd(
    ctx,
    "app",
    async (tx) => {
      const settings = await facilitySettings(tx, ctx);
      if (
        !insideWindow(
          localClock(ctx.enteredAt, settings.timeZone),
          settings.sendWindowStart,
          settings.sendWindowEnd,
        )
      ) {
        summary.outsideWindow = true;
        return summary;
      }
      const due = await tx
        .select()
        .from(ncdReminder)
        .where(
          and(
            eq(ncdReminder.facilityId, ctx.facilityId),
            eq(ncdReminder.status, "pending"),
            lte(ncdReminder.dueOn, ctx.today),
          ),
        )
        // Two overlapping runs never take the same reminder: the second skips what the first holds.
        // ponytail: the send happens inside this transaction; a crash after the transport accepted and
        // before commit resends once on the next run. A two-phase send log removes that if it matters.
        .for("update", { skipLocked: true });
      summary.considered = due.length;
      if (!due.length) return summary;

      const personIds = [...new Set(due.map((r) => r.personId))];
      const apptIds = [...new Set(due.map((r) => r.appointmentId))];
      const [persons, appts, events, visits, failures] = await Promise.all([
        tx.select().from(ncdPerson).where(inArray(ncdPerson.id, personIds)),
        tx.select().from(ncdAppointment).where(inArray(ncdAppointment.id, apptIds)),
        tx
          .select({ personId: ncdEvent.personId, type: ncdEvent.eventType })
          .from(ncdEvent)
          .where(
            and(
              inArray(ncdEvent.personId, personIds),
              inArray(ncdEvent.eventType, ENDING_EVENTS),
              eq(ncdEvent.isInvalid, false),
            ),
          ),
        tx
          .select({ personId: ncdVisit.personId, date: ncdVisit.visitDate })
          .from(ncdVisit)
          .where(and(inArray(ncdVisit.personId, personIds), eq(ncdVisit.isInvalid, false))),
        tx
          .select({ reminderId: ncdSmsLog.reminderId, n: count() })
          .from(ncdSmsLog)
          .where(
            and(
              inArray(
                ncdSmsLog.reminderId,
                due.map((r) => r.id),
              ),
              eq(ncdSmsLog.result, "failed"),
            ),
          )
          .groupBy(ncdSmsLog.reminderId),
      ]);
      const failedBefore = new Map(failures.map((f) => [f.reminderId, f.n]));
      const person = new Map(persons.map((p) => [p.id, p]));
      const appt = new Map(appts.map((a) => [a.id, a]));
      const transport = o.transport ?? transportFor(settings);
      const templates = {
        before: await approvedTemplate(tx, ctx.facilityId, "appointment_reminder"),
        missed: await approvedTemplate(tx, ctx.facilityId, "missed_visit"),
      };
      // Only the latest due missed-visit reminder per appointment is sent; earlier ones are superseded.
      const latestMissed = new Map<string, number>();
      for (const r of due)
        if (r.kind === "missed")
          latestMissed.set(
            r.appointmentId,
            Math.max(latestMissed.get(r.appointmentId) ?? 0, r.seq),
          );

      const decide = async (
        id: string,
        status: "cancelled" | "blocked" | "sent" | "pending",
        reason: string | null,
      ) => {
        await tx
          .update(ncdReminder)
          .set({
            status,
            statusReason: reason,
            decidedAt: status === "pending" ? null : ctx.enteredAt,
          })
          .where(eq(ncdReminder.id, id));
        if (status === "cancelled") summary.cancelled++;
        if (status === "blocked") summary.blocked++;
        if (status === "sent") summary.sent++;
      };

      for (const r of due) {
        const p = person.get(r.personId);
        const a = appt.get(r.appointmentId);
        const ended = events.find((e) => e.personId === r.personId);
        if (!p || !a) {
          await decide(r.id, "cancelled", "Record not found");
          continue;
        }
        if (ended) {
          await decide(r.id, "cancelled", `Status at send time: ${ended.type}`);
          continue;
        }
        if (p.mergedIntoId) {
          await decide(r.id, "cancelled", "Record merged");
          continue;
        }
        if (p.recallRemovedAt) {
          await decide(r.id, "cancelled", "Removed from recall");
          continue;
        }
        if (a.status !== "pending") {
          await decide(r.id, "cancelled", `Appointment ${a.status}`);
          continue;
        }
        if (r.kind === "before" && a.appointmentDate < ctx.today) {
          await decide(r.id, "cancelled", "Appointment date passed");
          continue;
        }
        if (r.kind === "missed") {
          if (visits.some((v) => v.personId === r.personId && v.date >= a.appointmentDate)) {
            await decide(r.id, "cancelled", "Visit recorded on or after the appointment");
            continue;
          }
          if (r.seq < (latestMissed.get(r.appointmentId) ?? r.seq)) {
            await decide(r.id, "cancelled", "Superseded by a later reminder");
            continue;
          }
        }
        if (!p.smsAllowed || p.smsOptedOutAt) {
          await decide(r.id, "blocked", p.smsOptedOutAt ? "Opted out of SMS" : "SMS not allowed");
          continue;
        }
        const slot =
          !p.phone1Invalid && p.phone1Ciphertext
            ? 1
            : !p.phone2Invalid && p.phone2Ciphertext
              ? 2
              : null;
        const to = slot
          ? normalisePhone(dec(slot === 1 ? p.phone1Ciphertext : p.phone2Ciphertext))
          : null;
        if (!to) {
          await decide(r.id, "blocked", "No valid phone number");
          continue;
        }
        const t = r.kind === "before" ? templates.before : templates.missed;
        if (!t) {
          await decide(r.id, "blocked", "No approved template");
          continue;
        }
        const fills: Record<string, string | null> = {
          "[HOSPITAL NAME]": settings.hospitalDisplayName,
          "[DATE]": fmtDate(a.appointmentDate),
          "[CLINIC PHONE]": settings.clinicPhone,
        };
        const missing = Object.entries(fills)
          .filter(([k, v]) => t.body.includes(k) && !v)
          .map(([k]) => k);
        if (missing.length) {
          await decide(r.id, "blocked", `Facility setting missing for ${missing.join(", ")}`);
          continue;
        }
        const body = Object.entries(fills).reduce((s, [k, v]) => s.split(k).join(v ?? ""), t.body);
        if (bannedTermsIn(body).length) {
          await decide(r.id, "blocked", "Filled message contains a banned term");
          continue;
        }
        const d = await sendGuarded(tx, transport, {
          facilityId: ctx.facilityId,
          personId: p.id,
          reminderId: r.id,
          toE164: to,
          toHmac: slot === 1 ? p.phone1Hmac : p.phone2Hmac,
          body,
        });
        if (d.result === "failed") {
          summary.failed++;
          // A reminder is tried at most MAX_SEND_ATTEMPTS times, then blocked with its reason.
          const tries = (failedBefore.get(r.id) ?? 0) + 1;
          await decide(
            r.id,
            tries >= MAX_SEND_ATTEMPTS ? "blocked" : "pending",
            `Send failed (${tries} of ${MAX_SEND_ATTEMPTS}): ${d.reason ?? "unknown"}`,
          );
        } else await decide(r.id, d.result === "blocked" ? "blocked" : "sent", d.reason);
      }
      return summary;
    },
    ctx.db,
  );
}
