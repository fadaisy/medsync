import "server-only";

import type { WriteCtx } from "./context";
import type { WriteResult } from "./orders";
import type { EmrTx } from "@/lib/emr/db";
import type { DemographicFact, ObservationFact, PregnancyFact } from "@/lib/facts/types";
import type { PrescribePatient } from "@/lib/prescribing/engine";
import type { AdminRoute } from "@/lib/prescribing/reference/emergency-drug-catalog";
import { and, asc, eq, inArray, isNull, or } from "drizzle-orm";

import { checkPrescription, mgChecked, mustConfirm } from "@/components/emr/prescribing/model";
import { clinicalCosignPolicies, clinicalCosignRequests } from "@/db/schema/doctor-workspace";
import { prescriptions } from "@/db/schema/prescribing";
import { computeAgeYears } from "@/lib/age";
import { readAsClinician } from "@/lib/emr/db";
import { loadAllergyInput } from "@/lib/emr/read/allergies";
import { encrypt } from "@/lib/encryption";
import { loadFactSnapshot } from "@/lib/facts/loader";
import { getEmergencyDrug } from "@/lib/prescribing/reference/emergency-drug-catalog";
import { EmrWriteError } from "./context";
import { recordMedicationStatements } from "./facts";
import { openEncounter, ORDERING_CADRES, replayed, requireCadre } from "./orders";

/**
 * Prescriptions from the encounter (PROMPT Phase 7, D-EMR-14; HARMONISATION §5.5). A prescription
 * is a 0039 `prescriptions` row (0074 adds the OPD columns) plus, in the same transaction, a
 * `medication_statements` row sourced `prescribed_here`.
 *
 * lib/prescribing owns every check and the formulary: there is no dose logic here and nothing
 * suggests a dose. The engine's patient comes from the record: allergies from the allergy record
 * (every surface, resus AMPLE included), age and weight from the fact snapshot, and a pregnancy fact
 * as the condition "pregnancy" (the engine decides whether any contraindication matches it). The
 * checks are re-run here whatever the screen showed: a check that fires needs the prescriber's
 * reason, which is recorded; a non-overrideable block refuses, as it always has.
 */

export const PRESCRIBING_CADRES: readonly string[] = ORDERING_CADRES;

/** The engine's patient, as the record holds it now. */
export async function loadPrescribePatient(
  tx: EmrTx,
  patientUserId: string,
  now: Date,
): Promise<PrescribePatient> {
  // Allergies cross hospitals by decision (STOP 1, O-8), so they are read as the owner. Age, weight
  // and pregnancy stay hospital-scoped: read under RLS, or another hospital's restricted pregnancy
  // would print "Pregnant" here.
  const allergy = await loadAllergyInput(tx, patientUserId);
  const snap = await readAsClinician(tx, () =>
    loadFactSnapshot(tx, patientUserId, {
      manifest: ["demo.date_of_birth", "obs.weight", "preg.status"],
      asOf: now,
      purpose: "interactive",
    }),
  );
  const dob = snap.facts.find((f): f is DemographicFact => f.kind === "demographic");
  // Facts come newest first within a concept.
  const weight = snap.facts.find(
    (f): f is ObservationFact => f.concept === "obs.weight" && f.kind === "observation",
  );
  const pregnancy = snap.facts.find((f): f is PregnancyFact => f.kind === "pregnancy");
  return {
    ageYears: computeAgeYears(dob?.dateOfBirth.value ?? null, now),
    weightKg:
      weight?.value.type === "quantity" && weight.value.canonical.unit === "kg"
        ? weight.value.canonical.value
        : null,
    allergies: allergy.allergies,
    conditions: pregnancy?.state === "pregnant" ? ["pregnancy"] : [],
  };
}

/* ─── Co-sign policy (clinical_cosign_policies; fail closed like lib/doctor/capabilities.ts,
 *     which imports the database client and so cannot run inside this transaction) ─── */

type Requirement = "allowed" | "cosign_required" | "blocked";

