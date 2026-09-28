import "server-only";

import type { WriteCtx } from "./context";
import type { WriteResult } from "./orders";
import type { PlanOrderLine } from "@/lib/clerking/plan/draft";
import type { ChartFrequency, ObsFrequency, PlanChartItem } from "@/lib/emr/charts/rules";
import type { EmrTx } from "@/lib/emr/db";
import type { DemographicFact, ObservationFact, PregnancyFact } from "@/lib/facts/types";
import type { CultureState, OtherMedicine, PlanCheckContext } from "@/lib/prescribing/plan-checks";
import type { PlanRx } from "@/lib/prescribing/plan-rx";
import type { AdminRoute } from "@/lib/prescribing/reference/emergency-drug-catalog";
import { and, eq, inArray, isNull } from "drizzle-orm";

import { clinicalCosignRequests } from "@/db/schema/doctor-workspace";
import { conditions, medicationStatements, specimens } from "@/db/schema/emr";
import { encounterOrders } from "@/db/schema/encounter";
import { monitoringCharts } from "@/db/schema/monitoring";
import { prescriptions } from "@/db/schema/prescribing";
import { computeAgeYears } from "@/lib/age";
import { DX_CATALOGUE, DX_TERM_IDS, TEST_UUIDS } from "@/lib/clerking/impression/load";
import { chartsToOpen } from "@/lib/emr/charts/rules";
import { readAsClinician } from "@/lib/emr/db";
import { loadAllergyInput } from "@/lib/emr/read/allergies";
import { unitWords } from "@/lib/emr/unit-words";
import { encrypt } from "@/lib/encryption";
import { loadFactSnapshot } from "@/lib/facts/loader";
import { drugById, isFluid, regimenById, resolveRegimens } from "@/lib/prescribing/formulary";
import { pharmacyAvailability } from "@/lib/prescribing/pharmacy";
import { planChecks, verifyAnswers } from "@/lib/prescribing/plan-checks";
import { regimenEdits, willRead } from "@/lib/prescribing/plan-rx";
import { EmrWriteError, stampActivity } from "./context";
import { loadEncounterDiagnoses } from "./diagnoses";
import { recordMedicationStatements } from "./facts";
import { openEncounter, placeOrders, replayed, requireCadre } from "./orders";
import { prescribeRequirement, PRESCRIBING_CADRES, statementRoute } from "./prescriptions";

/**
 * Placing the Plan (ADRs 0184, 0186, 0189): the basket's orders and prescriptions in one
 * transaction, then the monitoring charts the rule table opens. Every order rule and every
 * prescribing check runs again here from the record, whatever the screen showed: a
 * non-overrideable stop refuses, an unanswered check refuses, a per-kg dose worked out from an
 * older weight refuses. Behind CLERKING_PLAN_V2 (the action checks the flag).
 */

/* ─── The record the checks read ─────────────────────────────────── */

const WEIGHT_SOURCE: Record<string, string> = {
  triage_records: "triage",
  clinical_observations: "vitals",
};

export interface PlanFacts {
  ageYears: number | null;
  weight: { kg: number; at: string; source: string } | null;
  creatinine: { value: number; unit: string; at: string } | null;
  glucose: { value: number; at: string } | null;
  allergies: { substance: string }[];
  allergyStatus: PlanCheckContext["allergyStatus"];
  conditions: string[];
}

const at = (f: ObservationFact) => ("at" in f.effective ? f.effective.at : f.effective.start);

