import "server-only";

import type { createServiceClient } from "@/lib/supabase/service";
import type { AcuityLevel } from "@/lib/triage/types";
import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/db";
import { staffAffiliations } from "@/db/schema/clinician-profiles";
import { cadres } from "@/db/schema/reference-data";
import { logger } from "@/lib/logger";

/**
 * Triage Red/Orange alerting (R2). A high-acuity outcome (Level 1 or 2)
 * notifies the receiving department's active clinical staff IN-APP now
 * (one sa_notifications row each — own-row RLS already scopes reads).
 *
 * SMS/push ride the NotificationSink interface below, which currently
 * NO-OPS with a logged TODO. When a real gateway lands, swap the
 * implementation here — the triage action does not change. This is the
 * honest version of "push + SMS to the receiving team" given no
 * dispatcher exists yet (proposal §G.1).
 */

/** Acuity levels that trigger an alert. */
const ALERT_LEVELS: ReadonlyArray<AcuityLevel> = [1, 2];

export interface NotificationSink {
  /** Best-effort out-of-band alert (SMS/push). Must never throw. */
  sendUrgent(args: { recipientUserId: string; subject: string; body: string }): Promise<void>;
}

/**
 * The current sink: no real SMS/push transport exists, so we log the
 * intent (so it's observable + auditable in logs) and return. Swapping
 * in Africa's Talking / FCM later is a one-file change.
 */
export const stubbedNotificationSink: NotificationSink = {
  async sendUrgent({ recipientUserId, subject }) {
    logger.info("triage.notify.sms_push.stubbed", {
      recipient: recipientUserId,
      subject,
      todo: "wire real SMS/push dispatcher (proposal §G.1)",
    });
  },
};

type ServiceClient = ReturnType<typeof createServiceClient>;

/**
 * Fan out a triage alert. In-app rows are written for every active
 * clinical staff member at the receiving department; the out-of-band
 * sink is invoked best-effort per recipient. Never throws — a failed
 * alert must not roll back a saved triage (the record is the source of
 * truth; the alert is a courtesy).
 */
export async function notifyTriageOutcome(args: {
  service: ServiceClient;
  hospitalId: string;
  departmentId: string;
  assignedLevel: AcuityLevel;
  patientLabel: string;
  triageRecordId: string;
  sink?: NotificationSink;
}): Promise<{ notified: number }> {
  if (!ALERT_LEVELS.includes(args.assignedLevel)) return { notified: 0 };

  let recipients: { userId: string }[] = [];
  try {
    recipients = await db
      .select({ userId: staffAffiliations.userId })
      .from(staffAffiliations)
      .innerJoin(cadres, eq(cadres.id, staffAffiliations.cadreId))
      .where(
        and(
          eq(staffAffiliations.hospitalId, args.hospitalId),
          eq(staffAffiliations.departmentId, args.departmentId),
          inArray(staffAffiliations.state, ["active", "approved"]),
          eq(cadres.isClinical, true),
        ),
      );
  } catch (e) {
    logger.warn("triage.notify.recipients_failed", { reason: String(e) });
    return { notified: 0 };
  }

  if (recipients.length === 0) return { notified: 0 };

  const levelWord = args.assignedLevel === 1 ? "RED (Level 1)" : "ORANGE (Level 2)";
  const subject = `Triage ${levelWord}: ${args.patientLabel}`;
  const body = `A patient triaged ${levelWord} is in your department. Open the triage worklist for details.`;

  const rows = recipients.map((r) => ({
    recipient_user_id: r.userId,
    kind: "clinical_triage_alert" as const,
    subject,
    body,
    related_kind: "triage_record",
    related_id: args.triageRecordId,
  }));

  const { error } = await args.service.from("sa_notifications").insert(rows);
  if (error) {
    logger.warn("triage.notify.insert_failed", { reason: error.message });
    return { notified: 0 };
  }

  // Best-effort out-of-band (stubbed today).
  const sink = args.sink ?? stubbedNotificationSink;
  await Promise.all(
    recipients.map((r) =>
      sink
        .sendUrgent({ recipientUserId: r.userId, subject, body })
        .catch((e) => logger.warn("triage.notify.sink_failed", { reason: String(e) })),
    ),
  );

  return { notified: recipients.length };
}
