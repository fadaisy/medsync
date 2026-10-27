import "server-only";

import { createHash } from "node:crypto";
import type { Charge, PriceRule } from "./engine";
import type { EmrDb, EmrTx } from "@/lib/emr/db";
import type { PharmacyCtx } from "@/lib/pharmacy/write";
import { and, desc, eq, inArray, isNull, lte, sql } from "drizzle-orm";
import { z } from "zod";

import {
  pharmacyProducts,
  pharmacySupplies,
  pharmacySupplyReversals,
} from "@/db/schema/pharmacy-dispensing";
import {
  pharmacyPayers,
  pharmacyPointChargeModes,
  pharmacyPointPayFirst,
  pharmacyPriceRules,
  pharmacyProductPrices,
} from "@/db/schema/pharmacy-prices";
import { pharmacyCostCorrections } from "@/db/schema/pharmacy-stores";
import { EmrWriteError } from "@/lib/emr/write/context";
import { localDate } from "@/lib/pharmacy/stock/ledger";
import { loadLedger } from "@/lib/pharmacy/stores/recall-read";
import { chargeFor, modeOn, priceInForce, proposePrice, stockValue } from "./engine";

/**
 * Prices, server side (catalogue slice Step 8; ADRs 0460, 0461). Reads run as the viewer (RLS: `pharmacy.view` at
 * the hospital, S32); writes run through `runPharmacyWrite` with `pharmacy.manage`. Every change is a new row from a
 * date (Law 12). Callers check `pharmacyCatalogueLiveFor` first: before 0257 is applied none of these tables exist.
 */

type Db = EmrDb | EmrTx;
const rowsOf = <T>(r: unknown): T[] =>
  Array.isArray(r) ? (r as T[]) : ((r as { rows: T[] }).rows ?? []);

export async function cashPayerId(tx: Db, hospitalId: string): Promise<string | null> {
  const [r] = await tx
    .select({ id: pharmacyPayers.id })
    .from(pharmacyPayers)
    .where(and(eq(pharmacyPayers.hospitalId, hospitalId), eq(pharmacyPayers.code, "cash")));
  return r?.id ?? null;
}

/** The point's charge mode on a date (none set is `charged`). */
async function pointModeOn(tx: Db, hospitalId: string, pointId: string, on: string) {
  const rows = await tx
    .select({
      mode: pharmacyPointChargeModes.mode,
      fromDate: pharmacyPointChargeModes.fromDate,
      createdAt: pharmacyPointChargeModes.createdAt,
    })
    .from(pharmacyPointChargeModes)
    .where(
      and(
        eq(pharmacyPointChargeModes.hospitalId, hospitalId),
        eq(pharmacyPointChargeModes.dispensingPointId, pointId),
      ),
    );
  return modeOn(rows, on);
}

async function priceRows(tx: Db, hospitalId: string, productIds: readonly string[]) {
  if (!productIds.length) return [];
  return tx
    .select({
      productId: pharmacyProductPrices.productId,
      payerId: pharmacyProductPrices.payerId,
      priceUgx: pharmacyProductPrices.priceUgx,
      free: pharmacyProductPrices.free,
      fromDate: pharmacyProductPrices.fromDate,
      createdAt: pharmacyProductPrices.createdAt,
    })
    .from(pharmacyProductPrices)
    .where(
      and(
        eq(pharmacyProductPrices.hospitalId, hospitalId),
        inArray(pharmacyProductPrices.productId, [...productIds]),
      ),
    );
}

export interface PriceFact {
  priceUgx: string | null;
  priceKind: Charge["kind"];
  payerId: string | null;
}

/**
 * The supply snapshot (S28–S30): for each product, the cash price in force at this point today, `free` at a free
 * point, or `price_not_set`. The snapshot is written once onto the supply and never re-read from the price list.
 */
