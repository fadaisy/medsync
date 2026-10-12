import type { EmrDb } from "@/lib/emr/db";
import type { ActionResult } from "@/lib/emr/write/context";
import type { LineEventKind, PharmacyLineEvent, QueryLite, StatusKey } from "@/lib/pharmacy/lines";
import type { Group, GroupLine, HospitalContext } from "@/lib/pharmacy/review/load";
import type { RecipientRole } from "@/lib/pharmacy/review/queries";
import type { PharmacyActor, PharmacyCtx, PharmacyNeed } from "@/lib/pharmacy/write";
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";

import { COSIGN_CAUTION } from "@/content/pharmacy";
import {
  CLOSE_REASONS,
  DECLINE_REASONS,
  FILLED_SAID_BY,
  NOT_SUPPLIED_REASONS,
  PHONE_SAID,
  QUERY_CODES,
  REVIEW,
  WITHDRAW_REASONS,
  WITHOUT_PHARMACIST_REASONS,
} from "@/content/pharmacy-review";
import { staffAffiliations } from "@/db/schema/clinician-profiles";
import {
  pharmacyLegalAnswers,
  pharmacyLineEvents,
  pharmacyPaymentStatuses,
  pharmacyPrintEvents,
  pharmacyQueries,
  pharmacyQueryEvents,
  pharmacyScopeEntries,
  pharmacySlips,
} from "@/db/schema/pharmacy-dispensing";
import { encounters } from "@/db/schema/scheduling";
import { asClinicalWriter } from "@/lib/emr/db";
import { EmrWriteError } from "@/lib/emr/write/context";
import { inScope, keyOf, queryState } from "@/lib/pharmacy/lines";
import { newVerificationCode } from "@/lib/pharmacy/print/slip";
import {
  foldWith,
  loadGroupOfLine,
  loadHospitalContext,
  loadShelf,
  shelfKey,
} from "@/lib/pharmacy/review/load";
import {
  phoneAnswerEffect,
  QUERY_COPY,
  resolveRecipients,
  withdrawEffect,
} from "@/lib/pharmacy/review/queries";
import {
  acceptKind,
  mayDecline,
  mayRecordNotSupplied,
  remainingLines,
  reviewBasis,
  supplyWithoutReviewAllowed,
  WAITING_FOR_PHARMACIST,
} from "@/lib/pharmacy/review/review";
import { proposeBatches } from "@/lib/pharmacy/stock/fefo";
import { localDate } from "@/lib/pharmacy/stock/ledger";
import { lockLine } from "@/lib/pharmacy/write";

/**
 * Review, queries and outcomes, written (Pharmacy Phase 1, 5.3 to 5.5, 5.7, RQ-1..RQ-12, LO-4, LO-7,
 * LO-8; Section 8's Review, Queries-pharmacy and Outcomes groups). Each write is `(ctx, input) => {id}`
 * for `runPharmacyWrite`, inside its one transaction: it takes `lockLine` for every line of the
 * prescription (ADR 0265), loads the line's record under the locks, asks the engines (`lines.ts`,
 * `review.ts`, `queries.ts`) whether the move is allowed by folding the event it is about to write, and
 * writes only that. A refused move is an `EmrWriteError("conflict")` in words. Nothing here writes to
 * `prescriptions` (Law 2) or moves stock.
 *
 * Idempotency: line events and queries carry the client key (`{key}` or `{key}:{line}` for a write over
 * several lines); payment, scope and slip rows take the client key as their id. A repeat returns the
 * first write's id.
 *
 * Payment status (SU-12) is an append-only row of `pharmacy_payment_statuses` (0131); the status in force
 * is the latest for the placement.
 *
 * Query event columns, as used here (0125 has no column of its own for these): a withdrawal's coded
 * reason and a call's "will change it" / "stop it" go in `answer_reason_code`; the clinician spoken to
 * on a logged call goes in `answered_by_user_id`.
 */

/** What a review action answers the client: `{ ok, id, serverTime }` or a refusal in words. */
export type ReviewResult<T = undefined> = ActionResult<T>;

export const REVIEW_NEED: PharmacyNeed = { permission: "pharmacy.review", point: "live" };
export const DISPENSE_NEED: PharmacyNeed = { permission: "pharmacy.dispense", point: "live" };
export const QUERY_NEED: PharmacyNeed = {
  permission: ["pharmacy.dispense", "pharmacy.review"],
  point: "live",
};
/** Closing, confirming and correcting: a point live now, or once (RD-3). */
export const CLOSE_NEED: PharmacyNeed = {
  permission: "pharmacy.dispense",
  point: "live_or_was_live",
};

/* ─── Inputs ──────────────────────────────────────────────────────────── */

const key = z.uuid();
const lineId = z.uuid();
const keys = <T extends Record<string, string>>(o: T) =>
  z.enum(Object.keys(o) as [keyof T & string, ...(keyof T & string)[]]);
const note = z
  .string()
  .trim()
  .max(1000)
  .optional()
  .transform((s) => (s ? s : null));
const otherNeedsNote = <T extends { reasonCode: string; note: string | null }>(v: T) =>
  v.reasonCode !== "other" || (v.note?.length ?? 0) >= 3;
const noteMessage = { message: "Say what happened.", path: ["note"] };
const qty = z.number().int().positive().max(100_000);

export const LineInput = z.object({ clientKey: key, lineId });
export const DeclineInput = z
  .object({ clientKey: key, lineId, reasonCode: keys(DECLINE_REASONS), note })
  .refine(otherNeedsNote, noteMessage);
