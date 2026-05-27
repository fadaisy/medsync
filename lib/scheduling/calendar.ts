import "server-only";

import type { CalendarEvent } from "@/components/scheduling/calendar/types";
import { and, asc, eq, gte, lt, lte, or } from "drizzle-orm";

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
        recurrenceWeekday: availabilityBlocks.recurrenceWeekday,
        recurrenceUntil: availabilityBlocks.recurrenceUntil,
        location: availabilityBlocks.location,
      })
      .from(availabilityBlocks)
      .where(
        and(
          eq(availabilityBlocks.clinicianUserId, args.clinicianUserId),
          eq(availabilityBlocks.hospitalId, args.hospitalId),
          eq(availabilityBlocks.state, "active"),
          or(
            // One-off / multi-day blocks: pulled when EITHER end is in
            // the window, OR the block straddles it (starts before,
            // ends after).
            and(
              eq(availabilityBlocks.recurrence, "none"),
              or(
                and(
                  gte(availabilityBlocks.startsAt, args.rangeStart),
                  lt(availabilityBlocks.startsAt, args.rangeEnd),
                ),
                and(
                  gte(availabilityBlocks.endsAt, args.rangeStart),
                  lt(availabilityBlocks.endsAt, args.rangeEnd),
                ),
                and(
                  lte(availabilityBlocks.startsAt, args.rangeStart),
                  gte(availabilityBlocks.endsAt, args.rangeEnd),
                ),
              )!,
            ),
            // Weekly recurrences: pulled if the template's first
            // occurrence is before the window's end AND the recurrence
            // hasn't ended before the window starts. The expander
            // below produces synthetic per-week occurrences.
            and(
              eq(availabilityBlocks.recurrence, "weekly"),
              lt(availabilityBlocks.startsAt, args.rangeEnd),
              or(
                // recurrence_until null (open-ended) OR after window start
                gte(availabilityBlocks.recurrenceUntil, args.rangeStart),
              )!,
            ),
          )!,
        ),
      )
      .orderBy(asc(availabilityBlocks.startsAt))
      .limit(500),
  ]);

  const events: CalendarEvent[] = [];

  for (const r of blockRows) {
    if (r.recurrence === "weekly" && r.recurrenceWeekday) {
      // Expand into one event per weekly occurrence inside the
      // visible window. Time-of-day comes from the template's
      // starts_at / ends_at; the date walks Monday → Sunday hitting
      // the matching weekday.
      const durationMs = r.endsAt.getTime() - r.startsAt.getTime();
      const templateLocalH = r.startsAt.getHours();
      const templateLocalM = r.startsAt.getMinutes();
      // recurrence_weekday is 1-7 with 1=Mon, 7=Sun (Uganda convention).
      // JS Date.getDay() is 0-6 with 0=Sun, so convert: jsDay = (rw % 7).
      const targetJsDay = r.recurrenceWeekday % 7;

      const seriesStart = r.startsAt > args.rangeStart ? r.startsAt : args.rangeStart;
      const seriesEnd =
        r.recurrenceUntil && r.recurrenceUntil < args.rangeEnd ? r.recurrenceUntil : args.rangeEnd;

      const cursor = new Date(seriesStart);
      cursor.setHours(0, 0, 0, 0);
      // Advance cursor to the first occurrence of targetJsDay on/after cursor.
      const daysAhead = (targetJsDay - cursor.getDay() + 7) % 7;
      cursor.setDate(cursor.getDate() + daysAhead);

      let occurrenceIdx = 0;
      while (cursor < seriesEnd) {
        const occStart = new Date(cursor);
        occStart.setHours(templateLocalH, templateLocalM, 0, 0);
        const occEnd = new Date(occStart.getTime() + durationMs);
        // Only push if the occurrence at least intersects the window.
        if (occEnd > args.rangeStart && occStart < args.rangeEnd) {
          events.push({
            id: `b-${r.id}-w${occurrenceIdx}`,
            kind: "availability",
            startsAtIso: occStart.toISOString(),
            endsAtIso: occEnd.toISOString(),
            availabilityKind: r.kind,
            recurrence: r.recurrence,
            location: r.location,
          });
        }
        cursor.setDate(cursor.getDate() + 7);
        occurrenceIdx++;
        // Safety: cap at 100 occurrences/window to prevent runaway.
        if (occurrenceIdx > 100) break;
      }
      continue;
    }

    // One-off block. If it spans multiple days, split into one event
    // per day so the time-grid renders each day's column correctly
    // (the time-grid buckets by start-day).
    const spans = endOfDay(r.startsAt).getTime() < r.endsAt.getTime();
    if (spans) {
      const dayCursor = new Date(r.startsAt);
      dayCursor.setHours(0, 0, 0, 0);
      const blockEndDay = new Date(r.endsAt);
      blockEndDay.setHours(0, 0, 0, 0);
      let chunkIdx = 0;
      while (dayCursor <= blockEndDay) {
        const chunkStart =
          dayCursor.getTime() === toMidnight(r.startsAt).getTime()
            ? r.startsAt
            : new Date(dayCursor);
        const nextMidnight = new Date(dayCursor);
        nextMidnight.setDate(nextMidnight.getDate() + 1);
        const chunkEnd = r.endsAt < nextMidnight ? r.endsAt : nextMidnight;
        // Only emit chunks intersecting the window.
        if (chunkEnd > args.rangeStart && chunkStart < args.rangeEnd) {
          events.push({
            id: `b-${r.id}-d${chunkIdx}`,
            kind: "availability",
            startsAtIso: chunkStart.toISOString(),
            endsAtIso: chunkEnd.toISOString(),
            availabilityKind: r.kind,
            recurrence: r.recurrence,
            location: r.location,
          });
        }
        dayCursor.setDate(dayCursor.getDate() + 1);
        chunkIdx++;
      }
      continue;
    }

    // Single-day, single-occurrence block — the simple case.
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

function toMidnight(d: Date): Date {
  const next = new Date(d);
  next.setHours(0, 0, 0, 0);
  return next;
}

function endOfDay(d: Date): Date {
  const next = toMidnight(d);
  next.setHours(23, 59, 59, 999);
  return next;
}
