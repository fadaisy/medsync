import "server-only";

import type { createServiceClient } from "@/lib/supabase/service";
import type { NotificationSink } from "@/lib/triage/notify";
import { and, eq, inArray, isNull } from "drizzle-orm";

import { db } from "@/db";
import { staffAffiliations } from "@/db/schema/clinician-profiles";
import { wardInChargeAssignments } from "@/db/schema/nurse-workspace";
import { cadres } from "@/db/schema/reference-data";
import { logger } from "@/lib/logger";
import { stubbedNotificationSink } from "@/lib/triage/notify";

/**
 * Resus team mobilisation (GATE E) — the in-hospital chain of survival
 * (recognition → call for help → response, ERC 2025).
 *
 * Reuses the triage notification pattern: in-app rows are written NOW
 * (sa_notifications, own-row RLS) for every active clinical staff member
 * at the receiving department PLUS the active ward in-charge(s). SMS/push
 * ride the stubbed NotificationSink until a real gateway lands (proposal
 * §D.1 — no on-shift model exists yet, so "all active clinical dept staff
 * + ward-in-charge" is the honest v1 roster). A resus_mobilisation_alerts
 * row records each call so the converging team sees who's responding.
 *
 * Never throws — a failed alert must not roll back the resus episode (the
 * record is the source of truth; the alert is a courtesy).
 */

type ServiceClient = ReturnType<typeof createServiceClient>;

/**
 * The v1 roster: active clinical staff at the department + the hospital's active
 * ward in-charge(s). Throws on a query failure (callers catch — never block).
 */
async function mobilisationRecipients(
  hospitalId: string,
  departmentId: string | null,
): Promise<string[]> {
  const recipientIds = new Set<string>();
  const conds = [
    eq(staffAffiliations.hospitalId, hospitalId),
    inArray(staffAffiliations.state, ["active", "approved"]),
    eq(cadres.isClinical, true),
  ];
  if (departmentId) conds.push(eq(staffAffiliations.departmentId, departmentId));
  const deptStaff = await db
    .select({ userId: staffAffiliations.userId })
    .from(staffAffiliations)
    .innerJoin(cadres, eq(cadres.id, staffAffiliations.cadreId))
    .where(and(...conds));
  for (const r of deptStaff) recipientIds.add(r.userId);
  const inCharge = await db
    .select({ userId: wardInChargeAssignments.nurseUserId })
    .from(wardInChargeAssignments)
    .where(
      and(
        eq(wardInChargeAssignments.hospitalId, hospitalId),
        isNull(wardInChargeAssignments.endsAt),
      ),
    );
  for (const r of inCharge) recipientIds.add(r.userId);
  return [...recipientIds];
}

/**
 * Resus Desk v2 — the arrest call (GATE A §9): one call per cardiac arrest, to
 * the mobilisation roster. Subject names the place, never the patient. In-app
 * rows are real; SMS/push ride the stubbed sink. Never throws.
 */
export async function sendArrestCall(args: {
  service: ServiceClient;
  episodeId: string;
  hospitalId: string;
  departmentId: string | null;
  placeLabel: string;
  arrestSeq: number;
  sink?: NotificationSink;
}): Promise<{ notified: number }> {
  try {
    const recipients = await mobilisationRecipients(args.hospitalId, args.departmentId);
    if (recipients.length === 0) return { notified: 0 };
    const subject = `CARDIAC ARREST — ${args.placeLabel}`;
    const body = `Cardiac arrest${args.arrestSeq > 1 ? ` (arrest ${args.arrestSeq})` : ""} in ${args.placeLabel}. Converge now. Open the resus board.`;
    const { error } = await args.service.from("sa_notifications").insert(
      recipients.map((userId) => ({
        recipient_user_id: userId,
        kind: "clinical_resus_arrest_call" as const,
        subject,
        body,
        related_kind: "resus_episode",
        related_id: args.episodeId,
      })),
    );
    if (error) logger.warn("resus.arrest_call.insert_failed", { reason: error.message });
    const sink = args.sink ?? stubbedNotificationSink;
    await Promise.all(
      recipients.map((userId) =>
        sink
          .sendUrgent({ recipientUserId: userId, subject, body })
          .catch((e) => logger.warn("resus.arrest_call.sink_failed", { reason: String(e) })),
      ),
    );
    return { notified: recipients.length };
  } catch (e) {
    logger.warn("resus.arrest_call.failed", { reason: String(e) });
    return { notified: 0 };
  }
}

/**
 * Resus Desk v2 — the 12 h idle notice (CO-IDLE-02): to the opener, the
 * current leader and the ward in-charges; once per episode (the caller stamps
 * idle_notified_at). Never throws.
 */
