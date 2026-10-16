"use server";

import type { ReviewResult as ActionResult, Delivery } from "@/lib/pharmacy/review/store";
import type { PharmacyCtx, PharmacyNeed } from "@/lib/pharmacy/write";
import type { z } from "zod";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";

import { REVIEW } from "@/content/pharmacy-review";
import { logger } from "@/lib/logger";
import { requirePharmacyActor } from "@/lib/pharmacy/actor";
import { pharmacyDispensingLiveFor } from "@/lib/pharmacy/feature";
import { notifyNotSupplied } from "@/lib/pharmacy/notify";
import { patientListLive } from "@/lib/pharmacy/patient-list";
import * as store from "@/lib/pharmacy/review/store";
import { smsSender } from "@/lib/pharmacy/sms-sender";
import { runPharmacyWrite } from "@/lib/pharmacy/write";

/**
 * Review, queries and outcomes (Pharmacy Phase 1, Section 8: Review, Queries-pharmacy and Outcomes).
 * The house contract: Zod with a client key → the actor (auth, AAL2, the pharmacy affiliation, the
 * acting point) → `pharmacyDispensing` for the hospital → the permission and the point inside one
 * transaction (`runPharmacyWrite`, PA2-4) → the pharmacy pages revalidated. A refusal comes back in
 * words; nothing throws to the client. Every result is `{ ok, id, serverTime }` or `{ ok: false,
 * error }`: no write returns patient data.
 */
type Result = ActionResult<undefined>;

async function act<I, R extends { id: string }>(
  schema: z.ZodType<I>,
  raw: unknown,
  need: PharmacyNeed,
  write: (ctx: PharmacyCtx, input: I) => Promise<R>,
): Promise<ActionResult<R>> {
  try {
    const actor = await requirePharmacyActor();
    if (!pharmacyDispensingLiveFor(actor.hospitalId))
      return { ok: false, code: "config", error: REVIEW.refused.flagOff };
    const result = await runPharmacyWrite(schema, raw, actor, need, write);
    if (result.ok) revalidatePath("/pharmacy", "layout");
    return result;
  } catch (e) {
    unstable_rethrow(e);
    logger.error("pharmacy.review.action_failed", {
      error: e instanceof Error ? e.message : String(e),
    });
    return { ok: false, code: "conflict", error: REVIEW.refused.failed };
  }
}

/** Drop the store's data: the client gets the id and the server time only. */
const bare = <R>(r: ActionResult<R>): Result =>
  r.ok ? { ok: true, id: r.id, serverTime: r.serverTime } : r;

/* Review */
export async function acceptLine(raw: unknown) {
  return bare(await act(store.LineInput, raw, store.REVIEW_NEED, store.acceptLine));
}
export async function acceptRemainingLines(raw: unknown) {
  return bare(await act(store.LineInput, raw, store.REVIEW_NEED, store.acceptRemainingLines));
}
export async function declineLine(raw: unknown) {
  return bare(await act(store.DeclineInput, raw, store.REVIEW_NEED, store.declineLine));
}
export async function saveLineDecisions(raw: unknown) {
  return bare(await act(store.DecisionsInput, raw, store.DISPENSE_NEED, store.saveLineDecisions));
}
export async function setPaymentStatus(raw: unknown) {
  return bare(await act(store.PaymentInput, raw, store.DISPENSE_NEED, store.setPaymentStatus));
}
export async function bringIntoQueue(raw: unknown) {
  return bare(await act(store.LineInput, raw, store.DISPENSE_NEED, store.bringIntoQueue));
}
export async function recordSupplyWithoutReview(raw: unknown) {
  return bare(
    await act(store.WithoutReviewInput, raw, store.DISPENSE_NEED, store.recordSupplyWithoutReview),
  );
}

/* Queries, pharmacy */

/**
 * 5.4, D-PH1-47: the query commits first; delivery is a second step after commit that never throws.
 * The pharmacy reads what happened in words ("Query sent …" or "The prescriber has NOT been told …").
 */
export async function sendQuery(raw: unknown): Promise<Result & { delivery?: Delivery }> {
  const r = await act(store.QueryInput, raw, store.QUERY_NEED, store.sendQuery);
  if (!r.ok || !r.data) return bare(r);
  try {
    const actor = await requirePharmacyActor();
    const delivery = await store.deliverQuery(actor, r.id, r.data);
    revalidatePath("/pharmacy", "layout");
    return { ...bare(r), delivery };
  } catch (e) {
    unstable_rethrow(e);
    return {
      ...bare(r),
      delivery: { delivered: false, caution: true, words: REVIEW.query.notTold },
    };
  }
}
export async function logPhoneAnswer(raw: unknown) {
  return bare(await act(store.PhoneInput, raw, store.QUERY_NEED, store.logPhoneAnswer));
}
export async function withdrawQuery(raw: unknown) {
  return bare(await act(store.WithdrawInput, raw, store.QUERY_NEED, store.withdrawQuery));
}

/* Outcomes */
/**
 * 5.11, MS-3, MS-5: the outcome commits first; the owed or buying-outside message is a second step after
 * commit, only where the patient's list is live and the hospital's live SMS is on. It never throws: the
 * pharmacy reads what happened in words (`message`), or nothing when no message is sent.
 */
export async function recordNotSupplied(raw: unknown): Promise<Result & { message?: string }> {
  const r = bare(
    await act(store.NotSuppliedInput, raw, store.DISPENSE_NEED, store.recordNotSupplied),
  );
  if (!r.ok) return r;
  try {
    const actor = await requirePharmacyActor();
    if (!(await patientListLive(actor.hospitalId))) return r;
    const notice = await notifyNotSupplied(actor, r.id, smsSender());
    return notice ? { ...r, message: notice.words } : r;
  } catch (e) {
    unstable_rethrow(e);
    return r;
  }
}
export async function changeOpenOutcome(raw: unknown) {
  return bare(await act(store.LineInput, raw, store.DISPENSE_NEED, store.changeOpenOutcome));
}
export async function confirmFilledElsewhere(raw: unknown) {
  return bare(await act(store.FilledInput, raw, store.CLOSE_NEED, store.confirmFilledElsewhere));
}
export async function closeLine(raw: unknown) {
  return bare(await act(store.CloseInput, raw, store.CLOSE_NEED, store.closeLine));
}
export async function closePrescriptionNotCollected(raw: unknown) {
  return bare(
    await act(store.CloseInput, raw, store.CLOSE_NEED, store.closePrescriptionNotCollected),
  );
}
/** LB-4: the slip's id only (no PHI in the URL); the page prints with CSS. */
export async function printSlip(raw: unknown) {
  return bare(await act(store.LineInput, raw, store.DISPENSE_NEED, store.printSlip));
}

/** 5.7: the look-back tab's "Looked at" (`pharmacy.review`). */
export async function recordLookBack(raw: unknown) {
  return bare(await act(store.LookBackInput, raw, store.LOOK_BACK_NEED, store.recordLookBack));
}
