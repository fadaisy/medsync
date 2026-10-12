import type { Batch, MovementKind } from "./ledger";
import type { EmrTx } from "@/lib/emr/db";
import type { ActionResult } from "@/lib/emr/write/context";
import type { PharmacyCtx, PharmacyNeed, PharmacyPoint } from "@/lib/pharmacy/write";
import type { AnyPgColumn, PgTable } from "drizzle-orm/pg-core";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";

import {
  ADJUSTMENT_REASONS,
  COUNT_DIFFERENCE_REASONS,
  DELIVERY_FROM,
  expiryText,
  STOCK,
} from "@/content/pharmacy-stock";
import { pharmacyDispensingPoints } from "@/db/schema/pharmacy";
import {
  pharmacyBatchCorrections,
  pharmacyBatches,
  pharmacyCountLines,
  pharmacyCounts,
  pharmacyProductPoints,
  pharmacyProducts,
  pharmacyReorderLevels,
  pharmacyStockMovements,
  pharmacyStockRequests,
} from "@/db/schema/pharmacy-dispensing";
import { EmrWriteError } from "@/lib/emr/write/context";
import { isMedicine } from "@/lib/pharmacy/catalogue";
import { loadPoint } from "@/lib/pharmacy/write";
import { drugById } from "@/lib/prescribing/formulary";
import { correctBatch, expiresOn, isExpired, localDate } from "./ledger";

/**
 * Stock at the dispensing point, written (Pharmacy Phase 1, 5.8, 5.3.1, SL-1..SL-11, CT-2, CT-4).
 * Each write is `(ctx, input) => { id }` for `runPharmacyWrite`, inside its one transaction: the
 * point is the acting point the write path checked, the database guard (0124) refuses a live
 * movement below zero, and every row carries the actor. The client key becomes the id of the row a
 * write creates, so a retried request finds its own row and returns it (no client_key columns on
 * these tables). A controlled medicine is refused everywhere until the witnessed path (Step 7).
 */

export type StockResult<R> = ActionResult<R>;

/** Section 8: stock actions need `pharmacy.stock` at a point with `pharmacyDispensing` on. */
export const STOCK_NEED: PharmacyNeed = { permission: "pharmacy.stock", point: "setup" };
export const MANAGE_AT_POINT: PharmacyNeed = { permission: "pharmacy.manage", point: "setup" };
export const MANAGE: PharmacyNeed = { permission: "pharmacy.manage", point: "none" };

/* ─── Inputs ──────────────────────────────────────────────────────────── */

const key = z.uuid();
const text = (min: number, max: number) => z.string().trim().min(min).max(max);
const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((s) => (s ? s : null));
const medicineId = z
  .string()
  .regex(/^[a-z0-9_]{2,80}$/)
  .refine(isMedicine, "That medicine is not on the prescribing list.");
const batchNumber = text(1, 60);
const quantity = z.number().int().positive().max(1_000_000);

/**
 * An expiry as a day (YYYY-MM-DD) or as the month the pack gives (YYYY-MM). A month is stored as its
 * first day with `monthOnly`, and runs to the end of the month (SL-5).
 */
export function parseExpiry(s: string): { expiry: string; monthOnly: boolean } | null {
  const m = /^(\d{4})-(0[1-9]|1[0-2])(?:-(\d{2}))?$/.exec(s.trim());
  if (!m) return null;
  if (!m[3]) return { expiry: `${m[1]}-${m[2]}-01`, monthOnly: true };
  const iso = `${m[1]}-${m[2]}-${m[3]}`;
  const d = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso
    ? { expiry: iso, monthOnly: false }
    : null;
}
const expiry = z.string().transform((s, c) => {
  const e = parseExpiry(s);
  if (!e) c.addIssue({ code: "custom", message: "Give the expiry as a date or a month." });
  return e ?? { expiry: "", monthOnly: false };
});

const withNote = <T extends { reasonCode: string; note: string | null }>(v: T) =>
  v.reasonCode !== "other" || (v.note?.length ?? 0) >= 3;
const noteMessage = { message: "Say what happened.", path: ["note"] };

