"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";

import { RC } from "@/content/pharmacy-rework-records";
import { logger } from "@/lib/logger";
import * as bring from "@/lib/pharmacy/actions/store/bring-in";
import * as look from "@/lib/pharmacy/actions/store/look-after";
import * as send from "@/lib/pharmacy/actions/store/send-out";
import { requirePharmacyActor } from "@/lib/pharmacy/actor";

/** Stock › Main store (STORE.md §I): the session user acts; every check runs again on the server. */
type Act = (
  actor: Awaited<ReturnType<typeof requirePharmacyActor>>,
  raw: unknown,
) => Promise<{ ok: boolean }>;
const run = async <F extends Act>(fn: F, raw: unknown): Promise<Awaited<ReturnType<F>>> => {
  try {
    const out = (await fn(await requirePharmacyActor(), raw)) as Awaited<ReturnType<F>>;
    if (out.ok) revalidatePath("/pharmacy/stock/store");
    return out;
  } catch (e) {
    unstable_rethrow(e);
    logger.error("pharmacy.store.action_failed", {
      error: e instanceof Error ? e.name : "unknown",
    });
    return { ok: false, code: "conflict", error: RC.refused.failed } as Awaited<ReturnType<F>>;
  }
};

export const issueRequisitionAction = async (raw: unknown) => run(send.issueRequisition, raw);
export const sendUrgentAction = async (raw: unknown) => run(send.sendUrgent, raw);
export const sendTopUpRunAction = async (raw: unknown) => run(send.sendTopUpRun, raw);
export const saveTopUpRunAction = async (raw: unknown) => run(send.saveTopUpRun, raw);
export const arrangeTransferAction = async (raw: unknown) => run(send.arrangeTransfer, raw);
export const issueWithoutRequisitionAction = async (raw: unknown) =>
  run(send.issueWithoutRequisition, raw);
export const confirmDispatchAction = async (raw: unknown) => run(send.confirmDispatch, raw);
export const acceptReturnAction = async (raw: unknown) => run(send.acceptReturn, raw);
export const openBalanceCaseAction = async (raw: unknown) => run(send.openBalanceCase, raw);
export const setOrderQtyAction = async (raw: unknown) => run(bring.setOrderQty, raw);
export const setBudgetAction = async (raw: unknown) => run(bring.setBudget, raw);
export const trimOrderAction = async (raw: unknown) => run(bring.trimOrder, raw);
export const sendOrderAction = async (raw: unknown) => run(bring.sendOrder, raw);
export const putAwayAction = async (raw: unknown) => run(bring.putAway, raw);
export const undoPutAwayAction = async (raw: unknown) => run(bring.undoPutAway, raw);
export const sendStraightAction = async (raw: unknown) => run(bring.sendStraight, raw);
export const expiryActionAction = async (raw: unknown) => run(look.expiryAction, raw);
export const moveToQuarantineAction = async (raw: unknown) => run(look.moveToQuarantine, raw);
export const saveCountAction = async (raw: unknown) => run(look.saveCount, raw);
export const signOffCountAction = async (raw: unknown) => run(look.signOffCount, raw);
export const startStocktakeAction = async (raw: unknown) => run(look.startStocktake, raw);
export const closeStocktakeAction = async (raw: unknown) => run(look.closeStocktake, raw);
export const saveShelfAction = async (raw: unknown) => run(look.saveShelf, raw);
export const quarantineDecideAction = async (raw: unknown) => run(look.quarantineDecide, raw);
export const recordLossAction = async (raw: unknown) => run(look.recordLoss, raw);
export const recordRoomReadingAction = async (raw: unknown) => run(look.recordRoomReading, raw);
