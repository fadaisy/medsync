import "server-only";

import type {
  DayOption,
  HospitalOption,
  KnownPatient,
  LineOptionUssd,
  NextVisit,
} from "@/lib/channels/ussd";
import { and, asc, eq, exists, gt, inArray, lt, or, sql } from "drizzle-orm";

import { db } from "@/db";
import { clinicSessions } from "@/db/schema/clinic-sessions";
import { hospitals } from "@/db/schema/hospitals";
import { patientProfiles } from "@/db/schema/patient-profiles";
import { provisionalPatients } from "@/db/schema/provisional-patients";
import { appointments } from "@/db/schema/scheduling";
import { serviceLines } from "@/db/schema/service-lines";
import { decrypt } from "@/lib/encryption";
import { formatShortDate, formatTime } from "@/lib/patient/booking-format";
import { fetchLines } from "@/lib/scheduling/booking-options";
import { LIVE_APPOINTMENT_STATUSES } from "@/supabase/functions/_shared/slots";

/**
 * What each USSD screen needs, read by the route and handed to the pure
 * machine (Gate F, ADR 0091). Service-role reads: a USSD caller has no
 * session, so RLS cannot scope them — every query here scopes itself to the
 * caller's phone (blind index) or to public capacity.
 */

const HORIZON_MS = 14 * 86_400_000;
/** Three pages of three: nobody scrolls a USSD list further. */
const MAX_DAYS = 9;

/**
 * Active hospitals with something bookable in the next 14 days.
 *
 * ponytail: "bookable" = a published clinic day with room, OR an active
 * slot-mode line (deriving every clinician's slots for every hospital is a
 * fan-out no 2-second budget survives). Ceiling: a hospital whose slot lines
 * have no open time still lists, and the day screen then says "no days".
 * Upgrade path: a materialised "next open slot per line" the nightly cron writes.
 */
export async function loadHospitals(now: Date): Promise<HospitalOption[]> {
  const until = new Date(now.getTime() + HORIZON_MS);
  return db
    .select({ id: hospitals.id, name: hospitals.name })
    .from(hospitals)
    .where(
      and(
        eq(hospitals.state, "active"),
        or(
          exists(
            db
              .select({ id: clinicSessions.id })
              .from(clinicSessions)
              .where(
                and(
                  eq(clinicSessions.hospitalId, hospitals.id),
                  eq(clinicSessions.status, "published"),
                  gt(clinicSessions.startsAt, now),
                  lt(clinicSessions.startsAt, until),
                  sql`${clinicSessions.bookedCount} < ceil(${clinicSessions.capacityBooked} * ${clinicSessions.overbookingFactor})`,
                ),
              ),
          ),
          exists(
            db
              .select({ id: serviceLines.id })
              .from(serviceLines)
              .where(
                and(
                  eq(serviceLines.hospitalId, hospitals.id),
                  eq(serviceLines.active, true),
                  eq(serviceLines.capacityMode, "slot"),
                ),
              ),
          ),
        ),
      ),
    )
    .orderBy(asc(hospitals.name));
}

/** Bookable lines at a hospital, session lines first (the contract's order); the queue door is not a booking. */
export async function loadLines(hospitalId: string): Promise<LineOptionUssd[]> {
  const rows = await db
    .select({
      id: serviceLines.id,
      name: serviceLines.name,
      capacityMode: serviceLines.capacityMode,
    })
    .from(serviceLines)
    .where(
      and(
        eq(serviceLines.hospitalId, hospitalId),
        eq(serviceLines.active, true),
        inArray(serviceLines.capacityMode, ["session", "slot"]),
        // D-SVC-08: a confidential clinic is never named on a shared channel; §5.5 audience.
        eq(serviceLines.confidential, false),
        eq(serviceLines.audience, "patients"),
        sql`${serviceLines.departmentId} IN (SELECT id FROM public.hospital_departments
              WHERE medsync_live_at IS NOT NULL AND archived_at IS NULL)`,
      ),
    )
    .orderBy(asc(serviceLines.name));
  const typed = rows.map((r) => ({
    ...r,
    capacityMode: r.capacityMode as LineOptionUssd["capacityMode"],
  }));
  return [
    ...typed.filter((r) => r.capacityMode === "session"),
    ...typed.filter((r) => r.capacityMode === "slot"),
  ];
}

