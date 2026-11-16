import "server-only";

import type { ActivityRow } from "./activity";
import { and, desc, eq, gte, inArray, or, sql } from "drizzle-orm";

import { db } from "@/db";
import { saAuditLog } from "@/db/schema/sa-audit-log";
import { users } from "@/db/schema/users";
import { ACTIVITY_ACTION_KEYS, ACTIVITY_DAYS, ACTIVITY_LIMIT, activityLine } from "./activity";

/**
 * This hospital's admin activity, newest first (ADR 0521). The same scoping as `loadItemHistory`: a row is this
 * hospital's when it targets the hospital or carries its id in the before or after data. Only allowlisted admin
 * actions are read, never a patient-facing one. `cut` when the list hit its limit.
 */
export async function loadActivity(
  hospitalId: string,
  now: number = Date.now(),
): Promise<{ rows: ActivityRow[]; cut: boolean; failed: boolean }> {
  try {
    const since = new Date(now - ACTIVITY_DAYS * 86_400_000);
    const raw = await db
      .select({
        id: saAuditLog.id,
        action: saAuditLog.action,
        reason: saAuditLog.reason,
        at: saAuditLog.timestamp,
        who: users.fullName,
      })
      .from(saAuditLog)
      .leftJoin(users, eq(users.id, saAuditLog.actorId))
      .where(
        and(
          inArray(saAuditLog.action, ACTIVITY_ACTION_KEYS),
          gte(saAuditLog.timestamp, since),
          or(
            eq(saAuditLog.targetId, hospitalId),
            sql`${saAuditLog.afterData}->>'hospital_id' = ${hospitalId}`,
            sql`${saAuditLog.beforeData}->>'hospital_id' = ${hospitalId}`,
          ),
        ),
      )
      .orderBy(desc(saAuditLog.timestamp))
      .limit(ACTIVITY_LIMIT);
    const rows: ActivityRow[] = [];
    for (const r of raw) {
      const line = activityLine(r.action);
      if (!line) continue;
      rows.push({
        id: r.id,
        area: line[0],
        what: line[1],
        who: r.who,
        at: r.at.toISOString(),
        reason: r.reason,
      });
    }
    return { rows, cut: raw.length >= ACTIVITY_LIMIT, failed: false };
  } catch {
    return { rows: [], cut: false, failed: true };
  }
}
