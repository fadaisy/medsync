import type { StoreBatch, StoreMovement } from "./ledger";
import type { StockLocation } from "./write";
import type { EmrTx } from "@/lib/emr/db";
import type { PharmacyCtx } from "@/lib/pharmacy/write";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";

import { RETURN_REASONS } from "@/content/pharmacy-stores-store";
import {
  pharmacyBatches,
  pharmacyPrintEvents,
  pharmacyProducts,
  pharmacyStockMovements,
} from "@/db/schema/pharmacy-dispensing";
import {
  pharmacyIssueConfirmations,
  pharmacyIssues,
  pharmacyRequisitionLines,
  pharmacyRequisitions,
} from "@/db/schema/pharmacy-stores";
import { pharmacyLoanClosures } from "@/db/schema/pharmacy-stores-0182";
import { assertPicked } from "@/lib/pharmacy/distribution/store";
import { localDate } from "@/lib/pharmacy/stock/ledger";
import { arriveDispatch } from "@/lib/pharmacy/stores/dispatch";
import {
  confirmationAdjustments,
  loanBalances,
  planIssue,
  requisitionNext,
  returnRoute,
} from "./issue";
import {
  controlledSet,
  counterpartyOf,
  expiryField,
  isPharmacyPlace,
  productAt,
  quarantineFor,
  storeWitness,
} from "./location-store";
import { allows, issueAllowed } from "./locations";
import { lineRefusals } from "./receiving";
import { expiryLookahead, refusalWords } from "./receiving-store";
import {
  balancesAt,
  batchAtLocation,
  batchRef,
  fail,
  loadLocation,
  locationLive,
  move,
  movePair,
  requireLive,
} from "./write";

/**
 * Issues, requisitions, returns and loans, written (Pharmacy Phase 2, 5.3, IS-1 to IS-7; Section 8 raiseRequisition,
 * issueRequisition, refuseRequisitionLine, confirmIssueReceipt, returnStock, lendStock, borrowStock, closeLoan,
 * printVoucher, printLoanRecord). The engine (issue.ts) decides; every two-place movement is an SL-12 pair written
 * in this one transaction (movePair), first expiry first (IS-2), and the database guard refuses a blocked batch
 * and a balance below zero under the batch row lock. `confirmIssue` is the receiving end's one write, shared by
 * the pharmacy (here) and the ward (lane B).
 */

const key = z.uuid();
const quantity = z.number().int().positive().max(1_000_000);
const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((s) => (s ? s : null));

const lineList = z
  .array(z.object({ productId: z.uuid(), quantity }))
  .min(1, "Add at least one line.")
  .max(100)
  .refine(
    (ls) => new Set(ls.map((l) => l.productId)).size === ls.length,
    "Each product is on one line.",
  );

/* ─── The issue itself (IS-2, IS-6, LC-3, Law 7) ───────────────────────── */

/** The batches of a product at a location, with the ones under an open recall (SL-14). */
export async function productBatches(tx: EmrTx, location: StockLocation, productId: string) {
  const rows = await tx
    .select({
      id: pharmacyBatches.id,
      productId: pharmacyBatches.productId,
      medicineId: pharmacyProducts.medicineId,
      batchNumber: pharmacyBatches.batchNumber,
      expiry: pharmacyBatches.expiry,
      expiryMonthOnly: pharmacyBatches.expiryMonthOnly,
      recalled: sql<boolean>`private.pharmacy_batch_recalled(${pharmacyBatches.id})`,
    })
    .from(pharmacyBatches)
    .innerJoin(pharmacyProducts, eq(pharmacyProducts.id, pharmacyBatches.productId))
    .where(
      and(
        sql`coalesce(${pharmacyBatches.locationId}, ${pharmacyBatches.dispensingPointId}) = ${location.id}::uuid`,
        eq(pharmacyBatches.productId, productId),
      ),
    )
    .for("update", { of: pharmacyBatches });
  const batches: StoreBatch[] = rows.map((r) => ({ ...r, pointId: location.id }));
  const blocked = new Set(
    rows.filter((r) => r.recalled || location.kind === "quarantine").map((r) => r.id),
  );
  return { batches, blocked };
}

/** Law 7, LC-3: may stock leave `from` as an issue and reach `to`? Both live (an issue-only ward needs none). */
function checkIssuePlaces(from: StockLocation, to: StockLocation) {
  if (from.id === to.id) throw fail("invalid", "Choose another place to issue to.");
  requireLive(from);
  if (!locationLive(to)) throw fail("config", `${to.name} is not live yet.`);
  if (
    !allows(from.kind, from.wardSupplyModel, "issued", "out") ||
    !issueAllowed(from.kind, to.kind)
  )
    throw fail("invalid", `${from.name} does not issue stock.`);
  if (!allows(to.kind, to.wardSupplyModel, "received_from_issue", "in"))
    throw fail("invalid", `${to.name} does not take issues.`);
}

export interface IssuedRow {
  productId: string;
  batchId: string;
  toBatchId: string;
  quantity: number;
}

/**
 * IS-2: one issue event and an `issued` / `received_from_issue` pair per batch, first expiry first, never below
 * zero; expired, quarantined and recalled batches are never taken (SL-14). IS-6: a controlled line only with the
 * witness at the issuing end.
 */