export async function priceFacts(
  tx: Db,
  hospitalId: string,
  pointId: string,
  productIds: readonly string[],
  on: string,
): Promise<Map<string, PriceFact>> {
  const [mode, payerId, rows] = await Promise.all([
    pointModeOn(tx, hospitalId, pointId, on),
    cashPayerId(tx, hospitalId),
    priceRows(tx, hospitalId, productIds),
  ]);
  const out = new Map<string, PriceFact>();
  for (const id of productIds) {
    const c = chargeFor(mode, payerId ? priceInForce(rows, id, payerId, on) : null);
    out.set(id, {
      priceUgx: c.kind === "priced" ? String(c.unitPrice) : null,
      priceKind: c.kind,
      payerId,
    });
  }
  return out;
}

/** D-CAT-11: the point's pay-before-collecting setting on a date; null when never set (the hospital's stands). */
export async function payFirstOn(
  tx: Db,
  hospitalId: string,
  pointId: string,
  on: string,
): Promise<boolean | null> {
  const [r] = await tx
    .select({ required: pharmacyPointPayFirst.required })
    .from(pharmacyPointPayFirst)
    .where(
      and(
        eq(pharmacyPointPayFirst.hospitalId, hospitalId),
        eq(pharmacyPointPayFirst.dispensingPointId, pointId),
        lte(pharmacyPointPayFirst.fromDate, on),
      ),
    )
    .orderBy(desc(pharmacyPointPayFirst.fromDate), desc(pharmacyPointPayFirst.createdAt))
    .limit(1);
  return r?.required ?? null;
}

export interface BillableLine {
  supplyId: string;
  prescriptionId: string | null;
  productId: string | null;
  quantity: number;
  issueUnit: string;
  payerId: string | null;
  kind: Charge["kind"];
  unitPrice: number | null;
  lineTotal: number | null;
}

/**
 * The contract with Accounts (ADR 0461): one row per supply of these prescriptions that stands (a reversed supply is
 * not owed), with the snapshot taken at supply, and a version that changes whenever a line does (S30). A supply from
 * before 0257 carries no kind: a snapshot price reads as priced, none as `price_not_set`, never 0. Writes nothing.
 */
export async function billableLines(
  tx: Db,
  hospitalId: string,
  prescriptionIds: readonly string[],
): Promise<{ lines: BillableLine[]; totalUgx: number; version: string }> {
  if (!prescriptionIds.length) return { lines: [], totalUgx: 0, version: hash([]) };
  const rows = await tx
    .select({
      supplyId: pharmacySupplies.id,
      prescriptionId: pharmacySupplies.prescriptionId,
      productId: pharmacySupplies.productId,
      quantity: pharmacySupplies.quantity,
      issueUnit: pharmacySupplies.issueUnit,
      payerId: pharmacySupplies.payerId,
      priceKind: pharmacySupplies.priceKind,
      priceUgx: pharmacySupplies.priceUgx,
    })
    .from(pharmacySupplies)
    .leftJoin(pharmacySupplyReversals, eq(pharmacySupplyReversals.supplyId, pharmacySupplies.id))
    .where(
      and(
        eq(pharmacySupplies.hospitalId, hospitalId),
        inArray(pharmacySupplies.prescriptionId, [...prescriptionIds]),
        isNull(pharmacySupplyReversals.id),
      ),
    )
    .orderBy(pharmacySupplies.suppliedAt, pharmacySupplies.id);
  const lines = rows.map((r): BillableLine => {
    const price = r.priceUgx === null ? null : Number(r.priceUgx);
    const kind: Charge["kind"] =
      r.priceKind ?? (price !== null && price > 0 ? "priced" : "price_not_set");
    const unitPrice = kind === "priced" ? price : null;
    return {
      supplyId: r.supplyId,
      prescriptionId: r.prescriptionId,
      productId: r.productId,
      quantity: r.quantity,
      issueUnit: r.issueUnit,
      payerId: r.payerId ?? null,
      kind,
      unitPrice,
      lineTotal: unitPrice === null ? null : unitPrice * r.quantity,
    };
  });

  return {
    lines,
    totalUgx: lines.reduce((a, l) => a + (l.lineTotal ?? 0), 0),
    version: hash(lines),
  };
}