export const DecisionsInput = z.object({
  clientKey: key,
  decisions: z
    .array(
      z.union([
        z.object({ lineId, kind: z.literal("full"), quantity: qty, daysCovered: qty.optional() }),
        z.object({
          lineId,
          kind: z.literal("part"),
          quantity: qty,
          notSupplied: qty.optional(),
          rest: z.enum(["owed", "buying_outside"]),
          daysCovered: qty.optional(),
        }),
      ]),
    )
    .min(1)
    .max(50),
});
export const PaymentInput = z
  .object({
    clientKey: key,
    lineId,
    status: z.enum(["paid", "exempt", "insured", "emergency", "not_recorded"]),
    detail: z
      .string()
      .trim()
      .max(200)
      .optional()
      .transform((s) => (s ? s : null)),
  })
  .refine((v) => v.status !== "insured" || v.detail !== null, {
    message: "Name the scheme.",
    path: ["detail"],
  });
export const WithoutReviewInput = z
  .object({ clientKey: key, lineId, reasonCode: keys(WITHOUT_PHARMACIST_REASONS), note })
  .refine(otherNeedsNote, noteMessage);
export const QueryInput = z.object({
  clientKey: key,
  lineId,
  whole: z.boolean().default(false),
  typeCode: keys(QUERY_CODES),
  proposal: z.string().trim().min(1, "Say what you propose.").max(500),
  patientWaiting: z.boolean().default(false),
});
export const PhoneInput = z
  .object({
    clientKey: key,
    queryId: z.uuid(),
    clinicianUserId: z.uuid(),
    said: keys(PHONE_SAID),
    reasonCode: z.string().trim().min(2).max(60).optional(),
    note,
    at: z.iso.datetime({ offset: true }).optional(),
  })
  .refine((v) => v.said !== "keep" || !!v.reasonCode || (v.note?.length ?? 0) >= 3, {
    message: "Give their reason.",
    path: ["note"],
  });
export const WithdrawInput = z
  .object({ clientKey: key, queryId: z.uuid(), reasonCode: keys(WITHDRAW_REASONS), note })
  .refine(otherNeedsNote, noteMessage);
export const NotSuppliedInput = z
  .object({
    clientKey: key,
    lineId,
    outcome: z.enum(["owed", "buying_outside"]),
    reasonCode: keys(NOT_SUPPLIED_REASONS),
    note,
    quantityNotSupplied: qty.optional(),
    patientTold: z.string().trim().max(500).optional(),
  })
  .refine(otherNeedsNote, noteMessage);
export const FilledInput = z.object({
  clientKey: key,
  lineId,
  saidBy: keys(FILLED_SAID_BY),
  name: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((s) => (s ? s : null)),
});
export const CloseInput = z
  .object({ clientKey: key, lineId, reasonCode: keys(CLOSE_REASONS), note })
  .refine(otherNeedsNote, noteMessage);

/* ─── Shared ─────────────────────────────────────────────────────────── */

const conflict = (m: string) => new EmrWriteError("conflict", m);
const dbOf = (ctx: PharmacyCtx) => ctx.tx as unknown as EmrDb;
const NOT_HERE = "That prescription is not at your hospital.";
const OUT_OF_SCOPE = "This prescription is not in the queue. Bring it into the queue first.";

interface Locked {
  h: HospitalContext;
  group: Group;
  line: GroupLine;
}

/** ADR 0265: lock every line of the prescription (in one order), then read its record under the locks. */
async function locked(
  ctx: PharmacyCtx,
  id: string,
  opts: { scope?: boolean } = {},
): Promise<Locked> {
  const h = await loadHospitalContext(dbOf(ctx), ctx.actor.hospitalId);
  const first = await loadGroupOfLine(dbOf(ctx), h, id);
  if (!first) throw new EmrWriteError("not_found", NOT_HERE);
  for (const l of [...first.group.lines.map((x) => x.row.id)].sort()) await lockLine(ctx.tx, l);
  const again = await loadGroupOfLine(dbOf(ctx), h, id);
  if (!again) throw new EmrWriteError("not_found", NOT_HERE);
  if (opts.scope !== false && again.group.scope === "out") throw conflict(OUT_OF_SCOPE);
  return { h, ...again };
}

/** A repeat of a write already made: the id of its first row. */
async function replayed(ctx: PharmacyCtx, clientKey: string): Promise<string | null> {
  const [row] = await ctx.tx
    .select({ id: pharmacyLineEvents.id })
    .from(pharmacyLineEvents)
    .where(
      and(
        eq(pharmacyLineEvents.hospitalId, ctx.actor.hospitalId),
        or(
          eq(pharmacyLineEvents.clientKey, clientKey),
          sql`${pharmacyLineEvents.clientKey} LIKE ${`${clientKey}:%`}`,
        ),
      ),
    )
    .limit(1);
  return row?.id ?? null;
}

type EventValues = Partial<typeof pharmacyLineEvents.$inferInsert>;

/** The event as the fold reads it, before it is written. */
function probe(ctx: PharmacyCtx, group: Group, kind: LineEventKind, v: EventValues = {}) {
  return {
    id: "probe",
    kind,
    occurredAt: ctx.now,
    effectiveAt: ctx.now,
    lane: group.lane.lane,
    quantitySupplied: v.quantitySupplied ?? null,
    quantityNotSupplied: v.quantityNotSupplied ?? null,
    reasonCode: v.reasonCode ?? null,
    handoverId: null,
    actorCadre: null,
  } satisfies PharmacyLineEvent;
}