export async function issueStock(
  ctx: PharmacyCtx,
  input: {
    id?: string;
    kind: "issue" | "restock";
    from: StockLocation;
    to: StockLocation;
    requisitionId: string | null;
    lines: readonly { productId: string; quantity: number }[];
    witnessAttestationId?: string | null;
  },
): Promise<{ id: string; rows: IssuedRow[] }> {
  const h = ctx.actor.hospitalId;
  checkIssuePlaces(input.from, input.to);
  const controlled = await controlledSet(ctx.tx, h);
  const balances = await balancesAt(ctx.tx, input.from.id);
  const today = localDate(ctx.now);
  const plans: { productId: string; rows: { batchId: string; quantity: number }[] }[] = [];
  let anyControlled = false;
  for (const line of input.lines) {
    const p = await productAt(ctx.tx, h, line.productId);
    anyControlled ||= controlled(p.medicineId);
    const { batches, blocked } = await productBatches(ctx.tx, input.from, p.id);
    const plan = planIssue(line.quantity, { batches, balances, blocked, localDate: today });
    if (plan.issue < line.quantity)
      throw fail(
        "conflict",
        `${input.from.name} holds ${plan.held} of ${p.name} that can be issued, not ${line.quantity}.`,
      );
    plans.push({ productId: p.id, rows: plan.rows });
  }
  const witness = await storeWitness(ctx, anyControlled, input.witnessAttestationId);
  const [issue] = await ctx.tx
    .insert(pharmacyIssues)
    .values({
      ...(input.id ? { id: input.id } : {}),
      hospitalId: h,
      kind: input.kind,
      fromLocationId: input.from.id,
      toLocationId: input.to.id,
      requisitionId: input.requisitionId,
      issuedBy: ctx.actor.userId,
      witnessAttestationId: witness,
      issuedAt: ctx.now,
    })
    .returning({ id: pharmacyIssues.id });
  const rows: IssuedRow[] = [];
  for (const plan of plans)
    for (const r of plan.rows) {
      const batch = await batchRef(ctx.tx, h, r.batchId, input.from.id);
      const pair = await movePair(ctx.tx, {
        pair: "issue",
        hospitalId: h,
        from: input.from,
        to: input.to,
        batch,
        quantity: r.quantity,
        sourceId: issue!.id,
        actorUserId: ctx.actor.userId,
        effectiveAt: ctx.now,
        witnessAttestationId: witness,
      });
      rows.push({
        productId: plan.productId,
        batchId: r.batchId,
        toBatchId: pair.toBatchId,
        quantity: r.quantity,
      });
    }
  return { id: issue!.id, rows };
}

/* ─── Requisitions (IS-1) ─────────────────────────────────────────────── */

export const RaiseRequisitionInput = z.object({
  clientKey: key,
  requestingLocationId: z.uuid(),
  issuingLocationId: z.uuid(),
  lines: lineList,
});

/** 5.3: a dispensing point's (or a store's) requisition to the place that issues to it. */
export async function raiseRequisition(
  ctx: PharmacyCtx,
  input: z.infer<typeof RaiseRequisitionInput>,
) {
  const h = ctx.actor.hospitalId;
  const [again] = await ctx.tx
    .select({ id: pharmacyRequisitions.id, h: pharmacyRequisitions.hospitalId })
    .from(pharmacyRequisitions)
    .where(eq(pharmacyRequisitions.id, input.clientKey));
  if (again) {
    if (again.h !== h) throw fail("conflict", "That request key is already in use.");
    return { id: again.id };
  }
  const from = await loadLocation(ctx.tx, h, input.requestingLocationId);
  const to = await loadLocation(ctx.tx, h, input.issuingLocationId);
  if (from.kind !== "dispensing_point" && from.kind !== "store")
    throw fail(
      "invalid",
      "Here a requisition is raised by a dispensing point or a store. A ward raises its own.",
    );
  checkIssuePlaces(to, from);
  for (const l of input.lines) await productAt(ctx.tx, h, l.productId);
  const [row] = await ctx.tx
    .insert(pharmacyRequisitions)
    .values({
      id: input.clientKey,
      hospitalId: h,
      requestingLocationId: from.id,
      issuingLocationId: to.id,
      raisedBy: ctx.actor.userId,
      raisedAt: ctx.now,
    })
    .returning({ id: pharmacyRequisitions.id });
  await ctx.tx.insert(pharmacyRequisitionLines).values(
    input.lines.map((l) => ({
      requisitionId: row!.id,
      productId: l.productId,
      quantityAsked: l.quantity,
    })),
  );
  return { id: row!.id };
}

export async function lockedRequisition(tx: EmrTx, hospitalId: string, id: string) {
  const [r] = await tx
    .select()
    .from(pharmacyRequisitions)
    .where(and(eq(pharmacyRequisitions.id, id), eq(pharmacyRequisitions.hospitalId, hospitalId)))
    .for("update");
  if (!r) throw fail("not_found", "That requisition is not at this hospital.");
  return r;
}