export async function loadPlanFacts(
  tx: EmrTx,
  patientUserId: string,
  now: Date,
): Promise<PlanFacts> {
  // Allergies cross hospitals (as loadPrescribePatient); the rest is read under RLS.
  const allergy = await loadAllergyInput(tx, patientUserId);
  const snap = await readAsClinician(tx, () =>
    loadFactSnapshot(tx, patientUserId, {
      manifest: [
        "demo.date_of_birth",
        "obs.weight",
        "preg.status",
        "obs.creatinine",
        "obs.glucose",
      ],
      asOf: now,
      purpose: "interactive",
    }),
  );
  const newest = (concept: string) =>
    snap.facts.find(
      (f): f is ObservationFact =>
        f.concept === concept && f.kind === "observation" && f.value.type === "quantity",
    );
  const dob = snap.facts.find((f): f is DemographicFact => f.kind === "demographic");
  const pregnancy = snap.facts.find((f): f is PregnancyFact => f.kind === "pregnancy");
  const w = newest("obs.weight");
  const cr = newest("obs.creatinine");
  const gl = newest("obs.glucose");
  const q = (f: ObservationFact | undefined) =>
    f && f.value.type === "quantity" ? f.value.canonical : null;
  return {
    ageYears: computeAgeYears(dob?.dateOfBirth.value ?? null, now),
    weight:
      w && q(w)?.unit === "kg"
        ? {
            kg: q(w)!.value,
            at: at(w),
            source: WEIGHT_SOURCE[w.provenance.table] ?? "record",
          }
        : null,
    creatinine:
      cr && q(cr)
        ? { value: q(cr)!.value, unit: unitWords(q(cr)!.unit) ?? q(cr)!.unit, at: at(cr) }
        : null,
    glucose: gl && q(gl)?.unit === "mmol/L" ? { value: q(gl)!.value, at: at(gl) } : null,
    allergies: allergy.allergies.map((substance) => ({ substance })),
    allergyStatus:
      allergy.status.kind === "listed"
        ? "has_allergies"
        : allergy.status.kind === "no_known_drug_allergies"
          ? "none_known"
          : "unknown",
    conditions: pregnancy?.state === "pregnant" ? ["pregnancy"] : [],
  };
}

const BLOOD_CULTURE = TEST_UUIDS["test.blood_culture"];
const KIDNEY_TESTS = ["test.urea_electrolytes", "test.creatinine"].flatMap((k) =>
  TEST_UUIDS[k] ? [TEST_UUIDS[k]] : [],
);

/** A U&E or creatinine ordered this visit (this basket's orders are placed first). */
async function kidneyTestPlanned(ctx: WriteCtx, encounterId: string): Promise<boolean> {
  if (!KIDNEY_TESTS.length) return false;
  const [row] = await ctx.tx
    .select({ id: encounterOrders.id })
    .from(encounterOrders)
    .where(
      and(
        eq(encounterOrders.encounterId, encounterId),
        inArray(encounterOrders.testId, KIDNEY_TESTS),
      ),
    )
    .limit(1);
  return !!row;
}

/** The problem's catalogue profile calls for a blood culture (a "sepsis-type" problem). */
function sepsisType(profileId: string | null): boolean {
  const p = profileId ? DX_CATALOGUE.profile(profileId) : null;
  return !!p?.tests_to_decide.includes("test.blood_culture");
}

async function bloodCultureState(ctx: WriteCtx, encounterId: string): Promise<CultureState> {
  if (!BLOOD_CULTURE) return "none";
  const orders = await ctx.tx
    .select({ id: encounterOrders.id })
    .from(encounterOrders)
    .where(
      and(eq(encounterOrders.encounterId, encounterId), eq(encounterOrders.testId, BLOOD_CULTURE)),
    );
  if (!orders.length) return "none";
  const taken = await ctx.tx
    .select({ id: specimens.id })
    .from(specimens)
    .where(
      inArray(
        specimens.orderId,
        orders.map((o) => o.id),
      ),
    )
    .limit(1);
  return taken.length ? "collected" : "ordered";
}

/** The current version of a problem on this patient, or a refusal (as placeOrders checks reasons). */
async function currentProblem(ctx: WriteCtx, patientUserId: string, conditionId: string) {
  const [row] = await ctx.tx
    .select({ id: conditions.id, status: conditions.status, termId: conditions.termId })
    .from(conditions)
    .where(and(eq(conditions.id, conditionId), eq(conditions.patientUserId, patientUserId)));
  if (!row) throw new EmrWriteError("invalid", "That problem is not on this patient's record.");
  const [superseded] = await ctx.tx
    .select({ id: conditions.id })
    .from(conditions)
    .where(eq(conditions.supersedesId, conditionId))
    .limit(1);
  if (superseded || row.status === "entered_in_error" || row.status === "cancelled")
    throw new EmrWriteError(
      "conflict",
      "The problem has changed or was entered in error: reload and choose it again.",
    );
  return { profileId: row.termId ? (DX_TERM_IDS[row.termId] ?? null) : null };
}

/* ─── One prescription ───────────────────────────────────────────── */

const doseWords = (rx: PlanRx) =>
  rx.kind === "fluid" && rx.fluid ? `${rx.fluid.volumeMl} mL` : `${rx.doseNum} ${rx.unit}`;