const productFields = {
  name: text(2, 160),
  manufacturer: optional(160),
  strength: optional(80),
  packSize: optional(80),
  issueUnit: text(1, 40),
  registrationNumber: optional(80),
};

export const ReceiveInput = z.object({
  clientKey: key,
  productId: z.uuid(),
  batchNumber,
  expiry,
  quantity,
  from: z.enum(Object.keys(DELIVERY_FROM) as [keyof typeof DELIVERY_FROM]),
  deliveryRef: optional(120),
});

export const FoundInput = z.union([
  z.object({
    clientKey: key,
    productId: z.uuid(),
    batchNumber,
    expiry,
    quantity,
    reason: text(3, 500),
  }),
  z.object({
    clientKey: key,
    newProduct: z.object({ medicineId, ...productFields }),
    batchNumber,
    expiry,
    quantity,
    reason: text(3, 500),
  }),
]);

const countReasonCode = z.enum(
  Object.keys(COUNT_DIFFERENCE_REASONS) as [keyof typeof COUNT_DIFFERENCE_REASONS],
);
export const CountInput = z.discriminatedUnion("step", [
  z.object({
    step: z.literal("count"),
    clientKey: key,
    /** Null for a full count of the point. */
    medicineId: medicineId.nullable(),
    lines: z
      .array(z.object({ batchId: z.uuid(), counted: z.number().int().min(0).max(1_000_000) }))
      .max(500),
  }),
  z.object({
    step: z.literal("reasons"),
    countId: z.uuid(),
    corrections: z
      .array(
        z
          .object({ batchId: z.uuid(), reasonCode: countReasonCode, note: optional(500) })
          .refine(withNote, noteMessage),
      )
      .min(1)
      .max(500),
  }),
]);

export const AdjustInput = z
  .object({
    clientKey: key,
    batchId: z.uuid(),
    quantity: z
      .number()
      .int()
      .min(-1_000_000)
      .max(1_000_000)
      .refine((n) => n !== 0, "Give a quantity other than zero."),
    reasonCode: z.enum(Object.keys(ADJUSTMENT_REASONS) as [keyof typeof ADJUSTMENT_REASONS], {
      message: "Choose a reason.",
    }),
    note: optional(500),
  })
  .refine(withNote, noteMessage);

export const TransferInput = z.object({
  clientKey: key,
  batchId: z.uuid(),
  quantity,
  toPointId: z.uuid(),
  requestId: z.uuid().optional(),
});

export const RequestInput = z.object({
  clientKey: key,
  toPointId: z.uuid(),
  medicineId,
  quantity: quantity.nullable(),
});

export const CloseRequestInput = z.object({ requestId: z.uuid(), reason: text(2, 200) });

export const ProductInput = z.object({ clientKey: key, medicineId, ...productFields });

export const PriceInput = z.object({
  productId: z.uuid(),
  priceUgx: z
    .string()
    .trim()
    .regex(/^\d{1,12}(\.\d{1,2})?$/, "Give the price in Uganda shillings, for example 1500.")
    .nullable(),
});

export const LevelInput = z.object({
  clientKey: key,
  medicineId,
  level: z.number().int().min(0).max(1_000_000).nullable(),
});

export const FreshnessInput = z.object({ days: z.number().int().min(1).max(365).nullable() });

export const CorrectInput = z.object({
  clientKey: key,
  batchId: z.uuid(),
  batchNumber,
  expiry,
  reason: text(3, 300),
});

/* ─── Shared steps ────────────────────────────────────────────────────── */

const fail = (code: "invalid" | "conflict" | "not_found" | "config", m: string) =>
  new EmrWriteError(code, m);

function pointOf(ctx: PharmacyCtx): PharmacyPoint {
  if (!ctx.point) throw fail("invalid", STOCK.noPoint);
  return ctx.point;
}

const refuseControlled = (medicine: string) => {
  if (drugById(medicine)?.flags.controlled) throw fail("config", STOCK.controlledNextStep);
};