export async function sendIdleNotice(args: {
  service: ServiceClient;
  episodeId: string;
  hospitalId: string;
  recipientIds: string[];
  idleLabel: string;
}): Promise<{ notified: number }> {
  try {
    const inCharge = await db
      .select({ userId: wardInChargeAssignments.nurseUserId })
      .from(wardInChargeAssignments)
      .where(
        and(
          eq(wardInChargeAssignments.hospitalId, args.hospitalId),
          isNull(wardInChargeAssignments.endsAt),
        ),
      );
    const recipients = [...new Set([...args.recipientIds, ...inCharge.map((r) => r.userId)])];
    if (recipients.length === 0) return { notified: 0 };
    const { error } = await args.service.from("sa_notifications").insert(
      recipients.map((userId) => ({
        recipient_user_id: userId,
        kind: "clinical_resus_idle" as const,
        subject: "Resus episode left open",
        body: `A resus episode has had no activity for ${args.idleLabel}. Close it or continue it from the resus board.`,
        related_kind: "resus_episode",
        related_id: args.episodeId,
      })),
    );
    if (error) logger.warn("resus.idle_notice.insert_failed", { reason: error.message });
    return { notified: recipients.length };
  } catch (e) {
    logger.warn("resus.idle_notice.failed", { reason: String(e) });
    return { notified: 0 };
  }
}

export async function mobiliseResusTeam(args: {
  service: ServiceClient;
  episodeId: string;
  hospitalId: string;
  departmentId: string | null;
  patientLabel: string;
  triggerReason: string | null;
  sink?: NotificationSink;
}): Promise<{ notified: number }> {
  const recipientIds = new Set<string>();

  try {
    const conds = [
      eq(staffAffiliations.hospitalId, args.hospitalId),
      inArray(staffAffiliations.state, ["active", "approved"]),
      eq(cadres.isClinical, true),
    ];
    if (args.departmentId) conds.push(eq(staffAffiliations.departmentId, args.departmentId));

    const deptStaff = await db
      .select({ userId: staffAffiliations.userId })
      .from(staffAffiliations)
      .innerJoin(cadres, eq(cadres.id, staffAffiliations.cadreId))
      .where(and(...conds));
    for (const r of deptStaff) recipientIds.add(r.userId);

    // Active ward in-charge(s) at the hospital — explicitly summoned.
    const inCharge = await db
      .select({ userId: wardInChargeAssignments.nurseUserId })
      .from(wardInChargeAssignments)
      .where(
        and(
          eq(wardInChargeAssignments.hospitalId, args.hospitalId),
          isNull(wardInChargeAssignments.endsAt),
        ),
      );
    for (const r of inCharge) recipientIds.add(r.userId);
  } catch (e) {
    logger.warn("resus.mobilise.recipients_failed", { reason: String(e) });
    return { notified: 0 };
  }

  const recipients = [...recipientIds];
  if (recipients.length === 0) return { notified: 0 };

  const subject = `RESUS — ${args.patientLabel}`;
  const body = `A resuscitation has been activated${
    args.triggerReason ? ` (${args.triggerReason})` : ""
  } in your department. Converge now. Open the resus board for the live view.`;

  // In-app notifications (real). Capture ids to link the alert rows.
  let notifIds: { id: string; recipient_user_id: string }[] = [];
  try {
    const { data, error } = await args.service
      .from("sa_notifications")
      .insert(
        recipients.map((userId) => ({
          recipient_user_id: userId,
          kind: "clinical_resus_mobilisation" as const,
          subject,
          body,
          related_kind: "resus_episode",
          related_id: args.episodeId,
        })),
      )
      .select("id, recipient_user_id");
    if (error) throw new Error(error.message);
    notifIds = data ?? [];
  } catch (e) {
    logger.warn("resus.mobilise.notification_insert_failed", { reason: String(e) });
  }

  const notifByRecipient = new Map(notifIds.map((n) => [n.recipient_user_id, n.id]));

  // Mobilisation-alert rows — the "who's responding" substrate.
  try {
    await args.service.from("resus_mobilisation_alerts").insert(
      recipients.map((userId) => ({
        episode_id: args.episodeId,
        recipient_user_id: userId,
        channel: "in_app" as const,
        sa_notification_id: notifByRecipient.get(userId) ?? null,
      })),
    );
  } catch (e) {
    logger.warn("resus.mobilise.alert_insert_failed", { reason: String(e) });
  }

  // Out-of-band (SMS/push) — stubbed today.
  const sink = args.sink ?? stubbedNotificationSink;
  await Promise.all(
    recipients.map((userId) =>
      sink
        .sendUrgent({ recipientUserId: userId, subject, body })
        .catch((e) => logger.warn("resus.mobilise.sink_failed", { reason: String(e) })),
    ),
  );

  return { notified: recipients.length };
}