/** Only what LO-4 allows: the event must take the line where the action says it goes. */
function mustMove(
  ctx: PharmacyCtx,
  { group, line }: Pick<Locked, "group" | "line">,
  kind: LineEventKind,
  to: StatusKey,
  v: EventValues = {},
  extraQueries: readonly QueryLite[] = [],
) {
  const after = foldWith(group, line, {
    events: [probe(ctx, group, kind, v)],
    queries: extraQueries,
  });
  if (keyOf(after) !== to) throw conflict(refusal(line));
}

/** Words for a line that cannot take the move: where it stands now. */
function refusal(line: GroupLine): string {
  const s = line.status;
  if (!s) return OUT_OF_SCOPE;
  if (s.kind === "stage") {
    if (s.stage === "awaiting_cosign") return COSIGN_CAUTION.text;
    if (s.stage === "queried")
      return `${line.row.drugName} has a query open with the prescriber. Withdraw it, or wait for the answer.`;
    if (s.stage === "ready") return `${line.row.drugName} is already accepted.`;
    return `${line.row.drugName} has not been accepted yet.`;
  }
  return `${line.row.drugName} already has an outcome: ${REVIEW.outcome[s.outcome].toLowerCase()}.`;
}

async function writeEvent(
  ctx: PharmacyCtx,
  { group, line }: Pick<Locked, "group" | "line">,
  kind: LineEventKind,
  clientKey: string,
  v: EventValues = {},
): Promise<string> {
  const [row] = await ctx.tx
    .insert(pharmacyLineEvents)
    .values({
      hospitalId: ctx.actor.hospitalId,
      prescriptionId: line.row.id,
      patientUserId: line.row.patientUserId,
      dispensingPointId: ctx.point?.id ?? null,
      kind,
      lane: group.lane.lane,
      laneReasons: group.lane.reasons,
      ruleVersion: group.lane.ruleVersion,
      actorUserId: ctx.actor.userId,
      actorCadre: ctx.actor.cadreName,
      occurredAt: ctx.now,
      effectiveAt: ctx.now,
      clientKey,
      ...v,
    })
    .returning({ id: pharmacyLineEvents.id });
  return row!.id;
}

/** RQ-11, D-PH1-47: a PHI-free nudge on the prescriber's own topic. Never throws, never rolls back. */
async function nudge(ctx: PharmacyCtx, userId: string, kind: string, ref: string) {
  await ctx.tx
    .transaction(async (sp) => {
      await sp.execute(
        sql`SELECT private.notify_user_event(${userId}::uuid, 'pharmacy', ${kind}, ${ref}::uuid)`,
      );
    })
    .catch(() => undefined);
}

const stageOf = (line: GroupLine) => (line.status?.kind === "stage" ? line.status.stage : null);

function notReviewOnly(group: Group) {
  if (group.scope === "review_only") throw conflict(REVIEW.review.ward);
}

/* ─── Review (Section 8: pharmacy.review) ─────────────────────────────── */

/** RQ-1, LN-2, S14: one line's acceptance; "Reason accepted, supply" where a stop was overridden. */
export async function acceptLine(ctx: PharmacyCtx, input: z.infer<typeof LineInput>) {
  const again = await replayed(ctx, input.clientKey);
  if (again) return { id: again };
  const l = await locked(ctx, input.lineId);
  if (l.group.lane.lane === "standard")
    throw conflict("This prescription is in the standard lane: it needs no acceptance.");
  const kind = acceptKind(l.line.reasons);
  mustMove(ctx, l, kind, l.group.scope === "review_only" ? "reviewed" : "ready");
  return { id: await writeEvent(ctx, l, kind, input.clientKey) };
}

/** S14: the lines with no lane reason, in one tap; a line with a reason is left for its own tap. */
export async function acceptRemainingLines(ctx: PharmacyCtx, input: z.infer<typeof LineInput>) {
  const again = await replayed(ctx, input.clientKey);
  if (again) return { id: again, accepted: 0 };
  const l = await locked(ctx, input.lineId);
  const { group } = l;
  const waiting = group.lines.filter((x) => stageOf(x) === "to_review");
  const accepted = new Set(
    group.lines
      .filter((x) => reviewBasis(group.lane.lane, x.row.id, x.reviewEvents) !== null)
      .map((x) => x.row.id),
  );
  const ids = remainingLines(
    group.lane.lane,
    group.lane.perLine,
    waiting.map((x) => x.row.id),
    accepted,
  );
  if (!ids.length) throw conflict("No line without a lane reason is waiting for acceptance.");
  const to = group.scope === "review_only" ? "reviewed" : "ready";
  let first: string | null = null;
  for (const id of ids) {
    const line = group.lines.find((x) => x.row.id === id)!;
    mustMove(ctx, { group, line }, "accepted", to);
    const eventId = await writeEvent(ctx, { group, line }, "accepted", `${input.clientKey}:${id}`);
    first ??= eventId;
  }
  return { id: first!, accepted: ids.length };
}