async function prescribeRequirement(ctx: WriteCtx, controlled: boolean): Promise<Requirement> {
  const { actor } = ctx;
  const rows = await ctx.tx
    .select({
      departmentId: clinicalCosignPolicies.departmentId,
      requirement: clinicalCosignPolicies.requirement,
    })
    .from(clinicalCosignPolicies)
    .where(
      and(
        eq(clinicalCosignPolicies.hospitalId, actor.hospitalId),
        eq(clinicalCosignPolicies.cadreCode, actor.cadreCode),
        eq(
          clinicalCosignPolicies.actionKind,
          controlled ? "prescription_controlled" : "prescription_routine",
        ),
        actor.departmentId
          ? or(
              isNull(clinicalCosignPolicies.departmentId),
              eq(clinicalCosignPolicies.departmentId, actor.departmentId),
            )
          : isNull(clinicalCosignPolicies.departmentId),
      ),
    );
  // The department's own row wins over the hospital-wide one.
  const row = rows.find((r) => r.departmentId !== null) ?? rows[0];
  return (row?.requirement as Requirement | undefined) ?? "blocked";
}

/* ─── prescribe ──────────────────────────────────────────────────── */

export interface PrescribeInput {
  patientUserId: string;
  encounterId: string;
  clientKey: string;
  drugId: string;
  /** As the prescriber wrote it, for a medicine the engine holds no mg reference for. */
  dose?: string;
  /** Required where the engine can check a mg dose (the resus dialog's rule): its range check
   *  reads it, and the dose is recorded as "<mg> mg". */
  doseMg?: number;
  route: AdminRoute;
  concentration?: string;
  frequency: string;
  duration: string;
  quantity?: string;
  instructions?: string;
  /** Required when a check fires; recorded with the flag codes. */
  confirmReason?: string;
  /** The typed dose, when the engine calls the edited dose egregious. */
  typedDose?: number;
}

/** The medication_statements route words (CFC), from the formulary's routes. */
function statementRoute(route: AdminRoute) {
  switch (route) {
    case "oral":
    case "iv":
    case "im":
    case "sc":
    case "inhaled":
      return route;
    case "infusion":
      return "iv";
    case "nebulised":
      return "inhaled";
    default:
      return "other";
  }
}

