"use server";

import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";

import { RC } from "@/content/pharmacy-rework-records";
import { logger } from "@/lib/logger";
import * as g from "@/lib/pharmacy/actions/setup/golive";
import * as m from "@/lib/pharmacy/actions/setup/messages";
import * as p from "@/lib/pharmacy/actions/setup/places";
import * as r from "@/lib/pharmacy/actions/setup/rules";
import { requirePharmacyActor } from "@/lib/pharmacy/actor";

/** Set-up › Going live, Places, Rules and Messages (SETUP-TABS §G): the session user acts; every check runs again on the server. */
type Act = (
  actor: Awaited<ReturnType<typeof requirePharmacyActor>>,
  raw: unknown,
) => Promise<{ ok: boolean }>;
const run = async <F extends Act>(fn: F, raw: unknown): Promise<Awaited<ReturnType<F>>> => {
  try {
    const out = (await fn(await requirePharmacyActor(), raw)) as Awaited<ReturnType<F>>;
    if (out.ok) revalidatePath("/pharmacy/setup");
    return out;
  } catch (e) {
    unstable_rethrow(e);
    logger.error("pharmacy.setup.action_failed", {
      error: e instanceof Error ? e.name : "unknown",
    });
    return { ok: false, code: "conflict", error: RC.refused.failed } as Awaited<ReturnType<F>>;
  }
};

export const setGoLiveDateAction = async (raw: unknown) => run(g.setGoLiveDate, raw);
export const recordAnswerAction = async (raw: unknown) => run(g.recordAnswer, raw);
export const markItemAction = async (raw: unknown) => run(g.markItem, raw);
export const unmarkItemAction = async (raw: unknown) => run(g.unmarkItem, raw);
export const setItemOwnerAction = async (raw: unknown) => run(g.setItemOwner, raw);
export const startPracticeAction = async (raw: unknown) => run(g.startPractice, raw);
export const endPracticeAction = async (raw: unknown) => run(g.endPractice, raw);
export const retirePaperAction = async (raw: unknown) => run(g.retirePaper, raw);
export const practiceDispenseAction = async (raw: unknown) => run(g.practiceDispense, raw);
export const signGoLiveAction = async (raw: unknown) => run(g.signGoLive, raw);

export const addPlaceAction = async (raw: unknown) => run(p.addPlace, raw);
export const updatePlaceAction = async (raw: unknown) => run(p.updatePlace, raw);
export const setHandoverSlotsAction = async (raw: unknown) => run(p.setHandoverSlots, raw);
export const closePlaceAction = async (raw: unknown) => run(p.closePlace, raw);
export const reopenPlaceAction = async (raw: unknown) => run(p.reopenPlace, raw);
export const addFridgeAction = async (raw: unknown) => run(p.addFridge, raw);
export const moveFridgeAction = async (raw: unknown) => run(p.moveFridge, raw);
export const linkSensorAction = async (raw: unknown) => run(p.linkSensor, raw);
export const unlinkSensorAction = async (raw: unknown) => run(p.unlinkSensor, raw);
export const recordReadingAction = async (raw: unknown) => run(p.recordReading, raw);
export const upsertSupplierAction = async (raw: unknown) => run(p.upsertSupplier, raw);

export const proposeNewRuleAction = async (raw: unknown) => run(r.proposeNewRule, raw);
export const rejectProposalAction = async (raw: unknown) => run(r.rejectProposal, raw);
export const signGroupAction = async (raw: unknown) => run(r.signGroup, raw);

export const connectProviderAction = async (raw: unknown) => run(m.connectProvider, raw);
export const disconnectProviderAction = async (raw: unknown) => run(m.disconnectProvider, raw);
export const sendTestAction = async (raw: unknown) => run((a, x) => m.sendTest(a, x), raw);
export const toggleTemplateAction = async (raw: unknown) => run(m.toggleTemplate, raw);
export const updateTemplateAction = async (raw: unknown) => run(m.updateTemplate, raw);
export const markLugandaCheckedAction = async (raw: unknown) => run(m.markLugandaChecked, raw);
export const retryMessageAction = async (raw: unknown) => run((a, x) => m.retryMessage(a, x), raw);
export const optOutAction = async (raw: unknown) => run(m.optOut, raw);
export const optInAction = async (raw: unknown) => run(m.optIn, raw);
export const setBudgetAction = async (raw: unknown) => run(m.setBudget, raw);