/** LO-7, S29: decline a line whose current version was queried. An open query on it closes. */
export async function declineLine(ctx: PharmacyCtx, input: z.infer<typeof DeclineInput>) {
  const again = await replayed(ctx, input.clientKey);
  if (again) return { id: again };
  const l = await locked(ctx, input.lineId);
  const lites = l.group.queries.map((q) => q.lite);
  if (!mayDecline({ access: ctx.actor.access, lineId: l.line.row.id, queries: lites }))
    throw conflict("A line can be declined only after a query on it was sent to the prescriber.");
  const open = l.group.queries.filter(
    (q) =>
      q.scope === "line" && q.lite.lineIds.includes(l.line.row.id) && queryState(q.lite) === "open",
  );
  const closing: QueryLite[] = open.map((q) => ({
    ...q.lite,
    events: [...q.lite.events, { kind: "withdrawn", at: ctx.now }],
  }));
  // The fold with the open queries closed, as the write leaves them.
  const after = foldWith(
    { ...l.group, queries: l.group.queries.filter((q) => !open.includes(q)) },
    l.line,
    {
      events: [probe(ctx, l.group, "declined", { reasonCode: input.reasonCode })],
      queries: closing,
    },
  );
  if (keyOf(after) !== "declined") throw conflict(refusal(l.line));
  for (const q of open)
    await ctx.tx.insert(pharmacyQueryEvents).values({
      queryId: q.id,
      hospitalId: ctx.actor.hospitalId,
      kind: "withdrawn",
      answerReasonCode: "line_declined",
      actorUserId: ctx.actor.userId,
      occurredAt: ctx.now,
    });
  const id = await writeEvent(ctx, l, "declined", input.clientKey, {
    reasonCode: input.reasonCode,
    reasonNote: input.note,
    patientTold: REVIEW.patientDeclined,
  });
  await nudge(ctx, l.line.row.prescriberUserId, "not_supplied", id);
  return { id };
}

/* ─── Review (Section 8: pharmacy.dispense) ───────────────────────────── */

/**
 * 5.3: stage one supply decision per line (`decision_saved`, JSON {kind, productId, batches, quantity,
 * notSupplied, rest, daysCovered}). Moves no stock: the hand-over re-checks every batch under the lock
 * (SU-2). A pharmacist-first line needs its acceptance first (LN-2); a standard line moves to Ready.
 */
export async function saveLineDecisions(ctx: PharmacyCtx, input: z.infer<typeof DecisionsInput>) {
  const again = await replayed(ctx, input.clientKey);
  if (again) return { id: again };
  const l = await locked(ctx, input.decisions[0]!.lineId);
  const { group } = l;
  notReviewOnly(group);
  const point = ctx.point!;
  const shelf = await loadShelf(
    dbOf(ctx),
    ctx.actor.hospitalId,
    group.lines.map((x) => x.row.drugId),
  );
  const today = localDate(ctx.now);
  let first: string | null = null;
  for (const d of input.decisions) {
    const line = group.lines.find((x) => x.row.id === d.lineId);
    if (!line) throw new EmrWriteError("invalid", "Each line must be of this prescription.");
    const stage = stageOf(line);
    if (stage !== "to_review" && stage !== "ready") throw conflict(refusal(line));
    if (line.row.controlled) throw conflict(REVIEW.review.controlledBeforeStep7);
    if (
      group.lane.lane === "pharmacist_first" &&
      reviewBasis(group.lane.lane, line.row.id, line.reviewEvents) === null
    )
      throw conflict(
        `${WAITING_FOR_PHARMACIST}: ${line.row.drugName} needs a pharmacist's acceptance first.`,
      );
    const products = shelf.products.get(shelfKey(point.id, line.row.drugId)) ?? [];
    if (!products.length) throw conflict(REVIEW.review.noProduct(point.name));
    let chosen: { productId: string; batches: { batchId: string; quantity: number }[] } | null =
      null;
    let available = 0;
    for (const p of products) {
      const proposal = proposeBatches({
        batches: shelf.batches.filter((b) => b.productId === p.id && b.pointId === point.id),
        balances: shelf.balances,
        quantity: d.quantity,
        localDate: today,
      });
      if (proposal.ok) {
        chosen = { productId: p.id, batches: proposal.rows };
        break;
      }
      if (proposal.reason === "not_enough") available = Math.max(available, proposal.available);
    }
    if (!chosen)
      throw conflict(
        `Only ${available} ${products[0]!.issueUnit} of ${line.row.drugName} on the shelf here. Choose Supply part, or Not on the shelf.`,
      );
    const decision = {
      kind: d.kind,
      productId: chosen.productId,
      batches: chosen.batches,
      quantity: d.quantity,
      notSupplied: d.kind === "part" ? (d.notSupplied ?? null) : null,
      rest: d.kind === "part" ? d.rest : null,
      daysCovered: d.daysCovered ?? null,
    };
    mustMove(ctx, { group, line }, "decision_saved", "ready");
    const id = await writeEvent(
      ctx,
      { group, line },
      "decision_saved",
      input.decisions.length === 1 ? input.clientKey : `${input.clientKey}:${line.row.id}`,
      { decision },
    );
    first ??= id;
  }
  return { id: first! };
}

/** SU-12, 0131: the payment status, set before the hand-over. MedSync checks no payment. */
export async function setPaymentStatus(ctx: PharmacyCtx, input: z.infer<typeof PaymentInput>) {
  const [done] = await ctx.tx
    .select({ id: pharmacyPaymentStatuses.id })
    .from(pharmacyPaymentStatuses)
    .where(eq(pharmacyPaymentStatuses.id, input.clientKey));
  if (done) return { id: done.id };
  if (input.status === "exempt") throw conflict(REVIEW.review.exemptUnsigned);
  const { line } = await locked(ctx, input.lineId);
  const [row] = await ctx.tx
    .insert(pharmacyPaymentStatuses)
    .values({
      id: input.clientKey,
      hospitalId: ctx.actor.hospitalId,
      patientUserId: line.row.patientUserId,
      prescriptionId: line.row.id,
      placementId: line.row.placementId,
      status: input.status,
      detail: input.status === "paid" || input.status === "insured" ? input.detail : null,
      dispensingPointId: ctx.point!.id,
      actorUserId: ctx.actor.userId,
      recordedAt: ctx.now,
    })
    .returning({ id: pharmacyPaymentStatuses.id });
  return { id: row!.id };
}