async function prescribeFromPlan(
  ctx: WriteCtx,
  input: { patientUserId: string; encounterId: string; rx: PlanRx },
  facts: PlanFacts,
  earlier: OtherMedicine[],
): Promise<{ id: string; label: string; drugId: string; classId: string; kind: "drug" | "fluid" }> {
  const { tx, actor, now } = ctx;
  const { rx } = input;
  const drug = drugById(rx.drugId);
  if (!drug) throw new EmrWriteError("invalid", "That medicine is not in the formulary.");
  const label = willRead(rx, drug);
  const replay = await replayed(tx, prescriptions, rx.clientKey, input.patientUserId);
  if (replay) return { id: replay, label, drugId: drug.id, classId: drug.class, kind: rx.kind };

  if (rx.kind === "fluid" ? !isFluid(drug) || !rx.fluid : !!rx.fluid)
    throw new EmrWriteError(
      "invalid",
      `${drug.generic}: the fluid and drug controls do not match.`,
    );
  if (!drug.routes.includes(rx.route))
    throw new EmrWriteError("invalid", `${drug.generic} is not given by that route.`);
  if (rx.kind === "drug" && rx.doseNum == null)
    throw new EmrWriteError("invalid", `Write the ${drug.generic} dose.`);
  if (!rx.conditionId) throw new EmrWriteError("invalid", "Choose the problem this is for.");
  const problem = await currentProblem(ctx, input.patientUserId, rx.conditionId);

  // The regimen, resolved again with the record's weight (ADR 0188).
  let resolved = null;
  if (rx.regimenId) {
    const regimen = regimenById(drug, rx.regimenId);
    if (!regimen) throw new EmrWriteError("invalid", "That regimen is not a signed one.");
    if (regimen.perKg) {
      if (!facts.weight)
        throw new EmrWriteError(
          "invalid",
          "No weight in the vitals: a per-kg dose cannot be placed.",
        );
      if (rx.weightAt !== facts.weight.at)
        throw new EmrWriteError(
          "conflict",
          `The weight changed (${facts.weight.kg} kg, ${facts.weight.source}): review the dose.`,
        );
    }
    resolved =
      resolveRegimens(drug, { ageYears: facts.ageYears, weight: facts.weight }).regimens.find(
        (r) => r.regimen.id === regimen.id,
      ) ?? null;
    if (!resolved)
      throw new EmrWriteError("invalid", "That regimen is not for this patient's age band.");
  }
  const edits = regimenEdits(rx, resolved);

  const requirement = await prescribeRequirement(ctx, drug.flags.controlled);
  const checks = planChecks(drug, rx, {
    ageYears: facts.ageYears,
    weight: facts.weight,
    allergies: facts.allergies,
    allergyStatus: facts.allergyStatus,
    conditions: facts.conditions,
    creatinine: facts.creatinine,
    kidneyTestPlanned: await kidneyTestPlanned(ctx, input.encounterId),
    glucose: facts.glucose,
    sepsisTypeProblem: sepsisType(problem.profileId),
    bloodCulture: await bloodCultureState(ctx, input.encounterId),
    others: earlier,
    cosign: requirement,
    pharmacy: pharmacyAvailability(drug.id, actor.hospitalId),
  });
  const verdict = verifyAnswers(checks, rx);
  if (!verdict.ok) throw new EmrWriteError("invalid", `${drug.generic}: ${verdict.reason}`);

  const statement = await recordMedicationStatements(ctx, {
    patientUserId: input.patientUserId,
    encounterId: input.encounterId,
    clientKey: `${rx.clientKey}:statement`,
    statements: [
      {
        drugCode: drug.id,
        medicationStatus: "active",
        periodStart: now.toISOString().slice(0, 10),
        route: statementRoute(rx.route as AdminRoute),
        medicationSource: "prescribed_here",
      },
    ],
  });

  const answered = rx.answers.filter((a) => checks.some((c) => c.code === a.code));
  const reason = [verdict.reasonText, rx.witness ? `Witness: ${rx.witness}` : ""]
    .filter(Boolean)
    .join("; ");
  const note = rx.note?.trim();
  const f = rx.fluid;
  const [row] = await tx
    .insert(prescriptions)
    .values({
      hospitalId: actor.hospitalId,
      encounterId: input.encounterId,
      patientUserId: input.patientUserId,
      prescriberUserId: actor.userId,
      prescriberCadre: actor.cadreCode,
      drugId: drug.id,
      drugName: drug.generic,
      dose: doseWords(rx),
      concentration: rx.strength,
      route: rx.route,
      frequency: rx.frequency,
      duration: rx.course,
      instructionsCiphertext: note ? encrypt(note) : null,
      isEmergency: false,
      controlled: drug.flags.controlled,
      confirmedFlags: answered.map((a) => a.code),
      confirmReasonCiphertext: reason ? encrypt(reason) : null,
      sensitivity: "standard",
      clientKey: rx.clientKey,
      medicationStatementId: statement.id,
      method: rx.method,
      infusionOver: rx.infusionOver,
      diluent: rx.diluent,
      prn: rx.prn,
      regimenId: resolved ? rx.regimenId : null,
      edits,
      conditionId: rx.conditionId,
      start: rx.start,
      kind: rx.kind,
      fluidPurpose: f?.purpose ?? null,
      volumeMl: f ? String(f.volumeMl) : null,
      overMinutes: f?.overMinutes ?? null,
      givingSetDropsPerMl: f?.delivery === "gravity" ? f.dropsPerMl : null,
      warmed: f ? f.warmed : null,
      checkAnswers: answered.map((a) => ({ code: a.code, answer: a.answer })),
      createdAt: now,
    })
    .returning({ id: prescriptions.id });

  if (requirement === "cosign_required")
    await tx.insert(clinicalCosignRequests).values({
      hospitalId: actor.hospitalId,
      patientUserId: input.patientUserId,
      requestedByUserId: actor.userId,
      requestedByAffiliationId: actor.affiliationId,
      requestedByCadreCode: actor.cadreCode,
      actionKind: drug.flags.controlled ? "prescription_controlled" : "prescription_routine",
      actionPayload: { prescriptionId: row!.id, encounterId: input.encounterId },
    });
  return { id: row!.id, label, drugId: drug.id, classId: drug.class, kind: rx.kind };
}

