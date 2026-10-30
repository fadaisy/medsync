import type { RxAnswer, RxFlag } from "@/lib/pharmacy/derive/checks";
import type { GroupLine } from "@/lib/pharmacy/review/load";
import type { PharmacyCtx } from "@/lib/pharmacy/write";
import type { EmrDb, EmrTx } from "@/lib/emr/db";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";

import { RX_CHECKS } from "@/content/pharmacy-rework-daily";
import { pharmacyRxChecks } from "@/db/schema/pharmacy-rework";
import { prescriptions } from "@/db/schema/prescribing";
import { EmrWriteError } from "@/lib/emr/write/context";
import { rxChecksOpen, rxFlags } from "@/lib/pharmacy/derive/checks";

/**
 * The pharmacist's answers to the checks panel (rework PRD §6.2, test 8). Stored append-only (0266); the hand-over
 * re-reads them under its locks and refuses while a flag on a given line is open.
 */
export const AnswerCheckInput = z.object({
  lineId: z.uuid(),
  code: z.string().min(2).max(60),
  answer: z.enum(["checked", "prescriber_confirmed", "query"]),
  reason: z.string().trim().min(2).max(200).nullish(),
});

export async function answerCheck(ctx: PharmacyCtx, input: z.infer<typeof AnswerCheckInput>) {
  const [row] = await ctx.tx
    .select({
      id: prescriptions.id,
      prescriber: prescriptions.prescriberUserId,
      checkAnswers: prescriptions.checkAnswers,
      confirmedFlags: prescriptions.confirmedFlags,
    })
    .from(prescriptions)
    .where(and(eq(prescriptions.id, input.lineId), eq(prescriptions.hospitalId, ctx.actor.hospitalId)));
  if (!row) throw new EmrWriteError("not_found", RX_CHECKS.refused.notHere);
  const flag = rxFlags([
    {
      id: row.id,
      checkAnswers: (row.checkAnswers ?? []) as never,
      confirmedFlags: (row.confirmedFlags ?? []) as string[],
    },
  ]).find((f) => f.code === input.code);
  if (!flag) throw new EmrWriteError("invalid", RX_CHECKS.refused.noFlag);
  if (flag.level === "stop" && input.answer === "checked")
    throw new EmrWriteError("invalid", RX_CHECKS.refused.stopNeedsPrescriber);
  if (input.answer === "checked" && !input.reason)
    throw new EmrWriteError("invalid", RX_CHECKS.refused.why);
  const [a] = await ctx.tx
    .insert(pharmacyRxChecks)
    .values({
      hospitalId: ctx.actor.hospitalId,
      lineId: row.id,
      code: flag.code,
      level: flag.level,
      answer: input.answer,
      reason: input.reason ?? null,
      // "Prescriber confirmed" names the line's own prescriber.
      prescriberUserId: input.answer === "prescriber_confirmed" ? row.prescriber : null,
      createdBy: ctx.actor.userId,
    })
    .returning({ id: pharmacyRxChecks.id });
  return { id: a!.id };
}

export async function answersFor(
  tx: EmrTx | EmrDb,
  hospitalId: string,
  lineIds: readonly string[],
): Promise<(RxAnswer & { reason: string | null })[]> {
  if (!lineIds.length) return [];
  const rows = await tx
    .select({
      lineId: pharmacyRxChecks.lineId,
      code: pharmacyRxChecks.code,
      answer: pharmacyRxChecks.answer,
      reason: pharmacyRxChecks.reason,
      at: pharmacyRxChecks.createdAt,
    })
    .from(pharmacyRxChecks)
    .where(and(eq(pharmacyRxChecks.hospitalId, hospitalId), inArray(pharmacyRxChecks.lineId, [...lineIds])));
  return rows;
}

/** The hand-over's gate: the flags still open on the lines being given (under the hand-over's locks). */
export async function openChecksOnHandover(
  tx: EmrTx,
  hospitalId: string,
  lines: readonly GroupLine[],
  givenLineIds: readonly string[],
): Promise<RxFlag[]> {
  const flags = rxFlags(lines.map((l) => l.row));
  if (!flags.length) return [];
  return rxChecksOpen(flags, await answersFor(tx, hospitalId, givenLineIds), givenLineIds);
}
