import "server-only";

import type { Batch, StockState } from "./ledger";
import type { EmrDb, EmrTx } from "@/lib/emr/db";
import type { PharmacyPoint } from "@/lib/pharmacy/write";
import { and, asc, desc, eq, gte, inArray, isNull, ne, or, sql } from "drizzle-orm";

import { db as appDb } from "@/db";
import { hospitalDepartments } from "@/db/schema/hospital-departments";
import { pharmacyDispensingPoints } from "@/db/schema/pharmacy";
import {
  pharmacyBatches,
  pharmacyCountLines,
  pharmacyCounts,
  pharmacyHospitalSettings,
  pharmacyMedicineLinks,
  pharmacyNationalListEditions,
  pharmacyNationalListRows,
  pharmacyProductPoints,
  pharmacyProducts,
  pharmacyReorderLevels,
  pharmacyStockMovements,
  pharmacyStockouts,
  pharmacyStockRequests,
} from "@/db/schema/pharmacy-dispensing";
import { asClinicalReader } from "@/lib/emr/db";
import { cadreOfUsers } from "@/lib/pharmacy/read";
import { drugById } from "@/lib/prescribing/formulary";
import { daysBetween, expiresOn, isExpired, localDate, medicineTotal, stockState } from "./ledger";

/**
 * Stock at the dispensing point, read (Pharmacy Phase 1, 5.8, W10, RD-1 condition 3). Pharmacy tables
 * are read as the clinician (`asClinicalReader`): RLS returns rows only to a holder of `pharmacy.view`
 * at their own hospital (0123, 0124), so another hospital's pharmacist reads nothing (S10). The points
 * table has no reader policy (0121) and the cadre names are staff facts; those two come from the
 * owner, scoped to the hospital. Balances are sums of the ledger, never a stored figure (SL-2). The
 * rows are built by the pure functions below, which the unit tests drive.
 */

export interface StockScope {
  userId: string;
  hospitalId: string;
}

export const STOCK_TABS = ["all", "out", "low", "expiring", "not_counted"] as const;
export type StockTab = (typeof STOCK_TABS)[number];

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

export const medicineName = (id: string) => drugById(id)?.generic ?? id;

export interface StockRow {
  medicineId: string;
  name: string;
  venClass: string | null;
  /** The unexpired total (SL-5): an expired batch never counts as stock. */
  onShelf: number;
  firstExpiry: { batchNumber: string; expiry: string; expiryMonthOnly: boolean } | null;
  lastCounted: Date | null;
  state: StockState;
  days: number | null;
  supplied7: number;
  out: boolean;
  low: boolean;
  expiring: boolean;
  countedThisWeek: boolean;
}

export interface RowInput {
  medicineIds: readonly string[];
  batches: readonly Batch[];
  balances: ReadonlyMap<string, number>;
  pointId: string;
  now: Date;
  levels: ReadonlyMap<string, number | null>;
  lookaheadDays: number | null;
  outSince: ReadonlyMap<string, Date>;
  lastCounted: ReadonlyMap<string, Date>;
  supplied7: ReadonlyMap<string, number>;
  venClass: ReadonlyMap<string, string>;
}

/** Held, unexpired batches expiring within the look-ahead; none set, none (D-PH1-23). */
function expiringBatches(
  batches: readonly Batch[],
  bal: ReadonlyMap<string, number>,
  today: string,
  lookaheadDays: number | null,
): Batch[] {
  if (lookaheadDays === null) return [];
  return batches.filter(
    (b) =>
      (bal.get(b.id) ?? 0) > 0 &&
      !isExpired(b, today) &&
      daysBetween(today, expiresOn(b)) <= lookaheadDays,
  );
}

