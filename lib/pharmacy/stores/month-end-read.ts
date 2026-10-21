import "server-only";

import type { Explanation, MonthEndCount, MonthRow } from "./month-end";
import type { Ledger } from "./recall-read";
import type { EmrDb, EmrTx } from "@/lib/emr/db";
import { and, eq, inArray, isNull, lt, sql } from "drizzle-orm";

import { pharmacyCountLines, pharmacyCounts } from "@/db/schema/pharmacy-dispensing";
import {
  pharmacyCostCorrections,
  pharmacyPeriodDifferenceReasons,
  pharmacyPeriods,
  pharmacyPeriodSnapshots,
  pharmacyRecalls,
} from "@/db/schema/pharmacy-stores";
import { asClinicalReader } from "@/lib/emr/db";
import { isExpired } from "@/lib/pharmacy/stock/ledger";
import { daysOutOfStock } from "./consumption";
import { addDays, dayStart, localMonth, nextMonth } from "./ledger";
import { carryForward, reconcile } from "./month-end";
import { signedPack } from "./packs";
import { monthEndReady } from "./readiness-stores";
import { recallMatches } from "./recall";
import { loadLedger } from "./recall-read";

/**
 * Month end, read (Pharmacy Phase 2, 5.8, 6.7: MR-1 to MR-6; the stock status report and the tracer audit).
 * Every figure is `reconcile` over the ledger (month-end.ts); a closed month is read from its snapshot (MR-6).
 * Read as the clinician (`pharmacy.view` at the hospital).
 */

type Db = EmrDb | EmrTx;
export type Scope = { kind: "location"; locationId: string } | { kind: "hospital" };

/**
 * The month a month-end count belongs to: the month whose last day is nearest the count (a count up to 15 days
 * into the next month still closes the month before). The signed count window decides whether it may close.
 */
export const countMonth = (at: Date): string =>
  localMonth(new Date(at.getTime() - 15 * 86_400_000));

const scopeIds = (ledger: Ledger, scope: Scope) =>
  scope.kind === "location" ? [scope.locationId] : [...ledger.locations.keys()];

/** MR-3's month-end counts at the scope's locations for a month: the latest per location. */
export async function monthEndCounts(
  tx: Db,
  hospitalId: string,
  locationIds: readonly string[],
  month: string,
  productOf: ReadonlyMap<string, string>,
) {
  if (!locationIds.length) return [];
  const rows = await tx
    .select({
      countId: pharmacyCounts.id,
      locationId: sql<string>`coalesce(${pharmacyCounts.locationId}, ${pharmacyCounts.dispensingPointId})`,
      at: pharmacyCounts.countedAt,
      batchId: pharmacyCountLines.batchId,
      counted: pharmacyCountLines.countedQuantity,
    })
    .from(pharmacyCounts)
    .innerJoin(pharmacyCountLines, eq(pharmacyCountLines.countId, pharmacyCounts.id))
    .where(
      and(
        eq(pharmacyCounts.hospitalId, hospitalId),
        eq(pharmacyCounts.scope, "month_end"),
        sql`coalesce(${pharmacyCounts.locationId}, ${pharmacyCounts.dispensingPointId}) IN (${sql.join(
          locationIds.map((l) => sql`${l}::uuid`),
          sql`, `,
        )})`,
      ),
    );
  const latest = new Map<string, { countId: string; at: Date }>();
  for (const r of rows) {
    const at = new Date(r.at);
    if (countMonth(at) !== month) continue;
    const prev = latest.get(r.locationId);
    if (!prev || at > prev.at) latest.set(r.locationId, { countId: r.countId, at });
  }
  return [...latest].map(([locationId, c]): MonthEndCount => {
    const counted = new Map<string, number>();
    for (const r of rows.filter((x) => x.countId === c.countId)) {
      const p = productOf.get(r.batchId);
      if (p) counted.set(p, (counted.get(p) ?? 0) + r.counted);
    }
    return { locationId, countId: c.countId, at: c.at, counted };
  });
}

export interface MonthReport {
  month: string;
  scope: Scope;
  rows: MonthRow[];
  closed: { id: string; closedAt: Date; sha256: string } | null;
  counts: MonthEndCount[];
  notCountedReasons: Set<string>;
  ledger: Ledger;
}

