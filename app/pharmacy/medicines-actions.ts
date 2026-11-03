"use server";

import type { PharmacyCtx, PharmacyNeed } from "@/lib/pharmacy/write";
import type { z } from "zod";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";

import { MEDICINES } from "@/content/pharmacy-medicines";
import { logger } from "@/lib/logger";
import { requirePharmacyActor } from "@/lib/pharmacy/actor";
import { loadLineHistory, missingMigration } from "@/lib/pharmacy/medicines/read";
import * as m from "@/lib/pharmacy/medicines/store";
import { runPharmacyWrite } from "@/lib/pharmacy/write";

/**
 * Set-up › Medicines and Stock › Medicines (MEDICINES-TAB.md §16): the house contract (Zod → the actor → one
 * transaction with the permission → both pages revalidated). Before 0270 is applied every action says so in words.
 */
async function act<I, R extends { id: string }>(
  name: string,
  schema: z.ZodType<I>,
  raw: unknown,
  need: PharmacyNeed,
  write: (ctx: PharmacyCtx, input: I) => Promise<R>,
): ReturnType<typeof runPharmacyWrite<I, R>> {
  try {
    const r = await runPharmacyWrite(schema, raw, await requirePharmacyActor(), need, write);
    if (r.ok) {
      revalidatePath("/pharmacy/setup");
      revalidatePath("/pharmacy/stock", "layout");
    }
    return r;
  } catch (e) {
    unstable_rethrow(e);
    if (missingMigration(e))
      return { ok: false, code: "config", error: MEDICINES.refused.migration };
    const code =
      (e as { code?: string; cause?: { code?: string } })?.code ??
      (e as { cause?: { code?: string } })?.cause?.code;
    if (code === "23505")
      return { ok: false, code: "conflict", error: MEDICINES.refused.duplicate };
    logger.error("pharmacy.medicines.action_failed", {
      action: name,
      error: e instanceof Error ? e.name : "unknown",
    });
    return { ok: false, code: "conflict", error: MEDICINES.refused.failed };
  }
}

const N = m.MED_NEED;
const V = m.VIEW_NEED;

export const saveLineAction = async (raw: unknown) =>
  act("saveLine", m.SaveLineInput, raw, N, m.saveLine);
export const markReviewedAction = async (raw: unknown) =>
  act("markReviewed", m.LineInput, raw, N, m.markReviewed);
export const stopStockingAction = async (raw: unknown) =>
  act("stopStocking", m.LineInput, raw, N, m.stopStocking);
export const setLineCellAction = async (raw: unknown) =>
  act("setLineCell", m.LineCellInput, raw, N, m.setLineCell);
export const addFromCatalogueAction = async (raw: unknown) =>
  act("addLinesFromCatalogue", m.CatalogueAddInput, raw, N, m.addLinesFromCatalogue);
export const addLocalLineAction = async (raw: unknown) =>
  act("addLocalLine", m.LocalInput, raw, N, m.addLocalLine);
export const addPayerAction = async (raw: unknown) =>
  act("addPayer", m.PayerInput, raw, N, m.addPayer);
export const setPriceRuleAction = async (raw: unknown) =>
  act("setPriceRule", m.RulePctInput, raw, N, m.setPriceRulePct);
export const bulkSetVenAction = async (raw: unknown) =>
  act("bulkSetVen", m.BulkVenInput, raw, N, m.bulkSetVen);
export const bulkSetLevelAction = async (raw: unknown) =>
  act("bulkSetLevel", m.BulkLevelInput, raw, N, m.bulkSetLevel);
export const bulkMarkFreeAction = async (raw: unknown) =>
  act("bulkMarkFree", m.BulkFreeInput, raw, N, m.bulkMarkFree);
export const requestTopUpsAction = async (raw: unknown) =>
  act("requestTopUps", m.TopUpInput, raw, N, m.requestTopUps);
export const undoTopUpAction = async (raw: unknown) =>
  act("undoTopUp", m.UndoTopUpInput, raw, N, m.undoTopUp);
export const proposeRuleAction = async (raw: unknown) =>
  act("proposeRuleChange", m.ProposeInput, raw, N, m.proposeRuleChange);
export const signRuleAction = async (raw: unknown) =>
  act("signRuleProposal", m.SignInput, raw, V, m.signRuleProposal);
export const withdrawRuleAction = async (raw: unknown) =>
  act("withdrawRuleProposal", m.LineInput, raw, N, m.withdrawRuleProposal);
export const saveViewAction = async (raw: unknown) =>
  act("saveView", m.ViewInput, raw, V, m.saveView);
export const deleteViewAction = async (raw: unknown) =>
  act("deleteView", m.LineInput, raw, V, m.deleteView);

/** Reads for the dialogs: the master catalogue and one line's history. */
export async function catalogueAction() {
  return act("catalogue", m.BulkFreeInput.partial(), {}, V, async (ctx) => ({
    id: ctx.actor.hospitalId,
    items: await m.catalogueItems(ctx),
  }));
}

export async function lineHistoryAction(productId: string) {
  try {
    const actor = await requirePharmacyActor();
    return await loadLineHistory(actor.hospitalId, productId);
  } catch (e) {
    unstable_rethrow(e);
    return [];
  }
}