/* ─── Monitoring charts ──────────────────────────────────────────── */

const TEST_KEY_BY_UUID = new Map(Object.entries(TEST_UUIDS).map(([k, v]) => [v, k]));

/**
 * Opens the charts the rule table names for this visit's plan as it stands in the record, once
 * per kind; an open observations chart takes a changed frequency, an open fluid chart the urine
 * switch.
 */
export async function openPlanCharts(
  ctx: WriteCtx,
  input: {
    patientUserId: string;
    encounterId: string;
    observationFrequency: ObsFrequency | null;
    measureUrine: boolean;
  },
): Promise<string[]> {
  requireCadre(ctx, PRESCRIBING_CADRES, "open monitoring charts");
  const { tx, actor, now } = ctx;
  const [orders, rxRows, diagnoses, open] = await Promise.all([
    tx
      .select({
        id: encounterOrders.id,
        testId: encounterOrders.testId,
        frequency: encounterOrders.frequency,
        text: encounterOrders.text,
      })
      .from(encounterOrders)
      .where(
        and(
          eq(encounterOrders.encounterId, input.encounterId),
          eq(encounterOrders.lifecycle, "events"),
        ),
      ),
    tx
      .select()
      .from(prescriptions)
      .where(
        and(
          eq(prescriptions.encounterId, input.encounterId),
          eq(prescriptions.isEmergency, false),
          eq(prescriptions.state, "active"),
        ),
      ),
    loadEncounterDiagnoses(tx, {
      hospitalId: actor.hospitalId,
      patientUserId: input.patientUserId,
      encounterId: input.encounterId,
    }),
    tx
      .select()
      .from(monitoringCharts)
      .where(
        and(eq(monitoringCharts.encounterId, input.encounterId), isNull(monitoringCharts.closedAt)),
      ),
  ]);
  const items: PlanChartItem[] = [
    ...orders.map((o) => ({
      type: "order" as const,
      id: o.id,
      testKey: (o.testId && TEST_KEY_BY_UUID.get(o.testId)) || "",
      frequency: o.frequency,
      label: o.text,
    })),
    ...rxRows.map((r) => {
      const drug = drugById(r.drugId);
      return {
        type: "prescription" as const,
        id: r.id,
        drugId: r.drugId,
        classId: drug?.class ?? "",
        kind: (r.kind === "fluid" ? "fluid" : "drug") as "fluid" | "drug",
        label: `${r.drugName} ${r.dose}`,
      };
    }),
  ];
  const openings = chartsToOpen({
    observationFrequency: input.observationFrequency,
    problems: diagnoses.map((d) => ({
      profileId: d.termId ? (DX_TERM_IDS[d.termId] ?? null) : null,
      label: d.display,
    })),
    items,
    news2AtClerking: null,
  });
  const ids: string[] = [];
  for (const o of openings) {
    const existing = open.find((c) => c.kind === o.kind);
    if (existing) {
      const patch: { frequency?: ChartFrequency | null; measureUrine?: boolean; updatedAt?: Date } =
        {};
      if (o.kind === "observations" && existing.frequency !== o.frequency)
        patch.frequency = o.frequency;
      if (o.kind === "fluid_balance" && existing.measureUrine !== input.measureUrine)
        patch.measureUrine = input.measureUrine;
      if (Object.keys(patch).length)
        await tx.update(monitoringCharts).set(patch).where(eq(monitoringCharts.id, existing.id));
      ids.push(existing.id);
      continue;
    }
    const [row] = await tx
      .insert(monitoringCharts)
      .values({
        hospitalId: actor.hospitalId,
        patientUserId: input.patientUserId,
        encounterId: input.encounterId,
        kind: o.kind,
        openedBy: { rule: o.rule, label: o.label, items: o.items },
        frequency: o.frequency,
        measureUrine: o.kind === "fluid_balance" ? input.measureUrine : false,
        openedAt: now,
        openedByUserId: actor.userId,
      })
      .returning({ id: monitoringCharts.id });
    ids.push(row!.id);
  }
  return ids;
}

