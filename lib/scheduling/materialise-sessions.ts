import "server-only";

import { and, eq, sql } from "drizzle-orm";

import { db } from "@/db";
import { clinicSessions, sessionTemplates } from "@/db/schema/clinic-sessions";
import { serviceLines } from "@/db/schema/service-lines";
import { DEFAULT_TIME_ZONE, expandSessionTemplate } from "@/supabase/functions/_shared/slots";

/** Same horizon as pt-request-appointment's PATIENT_BOOKING_HORIZON_DAYS. */
const MATERIALISE_HORIZON_DAYS = 14;

/**
 * Nightly materialiser (ADR 0087): every ACTIVE session template, expanded
 * over [now, now + 14 d) with the same pure `expandSessionTemplate` the
 * `ha-upsert-session-template` Edge Function runs on save — so the two
 * writers produce identical `clinic_sessions` rows, and the horizon rolls
 * forward one day at a time as the cron fires.
 *
 * Idempotent on `clinic_sessions_template_start_unique` (a partial UNIQUE,
 * hence the `where` on the conflict target — inference needs the predicate).
 * A published instance is never rewritten: an edited rule reaches only the
 * days it has not stamped yet.
 */
export async function materialiseClinicSessions(
  now = new Date(),
): Promise<{ templates: number; candidates: number; inserted: number }> {
  // An inactive line publishes nothing, whatever its rules say.
  const templates = await db
    .select({ t: sessionTemplates })
    .from(sessionTemplates)
    .innerJoin(serviceLines, eq(serviceLines.id, sessionTemplates.serviceLineId))
    .where(and(eq(sessionTemplates.active, true), eq(serviceLines.active, true)))
    .then((rows) => rows.map((r) => r.t));

  const rangeEnd = new Date(now.getTime() + MATERIALISE_HORIZON_DAYS * 86_400_000);
  const rows = templates.flatMap((t) =>
    expandSessionTemplate(
      {
        weekday: t.weekday,
        startMinutesLocal: t.startMinutesLocal,
        durationMinutes: t.durationMinutes,
        validFrom: t.validFrom,
        validUntil: t.validUntil,
      },
      now,
      rangeEnd,
      DEFAULT_TIME_ZONE,
    ).map(({ startsAt, endsAt }) => ({
      hospitalId: t.hospitalId,
      departmentId: t.departmentId,
      serviceLineId: t.serviceLineId,
      templateId: t.id,
      clinicianUserId: t.clinicianUserId,
      venue: t.venue,
      startsAt,
      endsAt,
      capacityTotal: t.capacityTotal,
      capacityBooked: t.capacityBooked,
      interleaveBooked: t.interleaveBooked,
      interleaveWalkIn: t.interleaveWalkIn,
      overbookingFactor: t.overbookingFactor,
      status: "published" as const,
    })),
  );

  const inserted = rows.length
    ? await db
        .insert(clinicSessions)
        .values(rows)
        .onConflictDoNothing({
          target: [clinicSessions.templateId, clinicSessions.startsAt],
          where: sql`${clinicSessions.templateId} IS NOT NULL`,
        })
        .returning({ id: clinicSessions.id })
    : [];

  return { templates: templates.length, candidates: rows.length, inserted: inserted.length };
}
