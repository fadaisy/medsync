import "server-only";

import type { WriteCtx } from "./context";
import type { WriteResult } from "./orders";
import type { FluidKind } from "@/lib/emr/charts/fluids";
import { and, eq, isNull } from "drizzle-orm";

import { fluidBalanceEntries, monitoringCharts } from "@/db/schema/monitoring";
import { prescriptions } from "@/db/schema/prescribing";
import { encounters } from "@/db/schema/scheduling";
import { EmrWriteError, stampActivity } from "./context";
import { NURSE_CADRES, openEncounter, ORDERING_CADRES, replayed, requireCadre } from "./orders";

/**
 * Fluid balance entries (ADR 0189, MONITORING-CHARTS.md §3, migration 0089). Append-only: an entry
 * is never changed. A correction is a new row naming the one it replaces; entered in error is a
 * new row with no volume and a reason code, naming the one it withdraws. Urine can be stated as
 * not measured (measured = false, no volume), never recorded as 0 unless 0 mL was measured.
 *
 * An entry needs an open fluid balance chart for the visit: the plan opens it, not the nurse.
 */

export const FLUID_KINDS = [
  "iv_in",
  "oral_in",
  "urine_out",
  "other_out",
] as const satisfies readonly FluidKind[];
export const ROUTE_DETAILS = ["oral", "ng", "vomit", "drain", "stool", "other"] as const;
export type RouteDetail = (typeof ROUTE_DETAILS)[number];
const ROUTE_FOR: Readonly<Record<FluidKind, readonly RouteDetail[]>> = {
  iv_in: [],
  oral_in: ["oral", "ng"],
  urine_out: [],
  other_out: ["vomit", "drain", "stool", "other"],
};
export const FLUID_ERROR_REASONS = ["wrong_patient", "duplicate", "wrong_kind", "other"] as const;
export type FluidErrorReason = (typeof FLUID_ERROR_REASONS)[number];

/** Who records fluid balance: the nurse at the bedside, or a clinician (as observations). */
const RECORDING_CADRES: readonly string[] = [...NURSE_CADRES, ...ORDERING_CADRES];
/** The largest single entry accepted, in mL: a typing slip guard, not a clinical limit. */
export const MAX_ENTRY_ML = 10000;
/** A device clock a little ahead of the server's is not a future entry. */
const CLOCK_SKEW_MS = 5 * 60000;

export interface FluidValues {
  volumeMl?: number | null;
  /** False only for urine stated as not measured. Defaults to true. */
  measured?: boolean;
  /** The time the volume went in or out; defaults to now. */
  effectiveAt?: Date | string;
  /** IV in only: a prescription of this visit. */
  prescriptionId?: string | null;
  routeDetail?: RouteDetail | null;
}

export interface RecordFluidInput extends FluidValues {
  patientUserId: string;
  encounterId: string;
  clientKey: string;
  kind: FluidKind;
}

export type CorrectFluidInput = {
  patientUserId: string;
  /** The entry corrected or withdrawn. */
  entryId: string;
  clientKey: string;
} & (
  | { enteredInError: true; reasonCode: FluidErrorReason }
  | ({ enteredInError?: false } & FluidValues)
);

async function openFluidChart(ctx: WriteCtx, encounterId: string): Promise<void> {
  const [chart] = await ctx.tx
    .select({ id: monitoringCharts.id })
    .from(monitoringCharts)
    .where(
      and(
        eq(monitoringCharts.encounterId, encounterId),
        eq(monitoringCharts.hospitalId, ctx.actor.hospitalId),
        eq(monitoringCharts.kind, "fluid_balance"),
        isNull(monitoringCharts.closedAt),
      ),
    )
    .limit(1);
  if (!chart)
    throw new EmrWriteError(
      "conflict",
      "No fluid balance chart is open for this visit: the plan opens it.",
    );
}

/** The values of one entry, checked; throws the reason in words. */
async function checkedValues(
  ctx: WriteCtx,
  i: { patientUserId: string; encounterId: string; kind: FluidKind } & FluidValues,
) {
  if (!FLUID_KINDS.includes(i.kind))
    throw new EmrWriteError("invalid", "Choose what the entry is.");
  const measured = i.measured ?? true;
  const volume = i.volumeMl ?? null;
  if (!measured) {
    if (i.kind !== "urine_out")
      throw new EmrWriteError("invalid", "Only urine can be recorded as not measured.");
    if (volume !== null)
      throw new EmrWriteError("invalid", "Not measured has no volume: clear the volume.");
  } else if (volume === null || !Number.isFinite(volume) || volume < 0 || volume > MAX_ENTRY_ML)
    throw new EmrWriteError(
      "invalid",
      `Enter the volume in mL, from 0 to ${MAX_ENTRY_ML}, or mark urine as not measured.`,
    );

  const routeDetail = i.routeDetail ?? null;
  if (routeDetail !== null && !ROUTE_FOR[i.kind].includes(routeDetail))
    throw new EmrWriteError("invalid", "That route does not go with this kind of entry.");

  const prescriptionId = i.prescriptionId ?? null;
  if (prescriptionId !== null) {
    if (i.kind !== "iv_in") throw new EmrWriteError("invalid", "Only IV in names a prescription.");
    const [rx] = await ctx.tx
      .select({ id: prescriptions.id })
      .from(prescriptions)
      .where(
        and(
          eq(prescriptions.id, prescriptionId),
          eq(prescriptions.encounterId, i.encounterId),
          eq(prescriptions.patientUserId, i.patientUserId),
          eq(prescriptions.hospitalId, ctx.actor.hospitalId),
        ),
      );
    if (!rx) throw new EmrWriteError("not_found", "That prescription is not part of this visit.");
  }

  const effectiveAt = i.effectiveAt ? new Date(i.effectiveAt) : ctx.now;
  if (Number.isNaN(effectiveAt.getTime()))
    throw new EmrWriteError("invalid", "The time of the entry is not valid.");
  if (effectiveAt.getTime() > ctx.now.getTime() + CLOCK_SKEW_MS)
    throw new EmrWriteError("invalid", "The time is in the future: enter when it went in or out.");
  const [e] = await ctx.tx
    .select({ startedAt: encounters.startedAt })
    .from(encounters)
    .where(eq(encounters.id, i.encounterId));
  if (e && effectiveAt.getTime() < e.startedAt.getTime())
    throw new EmrWriteError("invalid", "The time is before this visit started.");

  return {
    volumeMl: volume === null ? null : String(volume),
    measured,
    routeDetail,
    prescriptionId,
    effectiveAt,
  };
}

