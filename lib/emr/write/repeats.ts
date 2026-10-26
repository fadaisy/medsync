import "server-only";

import type { WriteCtx } from "./context";
import type { WriteResult } from "./orders";
import type { RepeatsPayload } from "@/lib/clerking/plan/payload";
import type { EmrTx } from "@/lib/emr/db";
import type { PlanRxRepeats } from "@/lib/prescribing/plan-rx";
import { and, eq, inArray, sql } from "drizzle-orm";

import {
  prescriptionRenewalEvents,
  prescriptionRenewalRequests,
  prescriptionRepeatAuthorisations,
  prescriptionRepeatEvents,
} from "@/db/schema/pharmacy-network";
import { prescriptions } from "@/db/schema/prescribing";
import { pharmacyRepeatsLiveFor } from "@/lib/pharmacy/feature";
import { networkPack } from "@/lib/pharmacy/network-packs";
import { checkAnswer, renewalState } from "@/lib/pharmacy/refills";
import { localDate } from "@/lib/pharmacy/stock/ledger";
import { drugById } from "@/lib/prescribing/formulary";
import { checkAuthorisation } from "@/lib/prescribing/repeats";
import { EmrWriteError } from "./context";
import { requireCadre } from "./orders";
import { prescribeRequirement, PRESCRIBING_CADRES } from "./prescriptions";

/**
 * Repeats and renewals, written (Pharmacy Phase 4, Step 4; Section 8 `authoriseRepeats`, `stopRepeats`,
 * `answerRenewal`; Law 2). Only these functions write an authorisation, its events or a renewal's answer; a test
 * enumerates the writers. The pharmacy never writes a prescription here (Law 3).
 */

const REFUSAL_WORDS = {
  not_offered: "Repeats are not allowed for this medicine.",
  supplies: "The number of further supplies is outside the signed range.",
  interval: "The days apart are fewer than the signed minimum.",
  not_after: "The last date is outside the signed period.",
  review_by: "The review date falls outside the repeats.",
} as const;

/** RP-1, RP-2: inside the prescribing transaction (placePlan), after the line is placed. A replay writes nothing. */
export async function authoriseRepeats(
  ctx: WriteCtx,
  input: { prescriptionId: string; patientUserId: string; drugId: string; terms: PlanRxRepeats },
): Promise<void> {
  const hospitalId = ctx.actor.hospitalId;
  if (!pharmacyRepeatsLiveFor(hospitalId))
    throw new EmrWriteError("config", "Repeats are not switched on here.");
  const pack = await networkPack(ctx.tx, hospitalId, "repeat_rules");
  const drug = drugById(input.drugId);
  const refusals = checkAuthorisation(
    input.terms,
    { medicineId: input.drugId, controlled: !!drug?.flags.controlled, emergency: false },
    pack?.content ?? null,
    localDate(ctx.now),
  );
  if (refusals.length)
    throw new EmrWriteError("invalid", refusals.map((r) => REFUSAL_WORDS[r]).join(" "));
  await ctx.tx
    .insert(prescriptionRepeatAuthorisations)
    .values({
      hospitalId,
      patientUserId: input.patientUserId,
      prescriptionId: input.prescriptionId,
      furtherSupplies: input.terms.furtherSupplies,
      minIntervalDays: input.terms.minIntervalDays,
      notAfter: input.terms.notAfter,
      reviewBy: input.terms.reviewBy,
      ruleVersion: pack!.version,
      prescriberUserId: ctx.actor.userId,
      prescriberCadre: ctx.actor.cadreCode,
      authorisedAt: ctx.now,
    })
    .onConflictDoNothing({ target: prescriptionRepeatAuthorisations.prescriptionId });
}

async function mayPrescribeHere(ctx: WriteCtx): Promise<boolean> {
  return (
    PRESCRIBING_CADRES.includes(ctx.actor.cadreCode) &&
    (await prescribeRequirement(ctx, false)) !== "blocked"
  );
}