const hash = (v: unknown) =>
  createHash("sha256").update(JSON.stringify(v)).digest("hex").slice(0, 16);

/**
 * S31: the value of the stock on hand, here or at one place: each batch's balance × the quantity-weighted mean of
 * its costed receipts (a cost correction replaces its receipt's cost). A moved batch keeps its cost (SL-17, by
 * product and batch number, as the month report does). Batches with stock and no cost are named.
 */
/** Each batch's balance and costed receipts (cost corrections applied), with the ledger it came from. */
async function costedBatches(tx: Db, hospitalId: string) {
  const [ledger, fixes] = await Promise.all([
    loadLedger(tx, hospitalId),
    tx
      .select({
        movementId: pharmacyCostCorrections.movementId,
        cost: pharmacyCostCorrections.newCost,
      })
      .from(pharmacyCostCorrections)
      .where(eq(pharmacyCostCorrections.hospitalId, hospitalId))
      .orderBy(pharmacyCostCorrections.correctedAt),
  ]);
  const corrected = new Map(fixes.map((c) => [c.movementId, Number(c.cost)]));
  const keyOf = new Map(ledger.batches.map((b) => [b.id, `${b.productId}|${b.batchNumber}`]));
  const receipts = new Map<string, { quantity: number; unitCost: number }[]>();
  const balance = new Map<string, number>();
  for (const m of ledger.movements) {
    balance.set(m.batchId, (balance.get(m.batchId) ?? 0) + m.quantity);
    const cost = corrected.get(m.id) ?? (m.unitCost == null ? null : Number(m.unitCost));
    if (m.kind !== "received" || cost === null || m.quantity <= 0) continue;
    const key = keyOf.get(m.batchId)!;
    receipts.set(key, [...(receipts.get(key) ?? []), { quantity: m.quantity, unitCost: cost }]);
  }
  const rows = ledger.batches.map((b) => ({
    batchId: b.id,
    placeId: b.pointId,
    balance: balance.get(b.id) ?? 0,
    receipts: receipts.get(keyOf.get(b.id)!) ?? [],
  }));
  return { ledger, rows, balance };
}

export async function stockValueOf(tx: Db, hospitalId: string, placeId?: string) {
  const { ledger, rows } = await costedBatches(tx, hospitalId);
  const mine = rows.filter((r) => !placeId || r.placeId === placeId);
  const batch = new Map(ledger.batches.map((b) => [b.id, b]));
  return {
    ...stockValue(mine),
    names: new Map(
      mine.map((r) => {
        const b = batch.get(r.batchId)!;
        return [r.batchId, `${ledger.products.get(b.productId)?.name ?? ""} ${b.batchNumber}`];
      }),
    ),
  };
}

/** 4.10: every place's value at cost from one read of the ledger, with the ledger and balances for the map. */
export async function placeValues(tx: Db, hospitalId: string) {
  const { ledger, rows, balance } = await costedBatches(tx, hospitalId);
  const byPlace = new Map<string, typeof rows>();
  for (const r of rows) byPlace.set(r.placeId, [...(byPlace.get(r.placeId) ?? []), r]);
  return {
    ledger,
    balance,
    rows,
    values: new Map([...byPlace].map(([id, rs]) => [id, stockValue(rs)])),
  };
}

/** The rule in force on a date, or null (none is shipped: D-CAT-10). */
export async function ruleOn(tx: Db, hospitalId: string, on: string): Promise<PriceRule | null> {
  const [r] = await tx
    .select()
    .from(pharmacyPriceRules)
    .where(and(eq(pharmacyPriceRules.hospitalId, hospitalId), lte(pharmacyPriceRules.fromDate, on)))
    .orderBy(desc(pharmacyPriceRules.fromDate), desc(pharmacyPriceRules.createdAt))
    .limit(1);
  return r
    ? {
        multiplier: Number(r.multiplier),
        roundingStep: r.roundingStep,
        payerAdjustments: r.payerAdjustments ?? {},
      }
    : null;
}