/** LO-6, S32: an earlier prescription brought into the queue by a person. */
export async function bringIntoQueue(ctx: PharmacyCtx, input: z.infer<typeof LineInput>) {
  const [done] = await ctx.tx
    .select({ id: pharmacyScopeEntries.id })
    .from(pharmacyScopeEntries)
    .where(eq(pharmacyScopeEntries.id, input.clientKey));
  if (done) return { id: done.id };
  const { h, group } = await locked(ctx, input.lineId, { scope: false });
  if (group.scope !== "out") throw conflict("This prescription is already in the queue.");
  const would = inScope({
    writtenAt: group.writtenAt,
    firstLiveAt: h.firstLiveAt,
    broughtIn: true,
    lane: group.lane.lane,
    origin: group.origin,
    inpatientSupply: h.settings.individualInpatientSupply,
  });
  if (would === "out")
    throw conflict(
      "A standard-lane ward prescription is not reviewed at the pharmacy while individual inpatient supply is off.",
    );
  const first = group.lines[0]!.row;
  await ctx.tx
    .insert(pharmacyScopeEntries)
    .values({
      id: input.clientKey,
      hospitalId: ctx.actor.hospitalId,
      prescriptionId: first.id,
      placementId: first.placementId,
      dispensingPointId: ctx.point!.id,
      broughtBy: ctx.actor.userId,
      broughtAt: ctx.now,
    })
    .onConflictDoNothing();
  const [row] = await ctx.tx
    .select({ id: pharmacyScopeEntries.id })
    .from(pharmacyScopeEntries)
    .where(eq(pharmacyScopeEntries.prescriptionId, first.id));
  return { id: row!.id };
}

const WITHOUT_REFUSAL = {
  controlled: "A controlled line is never supplied without a pharmacist.",
  setting_off: "Supply without a pharmacist is not switched on at this hospital.",
  no_legal_answer:
    "Supply without a pharmacist needs an answer to legal question 1 on record. Wait for a pharmacist.",
  not_permitted: "You do not have permission to do this.",
} as const;

/** RQ-12, D-PH1-05: only where the setting is on; never controlled; goes to the look-back list. */
export async function recordSupplyWithoutReview(
  ctx: PharmacyCtx,
  input: z.infer<typeof WithoutReviewInput>,
) {
  const again = await replayed(ctx, input.clientKey);
  if (again) return { id: again };
  const l = await locked(ctx, input.lineId);
  notReviewOnly(l.group);
  const [legal] = await ctx.tx
    .select({ id: pharmacyLegalAnswers.id })
    .from(pharmacyLegalAnswers)
    .where(
      and(
        eq(pharmacyLegalAnswers.question, 1),
        or(
          eq(pharmacyLegalAnswers.hospitalId, ctx.actor.hospitalId),
          isNull(pharmacyLegalAnswers.hospitalId),
        ),
      ),
    )
    .limit(1);
  const allowed = supplyWithoutReviewAllowed({
    settingOn: l.h.settings.supplyWithoutPharmacist,
    legalQ1OnRecord: !!legal,
    controlled: l.line.row.controlled,
    access: ctx.actor.access,
  });
  if (!allowed.ok) throw conflict(WITHOUT_REFUSAL[allowed.reason]);
  if (l.group.lane.lane !== "pharmacist_first")
    throw conflict("This prescription is in the standard lane: it needs no pharmacist.");
  mustMove(ctx, l, "supplied_without_review", "ready", { reasonCode: input.reasonCode });
  return {
    id: await writeEvent(ctx, l, "supplied_without_review", input.clientKey, {
      reasonCode: input.reasonCode,
      reasonNote: input.note,
    }),
  };
}

/* ─── Queries, pharmacy (Section 8: dispense or review) ───────────────── */

export interface Recipients {
  recipients: { userId: string; role: RecipientRole }[];
  skipped: { userId: string; role: RecipientRole; why: "inactive" }[];
}

/** RQ-3: the prescriber and the encounter's clinician, each only while still on the staff here. */
export async function recipientsFor(
  database: EmrDb,
  hospitalId: string,
  prescriberUserId: string,
  encounterId: string | null,
): Promise<Recipients> {
  const [enc] = encounterId
    ? await database
        .select({ clinicianUserId: encounters.clinicianUserId })
        .from(encounters)
        .where(and(eq(encounters.id, encounterId), eq(encounters.hospitalId, hospitalId)))
    : [];
  const responsible = enc?.clinicianUserId ?? null;
  const ids = [prescriberUserId, ...(responsible ? [responsible] : [])];
  const active = await database
    .select({ userId: staffAffiliations.userId })
    .from(staffAffiliations)
    .where(
      and(
        eq(staffAffiliations.hospitalId, hospitalId),
        inArray(staffAffiliations.userId, ids),
        inArray(staffAffiliations.state, ["active", "approved"]),
      ),
    );
  const on = new Set(active.map((a) => a.userId));
  return resolveRecipients({
    prescriberUserId,
    prescriberActive: on.has(prescriberUserId),
    responsibleClinicianUserId: responsible,
    responsibleActive: !!responsible && on.has(responsible),
  });
}

const STAGED = new Set(["awaiting_cosign", "to_review", "ready"]);

/**
 * 5.4, RQ-2, RQ-3, RQ-5: the query, committed on its own. Delivery is the second step
 * (`deliverQuery`), after commit, so a failed notification never removes the query.
 */