/** The scope's closed months (MR-5's `closes`). */
async function periodsOf(tx: Db, hospitalId: string, scope: Scope) {
  return tx
    .select({
      id: pharmacyPeriods.id,
      month: pharmacyPeriods.month,
      closedAt: pharmacyPeriods.closedAt,
    })
    .from(pharmacyPeriods)
    .where(
      and(
        eq(pharmacyPeriods.hospitalId, hospitalId),
        scope.kind === "location"
          ? eq(pharmacyPeriods.locationId, scope.locationId)
          : isNull(pharmacyPeriods.locationId),
      ),
    );
}

/** MR-1 to MR-6 for one scope and month, from the ledger; a closed month from its snapshot. */
export async function buildMonth(
  tx: Db,
  hospitalId: string,
  scope: Scope,
  month: string,
): Promise<MonthReport> {
  const ledger = await loadLedger(tx, hospitalId);
  const ids = scopeIds(ledger, scope);
  const periods = await periodsOf(tx, hospitalId, scope);
  const closes = new Map(periods.map((p) => [String(p.month), new Date(p.closedAt)]));
  const counts = await monthEndCounts(tx, hospitalId, ids, month, ledger.productOf);
  const reasonRows = ids.length
    ? await tx
        .select()
        .from(pharmacyPeriodDifferenceReasons)
        .where(
          and(
            eq(pharmacyPeriodDifferenceReasons.hospitalId, hospitalId),
            eq(pharmacyPeriodDifferenceReasons.month, month),
            inArray(pharmacyPeriodDifferenceReasons.locationId, ids),
          ),
        )
        .orderBy(pharmacyPeriodDifferenceReasons.at)
    : [];
  const notCountedReasons = new Set(
    reasonRows.filter((r) => r.kind === "not_counted").map((r) => r.productId),
  );
  const own = periods.find((p) => String(p.month) === month);
  if (own) {
    const [snap] = await tx
      .select()
      .from(pharmacyPeriodSnapshots)
      .where(eq(pharmacyPeriodSnapshots.periodId, own.id));
    const content = (
      typeof snap?.content === "string" ? JSON.parse(snap.content) : snap?.content
    ) as {
      rows: MonthRow[];
    };
    return {
      month,
      scope,
      rows: content?.rows ?? [],
      closed: { id: own.id, closedAt: new Date(own.closedAt), sha256: snap?.sha256 ?? "" },
      counts,
      notCountedReasons,
      ledger,
    };
  }
  const explanations = new Map<string, Explanation>();
  for (const r of reasonRows.filter((x) => x.kind === "difference")) {
    const prev = explanations.get(r.productId);
    if (prev && "unexplained" in prev) continue;
    explanations.set(
      r.productId,
      r.unexplained ? { unexplained: true } : { reasonCode: r.reasonCode ?? "" },
    );
  }
  // MR-2: opening from the last closed month's snapshot, else the ledger at the month's start.
  const prev = periods
    .filter((p) => String(p.month) < month)
    .sort((a, b) => String(b.month).localeCompare(String(a.month)))[0];
  let opening = new Map<string, number>();
  let carried: { productId: string; month: string; difference: number }[] = [];
  if (prev) {
    const [snap] = await tx
      .select()
      .from(pharmacyPeriodSnapshots)
      .where(eq(pharmacyPeriodSnapshots.periodId, prev.id));
    const content = (
      typeof snap?.content === "string" ? JSON.parse(snap.content) : snap?.content
    ) as { rows: MonthRow[] };
    ({ opening, carried } = carryForward(String(prev.month), content?.rows ?? []));
  } else {
    const start = dayStart(month);
    const inside = new Set(ids);
    for (const m of ledger.movements) {
      if (!inside.has(m.pointId) || m.effectiveAt >= start) continue;
      const p = ledger.productOf.get(m.batchId);
      if (p) opening.set(p, (opening.get(p) ?? 0) + m.quantity);
    }
    opening = new Map([...opening].filter(([, n]) => n !== 0));
  }
  const costRows = await tx
    .select({
      movementId: pharmacyCostCorrections.movementId,
      cost: pharmacyCostCorrections.newCost,
    })
    .from(pharmacyCostCorrections)
    .where(eq(pharmacyCostCorrections.hospitalId, hospitalId))
    .orderBy(pharmacyCostCorrections.correctedAt);
  const corrected = new Map(costRows.map((c) => [c.movementId, Number(c.cost)]));
  const costs = new Map<string, number>();
  for (const m of ledger.movements)
    if (
      m.kind === "received" &&
      (m.unitCost != null || corrected.has(m.id)) &&
      !costs.has(m.batchId)
    )
      costs.set(m.batchId, corrected.get(m.id) ?? (m.unitCost as number));
  // A batch keeps its cost at every location it moves to (SL-17): copy by batch number and product.
  const costByKey = new Map<string, number>();
  for (const b of ledger.batches) {
    const c = costs.get(b.id);
    if (c !== undefined) costByKey.set(`${b.productId}|${b.batchNumber}`, c);
  }
  for (const b of ledger.batches) {
    const c = costByKey.get(`${b.productId}|${b.batchNumber}`);
    if (c !== undefined && !costs.has(b.id)) costs.set(b.id, c);
  }
  const rows = reconcile({
    scope: scope.kind === "location" ? scope : { kind: "hospital", locationIds: ids },
    month,
    movements: ledger.movements,
    productOf: ledger.productOf,
    closes,
    opening,
    carried,
    counts,
    explanations,
    costs,
  });
  return { month, scope, rows, closed: null, counts, notCountedReasons, ledger };
}

