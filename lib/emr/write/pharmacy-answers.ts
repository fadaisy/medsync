import "server-only";

import type { WriteCtx } from "@/lib/emr/write/context";
import type { WriteResult } from "@/lib/emr/write/orders";
import type { QueryRow } from "@/lib/pharmacy/review/prescriber-read";
import type { QueryLines } from "@/lib/pharmacy/review/queries";
import { and, eq, inArray, sql } from "drizzle-orm";

import { CHANGED_REASON, DRAFT_KEEP_REASONS, STOP_REASONS } from "@/content/pharmacy-prescriber";
import {
  pharmacyNoticeAcknowledgements,
  pharmacyQueries,
  pharmacyQueryEvents,
  prescriptionCancellations,
  prescriptionPrintEvents,
} from "@/db/schema/pharmacy-dispensing";
import { prescriptions } from "@/db/schema/prescribing";
import { EmrWriteError } from "@/lib/emr/write/context";
import { stopMedicationStatement } from "@/lib/emr/write/facts";
import { prescribeRequirement } from "@/lib/emr/write/prescriptions";
import { printTime } from "@/lib/pharmacy/print/label";
import {
  cadresOfUsers,
  coveredLineIds,
  firstAnswerWords,
  loadPatientPharmacy,
  notSuppliedOutcome,
  signedList,
  standingEvent,
  statusOf,
} from "@/lib/pharmacy/review/prescriber-read";
import { answerEffects, canAnswer, QUERY_COPY } from "@/lib/pharmacy/review/queries";

/**
 * The prescriber's side of a query (Pharmacy Phase 1, 5.4, RQ-4..RQ-8, RQ-11, Section 8 "Queries,
 * prescriber"; D-PH1-08, D-PH1-41, D-PH1-49; ADR 0278). Every function runs inside the EMR write
 * context: the clinician's own transaction, the access rule already resolved (withPatientWrite).
 * It lives with the other prescriber writes, not under lib/pharmacy, so the Law 2 guard over the
 * pharmacy's code ("lib/pharmacy never writes a prescription") stays absolute.
 *
 * - Who may: a clinician who may prescribe for this patient at this hospital (D-PH1-08): the co-sign
 *   policy names their cadre for routine prescribing, not `blocked` (prescribeRequirement, the same
 *   rule that lets them prescribe), and the access rule let them in. A nurse holds no such policy.
 * - Law 2: the pharmacy never writes a prescription. `cancelPrescriptionLine` is the prescriber's own
 *   action, as the co-sign withdrawal already is: `active` → `cancelled` and one
 *   `prescription_cancellations` row (with the line that replaces it, H4), audited by the triggers.
 * - Law 10: nothing here touches prescribing. A change is the existing dialog placing a new line,
 *   then this cancel naming it.
 * - RQ-6: answers are serialised per query under `pg_advisory_xact_lock('pharmacy-query:<id>')`;
 *   the first answer wins, a later one is shown it and writes nothing, and a repeat with the same
 *   client key is the same request.
 * - The prescriber never reads stock (AV-6, PA2-5): nothing here imports a batch, movement or
 *   product table.
 */

/* ─── Who may ─────────────────────────────────────────────────────── */

export async function mayPrescribeHere(ctx: WriteCtx): Promise<boolean> {
  return (await prescribeRequirement(ctx, false)) !== "blocked";
}

async function requirePrescriber(ctx: WriteCtx, act: string): Promise<void> {
  if (!(await mayPrescribeHere(ctx)))
    throw new EmrWriteError(
      "forbidden",
      `Only a clinician who may prescribe for this patient here may ${act}.`,
    );
}

/* ─── D-PH1-41: cancelPrescriptionLine ────────────────────────────── */

export interface CancelLineInput {
  patientUserId: string;
  prescriptionId: string;
  reasonCode: string;
  note?: string | null;
  /** H4: the line that replaces it (same patient, placed after). */
  replacedBy?: string | null;
  /** The replacing line by its client key, for a change placed through the plan's basket. */
  replacedByClientKey?: string | null;
  queryId?: string | null;
}