export async function sendQuery(
  ctx: PharmacyCtx,
  input: z.infer<typeof QueryInput>,
): Promise<{ id: string } & Recipients & { replay: boolean }> {
  const [done] = await ctx.tx
    .select({ id: pharmacyQueries.id })
    .from(pharmacyQueries)
    .where(eq(pharmacyQueries.clientKey, input.clientKey));
  if (done) return { id: done.id, recipients: [], skipped: [], replay: true };
  const l = await locked(ctx, input.lineId);
  const { group, line } = l;
  const covered = input.whole ? group.lines.filter((x) => STAGED.has(stageOf(x) ?? "")) : [line];
  if (!covered.length || !covered.every((x) => STAGED.has(stageOf(x) ?? "")))
    throw conflict(refusal(input.whole ? line : covered[0]!));
  const [row] = await ctx.tx
    .insert(pharmacyQueries)
    .values({
      hospitalId: ctx.actor.hospitalId,
      patientUserId: line.row.patientUserId,
      scope: input.whole ? "prescription" : "line",
      prescriptionId: input.whole ? covered[0]!.row.id : line.row.id,
      placementId: group.placementId,
      typeCode: input.typeCode,
      proposal: input.proposal,
      patientWaiting: input.patientWaiting,
      dispensingPointId: ctx.point!.id,
      senderUserId: ctx.actor.userId,
      senderCadre: ctx.actor.cadreName,
      createdAt: ctx.now,
      clientKey: input.clientKey,
    })
    .returning({ id: pharmacyQueries.id });
  const who = await recipientsFor(
    dbOf(ctx),
    ctx.actor.hospitalId,
    line.row.prescriberUserId,
    line.row.encounterId,
  );
  return { id: row!.id, ...who, replay: false };
}

export interface Delivery {
  delivered: boolean;
  words: string;
  caution: boolean;
}

/**
 * D-PH1-47, RQ-3, RQ-10, Law 11: the second step, after the query committed. Writes `notified` per
 * recipient (the 0125 trigger publishes `{kind, ref, at}` on `user:<id>`) and `skipped` per skipped
 * recipient. If that fails it tries to record `notify_failed`. It never throws: the query stands
 * either way, and the pharmacy is told in words.
 */
export async function deliverQuery(
  actor: Pick<PharmacyActor, "userId" | "hospitalId">,
  queryId: string,
  who: Recipients,
  options?: { database?: EmrDb; now?: Date },
): Promise<Delivery> {
  const at = options?.now ?? new Date();
  const scope = { userId: actor.userId, hospitalId: actor.hospitalId };
  const base = { queryId, hospitalId: actor.hospitalId, actorUserId: actor.userId, occurredAt: at };
  try {
    const delivered = await asClinicalWriter(
      scope,
      async (tx) => {
        const [already] = await tx
          .select({ kind: pharmacyQueryEvents.kind })
          .from(pharmacyQueryEvents)
          .where(
            and(
              eq(pharmacyQueryEvents.queryId, queryId),
              inArray(pharmacyQueryEvents.kind, ["notified", "skipped"]),
            ),
          )
          .limit(1);
        if (already) return already.kind === "notified";
        const rows = [
          ...who.recipients.map((r) => ({
            ...base,
            kind: "notified",
            recipientUserId: r.userId,
            recipientRole: r.role,
          })),
          ...who.skipped.map((r) => ({
            ...base,
            kind: "skipped",
            recipientUserId: r.userId,
            recipientRole: r.role,
          })),
        ];
        if (rows.length) await tx.insert(pharmacyQueryEvents).values(rows);
        return who.recipients.length > 0;
      },
      options?.database,
    );
    if (delivered)
      return {
        delivered: true,
        words: QUERY_COPY.sent.replace("{time}", hhmm(at)),
        caution: false,
      };
    return { delivered: false, words: QUERY_COPY.nobody, caution: true };
  } catch {
    try {
      await asClinicalWriter(
        scope,
        async (tx) => {
          if (who.recipients.length)
            await tx.insert(pharmacyQueryEvents).values(
              who.recipients.map((r) => ({
                ...base,
                kind: "notify_failed",
                recipientUserId: r.userId,
                recipientRole: r.role,
              })),
            );
        },
        options?.database,
      );
    } catch {
      // Nothing more to do: the query has no `notified`, so it reads "NOT told" everywhere.
    }
    return { delivered: false, words: QUERY_COPY.notTold, caution: true };
  }
}

const hhmm = (d: Date) =>
  new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Kampala",
  }).format(d);

async function lockedQuery(ctx: PharmacyCtx, queryId: string) {
  const [q] = await ctx.tx
    .select({ prescriptionId: pharmacyQueries.prescriptionId })
    .from(pharmacyQueries)
    .where(
      and(eq(pharmacyQueries.id, queryId), eq(pharmacyQueries.hospitalId, ctx.actor.hospitalId)),
    );
  if (!q) throw new EmrWriteError("not_found", "That query is not at your hospital.");
  const l = await locked(ctx, q.prescriptionId);
  const query = l.group.queries.find((x) => x.id === queryId)!;
  if (queryState(query.lite) !== "open")
    throw conflict("This query has already been answered or withdrawn.");
  return { ...l, query };
}

async function queryReplay(ctx: PharmacyCtx, clientKey: string) {
  const [row] = await ctx.tx
    .select({ id: pharmacyQueryEvents.id })
    .from(pharmacyQueryEvents)
    .where(eq(pharmacyQueryEvents.clientKey, clientKey));
  return row?.id ?? null;
}

