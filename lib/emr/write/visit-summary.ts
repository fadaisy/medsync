import "server-only";

import { randomUUID } from "node:crypto";
import type { WriteCtx } from "./context";
import type { HoldReason } from "@/db/schema/admissions";
import type { VisitSummaryContent } from "@/lib/patient/visit-summary";
import { and, desc, eq, isNull } from "drizzle-orm";

import { patientVisitSummaries } from "@/db/schema/admissions";
import { loadSummaryInput } from "@/lib/emr/read/visit-summary";
import { encrypt } from "@/lib/encryption";
import {
  composeVisitSummary,
  NO_COPY_WORDS,
  removableIds,
  withRemovals,
} from "@/lib/patient/visit-summary";
import { DEFAULT_TIME_ZONE } from "@/supabase/functions/_shared/slots";
import { EmrWriteError } from "./context";

/*
 * The patient copy's share or hold (ADR 0203), in the clinician's transaction: the copy is composed again here
 * from the record (never taken from the screen), restricted items dropped first, the clinician's removals applied
 * by id, and the decision written as a new version that supersedes the current one. Kept as made.
 */

export type SummaryDecision =
  | { kind: "share"; removedIds: readonly string[] }
  | { kind: "hold"; reason: HoldReason; note?: string };

/** Compose the copy for this visit, as the patient would see it before any removal. */
export async function composeForEncounter(
  ctx: WriteCtx,
  input: { patientUserId: string; encounterId: string },
): Promise<{ content: VisitSummaryContent; restrictedCount: number }> {
  const record = await loadSummaryInput(ctx.tx, {
    hospitalId: ctx.actor.hospitalId,
    patientUserId: input.patientUserId,
    encounterId: input.encounterId,
    timeZone: DEFAULT_TIME_ZONE,
  });
  if (!record) throw new EmrWriteError("not_found", "Encounter not found for this patient here.");
  const r = composeVisitSummary(record);
  if (!r.ok) throw new EmrWriteError("invalid", NO_COPY_WORDS[r.reason]);
  return { content: r.content, restrictedCount: r.restrictedCount };
}

export async function decideVisitSummary(
  ctx: WriteCtx,
  input: { patientUserId: string; encounterId: string; decision: SummaryDecision },
): Promise<{ id: string; version: number }> {
  const { content } = await composeForEncounter(ctx, input);
  const d = input.decision;
  if (d.kind === "hold" && d.reason === "other" && !d.note?.trim())
    throw new EmrWriteError("invalid", "Say why the copy is held.");
  // Only ids the copy really has: a removal can take away, never name something else.
  const known = new Set(removableIds(content));
  const removed =
    d.kind === "share" ? [...new Set(d.removedIds)].filter((id) => known.has(id)) : [];

  const [current] = await ctx.tx
    .select({ id: patientVisitSummaries.id, version: patientVisitSummaries.version })
    .from(patientVisitSummaries)
    .where(eq(patientVisitSummaries.encounterId, input.encounterId))
    .orderBy(desc(patientVisitSummaries.version))
    .limit(1);
  const id = randomUUID();
  const version = (current?.version ?? 0) + 1;
  // Supersede first: one current decision per visit (patient_visit_summaries_one_current).
  await ctx.tx
    .update(patientVisitSummaries)
    .set({ supersededAt: ctx.now, supersededBy: id })
    .where(
      and(
        eq(patientVisitSummaries.encounterId, input.encounterId),
        isNull(patientVisitSummaries.supersededAt),
      ),
    );
  await ctx.tx.insert(patientVisitSummaries).values({
    id,
    hospitalId: ctx.actor.hospitalId,
    patientUserId: input.patientUserId,
    encounterId: input.encounterId,
    version,
    state: d.kind === "share" ? "shared" : "held",
    copyCiphertext:
      d.kind === "share" ? encrypt(JSON.stringify(withRemovals(content, new Set(removed)))) : null,
    removedItemIds: removed,
    holdReason: d.kind === "hold" ? d.reason : null,
    holdNoteCiphertext: d.kind === "hold" && d.note?.trim() ? encrypt(d.note.trim()) : null,
    decidedBy: ctx.actor.userId,
    decidedAt: ctx.now,
  });
  return { id, version };
}