/** Each product's last received unit cost (a correction wins), for the proposal. */
export async function lastUnitCosts(tx: Db, hospitalId: string): Promise<Map<string, number>> {
  const rows = rowsOf<{ product_id: string; cost: string }>(
    await tx.execute(sql`
    SELECT DISTINCT ON (b.product_id) b.product_id, coalesce(c.new_cost, m.unit_cost) AS cost
      FROM public.pharmacy_stock_movements m
      JOIN public.pharmacy_batches b ON b.id = m.batch_id
      LEFT JOIN LATERAL (SELECT new_cost FROM public.pharmacy_cost_corrections x
                          WHERE x.movement_id = m.id ORDER BY x.corrected_at DESC LIMIT 1) c ON true
     WHERE m.hospital_id = ${hospitalId} AND m.kind = 'received' AND coalesce(c.new_cost, m.unit_cost) IS NOT NULL
     ORDER BY b.product_id, m.effective_at DESC, m.id DESC`),
  );
  return new Map(rows.map((r) => [r.product_id, Number(r.cost)]));
}

/* ─── Writes (`pharmacy.manage`) ─── */

const day = z.iso.date();

export const RuleInput = z.object({
  multiplier: z.number().positive().max(100),
  roundingStep: z.number().int().min(1).max(100000),
  payerAdjustments: z.record(z.uuid(), z.number().positive().max(10)).default({}),
  fromDate: day,
});
export const PayerInput = z.object({
  code: z.string().regex(/^[a-z0-9_]{2,40}$/, "Use 2–40 lower-case letters, digits or _."),
  name: z.string().trim().min(2).max(120),
  kind: z.enum(["scheme", "staff", "other"]),
});
export const ChargeModeInput = z.object({
  pointId: z.uuid(),
  mode: z.enum(["charged", "free"]),
  fromDate: day,
});
export const PayFirstInput = z.object({ pointId: z.uuid(), required: z.boolean(), fromDate: day });
export const SetPriceInput = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("accept"), productId: z.uuid(), payerId: z.uuid(), fromDate: day }),
  z.object({
    kind: z.literal("typed"),
    productId: z.uuid(),
    payerId: z.uuid(),
    fromDate: day,
    priceUgx: z
      .number()
      .int()
      .min(1, "A price is more than 0. Mark it free instead.")
      .max(100_000_000),
  }),
  z.object({ kind: z.literal("free"), productId: z.uuid(), payerId: z.uuid(), fromDate: day }),
]);

const fail = (words: string) => new EmrWriteError("invalid", words);

/** A date in the past rewrites history (Law 12): a change runs from today or later. */
function fromToday(ctx: PharmacyCtx, fromDate: string) {
  if (fromDate < localDate(ctx.now)) throw fail("A change runs from today or a later date.");
}

async function ownProduct(ctx: PharmacyCtx, productId: string) {
  const [p] = await ctx.tx
    .select({ id: pharmacyProducts.id })
    .from(pharmacyProducts)
    .where(
      and(
        eq(pharmacyProducts.id, productId),
        eq(pharmacyProducts.hospitalId, ctx.actor.hospitalId),
      ),
    );
  if (!p) throw new EmrWriteError("not_found", "That product is not at this hospital.");
}

async function ownPayer(ctx: PharmacyCtx, payerId: string) {
  const [p] = await ctx.tx
    .select({ id: pharmacyPayers.id })
    .from(pharmacyPayers)
    .where(
      and(eq(pharmacyPayers.id, payerId), eq(pharmacyPayers.hospitalId, ctx.actor.hospitalId)),
    );
  if (!p) throw new EmrWriteError("not_found", "That payer is not at this hospital.");
}