export async function getMonthReport(
  who: { userId: string; hospitalId: string },
  scope: Scope,
  month: string,
  database?: EmrDb,
) {
  return asClinicalReader(who, (tx) => buildMonth(tx, who.hospitalId, scope, month), database);
}

/* ─── HMIS 105 Section 6 and the tracer audit ────────────────────────── */

export interface StockStatus {
  missing: ("tracer_list" | "stockout_day_rule")[];
  rows: { medicineId: string; onHand: number; daysOut: number | null }[];
  source: string | null;
}

/** Recall start per blocked batch (CN-3 `blockedFrom`). */
async function blockedFrom(tx: Db, hospitalId: string, ledger: Ledger) {
  const recalls = await tx
    .select({
      productId: pharmacyRecalls.productId,
      batchNumber: pharmacyRecalls.batchNumber,
      startedAt: pharmacyRecalls.startedAt,
      closedAt: pharmacyRecalls.closedAt,
    })
    .from(pharmacyRecalls)
    .where(eq(pharmacyRecalls.hospitalId, hospitalId));
  const out = new Map<string, Date>();
  for (const b of ledger.batches)
    for (const r of recalls)
      if (
        r.closedAt === null &&
        recallMatches(r, {
          productId: b.productId,
          batchNumber: b.batchNumber,
          firstBatchNumber: b.firstBatchNumber,
          earlierNumbers: [],
        })
      )
        out.set(b.id, new Date(r.startedAt));
  return out;
}

/**
 * HMIS 105 Section 6 for the signed tracer list: stock on hand at the month's end over the signed report-location
 * set (store and dispensing points while unsigned, MR-6), and days out of stock by the signed day rule (CN-3).
 */
export async function buildStockStatus(
  tx: Db,
  hospitalId: string,
  month: string,
): Promise<StockStatus> {
  const [tracer, rule, rules] = await Promise.all([
    signedPack(tx, hospitalId, "tracer_list"),
    signedPack(tx, hospitalId, "stockout_day_rule"),
    signedPack(tx, hospitalId, "month_end_rules"),
  ]);
  const missing: StockStatus["missing"] = [];
  if (!tracer) missing.push("tracer_list");
  if (!rule) missing.push("stockout_day_rule");
  if (!tracer) return { missing, rows: [], source: null };
  const ledger = await loadLedger(tx, hospitalId);
  const kinds = new Set<string>(
    rules?.content.reportLocationKinds ?? ["store", "dispensing_point"],
  );
  const end = dayStart(nextMonth(month));
  const lastDay = addDays(nextMonth(month), -1);
  const blocked = await blockedFrom(tx, hospitalId, ledger);
  const locations = new Map(
    [...ledger.locations].map(([id, l]) => [id, { kind: l.kind, model: l.model }]),
  );
  const rows = tracer.content.medicineIds.map((medicineId) => {
    const own = ledger.batches.filter(
      (b) => b.medicineId === medicineId && kinds.has(ledger.locations.get(b.pointId)?.kind ?? ""),
    );
    const onHand = own
      .filter((b) => !isExpired(b, lastDay) && !(blocked.get(b.id) && blocked.get(b.id)! < end))
      .reduce(
        (s, b) =>
          s +
          ledger.movements
            .filter((m) => m.batchId === b.id && m.effectiveAt < end)
            .reduce((t, m) => t + m.quantity, 0),
        0,
      );
    const d = rule
      ? daysOutOfStock({
          movements: ledger.movements,
          batches: ledger.batches,
          locations,
          medicineId,
          fromDate: month,
          toDate: lastDay,
          dayRule: rule.content.rule,
          blockedFrom: blocked,
        })
      : null;
    return { medicineId, onHand, daysOut: d && "days" in d ? d.days : null };
  });
  return { missing, rows, source: tracer.content.source };
}

