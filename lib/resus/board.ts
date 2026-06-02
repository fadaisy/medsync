import "server-only";

import { and, desc, eq, gte, isNull } from "drizzle-orm";

import { db } from "@/db";
import { clinicalPhiAccessLog } from "@/db/schema/doctor-workspace";
import { patientProfiles } from "@/db/schema/patient-profiles";
import { resusEpisodes } from "@/db/schema/resus";
import { triageRecords } from "@/db/schema/triage";
import { computeAgeYears } from "@/lib/age";
import { decrypt } from "@/lib/encryption";
import { logger } from "@/lib/logger";

/**
 * Resus board reads (GATE C). Two lists for the clinician's hospital:
 *   - ACTIVE episodes (resume / converge on a running resus), and
 *   - OPENABLE Red/L1 triage records with no episode yet (the trigger).
 *
 * Patient names are decrypted + audited exactly like the triage worklist
 * (basis department_recent, surface resus_board) — the caller has passed
 * requireResusScope, so access is gated before any decrypt.
 */

export interface ResusBoardEpisode {
  episodeId: string;
  patientUserId: string | null;
  displayName: string | null;
  triggerKind: string;
  triggerReason: string | null;
  startedAtIso: string;
  arrestDetected: boolean;
}

export interface ResusOpenable {
  triageRecordId: string;
  intakeId: string | null;
  patientUserId: string | null;
  displayName: string | null;
  ageYears: number | null;
  triagedAtIso: string;
  lifeThreatReason: string | null;
}

export interface ResusBoard {
  active: ResusBoardEpisode[];
  openable: ResusOpenable[];
}

function safeName(
  patientUserId: string | null,
  first: string | null,
  surname: string | null,
): string | null {
  if (!patientUserId || !first || !surname) return null;
  try {
    return `${decrypt(first)} ${decrypt(surname)}`.trim();
  } catch (e) {
    logger.warn("resus.board.decrypt_failed", { reason: String(e) });
    return null;
  }
}

export interface ResusPatientView {
  patientUserId: string | null;
  displayName: string | null;
  ageYears: number | null;
  sex: string | null;
}

/**
 * The patient header for the resus desk — audited name reveal (basis
 * department_recent, surface resus_desk). Null patient → unidentified.
 */
export async function fetchResusPatient(args: {
  patientUserId: string | null;
  hospitalId: string;
  clinicianUserId: string;
}): Promise<ResusPatientView> {
  if (!args.patientUserId) {
    return { patientUserId: null, displayName: null, ageYears: null, sex: null };
  }

  const [p] = await db
    .select({
      firstNameEncrypted: patientProfiles.firstNameEncrypted,
      surnameEncrypted: patientProfiles.surnameEncrypted,
      dateOfBirth: patientProfiles.dateOfBirth,
      sex: patientProfiles.sex,
    })
    .from(patientProfiles)
    .where(eq(patientProfiles.id, args.patientUserId))
    .limit(1);

  if (!p) {
    return { patientUserId: args.patientUserId, displayName: null, ageYears: null, sex: null };
  }

  const displayName = safeName(args.patientUserId, p.firstNameEncrypted, p.surnameEncrypted);
  if (displayName) {
    try {
      await db.insert(clinicalPhiAccessLog).values({
        hospitalId: args.hospitalId,
        clinicianUserId: args.clinicianUserId,
        patientUserId: args.patientUserId,
        accessBasis: "department_recent" as const,
        surface: "resus_desk",
      });
    } catch (e) {
      logger.error("resus.desk.phi_audit_failed", { reason: String(e) });
    }
  }

  return {
    patientUserId: args.patientUserId,
    displayName,
    ageYears: p.dateOfBirth ? computeAgeYears(p.dateOfBirth.toString(), new Date()) : null,
    sex: p.sex,
  };
}

