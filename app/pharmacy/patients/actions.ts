"use server";

import type { PharmacyActor, runPharmacyWrite } from "@/lib/pharmacy/write";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";

import { PRW } from "@/content/pharmacy-rework-patients";
import { logger } from "@/lib/logger";
import { requirePharmacyActor } from "@/lib/pharmacy/actor";
import * as cold from "@/lib/pharmacy/cold/store";
import * as epi from "@/lib/pharmacy/epi/store";
import { pharmacyTiersFor } from "@/lib/pharmacy/feature";
import * as op from "@/lib/pharmacy/op/store";
import { smsSender } from "@/lib/pharmacy/sms-sender";
import * as sms from "@/lib/pharmacy/sms/store";
import * as wards from "@/lib/pharmacy/wards/store";

/**
 * Patients and cold chain (rework PRD §6.3, §6.4): the house contract. The actor → the tier → the store's own
 * transaction (Zod, the permission, the 0265/0268 guards in words). Every write lives in the lib stores.
 */
type Tier = "core" | "wards" | "epi";
/** The write path's result (named here without importing the EMR write module into a pharmacy route). */
type ActionResult<R> = Awaited<ReturnType<typeof runPharmacyWrite<unknown, R & { id: string }>>>;
async function act<R extends { id: string }>(
  tier: Tier,
  write: (actor: PharmacyActor) => Promise<ActionResult<R>>,
): Promise<ActionResult<{ id: string }>> {
  try {
    const actor = await requirePharmacyActor();
    if (!pharmacyTiersFor(actor.hospitalId)[tier])
      return { ok: false, code: "config", error: PRW.common.tierOff };
    const r = await write(actor);
    if (r.ok) revalidatePath("/pharmacy", "layout");
    return r.ok ? { ok: true, id: r.id, serverTime: r.serverTime, data: { id: r.id } } : r;
  } catch (e) {
    unstable_rethrow(e);
    logger.error("pharmacy.patients.action_failed", {
      error: e instanceof Error ? e.name : "unknown",
    });
    return { ok: false, code: "conflict", error: PRW.common.failed };
  }
}

/* Cold chain (the store's tab and the EPI fridge). */
export async function coldReadingAction(raw: unknown) {
  return act("core", (a) => cold.recordReading(a, raw));
}
export async function coldAckAction(raw: unknown) {
  return act("core", (a) => cold.ackExcursion(a, raw));
}
export async function coldAddAction(raw: unknown) {
  return act("core", (a) => cold.addToFridge(a, raw));
}
export async function coldTakeOutAction(raw: unknown) {
  return act("core", (a) => cold.takeOutOfFridge(a, raw));
}

/* Immunisation. */
export async function epiRegisterAction(raw: unknown) {
  return act("epi", (a) => epi.registerClient(a, raw));
}
export async function epiVaccinateAction(raw: unknown) {
  return act("epi", (a) => epi.vaccinate(a, raw));
}
export async function epiDiscardVialAction(raw: unknown) {
  return act("epi", (a) => epi.discardVial(a, raw));
}
export async function epiVvmAction(raw: unknown) {
  return act("epi", (a) => epi.recordVvm(a, raw));
}

/* Inpatients. */
export async function wardPickAction(raw: unknown) {
  return act("wards", (a) => wards.sendPick(a, raw));
}
export async function wardNoteAction(raw: unknown) {
  return act("wards", (a) => wards.addNote(a, raw));
}

/* Outpatients. */
export async function opPillCountAction(raw: unknown) {
  return act("core", (a) => op.recordPillCount(a, raw));
}
export async function opCheckInAction(raw: unknown) {
  return act("core", (a) => op.recordCheckIn(a, raw));
}

/* Reminders. */
export async function smsBuildAction() {
  return act("core", (a) => sms.buildToday(a, {}));
}
export async function smsMessageAction(raw: unknown) {
  return act("core", (a) => sms.actOnMessage(a, raw, smsSender()));
}
export async function smsSendAllAction(raw: unknown) {
  return act("core", (a) => sms.sendAll(a, raw, smsSender()));
}
export async function smsRuleAction(raw: unknown) {
  return act("core", (a) => sms.setRule(a, raw));
}