/**
 * The next pickable days of one line — the wizard's own derivation
 * (`fetchLines`, so what USSD offers is exactly what the app offers): clinic
 * days with room, or for a slot line the next open slots as "day time".
 */
export async function loadDays(
  hospitalId: string,
  lineId: string,
  now: Date,
): Promise<DayOption[]> {
  const line = (await fetchLines(hospitalId, null, now)).find((l) => l.id === lineId);
  if (!line) return [];
  if (line.capacityMode === "session") {
    return line.sessions
      .filter((s) => s.placesLeft > 0)
      .slice(0, MAX_DAYS)
      .map((s) => ({ label: formatShortDate(s.startsAtIso), sessionId: s.id }));
  }
  const slots = line.clinicians.flatMap((c) =>
    Object.values(c.slotsByDate)
      .flat()
      .map((o) => ({
        startsMs: new Date(o.startsAtIso).getTime(),
        option: {
          label: `${formatShortDate(o.startsAtIso)} ${formatTime(o.startsAtIso)}`,
          slot: {
            clinician_user_id: c.userId,
            department_id: line.departmentId,
            starts_at: o.startsAtIso,
            ends_at: o.endsAtIso,
          },
        },
      })),
  );
  return slots
    .sort((a, b) => a.startsMs - b.startsMs)
    .slice(0, MAX_DAYS)
    .map((s) => s.option);
}

/** Names for the confirm line. */
export async function loadNames(
  hospitalId: string,
  lineId: string,
): Promise<{ hospitalName: string; lineName: string }> {
  const [h, l] = await Promise.all([
    db
      .select({ name: hospitals.name })
      .from(hospitals)
      .where(eq(hospitals.id, hospitalId))
      .limit(1),
    db
      .select({ name: serviceLines.name })
      .from(serviceLines)
      .where(eq(serviceLines.id, lineId))
      .limit(1),
  ]);
  return { hospitalName: h[0]?.name ?? "", lineName: l[0]?.name ?? "" };
}

/**
 * An account whose phone is this one (blind index, 0062) — OFFERED as
 * "Booking as {name}", never linked (PRD §2.8). Null when there is none or
 * the blind index has not been written for that row yet.
 */
export async function loadKnown(phoneHmac: string): Promise<KnownPatient | null> {
  const [row] = await db
    .select({ first: patientProfiles.firstNameEncrypted, dob: patientProfiles.dateOfBirth })
    .from(patientProfiles)
    .where(eq(patientProfiles.phoneHmac, phoneHmac))
    .limit(1);
  if (!row) return null;
  try {
    return { firstName: decrypt(row.first), dateOfBirth: row.dob };
  } catch {
    return null;
  }
}

/** This phone's next live visit — over its provisional rows and its account, whichever holds one. */
export async function loadNextVisit(phoneHmac: string, now: Date): Promise<NextVisit | null> {
  const [row] = await db
    .select({
      startsAt: appointments.startsAt,
      sessionId: appointments.sessionId,
      code: appointments.bookingCode,
      hospitalName: hospitals.name,
    })
    .from(appointments)
    .innerJoin(hospitals, eq(hospitals.id, appointments.hospitalId))
    .leftJoin(provisionalPatients, eq(provisionalPatients.id, appointments.provisionalPatientId))
    .leftJoin(patientProfiles, eq(patientProfiles.id, appointments.patientUserId))
    .where(
      and(
        or(eq(provisionalPatients.phoneHmac, phoneHmac), eq(patientProfiles.phoneHmac, phoneHmac)),
        inArray(appointments.status, [...LIVE_APPOINTMENT_STATUSES]),
        gt(appointments.startsAt, now),
      ),
    )
    .orderBy(asc(appointments.startsAt))
    .limit(1);
  if (!row) return null;
  return {
    dayLabel: formatShortDate(row.startsAt.toISOString()),
    timeLabel: row.sessionId ? "" : ` ${formatTime(row.startsAt.toISOString())}`,
    hospitalName: row.hospitalName,
    code: row.code ?? "",
  };
}