export async function setPriceRule(ctx: PharmacyCtx, input: z.infer<typeof RuleInput>) {
  fromToday(ctx, input.fromDate);
  for (const id of Object.keys(input.payerAdjustments)) await ownPayer(ctx, id);
  const [r] = await ctx.tx
    .insert(pharmacyPriceRules)
    .values({
      hospitalId: ctx.actor.hospitalId,
      multiplier: String(input.multiplier),
      roundingStep: input.roundingStep,
      payerAdjustments: input.payerAdjustments,
      fromDate: input.fromDate,
      setBy: ctx.actor.userId,
    })
    .returning({ id: pharmacyPriceRules.id });
  return { id: r!.id };
}

/** The cash payer is made with the first one, so every hospital has it. */
export async function ensureCashPayer(ctx: PharmacyCtx) {
  await ctx.tx
    .insert(pharmacyPayers)
    .values({ hospitalId: ctx.actor.hospitalId, code: "cash", name: "Cash", kind: "cash" })
    .onConflictDoNothing();
  return (await cashPayerId(ctx.tx, ctx.actor.hospitalId))!;
}

export async function addPayer(ctx: PharmacyCtx, input: z.infer<typeof PayerInput>) {
  await ensureCashPayer(ctx);
  const [r] = await ctx.tx
    .insert(pharmacyPayers)
    .values({ hospitalId: ctx.actor.hospitalId, ...input, createdBy: ctx.actor.userId })
    .onConflictDoNothing()
    .returning({ id: pharmacyPayers.id });
  if (!r) throw new EmrWriteError("conflict", "A payer with that code is already here.");
  return { id: r.id };
}

export async function setChargeMode(ctx: PharmacyCtx, input: z.infer<typeof ChargeModeInput>) {
  fromToday(ctx, input.fromDate);
  const [r] = await ctx.tx
    .insert(pharmacyPointChargeModes)
    .values({
      hospitalId: ctx.actor.hospitalId,
      dispensingPointId: input.pointId,
      mode: input.mode,
      fromDate: input.fromDate,
      setBy: ctx.actor.userId,
    })
    .returning({ id: pharmacyPointChargeModes.id });
  return { id: r!.id };
}

export async function setPayFirst(ctx: PharmacyCtx, input: z.infer<typeof PayFirstInput>) {
  fromToday(ctx, input.fromDate);
  const [r] = await ctx.tx
    .insert(pharmacyPointPayFirst)
    .values({
      hospitalId: ctx.actor.hospitalId,
      dispensingPointId: input.pointId,
      required: input.required,
      fromDate: input.fromDate,
      setBy: ctx.actor.userId,
    })
    .returning({ id: pharmacyPointPayFirst.id });
  return { id: r!.id };
}

/**
 * S26: accepting a proposal re-works it on the server from the last unit cost and the rule in force, and keeps the
 * arithmetic with the price; the screen's figure is never trusted. A typed price is > 0; free is its own answer.
 */
export async function setPrice(ctx: PharmacyCtx, input: z.infer<typeof SetPriceInput>) {
  fromToday(ctx, input.fromDate);
  await ownProduct(ctx, input.productId);
  await ownPayer(ctx, input.payerId);
  let price: number | null = null;
  let basis: unknown = null;
  if (input.kind === "accept") {
    const [rule, costs] = await Promise.all([
      ruleOn(ctx.tx, ctx.actor.hospitalId, localDate(ctx.now)),
      lastUnitCosts(ctx.tx, ctx.actor.hospitalId),
    ]);
    const p = proposePrice(costs.get(input.productId) ?? null, rule, input.payerId);
    if (!p) throw fail("There is no proposal: it needs a price rule and a received unit cost.");
    price = p.price;
    basis = { steps: p.steps };
  } else if (input.kind === "typed") price = input.priceUgx;
  const [r] = await ctx.tx
    .insert(pharmacyProductPrices)
    .values({
      hospitalId: ctx.actor.hospitalId,
      productId: input.productId,
      payerId: input.payerId,
      priceUgx: price,
      free: input.kind === "free",
      fromDate: input.fromDate,
      source: input.kind === "accept" ? "rule_accepted" : "typed",
      basis,
      setBy: ctx.actor.userId,
    })
    .returning({ id: pharmacyProductPrices.id });
  return { id: r!.id };
}