/** RQ-6 basis, as 0125's `private.may_prescribe_here()`: the cadre's routine prescribing policy here. */
async function mayPrescribeHere(ctx: PharmacyCtx, userId: string) {
  const rows = (await ctx.tx.execute(
    sql`SELECT EXISTS (
          SELECT 1 FROM public.staff_affiliations sa
            JOIN public.cadres c ON c.id = sa.cadre_id
            JOIN public.clinical_cosign_policies cp
              ON cp.hospital_id = sa.hospital_id AND cp.cadre_code = c.code
             AND cp.action_kind = 'prescription_routine' AND cp.requirement IN ('allowed','cosign_required')
           WHERE sa.user_id = ${userId}::uuid AND sa.hospital_id = ${ctx.actor.hospitalId}::uuid
             AND sa.state IN ('approved','active')) AS ok`,
  )) as unknown as { ok: boolean }[] | { rows: { ok: boolean }[] };
  const list = Array.isArray(rows) ? rows : rows.rows;
  return list[0]?.ok === true;
}

/** 5.4, RQ-7: a logged call. Only a "keep" from a clinician who may prescribe here answers the query. */
export async function logPhoneAnswer(ctx: PharmacyCtx, input: z.infer<typeof PhoneInput>) {
  const again = await queryReplay(ctx, input.clientKey);
  if (again) return { id: again, answered: false };
  const { query } = await lockedQuery(ctx, input.queryId);
  const [staff] = await ctx.tx
    .select({ userId: staffAffiliations.userId })
    .from(staffAffiliations)
    .where(
      and(
        eq(staffAffiliations.userId, input.clinicianUserId),
        eq(staffAffiliations.hospitalId, ctx.actor.hospitalId),
        inArray(staffAffiliations.state, ["active", "approved"]),
      ),
    )
    .limit(1);
  if (!staff) throw conflict("That person is not on the staff of this hospital.");
  const effect = phoneAnswerEffect({
    said: input.said,
    clinicianUserId: input.clinicianUserId,
    clinicianMayPrescribe: await mayPrescribeHere(ctx, input.clinicianUserId),
    loggedByUserId: ctx.actor.userId,
    reasonCode: input.reasonCode ?? null,
    note: input.note,
  });
  const said = input.at ? new Date(input.at) : ctx.now;
  const at =
    said.getTime() > ctx.now.getTime() || said.getTime() < query.createdAt.getTime()
      ? ctx.now
      : said;
  const [row] = await ctx.tx
    .insert(pharmacyQueryEvents)
    .values({
      queryId: query.id,
      hospitalId: ctx.actor.hospitalId,
      kind: effect.kind,
      answer: effect.kind === "answered" ? "keep" : null,
      via: effect.kind === "answered" ? "phone" : null,
      answerReasonCode:
        effect.kind === "answered"
          ? (input.reasonCode ?? null)
          : input.said === "keep"
            ? null
            : input.said,
      answeredByUserId: input.clinicianUserId,
      note: input.note,
      actorUserId: ctx.actor.userId,
      occurredAt: at,
      clientKey: input.clientKey,
    })
    .returning({ id: pharmacyQueryEvents.id });
  return { id: row!.id, answered: effect.kind === "answered" };
}

/** 5.4: the pharmacy withdraws a query, with a reason; its lines return to review. */
export async function withdrawQuery(ctx: PharmacyCtx, input: z.infer<typeof WithdrawInput>) {
  const again = await queryReplay(ctx, input.clientKey);
  if (again) return { id: again };
  const { group, query } = await lockedQuery(ctx, input.queryId);
  const effect = withdrawEffect(
    {
      scope: query.scope,
      lines: group.lines
        .filter((x) => query.lite.lineIds.includes(x.row.id) && x.status)
        .map((x) => ({ id: x.row.id, status: x.status! })),
    },
    input.reasonCode,
  );
  if (!effect.ok) throw new EmrWriteError("invalid", "Give a reason.");
  const [row] = await ctx.tx
    .insert(pharmacyQueryEvents)
    .values({
      queryId: query.id,
      hospitalId: ctx.actor.hospitalId,
      kind: "withdrawn",
      answerReasonCode: input.reasonCode,
      note: input.note,
      actorUserId: ctx.actor.userId,
      occurredAt: ctx.now,
      clientKey: input.clientKey,
    })
    .returning({ id: pharmacyQueryEvents.id });
  return { id: row!.id };
}

/* ─── Outcomes (Section 8: pharmacy.dispense) ─────────────────────────── */

/**
 * 5.5, LO-4, LO-8: owed, or the patient buys it outside. A pharmacist-first line needs an acceptance or
 * D-PH1-05's reason first (S13); a controlled line is never sent outside (B-53, LB-5).
 */
export async function recordNotSupplied(ctx: PharmacyCtx, input: z.infer<typeof NotSuppliedInput>) {
  const again = await replayed(ctx, input.clientKey);
  if (again) return { id: again };
  const l = await locked(ctx, input.lineId);
  notReviewOnly(l.group);
  if (input.outcome === "buying_outside" && l.line.row.controlled)
    throw conflict(REVIEW.notOnShelf.controlled);
  const stage = stageOf(l.line);
  if (stage !== "to_review" && stage !== "ready") throw conflict(refusal(l.line));
  if (
    !mayRecordNotSupplied({
      access: ctx.actor.access,
      lane: l.group.lane.lane,
      versionId: l.line.row.id,
      events: l.line.reviewEvents,
    })
  )
    throw conflict(
      `${WAITING_FOR_PHARMACIST}: a pharmacist must accept ${l.line.row.drugName} before it is recorded as not supplied.`,
    );
  const v: EventValues = {
    reasonCode: input.reasonCode,
    reasonNote: input.note,
    quantityNotSupplied: input.quantityNotSupplied ?? null,
    patientTold: input.patientTold || REVIEW.notOnShelf.patientTold,
  };
  mustMove(ctx, l, input.outcome, input.outcome, v);
  const id = await writeEvent(ctx, l, input.outcome, input.clientKey, v);
  await nudge(ctx, l.line.row.prescriberUserId, "not_supplied", id);
  return { id };
}