async function resolveReplacement(
  ctx: WriteCtx,
  input: CancelLineInput,
  old: { id: string; createdAt: Date },
): Promise<string | null> {
  if (!input.replacedBy && !input.replacedByClientKey) return null;
  const [row] = await ctx.tx
    .select({
      id: prescriptions.id,
      createdAt: prescriptions.createdAt,
      isEmergency: prescriptions.isEmergency,
    })
    .from(prescriptions)
    .where(
      and(
        input.replacedBy
          ? eq(prescriptions.id, input.replacedBy)
          : eq(prescriptions.clientKey, input.replacedByClientKey!),
        eq(prescriptions.patientUserId, input.patientUserId),
        eq(prescriptions.hospitalId, ctx.actor.hospitalId),
      ),
    )
    .limit(1);
  if (!row || row.isEmergency)
    throw new EmrWriteError("invalid", "The new line is not a prescription for this patient.");
  if (row.id === old.id || row.createdAt.getTime() <= old.createdAt.getTime())
    throw new EmrWriteError("invalid", "The new line must be one placed after this one.");
  return row.id;
}

export async function cancelPrescriptionLine(
  ctx: WriteCtx,
  input: CancelLineInput,
): Promise<WriteResult> {
  await requirePrescriber(ctx, "change or stop a prescription");
  const reasonCode = input.reasonCode.trim();
  if (reasonCode.length < 2 || reasonCode.length > 60)
    throw new EmrWriteError("invalid", "Say why the line is stopped.");
  const { tx, actor, now } = ctx;
  // One writer per line: a second cancel waits, then finds it cancelled.
  const [line] = await tx
    .select({
      id: prescriptions.id,
      state: prescriptions.state,
      createdAt: prescriptions.createdAt,
      statementId: prescriptions.medicationStatementId,
    })
    .from(prescriptions)
    .where(
      and(
        eq(prescriptions.id, input.prescriptionId),
        eq(prescriptions.patientUserId, input.patientUserId),
        eq(prescriptions.hospitalId, actor.hospitalId),
        eq(prescriptions.isEmergency, false),
      ),
    )
    .for("update");
  if (!line)
    throw new EmrWriteError("not_found", "That prescription is not in this hospital's record.");
  const replacedBy = await resolveReplacement(ctx, input, line);

  if (line.state !== "active") {
    const [done] = await tx
      .select()
      .from(prescriptionCancellations)
      .where(eq(prescriptionCancellations.prescriptionId, line.id));
    // The same request again (a retry) is the same result; anything else changed nothing.
    if (done && done.replacedByPrescriptionId === replacedBy && done.reasonCode === reasonCode)
      return { id: done.id };
    throw new EmrWriteError("conflict", "This line is no longer active. Nothing was changed.");
  }
  if (input.queryId) {
    const [q] = await tx
      .select({ id: pharmacyQueries.id })
      .from(pharmacyQueries)
      .where(
        and(
          eq(pharmacyQueries.id, input.queryId),
          eq(pharmacyQueries.patientUserId, input.patientUserId),
          eq(pharmacyQueries.hospitalId, actor.hospitalId),
        ),
      );
    if (!q) throw new EmrWriteError("not_found", "That query is not in this patient's record.");
  }

  await tx
    .update(prescriptions)
    .set({ state: "cancelled", updatedAt: now })
    .where(eq(prescriptions.id, line.id));
  if (line.statementId)
    await stopMedicationStatement(ctx, {
      patientUserId: input.patientUserId,
      statementId: line.statementId,
      reasonCode: replacedBy ? "prescription_changed" : "prescription_stopped",
      clientKey: `rx-cancel:${line.id}`,
    });
  const [row] = await tx
    .insert(prescriptionCancellations)
    .values({
      prescriptionId: line.id,
      hospitalId: actor.hospitalId,
      patientUserId: input.patientUserId,
      reasonCode,
      note: input.note?.trim() || null,
      replacedByPrescriptionId: replacedBy,
      queryId: input.queryId ?? null,
      actorUserId: actor.userId,
      actorCadre: actor.cadreCode,
      cancelledAt: now,
    })
    .returning({ id: prescriptionCancellations.id });
  return { id: row!.id };
}