/** RP-3, 5.2: a prescriber ends the repeats at any time, with a reason. */
export async function stopRepeats(
  ctx: WriteCtx,
  input: { patientUserId: string; prescriptionId: string; reason: string },
): Promise<WriteResult> {
  requireCadre(ctx, PRESCRIBING_CADRES, "stop repeats");
  if (!(await mayPrescribeHere(ctx)))
    throw new EmrWriteError("forbidden", "You may not prescribe for this patient here.");
  const [a] = await ctx.tx
    .select({ id: prescriptionRepeatAuthorisations.id })
    .from(prescriptionRepeatAuthorisations)
    .where(
      and(
        eq(prescriptionRepeatAuthorisations.prescriptionId, input.prescriptionId),
        eq(prescriptionRepeatAuthorisations.patientUserId, input.patientUserId),
        eq(prescriptionRepeatAuthorisations.hospitalId, ctx.actor.hospitalId),
      ),
    )
    .for("update");
  if (!a) throw new EmrWriteError("not_found", "This line has no repeats.");
  const [row] = await ctx.tx
    .insert(prescriptionRepeatEvents)
    .values({
      authorisationId: a.id,
      hospitalId: ctx.actor.hospitalId,
      kind: "stopped",
      reason: input.reason,
      actorUserId: ctx.actor.userId,
      actorCadre: ctx.actor.cadreCode,
      at: ctx.now,
    })
    .onConflictDoNothing()
    .returning({ id: prescriptionRepeatEvents.id });
  // A second stop is a no-op: the first one stands (0230 `pre_stopped_once`).
  return { id: row?.id ?? a.id };
}

async function loadRenewal(ctx: WriteCtx, patientUserId: string, renewalId: string) {
  const [r] = await ctx.tx
    .select({ id: prescriptionRenewalRequests.id })
    .from(prescriptionRenewalRequests)
    .where(
      and(
        eq(prescriptionRenewalRequests.id, renewalId),
        eq(prescriptionRenewalRequests.patientUserId, patientUserId),
        eq(prescriptionRenewalRequests.hospitalId, ctx.actor.hospitalId),
      ),
    )
    .for("update");
  if (!r) throw new EmrWriteError("not_found", "That renewal request is not here.");
  const answers = await ctx.tx
    .select({ kind: prescriptionRenewalEvents.kind })
    .from(prescriptionRenewalEvents)
    .where(eq(prescriptionRenewalEvents.renewalId, renewalId));
  return renewalState(answers);
}

/** RN-2, 5.3: Book a visit or Decline. Renew is answered by placing the new prescription (`renewFrom`). */
export async function answerRenewal(
  ctx: WriteCtx,
  input: {
    patientUserId: string;
    renewalId: string;
    answer: { kind: "visit_needed" } | { kind: "declined"; reasonCode: string };
    note: string | null;
  },
): Promise<WriteResult> {
  const state = await loadRenewal(ctx, input.patientUserId, input.renewalId);
  const reasons = await networkPack(ctx.tx, ctx.actor.hospitalId, "renewal_decline_reasons");
  const refusal = checkAnswer({
    state,
    answer: input.answer,
    mayPrescribeHere: await mayPrescribeHere(ctx),
    declineReasons: reasons?.content.items.map((i) => i.code) ?? null,
  });
  if (refusal)
    throw new EmrWriteError(
      refusal === "already_answered"
        ? "conflict"
        : refusal === "may_not_prescribe"
          ? "forbidden"
          : "invalid",
      refusal === "already_answered"
        ? "This request has already been answered."
        : refusal === "may_not_prescribe"
          ? "You may not prescribe for this patient here."
          : "Choose a decline reason from the signed list.",
    );
  const [row] = await ctx.tx
    .insert(prescriptionRenewalEvents)
    .values({
      renewalId: input.renewalId,
      hospitalId: ctx.actor.hospitalId,
      kind: input.answer.kind,
      reasonCode: input.answer.kind === "declined" ? input.answer.reasonCode : null,
      note: input.note,
      actorUserId: ctx.actor.userId,
      actorCadre: ctx.actor.cadreCode,
      at: ctx.now,
    })
    .returning({ id: prescriptionRenewalEvents.id });
  return { id: row!.id };
}