/** 5.7, S26: owed to buying outside, or back. */
export async function changeOpenOutcome(ctx: PharmacyCtx, input: z.infer<typeof LineInput>) {
  const again = await replayed(ctx, input.clientKey);
  if (again) return { id: again };
  const l = await locked(ctx, input.lineId);
  const s = l.line.status;
  if (s?.kind !== "open") throw conflict(refusal(l.line));
  const to = s.outcome === "owed" ? "buying_outside" : "owed";
  if (to === "buying_outside" && l.line.row.controlled)
    throw conflict(REVIEW.notOnShelf.controlled);
  mustMove(ctx, l, "open_outcome_changed", to);
  return { id: await writeEvent(ctx, l, "open_outcome_changed", input.clientKey) };
}

/** 5.7, S31: the patient or the other pharmacy says it was filled; who said so is stored. */
export async function confirmFilledElsewhere(ctx: PharmacyCtx, input: z.infer<typeof FilledInput>) {
  const again = await replayed(ctx, input.clientKey);
  if (again) return { id: again };
  const l = await locked(ctx, input.lineId);
  mustMove(ctx, l, "filled_elsewhere", "closed");
  return {
    id: await writeEvent(ctx, l, "filled_elsewhere", input.clientKey, {
      reasonCode: input.saidBy,
      reasonNote: input.name,
    }),
  };
}

/** 5.7: a person closes an open line, with a coded reason. */
export async function closeLine(ctx: PharmacyCtx, input: z.infer<typeof CloseInput>) {
  const again = await replayed(ctx, input.clientKey);
  if (again) return { id: again };
  const l = await locked(ctx, input.lineId);
  mustMove(ctx, l, "closed", "closed", { reasonCode: input.reasonCode });
  return {
    id: await writeEvent(ctx, l, "closed", input.clientKey, {
      reasonCode: input.reasonCode,
      reasonNote: input.note,
    }),
  };
}

/** 5.7, S30: every line still at a stage of a prescription written before today. */
export async function closePrescriptionNotCollected(
  ctx: PharmacyCtx,
  input: z.infer<typeof CloseInput>,
) {
  const again = await replayed(ctx, input.clientKey);
  if (again) return { id: again };
  const { group } = await locked(ctx, input.lineId);
  const staged = group.lines.filter((x) => x.status?.kind === "stage");
  if (!staged.length) throw conflict("Every line of this prescription already has an outcome.");
  let first: string | null = null;
  for (const line of staged) {
    const after = foldWith(group, line, {
      events: [probe(ctx, group, "closed_not_collected", { reasonCode: input.reasonCode })],
    });
    if (keyOf(after) !== "closed")
      throw conflict("Only a prescription written before today can be closed as not collected.");
    const id = await writeEvent(
      ctx,
      { group, line },
      "closed_not_collected",
      `${input.clientKey}:${line.row.id}`,
      { reasonCode: input.reasonCode, reasonNote: input.note },
    );
    first ??= id;
  }
  return { id: first! };
}

/**
 * 5.5, LB-5, LB-6, W1: the slip for this prescription's lines being bought outside. A new verification
 * code (redrawn on the rare clash); never a controlled line; never without the point's phone. Logged.
 */
export async function printSlip(
  ctx: PharmacyCtx,
  input: z.infer<typeof LineInput>,
  random: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n)),
) {
  const [done] = await ctx.tx
    .select({ id: pharmacySlips.id })
    .from(pharmacySlips)
    .where(eq(pharmacySlips.id, input.clientKey));
  if (done) return { id: done.id };
  const { group } = await locked(ctx, input.lineId);
  const outside = group.lines.filter(
    (x) => x.status?.kind === "open" && x.status.outcome === "buying_outside",
  );
  if (!outside.length) throw conflict(REVIEW.slip.noLines);
  if (outside.some((x) => x.row.controlled)) throw conflict(REVIEW.slip.controlled);
  const point = ctx.point!;
  if (!point.phone?.trim()) throw conflict(REVIEW.slip.noPhone(point.name));
  let slipId: string | null = null;
  for (let i = 0; !slipId && i < 5; i++) {
    const [row] = await ctx.tx
      .insert(pharmacySlips)
      .values({
        id: input.clientKey,
        hospitalId: ctx.actor.hospitalId,
        dispensingPointId: point.id,
        code: newVerificationCode(random),
        patientUserId: group.patientUserId,
        prescriptionIds: outside.map((x) => x.row.id),
        printedBy: ctx.actor.userId,
        printedAt: ctx.now,
      })
      .onConflictDoNothing({ target: pharmacySlips.code })
      .returning({ id: pharmacySlips.id });
    slipId = row?.id ?? null;
  }
  if (!slipId) throw conflict(REVIEW.refused.failed);
  await ctx.tx.insert(pharmacyPrintEvents).values({
    hospitalId: ctx.actor.hospitalId,
    dispensingPointId: point.id,
    kind: "slip",
    refId: slipId,
    actorUserId: ctx.actor.userId,
    printedAt: ctx.now,
  });
  return { id: slipId };
}