/* ─── The query, locked ───────────────────────────────────────────── */

async function lockedQuery(ctx: WriteCtx, patientUserId: string, queryId: string) {
  await ctx.tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`pharmacy-query:${queryId}`}))`);
  const data = await loadPatientPharmacy(ctx.tx, {
    hospitalId: ctx.actor.hospitalId,
    patientUserId,
  });
  const q = data.queries.find((x) => x.id === queryId);
  if (!q) throw new EmrWriteError("not_found", "That query is not in this patient's record.");
  return { data, q };
}

const replayOf = (q: QueryRow, clientKey: string) =>
  q.events.find((e) => e.clientKey === clientKey)?.id ?? null;

/** RQ-6: open, unanswered, not withdrawn, and the caller may prescribe; else what they are shown. */
async function mustBeAnswerable(ctx: WriteCtx, q: QueryRow): Promise<void> {
  const withdrawn = q.events.find((e) => e.kind === "withdrawn");
  if (withdrawn)
    throw new EmrWriteError(
      "conflict",
      QUERY_COPY.withdrawn.replace("{time}", printTime(withdrawn.at.toISOString())),
    );
  const first = standingEvent(q);
  const verdict = canAnswer({
    answererMayPrescribe: await mayPrescribeHere(ctx),
    existingAnswer: first,
  });
  if (verdict.ok) return;
  if (verdict.reason === "may_not_prescribe")
    throw new EmrWriteError(
      "forbidden",
      "Only a clinician who may prescribe for this patient here may answer.",
    );
  const cadre = verdict.first.answeredByUserId
    ? ((await cadresOfUsers(ctx.tx, ctx.actor.hospitalId, [verdict.first.answeredByUserId])).get(
        verdict.first.answeredByUserId,
      ) ?? "")
    : "";
  throw new EmrWriteError("conflict", firstAnswerWords(verdict.first, cadre));
}

async function writeEvent(
  ctx: WriteCtx,
  q: QueryRow,
  row: Omit<typeof pharmacyQueryEvents.$inferInsert, "queryId" | "hospitalId" | "actorUserId">,
): Promise<string> {
  const [e] = await ctx.tx
    .insert(pharmacyQueryEvents)
    .values({
      ...row,
      queryId: q.id,
      hospitalId: ctx.actor.hospitalId,
      actorUserId: ctx.actor.userId,
      occurredAt: ctx.now,
    })
    .onConflictDoNothing({ target: pharmacyQueryEvents.clientKey })
    .returning({ id: pharmacyQueryEvents.id });
  if (e) return e.id;
  // Already written under this key (a deterministic key: seen).
  const [had] = await ctx.tx
    .select({ id: pharmacyQueryEvents.id })
    .from(pharmacyQueryEvents)
    .where(eq(pharmacyQueryEvents.clientKey, row.clientKey!));
  return had!.id;
}

const linesOf = (
  data: Awaited<ReturnType<typeof lockedQuery>>["data"],
  q: QueryRow,
): QueryLines => ({
  scope: q.scope,
  lines: coveredLineIds(q, data.lines).flatMap((id) => {
    const status = statusOf(data, id);
    return status ? [{ id, status }] : [];
  }),
});

/* ─── answerQuery ─────────────────────────────────────────────────── */

export type AnswerInput = {
  patientUserId: string;
  queryId: string;
  clientKey: string;
  note?: string | null;
} & (
  | { answer: "keep"; reasonCode: string }
  | { answer: "stopped"; reasonCode: string }
  | {
      answer: "changed";
      /** The line changed (a whole-prescription query names it; a line query has one). */
      lineId?: string;
      replacedBy?: string | null;
      replacedByClientKey?: string | null;
    }
);

/**
 * RQ-4, RQ-5. keep → the `answered` event, with a reason from the keep list in force. stopped →
 * every remaining line cancelled, then `answered`. changed → the line cancelled naming its
 * replacement; a query about one line closes with `answered: changed`, a query about the whole
 * prescription stays open until `confirmChangesMade`.
 */
export async function answerQuery(
  ctx: WriteCtx,
  input: AnswerInput,
): Promise<WriteResult & { closed: boolean }> {
  const { data, q } = await lockedQuery(ctx, input.patientUserId, input.queryId);
  const replay = replayOf(q, input.clientKey);
  if (replay) return { id: replay, closed: true };
  await mustBeAnswerable(ctx, q);
  const note = input.note?.trim() || null;

  if (input.answer === "keep") {
    const keep = await signedList(ctx.tx, ctx.actor.hospitalId, "keep_reasons", DRAFT_KEEP_REASONS);
    if (!keep.items.some((r) => r.code === input.reasonCode))
      throw new EmrWriteError("invalid", "Choose a reason for keeping it as written.");
    if (input.reasonCode === "other" && (note?.length ?? 0) < 3)
      throw new EmrWriteError("invalid", "Write the reason for keeping it.");
    const id = await writeEvent(ctx, q, {
      kind: "answered",
      answer: "keep",
      answerReasonCode: input.reasonCode,
      note,
      via: "app",
      answeredByUserId: ctx.actor.userId,
      clientKey: input.clientKey,
    });
    return { id, closed: true };
  }

  if (input.answer === "stopped") {
    if (!STOP_REASONS.some((r) => r.code === input.reasonCode))
      throw new EmrWriteError("invalid", "Say why the medicine is stopped.");
    if (input.reasonCode === "other" && (note?.length ?? 0) < 3)
      throw new EmrWriteError("invalid", "Write the reason for stopping it.");
    const effects = answerEffects(linesOf(data, q), "stopped");
    if (effects.ok)
      for (const m of effects.moves)
        if (data.lines.get(m.lineId)?.state === "active")
          await cancelPrescriptionLine(ctx, {
            patientUserId: input.patientUserId,
            prescriptionId: m.lineId,
            reasonCode: input.reasonCode,
            note,
            queryId: q.id,
          });
    const id = await writeEvent(ctx, q, {
      kind: "answered",
      answer: "stopped",
      answerReasonCode: input.reasonCode,
      note,
      via: "app",
      answeredByUserId: ctx.actor.userId,
      clientKey: input.clientKey,
    });
    return { id, closed: true };
  }

  const covered = coveredLineIds(q, data.lines);
  const lineId = q.scope === "line" ? q.prescriptionId : input.lineId;
  if (!lineId || !covered.includes(lineId))
    throw new EmrWriteError("invalid", "Name the line that was changed.");
  if (!input.replacedBy && !input.replacedByClientKey)
    throw new EmrWriteError("invalid", "Place the new prescription first.");
  const cancel = await cancelPrescriptionLine(ctx, {
    patientUserId: input.patientUserId,
    prescriptionId: lineId,
    reasonCode: CHANGED_REASON,
    note,
    replacedBy: input.replacedBy,
    replacedByClientKey: input.replacedByClientKey,
    queryId: q.id,
  });
  // RQ-5, RQ-9: changing one line of a whole prescription does not close its query.
  if (q.scope === "prescription") return { id: cancel.id, closed: false };
  const [link] = await ctx.tx
    .select({ replacedBy: prescriptionCancellations.replacedByPrescriptionId })
    .from(prescriptionCancellations)
    .where(eq(prescriptionCancellations.prescriptionId, lineId));
  const id = await writeEvent(ctx, q, {
    kind: "answered",
    answer: "changed",
    note,
    via: "app",
    answeredByUserId: ctx.actor.userId,
    replacedByPrescriptionId: link?.replacedBy ?? null,
    clientKey: input.clientKey,
  });
  return { id, closed: true };
}

/** RQ-5: "Changes made" closes a whole-prescription query once at least one line was replaced. */
export async function confirmChangesMade(
  ctx: WriteCtx,
  input: { patientUserId: string; queryId: string; clientKey: string },
): Promise<WriteResult> {
  const { data, q } = await lockedQuery(ctx, input.patientUserId, input.queryId);
  const replay = replayOf(q, input.clientKey);
  if (replay) return { id: replay };
  await mustBeAnswerable(ctx, q);
  if (q.scope !== "prescription")
    throw new EmrWriteError("invalid", "Changes made is for a query about the whole prescription.");
  const replacedBy = new Map(
    coveredLineIds(q, data.lines).flatMap((id) => {
      const by = data.cancellations.get(id)?.replacedBy;
      return by ? [[id, by] as const] : [];
    }),
  );
  const effects = answerEffects(linesOf(data, q), "changed", {
    changedLineIds: [...replacedBy.keys()],
    replacedBy,
  });
  if (!effects.ok)
    throw new EmrWriteError(
      "invalid",
      "Change at least one line first, or keep the prescription as written.",
    );
  const id = await writeEvent(ctx, q, {
    kind: "answered",
    answer: "changed",
    via: "app",
    answeredByUserId: ctx.actor.userId,
    clientKey: input.clientKey,
  });
  return { id };
}

/** RQ-7: the named clinician says the logged phone answer was not theirs; the query reopens. */
export async function disputePhoneAnswer(
  ctx: WriteCtx,
  input: { patientUserId: string; queryId: string; clientKey: string; note?: string | null },
): Promise<WriteResult> {
  const { q } = await lockedQuery(ctx, input.patientUserId, input.queryId);
  const replay = replayOf(q, input.clientKey);
  if (replay) return { id: replay };
  const stands = standingEvent(q);
  if (!stands || stands.via !== "phone")
    throw new EmrWriteError("conflict", "There is no phone answer to dispute.");
  if (stands.answeredByUserId !== ctx.actor.userId)
    throw new EmrWriteError("forbidden", "Only the clinician it names may dispute a phone answer.");
  const id = await writeEvent(ctx, q, {
    kind: "disputed",
    note: input.note?.trim() || null,
    clientKey: input.clientKey,
  });
  return { id };
}

/** RQ-8: written once per recipient when their screen renders the query. Never an answer. */
export async function recordQuerySeen(
  ctx: WriteCtx,
  input: { patientUserId: string; queryId: string },
): Promise<WriteResult> {
  await requirePrescriber(ctx, "read a pharmacy query");
  const data = await loadPatientPharmacy(ctx.tx, {
    hospitalId: ctx.actor.hospitalId,
    patientUserId: input.patientUserId,
    queryIds: [input.queryId],
  });
  const q = data.queries[0];
  if (!q) throw new EmrWriteError("not_found", "That query is not in this patient's record.");
  const notified = q.events.find(
    (e) => e.kind === "notified" && e.recipientUserId === ctx.actor.userId,
  );
  const id = await writeEvent(ctx, q, {
    kind: "seen",
    recipientUserId: ctx.actor.userId,
    recipientRole: notified?.recipientRole ?? null,
    clientKey: `seen:${q.id}:${ctx.actor.userId}`,
  });
  return { id };
}

/** The line the pharmacy did not supply, and that outcome, while it stands. */
async function noticeOf(ctx: WriteCtx, patientUserId: string, lineEventId: string) {
  const data = await loadPatientPharmacy(ctx.tx, {
    hospitalId: ctx.actor.hospitalId,
    patientUserId,
  });
  for (const lineId of data.lines.keys()) {
    const outcome = notSuppliedOutcome(data, lineId);
    if (outcome?.id === lineEventId) return { lineId };
  }
  throw new EmrWriteError(
    "not_found",
    "That notice is not in this patient's record, or the line has moved on.",
  );
}

/** RQ-11: one acknowledgement per notice (0132, UNIQUE on the line event); a repeat returns the first. */
async function writeAck(
  ctx: WriteCtx,
  input: { patientUserId: string; lineEventId: string },
  choice: "left_as_is" | "alternative_chosen",
  replacedBy: string | null = null,
): Promise<string> {
  const [row] = await ctx.tx
    .insert(pharmacyNoticeAcknowledgements)
    .values({
      hospitalId: ctx.actor.hospitalId,
      patientUserId: input.patientUserId,
      lineEventId: input.lineEventId,
      choice,
      replacedByPrescriptionId: replacedBy,
      actorUserId: ctx.actor.userId,
      acknowledgedAt: ctx.now,
    })
    .onConflictDoNothing({ target: pharmacyNoticeAcknowledgements.lineEventId })
    .returning({ id: pharmacyNoticeAcknowledgements.id });
  if (row) return row.id;
  const [had] = await ctx.tx
    .select({ id: pharmacyNoticeAcknowledgements.id })
    .from(pharmacyNoticeAcknowledgements)
    .where(eq(pharmacyNoticeAcknowledgements.lineEventId, input.lineEventId));
  return had!.id;
}

/** RQ-11: "Leave it as it is". Needs no answer; recorded once per notice, query or not. */
export async function acknowledgeNotSupplied(
  ctx: WriteCtx,
  input: { patientUserId: string; lineEventId: string },
): Promise<WriteResult> {
  await requirePrescriber(ctx, "acknowledge a not-supplied notice");
  await noticeOf(ctx, input.patientUserId, input.lineEventId);
  return { id: await writeAck(ctx, input, "left_as_is") };
}

/**
 * "Choose an alternative" on a not-supplied notice: the new line was placed through the plan; the
 * old one is cancelled naming it (H4), and the notice acknowledged naming it too.
 */
export async function chooseAlternative(
  ctx: WriteCtx,
  input: { patientUserId: string; lineEventId: string; replacedByClientKey: string },
): Promise<WriteResult> {
  const { lineId } = await noticeOf(ctx, input.patientUserId, input.lineEventId);
  const cancel = await cancelPrescriptionLine(ctx, {
    patientUserId: input.patientUserId,
    prescriptionId: lineId,
    reasonCode: CHANGED_REASON,
    replacedByClientKey: input.replacedByClientKey,
  });
  const [link] = await ctx.tx
    .select({ replacedBy: prescriptionCancellations.replacedByPrescriptionId })
    .from(prescriptionCancellations)
    .where(eq(prescriptionCancellations.prescriptionId, lineId));
  await writeAck(ctx, input, "alternative_chosen", link?.replacedBy ?? null);
  return cancel;
}

/* ─── D-PH1-49: the doctor's print record ─────────────────────────── */

/** One `prescription_print_events` row per printed line, written when the page is printed. */
export async function recordPrescriptionPrint(
  ctx: WriteCtx,
  input: { patientUserId: string; encounterId: string; prescriptionIds: readonly string[] },
): Promise<WriteResult> {
  const ids = [...new Set(input.prescriptionIds)];
  if (!ids.length) throw new EmrWriteError("invalid", "Nothing was printed.");
  const lines = await ctx.tx
    .select({ id: prescriptions.id })
    .from(prescriptions)
    .where(
      and(
        inArray(prescriptions.id, ids),
        eq(prescriptions.patientUserId, input.patientUserId),
        eq(prescriptions.hospitalId, ctx.actor.hospitalId),
        eq(prescriptions.encounterId, input.encounterId),
      ),
    );
  if (lines.length !== ids.length)
    throw new EmrWriteError("invalid", "A printed line is not on this visit's prescription.");
  const rows = await ctx.tx
    .insert(prescriptionPrintEvents)
    .values(
      ids.map((prescriptionId) => ({
        prescriptionId,
        hospitalId: ctx.actor.hospitalId,
        patientUserId: input.patientUserId,
        printedBy: ctx.actor.userId,
        printedAt: ctx.now,
      })),
    )
    .returning({ id: prescriptionPrintEvents.id });
  return { id: rows[0]!.id };
}