/** Section 8: `pharmacy.store`, or `pharmacy.dispense` at the issuing place when it is the acting point. */
export function mayIssueFrom(ctx: PharmacyCtx, issuingLocationId: string) {
  const p = ctx.actor.access.permissions;
  if (p.has("pharmacy.store")) return;
  if (p.has("pharmacy.dispense") && ctx.actor.pointId === issuingLocationId) return;
  throw fail(
    "forbidden",
    "Only the store, or the point you are working at, issues this requisition.",
  );
}

export const IssueRequisitionInput = z.object({
  requisitionId: z.uuid(),
  lines: z
    .array(
      z.object({
        lineId: z.uuid(),
        quantity: z.number().int().min(0).max(1_000_000),
        notIssuedReason: optional(60),
      }),
    )
    .min(1)
    .max(100),
  witnessAttestationId: z.uuid().nullish(),
});

/**
 * 5.3 Issue (IS-1, IS-2, IS-6): every open line answered, a line issued as zero marked "Not issued" with its
 * reason; the issue pairs written; the lines and the requisition's state updated, in one transaction.
 */
export async function issueRequisition(
  ctx: PharmacyCtx,
  input: z.infer<typeof IssueRequisitionInput>,
) {
  const h = ctx.actor.hospitalId;
  const r = await lockedRequisition(ctx.tx, h, input.requisitionId);
  if (r.state !== "raised") {
    const [done] = await ctx.tx
      .select({ id: pharmacyIssues.id })
      .from(pharmacyIssues)
      .where(eq(pharmacyIssues.requisitionId, r.id));
    if (done) return { id: done.id, requisitionId: r.id, state: r.state };
    throw fail("conflict", "This requisition is closed.");
  }
  mayIssueFrom(ctx, r.issuingLocationId);
  const lines = await ctx.tx
    .select()
    .from(pharmacyRequisitionLines)
    .where(eq(pharmacyRequisitionLines.requisitionId, r.id));
  const typed = new Map(input.lines.map((l) => [l.lineId, l]));
  const open = lines.filter((l) => l.quantityIssued === null);
  if (
    open.some((l) => !typed.has(l.id)) ||
    input.lines.some((l) => !open.find((o) => o.id === l.lineId))
  )
    throw fail("invalid", "Answer every open line of this requisition, once.");
  const answers = lines.map((l) => {
    const t = typed.get(l.id);
    return {
      line: l,
      issued: t ? t.quantity : (l.quantityIssued ?? 0),
      notIssuedReason: t ? t.notIssuedReason : l.notIssuedReason,
    };
  });
  const next = requisitionNext("raised", {
    type: "issue",
    lines: answers.map((a) => ({
      asked: a.line.quantityAsked,
      issued: a.issued,
      notIssuedReason: a.notIssuedReason,
    })),
  });
  if (!next.ok)
    throw fail(
      "invalid",
      next.reason === "nothing_issued"
        ? "Nothing is issued. Refuse the requisition instead, with a reason."
        : next.reason === "not_issued_reason_needed"
          ? "Say why each line issued as zero is not issued."
          : "Give each quantity as a whole number.",
    );
  await assertPicked(ctx.tx, h, r.id, input.lines);
  const from = await loadLocation(ctx.tx, h, r.issuingLocationId);
  const to = await loadLocation(ctx.tx, h, r.requestingLocationId);
  const issue = await issueStock(ctx, {
    kind: "issue",
    from,
    to,
    requisitionId: r.id,
    lines: answers
      .filter((a) => typed.has(a.line.id) && a.issued > 0)
      .map((a) => ({ productId: a.line.productId, quantity: a.issued })),
    witnessAttestationId: input.witnessAttestationId,
  });
  for (const a of answers)
    if (typed.has(a.line.id))
      await ctx.tx
        .update(pharmacyRequisitionLines)
        .set({ quantityIssued: a.issued, notIssuedReason: a.issued > 0 ? null : a.notIssuedReason })
        .where(eq(pharmacyRequisitionLines.id, a.line.id));
  await ctx.tx
    .update(pharmacyRequisitions)
    .set({ state: next.state })
    .where(eq(pharmacyRequisitions.id, r.id));
  return { id: issue.id, requisitionId: r.id, state: next.state };
}

export const RefuseInput = z.object({
  requisitionId: z.uuid(),
  /** Null refuses the whole requisition. */
  lineId: z.uuid().nullish(),
  reason: z.string().trim().min(2, "Say why.").max(60),
});

/** IS-1: a line refused (issued as zero, with its reason), or the whole requisition refused. */
export async function refuseRequisitionLine(ctx: PharmacyCtx, input: z.infer<typeof RefuseInput>) {
  const r = await lockedRequisition(ctx.tx, ctx.actor.hospitalId, input.requisitionId);
  if (r.state !== "raised") throw fail("conflict", "This requisition is no longer waiting.");
  mayIssueFrom(ctx, r.issuingLocationId);
  const lines = await ctx.tx
    .select()
    .from(pharmacyRequisitionLines)
    .where(eq(pharmacyRequisitionLines.requisitionId, r.id));
  if (input.lineId) {
    const line = lines.find((l) => l.id === input.lineId);
    if (!line) throw fail("not_found", "That line is not on this requisition.");
    if (line.quantityIssued !== null) throw fail("conflict", "That line is already answered.");
    await ctx.tx
      .update(pharmacyRequisitionLines)
      .set({ quantityIssued: 0, notIssuedReason: input.reason })
      .where(eq(pharmacyRequisitionLines.id, line.id));
    if (lines.some((l) => l.id !== line.id && l.quantityIssued === null)) return { id: r.id };
    if (lines.some((l) => (l.quantityIssued ?? 0) > 0)) return { id: r.id };
  }
  const next = requisitionNext("raised", { type: "refuse", reason: input.reason });
  if (!next.ok) throw fail("invalid", "Say why.");
  await ctx.tx
    .update(pharmacyRequisitions)
    .set({ state: next.state, refusedReason: input.reason, closedAt: ctx.now })
    .where(eq(pharmacyRequisitions.id, r.id));
  return { id: r.id };
}