export async function getStockStatus(
  who: { userId: string; hospitalId: string },
  month: string,
  database?: EmrDb,
) {
  return asClinicalReader(who, (tx) => buildStockStatus(tx, who.hospitalId, month), database);
}

export interface TracerAuditRow {
  medicineId: string;
  received: number;
  issued: number;
  supplied: number;
  adjusted: number;
  writtenOff: number;
  counted: number | null;
  difference: number | null;
}

/** EMHS Table 3: per tracer medicine for the quarter, from the hospital's three monthly reconciliations. */
export async function getTracerAudit(
  who: { userId: string; hospitalId: string },
  quarterStart: string,
  database?: EmrDb,
): Promise<{ missing: boolean; rows: TracerAuditRow[]; open: boolean }> {
  return asClinicalReader(
    who,
    async (tx) => {
      const tracer = await signedPack(tx, who.hospitalId, "tracer_list");
      if (!tracer) return { missing: true, rows: [], open: true };
      const months = [quarterStart, nextMonth(quarterStart), nextMonth(nextMonth(quarterStart))];
      const reports: MonthReport[] = [];
      for (const m of months)
        reports.push(await buildMonth(tx, who.hospitalId, { kind: "hospital" }, m));
      const medOf = (productId: string) => reports[0]!.ledger.products.get(productId)?.medicineId;
      const rows = tracer.content.medicineIds.map((medicineId) => {
        const r: TracerAuditRow = {
          medicineId,
          received: 0,
          issued: 0,
          supplied: 0,
          adjusted: 0,
          writtenOff: 0,
          counted: null,
          difference: null,
        };
        reports.forEach((rep, i) => {
          for (const row of rep.rows.filter((x) => medOf(x.productId) === medicineId)) {
            r.received += row.columns.received;
            r.issued += row.columns.issuedOut + row.columns.issuedIn;
            r.supplied += row.columns.supplied;
            r.adjusted += row.columns.adjusted;
            r.writtenOff += row.columns.writtenOff;
            if (i === 2 && row.counted !== null) {
              r.counted = (r.counted ?? 0) + row.counted;
              r.difference = (r.difference ?? 0) + (row.difference ?? 0);
            }
          }
        });
        return r;
      });
      return { missing: false, rows, open: reports.some((x) => x.closed === null) };
    },
    database,
  );
}

/* ─── S47: month end's go-live condition ─────────────────────────────── */

/**
 * GL2-1, 5.12: one full month in which every live location was counted at its start and at its end. A count at the
 * start is any count there attributed to the month before (or an opening count in the month); at the end, a
 * month-end count attributed to the month.
 */
export async function monthEndReadiness(tx: Db, hospitalId: string, now: Date) {
  const ledger = await loadLedger(tx, hospitalId);
  const live = [...ledger.locations.values()].filter(
    (l) => l.live && !(l.kind === "ward" && l.model === "issue_only"),
  );
  const counts = await tx
    .select({
      locationId: sql<string>`coalesce(${pharmacyCounts.locationId}, ${pharmacyCounts.dispensingPointId})`,
      scope: pharmacyCounts.scope,
      at: pharmacyCounts.countedAt,
    })
    .from(pharmacyCounts)
    .where(and(eq(pharmacyCounts.hospitalId, hospitalId), lt(pharmacyCounts.countedAt, now)));
  const thisMonth = localMonth(now);
  const months = [...new Set(counts.map((c) => countMonth(new Date(c.at))))]
    .filter((m) => m < thisMonth)
    .sort();
  const prevOf = (m: string) => {
    const d = new Date(`${m}T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() - 1);
    return d.toISOString().slice(0, 10);
  };
  return monthEndReady(
    months.map((month) => ({
      month,
      locations: live.map((l) => {
        const here = counts.filter((c) => c.locationId === l.id);
        return {
          id: l.id,
          countedAtStart: here.some(
            (c) =>
              countMonth(new Date(c.at)) === prevOf(month) ||
              (c.scope === "opening" && localMonth(new Date(c.at)) === month),
          ),
          countedAtEnd: here.some(
            (c) => c.scope === "month_end" && countMonth(new Date(c.at)) === month,
          ),
        };
      }),
    })),
  );
}