/** A retried request: the row its client key created, at this hospital. */
async function replayed(
  tx: EmrTx,
  table: PgTable & { id: AnyPgColumn; hospitalId: AnyPgColumn },
  id: string,
  hospitalId: string,
): Promise<boolean> {
  const [r] = await tx.select({ h: table.hospitalId }).from(table).where(eq(table.id, id));
  if (!r) return false;
  if (r.h !== hospitalId) throw fail("conflict", "That request key is already in use.");
  return true;
}

async function productOf(ctx: PharmacyCtx, productId: string) {
  const [p] = await ctx.tx
    .select()
    .from(pharmacyProducts)
    .where(
      and(
        eq(pharmacyProducts.id, productId),
        eq(pharmacyProducts.hospitalId, ctx.actor.hospitalId),
      ),
    );
  if (!p) throw fail("not_found", "That product is not set up at this hospital.");
  return p;
}

/** CT-2: the product is at the point from its first add, receipt or count there. */
async function placeProduct(ctx: PharmacyCtx, productId: string, pointId: string) {
  await ctx.tx
    .insert(pharmacyProductPoints)
    .values({ productId, dispensingPointId: pointId, hospitalId: ctx.actor.hospitalId })
    .onConflictDoUpdate({
      target: [pharmacyProductPoints.productId, pharmacyProductPoints.dispensingPointId],
      set: { active: true, endedAt: null, endedBy: null },
      setWhere: eq(pharmacyProductPoints.active, false),
    });
}

/** A batch at a point, with its medicine: locked, as the guard locks it (SL-4). */
async function batchAt(ctx: PharmacyCtx, batchId: string, pointId: string) {
  const [b] = await ctx.tx
    .select({
      id: pharmacyBatches.id,
      pointId: pharmacyBatches.dispensingPointId,
      productId: pharmacyBatches.productId,
      batchNumber: pharmacyBatches.batchNumber,
      expiry: pharmacyBatches.expiry,
      expiryMonthOnly: pharmacyBatches.expiryMonthOnly,
      medicineId: pharmacyProducts.medicineId,
    })
    .from(pharmacyBatches)
    .innerJoin(pharmacyProducts, eq(pharmacyProducts.id, pharmacyBatches.productId))
    .where(
      and(
        eq(pharmacyBatches.id, batchId),
        eq(pharmacyBatches.hospitalId, ctx.actor.hospitalId),
        eq(pharmacyBatches.dispensingPointId, pointId),
      ),
    )
    .for("update", { of: pharmacyBatches });
  if (!b) throw fail("not_found", "That batch is not at this dispensing point.");
  return b satisfies Batch;
}

/**
 * SL-3: the batch with this number at the point, made if new. The same number with a different
 * expiry is refused with both shown (S6); a month and its last day are the same expiry.
 */
async function batchFor(
  ctx: PharmacyCtx,
  pointId: string,
  productId: string,
  number: string,
  exp: { expiry: string; monthOnly: boolean },
  ifExists: "use" | "refuse" = "use",
): Promise<string> {
  const [b] = await ctx.tx
    .select()
    .from(pharmacyBatches)
    .where(
      and(
        eq(pharmacyBatches.dispensingPointId, pointId),
        eq(pharmacyBatches.productId, productId),
        eq(pharmacyBatches.batchNumber, number),
      ),
    )
    .for("update");
  const typed = { expiry: exp.expiry, expiryMonthOnly: exp.monthOnly };
  if (b) {
    if (expiresOn(b) !== expiresOn(typed))
      throw fail("conflict", STOCK.expiryClash(number, expiryText(b), expiryText(typed)));
    if (ifExists === "refuse") throw fail("conflict", STOCK.alreadyHere(number));
    return b.id;
  }
  const [made] = await ctx.tx
    .insert(pharmacyBatches)
    .values({
      hospitalId: ctx.actor.hospitalId,
      dispensingPointId: pointId,
      productId,
      batchNumber: number,
      expiry: exp.expiry,
      expiryMonthOnly: exp.monthOnly,
      firstBatchNumber: number,
      firstExpiry: exp.expiry,
      createdBy: ctx.actor.userId,
    })
    .returning({ id: pharmacyBatches.id });
  return made!.id;
}