export const DirectIssueInput = z.object({
  clientKey: key,
  fromLocationId: z.uuid(),
  toLocationId: z.uuid(),
  lines: lineList,
  witnessAttestationId: z.uuid().nullish(),
});

/** 5.3: stock issued from the store to a point (or between pharmacy places) without a requisition. */
export async function directIssue(ctx: PharmacyCtx, input: z.infer<typeof DirectIssueInput>) {
  const h = ctx.actor.hospitalId;
  const [again] = await ctx.tx
    .select({ id: pharmacyIssues.id, h: pharmacyIssues.hospitalId })
    .from(pharmacyIssues)
    .where(eq(pharmacyIssues.id, input.clientKey));
  if (again) {
    if (again.h !== h) throw fail("conflict", "That request key is already in use.");
    return { id: again.id };
  }
  const from = await loadLocation(ctx.tx, h, input.fromLocationId);
  const to = await loadLocation(ctx.tx, h, input.toLocationId);
  if (!isPharmacyPlace(to))
    throw fail("invalid", "A ward or cart is issued to from its requisition or its check.");
  const issue = await issueStock(ctx, {
    id: input.clientKey,
    kind: "issue",
    from,
    to,
    requisitionId: null,
    lines: input.lines,
    witnessAttestationId: input.witnessAttestationId,
  });
  return { id: issue.id };
}

/* ─── Receipt at the other end (IS-3) ─────────────────────────────────── */

export interface ConfirmIssueArgs {
  hospitalId: string;
  issueId: string;
  /** The place confirming: must be where the issue went. */
  receivingLocationId: string;
  confirmedByUserId: string;
  /** Each batch received at this place, with what arrived. Every batch of the issue is named once. */
  lines: readonly { batchId: string; confirmed: number }[];
  /** Required when anything differs (2 to 500 characters); written as the adjustment's note. */
  reason: string | null;
  /** A second-person attestation, when the site asks for one (IS-6 rests on the confirmer's AAL2 session). */
  attestationId?: string | null;
  now: Date;
}

/**
 * IS-3, the receiving end's one write, shared by the pharmacy (`confirmIssueReceipt`) and the ward (lane B, inside
 * `withLocationRight(…, "ward_confirm", …)`). The stock moved at issue; a difference writes an `adjusted` movement
 * at the receiving place (confirmed − issued, reason code `receipt_difference`, the reason as its note, linked to
 * the issue) and is listed for both in-charges through the confirmation's `differences`. The requisition, if
 * any, becomes `confirmed` or `confirmed_with_difference`. A controlled difference is marked in `differences`
 * for the pharmacy in charge (Phase 1's controlled-difference table is per dispensing point).
 */
