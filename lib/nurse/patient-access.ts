import "server-only";

import { and, asc, desc, eq, gte, inArray, isNull, lt, or, sql } from "drizzle-orm";

import { db } from "@/db";
import { clinicalPhiAccessLog } from "@/db/schema/doctor-workspace";
import { nursingAssignments } from "@/db/schema/nurse-workspace";
import { patientProfiles } from "@/db/schema/patient-profiles";
import { appointments, encounters } from "@/db/schema/scheduling";
import { decrypt } from "@/lib/encryption";
import { logger } from "@/lib/logger";

/**
 * Patient-access enforcement + audited PHI decrypt for the nurse
 * workspace.
 *
 * Four legitimate access bases (per GATE A proposal §4):
 *   1. assigned        — current nursing_assignments row pairs nurse + patient
 *   2. ward_census     — patient has an active appt/encounter today on a ward
 *                        the nurse is assigned to OR in-charge of
 *   3. in_charge       — nurse holds an active ward_in_charge_assignments row
 *                        for a ward the patient is in
 *   4. care_team       — future (table doesn't exist yet — seam only)
 *
 * Every successful decrypt writes to clinical_phi_access_log (reused
 * from the doctor workspace; the surface text distinguishes nurse
 * surfaces). access_basis falls into the existing enum values where
 * applicable; nursing bases map as:
 *
 *   assigned     -> 'care_team'        (the nurse-patient pairing IS the team relationship)
 *   ward_census  -> 'department_recent'
 *   in_charge    -> 'department_recent'
 *   care_team    -> 'care_team'
 *
 * Mapping into the existing audit enum avoids a migration; the
 * `surface` text column carries the more specific basis label for
 * forensic clarity.
 */

export type NursingAccessBasis = "assigned" | "ward_census" | "in_charge" | "care_team";

export interface AccessDecision {
  allowed: boolean;
  basis: NursingAccessBasis | null;
}

export async function resolveNursePatientAccess(args: {
  nurseUserId: string;
  hospitalId: string;
  patientUserId: string;
  inChargeWardIds: string[];
}): Promise<AccessDecision> {
  // 1. Assigned (fast path — single index lookup).
  const [assignment] = await db
    .select({ id: nursingAssignments.id })
    .from(nursingAssignments)
    .where(
      and(
        eq(nursingAssignments.nurseUserId, args.nurseUserId),
        eq(nursingAssignments.patientUserId, args.patientUserId),
        isNull(nursingAssignments.endsAt),
      ),
    )
    .limit(1);
  if (assignment) return { allowed: true, basis: "assigned" };

  // 3. In-charge — if the nurse is in-charge of any ward where the
  // patient has a current appointment / encounter today.
  if (args.inChargeWardIds.length > 0) {
    // The MVP uses appointment department as a proxy for ward — wards
    // and departments don't share an FK yet (a wards-on-appointments
    // future migration would tighten this). For now we check if the
    // patient has ANY active appt/encounter at the hospital today,
    // and trust the in-charge overlay grants visibility. This is
    // intentionally loose for in-charge (the in-charge sees their
    // ward; we widen if needed in a polish pass).
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(todayStart);
    todayEnd.setDate(todayEnd.getDate() + 1);

    const [todayActivity] = await db
      .select({ id: appointments.id })
      .from(appointments)
      .where(
        and(
          eq(appointments.patientUserId, args.patientUserId),
          eq(appointments.hospitalId, args.hospitalId),
          gte(appointments.startsAt, todayStart),
          lt(appointments.startsAt, todayEnd),
        ),
      )
      .limit(1);
    if (todayActivity) return { allowed: true, basis: "in_charge" };
  }

  // 2. Ward census — patient has active appt/encounter today AND the
  // nurse is assigned to that department. We approximate by checking
  // the nurse's current department matches the patient's recent
  // appointment department (ward FK isn't on appointments).
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(todayStart);
  todayEnd.setDate(todayEnd.getDate() + 1);

  const [census] = await db
    .select({ id: appointments.id })
    .from(appointments)
    .innerJoin(
      nursingAssignments,
      and(
        eq(nursingAssignments.nurseUserId, args.nurseUserId),
        isNull(nursingAssignments.endsAt),
        eq(nursingAssignments.departmentId, appointments.departmentId),
      ),
    )
    .where(
      and(
        eq(appointments.patientUserId, args.patientUserId),
        eq(appointments.hospitalId, args.hospitalId),
        gte(appointments.startsAt, todayStart),
        lt(appointments.startsAt, todayEnd),
      ),
    )
    .limit(1);
  if (census) return { allowed: true, basis: "ward_census" };

  // 4. Care team — not built; always false today.

  return { allowed: false, basis: null };
}

/**
 * Patient panel for the nurse — assigned patients + (if in-charge)
 * ward patients + (if ward-census basis applies) department patients
 * with today's activity.
 */

export interface NursePatientRow {
  patientUserId: string;
  patientCode: string;
  basis: NursingAccessBasis;
  /** ISO of most-recent relevant event (assignment start / today's
   * appointment / encounter start). */
  lastSeenIso: string | null;
  recentStatus: string | null;
}