/* ─── Place the plan ─────────────────────────────────────────────── */

export interface PlacePlanInput {
  patientUserId: string;
  encounterId: string;
  orders: PlanOrderLine[];
  prescriptions: PlanRx[];
  observationFrequency: ObsFrequency | null;
  measureUrine: boolean;
}

export async function placePlan(
  ctx: WriteCtx,
  input: PlacePlanInput,
): Promise<WriteResult & { orderIds: string[]; prescriptionIds: string[]; chartIds: string[] }> {
  requireCadre(ctx, PRESCRIBING_CADRES, "place the plan");
  if (!input.orders.length && !input.prescriptions.length)
    throw new EmrWriteError("invalid", "The basket is empty.");
  const encounter = await openEncounter(ctx, input.patientUserId, input.encounterId);
  const warnings: string[] = [];

  const orderIds = input.orders.length
    ? (
        await placeOrders(ctx, {
          patientUserId: input.patientUserId,
          encounterId: encounter.id,
          orders: input.orders.map((o) => ({
            clientKey: o.clientKey,
            testId: o.testId,
            priority: o.priority,
            frequency: o.frequency ?? undefined,
            reasonConditionIds: o.reasonConditionIds,
          })),
        })
      ).orderIds
    : [];

  const facts = await loadPlanFacts(ctx.tx, input.patientUserId, ctx.now);
  // Already prescribed: this visit's prescriptions, then each one placed before it in this basket.
  const visit = await ctx.tx
    .select({ drugId: prescriptions.drugId, drugName: prescriptions.drugName })
    .from(prescriptions)
    .where(
      and(
        eq(prescriptions.encounterId, encounter.id),
        eq(prescriptions.isEmergency, false),
        eq(prescriptions.state, "active"),
      ),
    );
  const admission = await ctx.tx
    .select({ drugCode: medicationStatements.drugCode })
    .from(medicationStatements)
    .where(
      and(
        eq(medicationStatements.patientUserId, input.patientUserId),
        eq(medicationStatements.medicationStatus, "active"),
      ),
    );
  const others: OtherMedicine[] = [
    ...visit.map((v) => ({
      drugId: v.drugId,
      classId: drugById(v.drugId)?.class,
      display: v.drugName,
      source: "this_visit" as const,
    })),
    ...admission.flatMap((a) => {
      const d = a.drugCode ? drugById(a.drugCode) : undefined;
      return d
        ? [{ drugId: d.id, classId: d.class, display: d.generic, source: "admission" as const }]
        : [];
    }),
  ];
  const prescriptionIds: string[] = [];
  for (const rx of input.prescriptions) {
    const placed = await prescribeFromPlan(
      ctx,
      { patientUserId: input.patientUserId, encounterId: encounter.id, rx },
      facts,
      others,
    );
    prescriptionIds.push(placed.id);
    others.push({
      drugId: placed.drugId,
      classId: placed.classId,
      display: placed.label,
      source: "this_visit",
    });
  }

  const chartIds = await openPlanCharts(ctx, {
    patientUserId: input.patientUserId,
    encounterId: encounter.id,
    observationFrequency: input.observationFrequency,
    measureUrine: input.measureUrine,
  });
  await stampActivity(ctx, encounter.id);
  return {
    id: orderIds[0] ?? prescriptionIds[0]!,
    orderIds,
    prescriptionIds,
    chartIds,
    warnings,
  };
}
