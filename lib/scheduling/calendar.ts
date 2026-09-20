import "server-only";

import type { CalendarEvent } from "@/components/scheduling/calendar/types";
import { and, asc, eq, gte, inArray, isNull, lt, lte, or, sql } from "drizzle-orm";

import { db } from "@/db";
import { clinicSessions } from "@/db/schema/clinic-sessions";
import { hospitalDepartments } from "@/db/schema/hospital-departments";
import { patientProfiles } from "@/db/schema/patient-profiles";
import { appointments, availabilityBlocks } from "@/db/schema/scheduling";
import { serviceLines } from "@/db/schema/service-lines";
import { users } from "@/db/schema/users";

/**
 * Calendar data fetcher — pulls appointments, availability blocks and
 * clinic days (the hospital admin's weekly session rules, materialised
 * into `clinic_sessions` for this clinician) for a (clinician, date range)
 * and normalises them into the CalendarEvent shape the calendar renders.
 *
 * Rendering only. Whether a time is BOOKABLE is the slot engine's
 * answer (`@/supabase/functions/_shared/slots`) and never this file's —
 * see the weekly-expansion note below for why the two do not share code.
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
  const [apptRows, blockRows, sessionRows] = await Promise.all([
    db
      .select({
        id: appointments.id,
        startsAt: appointments.startsAt,
        endsAt: appointments.endsAt,
        sessionId: appointments.sessionId,
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
                // recurrence_until null (open-ended) OR after window start.
                // The isNull arm is load-bearing: `NULL >= x` is NULL, not
                // true, so without it every open-ended weekly series was
                // excluded here while the engine (which reads null as
                // POSITIVE_INFINITY) went on offering those hours to
                // patients — a doctor bookable on a block they cannot see.
                isNull(availabilityBlocks.recurrenceUntil),
                gte(availabilityBlocks.recurrenceUntil, args.rangeStart),
              )!,
            ),
          )!,
        ),
      )
      .orderBy(asc(availabilityBlocks.startsAt))
      .limit(500),

    // Drafts are the admin's alone; a published, closed or cancelled day is
    // the doctor's to see — cancelled included, so a day that vanished says so.
    db
      .select({
        id: clinicSessions.id,
        startsAt: clinicSessions.startsAt,
        endsAt: clinicSessions.endsAt,
        venue: clinicSessions.venue,
        bookedCount: clinicSessions.bookedCount,
        // ceil in SQL on the numeric(3,2), exactly as the CHECK, the allocator
        // and the reports compute it — not a binary-float ceil in JS.
        capacity:
          sql<number>`ceil(${clinicSessions.capacityBooked} * ${clinicSessions.overbookingFactor})`.mapWith(
            Number,
          ),
        status: clinicSessions.status,
        delayMinutes: clinicSessions.delayMinutes,
        serviceLineName: serviceLines.name,
      })
      .from(clinicSessions)
      .innerJoin(serviceLines, eq(serviceLines.id, clinicSessions.serviceLineId))
      .where(
        and(
          eq(clinicSessions.clinicianUserId, args.clinicianUserId),
          eq(clinicSessions.hospitalId, args.hospitalId),
          inArray(clinicSessions.status, ["published", "closed", "cancelled"]),
          gte(clinicSessions.startsAt, args.rangeStart),
          lt(clinicSessions.startsAt, args.rangeEnd),
        ),
      )
      .orderBy(asc(clinicSessions.startsAt))
      .limit(200),
  ]);

  const events: CalendarEvent[] = [];

  for (const r of blockRows) {
    if (r.recurrence === "weekly" && r.recurrenceWeekday) {
      // Expand into one event per weekly occurrence in the window:
      // time-of-day from the template's starts_at/ends_at, the date
      // walking week by week to the matching weekday.
      //
      // The slot engine (`@/supabase/functions/_shared/slots`) grew its
      // `expandBlocks` out of this loop, and this deliberately does NOT
      // call it: nothing expansion-shaped is exported there. `buildSlots`
      // is the closest thing, and every rule it applies is wrong for a
      // calendar — it keeps `kind === 'bookable'` alone (this grid renders
      // all six kinds), drops everything at or before `now` (past weeks
      // would go blank), chops each window into slotMinutes rectangles,
      // subtracts booked appointments and department opening hours, and
      // returns bare instants carrying no id/kind/location to build an
      // event from. The genuinely shared rule is the weekday arithmetic
      // below; reaching it means exporting a bookable-only, identity-less
      // `expandBlocks` and still re-deriving all of the above here.
      //
      // So: two copies, kept in sync by hand, and the things that must
      // agree are the weekday convention and "time-of-day comes from the
      // template". Where they already differ the calendar shows MORE than
      // the engine will offer, never less — it renders the declared block
      // whole where `recurrence_until` cuts an occurrence short, and its
      // loop bound is the midnight cursor rather than the occurrence start.
      // ponytail: showing what the clinician declared is what this view is
      // for, and nothing here can make a time bookable. Ceiling: the day
      // this grid gains a book-from-calendar affordance. Upgrade path: test
      // occStart against recurrenceUntil and clamp occEnd to it, exactly as
      // `expandBlocks` does.
      const durationMs = r.endsAt.getTime() - r.startsAt.getTime();
      const templateLocalH = r.startsAt.getHours();
      const templateLocalM = r.startsAt.getMinutes();
      // recurrence_weekday is 1-7 with 1=Mon, 7=Sun (Uganda convention).
      // JS Date.getDay() is 0-6 with 0=Sun, so convert: jsDay = (rw % 7).
      const targetJsDay = r.recurrenceWeekday % 7;

      const seriesStart = r.startsAt > args.rangeStart ? r.startsAt : args.rangeStart;
      const seriesEnd =
        r.recurrenceUntil && r.recurrenceUntil < args.rangeEnd ? r.recurrenceUntil : args.rangeEnd;

      // Host-local on purpose, with `getHours()` above and `setHours(h, m)`
      // below: the three read ONE zone, so each occurrence lands on the
      // template's own instant whatever the host is. Moving only this
      // midnight to `startOfLocalDay` would shift every occurrence by a
      // day on a UTC host. Zone-correct rendering means re-basing the whole
      // loop on `expandBlocks` — the note above says why that is not done.
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
    const firstMidnight = toMidnight(r.startsAt);
    const nextDay = new Date(firstMidnight);
    nextDay.setDate(nextDay.getDate() + 1);
    const spans = r.endsAt >= nextDay;
    if (spans) {
      const dayCursor = new Date(firstMidnight);
      const blockEndDay = toMidnight(r.endsAt);
      let chunkIdx = 0;
      while (dayCursor <= blockEndDay) {
        // dayCursor starts at midnight of startsAt and steps a day at a
        // time, so it is the block's own start on the first pass only.
        const chunkStart = chunkIdx === 0 ? r.startsAt : new Date(dayCursor);
        const nextMidnight = new Date(dayCursor);
        nextMidnight.setDate(nextMidnight.getDate() + 1);
        const chunkEnd = r.endsAt < nextMidnight ? r.endsAt : nextMidnight;
        // Only emit chunks intersecting the window. A block ending exactly
        // at midnight lands one zero-length chunk on the following day —
        // a phantom 0-height event on a day the clinician isn't there.
        if (chunkEnd > chunkStart && chunkEnd > args.rangeStart && chunkStart < args.rangeEnd) {
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

  for (const r of sessionRows) {
    events.push({
      id: `s-${r.id}`,
      kind: "session",
      startsAtIso: r.startsAt.toISOString(),
      endsAtIso: r.endsAt.toISOString(),
      serviceLineName: r.serviceLineName,
      venue: r.venue,
      bookedCount: r.bookedCount,
      // The same ceiling the allocator and the reports use.
      capacity: r.capacity,
      status: r.status,
      delayMinutes: r.delayMinutes,
    });
  }

  for (const r of apptRows) {
    events.push({
      id: `a-${r.id}`,
      kind: "appointment",
      startsAtIso: r.startsAt.toISOString(),
      endsAtIso: r.endsAt.toISOString(),
      sessionId: r.sessionId,
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

/** Host-local, like the weekly cursor above and for the same reason: the
 * multi-day split must agree with the `setHours(h, m)` arithmetic beside it. */
function toMidnight(d: Date): Date {
  const next = new Date(d);
  next.setHours(0, 0, 0, 0);
  return next;
}