async function move(
  ctx: PharmacyCtx,
  m: {
    id?: string;
    pointId: string;
    batchId: string;
    kind: MovementKind;
    quantity: number;
    sourceKind: string;
    sourceId?: string | null;
    reasonCode?: string | null;
    reasonNote?: string | null;
    deliveryFrom?: string | null;
    deliveryRef?: string | null;
  },
): Promise<string> {
  const { pointId, ...rest } = m;
  const [row] = await ctx.tx
    .insert(pharmacyStockMovements)
    .values({
      ...rest,
      hospitalId: ctx.actor.hospitalId,
      dispensingPointId: pointId,
      effectiveAt: ctx.now,
      actorUserId: ctx.actor.userId,
    })
    .returning({ id: pharmacyStockMovements.id });
  return row!.id;
}

async function balancesOf(tx: EmrTx, batchIds: readonly string[]): Promise<Map<string, number>> {
  if (!batchIds.length) return new Map();
  const rows = await tx
    .select({
      batchId: pharmacyStockMovements.batchId,
      total: sql`coalesce(sum(${pharmacyStockMovements.quantity}), 0)`.mapWith(Number),
    })
    .from(pharmacyStockMovements)
    .where(inArray(pharmacyStockMovements.batchId, [...batchIds]))
    .groupBy(pharmacyStockMovements.batchId);
  return new Map(rows.map((r) => [r.batchId, r.total]));
}

async function newProduct(
  ctx: PharmacyCtx,
  pointId: string,
  p: Omit<z.infer<typeof ProductInput>, "clientKey"> & { clientKey?: string },
  addedAtWindow: boolean,
): Promise<string> {
  refuseControlled(p.medicineId);
  const [row] = await ctx.tx
    .insert(pharmacyProducts)
    .values({
      ...(p.clientKey ? { id: p.clientKey } : {}),
      hospitalId: ctx.actor.hospitalId,
      medicineId: p.medicineId,
      name: p.name,
      manufacturer: p.manufacturer,
      strength: p.strength,
      packSize: p.packSize,
      issueUnit: p.issueUnit,
      registrationNumber: p.registrationNumber,
      addedAtWindow,
      createdBy: ctx.actor.userId,
    })
    .returning({ id: pharmacyProducts.id });
  await placeProduct(ctx, row!.id, pointId);
  return row!.id;
}

/* ─── Writes ──────────────────────────────────────────────────────────── */

/** 5.8 Receive stock (S1, S6). */
export async function receiveStock(ctx: PharmacyCtx, input: z.infer<typeof ReceiveInput>) {
  const point = pointOf(ctx);
  if (await replayed(ctx.tx, pharmacyStockMovements, input.clientKey, ctx.actor.hospitalId))
    return { id: input.clientKey };
  const product = await productOf(ctx, input.productId);
  refuseControlled(product.medicineId);
  if (!product.active) throw fail("conflict", "That product has been ended.");
  await placeProduct(ctx, product.id, point.id);
  const batchId = await batchFor(ctx, point.id, product.id, input.batchNumber, input.expiry);
  const id = await move(ctx, {
    id: input.clientKey,
    pointId: point.id,
    batchId,
    kind: "received",
    quantity: input.quantity,
    sourceKind: "delivery",
    deliveryFrom: input.from,
    deliveryRef: input.deliveryRef,
  });
  return { id, batchId };
}

/** 5.3.1 Add a batch found on the shelf (S8); a new product is marked "Added at the window". */
export async function addBatchFoundOnShelf(ctx: PharmacyCtx, input: z.infer<typeof FoundInput>) {
  const point = pointOf(ctx);
  if (await replayed(ctx.tx, pharmacyStockMovements, input.clientKey, ctx.actor.hospitalId))
    return { id: input.clientKey };
  let productId: string;
  if ("productId" in input) {
    const product = await productOf(ctx, input.productId);
    refuseControlled(product.medicineId);
    await placeProduct(ctx, product.id, point.id);
    productId = product.id;
  } else {
    productId = await newProduct(ctx, point.id, input.newProduct, true);
  }
  const batchId = await batchFor(
    ctx,
    point.id,
    productId,
    input.batchNumber,
    input.expiry,
    "refuse",
  );
  const id = await move(ctx, {
    id: input.clientKey,
    pointId: point.id,
    batchId,
    kind: "adjusted",
    quantity: input.quantity,
    sourceKind: "found_on_shelf",
    reasonCode: "found",
    reasonNote: input.reason,
  });
  return { id, batchId, productId };
}

