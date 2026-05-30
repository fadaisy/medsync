import "server-only";

import { and, asc, count, desc, eq, gte, ilike, inArray, lt, or, sql } from "drizzle-orm";

import { db } from "@/db";
import { hospitalDepartments } from "@/db/schema/hospital-departments";
import { hospitals } from "@/db/schema/hospitals";
import { patientIntakes } from "@/db/schema/patient-intakes";
import { patientProfiles } from "@/db/schema/patient-profiles";
import { appointments } from "@/db/schema/scheduling";
import { users } from "@/db/schema/users";

// Reserved imports for future helpers (queue throughput, named-search).
void users;

/**
 * Reception query layer. All reads are STRICTLY operational +
 * demographic — no clinical-content joins. The clinical-content RLS
 * widening in migration 0033 enforces the same boundary at the DB,
 * so even if these helpers grew a buggy join the DB would deny it.
 *
 * Patient names: by design we surface `patient_code` only. The
 * decision to expose decrypted names from reception is reserved for
 * the audited operational-decrypt helper (separate ticket) — the
 * present design errs on the side of the boundary.
 */

/* ─── Today's front-desk counts ─────────────────────────────────── */

export interface ReceptionTodayCounts {
  expectedToday: number;
  arrivedToday: number;
  awaitingTriage: number;
  noShowsToday: number;
}

export async function fetchReceptionTodayCounts(args: {
  hospitalId: string;
}): Promise<ReceptionTodayCounts> {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  const [expected, arrived, awaiting, noShows] = await Promise.all([
    db
      .select({ n: count() })
      .from(appointments)
      .where(
        and(
          eq(appointments.hospitalId, args.hospitalId),
          gte(appointments.startsAt, start),
          lt(appointments.startsAt, end),
          inArray(appointments.status, ["confirmed", "pending_approval", "requested"]),
        ),
      ),
    db
      .select({ n: count() })
      .from(appointments)
      .where(
        and(
          eq(appointments.hospitalId, args.hospitalId),
          gte(appointments.startsAt, start),
          lt(appointments.startsAt, end),
          inArray(appointments.status, ["arrived", "in_progress", "completed"]),
        ),
      ),
    db
      .select({ n: count() })
      .from(patientIntakes)
      .where(
        and(
          eq(patientIntakes.hospitalId, args.hospitalId),
          inArray(patientIntakes.status, ["arrived", "awaiting_triage"]),
        ),
      ),
    db
      .select({ n: count() })
      .from(appointments)
      .where(
        and(
          eq(appointments.hospitalId, args.hospitalId),
          gte(appointments.startsAt, start),
          lt(appointments.startsAt, end),
          eq(appointments.status, "no_show"),
        ),
      ),
  ]);

  return {
    expectedToday: Number(expected[0]?.n ?? 0),
    arrivedToday: Number(arrived[0]?.n ?? 0),
    awaitingTriage: Number(awaiting[0]?.n ?? 0),
    noShowsToday: Number(noShows[0]?.n ?? 0),
  };
}

/* ─── Expected arrivals (today, or a chosen date) ───────────────── */

export interface ExpectedArrival {
  id: string;
  startsAtIso: string;
  status: string;
  type: string;
  patientUserId: string;
  patientCode: string;
  clinicianName: string | null;
  departmentName: string | null;
}

export async function fetchExpectedArrivals(args: {
  hospitalId: string;
  date?: Date;
  limit?: number;
}): Promise<ExpectedArrival[]> {
  const start = args.date ? new Date(args.date) : new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  const rows = await db
    .select({
      id: appointments.id,
      startsAt: appointments.startsAt,
      status: appointments.status,
      type: appointments.type,
      patientUserId: appointments.patientUserId,
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
        eq(appointments.hospitalId, args.hospitalId),
        gte(appointments.startsAt, start),
        lt(appointments.startsAt, end),
        inArray(appointments.status, [
          "confirmed",
          "pending_approval",
          "requested",
          "arrived",
          "in_progress",
          "completed",
          "no_show",
        ]),
      ),
    )
    .orderBy(asc(appointments.startsAt))
    .limit(args.limit ?? 100);

  return rows.map((r) => ({
    id: r.id,
    startsAtIso: r.startsAt.toISOString(),
    status: r.status,
    type: r.type,
    patientUserId: r.patientUserId,
    patientCode: r.patientCode,
    clinicianName: r.clinicianName,
    departmentName: r.departmentName,
  }));
}

/* ─── Patient search (operational identifiers only) ─────────────── */

export interface ReceptionPatientHit {
  patientUserId: string;
  patientCode: string;
  sex: string;
  dateOfBirth: string;
  primaryHospitalName: string | null;
}

/**
 * Search by patient_code (exact-prefix). Name + phone are encrypted
 * at rest; a name-search Edge Function is the separate audited path
 * deferred from this PR. For MVP reception searches by code only —
 * which is the lookup the front desk does 95% of the time anyway
 * (patient hands over their MedSync card / states their code).
 */
