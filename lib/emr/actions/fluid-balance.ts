"use server";

import { z } from "zod";

import { clerkingPlanV2LiveFor } from "@/lib/emr/feature";
import { EmrWriteError } from "@/lib/emr/write/context";
import * as fluids from "@/lib/emr/write/fluid-balance";
import { runEmrWrite } from "@/lib/emr/write/orders";

/**
 * Fluid balance from the nurse's chart (ADR 0189). Each action: Zod → requireEmrActor("nurse") →
 * EMR_V1 and CLERKING_PLAN_V2 for the hospital → one transaction with the access check → lib/emr/write/fluid-balance.ts.
 * Idempotent on the client key; append-only and audited by the 0089 triggers.
 */

const uuid = z.uuid();
const clientKey = z.string().trim().min(8).max(120);
const base = { surface: z.literal("nurse"), patientUserId: uuid, clientKey };
const values = {
  volumeMl: z.number().min(0).max(fluids.MAX_ENTRY_ML).nullable().optional(),
  measured: z.boolean().optional(),
  effectiveAt: z.coerce.date().optional(),
  prescriptionId: uuid.nullable().optional(),
  routeDetail: z.enum(fluids.ROUTE_DETAILS).nullable().optional(),
};

const RecordFluid = z.object({
  ...base,
  ...values,
  encounterId: uuid,
  kind: z.enum(fluids.FLUID_KINDS),
});

const CorrectFluid = z.union([
  z.object({
    ...base,
    entryId: uuid,
    enteredInError: z.literal(true),
    reasonCode: z.enum(fluids.FLUID_ERROR_REASONS, { error: "Choose why the entry was in error." }),
  }),
  z.object({ ...base, ...values, entryId: uuid, enteredInError: z.literal(false).optional() }),
]);

const OFF = "Monitoring charts are not switched on here.";

export async function recordFluidEntry(raw: unknown) {
  return runEmrWrite(RecordFluid, raw, (ctx, input) => {
    if (!clerkingPlanV2LiveFor(ctx.actor.hospitalId)) throw new EmrWriteError("config", OFF);
    return fluids.recordFluidEntry(ctx, input);
  });
}

export async function correctFluidEntry(raw: unknown) {
  return runEmrWrite(CorrectFluid, raw, (ctx, input) => {
    if (!clerkingPlanV2LiveFor(ctx.actor.hospitalId)) throw new EmrWriteError("config", OFF);
    return fluids.correctFluidEntry(ctx, input);
  });
}
