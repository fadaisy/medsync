import "server-only";

import { and, desc, eq, gte, inArray, lt } from "drizzle-orm";

import { db } from "@/db";
import { clinicalObservations } from "@/db/schema/nurse-workspace";
import { entryTypes, patientIntakes } from "@/db/schema/patient-intakes";
import { patientProfiles } from "@/db/schema/patient-profiles";
import { triageRecords } from "@/db/schema/triage";

/**
 * Triage worklist + trend reads. Operational + demographic only —
 * the panel decrypts named PHI through the existing audited path, not
 * here. All reads are RLS-safe (the caller is a scoped clinician).
 */

export interface TriageWorklistRow {
  intakeId: string;
  patientUserId: string | null;
  patientCode: string | null;
  patientUnknownLabel: string | null;
  entryTypeName: string;
  isEmergency: boolean;
  priorityHint: string;
  presentingComplaint: string | null;
  arrivedAtIso: string;
  /** Already-triaged this visit? (re-triage allowed; shows prior level.) */
  priorLevel: number | null;
}

/** The awaiting-triage queue for a department, emergency + oldest first. */
export async function fetchTriageWorklist(args: {
  hospitalId: string;
  departmentId?: string | null;
  limit?: number;
}): Promise<TriageWorklistRow[]> {
  const conditions = [
    eq(patientIntakes.hospitalId, args.hospitalId),
    inArray(patientIntakes.status, ["arrived", "awaiting_triage"]),
  ];
  if (args.departmentId) {
    conditions.push(eq(patientIntakes.receivingDepartmentId, args.departmentId));
  }

  const rows = await db
    .select({
      intakeId: patientIntakes.id,
      patientUserId: patientIntakes.patientUserId,
      patientCode: patientProfiles.patientCode,
      patientUnknownLabel: patientIntakes.patientUnknownLabel,
      entryTypeName: entryTypes.name,
      isEmergency: entryTypes.isEmergency,
      priorityHint: patientIntakes.priorityHint,
      presentingComplaint: patientIntakes.presentingComplaint,
      arrivedAt: patientIntakes.arrivedAt,
      triageLevel: patientIntakes.triageLevel,
    })
    .from(patientIntakes)
    .innerJoin(entryTypes, eq(entryTypes.code, patientIntakes.entryTypeCode))
    .leftJoin(patientProfiles, eq(patientProfiles.id, patientIntakes.patientUserId))
    .where(and(...conditions))
    .orderBy(desc(patientIntakes.priorityHint), patientIntakes.arrivedAt)
    .limit(args.limit ?? 100);

  return rows.map((r) => ({
    intakeId: r.intakeId,
    patientUserId: r.patientUserId,
    patientCode: r.patientCode,
    patientUnknownLabel: r.patientUnknownLabel,
    entryTypeName: r.entryTypeName,
    isEmergency: r.isEmergency,
    priorityHint: r.priorityHint,
    presentingComplaint: r.presentingComplaint,
    arrivedAtIso: r.arrivedAt.toISOString(),
    priorLevel: r.triageLevel,
  }));
}

export interface RecentVital {
  kind: string;
  value1: number | null;
  value2: number | null;
  unit: string | null;
  recordedAtIso: string;
}

/**
 * The patient's recent clinician-recorded observations (last 14 days),
 * for the trend view + auto-populating the triage vital set. Returns
 * newest-first per kind; the panel picks the latest of each.
 */
export async function fetchRecentVitals(args: {
  patientUserId: string;
  limit?: number;
}): Promise<RecentVital[]> {
  const since = new Date();
  since.setDate(since.getDate() - 14);

  const rows = await db
    .select({
      kind: clinicalObservations.observationKind,
      value1: clinicalObservations.numericValue1,
      value2: clinicalObservations.numericValue2,
      unit: clinicalObservations.unit,
      recordedAt: clinicalObservations.recordedAt,
    })
    .from(clinicalObservations)
    .where(
      and(
        eq(clinicalObservations.patientUserId, args.patientUserId),
        eq(clinicalObservations.state, "active"),
        gte(clinicalObservations.recordedAt, since),
      ),
    )
    .orderBy(desc(clinicalObservations.recordedAt))
    .limit(args.limit ?? 200);

  return rows.map((r) => ({
    kind: r.kind,
    value1: r.value1 === null ? null : Number(r.value1),
    value2: r.value2 === null ? null : Number(r.value2),
    unit: r.unit,
    recordedAtIso: r.recordedAt.toISOString(),
  }));
}

/**
 * Aggregate triage metrics for a hospital today (admin snippet, §4).
 * Aggregate + scoped — no patient-level data crosses the boundary.
 * "Over/under-triage rate" needs outcome data (a later build); today
 * we surface the acuity mix + how many were clinician-overridden, both
 * measurable now and the seed of the validation dataset (§6/§10).
 */
export interface TriageMetrics {
  total: number;
  byLevel: Record<1 | 2 | 3 | 4 | 5, number>;
  overrides: number;
  baselineAdjustments: number;
}

export async function fetchTriageMetricsToday(args: {
  hospitalId: string;
}): Promise<TriageMetrics> {
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const rows = await db
    .select({
      assignedLevel: triageRecords.assignedLevel,
      overrideDirection: triageRecords.overrideDirection,
      baselineAdjusted: triageRecords.baselineAdjusted,
    })
    .from(triageRecords)
    .where(and(eq(triageRecords.hospitalId, args.hospitalId), gte(triageRecords.triagedAt, start)));

  const byLevel: Record<1 | 2 | 3 | 4 | 5, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let overrides = 0;
  let baselineAdjustments = 0;
  for (const r of rows) {
    const lvl = r.assignedLevel as 1 | 2 | 3 | 4 | 5;
    if (lvl >= 1 && lvl <= 5) byLevel[lvl]++;
    if (r.overrideDirection !== "none") overrides++;
    if (r.baselineAdjusted) baselineAdjustments++;
  }
  return { total: rows.length, byLevel, overrides, baselineAdjustments };
}

/** The most-recent prior triage level for a patient (trend input). */
export async function fetchPriorTriageLevel(args: {
  patientUserId: string;
  beforeIso?: string;
}): Promise<number | null> {
  const before = args.beforeIso ? new Date(args.beforeIso) : new Date();
  const rows = await db
    .select({ level: triageRecords.assignedLevel, at: triageRecords.triagedAt })
    .from(triageRecords)
    .where(
      and(eq(triageRecords.patientUserId, args.patientUserId), lt(triageRecords.triagedAt, before)),
    )
    .orderBy(desc(triageRecords.triagedAt))
    .limit(1);
  return rows[0]?.level ?? null;
}
