import "server-only";

import type { EncounterScope } from "@/lib/encounter/record";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { patientIntakes } from "@/db/schema/patient-intakes";
import { encounters } from "@/db/schema/scheduling";
import { triageRecords } from "@/db/schema/triage";
import { seedClerkshipFromTriage } from "@/lib/encounter/clerkship";
import { recordClerkshipVersion } from "@/lib/encounter/record";
import { logger } from "@/lib/logger";

/**
 * Triage → encounter handoff (kickoff §3): a completed triage opens/links an
 * encounter, carrying the presenting complaint + acuity + vitals into a SEEDED
 * draft clerkship (continuation, not a blank restart). Idempotent: if an
 * encounter is already linked to the triage, it returns that one.
 *
 * The caller (a doctor) becomes the encounter clinician; the freshly-created
 * in-progress encounter satisfies the `active_encounter` access basis, so the
 * seeded clerkship write authorises cleanly. Server-only.
 */

const ACUITY_LABEL: Record<number, string> = {
  1: "1 — immediate (red)",
  2: "2 — very urgent (orange)",
  3: "3 — urgent (yellow)",
  4: "4 — standard (green)",
  5: "5 — non-urgent (blue)",
};

export type OpenEncounterResult =
  | { ok: true; encounterId: string; created: boolean }
  | { ok: false; error: string };

export async function openEncounterFromTriage(
  triageRecordId: string,
  scope: EncounterScope,
): Promise<OpenEncounterResult> {
  const [tr] = await db
    .select({
      hospitalId: triageRecords.hospitalId,
      patientUserId: triageRecords.patientUserId,
      departmentId: triageRecords.departmentId,
      intakeId: triageRecords.intakeId,
      assignedLevel: triageRecords.assignedLevel,
      vitalsSnapshot: triageRecords.vitalsSnapshot,
    })
    .from(triageRecords)
    .where(eq(triageRecords.id, triageRecordId))
    .limit(1);

  if (!tr) return { ok: false, error: "Triage record not found." };
  if (tr.hospitalId !== scope.hospitalId) {
    return { ok: false, error: "That triage is outside your hospital." };
  }
  if (!tr.patientUserId) {
    return {
      ok: false,
      error: "This triage has no linked patient — register the patient before clerking.",
    };
  }
  const patientUserId = tr.patientUserId;

  try {
    // Idempotent: reuse the encounter already linked to this triage.
    const [existing] = await db
      .select({ id: encounters.id })
      .from(encounters)
      .where(eq(encounters.triageRecordId, triageRecordId))
      .limit(1);
    if (existing) return { ok: true, encounterId: existing.id, created: false };

    const [enc] = await db
      .insert(encounters)
      .values({
        hospitalId: tr.hospitalId,
        patientUserId,
        clinicianUserId: scope.userId,
        departmentId: scope.departmentId ?? tr.departmentId ?? null,
        encounterType: "emergency",
        triageRecordId,
        state: "in_progress",
      })
      .returning({ id: encounters.id });
    const encounterId = enc!.id;

    // Presenting complaint comes from the linked intake (if any).
    let presentingComplaint: string | null = null;
    if (tr.intakeId) {
      const [intake] = await db
        .select({ pc: patientIntakes.presentingComplaint })
        .from(patientIntakes)
        .where(eq(patientIntakes.id, tr.intakeId))
        .limit(1);
      presentingComplaint = intake?.pc ?? null;
    }

    const seeded = seedClerkshipFromTriage({
      presentingComplaint,
      acuity: ACUITY_LABEL[tr.assignedLevel] ?? String(tr.assignedLevel),
      vitalsSummary: summariseVitals(tr.vitalsSnapshot),
    });
    // Best-effort: a seeding failure shouldn't undo the (already-created) encounter.
    const rec = await recordClerkshipVersion({
      encounterId,
      patientUserId,
      scope,
      clerkship: seeded,
      finalise: false,
    });
    if (rec.error) {
      logger.warn("openEncounterFromTriage: seed clerkship failed", { encounterId });
    }

    return { ok: true, encounterId, created: true };
  } catch (e) {
    logger.error("openEncounterFromTriage failed", { error: String(e) });
    return { ok: false, error: "Failed to open the encounter." };
  }
}

/** Honest, shape-agnostic summary of the triage vitals snapshot (scalars only). */
function summariseVitals(snapshot: unknown): string | null {
  if (!snapshot || typeof snapshot !== "object") return null;
  const parts: string[] = [];
  for (const [k, v] of Object.entries(snapshot as Record<string, unknown>)) {
    if ((typeof v === "number" || typeof v === "string") && String(v).trim() !== "") {
      parts.push(`${k} ${v}`);
    }
    if (parts.length >= 8) break;
  }
  return parts.length ? parts.join(", ") : null;
}