/* ─── recordFluidEntry ───────────────────────────────────────────── */

export async function recordFluidEntry(
  ctx: WriteCtx,
  input: RecordFluidInput,
): Promise<WriteResult> {
  requireCadre(ctx, RECORDING_CADRES, "record fluid balance");
  const replay = await replayed(ctx.tx, fluidBalanceEntries, input.clientKey, input.patientUserId);
  if (replay) return { id: replay };
  const encounter = await openEncounter(ctx, input.patientUserId, input.encounterId);
  await openFluidChart(ctx, encounter.id);
  const values = await checkedValues(ctx, { ...input, encounterId: encounter.id });
  const [row] = await ctx.tx
    .insert(fluidBalanceEntries)
    .values({
      hospitalId: ctx.actor.hospitalId,
      patientUserId: input.patientUserId,
      encounterId: encounter.id,
      kind: input.kind,
      ...values,
      recordedAt: ctx.now,
      recordedByUserId: ctx.actor.userId,
      state: "recorded",
      clientKey: input.clientKey,
    })
    .returning({ id: fluidBalanceEntries.id });
  await stampActivity(ctx, encounter.id);
  return { id: row!.id };
}

/* ─── correctFluidEntry ──────────────────────────────────────────── */

/**
 * A correction (new values, same kind) or entered in error (no volume, a reason code), as a new
 * row that names the entry it replaces. An entry is replaced at most once; a withdrawn entry
 * cannot be corrected, and a correction can itself be corrected or withdrawn.
 */
export async function correctFluidEntry(
  ctx: WriteCtx,
  input: CorrectFluidInput,
): Promise<WriteResult> {
  requireCadre(ctx, RECORDING_CADRES, "correct fluid balance");
  const replay = await replayed(ctx.tx, fluidBalanceEntries, input.clientKey, input.patientUserId);
  if (replay) return { id: replay };
  const [original] = await ctx.tx
    .select()
    .from(fluidBalanceEntries)
    .where(
      and(
        eq(fluidBalanceEntries.id, input.entryId),
        eq(fluidBalanceEntries.patientUserId, input.patientUserId),
        eq(fluidBalanceEntries.hospitalId, ctx.actor.hospitalId),
      ),
    );
  if (!original || original.state !== "recorded")
    throw new EmrWriteError("not_found", "That entry is not on this patient's fluid chart.");
  const [later] = await ctx.tx
    .select({ id: fluidBalanceEntries.id })
    .from(fluidBalanceEntries)
    .where(eq(fluidBalanceEntries.replacesId, original.id))
    .limit(1);
  if (later)
    throw new EmrWriteError(
      "conflict",
      "That entry has already been corrected or withdrawn: reload the chart.",
    );
  await openEncounter(ctx, input.patientUserId, original.encounterId);
  await openFluidChart(ctx, original.encounterId);

  const common = {
    hospitalId: ctx.actor.hospitalId,
    patientUserId: input.patientUserId,
    encounterId: original.encounterId,
    kind: original.kind,
    recordedAt: ctx.now,
    recordedByUserId: ctx.actor.userId,
    replacesId: original.id,
    clientKey: input.clientKey,
  };
  let values: typeof fluidBalanceEntries.$inferInsert;
  if (input.enteredInError) {
    if (!FLUID_ERROR_REASONS.includes(input.reasonCode))
      throw new EmrWriteError("invalid", "Choose why the entry was in error.");
    values = {
      ...common,
      state: "entered_in_error",
      volumeMl: null,
      measured: original.measured,
      effectiveAt: original.effectiveAt,
      reasonCode: input.reasonCode,
    };
  } else {
    const checked = await checkedValues(ctx, {
      patientUserId: input.patientUserId,
      encounterId: original.encounterId,
      kind: original.kind as FluidKind,
      volumeMl: input.volumeMl,
      measured: input.measured,
      effectiveAt: input.effectiveAt ?? original.effectiveAt,
      prescriptionId:
        input.prescriptionId === undefined ? original.prescriptionId : input.prescriptionId,
      routeDetail:
        input.routeDetail === undefined
          ? (original.routeDetail as RouteDetail | null)
          : input.routeDetail,
    });
    values = { ...common, ...checked, state: "recorded" };
  }
  const [row] = await ctx.tx
    .insert(fluidBalanceEntries)
    .values(values)
    .returning({ id: fluidBalanceEntries.id });
  await stampActivity(ctx, original.encounterId);
  return { id: row!.id };
}
