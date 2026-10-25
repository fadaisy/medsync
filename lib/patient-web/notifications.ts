import "server-only";

import { and, desc, eq, lte, ne } from "drizzle-orm";

import { db } from "@/db";
import { hospitals } from "@/db/schema/hospitals";
import { notificationDispatches } from "@/db/schema/notifications";
import { groupDispatches } from "./notification-items";

export type { NotifItem } from "./notification-items";

/**
 * The patient's notifications on the web (F-06, as the phone's data/notifications.ts): the newest hundred
 * `notification_dispatches` rows sent to this account, already due, not cancelled. Server-side through Drizzle,
 * filtered to the signed-in patient, as lib/patient/* read. A row stores no text (PHI rule): the words come from
 * its kind (@patient-core/notifications).
 */
async function loadRows(userId: string, now: Date) {
  return db
    .select({
      id: notificationDispatches.id,
      kind: notificationDispatches.kind,
      relatedKind: notificationDispatches.relatedKind,
      relatedId: notificationDispatches.relatedId,
      payload: notificationDispatches.payload,
      scheduledAt: notificationDispatches.scheduledAt,
      acknowledgedAt: notificationDispatches.acknowledgedAt,
      hospital: hospitals.name,
    })
    .from(notificationDispatches)
    .leftJoin(hospitals, eq(hospitals.id, notificationDispatches.hospitalId))
    .where(
      and(
        eq(notificationDispatches.recipientUserId, userId),
        ne(notificationDispatches.state, "cancelled"),
        lte(notificationDispatches.scheduledAt, now),
      ),
    )
    .orderBy(desc(notificationDispatches.scheduledAt))
    .limit(100);
}

export async function listNotifications(userId: string, now = new Date()) {
  return groupDispatches(await loadRows(userId, now), now);
}

/** The bell's count: events none of whose rows is acknowledged. */
export async function countUnseenNotifications(userId: string): Promise<number> {
  // ponytail: the phone's bell also counts doses due now; the web bell counts messages only until Home's dose
  // loader is shared with the header.
  return (await listNotifications(userId)).filter((n) => n.unread).length;
}
