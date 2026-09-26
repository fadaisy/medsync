import "server-only";

import type { WriteCtx } from "./context";
import type { OrderLine, WriteResult } from "./orders";
import { and, eq } from "drizzle-orm";

import { encounterEvents } from "@/db/schema/encounter";
import { triageRecords } from "@/db/schema/triage";
import { EmrWriteError, stampActivity } from "./context";
import { openEncounter, ORDERING_CADRES, placeOrders, requireCadre } from "./orders";

/**
 * Triage suggestions in Plan (HARMONISATION §2 R4). lib/triage/recommend.ts suggests; nothing is
 * ordered until a clinician accepts. Accept places a real order that remembers where it came from
 * (`source_intent_id = '<triageRecordId>:<recommendation code>'`); dismiss records the decision on
 * the encounter timeline and orders nothing.
 *
 * ponytail: the recommendation code is checked for shape and the triage record for ownership, not
 * re-derived from the stored breakdown (recommend() needs the full TriageResult, which triage does
 * not persist). Re-derive here if triage starts storing it.
 */

export interface SuggestionRef {
  patientUserId: string;
  encounterId: string;
  triageRecordId: string;
  recommendationKey: string;
}

export const sourceIntentId = (s: Pick<SuggestionRef, "triageRecordId" | "recommendationKey">) =>
  `${s.triageRecordId}:${s.recommendationKey}`;

async function requireTriageRecord(ctx: WriteCtx, s: SuggestionRef): Promise<void> {
  const [t] = await ctx.tx
    .select({ id: triageRecords.id })
    .from(triageRecords)
    .where(
      and(
        eq(triageRecords.id, s.triageRecordId),
        eq(triageRecords.patientUserId, s.patientUserId),
        eq(triageRecords.hospitalId, ctx.actor.hospitalId),
      ),
    );
  if (!t) throw new EmrWriteError("not_found", "Triage record not found for this patient here.");
}

export async function acceptSuggestedOrder(
  ctx: WriteCtx,
  input: SuggestionRef & { order: Omit<OrderLine, "intentSource" | "sourceIntentId"> },
): Promise<WriteResult & { orderIds: string[] }> {
  await requireTriageRecord(ctx, input);
  return placeOrders(ctx, {
    patientUserId: input.patientUserId,
    encounterId: input.encounterId,
    orders: [
      {
        ...input.order,
        intentSource: "triage_recommendation",
        sourceIntentId: sourceIntentId(input),
      },
    ],
  });
}

/** Idempotent on the suggestion itself: dismissing it twice returns the first dismissal. */
export async function dismissSuggestedOrder(
  ctx: WriteCtx,
  input: SuggestionRef,
): Promise<WriteResult> {
  requireCadre(ctx, ORDERING_CADRES, "dismiss suggestions");
  await openEncounter(ctx, input.patientUserId, input.encounterId);
  await requireTriageRecord(ctx, input);
  const label = `Suggestion dismissed: ${sourceIntentId(input)}`;
  const where = and(
    eq(encounterEvents.encounterId, input.encounterId),
    eq(encounterEvents.kind, "order"),
    eq(encounterEvents.refId, input.triageRecordId),
    eq(encounterEvents.label, label),
  );
  const [existing] = await ctx.tx
    .select({ id: encounterEvents.id })
    .from(encounterEvents)
    .where(where)
    .limit(1);
  if (existing) return { id: existing.id };
  const [e] = await ctx.tx
    .insert(encounterEvents)
    .values({
      encounterId: input.encounterId,
      kind: "order",
      refId: input.triageRecordId,
      label,
      actorUserId: ctx.actor.userId,
      recordedAt: ctx.now,
    })
    .returning({ id: encounterEvents.id });
  await stampActivity(ctx, input.encounterId);
  return { id: e!.id };
}