export async function prescribe(
  ctx: WriteCtx,
  input: PrescribeInput,
): Promise<WriteResult & { statementId: string }> {
  requireCadre(ctx, PRESCRIBING_CADRES, "prescribe");
  const { tx, actor, now } = ctx;
  const replay = await replayed(tx, prescriptions, input.clientKey, input.patientUserId);
  if (replay) {
    const [r] = await tx
      .select({ statementId: prescriptions.medicationStatementId })
      .from(prescriptions)
      .where(eq(prescriptions.id, replay));
    return { id: replay, statementId: r!.statementId! };
  }
  const encounter = await openEncounter(ctx, input.patientUserId, input.encounterId);
  const drug = getEmergencyDrug(input.drugId);
  if (!drug || drug.recordOnly)
    throw new EmrWriteError("invalid", "That medicine is not on the prescribing formulary.");
  if (mgChecked(drug) && input.doseMg == null)
    throw new EmrWriteError("invalid", `Write the ${drug.name} dose in mg.`);
  const dose = mgChecked(drug) ? `${input.doseMg} mg` : (input.dose?.trim() ?? "");
  if (!dose || !input.frequency.trim() || !input.duration.trim())
    throw new EmrWriteError("invalid", "Write the dose, how often and for how long.");

  const requirement = await prescribeRequirement(ctx, drug.controlled);
  if (requirement === "blocked")
    throw new EmrWriteError(
      "forbidden",
      drug.controlled
        ? "Controlled-substance prescriptions are above your scope here."
        : "Prescribing is above your scope here.",
    );

  // The server's own check: never the screen's flags.
  const flags = checkPrescription(
    drug,
    await loadPrescribePatient(tx, input.patientUserId, now),
    input,
  );
  const hard = flags.filter((f) => !f.overrideable);
  if (hard.length) throw new EmrWriteError("invalid", hard.map((f) => f.message).join(" "));
  const fired = mustConfirm(flags);
  const reason = input.confirmReason?.trim() ?? "";
  if (fired.length && reason.length < 3)
    throw new EmrWriteError(
      "invalid",
      `${fired.map((f) => f.message).join(" ")} Record your reason to prescribe.`,
    );
  if (flags.some((f) => f.egregious) && input.typedDose !== input.doseMg)
    throw new EmrWriteError("invalid", "Type the dose to confirm it.");

  const statement = await recordMedicationStatements(ctx, {
    patientUserId: input.patientUserId,
    encounterId: encounter.id,
    clientKey: `${input.clientKey}:statement`,
    statements: [
      {
        drugCode: drug.drugKey,
        medicationStatus: "active",
        periodStart: now.toISOString().slice(0, 10),
        route: statementRoute(input.route),
        medicationSource: "prescribed_here",
      },
    ],
  });

  const instructions = input.instructions?.trim();
  const [row] = await tx
    .insert(prescriptions)
    .values({
      hospitalId: actor.hospitalId,
      encounterId: encounter.id,
      patientUserId: input.patientUserId,
      prescriberUserId: actor.userId,
      prescriberCadre: actor.cadreCode,
      drugId: drug.id,
      drugName: drug.name,
      dose,
      concentration: input.concentration?.trim() || null,
      route: input.route,
      frequency: input.frequency.trim(),
      duration: input.duration.trim(),
      quantity: input.quantity?.trim() || null,
      instructionsCiphertext: instructions ? encrypt(instructions) : null,
      isEmergency: false,
      controlled: drug.controlled,
      confirmedFlags: fired.map((f) => f.code),
      confirmReasonCiphertext: fired.length ? encrypt(reason) : null,
      // The formulary carries no restricted class today; the column is set at insert (C9).
      sensitivity: "standard",
      clientKey: input.clientKey,
      medicationStatementId: statement.id,
      createdAt: now,
    })
    .returning({ id: prescriptions.id });

  const warnings: string[] = [];
  if (requirement === "cosign_required") {
    await tx.insert(clinicalCosignRequests).values({
      hospitalId: actor.hospitalId,
      patientUserId: input.patientUserId,
      requestedByUserId: actor.userId,
      requestedByAffiliationId: actor.affiliationId,
      requestedByCadreCode: actor.cadreCode,
      actionKind: drug.controlled ? "prescription_controlled" : "prescription_routine",
      // PHI-free (gate-a-proposal A.5).
      actionPayload: { prescriptionId: row!.id, encounterId: encounter.id },
    });
    warnings.push("Awaiting senior co-sign.");
  }
  return { id: row!.id, statementId: statement.id, warnings };
}

/* ─── Reads for the desk and the printout (owner tx, after the access check) ─── */

export type PrescriptionRow = typeof prescriptions.$inferSelect & { awaitingCosign: boolean };

export async function encounterPrescriptions(
  tx: EmrTx,
  input: { hospitalId: string; patientUserId: string; encounterId: string },
): Promise<PrescriptionRow[]> {
  const rows = await tx
    .select()
    .from(prescriptions)
    .where(
      and(
        eq(prescriptions.encounterId, input.encounterId),
        eq(prescriptions.patientUserId, input.patientUserId),
        eq(prescriptions.hospitalId, input.hospitalId),
        eq(prescriptions.isEmergency, false),
      ),
    )
    .orderBy(asc(prescriptions.createdAt));
  const pending = rows.length
    ? await tx
        .select({ payload: clinicalCosignRequests.actionPayload })
        .from(clinicalCosignRequests)
        .where(
          and(
            eq(clinicalCosignRequests.patientUserId, input.patientUserId),
            eq(clinicalCosignRequests.state, "pending_review"),
            inArray(clinicalCosignRequests.actionKind, [
              "prescription_routine",
              "prescription_controlled",
            ]),
          ),
        )
    : [];
  const waiting = new Set(
    pending.map((p) => (p.payload as { prescriptionId?: string }).prescriptionId),
  );
  return rows.map((r) => ({ ...r, awaitingCosign: waiting.has(r.id) }));
}