/**
 * RN-3: a Renew is complete when the new prescription is placed; the request links to it in the same transaction,
 * which also ends the source line's repeats (RP-3, read as `renewed`). If someone answered first, the prescription
 * still stands (Law 11) and the caller is told.
 */
export async function renewFrom(
  ctx: WriteCtx,
  input: { patientUserId: string; renewalId: string; newPrescriptionId: string },
): Promise<string | null> {
  const state = await loadRenewal(ctx, input.patientUserId, input.renewalId);
  if (state !== "open")
    return "The renewal request had already been answered; the prescription is placed.";
  await ctx.tx
    .insert(prescriptionRenewalEvents)
    .values({
      renewalId: input.renewalId,
      hospitalId: ctx.actor.hospitalId,
      kind: "renewed",
      newPrescriptionId: input.newPrescriptionId,
      note: null,
      actorUserId: ctx.actor.userId,
      actorCadre: ctx.actor.cadreCode,
      at: ctx.now,
    })
    .onConflictDoNothing();
  return null;
}

/** For the problem card and the print: each line's terms and whether they were stopped (and by whom, when). */
export async function repeatTermsFor(
  ctx: Pick<WriteCtx, "tx">,
  prescriptionIds: readonly string[],
) {
  const rows = await ctx.tx
    .select({
      prescriptionId: prescriptionRepeatAuthorisations.prescriptionId,
      furtherSupplies: prescriptionRepeatAuthorisations.furtherSupplies,
      minIntervalDays: prescriptionRepeatAuthorisations.minIntervalDays,
      notAfter: prescriptionRepeatAuthorisations.notAfter,
      reviewBy: prescriptionRepeatAuthorisations.reviewBy,
      stoppedAt: prescriptionRepeatEvents.at,
      stoppedCadre: prescriptionRepeatEvents.actorCadre,
      lineState: prescriptions.state,
    })
    .from(prescriptionRepeatAuthorisations)
    .innerJoin(prescriptions, eq(prescriptions.id, prescriptionRepeatAuthorisations.prescriptionId))
    .leftJoin(
      prescriptionRepeatEvents,
      eq(prescriptionRepeatEvents.authorisationId, prescriptionRepeatAuthorisations.id),
    )
    .where(
      prescriptionIds.length
        ? inArray(prescriptionRepeatAuthorisations.prescriptionId, [...prescriptionIds])
        : sql`false`,
    );
  return new Map(rows.map((r) => [r.prescriptionId, r]));
}

/** 5.2: the dialog's Repeats step bounds (null while unsigned) and each placed line's terms. Behind the flag. */
export async function loadRepeatsPayload(
  tx: EmrTx,
  hospitalId: string,
  prescriptionIds: readonly string[],
  now: Date,
): Promise<RepeatsPayload | undefined> {
  if (!pharmacyRepeatsLiveFor(hospitalId)) return undefined;
  const pack = await networkPack(tx, hospitalId, "repeat_rules");
  const terms = await repeatTermsFor({ tx }, prescriptionIds);
  const p = pack?.content;
  return {
    bounds: p
      ? {
          offered: p.repeatList.filter(
            (id) => !p.neverRepeat.includes(id) && !drugById(id)?.flags.controlled,
          ),
          maxSupplies: p.maxSupplies,
          maxPeriodDays: p.maxPeriodDays,
          minIntervalDays: Math.max(1, p.minIntervalDays),
        }
      : null,
    today: localDate(now),
    lines: Object.fromEntries(
      [...terms.values()].map((t) => [
        t.prescriptionId,
        {
          furtherSupplies: t.furtherSupplies,
          minIntervalDays: t.minIntervalDays,
          notAfter: t.notAfter,
          reviewBy: t.reviewBy,
          stopped: t.stoppedAt ? { cadre: t.stoppedCadre, on: localDate(t.stoppedAt) } : null,
          ended: t.lineState !== "active",
        },
      ]),
    ),
  };
}