export async function confirmIssue(
  tx: EmrTx,
  args: ConfirmIssueArgs,
): Promise<{ id: string; differences: number }> {
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtext(${`pharmacy-issue:${args.issueId}`}))`,
  );
  const [issue] = await tx
    .select()
    .from(pharmacyIssues)
    .where(
      and(eq(pharmacyIssues.id, args.issueId), eq(pharmacyIssues.hospitalId, args.hospitalId)),
    );
  if (!issue) throw fail("not_found", "That issue is not at this hospital.");
  if (issue.toLocationId !== args.receivingLocationId)
    throw fail("forbidden", "Only the place it was issued to confirms it.");
  const [done] = await tx
    .select({ id: pharmacyIssueConfirmations.id })
    .from(pharmacyIssueConfirmations)
    .where(eq(pharmacyIssueConfirmations.issueId, issue.id));
  if (done) return { id: done.id, differences: 0 };
  // 0275: a voucher dispatch sits on the way until now; it arrives whole, a difference is a note and a case.
  if (issue.voucher) {
    const id = await arriveDispatch(tx, {
      hospitalId: args.hospitalId,
      issue,
      note: args.reason ?? null,
      confirmedBy: args.confirmedByUserId,
      now: args.now,
    });
    return { id, differences: args.reason ? 1 : 0 };
  }
  const location = await loadLocation(tx, args.hospitalId, issue.toLocationId);
  const legs = await tx
    .select({
      batchId: pharmacyStockMovements.batchId,
      quantity: pharmacyStockMovements.quantity,
      medicineId: pharmacyProducts.medicineId,
    })
    .from(pharmacyStockMovements)
    .innerJoin(pharmacyBatches, eq(pharmacyBatches.id, pharmacyStockMovements.batchId))
    .innerJoin(pharmacyProducts, eq(pharmacyProducts.id, pharmacyBatches.productId))
    .where(
      and(
        eq(pharmacyStockMovements.sourceId, issue.id),
        inArray(pharmacyStockMovements.kind, [
          "received_from_issue",
          "returned_in",
          "quarantined_in",
        ]),
        sql`coalesce(${pharmacyStockMovements.locationId}, ${pharmacyStockMovements.dispensingPointId}) = ${location.id}::uuid`,
      ),
    );
  const issued = new Map<string, { n: number; medicineId: string }>();
  for (const l of legs)
    issued.set(l.batchId, {
      n: (issued.get(l.batchId)?.n ?? 0) + l.quantity,
      medicineId: l.medicineId,
    });
  const named = new Map(args.lines.map((l) => [l.batchId, l.confirmed]));
  if (
    named.size !== args.lines.length ||
    named.size !== issued.size ||
    [...named.keys()].some((b) => !issued.has(b))
  )
    throw fail("invalid", "Confirm each batch of this issue once.");
  const controlled = await controlledSet(tx, args.hospitalId);
  const reason = args.reason?.trim() ?? "";
  const plan = confirmationAdjustments(
    [...issued].map(([batchId, v]) => ({
      receivingBatchId: batchId,
      issued: v.n,
      confirmed: named.get(batchId)!,
      controlled: controlled(v.medicineId),
    })),
    reason.length >= 2 ? reason : null,
  );
  if (!plan.ok)
    throw fail(
      "invalid",
      plan.reason === "reason_needed" ? "Say what was different." : "Give whole numbers.",
    );
  if (plan.adjustments.length && !allows(location.kind, location.wardSupplyModel, "adjusted", "in"))
    throw fail(
      "config",
      `${location.name} takes no adjustment. Record the difference with the pharmacy in charge.`,
    );
  const differences: Record<
    string,
    { expected: number; found: number; reason: string; controlled: boolean }
  > = {};
  for (const a of plan.adjustments) {
    await move(tx, {
      hospitalId: args.hospitalId,
      location,
      batchId: a.batchId,
      kind: "adjusted",
      quantity: a.quantity,
      sourceKind: "issue",
      sourceId: issue.id,
      reasonCode: "receipt_difference",
      reasonNote: reason.slice(0, 500),
      actorUserId: args.confirmedByUserId,
      effectiveAt: args.now,
    });
    const v = issued.get(a.batchId)!;
    differences[a.batchId] = {
      expected: v.n,
      found: v.n + a.quantity,
      reason: reason.slice(0, 500),
      controlled: a.controlledDifference,
    };
  }
  const [row] = await tx
    .insert(pharmacyIssueConfirmations)
    .values({
      issueId: issue.id,
      hospitalId: args.hospitalId,
      confirmedBy: args.confirmedByUserId,
      attestationId: args.attestationId ?? null,
      differences,
      confirmedAt: args.now,
    })
    .returning({ id: pharmacyIssueConfirmations.id });
  if (issue.requisitionId) {
    const r = await lockedRequisition(tx, args.hospitalId, issue.requisitionId);
    const next = requisitionNext(r.state, {
      type: "confirm",
      differences: plan.adjustments.length,
    });
    if (next.ok)
      await tx
        .update(pharmacyRequisitions)
        .set({ state: next.state, closedAt: args.now })
        .where(eq(pharmacyRequisitions.id, r.id));
  }
  return { id: row!.id, differences: plan.adjustments.length };
}

export const ConfirmReceiptInput = z.object({
  issueId: z.uuid(),
  lines: z
    .array(z.object({ batchId: z.uuid(), confirmed: z.number().int().min(0).max(1_000_000) }))
    .min(1)
    .max(200),
  reason: optional(500),
});

/** IS-3 at a pharmacy place (store, point, quarantine), by a holder of `pharmacy.stock`. */
export async function confirmIssueReceipt(
  ctx: PharmacyCtx,
  input: z.infer<typeof ConfirmReceiptInput>,
) {
  const [issue] = await ctx.tx
    .select({ to: pharmacyIssues.toLocationId })
    .from(pharmacyIssues)
    .where(
      and(
        eq(pharmacyIssues.id, input.issueId),
        eq(pharmacyIssues.hospitalId, ctx.actor.hospitalId),
      ),
    );
  if (!issue) throw fail("not_found", "That issue is not at this hospital.");
  const l = await loadLocation(ctx.tx, ctx.actor.hospitalId, issue.to);
  if (!isPharmacyPlace(l)) throw fail("forbidden", "A ward or cart confirms its own receipt.");
  return confirmIssue(ctx.tx, {
    hospitalId: ctx.actor.hospitalId,
    issueId: input.issueId,
    receivingLocationId: l.id,
    confirmedByUserId: ctx.actor.userId,
    lines: input.lines,
    reason: input.reason,
    now: ctx.now,
  });
}

/* ─── Returns (IS-5) ──────────────────────────────────────────────────── */

export const ReturnInput = z
  .object({
    clientKey: key,
    fromLocationId: z.uuid(),
    toLocationId: z.uuid(),
    batchId: z.uuid(),
    quantity,
    reasonCode: z.enum(Object.keys(RETURN_REASONS) as [keyof typeof RETURN_REASONS], {
      message: "Choose a reason.",
    }),
    note: optional(500),
    fit: z.boolean(),
    witnessAttestationId: z.uuid().nullish(),
  })
  .refine((v) => v.reasonCode !== "other" || (v.note?.length ?? 0) >= 3, {
    message: "Say why it is returned.",
    path: ["note"],
  });

/**
 * IS-5: stock returned to the place that issued it, as a return pair; stock not fit for the shelf goes to
 * quarantine instead, as a quarantine pair with the reason "returned not fit". At a pharmacy place here.
 */
export async function returnStock(ctx: PharmacyCtx, input: z.infer<typeof ReturnInput>) {
  const h = ctx.actor.hospitalId;
  const [again] = await ctx.tx
    .select({ id: pharmacyIssues.id, h: pharmacyIssues.hospitalId })
    .from(pharmacyIssues)
    .where(eq(pharmacyIssues.id, input.clientKey));
  if (again) {
    if (again.h !== h) throw fail("conflict", "That request key is already in use.");
    return { id: again.id };
  }
  const from = await loadLocation(ctx.tx, h, input.fromLocationId);
  if (!isPharmacyPlace(from)) throw fail("forbidden", "A ward or cart returns its own stock.");
  requireLive(from);
  const issuer = await loadLocation(ctx.tx, h, input.toLocationId);
  const quarantine = input.fit ? null : await quarantineFor(ctx.tx, h, from);
  if (!input.fit && !quarantine)
    throw fail("config", "No quarantine is set up to take stock that is not fit.");
  const route = returnRoute({
    fit: input.fit,
    reasonCode: input.reasonCode,
    issuerLocationId: issuer.id,
    quarantineLocationId: quarantine?.id ?? issuer.id,
  });
  if (!route.ok) throw fail("invalid", "Choose a reason.");
  const to = input.fit ? issuer : quarantine!;
  if (from.id === to.id) throw fail("invalid", "Choose another place to return to.");
  requireLive(to);
  const inKind = route.outKind === "returned_out" ? "returned_in" : "quarantined_in";
  if (!allows(from.kind, from.wardSupplyModel, route.outKind, "out"))
    throw fail("invalid", `${from.name} does not return stock this way.`);
  if (!allows(to.kind, to.wardSupplyModel, inKind, "in"))
    throw fail("invalid", `${to.name} does not take returns.`);
  const batch = await batchRef(ctx.tx, h, input.batchId, from.id);
  const controlled = await controlledSet(ctx.tx, h);
  const witness = await storeWitness(ctx, controlled(batch.medicineId), input.witnessAttestationId);
  const [issue] = await ctx.tx
    .insert(pharmacyIssues)
    .values({
      id: input.clientKey,
      hospitalId: h,
      kind: "return",
      fromLocationId: from.id,
      toLocationId: to.id,
      returnReason: input.reasonCode,
      issuedBy: ctx.actor.userId,
      witnessAttestationId: witness,
      issuedAt: ctx.now,
    })
    .returning({ id: pharmacyIssues.id });
  await movePair(ctx.tx, {
    pair: input.fit ? "return" : "quarantine",
    hospitalId: h,
    from,
    to,
    batch,
    quantity: input.quantity,
    sourceId: issue!.id,
    actorUserId: ctx.actor.userId,
    effectiveAt: ctx.now,
    reasonCode: input.fit ? input.reasonCode : "returned_not_fit",
    reasonNote: input.fit
      ? input.note
      : [RETURN_REASONS[input.reasonCode], input.note].filter(Boolean).join(". "),
    witnessAttestationId: witness,
  });
  return { id: issue!.id };
}

/* ─── Loans between facilities (IS-7) ─────────────────────────────────── */

async function loanPlace(ctx: PharmacyCtx, locationId: string, kind: "lent" | "borrowed") {
  const l = await loadLocation(ctx.tx, ctx.actor.hospitalId, locationId);
  requireLive(l);
  if (!allows(l.kind, l.wardSupplyModel, kind, kind === "lent" ? "out" : "in"))
    throw fail("invalid", `${l.name} does not ${kind === "lent" ? "lend" : "borrow"} stock.`);
  return l;
}

const CONTROLLED_NOT_LENT = "Controlled drugs are never lent or borrowed.";

async function movementReplayed(tx: EmrTx, id: string, hospitalId: string) {
  const [m] = await tx
    .select({ h: pharmacyStockMovements.hospitalId })
    .from(pharmacyStockMovements)
    .where(eq(pharmacyStockMovements.id, id));
  if (m && m.h !== hospitalId) throw fail("conflict", "That request key is already in use.");
  return !!m;
}

export const LendInput = z.object({
  clientKey: key,
  locationId: z.uuid(),
  batchId: z.uuid(),
  quantity,
  counterpartyId: z.uuid({ message: "Choose the facility." }),
});

/** IS-7: a loan to another facility, a `lent` movement to that counterparty. Never a controlled drug. */
export async function lendStock(ctx: PharmacyCtx, input: z.infer<typeof LendInput>) {
  const h = ctx.actor.hospitalId;
  if (await movementReplayed(ctx.tx, input.clientKey, h)) return { id: input.clientKey };
  const l = await loanPlace(ctx, input.locationId, "lent");
  await counterpartyOf(ctx.tx, h, input.counterpartyId, "facility");
  const batch = await batchRef(ctx.tx, h, input.batchId, l.id);
  if ((await controlledSet(ctx.tx, h))(batch.medicineId))
    throw fail("forbidden", CONTROLLED_NOT_LENT);
  const id = await move(ctx.tx, {
    id: input.clientKey,
    hospitalId: h,
    location: l,
    batchId: batch.id,
    kind: "lent",
    quantity: -input.quantity,
    sourceKind: "loan",
    counterpartyId: input.counterpartyId,
    actorUserId: ctx.actor.userId,
    effectiveAt: ctx.now,
  });
  return { id };
}

export const BorrowInput = z.object({
  clientKey: key,
  locationId: z.uuid(),
  counterpartyId: z.uuid({ message: "Choose the facility." }),
  productId: z.uuid(),
  batchNumber: z.string().trim().min(1).max(60),
  expiry: expiryField,
  quantity,
  shortDatedDecision: z.enum(["accept", "accept_tell", "reject"]).nullish(),
});

/**
 * IS-7: stock borrowed from another facility, through receiving's checks first (RG-2 to RG-4): expired refused,
 * a batch already here with another expiry refused, a short-dated batch only with a decision. Never controlled.
 */
export async function borrowStock(ctx: PharmacyCtx, input: z.infer<typeof BorrowInput>) {
  const h = ctx.actor.hospitalId;
  if (await movementReplayed(ctx.tx, input.clientKey, h)) return { id: input.clientKey };
  const l = await loanPlace(ctx, input.locationId, "borrowed");
  await counterpartyOf(ctx.tx, h, input.counterpartyId, "facility");
  const p = await productAt(ctx.tx, h, input.productId);
  if ((await controlledSet(ctx.tx, h))(p.medicineId)) throw fail("forbidden", CONTROLLED_NOT_LENT);
  const line = {
    lineNo: 1,
    productId: p.id,
    noteProductId: null,
    orderLineId: null,
    noteQuantity: null,
    acceptedQuantity: input.quantity,
    rejectedKeptQuantity: 0,
    rejectedReturnedQuantity: 0,
    rejectReason: null,
    batchNumber: input.batchNumber,
    expiry: input.expiry.expiry,
    expiryMonthOnly: input.expiry.monthOnly,
    unitCost: null,
    shortDatedDecision: input.shortDatedDecision ?? null,
  };
  const lookaheadDays = await expiryLookahead(ctx.tx, h);
  const existing = await ctx.tx
    .select({
      productId: pharmacyBatches.productId,
      batchNumber: pharmacyBatches.batchNumber,
      expiry: pharmacyBatches.expiry,
    })
    .from(pharmacyBatches)
    .where(
      sql`coalesce(${pharmacyBatches.locationId}, ${pharmacyBatches.dispensingPointId}) = ${l.id}::uuid`,
    );
  const refused = lineRefusals(line, { today: localDate(ctx.now), lookaheadDays, existing });
  if (refused.length) {
    const held = existing.find(
      (b) =>
        b.productId === p.id && b.batchNumber.toLowerCase() === input.batchNumber.toLowerCase(),
    );
    throw fail(
      "conflict",
      refusalWords(refused[0]!, line, { lookaheadDays, heldExpiry: held?.expiry ?? null }).replace(
        "Line 1",
        "This batch",
      ),
    );
  }
  const batchId = await batchAtLocation(ctx.tx, {
    hospitalId: h,
    location: l,
    productId: p.id,
    batchNumber: input.batchNumber,
    expiry: input.expiry.expiry,
    monthOnly: input.expiry.monthOnly,
    actorUserId: ctx.actor.userId,
  });
  const id = await move(ctx.tx, {
    id: input.clientKey,
    hospitalId: h,
    location: l,
    batchId,
    kind: "borrowed",
    quantity: input.quantity,
    sourceKind: "loan",
    counterpartyId: input.counterpartyId,
    reasonCode: input.shortDatedDecision ? `short_dated_${input.shortDatedDecision}` : null,
    actorUserId: ctx.actor.userId,
    effectiveAt: ctx.now,
  });
  return { id };
}

const asStoreMovement = (m: typeof pharmacyStockMovements.$inferSelect): StoreMovement => ({
  id: m.id,
  batchId: m.batchId,
  pointId: m.locationId ?? m.dispensingPointId ?? "",
  kind: m.kind,
  quantity: m.quantity,
  effectiveAt: m.effectiveAt,
  recordedAt: m.recordedAt,
  downtime: m.downtime,
  counterpartyId: m.counterpartyId,
  loanMovementId: m.loanMovementId,
});

/** IS-7: one loan and what is still outstanding on it (0 once closed with a reason). */
export async function loanOutstanding(tx: EmrTx, hospitalId: string, loanMovementId: string) {
  const rows = await tx
    .select()
    .from(pharmacyStockMovements)
    .where(
      and(
        eq(pharmacyStockMovements.hospitalId, hospitalId),
        or(
          eq(pharmacyStockMovements.id, loanMovementId),
          eq(pharmacyStockMovements.loanMovementId, loanMovementId),
        ),
      ),
    );
  const loan = rows.find((r) => r.id === loanMovementId);
  if (!loan || (loan.kind !== "lent" && loan.kind !== "borrowed"))
    throw fail("not_found", "That loan is not at this hospital.");
  const [closed] = await tx
    .select({ id: pharmacyLoanClosures.id })
    .from(pharmacyLoanClosures)
    .where(eq(pharmacyLoanClosures.loanMovementId, loanMovementId));
  const { outstanding } = loanBalances(rows.map(asStoreMovement), new Map());
  return { loan, outstanding: closed ? 0 : (outstanding[0]?.quantity ?? 0), closed: !!closed };
}

export const CloseLoanInput = z
  .object({
    clientKey: key,
    loanMovementId: z.uuid(),
    returned: z.number().int().positive().max(1_000_000).nullish(),
    reason: optional(300),
  })
  .refine((v) => !!v.returned !== !!v.reason, {
    message: "Give the quantity returned, or close it with a reason.",
    path: ["reason"],
  })
  .refine((v) => !v.reason || v.reason.length >= 3, {
    message: "Say why it is closed.",
    path: ["reason"],
  });

/**
 * IS-7: a loan settled by a return linked to it (`loan_returned_in` for what was lent, `loan_returned_out` for
 * what was borrowed), never a new loan; or closed with a reason, with no stock moved.
 */
export async function closeLoan(ctx: PharmacyCtx, input: z.infer<typeof CloseLoanInput>) {
  const h = ctx.actor.hospitalId;
  if (await movementReplayed(ctx.tx, input.clientKey, h)) return { id: input.clientKey };
  await ctx.tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtext(${`pharmacy-loan:${input.loanMovementId}`}))`,
  );
  const { loan, outstanding } = await loanOutstanding(ctx.tx, h, input.loanMovementId);
  if (outstanding === 0) throw fail("conflict", "This loan is already settled.");
  if (input.reason) {
    const [row] = await ctx.tx
      .insert(pharmacyLoanClosures)
      .values({
        hospitalId: h,
        loanMovementId: loan.id,
        reason: input.reason,
        actorUserId: ctx.actor.userId,
        closedAt: ctx.now,
      })
      .returning({ id: pharmacyLoanClosures.id });
    return { id: row!.id };
  }
  const n = input.returned!;
  if (n > outstanding) throw fail("invalid", `Only ${outstanding} is outstanding on this loan.`);
  const l = await loadLocation(ctx.tx, h, loan.locationId ?? loan.dispensingPointId!);
  requireLive(l);
  const batch = await batchRef(ctx.tx, h, loan.batchId, l.id);
  const id = await move(ctx.tx, {
    id: input.clientKey,
    hospitalId: h,
    location: l,
    batchId: batch.id,
    kind: loan.kind === "lent" ? "loan_returned_in" : "loan_returned_out",
    quantity: loan.kind === "lent" ? n : -n,
    sourceKind: "loan",
    counterpartyId: loan.counterpartyId,
    loanMovementId: loan.id,
    actorUserId: ctx.actor.userId,
    effectiveAt: ctx.now,
  });
  return { id };
}

