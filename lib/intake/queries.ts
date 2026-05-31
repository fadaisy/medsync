import "server-only";

import { and, asc, desc, eq, gte, inArray } from "drizzle-orm";

import { db } from "@/db";
import { hospitalDepartments } from "@/db/schema/hospital-departments";
import { hospitals } from "@/db/schema/hospitals";
import { entryTypes, patientIntakes } from "@/db/schema/patient-intakes";
import { patientProfiles } from "@/db/schema/patient-profiles";

/**
 * Read helpers for patient_intakes. Patient names on these surfaces
 * stay as patient_code only — the audited PHI decrypt path (doctor /
 * nurse patient-access helpers) handles named summaries.
 */

export interface IntakeRow {
  id: string;
  entryTypeCode: string;
  entryTypeName: string;
  isEmergency: boolean;
  priorityHint: string;
  status: string;
  arrivedAtIso: string;
  /** True when this intake was patient-initiated via book-or-queue
   * (migration 0035). When also status='declared', the patient hasn't
   * physically arrived yet — surface a "Declared · not here yet" chip
   * and rank below present-and-waiting rows. */
  declaredByPatient: boolean;
  /** Triage acuity once assigned (migration 0036). Null = not yet
   * triaged. Drives the acuity chip + sort on staff boards. */
  triageLevel: number | null;
  patientCode: string | null;
  patientUnknownLabel: string | null;
  presentingComplaint: string | null;
  receivingDepartmentId: string | null;
  receivingDepartmentName: string | null;
  referringHospitalName: string | null;
  referringFacilityOther: string | null;
  broughtBy: string | null;
}

export async function fetchHospitalIncomingIntakes(args: {
  hospitalId: string;
  departmentId?: string | null;
  statuses?: ReadonlyArray<string>;
  limit?: number;
}): Promise<IntakeRow[]> {
  // Default widened to include 'declared' (patient-initiated, not
  // physically here yet). Callers can still override.
  const statuses = args.statuses ?? ["declared", "arrived", "awaiting_triage"];
  const conditions = [
    eq(patientIntakes.hospitalId, args.hospitalId),
    inArray(patientIntakes.status, statuses as string[]),
  ];
  if (args.departmentId) {
    conditions.push(eq(patientIntakes.receivingDepartmentId, args.departmentId));
  }

  const rows = await db
    .select({
      id: patientIntakes.id,
      entryTypeCode: patientIntakes.entryTypeCode,
      entryTypeName: entryTypes.name,
      isEmergency: entryTypes.isEmergency,
      priorityHint: patientIntakes.priorityHint,
      status: patientIntakes.status,
      arrivedAt: patientIntakes.arrivedAt,
      declaredByPatient: patientIntakes.declaredByPatient,
      triageLevel: patientIntakes.triageLevel,
      patientCode: patientProfiles.patientCode,
      patientUnknownLabel: patientIntakes.patientUnknownLabel,
      presentingComplaint: patientIntakes.presentingComplaint,
      receivingDepartmentId: patientIntakes.receivingDepartmentId,
      receivingDepartmentName: hospitalDepartments.name,
      referringHospitalName: hospitals.name,
      referringFacilityOther: patientIntakes.referringFacilityOther,
      broughtBy: patientIntakes.broughtBy,
    })
    .from(patientIntakes)
    .innerJoin(entryTypes, eq(entryTypes.code, patientIntakes.entryTypeCode))
    .leftJoin(patientProfiles, eq(patientProfiles.id, patientIntakes.patientUserId))
    .leftJoin(hospitalDepartments, eq(hospitalDepartments.id, patientIntakes.receivingDepartmentId))
    .leftJoin(hospitals, eq(hospitals.id, patientIntakes.referringHospitalId))
    .where(and(...conditions))
    // Emergency first (priority desc by hint), then oldest-waiting first.
    // Declared-but-not-here rows get sorted to the tail in JS below,
    // since they shouldn't push present-and-waiting patients down.
    .orderBy(desc(patientIntakes.priorityHint), asc(patientIntakes.arrivedAt))
    .limit(args.limit ?? 50);

  const mapped: IntakeRow[] = rows.map((r) => ({
    id: r.id,
    entryTypeCode: r.entryTypeCode,
    entryTypeName: r.entryTypeName,
    isEmergency: r.isEmergency,
    priorityHint: r.priorityHint,
    status: r.status,
    arrivedAtIso: r.arrivedAt.toISOString(),
    declaredByPatient: r.declaredByPatient,
    triageLevel: r.triageLevel,
    patientCode: r.patientCode,
    patientUnknownLabel: r.patientUnknownLabel,
    presentingComplaint: r.presentingComplaint,
    receivingDepartmentId: r.receivingDepartmentId,
    receivingDepartmentName: r.receivingDepartmentName,
    referringHospitalName: r.referringHospitalName,
    referringFacilityOther: r.referringFacilityOther,
    broughtBy: r.broughtBy,
  }));

  // Stable rank: present rows first (current SQL order preserved),
  // declared rows after (most-recent declaration first, since they're
  // really a pre-queue, not a triage queue).
  const present = mapped.filter((r) => r.status !== "declared");
  const declared = mapped
    .filter((r) => r.status === "declared")
    .sort((a, b) => b.arrivedAtIso.localeCompare(a.arrivedAtIso));
  return [...present, ...declared];
}