/** 5.8: one row per medicine, by name. "Low" only with a level (X-15). */
export function stockRows(i: RowInput): StockRow[] {
  const today = localDate(i.now);
  const weekAgo = i.now.getTime() - WEEK_MS;
  return i.medicineIds
    .map((medicineId): StockRow => {
      const own = i.batches.filter((b) => b.medicineId === medicineId && b.pointId === i.pointId);
      const total = medicineTotal(own, i.balances, medicineId, i.pointId, today);
      const level = i.levels.get(medicineId) ?? null;
      const { state, days } = stockState({
        batches: own,
        balances: i.balances,
        medicineId,
        pointId: i.pointId,
        localDate: today,
        reorderLevel: level,
        lookaheadDays: i.lookaheadDays,
        outSince: i.outSince.get(medicineId) ?? null,
      });
      const first = own
        .filter((b) => !isExpired(b, today) && (i.balances.get(b.id) ?? 0) > 0)
        .sort((a, b) => expiresOn(a).localeCompare(expiresOn(b)))[0];
      const counted = i.lastCounted.get(medicineId) ?? null;
      return {
        medicineId,
        name: medicineName(medicineId),
        venClass: i.venClass.get(medicineId) ?? null,
        onShelf: total,
        firstExpiry: first
          ? {
              batchNumber: first.batchNumber,
              expiry: first.expiry,
              expiryMonthOnly: first.expiryMonthOnly,
            }
          : null,
        lastCounted: counted,
        state,
        days,
        supplied7: i.supplied7.get(medicineId) ?? 0,
        out: total <= 0,
        low: level !== null && total > 0 && total < level,
        expiring: expiringBatches(own, i.balances, today, i.lookaheadDays).length > 0,
        countedThisWeek: !!counted && counted.getTime() >= weekAgo,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function rowMatches(row: StockRow, tab: StockTab): boolean {
  if (tab === "out") return row.out;
  if (tab === "low") return row.low;
  if (tab === "expiring") return row.expiring;
  if (tab === "not_counted") return !row.countedThisWeek;
  return true;
}

export const tabCounts = (rows: readonly StockRow[]) =>
  Object.fromEntries(
    STOCK_TABS.map((t) => [t, rows.filter((r) => rowMatches(r, t)).length]),
  ) as Record<StockTab, number>;

/** 5.8's three figures. `vital` is null while no national list is imported (CT-3). */
export function stockFigures(
  rows: readonly StockRow[],
  i: Pick<RowInput, "batches" | "balances" | "now" | "lookaheadDays" | "pointId">,
  listImported: boolean,
) {
  const out = rows.filter((r) => r.out);
  const here = i.batches.filter((b) => b.pointId === i.pointId);
  return {
    out: out.length,
    outVital: listImported ? out.filter((r) => r.venClass === "V").length : null,
    expiringBatches: expiringBatches(here, i.balances, localDate(i.now), i.lookaheadDays).length,
    lookaheadDays: i.lookaheadDays,
    counted: rows.filter((r) => r.countedThisWeek).length,
    medicines: rows.length,
  };
}

/**
 * RD-1 condition 3: products at the point without a count. A product is counted when a count, of any
 * scope, has a line for one of its batches at the point (`counted`, from `countedProductsAt`); or,
 * for a product with no batch to count yet, a full count or a count of its medicine taken at or after
 * it came to the point.
 */
export function openingCountMissing(
  products: readonly { productId: string; medicineId: string; since: Date }[],
  counts: readonly { medicineId: string | null; scope: string; countedAt: Date }[],
  counted: ReadonlySet<string> = new Set(),
): number {
  return products.filter(
    (p) =>
      !counted.has(p.productId) &&
      !counts.some(
        (c) =>
          (c.scope === "full" || c.medicineId === p.medicineId) &&
          c.countedAt.getTime() >= p.since.getTime(),
      ),
  ).length;
}

/** The products with a count line on one of their batches at the point (RD-1 condition 3). */
export async function countedProductsAt(tx: EmrTx, pointId: string): Promise<Set<string>> {
  const rows = await tx
    .selectDistinct({ productId: pharmacyBatches.productId })
    .from(pharmacyCountLines)
    .innerJoin(pharmacyBatches, eq(pharmacyBatches.id, pharmacyCountLines.batchId))
    .where(eq(pharmacyBatches.dispensingPointId, pointId));
  return new Set(rows.map((r) => r.productId));
}

/* ─── The loads ───────────────────────────────────────────────────────── */

const defaultDb = () => appDb as unknown as EmrDb;

async function loadPointStock(
  tx: EmrTx,
  hospitalId: string,
  pointId: string,
  now: Date,
  medicineId?: string,
) {
  const onlyMedicine = medicineId ? eq(pharmacyProducts.medicineId, medicineId) : undefined;
  const products = await tx
    .select()
    .from(pharmacyProducts)
    .where(and(eq(pharmacyProducts.hospitalId, hospitalId), onlyMedicine))
    .orderBy(asc(pharmacyProducts.name));
  const productPoints = await tx
    .select({
      productId: pharmacyProductPoints.productId,
      active: pharmacyProductPoints.active,
      startedAt: pharmacyProductPoints.startedAt,
    })
    .from(pharmacyProductPoints)
    .where(eq(pharmacyProductPoints.dispensingPointId, pointId));
  const batchRows = await tx
    .select({
      id: pharmacyBatches.id,
      pointId: sql<string>`${pharmacyBatches.dispensingPointId}`,
      productId: pharmacyBatches.productId,
      medicineId: pharmacyProducts.medicineId,
      batchNumber: pharmacyBatches.batchNumber,
      expiry: pharmacyBatches.expiry,
      expiryMonthOnly: pharmacyBatches.expiryMonthOnly,
    })
    .from(pharmacyBatches)
    .innerJoin(pharmacyProducts, eq(pharmacyProducts.id, pharmacyBatches.productId))
    .where(and(eq(pharmacyBatches.dispensingPointId, pointId), onlyMedicine));
  const batches: Batch[] = batchRows;
  const batchIds = batches.map((b) => b.id);
  const sums = batchIds.length
    ? await tx
        .select({
          batchId: pharmacyStockMovements.batchId,
          total: sql`coalesce(sum(${pharmacyStockMovements.quantity}), 0)`.mapWith(Number),
          supplied7:
            sql`coalesce(sum(-${pharmacyStockMovements.quantity}) filter (where ${pharmacyStockMovements.kind} = 'supplied' and ${pharmacyStockMovements.effectiveAt} >= ${new Date(now.getTime() - WEEK_MS).toISOString()}::timestamptz), 0)`.mapWith(
              Number,
            ),
        })
        .from(pharmacyStockMovements)
        .where(
          and(
            eq(pharmacyStockMovements.dispensingPointId, pointId),
            inArray(pharmacyStockMovements.batchId, batchIds),
          ),
        )
        .groupBy(pharmacyStockMovements.batchId)
    : [];
  const balances = new Map(sums.map((s) => [s.batchId, s.total]));
  const medicineOfBatch = new Map(batches.map((b) => [b.id, b.medicineId]));
  const supplied7 = new Map<string, number>();
  for (const s of sums) {
    const m = medicineOfBatch.get(s.batchId)!;
    supplied7.set(m, (supplied7.get(m) ?? 0) + s.supplied7);
  }

  const counts = await tx
    .select({
      id: pharmacyCounts.id,
      scope: pharmacyCounts.scope,
      medicineId: pharmacyCounts.medicineId,
      countedAt: pharmacyCounts.countedAt,
    })
    .from(pharmacyCounts)
    .where(
      and(
        eq(pharmacyCounts.dispensingPointId, pointId),
        medicineId
          ? or(eq(pharmacyCounts.medicineId, medicineId), eq(pharmacyCounts.scope, "full"))
          : undefined,
      ),
    )
    .orderBy(desc(pharmacyCounts.countedAt));
  const levels = await tx
    .selectDistinctOn([pharmacyReorderLevels.medicineId], {
      medicineId: pharmacyReorderLevels.medicineId,
      level: pharmacyReorderLevels.level,
    })
    .from(pharmacyReorderLevels)
    .where(eq(pharmacyReorderLevels.dispensingPointId, pointId))
    .orderBy(pharmacyReorderLevels.medicineId, desc(pharmacyReorderLevels.setAt));
  const outs = await tx
    .select({ medicineId: pharmacyStockouts.medicineId, startedAt: pharmacyStockouts.startedAt })
    .from(pharmacyStockouts)
    .where(
      and(eq(pharmacyStockouts.dispensingPointId, pointId), isNull(pharmacyStockouts.endedAt)),
    );
  const [settings] = await tx
    .select({ lookahead: pharmacyHospitalSettings.expiryLookaheadDays })
    .from(pharmacyHospitalSettings)
    .where(eq(pharmacyHospitalSettings.hospitalId, hospitalId));
  const can = (await tx.execute(
    sql`SELECT private.pharmacy_can('pharmacy.manage') AS ok`,
  )) as unknown as { ok: boolean }[] | { rows: { ok: boolean }[] };
  const manage = (Array.isArray(can) ? can : can.rows)[0];

  const atPoint = new Map(productPoints.map((pp) => [pp.productId, pp]));
  const medicineIds = [
    ...new Set([
      ...products.filter((p) => atPoint.get(p.id)?.active).map((p) => p.medicineId),
      ...batches.map((b) => b.medicineId),
    ]),
  ];
  const links = medicineIds.length
    ? await tx
        .select({
          medicineId: pharmacyMedicineLinks.medicineId,
          ven: pharmacyNationalListRows.venClass,
        })
        .from(pharmacyMedicineLinks)
        .innerJoin(
          pharmacyNationalListRows,
          eq(pharmacyNationalListRows.id, pharmacyMedicineLinks.rowId),
        )
        .where(inArray(pharmacyMedicineLinks.medicineId, medicineIds))
        .orderBy(desc(pharmacyMedicineLinks.linkedAt))
    : [];
  const [edition] = await tx
    .select({ id: pharmacyNationalListEditions.id })
    .from(pharmacyNationalListEditions)
    .limit(1);

  const lastCounted = new Map<string, Date>();
  const fullAt = counts.find((c) => c.scope === "full")?.countedAt;
  for (const m of medicineIds) {
    const own = counts.find((c) => c.medicineId === m)?.countedAt;
    const last = [own, fullAt].filter((d): d is Date => !!d).sort((a, b) => +b - +a)[0];
    if (last) lastCounted.set(m, last);
  }
  const venClass = new Map<string, string>();
  for (const l of links)
    if (l.ven && !venClass.has(l.medicineId)) venClass.set(l.medicineId, l.ven);

  const input: RowInput = {
    medicineIds,
    batches,
    balances,
    pointId,
    now,
    levels: new Map(levels.map((l) => [l.medicineId, l.level])),
    lookaheadDays: settings?.lookahead ?? null,
    outSince: new Map(outs.map((o) => [o.medicineId, o.startedAt])),
    lastCounted,
    supplied7,
    venClass,
  };
  const activeHere = products
    .filter((p) => p.active && atPoint.get(p.id)?.active)
    .map((p) => ({
      productId: p.id,
      medicineId: p.medicineId,
      since: atPoint.get(p.id)!.startedAt,
    }));
  return {
    input,
    products,
    atPoint,
    counts,
    counted: await countedProductsAt(tx, pointId),
    activeHere,
    listImported: !!edition,
    manages: manage?.ok === true,
  };
}

/** Every other dispensing point of the hospital, for "Send to another point". */
async function otherPoints(database: EmrDb, hospitalId: string, pointId: string) {
  return database
    .select({ id: pharmacyDispensingPoints.departmentId, name: hospitalDepartments.name })
    .from(pharmacyDispensingPoints)
    .innerJoin(
      hospitalDepartments,
      eq(hospitalDepartments.id, pharmacyDispensingPoints.departmentId),
    )
    .where(
      and(
        eq(pharmacyDispensingPoints.hospitalId, hospitalId),
        ne(pharmacyDispensingPoints.departmentId, pointId),
        isNull(hospitalDepartments.archivedAt),
      ),
    )
    .orderBy(asc(hospitalDepartments.name));
}

export type StockPage = Awaited<ReturnType<typeof getStockPage>>;

/** The Stock page (5.8): figures, rows, the opening count, and requests from other points. */
export async function getStockPage(
  scope: StockScope,
  point: Pick<PharmacyPoint, "id">,
  now: Date = new Date(),
  database: EmrDb = defaultDb(),
) {
  const read = await asClinicalReader(
    scope,
    async (tx) => {
      const s = await loadPointStock(tx, scope.hospitalId, point.id, now);
      const requests = await tx
        .select({
          id: pharmacyStockRequests.id,
          fromPointId: pharmacyStockRequests.fromPointId,
          medicineId: pharmacyStockRequests.medicineId,
          quantity: pharmacyStockRequests.quantity,
          requestedAt: pharmacyStockRequests.requestedAt,
        })
        .from(pharmacyStockRequests)
        .where(
          and(
            eq(pharmacyStockRequests.toPointId, point.id),
            isNull(pharmacyStockRequests.closedAt),
          ),
        )
        .orderBy(asc(pharmacyStockRequests.requestedAt));
      return { ...s, requests };
    },
    database,
  );
  const rows = stockRows(read.input);
  const points = await otherPoints(database, scope.hospitalId, point.id);
  const pointName = new Map(points.map((p) => [p.id, p.name]));
  return {
    rows,
    figures: stockFigures(rows, read.input, read.listImported),
    openingMissing: openingCountMissing(read.activeHere, read.counts, read.counted),
    products: read.products
      .filter((p) => p.active && read.atPoint.get(p.id)?.active)
      .map((p) => ({ id: p.id, medicineId: p.medicineId, name: p.name, issueUnit: p.issueUnit })),
    batches: read.input.batches
      .filter((b) => !(isExpired(b, localDate(now)) && (read.input.balances.get(b.id) ?? 0) === 0))
      .map((b) => ({ ...b, medicineName: medicineName(b.medicineId) })),
    requests: read.requests.map((r) => ({
      ...r,
      fromPoint: pointName.get(r.fromPointId) ?? "",
      medicine: medicineName(r.medicineId),
    })),
    points,
    manages: read.manages,
  };
}

export type StockDetail = NonNullable<Awaited<ReturnType<typeof getStockDetail>>>;

/** One medicine at the point (W10, its own page): products, batches, today's movements. */
export async function getStockDetail(
  scope: StockScope,
  point: Pick<PharmacyPoint, "id">,
  medicineId: string,
  now: Date = new Date(),
  database: EmrDb = defaultDb(),
) {
  const startOfDay = new Date(Date.parse(`${localDate(now)}T00:00:00+03:00`));
  const read = await asClinicalReader(
    scope,
    async (tx) => {
      const s = await loadPointStock(tx, scope.hospitalId, point.id, now, medicineId);
      const ids = s.input.batches.map((b) => b.id);
      const movements = ids.length
        ? await tx
            .select({
              id: pharmacyStockMovements.id,
              batchId: pharmacyStockMovements.batchId,
              kind: pharmacyStockMovements.kind,
              quantity: pharmacyStockMovements.quantity,
              effectiveAt: pharmacyStockMovements.effectiveAt,
              sourceKind: pharmacyStockMovements.sourceKind,
              deliveryFrom: pharmacyStockMovements.deliveryFrom,
              reasonCode: pharmacyStockMovements.reasonCode,
              actorUserId: pharmacyStockMovements.actorUserId,
            })
            .from(pharmacyStockMovements)
            .where(
              and(
                inArray(pharmacyStockMovements.batchId, ids),
                gte(pharmacyStockMovements.effectiveAt, startOfDay),
              ),
            )
            .orderBy(desc(pharmacyStockMovements.effectiveAt))
        : [];
      // Counts with a difference still waiting for its reason (SL-6, step 2).
      const lines = ids.length
        ? await tx
            .select({
              countId: pharmacyCountLines.countId,
              batchId: pharmacyCountLines.batchId,
              counted: pharmacyCountLines.countedQuantity,
              recorded: pharmacyCountLines.recordedBalance,
            })
            .from(pharmacyCountLines)
            .where(
              and(
                inArray(pharmacyCountLines.batchId, ids),
                ne(pharmacyCountLines.countedQuantity, pharmacyCountLines.recordedBalance),
              ),
            )
        : [];
      const corrected = lines.length
        ? await tx
            .select({
              countId: pharmacyStockMovements.sourceId,
              batchId: pharmacyStockMovements.batchId,
            })
            .from(pharmacyStockMovements)
            .where(
              and(
                eq(pharmacyStockMovements.sourceKind, "count"),
                inArray(
                  pharmacyStockMovements.sourceId,
                  lines.map((l) => l.countId),
                ),
              ),
            )
        : [];
      const done = new Set(corrected.map((c) => `${c.countId}:${c.batchId}`));
      return {
        ...s,
        movements,
        open: lines.filter((l) => !done.has(`${l.countId}:${l.batchId}`)),
      };
    },
    database,
  );
  if (!drugById(medicineId) && !read.products.length) return null;
  const [row] = stockRows({ ...read.input, medicineIds: [medicineId] });
  const cadres = await cadreOfUsers(
    database,
    scope.hospitalId,
    read.movements.map((m) => m.actorUserId),
  );
  const today = localDate(now);
  const batchById = new Map(read.input.batches.map((b) => [b.id, b]));
  const productsMoved = new Set(
    read.input.batches.filter((b) => read.input.balances.has(b.id)).map((b) => b.productId),
  );
  return {
    medicineId,
    name: medicineName(medicineId),
    controlled: drugById(medicineId)?.flags.controlled === true,
    row: row!,
    level: read.input.levels.get(medicineId) ?? null,
    manages: read.manages,
    products: read.products.map((p) => ({
      id: p.id,
      name: p.name,
      strength: p.strength,
      packSize: p.packSize,
      issueUnit: p.issueUnit,
      manufacturer: p.manufacturer,
      registrationNumber: p.registrationNumber,
      priceUgx: p.priceUgx,
      addedAtWindow: p.addedAtWindow,
      atPoint: !!read.atPoint.get(p.id)?.active && p.active,
      unitLocked: productsMoved.has(p.id),
      batches: read.input.batches
        .filter((b) => b.productId === p.id)
        .map((b) => ({
          ...b,
          balance: read.input.balances.get(b.id) ?? 0,
          expired: isExpired(b, today),
        }))
        .sort((a, b) => expiresOn(a).localeCompare(expiresOn(b))),
    })),
    movements: read.movements.map((m) => ({
      ...m,
      batchNumber: batchById.get(m.batchId)?.batchNumber ?? "",
      who: cadres.get(m.actorUserId) ?? "",
    })),
    openDifferences: read.open.map((l) => ({
      ...l,
      batchNumber: batchById.get(l.batchId)?.batchNumber ?? "",
    })),
  };
}

/** Every other point of the hospital, for the detail page's transfer. */
export const pointsBesides = (hospitalId: string, pointId: string, database: EmrDb = defaultDb()) =>
  otherPoints(database, hospitalId, pointId);