export interface CountLineResult {
  batchId: string;
  batchNumber: string;
  counted: number;
  recorded: number;
}

/**
 * 5.8 Count, blind (SL-6, S2). Step "count": the typed figures are written with the balance read in
 * the same transaction, and only then returned beside it. A count must cover every batch the screen
 * listed: each batch of the medicine (every medicine for a full count) here, except an expired one
 * that holds nothing. Step "reasons": a difference becomes a `count_correction` for counted − recorded
 * with its reason, once per batch; the count line keeps the figures as typed.
 */
export async function recordCount(ctx: PharmacyCtx, input: z.infer<typeof CountInput>) {
  const point = pointOf(ctx);
  if (input.step === "reasons") return correctCount(ctx, point, input);

  if (await replayed(ctx.tx, pharmacyCounts, input.clientKey, ctx.actor.hospitalId))
    return { id: input.clientKey, lines: await countLines(ctx.tx, input.clientKey) };
  if (input.medicineId) refuseControlled(input.medicineId);
  const scoped = await ctx.tx
    .select({
      id: pharmacyBatches.id,
      batchNumber: pharmacyBatches.batchNumber,
      expiry: pharmacyBatches.expiry,
      expiryMonthOnly: pharmacyBatches.expiryMonthOnly,
      medicineId: pharmacyProducts.medicineId,
    })
    .from(pharmacyBatches)
    .innerJoin(pharmacyProducts, eq(pharmacyProducts.id, pharmacyBatches.productId))
    .where(
      and(
        eq(pharmacyBatches.dispensingPointId, point.id),
        input.medicineId ? eq(pharmacyProducts.medicineId, input.medicineId) : undefined,
      ),
    )
    .for("update", { of: pharmacyBatches });
  const byId = new Map(scoped.map((b) => [b.id, b]));
  const typed = new Map(input.lines.map((l) => [l.batchId, l.counted]));
  if (typed.size !== input.lines.length) throw fail("invalid", "Each batch is counted once.");
  for (const id of typed.keys()) {
    const b = byId.get(id);
    if (!b) throw fail("not_found", "That batch is not at this dispensing point.");
    refuseControlled(b.medicineId);
  }
  const balance = await balancesOf(
    ctx.tx,
    scoped.map((b) => b.id),
  );
  const today = localDate(ctx.now);
  const missing = scoped.filter(
    (b) => !typed.has(b.id) && !(isExpired(b, today) && (balance.get(b.id) ?? 0) === 0),
  );
  if (missing.length)
    throw fail(
      "invalid",
      `Type a figure for every batch: ${missing.map((b) => b.batchNumber).join(", ")}.`,
    );

  const [count] = await ctx.tx
    .insert(pharmacyCounts)
    .values({
      id: input.clientKey,
      hospitalId: ctx.actor.hospitalId,
      dispensingPointId: point.id,
      scope: input.medicineId ? "medicine" : "full",
      medicineId: input.medicineId,
      countedBy: ctx.actor.userId,
    })
    .returning({ id: pharmacyCounts.id });
  if (input.lines.length)
    await ctx.tx.insert(pharmacyCountLines).values(
      input.lines.map((l) => ({
        countId: count!.id,
        batchId: l.batchId,
        countedQuantity: l.counted,
        recordedBalance: balance.get(l.batchId) ?? 0,
      })),
    );
  return {
    id: count!.id,
    lines: input.lines.map(
      (l): CountLineResult => ({
        batchId: l.batchId,
        batchNumber: byId.get(l.batchId)!.batchNumber,
        counted: l.counted,
        recorded: balance.get(l.batchId) ?? 0,
      }),
    ),
  };
}