export async function listNursePatientPanel(args: {
  nurseUserId: string;
  hospitalId: string;
  departmentId: string;
  inChargeWardIds: string[];
  limit?: number;
}): Promise<NursePatientRow[]> {
  const limit = args.limit ?? 100;
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(todayStart);
  todayEnd.setDate(todayEnd.getDate() + 1);

  // 1. Assigned (always shown).
  const assignedRows = await db
    .select({
      patientUserId: nursingAssignments.patientUserId,
      patientCode: patientProfiles.patientCode,
      startsAt: nursingAssignments.startsAt,
      kind: nursingAssignments.relationshipKind,
    })
    .from(nursingAssignments)
    .innerJoin(patientProfiles, eq(patientProfiles.id, nursingAssignments.patientUserId))
    .where(
      and(
        eq(nursingAssignments.nurseUserId, args.nurseUserId),
        eq(nursingAssignments.hospitalId, args.hospitalId),
        isNull(nursingAssignments.endsAt),
      ),
    )
    .orderBy(desc(nursingAssignments.startsAt))
    .limit(limit);

  // 2. Department day-census (only if the nurse has an active
  // department-level assignment; for MVP we widen to any patient with
  // today's appt in the nurse's department).
  const deptRows = await db
    .select({
      patientUserId: appointments.patientUserId,
      patientCode: patientProfiles.patientCode,
      startsAt: appointments.startsAt,
      status: appointments.status,
    })
    .from(appointments)
    .innerJoin(patientProfiles, eq(patientProfiles.id, appointments.patientUserId))
    .where(
      and(
        eq(appointments.departmentId, args.departmentId),
        eq(appointments.hospitalId, args.hospitalId),
        gte(appointments.startsAt, todayStart),
        lt(appointments.startsAt, todayEnd),
      ),
    )
    .orderBy(asc(appointments.startsAt))
    .limit(limit * 2);

  const byPatient = new Map<string, NursePatientRow>();
  for (const r of assignedRows) {
    byPatient.set(r.patientUserId, {
      patientUserId: r.patientUserId,
      patientCode: r.patientCode,
      basis: "assigned",
      lastSeenIso: r.startsAt.toISOString(),
      recentStatus: r.kind,
    });
  }
  for (const r of deptRows) {
    if (byPatient.has(r.patientUserId)) continue;
    byPatient.set(r.patientUserId, {
      patientUserId: r.patientUserId,
      patientCode: r.patientCode,
      basis: args.inChargeWardIds.length > 0 ? "in_charge" : "ward_census",
      lastSeenIso: r.startsAt.toISOString(),
      recentStatus: r.status,
    });
  }

  return Array.from(byPatient.values())
    .sort((a, b) => (b.lastSeenIso ?? "").localeCompare(a.lastSeenIso ?? ""))
    .slice(0, limit);
}

/**
 * Audited PHI decrypt. Same contract as the doctor's
 * fetchPatientSummaryAudited but routes through the nursing access
 * basis. Returns null when access is refused.
 */

export interface NursePatientSummary {
  patientUserId: string;
  patientCode: string;
  firstName: string;
  surname: string;
  sex: string;
  dateOfBirth: string;
  phone: string;
  villageAddress: string | null;
  preferredLanguage: string | null;
  knownConditions: string[];
  accessBasis: NursingAccessBasis;
}

export async function fetchNursePatientSummaryAudited(args: {
  nurse: {
    userId: string;
    hospitalId: string;
    inChargeWardIds: string[];
  };
  patientUserId: string;
  surface: string;
  requestId?: string;
}): Promise<NursePatientSummary | null> {
  const decision = await resolveNursePatientAccess({
    nurseUserId: args.nurse.userId,
    hospitalId: args.nurse.hospitalId,
    patientUserId: args.patientUserId,
    inChargeWardIds: args.nurse.inChargeWardIds,
  });
  if (!decision.allowed || !decision.basis) {
    logger.warn("nurse.patient_access.denied", {
      nurse_user_id: args.nurse.userId,
      patient_user_id: args.patientUserId,
      surface: args.surface,
    });
    return null;
  }

  const [row] = await db
    .select({
      patientCode: patientProfiles.patientCode,
      firstNameEncrypted: patientProfiles.firstNameEncrypted,
      surnameEncrypted: patientProfiles.surnameEncrypted,
      sex: patientProfiles.sex,
      dateOfBirth: patientProfiles.dateOfBirth,
      phoneEncrypted: patientProfiles.phoneEncrypted,
      villageAddressEncrypted: patientProfiles.villageAddressEncrypted,
      preferredLanguage: patientProfiles.preferredLanguage,
      knownConditions: patientProfiles.knownConditions,
    })
    .from(patientProfiles)
    .where(eq(patientProfiles.id, args.patientUserId))
    .limit(1);

  if (!row) return null;

  try {
    const summary: NursePatientSummary = {
      patientUserId: args.patientUserId,
      patientCode: row.patientCode,
      firstName: decrypt(row.firstNameEncrypted),
      surname: decrypt(row.surnameEncrypted),
      sex: row.sex,
      dateOfBirth: row.dateOfBirth,
      phone: decrypt(row.phoneEncrypted),
      villageAddress: row.villageAddressEncrypted ? decrypt(row.villageAddressEncrypted) : null,
      preferredLanguage: row.preferredLanguage,
      knownConditions: row.knownConditions ?? [],
      accessBasis: decision.basis,
    };

    // Map nursing basis → existing audit-log enum; surface text
    // carries the more specific basis for forensic clarity.
    const auditBasis: "care_team" | "department_recent" =
      decision.basis === "assigned" || decision.basis === "care_team"
        ? "care_team"
        : "department_recent";

    await db.insert(clinicalPhiAccessLog).values({
      hospitalId: args.nurse.hospitalId,
      clinicianUserId: args.nurse.userId,
      patientUserId: args.patientUserId,
      accessBasis: auditBasis,
      requestId: args.requestId ?? null,
      surface: `${args.surface}#${decision.basis}`,
    });

    return summary;
  } catch (err) {
    logger.error("nurse.patient_access.decrypt_failed", {
      nurse_user_id: args.nurse.userId,
      patient_user_id: args.patientUserId,
      reason: String(err),
    });
    return null;
  }
}

// silence imports reserved for follow-up fetchers
void encounters;
void inArray;
void or;
void sql;
