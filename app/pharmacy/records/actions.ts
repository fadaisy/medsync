"use server";

import type { PharmacyCtx, PharmacyNeed } from "@/lib/pharmacy/write";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";

import { RC } from "@/content/pharmacy-rework-records";
import { logger } from "@/lib/logger";
import { requirePharmacyActor } from "@/lib/pharmacy/actor";
import { appDb, otherBatches } from "@/lib/pharmacy/audit/read";
import * as audit from "@/lib/pharmacy/audit/store";
import { pharmacyTiersFor } from "@/lib/pharmacy/feature";
import * as reports from "@/lib/pharmacy/reports/store";
import { runPharmacyWrite } from "@/lib/pharmacy/write";

/**
 * Records (rework PRD §6.6; TECH-SPEC §4 Records): correct a movement, act on stock at risk, check and submit a
 * report. The house contract: Zod → the actor → one transaction (`runPharmacyWrite`); the store holds every write.
 */
async function act<I, R extends { id: string }>(
  schema: z.ZodType<I>,
  raw: unknown,
  need: PharmacyNeed,
  write: (ctx: PharmacyCtx, input: I) => Promise<R>,
) {
  try {
    const actor = await requirePharmacyActor();
    if (!pharmacyTiersFor(actor.hospitalId).core)
      return { ok: false as const, code: "config", error: RC.refused.failed };
    const r = await runPharmacyWrite(schema, raw, actor, need, write);
    if (r.ok) revalidatePath("/pharmacy", "layout");
    return r;
  } catch (e) {
    unstable_rethrow(e);
    logger.error("pharmacy.records.action_failed", {
      error: e instanceof Error ? e.name : "unknown",
    });
    return { ok: false as const, code: "conflict", error: RC.refused.failed };
  }
}

export async function correctMovementAction(raw: unknown) {
  return act(audit.CorrectInput, raw, audit.CORRECT_NEED, audit.correctMovement);
}

export async function riskActionAction(raw: unknown) {
  return act(audit.RiskInput, raw, audit.RISK_NEED, audit.riskAction);
}

export async function checkReportAction(raw: unknown) {
  return act(reports.CheckInput, raw, reports.REPORT_NEED, reports.checkReport);
}

export async function submitReportAction(raw: unknown) {
  return act(reports.SubmitInput, raw, reports.REPORT_NEED, reports.submitReport);
}

/** The batches "Wrong batch" offers as chips (a read; no write). */
export async function otherBatchesAction(movementId: string) {
  try {
    const actor = await requirePharmacyActor();
    return await otherBatches(appDb(), actor.hospitalId, z.uuid().parse(movementId));
  } catch (e) {
    unstable_rethrow(e);
    return [];
  }
}