/** Set-up › Prices (4.6): the rule, payers, each point's modes, the figures, what needs a price, and the history. */
export async function pricesPage(
  tx: Db,
  hospitalId: string,
  pointIds: readonly string[],
  on: string,
) {
  const [rule, payers, products, costs, value, history] = await Promise.all([
    ruleOn(tx, hospitalId, on),
    tx
      .select({
        id: pharmacyPayers.id,
        code: pharmacyPayers.code,
        name: pharmacyPayers.name,
        kind: pharmacyPayers.kind,
      })
      .from(pharmacyPayers)
      .where(and(eq(pharmacyPayers.hospitalId, hospitalId), eq(pharmacyPayers.active, true)))
      .orderBy(pharmacyPayers.createdAt),
    tx
      .select({
        id: pharmacyProducts.id,
        name: pharmacyProducts.name,
        strength: pharmacyProducts.strength,
        issueUnit: pharmacyProducts.issueUnit,
      })
      .from(pharmacyProducts)
      .where(eq(pharmacyProducts.hospitalId, hospitalId))
      .orderBy(pharmacyProducts.name),
    lastUnitCosts(tx, hospitalId),
    stockValueOf(tx, hospitalId),
    tx
      .select({
        id: pharmacyProductPrices.id,
        productId: pharmacyProductPrices.productId,
        payerId: pharmacyProductPrices.payerId,
        priceUgx: pharmacyProductPrices.priceUgx,
        free: pharmacyProductPrices.free,
        fromDate: pharmacyProductPrices.fromDate,
        source: pharmacyProductPrices.source,
        createdAt: pharmacyProductPrices.createdAt,
      })
      .from(pharmacyProductPrices)
      .where(eq(pharmacyProductPrices.hospitalId, hospitalId))
      .orderBy(desc(pharmacyProductPrices.createdAt))
      .limit(500),
  ]);
  const cash = payers.find((p) => p.code === "cash")?.id ?? null;
  const all = await priceRows(
    tx,
    hospitalId,
    products.map((p) => p.id),
  );
  const counts = { priced: 0, free: 0, notSet: 0 };
  const needs = [];
  for (const p of products) {
    const f = cash ? priceInForce(all, p.id, cash, on) : null;
    if (f?.kind === "priced") counts.priced++;
    else if (f?.kind === "free") counts.free++;
    else {
      counts.notSet++;
      needs.push({
        ...p,
        lastCost: costs.get(p.id) ?? null,
        proposal: cash ? proposePrice(costs.get(p.id) ?? null, rule, cash) : null,
      });
    }
  }
  const points = await Promise.all(
    pointIds.map(async (id) => ({
      id,
      mode: await pointModeOn(tx, hospitalId, id, on),
      payFirst: await payFirstOn(tx, hospitalId, id, on),
    })),
  );
  const names = new Map(products.map((p) => [p.id, p.name]));
  const payerNames = new Map(payers.map((p) => [p.id, p.name]));
  return {
    rule,
    payers,
    cash,
    points,
    counts,
    needs,
    value: {
      valueUgx: value.valueUgx,
      unvalued: value.unvalued.map((b) => value.names.get(b) ?? b),
    },
    history: history.slice(0, 30).map((h) => ({
      ...h,
      product: names.get(h.productId) ?? "",
      payer: payerNames.get(h.payerId) ?? "",
    })),
  };
}
export type PricesPage = Awaited<ReturnType<typeof pricesPage>>;