async function countLines(tx: EmrTx, countId: string): Promise<CountLineResult[]> {
  return tx
    .select({
      batchId: pharmacyCountLines.batchId,
      batchNumber: pharmacyBatches.batchNumber,
      counted: pharmacyCountLines.countedQuantity,
      recorded: pharmacyCountLines.recordedBalance,
    })
    .from(pharmacyCountLines)
    .innerJoin(pharmacyBatches, eq(pharmacyBatches.id, pharmacyCountLines.batchId))
    .where(eq(pharmacyCountLines.countId, countId));
}

async function correctCount(
  ctx: PharmacyCtx,
  point: PharmacyPoint,
  input: Extract<z.infer<typeof CountInput>, { step: "reasons" }>,
) {
  await ctx.tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtext(${`pharmacy-count:${input.countId}`}))`,
  );
  const [count] = await ctx.tx
    .select({ id: pharmacyCounts.id })
    .from(pharmacyCounts)
    .where(
      and(
        eq(pharmacyCounts.id, input.countId),
        eq(pharmacyCounts.hospitalId, ctx.actor.hospitalId),
        eq(pharmacyCounts.dispensingPointId, point.id),
      ),
    );
  if (!count) throw fail("not_found", "That count is not at this dispensing point.");
  const lines = new Map((await countLines(ctx.tx, count.id)).map((l) => [l.batchId, l]));
  const done = new Set(
    (
      await ctx.tx
        .select({ batchId: pharmacyStockMovements.batchId })
        .from(pharmacyStockMovements)
        .where(
          and(
            eq(pharmacyStockMovements.sourceKind, "count"),
            eq(pharmacyStockMovements.sourceId, count.id),
          ),
        )
    ).map((m) => m.batchId),
  );
  for (const c of input.corrections) {
    const line = lines.get(c.batchId);
    if (!line) throw fail("not_found", "That batch was not in this count.");
    if (line.counted === line.recorded) throw fail("invalid", STOCK.matched(line.counted));
    if (done.has(c.batchId)) continue;
    await batchAt(ctx, c.batchId, point.id);
    await move(ctx, {
      pointId: point.id,
      batchId: c.batchId,
      kind: "count_correction",
      quantity: line.counted - line.recorded,
      sourceKind: "count",
      sourceId: count.id,
      reasonCode: c.reasonCode,
      reasonNote: c.note,
    });
    done.add(c.batchId);
  }
  return { id: count.id };
}

/** 5.8 Adjust (S3): a signed quantity and a coded reason; `other` with text. */
export async function adjustStock(ctx: PharmacyCtx, input: z.infer<typeof AdjustInput>) {
  const point = pointOf(ctx);
  if (await replayed(ctx.tx, pharmacyStockMovements, input.clientKey, ctx.actor.hospitalId))
    return { id: input.clientKey };
  const batch = await batchAt(ctx, input.batchId, point.id);
  refuseControlled(batch.medicineId);
  const id = await move(ctx, {
    id: input.clientKey,
    pointId: point.id,
    batchId: batch.id,
    kind: "adjusted",
    quantity: input.quantity,
    sourceKind: "adjustment",
    reasonCode: input.reasonCode,
    reasonNote: input.note,
  });
  return { id };
}

/**
 * 5.8 Send to another point (SL-7, S5): `transfer_out` here and `transfer_in` there in this one
 * transaction. The destination gets the same batch (number and expiry), made if absent. Sent for a
 * request, the request closes with the movement.
 */
export async function transferStock(ctx: PharmacyCtx, input: z.infer<typeof TransferInput>) {
  const point = pointOf(ctx);
  if (await replayed(ctx.tx, pharmacyStockMovements, input.clientKey, ctx.actor.hospitalId))
    return { id: input.clientKey };
  if (input.toPointId === point.id) throw fail("invalid", "Choose another dispensing point.");
  const to = await loadPoint(ctx.tx, ctx.actor.hospitalId, input.toPointId);
  if (!to) throw fail("not_found", "That dispensing point is not at your hospital.");
  const batch = await batchAt(ctx, input.batchId, point.id);
  refuseControlled(batch.medicineId);

  const request = input.requestId ? await openRequest(ctx, input.requestId, point.id) : null;
  if (request && (request.fromPointId !== to.id || request.medicineId !== batch.medicineId))
    throw fail("invalid", "This batch does not answer that request.");

  await placeProduct(ctx, batch.productId, to.id);
  const there = await batchFor(ctx, to.id, batch.productId, batch.batchNumber, {
    expiry: batch.expiry,
    monthOnly: batch.expiryMonthOnly,
  });
  const out = await move(ctx, {
    id: input.clientKey,
    pointId: point.id,
    batchId: batch.id,
    kind: "transfer_out",
    quantity: -input.quantity,
    sourceKind: "transfer",
    sourceId: input.clientKey,
  });
  await move(ctx, {
    pointId: to.id,
    batchId: there,
    kind: "transfer_in",
    quantity: input.quantity,
    sourceKind: "transfer",
    sourceId: out,
  });
  if (request)
    await ctx.tx
      .update(pharmacyStockRequests)
      .set({ closedAt: ctx.now, closedBy: ctx.actor.userId, transferMovementId: out })
      .where(eq(pharmacyStockRequests.id, request.id));
  return { id: out };
}

/** An open request that this point was asked, or (to withdraw it) made. */
async function openRequest(ctx: PharmacyCtx, id: string, pointId: string, asker = false) {
  const [r] = await ctx.tx
    .select()
    .from(pharmacyStockRequests)
    .where(
      and(
        eq(pharmacyStockRequests.id, id),
        eq(pharmacyStockRequests.hospitalId, ctx.actor.hospitalId),
        asker
          ? or(
              eq(pharmacyStockRequests.toPointId, pointId),
              eq(pharmacyStockRequests.fromPointId, pointId),
            )
          : eq(pharmacyStockRequests.toPointId, pointId),
      ),
    )
    .for("update");
  if (!r) throw fail("not_found", "That request is not for this dispensing point.");
  if (r.closedAt) throw fail("conflict", "This request is already closed.");
  return r;
}

/** SL-7: ask another point of the hospital for a medicine. */
export async function requestStock(ctx: PharmacyCtx, input: z.infer<typeof RequestInput>) {
  const point = pointOf(ctx);
  if (await replayed(ctx.tx, pharmacyStockRequests, input.clientKey, ctx.actor.hospitalId))
    return { id: input.clientKey };
  if (input.toPointId === point.id) throw fail("invalid", "Choose another dispensing point.");
  if (!(await loadPoint(ctx.tx, ctx.actor.hospitalId, input.toPointId)))
    throw fail("not_found", "That dispensing point is not at your hospital.");
  const [r] = await ctx.tx
    .insert(pharmacyStockRequests)
    .values({
      id: input.clientKey,
      hospitalId: ctx.actor.hospitalId,
      fromPointId: point.id,
      toPointId: input.toPointId,
      medicineId: input.medicineId,
      quantity: input.quantity,
      requestedBy: ctx.actor.userId,
    })
    .returning({ id: pharmacyStockRequests.id });
  return { id: r!.id };
}

/** SL-7: a request closed by a person, with a reason (by the point asked, or the one asking). */
export async function closeStockRequest(
  ctx: PharmacyCtx,
  input: z.infer<typeof CloseRequestInput>,
) {
  const point = pointOf(ctx);
  const r = await openRequest(ctx, input.requestId, point.id, true);
  await ctx.tx
    .update(pharmacyStockRequests)
    .set({ closedAt: ctx.now, closedBy: ctx.actor.userId, closeReason: input.reason })
    .where(eq(pharmacyStockRequests.id, r.id));
  return { id: r.id };
}

/** CT-2, 5.8 Products: a product of one medicine, at this point from now. No price here (manage). */
export async function addProduct(ctx: PharmacyCtx, input: z.infer<typeof ProductInput>) {
  const point = pointOf(ctx);
  if (await replayed(ctx.tx, pharmacyProducts, input.clientKey, ctx.actor.hospitalId))
    return { id: input.clientKey };
  return { id: await newProduct(ctx, point.id, input, false) };
}

/** CT-5: the price in force (manage); a supply snapshots it. */
export async function setProductPrice(ctx: PharmacyCtx, input: z.infer<typeof PriceInput>) {
  const product = await productOf(ctx, input.productId);
  await ctx.tx
    .update(pharmacyProducts)
    .set({ priceUgx: input.priceUgx, updatedAt: ctx.now })
    .where(eq(pharmacyProducts.id, product.id));
  return { id: product.id };
}

/** D-PH1-23: the reorder level at this point (manage); null clears it. Append-only. */
export async function setReorderLevel(ctx: PharmacyCtx, input: z.infer<typeof LevelInput>) {
  const point = pointOf(ctx);
  if (await replayed(ctx.tx, pharmacyReorderLevels, input.clientKey, ctx.actor.hospitalId))
    return { id: input.clientKey };
  const [r] = await ctx.tx
    .insert(pharmacyReorderLevels)
    .values({
      id: input.clientKey,
      hospitalId: ctx.actor.hospitalId,
      dispensingPointId: point.id,
      medicineId: input.medicineId,
      level: input.level,
      setBy: ctx.actor.userId,
    })
    .returning({ id: pharmacyReorderLevels.id });
  return { id: r!.id };
}

/** D-PH1-23: how many days a count stays fresh at this point (manage); null, never stale. */
export async function setCountFreshness(ctx: PharmacyCtx, input: z.infer<typeof FreshnessInput>) {
  const point = pointOf(ctx);
  await ctx.tx
    .update(pharmacyDispensingPoints)
    .set({ countFreshnessDays: input.days })
    .where(
      and(
        eq(pharmacyDispensingPoints.departmentId, point.id),
        eq(pharmacyDispensingPoints.hospitalId, ctx.actor.hospitalId),
      ),
    );
  return { id: point.id };
}

/**
 * SL-11, S11: a mistyped batch number or expiry (manage). The correction row comes first, then the
 * batch, in this transaction (the 0124 guard insists); movements are untouched.
 */
export async function correctBatchDetails(ctx: PharmacyCtx, input: z.infer<typeof CorrectInput>) {
  const point = pointOf(ctx);
  if (await replayed(ctx.tx, pharmacyBatchCorrections, input.clientKey, ctx.actor.hospitalId))
    return { id: input.clientKey };
  const batch = await batchAt(ctx, input.batchId, point.id);
  refuseControlled(batch.medicineId);
  const change = correctBatch(batch, {
    batchNumber: input.batchNumber,
    expiry: input.expiry.expiry,
    reason: input.reason,
  });
  if (!change.ok)
    throw fail(
      "invalid",
      change.reason === "unchanged" ? "Nothing has changed." : "Give a reason.",
    );
  if (input.batchNumber !== batch.batchNumber) {
    const [clash] = await ctx.tx
      .select({ id: pharmacyBatches.id })
      .from(pharmacyBatches)
      .where(
        and(
          eq(pharmacyBatches.dispensingPointId, point.id),
          eq(pharmacyBatches.productId, batch.productId),
          eq(pharmacyBatches.batchNumber, input.batchNumber),
        ),
      );
    if (clash) throw fail("conflict", STOCK.alreadyHere(input.batchNumber));
  }
  const c = change.correction;
  const [row] = await ctx.tx
    .insert(pharmacyBatchCorrections)
    .values({
      id: input.clientKey,
      batchId: batch.id,
      hospitalId: ctx.actor.hospitalId,
      oldBatchNumber: c.oldBatchNumber,
      newBatchNumber: c.newBatchNumber,
      oldExpiry: c.oldExpiry,
      newExpiry: c.newExpiry,
      actorUserId: ctx.actor.userId,
      reason: c.reason,
    })
    .returning({ id: pharmacyBatchCorrections.id });
  await ctx.tx
    .update(pharmacyBatches)
    .set({
      batchNumber: c.newBatchNumber,
      expiry: c.newExpiry,
      expiryMonthOnly: input.expiry.monthOnly,
    })
    .where(eq(pharmacyBatches.id, batch.id));
  return { id: row!.id };
}
