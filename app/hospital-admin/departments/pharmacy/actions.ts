"use server";

import type { EmrTx } from "@/lib/emr/db";
import type { ActionResult } from "@/lib/emr/write/context";
import type { Admin } from "@/lib/pharmacy/golive/store";
import type { z } from "zod";
import { refresh } from "next/cache";
import { unstable_rethrow } from "next/navigation";

import { GOLIVE } from "@/content/pharmacy-golive";
import { asClinicalWriter } from "@/lib/emr/db";
import { actionError } from "@/lib/emr/write/context";
import { requireHospitalAdminScope } from "@/lib/hospital-admin/scope";
import { logger } from "@/lib/logger";
import { pharmacyDispensingLiveFor } from "@/lib/pharmacy/feature";
import * as store from "@/lib/pharmacy/golive/store";

/**
 * Going live and the pharmacy settings (Pharmacy Phase 1, Section 8 "Going live"; 5.13, RD-1 to RD-5,
 * D-PH1-05). The house contract: Zod → the hospital-admin scope (auth, AAL2, the hospital, never a
 * client value) → `pharmacyDispensing` for the hospital → one transaction as the admin, so the audit
 * triggers stamp who did it → the page refreshed. Two-person rules are the store's and the database's.
 */
async function asAdmin<I>(
  schema: z.ZodType<I>,
  raw: unknown,
  write: (tx: EmrTx, admin: Admin, input: I, now: Date) => Promise<string>,
): Promise<ActionResult> {
  const parsed = schema.safeParse(raw);
  if (!parsed.success)
    return {
      ok: false,
      code: "invalid",
      error: parsed.error.issues[0]?.message ?? "Invalid input.",
    };
  try {
    const scope = await requireHospitalAdminScope();
    if (!pharmacyDispensingLiveFor(scope.hospitalId))
      return { ok: false, code: "config", error: GOLIVE.flagOff };
    const admin = { userId: scope.userId, hospitalId: scope.hospitalId };
    const id = await asClinicalWriter(admin, (tx) => write(tx, admin, parsed.data, new Date()));
    refresh();
    return { ok: true, id, serverTime: new Date().toISOString() };
  } catch (e) {
    unstable_rethrow(e);
    const words = store.settingsRefusal(e);
    if (words) return { ok: false, code: "conflict", error: words };
    const r = actionError(e);
    if (!r.ok && r.code !== "invalid" && r.code !== "conflict" && r.code !== "forbidden")
      logger.error("pharmacy.golive.action_failed", { code: r.code });
    return r;
  }
}

export async function requestGoLive(raw: unknown) {
  return asAdmin(store.PointInput, raw, (tx, a, i, now) =>
    store.requestGoLive(tx, a, i.pointId, now),
  );
}
export async function approveGoLive(raw: unknown) {
  return asAdmin(store.RequestInput, raw, (tx, a, i, now) =>
    store.approveGoLive(tx, a, i.requestId, now),
  );
}
export async function requestSwitchOff(raw: unknown) {
  return asAdmin(store.SwitchOffInput, raw, store.requestSwitchOff);
}
export async function approveSwitchOff(raw: unknown) {
  return asAdmin(store.RequestInput, raw, (tx, a, i, now) =>
    store.approveSwitchOff(tx, a, i.requestId, now),
  );
}
export async function withdrawGoLiveRequest(raw: unknown) {
  return asAdmin(store.RequestInput, raw, (tx, a, i, now) =>
    store.withdrawRequest(tx, a, i.requestId, now),
  );
}
export async function recordBriefing(raw: unknown) {
  return asAdmin(store.BriefingInput, raw, store.recordBriefing);
}
export async function recordLegalAnswer(raw: unknown) {
  return asAdmin(store.LegalAnswerInput, raw, store.recordLegalAnswer);
}
export async function recordPilotNote(raw: unknown) {
  return asAdmin(store.PilotNoteInput, raw, store.recordPilotNote);
}
export async function updatePointSettings(raw: unknown) {
  return asAdmin(store.PointSettingsInput, raw, (tx, a, i) => store.updatePointSettings(tx, a, i));
}
export async function updatePharmacySettings(raw: unknown) {
  return asAdmin(store.HospitalSettingsInput, raw, (tx, a, i, now) =>
    store.updateHospitalSettings(tx, a, i, now),
  );
}
export async function setSupplyWithoutPharmacist(raw: unknown) {
  return asAdmin(store.WithoutPharmacistInput, raw, (tx, a, i, now) =>
    store.setSupplyWithoutPharmacist(tx, a, i.step, now),
  );
}
