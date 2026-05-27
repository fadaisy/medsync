import "server-only";

import type { CalendarEvent } from "@/components/scheduling/calendar/types";
import { and, asc, eq, gte, lt, or } from "drizzle-orm";

import { db } from "@/db";
import { hospitalDepartments } from "@/db/schema/hospital-departments";
import { patientProfiles } from "@/db/schema/patient-profiles";
import { appointments, availabilityBlocks } from "@/db/schema/scheduling";
import { users } from "@/db/schema/users";

/**
 * Calendar data fetcher — pulls appointments + availability blocks
 * for a (clinician, date range) and normalises them into the
 * CalendarEvent shape the calendar component renders.
 *
 * Patient names: we surface `patient_code` only by default (no PHI
 * decrypt on the calendar — the slide-out detail panel handles
 * audited decrypt when the doctor opens a specific appointment).
 * Calendar reads stay outside the audited PHI path.
 */
export async function fetchClinicianCalendarEvents(args: {
  clinicianUserId: string;
  hospitalId: string;
  rangeStart: Date;
  rangeEnd: Date;
}): Promise<CalendarEvent[]> {
  const [apptRows, blockRows] = await Promise.all([
    db
      .select({
        id: appointments.id,
        startsAt: appointments.startsAt,
        endsAt: appointments.endsAt,
        status: appointments.status,
        priority: appointments.priority,
        type: appointments.type,
        reason: appointments.reason,
        reasonNote: appointments.reasonNote,
        patientCode: patientProfiles.patientCode,
        clinicianName: users.fullName,
        departmentName: hospitalDepartments.name,
      })
      .from(appointments)
      .innerJoin(patientProfiles, eq(patientProfiles.id, appointments.patientUserId))
      .leftJoin(users, eq(users.id, appointments.clinicianUserId))
      .leftJoin(hospitalDepartments, eq(hospitalDepartments.id, appointments.departmentId))
      .where(
        and(
          eq(appointments.clinicianUserId, args.clinicianUserId),
          eq(appointments.hospitalId, args.hospitalId),
          gte(appointments.startsAt, args.rangeStart),
          lt(appointments.startsAt, args.rangeEnd),
        ),
      )
      .orderBy(asc(appointments.startsAt))
      .limit(500),

    db
      .select({
        id: availabilityBlocks.id,
        startsAt: availabilityBlocks.startsAt,
        endsAt: availabilityBlocks.endsAt,
        kind: availabilityBlocks.kind,
        recurrence: availabilityBlocks.recurrence,
        location: availabilityBlocks.location,
      })
      .from(availabilityBlocks)
      .where(
        and(
          eq(availabilityBlocks.clinicianUserId, args.clinicianUserId),
          eq(availabilityBlocks.hospitalId, args.hospitalId),
          eq(availabilityBlocks.state, "active"),
          or(
            and(
              gte(availabilityBlocks.startsAt, args.rangeStart),
              lt(availabilityBlocks.startsAt, args.rangeEnd),
            ),
            and(
              gte(availabilityBlocks.endsAt, args.rangeStart),
              lt(availabilityBlocks.endsAt, args.rangeEnd),
            ),
          )!,
        ),
      )
      .orderBy(asc(availabilityBlocks.startsAt))
      .limit(500),
  ]);

  const events: CalendarEvent[] = [];

  for (const r of blockRows) {
    events.push({
      id: `b-${r.id}`,
      kind: "availability",
      startsAtIso: r.startsAt.toISOString(),
      endsAtIso: r.endsAt.toISOString(),
      availabilityKind: r.kind,
      recurrence: r.recurrence,
      location: r.location,
    });
  }

  for (const r of apptRows) {
    events.push({
      id: `a-${r.id}`,
      kind: "appointment",
      startsAtIso: r.startsAt.toISOString(),
      endsAtIso: r.endsAt.toISOString(),
      status: r.status,
      priority: (r.priority === "urgent" ? "urgent" : "routine") as "routine" | "urgent",
      type: (r.type === "virtual" ? "virtual" : "in_person") as "in_person" | "virtual",
      reason: r.reason,
      reasonNote: r.reasonNote,
      // Patient name surface: PHI is encrypted; show patient_code on
      // the calendar grid. The slide-out detail panel (audited) shows
      // the decrypted name.
      patientName: r.patientCode ?? "Patient",
      patientCode: r.patientCode,
      clinicianName: r.clinicianName,
      departmentName: r.departmentName,
    });
  }

  return events;
}
