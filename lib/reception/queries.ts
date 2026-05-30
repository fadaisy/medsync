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
  /** Patient-declared intakes that haven't been checked in yet
   * (status='declared', book-or-queue migration 0035). Reception's
   * cue that someone said "I'm coming today" but isn't here yet. */
  declaredToday: number;
}

export async function fetchReceptionTodayCounts(args: {
  hospitalId: string;
}): Promise<ReceptionTodayCounts> {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  const [expected, arrived, awaiting, noShows, declared] = await Promise.all([
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
    db
      .select({ n: count() })
      .from(patientIntakes)
      .where(
        and(
          eq(patientIntakes.hospitalId, args.hospitalId),
          eq(patientIntakes.status, "declared"),
          gte(patientIntakes.arrivedAt, start),
          lt(patientIntakes.arrivedAt, end),
        ),
      ),
  ]);

  return {
    expectedToday: Number(expected[0]?.n ?? 0),
    arrivedToday: Number(arrived[0]?.n ?? 0),
    awaitingTriage: Number(awaiting[0]?.n ?? 0),
    noShowsToday: Number(noShows[0]?.n ?? 0),
    declaredToday: Number(declared[0]?.n ?? 0),
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

/* ─── Today's declared queue tickets (book-or-queue, mig 0035) ──── */

export interface DeclaredIntakeRow {
  id: string;
  patientCode: string | null;
  patientUserId: string | null;
  declaredAtIso: string;
  departmentId: string | null;
  departmentName: string | null;
  presentingComplaint: string | null;
}

/**
 * Patient-initiated intakes that are still in 'declared' (haven't been
 * checked in). Reception's "we know they're on their way" list — feeds
 * the Check-in affordance on /reception/expected.
 */
export async function fetchDeclaredIntakesToday(args: {
  hospitalId: string;
  limit?: number;
}): Promise<DeclaredIntakeRow[]> {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  const rows = await db
    .select({
      id: patientIntakes.id,
      patientUserId: patientIntakes.patientUserId,
      patientCode: patientProfiles.patientCode,
      declaredAt: patientIntakes.arrivedAt,
      departmentId: patientIntakes.receivingDepartmentId,
      departmentName: hospitalDepartments.name,
      presentingComplaint: patientIntakes.presentingComplaint,
    })
    .from(patientIntakes)
    .leftJoin(patientProfiles, eq(patientProfiles.id, patientIntakes.patientUserId))
    .leftJoin(hospitalDepartments, eq(hospitalDepartments.id, patientIntakes.receivingDepartmentId))
    .where(
      and(
        eq(patientIntakes.hospitalId, args.hospitalId),
        eq(patientIntakes.status, "declared"),
        gte(patientIntakes.arrivedAt, start),
        lt(patientIntakes.arrivedAt, end),
      ),
    )
    .orderBy(desc(patientIntakes.arrivedAt))
    .limit(args.limit ?? 100);

  return rows.map((r) => ({
    id: r.id,
    patientCode: r.patientCode,
    patientUserId: r.patientUserId,
    declaredAtIso: r.declaredAt.toISOString(),
    departmentId: r.departmentId,
    departmentName: r.departmentName,
    presentingComplaint: r.presentingComplaint,
  }));
}

/* ─── Today's flow status board (operational only) ──────────────── */

export interface FlowRow {
  patientUserId: string | null;
  patientCode: string | null;
  patientUnknownLabel: string | null;
  /** `declared` = patient-initiated queue ticket, not yet physically
   * present. Distinct from `expected` (booked appointment, not yet
   * arrived) and `arrived` (here, not yet in a triage queue).
   * Migration 0035. */
  stage: "declared" | "expected" | "arrived" | "in_queue" | "awaiting_triage";
  departmentName: string | null;
  whenIso: string;
  detail: string;
  /** Set when this row came from a patient_intakes row in 'declared'
   * status — gives the reception UI an ID to wire a Check-in button. */
  declaredIntakeId: string | null;
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

  // Walk-ins / referrals / patient declarations via intake.
  const intakeRows = await db
    .select({
      id: patientIntakes.id,
      patientUserId: patientIntakes.patientUserId,
      patientCode: patientProfiles.patientCode,
      patientUnknownLabel: patientIntakes.patientUnknownLabel,
      status: patientIntakes.status,
      arrivedAt: patientIntakes.arrivedAt,
      declaredByPatient: patientIntakes.declaredByPatient,
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
      declaredIntakeId: null,
    });
  }
  for (const r of intakeRows) {
    const stage: FlowRow["stage"] =
      r.status === "declared"
        ? "declared"
        : r.status === "awaiting_triage"
          ? "awaiting_triage"
          : r.status === "triaged"
            ? "in_queue"
            : "arrived";
    const source = r.declaredByPatient ? "Self-declared" : "Intake";
    out.push({
      patientUserId: r.patientUserId,
      patientCode: r.patientCode,
      patientUnknownLabel: r.patientUnknownLabel,
      stage,
      departmentName: r.departmentName,
      whenIso: r.arrivedAt.toISOString(),
      detail: `${source} · ${r.status}`,
      declaredIntakeId: r.status === "declared" ? r.id : null,
    });
  }

  // Stable sort: most-recent event first.
  out.sort((a, b) => b.whenIso.localeCompare(a.whenIso));
  return out.slice(0, args.limit ?? 100);
}

// Reserve imports for future use
void or;
void sql;