export async function searchPatientsByCode(args: {
  hospitalId: string;
  query: string;
  limit?: number;
}): Promise<ReceptionPatientHit[]> {
  const q = args.query.trim();
  if (q.length < 3) return [];

  const rows = await db
    .select({
      patientUserId: patientProfiles.id,
      patientCode: patientProfiles.patientCode,
      sex: patientProfiles.sex,
      dateOfBirth: patientProfiles.dateOfBirth,
      primaryHospitalId: patientProfiles.primaryFacilityId,
      primaryHospitalName: hospitals.name,
    })
    .from(patientProfiles)
    .leftJoin(hospitals, eq(hospitals.id, patientProfiles.primaryFacilityId))
    .where(ilike(patientProfiles.patientCode, `${q}%`))
    .orderBy(asc(patientProfiles.patientCode))
    .limit(args.limit ?? 20);

  // Surface order: this-hospital primary first, then others.
  rows.sort((a, b) => {
    const aHere = a.primaryHospitalId === args.hospitalId ? 0 : 1;
    const bHere = b.primaryHospitalId === args.hospitalId ? 0 : 1;
    return aHere - bHere;
  });

  return rows.map((r) => ({
    patientUserId: r.patientUserId,
    patientCode: r.patientCode,
    sex: r.sex,
    dateOfBirth: r.dateOfBirth,
    primaryHospitalName: r.primaryHospitalName,
  }));
}

/* ─── Today's flow status board (operational only) ──────────────── */

export interface FlowRow {
  patientUserId: string | null;
  patientCode: string | null;
  patientUnknownLabel: string | null;
  stage: "expected" | "arrived" | "in_queue" | "awaiting_triage";
  departmentName: string | null;
  whenIso: string;
  detail: string;
}

export async function fetchTodayFlow(args: {
  hospitalId: string;
  limit?: number;
}): Promise<FlowRow[]> {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  // Today's bookings + arrivals via appointments.
  const apptRows = await db
    .select({
      patientUserId: appointments.patientUserId,
      patientCode: patientProfiles.patientCode,
      status: appointments.status,
      startsAt: appointments.startsAt,
      departmentName: hospitalDepartments.name,
    })
    .from(appointments)
    .innerJoin(patientProfiles, eq(patientProfiles.id, appointments.patientUserId))
    .leftJoin(hospitalDepartments, eq(hospitalDepartments.id, appointments.departmentId))
    .where(
      and(
        eq(appointments.hospitalId, args.hospitalId),
        gte(appointments.startsAt, start),
        lt(appointments.startsAt, end),
      ),
    )
    .orderBy(asc(appointments.startsAt))
    .limit(args.limit ?? 200);

  // Walk-ins / referrals via intake (no underlying appointment).
  const intakeRows = await db
    .select({
      patientUserId: patientIntakes.patientUserId,
      patientCode: patientProfiles.patientCode,
      patientUnknownLabel: patientIntakes.patientUnknownLabel,
      status: patientIntakes.status,
      arrivedAt: patientIntakes.arrivedAt,
      departmentName: hospitalDepartments.name,
    })
    .from(patientIntakes)
    .leftJoin(patientProfiles, eq(patientProfiles.id, patientIntakes.patientUserId))
    .leftJoin(hospitalDepartments, eq(hospitalDepartments.id, patientIntakes.receivingDepartmentId))
    .where(
      and(
        eq(patientIntakes.hospitalId, args.hospitalId),
        gte(patientIntakes.arrivedAt, start),
        lt(patientIntakes.arrivedAt, end),
      ),
    )
    .orderBy(desc(patientIntakes.arrivedAt))
    .limit(args.limit ?? 200);

  const out: FlowRow[] = [];

  for (const r of apptRows) {
    const stage: FlowRow["stage"] =
      r.status === "arrived" || r.status === "in_progress"
        ? "in_queue"
        : r.status === "confirmed" || r.status === "pending_approval" || r.status === "requested"
          ? "expected"
          : "arrived";
    out.push({
      patientUserId: r.patientUserId,
      patientCode: r.patientCode,
      patientUnknownLabel: null,
      stage,
      departmentName: r.departmentName,
      whenIso: r.startsAt.toISOString(),
      detail: `Booked · ${r.status}`,
    });
  }
  for (const r of intakeRows) {
    out.push({
      patientUserId: r.patientUserId,
      patientCode: r.patientCode,
      patientUnknownLabel: r.patientUnknownLabel,
      stage:
        r.status === "awaiting_triage"
          ? "awaiting_triage"
          : r.status === "triaged"
            ? "in_queue"
            : "arrived",
      departmentName: r.departmentName,
      whenIso: r.arrivedAt.toISOString(),
      detail: `Intake · ${r.status}`,
    });
  }

  // Stable sort: most-recent event first.
  out.sort((a, b) => b.whenIso.localeCompare(a.whenIso));
  return out.slice(0, args.limit ?? 100);
}

// Reserve imports for future use
void or;
void sql;
