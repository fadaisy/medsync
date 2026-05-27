import "server-only";

import { and, desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { staffAffiliations } from "@/db/schema/clinician-profiles";
import { clinicalCosignRequests } from "@/db/schema/doctor-workspace";
import { hospitalDepartments } from "@/db/schema/hospital-departments";
import { cadres } from "@/db/schema/reference-data";
import { users } from "@/db/schema/users";

/**
 * Co-sign workflow helpers — reads on the request table for the
 * Review queue and the patient detail page.
 */

export interface CosignQueueRow {
  id: string;
  patientUserId: string;
  patientCode: string | null;
  actionKind: string;
  actionPayload: Record<string, unknown>;
  state: string;
  requestedByName: string | null;
  requestedByCadreCode: string;
  requestedByCadreName: string;
  requestedAtIso: string;
  reviewedAtIso: string | null;
  reviewNote: string | null;
}

/**
 * The pending-review queue for a senior in a given hospital. Filtering
 * by department is the consultant's job (the UI shows a department
 * filter chip); RLS guarantees no cross-hospital leak.
 */
export async function listPendingCosignRequests(args: {
  hospitalId: string;
}): Promise<CosignQueueRow[]> {
  const rows = await db
    .select({
      id: clinicalCosignRequests.id,
      patientUserId: clinicalCosignRequests.patientUserId,
      actionKind: clinicalCosignRequests.actionKind,
      actionPayload: clinicalCosignRequests.actionPayload,
      state: clinicalCosignRequests.state,
      requestedAt: clinicalCosignRequests.createdAt,
      reviewedAt: clinicalCosignRequests.reviewedAt,
      reviewNote: clinicalCosignRequests.reviewNote,
      requestedByName: users.fullName,
      requestedByCadreCode: clinicalCosignRequests.requestedByCadreCode,
      requestedByCadreName: cadres.name,
    })
    .from(clinicalCosignRequests)
    .leftJoin(users, eq(users.id, clinicalCosignRequests.requestedByUserId))
    .leftJoin(
      staffAffiliations,
      eq(staffAffiliations.id, clinicalCosignRequests.requestedByAffiliationId),
    )
    .leftJoin(cadres, eq(cadres.id, staffAffiliations.cadreId))
    .where(
      and(
        eq(clinicalCosignRequests.hospitalId, args.hospitalId),
        eq(clinicalCosignRequests.state, "pending_review"),
      ),
    )
    .orderBy(desc(clinicalCosignRequests.createdAt))
    .limit(100);

  return rows.map((r) => ({
    id: r.id,
    patientUserId: r.patientUserId,
    patientCode: null,
    actionKind: r.actionKind,
    actionPayload: (r.actionPayload ?? {}) as Record<string, unknown>,
    state: r.state,
    requestedByName: r.requestedByName,
    requestedByCadreCode: r.requestedByCadreCode,
    requestedByCadreName: r.requestedByCadreName ?? r.requestedByCadreCode,
    requestedAtIso: r.requestedAt.toISOString(),
    reviewedAtIso: r.reviewedAt?.toISOString() ?? null,
    reviewNote: r.reviewNote,
  }));
}

/**
 * Recent requests the doctor authored. Used on their overview /
 * tasks so an intern can see "the bp prescription I asked Dr. X to
 * sign off on is still pending."
 */
export async function listMyCosignRequests(args: {
  doctorUserId: string;
  hospitalId: string;
  limit?: number;
}): Promise<CosignQueueRow[]> {
  const rows = await db
    .select({
      id: clinicalCosignRequests.id,
      patientUserId: clinicalCosignRequests.patientUserId,
      actionKind: clinicalCosignRequests.actionKind,
      actionPayload: clinicalCosignRequests.actionPayload,
      state: clinicalCosignRequests.state,
      requestedAt: clinicalCosignRequests.createdAt,
      reviewedAt: clinicalCosignRequests.reviewedAt,
      reviewNote: clinicalCosignRequests.reviewNote,
      requestedByCadreCode: clinicalCosignRequests.requestedByCadreCode,
    })
    .from(clinicalCosignRequests)
    .where(
      and(
        eq(clinicalCosignRequests.hospitalId, args.hospitalId),
        eq(clinicalCosignRequests.requestedByUserId, args.doctorUserId),
      ),
    )
    .orderBy(desc(clinicalCosignRequests.createdAt))
    .limit(args.limit ?? 20);

  return rows.map((r) => ({
    id: r.id,
    patientUserId: r.patientUserId,
    patientCode: null,
    actionKind: r.actionKind,
    actionPayload: (r.actionPayload ?? {}) as Record<string, unknown>,
    state: r.state,
    requestedByName: null,
    requestedByCadreCode: r.requestedByCadreCode,
    requestedByCadreName: r.requestedByCadreCode,
    requestedAtIso: r.requestedAt.toISOString(),
    reviewedAtIso: r.reviewedAt?.toISOString() ?? null,
    reviewNote: r.reviewNote,
  }));
}

/** Used by the senior's queue — the supervisees they're paired with. */
export async function listMySupervisees(args: { supervisorAffiliationId: string }): Promise<
  Array<{
    superviseeAffiliationId: string;
    superviseeUserId: string;
    superviseeName: string | null;
    cadreName: string;
    departmentName: string;
    startsOnIso: string;
    relationshipKind: string;
  }>
> {
  const { clinicalSupervision } = await import("@/db/schema/doctor-workspace");

  const rows = await db
    .select({
      id: clinicalSupervision.id,
      superviseeAffiliationId: clinicalSupervision.superviseeAffiliationId,
      relationshipKind: clinicalSupervision.relationshipKind,
      startsOn: clinicalSupervision.startsOn,
      endsOn: clinicalSupervision.endsOn,
      superviseeUserId: staffAffiliations.userId,
      superviseeName: users.fullName,
      cadreName: cadres.name,
      departmentName: hospitalDepartments.name,
    })
    .from(clinicalSupervision)
    .innerJoin(
      staffAffiliations,
      eq(staffAffiliations.id, clinicalSupervision.superviseeAffiliationId),
    )
    .innerJoin(users, eq(users.id, staffAffiliations.userId))
    .innerJoin(cadres, eq(cadres.id, staffAffiliations.cadreId))
    .innerJoin(hospitalDepartments, eq(hospitalDepartments.id, staffAffiliations.departmentId))
    .where(eq(clinicalSupervision.supervisorAffiliationId, args.supervisorAffiliationId))
    .orderBy(desc(clinicalSupervision.startsOn));

  return rows
    .filter((r) => r.endsOn === null || new Date(r.endsOn) >= new Date())
    .map((r) => ({
      superviseeAffiliationId: r.superviseeAffiliationId,
      superviseeUserId: r.superviseeUserId,
      superviseeName: r.superviseeName,
      cadreName: r.cadreName,
      departmentName: r.departmentName,
      startsOnIso: String(r.startsOn),
      relationshipKind: r.relationshipKind,
    }));
}

/** The intern's named primary supervisor, if any. */
export async function getMySupervisor(args: { superviseeAffiliationId: string }): Promise<{
  supervisorUserId: string;
  supervisorName: string | null;
  cadreName: string;
  relationshipKind: string;
} | null> {
  const { clinicalSupervision } = await import("@/db/schema/doctor-workspace");

  const [row] = await db
    .select({
      supervisorUserId: staffAffiliations.userId,
      supervisorName: users.fullName,
      cadreName: cadres.name,
      relationshipKind: clinicalSupervision.relationshipKind,
      endsOn: clinicalSupervision.endsOn,
    })
    .from(clinicalSupervision)
    .innerJoin(
      staffAffiliations,
      eq(staffAffiliations.id, clinicalSupervision.supervisorAffiliationId),
    )
    .innerJoin(users, eq(users.id, staffAffiliations.userId))
    .innerJoin(cadres, eq(cadres.id, staffAffiliations.cadreId))
    .where(
      and(
        eq(clinicalSupervision.superviseeAffiliationId, args.superviseeAffiliationId),
        eq(clinicalSupervision.relationshipKind, "primary"),
      ),
    )
    .orderBy(desc(clinicalSupervision.startsOn))
    .limit(1);

  if (!row) return null;
  if (row.endsOn && new Date(row.endsOn) < new Date()) return null;

  return {
    supervisorUserId: row.supervisorUserId,
    supervisorName: row.supervisorName,
    cadreName: row.cadreName,
    relationshipKind: row.relationshipKind,
  };
}
