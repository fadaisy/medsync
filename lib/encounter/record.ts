import "server-only";

import type { Clerkship } from "@/lib/encounter/clerkship";
import { and, desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { clinicalPhiAccessLog } from "@/db/schema/doctor-workspace";
import {
  clinicalDocumentation,
  encounterDiagnoses,
  encounterEvents,
  encounterMedications,
  encounterOrders,
  problemList,
} from "@/db/schema/encounter";
import { patientAllergies } from "@/db/schema/prescribing";
import { encounters } from "@/db/schema/scheduling";
import { encounterSymptomObservations } from "@/db/schema/symptom-catalog";
import { symptomObservationRows } from "@/lib/clerkship/symptom-engine";
import { clerkshipWriteAuthority } from "@/lib/encounter/access";
import { deriveClinicalObjects } from "@/lib/encounter/clerkship";
import { resolveEncounterAccess } from "@/lib/encounter/scope";
import { logger } from "@/lib/logger";

/**
 * Encounter engine — the write/read/AUDIT orchestration (service-role; server
 * only). This is where the access model the kickoff (§2) describes is ENFORCED
 * concretely: cadre-write rules (clerkshipWriteAuthority), the legitimate-access
 * basis (resolveEncounterAccess — active_encounter / department_recent /
 * break_glass / care_team-seam, re-checked in app code because the service-role
 * client BYPASSES RLS), versioned/append-only documentation, the
 * clerkship→objects derivation, and AUDIT-ON-READ (a PHI read writes a
 * clinical_phi_access_log row AFTER a successful authorised fetch — the canonical
 * "who viewed which patient" table the doctor/nurse workspaces already use).
 *
 * ⚠️ GATED: the tables are created by migration 0040, which is NOT applied to
 * prod (see the migration header). This module compiles against the schema and
 * is review-ready; the live feature needs the migration applied first.
 *
 * Decision-support, not autonomous — it records what the clinician documents;
 * it never diagnoses or acts.
 */

export interface EncounterScope {
  userId: string;
  hospitalId: string;
  /** The clinician's department — drives the `department_recent` access basis. */
  departmentId: string | null;
  cadreCode: string | null;
  isClinical: boolean;
}

export interface RecordClerkshipInput {
  encounterId: string;
  patientUserId: string;
  scope: EncounterScope;
  clerkship: Clerkship;
  /** The clinician marks the version final (else draft). */
  finalise?: boolean;
}

/**
 * Append a new VERSION of the clerkship documentation for an encounter and fan
 * the structured content out to the engine's objects (allergies → the
 * prescribing check; meds; diagnoses; problem list; orders; disposition) — all
 * onto the append-only encounter timeline. A correction is a NEW version that
 * supersedes the prior one; nothing is edited in place.
 */
export async function recordClerkshipVersion(
  input: RecordClerkshipInput,
): Promise<{ ok?: true; documentationId?: string; error?: string }> {
  const { encounterId, patientUserId, scope, clerkship } = input;

  const authority = clerkshipWriteAuthority(scope.cadreCode, scope.isClinical);
  if (!authority.clinical) return { error: "Not authorised to write clinical documentation." };
  if (!authority.canClerk)
    return { error: "This cadre records a nursing assessment, not a full clerking." };

  // Legitimate-access gate — service-role writes bypass RLS, so re-check the
  // access basis (active_encounter / department_recent / break_glass) here.
  const access = await resolveEncounterAccess({
    userId: scope.userId,
    departmentId: scope.departmentId,
    patientUserId,
  });
  if (!access.allowed) return { error: "No legitimate clinical access to this patient." };

  const derived = deriveClinicalObjects(clerkship);

  try {
    // 1. Next version (append-only; corrections supersede the latest).
    const [latest] = await db
      .select({ id: clinicalDocumentation.id, version: clinicalDocumentation.version })
      .from(clinicalDocumentation)
      .where(eq(clinicalDocumentation.encounterId, encounterId))
      .orderBy(desc(clinicalDocumentation.version))
      .limit(1);
    const nextVersion = (latest?.version ?? 0) + 1;

    const [doc] = await db
      .insert(clinicalDocumentation)
      .values({
        encounterId,
        patientUserId,
        version: nextVersion,
        supersedesId: latest?.id ?? null,
        sectionData: clerkship,
        status: input.finalise ? "final" : "draft",
        authoredByUserId: scope.userId,
        authorCadreCode: scope.cadreCode,
      })
      .returning({ id: clinicalDocumentation.id });
    const documentationId = doc!.id;

    // 2. Fan out to the engine objects (only finalised clerkings persist the
    //    derived diagnoses/problems/orders; allergies + meds persist always —
    //    allergies are safety-critical and feed the prescribing check).
    for (const a of derived.allergies) {
      await db.insert(patientAllergies).values({
        hospitalId: scope.hospitalId,
        patientUserId,
        substance: a.substance,
        reaction: a.reaction ?? null,
        severity: a.severity ?? null,
        recordedByUserId: scope.userId,
      });
    }
    for (const m of derived.medications) {
      await db.insert(encounterMedications).values({
        encounterId,
        patientUserId,
        name: m.name,
        dose: m.dose ?? null,
        route: m.route ?? null,
        frequency: m.frequency ?? null,
        authoredByUserId: scope.userId,
      });
    }
    if (input.finalise) {
      for (const d of derived.diagnoses) {
        await db.insert(encounterDiagnoses).values({
          encounterId,
          patientUserId,
          icd10Code: d.icd10 ?? null,
          text: d.text,
          rank: d.rank ?? null,
          mustNotMiss: d.mustNotMiss ?? false,
          // A junior cannot finalise a diagnosis (co-sign hook) — keep working.
          status: authority.canWriteFinalDiagnosis ? (d.status ?? "working") : "working",
          authoredByUserId: scope.userId,
        });
      }
      for (const p of derived.problems) {
        await db.insert(problemList).values({
          patientUserId,
          hospitalId: scope.hospitalId,
          item: p.item,
          icd10Code: p.icd10 ?? null,
          active: p.active ?? true,
          sourceEncounterId: encounterId,
          authoredByUserId: scope.userId,
        });
      }
      for (const o of derived.orders) {
        await db.insert(encounterOrders).values({
          encounterId,
          patientUserId,
          kind: o.kind,
          loincCode: o.loinc ?? null,
          text: o.text,
          justification: o.justification ?? null,
          authoredByUserId: scope.userId,
        });
      }
      if (derived.disposition) {
        await db
          .update(encounters)
          .set({ disposition: derived.disposition })
          .where(eq(encounters.id, encounterId));
      }
      // Structured HPC → the queryable symptom-observation projection (on
      // finalise only, so drafts don't duplicate rows). Prose stays in the doc.
      // BEST-EFFORT: this is an analytics projection — a failure here (e.g. the
      // 0042 catalog tables not yet applied) must never fail the clinician's
      // documentation save. The structured items are already safe in section_data.
      try {
        const hpcItems = clerkship.history?.hpcItems ?? [];
        for (const item of hpcItems) {
          for (const row of symptomObservationRows(item)) {
            await db.insert(encounterSymptomObservations).values({
              encounterId,
              patientUserId,
              symptomCode: row.symptomCode,
              symptomDisplay: row.symptomDisplay,
              adHoc: row.adHoc,
              propertyCode: row.propertyCode,
              propertyDisplay: row.propertyDisplay,
              valueType: row.valueType,
              valueText: row.valueText,
              valueNum: row.valueNum != null ? String(row.valueNum) : null,
              recordedByUserId: scope.userId,
            });
          }
        }
      } catch (e) {
        logger.warn("encounter.symptom_obs.fan_out_failed", { error: String(e) });
      }
    }

    // 3. Timeline event (append-only).
    await db.insert(encounterEvents).values({
      encounterId,
      kind: "documentation",
      refId: documentationId,
      label: `Clerkship documented (v${nextVersion}${input.finalise ? ", final" : ", draft"})`,
      actorUserId: scope.userId,
    });

    return { ok: true, documentationId };
  } catch (e) {
    logger.error("recordClerkshipVersion failed", { error: String(e) });
    return { error: "Failed to record the clerkship." };
  }
}

export type LoadEncounterRecord =
  | { ok: false; error: string }
  | {
      ok: true;
      documentation: typeof clinicalDocumentation.$inferSelect | null;
      clerkship: Clerkship | null;
      allergies: (typeof patientAllergies.$inferSelect)[];
      diagnoses: (typeof encounterDiagnoses.$inferSelect)[];
      problems: (typeof problemList.$inferSelect)[];
      timeline: (typeof encounterEvents.$inferSelect)[];
    };

/**
 * Load the encounter's current clinical record AND write the AUDIT-ON-READ row
 * to clinical_phi_access_log (who read which patient's record, on what basis,
 * when) — the canonical "who viewed which patient" table the doctor/nurse
 * workspaces use. Returns the latest documentation version + the derived objects
 * + the timeline.
 *
 * AUTHORISES FIRST: service-role reads bypass RLS, so the access basis is
 * resolved here (RLS is necessary-but-not-sufficient for this path). The
 * access-log row is written ONLY AFTER a successful authorised fetch — an access
 * that never delivered data is not recorded as a legitimate read.
 */
export async function loadEncounterRecord(
  encounterId: string,
  patientUserId: string,
  scope: EncounterScope,
): Promise<LoadEncounterRecord> {
  if (!scope.isClinical) return { ok: false, error: "Not authorised to read clinical records." };
  const access = await resolveEncounterAccess({
    userId: scope.userId,
    departmentId: scope.departmentId,
    patientUserId,
  });
  if (!access.allowed || !access.basis) {
    logger.warn("encounter.record.read_denied", { encounterId, readerUserId: scope.userId });
    return { ok: false, error: "No legitimate clinical access to this patient." };
  }

  try {
    const [doc] = await db
      .select()
      .from(clinicalDocumentation)
      .where(eq(clinicalDocumentation.encounterId, encounterId))
      .orderBy(desc(clinicalDocumentation.version))
      .limit(1);

    const allergies = await db
      .select()
      .from(patientAllergies)
      .where(eq(patientAllergies.patientUserId, patientUserId))
      .orderBy(desc(patientAllergies.recordedAt));

    const diagnoses = await db
      .select()
      .from(encounterDiagnoses)
      .where(eq(encounterDiagnoses.encounterId, encounterId));

    const problems = await db
      .select()
      .from(problemList)
      .where(and(eq(problemList.patientUserId, patientUserId), eq(problemList.active, true)));

    // AUDIT-ON-READ — the canonical PHI-access row, written only after the
    // authorised fetch succeeds (a failed/denied read leaves no "record read").
    await db.insert(clinicalPhiAccessLog).values({
      hospitalId: scope.hospitalId,
      clinicianUserId: scope.userId,
      patientUserId,
      accessBasis: access.basis,
      surface: "encounter_record",
    });
    logger.info("encounter.record.read", {
      encounterId,
      readerUserId: scope.userId,
      basis: access.basis,
    });

    const timeline = await db
      .select()
      .from(encounterEvents)
      .where(eq(encounterEvents.encounterId, encounterId))
      .orderBy(desc(encounterEvents.recordedAt));

    return {
      ok: true,
      documentation: doc ?? null,
      clerkship: (doc?.sectionData as Clerkship | undefined) ?? null,
      allergies,
      diagnoses,
      problems,
      timeline,
    };
  } catch (e) {
    logger.error("loadEncounterRecord failed", { error: String(e) });
    return { ok: false, error: "Failed to load the clinical record." };
  }
}

export interface PatientEncounterSummaryRow {
  id: string;
  startedAt: Date;
  state: string;
  encounterType: string;
  disposition: string | null;
}

export type PatientClinicalRecord =
  | { ok: false; error: string }
  | {
      ok: true;
      basis: string;
      allergies: (typeof patientAllergies.$inferSelect)[];
      problems: (typeof problemList.$inferSelect)[];
      medications: (typeof encounterMedications.$inferSelect)[];
      diagnoses: (typeof encounterDiagnoses.$inferSelect)[];
      encounters: PatientEncounterSummaryRow[];
    };

/**
 * The patient's LONGITUDINAL clinical record (kickoff §4 "patient clinical record
 * view") — across encounters: active problems, allergies (safety-first), active
 * medications, recent diagnoses, and the encounter history. Authorises on the
 * legitimate-access basis and writes the audit-on-read row, same as
 * loadEncounterRecord. Patient-level, not encounter-scoped.
 */
export async function loadPatientClinicalRecord(
  patientUserId: string,
  scope: EncounterScope,
): Promise<PatientClinicalRecord> {
  if (!scope.isClinical) return { ok: false, error: "Not authorised to read clinical records." };
  const access = await resolveEncounterAccess({
    userId: scope.userId,
    departmentId: scope.departmentId,
    patientUserId,
  });
  if (!access.allowed || !access.basis) {
    logger.warn("encounter.patient_record.read_denied", {
      readerUserId: scope.userId,
    });
    return { ok: false, error: "No legitimate clinical access to this patient." };
  }

  try {
    const allergies = await db
      .select()
      .from(patientAllergies)
      .where(eq(patientAllergies.patientUserId, patientUserId))
      .orderBy(desc(patientAllergies.recordedAt));

    const problems = await db
      .select()
      .from(problemList)
      .where(and(eq(problemList.patientUserId, patientUserId), eq(problemList.active, true)))
      .orderBy(desc(problemList.createdAt));

    const medications = await db
      .select()
      .from(encounterMedications)
      .where(
        and(
          eq(encounterMedications.patientUserId, patientUserId),
          eq(encounterMedications.status, "active"),
        ),
      )
      .orderBy(desc(encounterMedications.createdAt))
      .limit(50);

    const diagnoses = await db
      .select()
      .from(encounterDiagnoses)
      .where(eq(encounterDiagnoses.patientUserId, patientUserId))
      .orderBy(desc(encounterDiagnoses.createdAt))
      .limit(50);

    const encounterRows = await db
      .select({
        id: encounters.id,
        startedAt: encounters.startedAt,
        state: encounters.state,
        encounterType: encounters.encounterType,
        disposition: encounters.disposition,
      })
      .from(encounters)
      .where(eq(encounters.patientUserId, patientUserId))
      .orderBy(desc(encounters.startedAt))
      .limit(50);

    // AUDIT-ON-READ — canonical PHI-access row, after the authorised fetch.
    await db.insert(clinicalPhiAccessLog).values({
      hospitalId: scope.hospitalId,
      clinicianUserId: scope.userId,
      patientUserId,
      accessBasis: access.basis,
      surface: "patient_clinical_record",
    });
    logger.info("encounter.patient_record.read", {
      readerUserId: scope.userId,
      basis: access.basis,
    });

    return {
      ok: true,
      basis: access.basis,
      allergies,
      problems,
      medications,
      diagnoses,
      encounters: encounterRows,
    };
  } catch (e) {
    logger.error("loadPatientClinicalRecord failed", { error: String(e) });
    return { ok: false, error: "Failed to load the clinical record." };
  }
}
