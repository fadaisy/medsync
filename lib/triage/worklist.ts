import "server-only";

import { and, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";

import { db } from "@/db";
import { clinicalPhiAccessLog } from "@/db/schema/doctor-workspace";
import { clinicalObservations } from "@/db/schema/nurse-workspace";
import { entryTypes, patientIntakes } from "@/db/schema/patient-intakes";
import { patientProfiles } from "@/db/schema/patient-profiles";
import { triageRecords } from "@/db/schema/triage";
import { computeAgeYears } from "@/lib/age";
import { decrypt } from "@/lib/encryption";
import { logger } from "@/lib/logger";

/**
 * Triage worklist + trend reads.
 *
 * Patient NAMES are decrypted here on the worklist — a deliberate,
 * audited deviation from the code-only default (see ADR 0038): triage
 * is a clinical act and the nurse must identify the patient they are
 * assessing. The legitimate access basis is "the patient has an open
 * intake in the triaging clinician's department" (department_recent);
 * every reveal writes one clinical_phi_access_log row. The caller has
 * already passed requireTriageScope, so access is gated before we ever
 * decrypt.
 */

export interface TriageWorklistRow {
  intakeId: string;
  patientUserId: string | null;
  patientCode: string | null;
  patientUnknownLabel: string | null;
  /** Decrypted "First Surname" — null when the patient is unidentified
   * (emergency unknown) or decrypt is unavailable. */
  displayName: string | null;
  /** Auto-computed from the patient's date of birth (server time). */
  ageYears: number | null;
  sex: string | null;
  entryTypeName: string;
  isEmergency: boolean;
  priorityHint: string;
  presentingComplaint: string | null;
  arrivedAtIso: string;
  status: string;
  /** Set once triaged — drives the "re-triage" affordance + prior chip. */
  priorLevel: number | null;
}

/** The triage queue for a department: awaiting + already-triaged (retriage). */
export async function fetchTriageWorklist(args: {
  hospitalId: string;
  departmentId?: string | null;
  /** The scoped triaging clinician — required to audit name reveals. */
  clinicianUserId: string;
  limit?: number;
}): Promise<TriageWorklistRow[]> {
  const conditions = [
    eq(patientIntakes.hospitalId, args.hospitalId),
    // Includes 'triaged' so an already-triaged patient stays visible for
    // re-triage (deterioration / correction).
    inArray(patientIntakes.status, ["arrived", "awaiting_triage", "triaged"]),
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
      firstNameEncrypted: patientProfiles.firstNameEncrypted,
      surnameEncrypted: patientProfiles.surnameEncrypted,
      dateOfBirth: patientProfiles.dateOfBirth,
      sex: patientProfiles.sex,
      entryTypeName: entryTypes.name,
      isEmergency: entryTypes.isEmergency,
      priorityHint: patientIntakes.priorityHint,
      presentingComplaint: patientIntakes.presentingComplaint,
      arrivedAt: patientIntakes.arrivedAt,
      status: patientIntakes.status,
      triageLevel: patientIntakes.triageLevel,
    })
    .from(patientIntakes)
    .innerJoin(entryTypes, eq(entryTypes.code, patientIntakes.entryTypeCode))
    .leftJoin(patientProfiles, eq(patientProfiles.id, patientIntakes.patientUserId))
    .where(and(...conditions))
    // Un-triaged first (they NEED assessment): `triage_level IS NOT NULL`
    // sorts false→true, so nulls (un-triaged) lead. Within each group:
    // higher priority hint, then oldest-waiting.
    .orderBy(
      sql`${patientIntakes.triageLevel} IS NOT NULL`,
      desc(patientIntakes.priorityHint),
      patientIntakes.arrivedAt,
    )
    .limit(args.limit ?? 100);

  const now = new Date();
  const mapped = rows.map((r) => {
    let displayName: string | null = null;
    if (r.patientUserId && r.firstNameEncrypted && r.surnameEncrypted) {
      try {
        displayName = `${decrypt(r.firstNameEncrypted)} ${decrypt(r.surnameEncrypted)}`.trim();
      } catch (e) {
        logger.warn("triage.worklist.decrypt_failed", { reason: String(e) });
        displayName = null;
      }
    }
    return {
      intakeId: r.intakeId,
      patientUserId: r.patientUserId,
      patientCode: r.patientCode,
      patientUnknownLabel: r.patientUnknownLabel,
      displayName,
      ageYears: r.dateOfBirth ? computeAgeYears(r.dateOfBirth.toString(), now) : null,
      sex: r.sex,
      entryTypeName: r.entryTypeName,
      isEmergency: r.isEmergency,
      priorityHint: r.priorityHint,
      presentingComplaint: r.presentingComplaint,
      arrivedAtIso: r.arrivedAt.toISOString(),
      status: r.status,
      priorLevel: r.triageLevel,
    };
  });

  // Audit every name reveal — one clinical_phi_access_log row per
  // identified patient shown, basis 'department_recent', surface
  // 'triage_worklist'. Best-effort (a failed audit must not crash the
  // worklist, but is logged loudly).
  const revealed = mapped.filter((r) => r.displayName && r.patientUserId);
  if (revealed.length > 0) {
    try {
      await db.insert(clinicalPhiAccessLog).values(
        revealed.map((r) => ({
          hospitalId: args.hospitalId,
          clinicianUserId: args.clinicianUserId,
          patientUserId: r.patientUserId!,
          accessBasis: "department_recent" as const,
          surface: "triage_worklist",
        })),
      );
    } catch (e) {
      logger.error("triage.worklist.phi_audit_failed", { reason: String(e) });
    }
  }

  return mapped;
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
 * for the trend view + auto-populating the triage vital set.
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

/* ─── Aggregate triage metrics (admin snippet, §4) ──────────────── */

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