export interface EntryTypeRow {
  code: string;
  name: string;
  isEmergency: boolean;
  defaultPriorityHint: string;
  requiresAppointmentLink: boolean;
  requiresReferral: boolean;
  allowsUnknownPatient: boolean;
  sortOrder: number;
}

export async function listEntryTypes(): Promise<EntryTypeRow[]> {
  const rows = await db
    .select({
      code: entryTypes.code,
      name: entryTypes.name,
      isEmergency: entryTypes.isEmergency,
      defaultPriorityHint: entryTypes.defaultPriorityHint,
      requiresAppointmentLink: entryTypes.requiresAppointmentLink,
      requiresReferral: entryTypes.requiresReferral,
      allowsUnknownPatient: entryTypes.allowsUnknownPatient,
      sortOrder: entryTypes.sortOrder,
    })
    .from(entryTypes)
    .orderBy(asc(entryTypes.sortOrder));
  return rows;
}

export async function listHospitalDepartments(
  hospitalId: string,
): Promise<Array<{ id: string; name: string }>> {
  return db
    .select({ id: hospitalDepartments.id, name: hospitalDepartments.name })
    .from(hospitalDepartments)
    .where(eq(hospitalDepartments.hospitalId, hospitalId))
    .orderBy(asc(hospitalDepartments.name));
}

export async function listActiveHospitals(): Promise<
  Array<{ id: string; name: string; level: string }>
> {
  return db
    .select({ id: hospitals.id, name: hospitals.name, level: hospitals.level })
    .from(hospitals)
    .where(eq(hospitals.state, "active"))
    .orderBy(asc(hospitals.name));
}

export async function fetchTodayIntakeCount(args: {
  hospitalId: string;
}): Promise<{ awaitingTriage: number; emergencyAwaiting: number }> {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const rows = await db
    .select({
      isEmergency: entryTypes.isEmergency,
      status: patientIntakes.status,
    })
    .from(patientIntakes)
    .innerJoin(entryTypes, eq(entryTypes.code, patientIntakes.entryTypeCode))
    .where(
      and(eq(patientIntakes.hospitalId, args.hospitalId), gte(patientIntakes.arrivedAt, start)),
    );
  let awaiting = 0;
  let emergency = 0;
  for (const r of rows) {
    if (r.status === "awaiting_triage" || r.status === "arrived") {
      awaiting++;
      if (r.isEmergency) emergency++;
    }
  }
  return { awaitingTriage: awaiting, emergencyAwaiting: emergency };
}