/* ─── Prints (logged; print CSS only) ─────────────────────────────────── */

export const PrintVoucherInput = z.object({ clientKey: key, requisitionId: z.uuid() });
export const PrintLoanInput = z.object({ clientKey: key, loanMovementId: z.uuid() });

async function logPrint(
  ctx: PharmacyCtx,
  clientKey: string,
  kind: "voucher" | "loan_record",
  refId: string,
) {
  const [again] = await ctx.tx
    .select({ id: pharmacyPrintEvents.id })
    .from(pharmacyPrintEvents)
    .where(eq(pharmacyPrintEvents.id, clientKey));
  if (again) return { id: again.id };
  const [row] = await ctx.tx
    .insert(pharmacyPrintEvents)
    .values({
      id: clientKey,
      hospitalId: ctx.actor.hospitalId,
      kind,
      refId,
      actorUserId: ctx.actor.userId,
      printedAt: ctx.now,
    })
    .returning({ id: pharmacyPrintEvents.id });
  return { id: row!.id };
}

/** 5.3: the Requisition and Issue Voucher, printed from an issued requisition. */
export async function printVoucher(ctx: PharmacyCtx, input: z.infer<typeof PrintVoucherInput>) {
  const r = await lockedRequisition(ctx.tx, ctx.actor.hospitalId, input.requisitionId);
  if (r.state === "raised" || r.state === "withdrawn")
    throw fail("conflict", "The voucher prints once it is issued or refused.");
  return logPrint(ctx, input.clientKey, "voucher", r.id);
}

/** 5.3: the borrow or lend record. */
export async function printLoanRecord(ctx: PharmacyCtx, input: z.infer<typeof PrintLoanInput>) {
  await loanOutstanding(ctx.tx, ctx.actor.hospitalId, input.loanMovementId);
  return logPrint(ctx, input.clientKey, "loan_record", input.loanMovementId);
}
