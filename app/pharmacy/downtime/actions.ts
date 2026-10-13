"use server";

import type { StockResult } from "@/lib/pharmacy/stock/store";
import type { PharmacyCtx, PharmacyNeed } from "@/lib/pharmacy/write";
import type { z } from "zod";
import { refresh } from "next/cache";
import { unstable_rethrow } from "next/navigation";

import { DOWNTIME_PAGE } from "@/content/pharmacy-golive";
import { logger } from "@/lib/logger";
import { requirePharmacyActor } from "@/lib/pharmacy/actor";
import * as store from "@/lib/pharmacy/downtime-store";
import { pharmacyDowntimeLiveFor } from "@/lib/pharmacy/feature";
import { runPharmacyWrite } from "@/lib/pharmacy/write";

/**
 * Downtime set-up actions (Pharmacy Phase 1, Section 8 "Downtime"; 5.12). The house contract: Zod →
 * the actor (auth, AAL2, the pharmacy affiliation, the acting point) → `pharmacyDowntime` for the
 * hospital → the permission and the point inside one transaction (`runPharmacyWrite`, PA2-4).
 * Reserving and drills are `pharmacy.dispense`; a period and a void are `pharmacy.manage` (DT-4).
 */
async function act<I, R extends { id: string }>(
  schema: z.ZodType<I>,
  raw: unknown,
  need: PharmacyNeed,
  write: (ctx: PharmacyCtx, input: I) => Promise<R>,
  reload = true,
): Promise<StockResult<R>> {
  try {
    const actor = await requirePharmacyActor();
    if (!pharmacyDowntimeLiveFor(actor.hospitalId))
      return { ok: false, code: "config", error: DOWNTIME_PAGE.flagOff };
    const result = await runPharmacyWrite(schema, raw, actor, need, write);
    if (result.ok && reload) refresh();
    return result;
  } catch (e) {
    unstable_rethrow(e);
    logger.error("pharmacy.downtime.action_failed", {
      error: e instanceof Error ? e.message : String(e),
    });
    return { ok: false, code: "conflict", error: DOWNTIME_PAGE.failed };
  }
}

/** Reserves the run; the page then opens the sheets to print (a full load, so no refresh here). */
export async function reserveSheetNumbers(raw: unknown) {
  return act(store.ReserveInput, raw, store.SHEETS_NEED, store.reserveSheetNumbers, false);
}
export async function recordDowntime(raw: unknown) {
  return act(store.PeriodInput, raw, store.MANAGE_SHEETS_NEED, store.recordDowntime);
}
export async function voidSheetNumber(raw: unknown) {
  return act(store.VoidInput, raw, store.MANAGE_SHEETS_NEED, store.voidSheetNumber);
}
export async function recordDrill(raw: unknown) {
  return act(store.DrillInput, raw, store.SHEETS_NEED, store.recordDrill);
}
