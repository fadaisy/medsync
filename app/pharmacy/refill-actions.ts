"use server";

import type { ReviewResult as ActionResult } from "@/lib/pharmacy/review/store";
import type { PharmacyCtx, PharmacyNeed } from "@/lib/pharmacy/write";
import type { z } from "zod";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";

import { REVIEW } from "@/content/pharmacy-review";
import { logger } from "@/lib/logger";
import { requirePharmacyActor } from "@/lib/pharmacy/actor";
import { pharmacyRefillsLiveFor } from "@/lib/pharmacy/feature";
import * as store from "@/lib/pharmacy/refill-store";
import { runPharmacyWrite } from "@/lib/pharmacy/write";

/**
 * Refills at the pharmacy (Pharmacy Phase 4, 5.5; Section 8). The house contract: Zod with a client key → the actor
 * (auth, AAL2, the affiliation, the acting point) → `pharmacyRefills` for the hospital → the permission and the point
 * inside one transaction → the pharmacy pages revalidated. A refusal comes back in words; nothing throws to the client.
 * The typed date of birth or phone check is Phase 1's `checkSecondIdentifier` (app/pharmacy/supply-actions.ts).
 */

async function act<I, R extends { id: string }>(
  schema: z.ZodType<I>,
  raw: unknown,
  need: PharmacyNeed,
  write: (ctx: PharmacyCtx, input: I) => Promise<R>,
): Promise<ActionResult> {
  try {
    const actor = await requirePharmacyActor();
    if (!pharmacyRefillsLiveFor(actor.hospitalId))
      return { ok: false, code: "config", error: REVIEW.refused.flagOff };
    const r = await runPharmacyWrite(schema, raw, actor, need, write);
    if (r.ok) revalidatePath("/pharmacy", "layout");
    return r.ok ? { ok: true, id: r.id, serverTime: r.serverTime } : r;
  } catch (e) {
    unstable_rethrow(e);
    logger.error("pharmacy.refills.action_failed", {
      error: e instanceof Error ? e.message : String(e),
    });
    return { ok: false, code: "conflict", error: REVIEW.refused.failed };
  }
}

/** A request taken at the window or by phone, for the patient standing there (5.5). */
export const requestRefillAtWindow = async (raw: unknown) =>
  act(store.RequestRefillInput, raw, store.DISPENSE_POINT, (ctx, input) =>
    store.requestRefill(store.writerOf(ctx), input, "window"),
  );
export const setAsideRefill = async (raw: unknown) =>
  act(store.SetAsideInput, raw, store.DISPENSE_POINT, store.setAsideRefill);
export const releasePrepared = async (raw: unknown) =>
  act(store.ReleaseInput, raw, store.DISPENSE_POINT, store.releasePrepared);
export const holdPreparedLonger = async (raw: unknown) =>
  act(store.HoldLongerInput, raw, store.DISPENSE_POINT, store.holdPreparedLonger);
export const handOverPrepared = async (raw: unknown) =>
  act(store.HandOverInput, raw, store.DISPENSE_POINT, store.handOverPrepared);
export const askClinicToRenew = async (raw: unknown) =>
  act(store.AskClinicInput, raw, store.ASK_CLINIC, (ctx, input) =>
    store.askClinicToRenew(store.writerOf(ctx), input),
  );
