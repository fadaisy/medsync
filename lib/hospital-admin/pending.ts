import "server-only";

import { and, asc, eq } from "drizzle-orm";

import { db } from "@/db";
import { clinicSessions } from "@/db/schema/clinic-sessions";
import { hospitalDepartments } from "@/db/schema/hospital-departments";
import { patientProfiles } from "@/db/schema/patient-profiles";
import { appointments } from "@/db/schema/scheduling";
import { serviceLines } from "@/db/schema/service-lines";
import { users } from "@/db/schema/users";

/**
 * What is waiting for a clinician at this hospital — the rows behind the
 * console's Pending number, oldest request first.
 *
 * A hospital admin is non-clinical, so a patient appears here as their
 * DB-issued code and nothing else: no name, no phone, no note (the same
 * boundary lib/hospital-admin/reports.ts keeps). The clinician is staff and
 * is named. The list is a signal about the clinic — how long a request sits
 * before someone answers it — never about a patient, and it computes
 * nothing punitive.
 */
export interface PendingRequest {
  id: string;
  /** NULL for a booking made for a provisional patient (migration 0060). */
  patientCode: string | null;
  clinicianName: string;
  departmentName: string;
  /** Only a session booking names a line; a slot booking carries none. */
  serviceLineName: string | null;
  startsAt: Date;
  endsAt: Date;
  /** When the request was made — the age a desk reads. */
  createdAt: Date;
  reason: string;
  priority: string;
  type: string;
}

/** Shipped to the client on every load; the dialog says when the list is cut. */
export const PENDING_LIMIT = 200;

export async function fetchPendingRequests(hospitalId: string): Promise<PendingRequest[]> {
  return db
    .select({
      id: appointments.id,
      patientCode: patientProfiles.patientCode,
      clinicianName: users.fullName,
      departmentName: hospitalDepartments.name,
      serviceLineName: serviceLines.name,
      startsAt: appointments.startsAt,
      endsAt: appointments.endsAt,
      createdAt: appointments.createdAt,
      reason: appointments.reason,
      priority: appointments.priority,
      type: appointments.type,
    })
    .from(appointments)
    .innerJoin(users, eq(users.id, appointments.clinicianUserId))
    .innerJoin(hospitalDepartments, eq(hospitalDepartments.id, appointments.departmentId))
    .leftJoin(patientProfiles, eq(patientProfiles.id, appointments.patientUserId))
    .leftJoin(clinicSessions, eq(clinicSessions.id, appointments.sessionId))
    .leftJoin(serviceLines, eq(serviceLines.id, clinicSessions.serviceLineId))
    .where(
      and(eq(appointments.hospitalId, hospitalId), eq(appointments.status, "pending_approval")),
    )
    .orderBy(asc(appointments.createdAt))
    .limit(PENDING_LIMIT);
}
