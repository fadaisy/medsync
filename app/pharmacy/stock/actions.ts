"use server";

import type { StockResult } from "@/lib/pharmacy/stock/store";
import type { PharmacyCtx, PharmacyNeed } from "@/lib/pharmacy/write";
import type { z } from "zod";
import { refresh } from "next/cache";
import { unstable_rethrow } from "next/navigation";

import { STOCK } from "@/content/pharmacy-stock";
import { logger } from "@/lib/logger";
import { requirePharmacyActor } from "@/lib/pharmacy/actor";
import { pharmacyDispensingLiveFor } from "@/lib/pharmacy/feature";
import * as store from "@/lib/pharmacy/stock/store";
import { runPharmacyWrite } from "@/lib/pharmacy/write";

/**
 * Stock actions (Pharmacy Phase 1, Section 8, 5.8). The house contract: Zod with a client key → the
 * actor (auth, AAL2, the pharmacy affiliation, the acting point) → `pharmacyDispensing` for the
 * hospital → the permission and the point inside one transaction (`runPharmacyWrite`, PA2-4) → the
 * page refreshed in the same response. A refusal comes back in words; nothing throws to the client.
 */
async function act<I, R extends { id: string }>(
  schema: z.ZodType<I>,
  raw: unknown,
  need: PharmacyNeed,
  write: (ctx: PharmacyCtx, input: I) => Promise<R>,
): Promise<StockResult<R>> {
  try {
    const actor = await requirePharmacyActor();
    if (!pharmacyDispensingLiveFor(actor.hospitalId))
      return { ok: false, code: "config", error: STOCK.flagOff };
    const result = await runPharmacyWrite(schema, raw, actor, need, write);
    if (!result.ok) return result;
    refresh();
    return { ...result, refreshed: true };
  } catch (e) {
    unstable_rethrow(e);
    logger.error("pharmacy.stock.action_failed", {
      error: e instanceof Error ? e.message : String(e),
    });
    return { ok: false, code: "conflict", error: STOCK.failed };
  }
}

export async function receiveDelivery(raw: unknown) {
  return act(store.DeliveryInput, raw, store.STOCK_NEED, store.receiveDelivery);
}

export async function receiveStock(raw: unknown) {
  return act(store.ReceiveInput, raw, store.STOCK_NEED, store.receiveStock);
}
export async function addBatchFoundOnShelf(raw: unknown) {
  return act(store.FoundInput, raw, store.STOCK_NEED, store.addBatchFoundOnShelf);
}
export async function recordCount(raw: unknown) {
  return act(store.CountInput, raw, store.STOCK_NEED, store.recordCount);
}
export async function adjustStock(raw: unknown) {
  return act(store.AdjustInput, raw, store.STOCK_NEED, store.adjustStock);
}
export async function transferStock(raw: unknown) {
  return act(store.TransferInput, raw, store.STOCK_NEED, store.transferStock);
}
export async function requestStock(raw: unknown) {
  return act(store.RequestInput, raw, store.STOCK_NEED, store.requestStock);
}
export async function closeStockRequest(raw: unknown) {
  return act(store.CloseRequestInput, raw, store.STOCK_NEED, store.closeStockRequest);
}
export async function addProduct(raw: unknown) {
  return act(store.ProductInput, raw, store.STOCK_NEED, store.addProduct);
}
export async function setProductPrice(raw: unknown) {
  return act(store.PriceInput, raw, store.MANAGE, store.setProductPrice);
}
export async function setReorderLevel(raw: unknown) {
  return act(store.LevelInput, raw, store.MANAGE_AT_POINT, store.setReorderLevel);
}
export async function setCountFreshness(raw: unknown) {
  return act(store.FreshnessInput, raw, store.MANAGE_AT_POINT, store.setCountFreshness);
}
export async function correctBatchDetails(raw: unknown) {
  return act(store.CorrectInput, raw, store.MANAGE_AT_POINT, store.correctBatchDetails);
}