export async function fetchResusBoard(args: {
  hospitalId: string;
  clinicianUserId: string;
  /** Hours back to surface openable L1 triage records. */
  sinceHours?: number;
}): Promise<ResusBoard> {
  const since = new Date(Date.now() - (args.sinceHours ?? 24) * 3600_000);

  const activeRows = await db
    .select({
      episodeId: resusEpisodes.id,
      patientUserId: resusEpisodes.patientUserId,
      firstNameEncrypted: patientProfiles.firstNameEncrypted,
      surnameEncrypted: patientProfiles.surnameEncrypted,
      triggerKind: resusEpisodes.triggerKind,
      triggerReason: resusEpisodes.triggerReason,
      startedAt: resusEpisodes.startedAt,
      arrestDetectedAt: resusEpisodes.arrestDetectedAt,
    })
    .from(resusEpisodes)
    .leftJoin(patientProfiles, eq(patientProfiles.id, resusEpisodes.patientUserId))
    .where(and(eq(resusEpisodes.hospitalId, args.hospitalId), eq(resusEpisodes.state, "active")))
    .orderBy(desc(resusEpisodes.startedAt))
    .limit(50);

  // Red/L1 triage records with NO episode yet → openable.
  const openableRows = await db
    .select({
      triageRecordId: triageRecords.id,
      intakeId: triageRecords.intakeId,
      patientUserId: triageRecords.patientUserId,
      firstNameEncrypted: patientProfiles.firstNameEncrypted,
      surnameEncrypted: patientProfiles.surnameEncrypted,
      dateOfBirth: patientProfiles.dateOfBirth,
      triagedAt: triageRecords.triagedAt,
      breakdown: triageRecords.computedBreakdown,
      episodeId: resusEpisodes.id,
    })
    .from(triageRecords)
    .leftJoin(patientProfiles, eq(patientProfiles.id, triageRecords.patientUserId))
    .leftJoin(resusEpisodes, eq(resusEpisodes.triageRecordId, triageRecords.id))
    .where(
      and(
        eq(triageRecords.hospitalId, args.hospitalId),
        eq(triageRecords.assignedLevel, 1),
        gte(triageRecords.triagedAt, since),
        isNull(resusEpisodes.id),
      ),
    )
    .orderBy(desc(triageRecords.triagedAt))
    .limit(50);

  const now = new Date();
  const active: ResusBoardEpisode[] = activeRows.map((r) => ({
    episodeId: r.episodeId,
    patientUserId: r.patientUserId,
    displayName: safeName(r.patientUserId, r.firstNameEncrypted, r.surnameEncrypted),
    triggerKind: r.triggerKind,
    triggerReason: r.triggerReason,
    startedAtIso: r.startedAt.toISOString(),
    arrestDetected: r.arrestDetectedAt !== null,
  }));

  const openable: ResusOpenable[] = openableRows.map((r) => {
    const breakdown = (r.breakdown ?? {}) as { lifeThreatReason?: string };
    return {
      triageRecordId: r.triageRecordId,
      intakeId: r.intakeId,
      patientUserId: r.patientUserId,
      displayName: safeName(r.patientUserId, r.firstNameEncrypted, r.surnameEncrypted),
      ageYears: r.dateOfBirth ? computeAgeYears(r.dateOfBirth.toString(), now) : null,
      triagedAtIso: r.triagedAt.toISOString(),
      lifeThreatReason: breakdown.lifeThreatReason ?? null,
    };
  });

  // Audit every name reveal (one row each), basis department_recent.
  const revealed = [...active, ...openable].filter((r) => r.displayName && r.patientUserId);
  if (revealed.length > 0) {
    try {
      await db.insert(clinicalPhiAccessLog).values(
        revealed.map((r) => ({
          hospitalId: args.hospitalId,
          clinicianUserId: args.clinicianUserId,
          patientUserId: r.patientUserId!,
          accessBasis: "department_recent" as const,
          surface: "resus_board",
        })),
      );
    } catch (e) {
      logger.error("resus.board.phi_audit_failed", { reason: String(e) });
    }
  }

  return { active, openable };
}
