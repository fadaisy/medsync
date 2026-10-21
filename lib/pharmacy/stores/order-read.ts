import "server-only";

import type { AmcStep } from "./consumption";
import type { OrderRow, ParameterName, Ven } from "./order";
import type { Ledger } from "./recall-read";
import type { DeliveryLine } from "./receiving";
import type { EmrDb, EmrTx } from "@/lib/emr/db";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";

import {
  pharmacyCountLines,
  pharmacyCounts,
  pharmacyMedicineLinks,
  pharmacyNationalListRows,
} from "@/db/schema/pharmacy-dispensing";
import {
  pharmacyCounterparties,
  pharmacyDeliveries,
  pharmacyDeliveryLines,
  pharmacyOrderLines,
  pharmacyOrders,
  pharmacyPeriods,
  pharmacyPeriodSnapshots,
  pharmacyRecalls,
} from "@/db/schema/pharmacy-stores";
import { pharmacyOrderComparisons } from "@/db/schema/pharmacy-stores-0184";
import { asClinicalReader } from "@/lib/emr/db";
import { daysBetween, localDate } from "@/lib/pharmacy/stock/ledger";
import { adjustedAmc, consumption, daysOutOfStock } from "./consumption";
import { addDays, dayStart, localMonth } from "./ledger";
import { proposeRow, stockOnHand } from "./order";
import { signedPack } from "./packs";
import { orderingReady } from "./readiness-stores";
import { recallMatches } from "./recall";
import { loadLedger } from "./recall-read";
import { orderStatus, stillOwed } from "./receiving";

/**
 * The order, read (Pharmacy Phase 2, 5.9, 5.10; OQ-1 to OQ-7; D-PH2-09, D-PH2-10). The proposal is worked out from
 * the ledger by the engines (consumption.ts, order.ts) with the signed parameters; while one is unsigned nothing
 * is computed and the missing parameters are named (Law 6). Nothing here, or anywhere in the order module, sends
 * anything (Law 10): no fetch, no supplier link.
 */

type Db = EmrDb | EmrTx;

export type ProposalMissing =
  | ParameterName
  | "order_parameters"
  | "stockout_day_rule"
  | "review_window"
  | "minimum_history";

export interface ProposalLine {
  medicineId: string;
  productId: string;
  productName: string;
  issueUnit: string;
  ven: Ven | null;
  consumption: number;
  steps: AmcStep[];
  amc: number | null;
  row: OrderRow;
  /** D-PH2-10: products of the medicine in another issue unit, not added. */
  notAdded: { productId: string; name: string; issueUnit: string }[];
  /** The latest cost recorded at receipt (D-PH2-14); never the patient price. */
  unitPrice: number | null;
}

export interface Proposal {
  missing: ProposalMissing[];
  lines: ProposalLine[];
  cutAt: Date;
  window: { from: string; to: string; days: number; months: number } | null;
  parameters: { id: string; version: number; unclassedTrimAs: Ven } | null;
}

/** Products, by medicine: the chosen one (first by name) and those with its issue unit (D-PH2-10). */
function byMedicine(ledger: Ledger, medicineIds: readonly string[] | null) {
  const groups = new Map<string, Ledger["products"] extends Map<string, infer P> ? P[] : never>();
  for (const p of ledger.products.values()) {
    if (medicineIds && !medicineIds.includes(p.medicineId)) continue;
    groups.set(p.medicineId, [...(groups.get(p.medicineId) ?? []), p]);
  }
  return [...groups].map(([medicineId, products]) => {
    const sorted = [...products].sort(
      (a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
    );
    // The chosen product is the one last received (what the hospital stocks now), else the first by name.
    const lastIn = (productId: string) =>
      ledger.movements
        .filter((m) => m.kind === "received" && ledger.productOf.get(m.batchId) === productId)
        .reduce((t, m) => Math.max(t, m.effectiveAt.getTime()), 0);
    const chosen = [...sorted].sort((a, b) => lastIn(b.id) - lastIn(a.id))[0]!;
    return {
      medicineId,
      chosen,
      same: sorted.filter((p) => p.issueUnit === chosen.issueUnit),
      other: sorted.filter((p) => p.issueUnit !== chosen.issueUnit),
    };
  });
}

/**
 * OQ-1 to OQ-6 for one cycle (or, with `medicineIds`, an emergency order), cut at `now`. The review window is the
 * signed number of whole months before the cut's month.
 */
export async function buildProposal(
  tx: Db,
  hospitalId: string,
  now: Date,
  medicineIds: readonly string[] | null = null,
): Promise<Proposal> {
  const [params, rules, dayRule] = await Promise.all([
    signedPack(tx, hospitalId, "order_parameters"),
    signedPack(tx, hospitalId, "month_end_rules"),
    signedPack(tx, hospitalId, "stockout_day_rule"),
  ]);
  const missing: ProposalMissing[] = [];
  if (!params) missing.push("order_parameters");
  if (!dayRule) missing.push("stockout_day_rule");
  if (!params || !dayRule)
    return { missing, lines: [], cutAt: now, window: null, parameters: null };
  const p = params.content;
  const to = localMonth(now);
  let from = to;
  for (let i = 0; i < p.reviewWindowMonths; i++) {
    const d = new Date(`${from}T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() - 1);
    from = d.toISOString().slice(0, 10);
  }
  const windowDays = daysBetween(from, to);
  const lastDay = addDays(to, -1);
  const period = { from: dayStart(from), to: dayStart(to) };
  const ledger = await loadLedger(tx, hospitalId);
  const locations = new Map(
    [...ledger.locations].map(([id, l]) => [id, { kind: l.kind, model: l.model }]),
  );

  const [links, counts, recalls, snaps] = await Promise.all([
    tx
      .select({
        medicineId: pharmacyMedicineLinks.medicineId,
        ven: pharmacyNationalListRows.venClass,
      })
      .from(pharmacyMedicineLinks)
      .innerJoin(
        pharmacyNationalListRows,
        eq(pharmacyNationalListRows.id, pharmacyMedicineLinks.rowId),
      )
      .orderBy(desc(pharmacyMedicineLinks.linkedAt)),
    tx
      .select({ batchId: pharmacyCountLines.batchId, at: pharmacyCounts.countedAt })
      .from(pharmacyCountLines)
      .innerJoin(pharmacyCounts, eq(pharmacyCounts.id, pharmacyCountLines.countId))
      .where(eq(pharmacyCounts.hospitalId, hospitalId)),
    tx
      .select({
        productId: pharmacyRecalls.productId,
        batchNumber: pharmacyRecalls.batchNumber,
        startedAt: pharmacyRecalls.startedAt,
      })
      .from(pharmacyRecalls)
      .where(and(eq(pharmacyRecalls.hospitalId, hospitalId), isNull(pharmacyRecalls.closedAt))),
    tx
      .select({ month: pharmacyPeriods.month, content: pharmacyPeriodSnapshots.content })
      .from(pharmacyPeriods)
      .innerJoin(pharmacyPeriodSnapshots, eq(pharmacyPeriodSnapshots.periodId, pharmacyPeriods.id))
      .where(and(eq(pharmacyPeriods.hospitalId, hospitalId), isNull(pharmacyPeriods.locationId))),
  ]);
  const ven = new Map<string, Ven>();
  for (const l of links)
    if (l.ven && !ven.has(l.medicineId) && ["V", "E", "N"].includes(l.ven))
      ven.set(l.medicineId, l.ven as Ven);
  const blockedFrom = new Map<string, Date>();
  for (const b of ledger.batches)
    for (const r of recalls)
      if (recallMatches(r, { ...b, earlierNumbers: [] }))
        blockedFrom.set(b.id, new Date(r.startedAt));
  const balancesAtCut = new Map<string, number>();
  for (const m of ledger.movements)
    if (m.effectiveAt <= now)
      balancesAtCut.set(m.batchId, (balancesAtCut.get(m.batchId) ?? 0) + m.quantity);
  const countedBatches = new Set(
    counts
      .filter((c) => new Date(c.at) >= period.from && new Date(c.at) < period.to)
      .map((c) => c.batchId),
  );
  const unexplained = new Map<string, number>();
  for (const s of snaps) {
    const month = String(s.month);
    if (month < from || month >= to) continue;
    const rows =
      (
        (typeof s.content === "string" ? JSON.parse(s.content) : s.content) as {
          rows?: { productId: string; explanation: string | null; difference: number | null }[];
        }
      ).rows ?? [];
    for (const r of rows)
      if (r.explanation === "unexplained" && r.difference)
        unexplained.set(
          r.productId,
          Math.max(unexplained.get(r.productId) ?? 0, Math.abs(r.difference)),
        );
  }

  const lines: ProposalLine[] = [];
  for (const g of byMedicine(ledger, medicineIds)) {
    const ids = new Set(g.same.map((x) => x.id));
    const batchIds = new Set(ledger.batches.filter((b) => ids.has(b.productId)).map((b) => b.id));
    const moves = ledger.movements.filter((m) => batchIds.has(m.batchId));
    const c = consumption(moves, locations, period);
    const d = daysOutOfStock({
      movements: moves,
      batches: ledger.batches.filter((b) => batchIds.has(b.id)),
      locations,
      medicineId: g.medicineId,
      fromDate: from,
      toDate: lastDay,
      dayRule: dayRule.content.rule,
      blockedFrom,
    });
    const daysOut = "days" in d ? d.days : 0;
    const first = moves.reduce<Date | null>(
      (a, m) => (!a || m.effectiveAt < a ? m.effectiveAt : a),
      null,
    );
    const historyDays = first ? daysBetween(localDate(first), localDate(now)) : 0;
    const amc = adjustedAmc({
      consumption: c.consumption,
      windowDays,
      windowMonths: p.reviewWindowMonths,
      daysOut,
      historyDays,
      minHistoryDays: p.minHistoryDays,
    });
    if ("missing" in amc) {
      missing.push(...amc.missing);
      continue;
    }
    const onHand = stockOnHand({
      batches: ledger.batches,
      balances: balancesAtCut,
      locations,
      blocked: new Set([...blockedFrom].filter(([, at]) => at <= now).map(([id]) => id)),
      localDate: localDate(now),
      productIds: ids,
    });
    const row = proposeRow(
      {
        productId: g.chosen.id,
        medicineId: g.medicineId,
        amc: amc.amc,
        stockOnHand: onHand,
        packSize: g.chosen.packSize,
        windowDays,
        daysOut,
        countedInWindow: [...batchIds].some((b) => countedBatches.has(b)),
        shortHistory: amc.flags.includes("short_history"),
        unexplainedDifference: Math.max(0, ...g.same.map((x) => unexplained.get(x.id) ?? 0)),
      },
      {
        maxMonths: p.maxMonths,
        emergencyOrderPointMonths: p.emergencyOrderPointMonths,
        outOfStockShareLimit: rules?.content.outOfStockShare ?? null,
        largeDifferenceUnits: rules?.content.largeDifferenceUnits ?? null,
        version: String(params.version),
      },
    );
    if ("missing" in row) {
      missing.push(...row.missing);
      continue;
    }
    const costs = ledger.movements
      .filter(
        (m) =>
          m.kind === "received" &&
          m.unitCost != null &&
          ledger.productOf.get(m.batchId) === g.chosen.id,
      )
      .sort((a, b) => +b.effectiveAt - +a.effectiveAt);
    lines.push({
      medicineId: g.medicineId,
      productId: g.chosen.id,
      productName: g.chosen.name,
      issueUnit: g.chosen.issueUnit,
      ven: ven.get(g.medicineId) ?? null,
      consumption: c.consumption,
      steps: amc.steps,
      amc: amc.amc,
      row,
      notAdded: g.other.map((x) => ({ productId: x.id, name: x.name, issueUnit: x.issueUnit })),
      unitPrice: costs[0]?.unitCost ?? null,
    });
  }
  return {
    missing: [...new Set(missing)],
    lines: lines.sort((a, b) => a.productName.localeCompare(b.productName)),
    cutAt: now,
    window: { from, to, days: windowDays, months: p.reviewWindowMonths },
    parameters: { id: params.id, version: params.version, unclassedTrimAs: p.unclassedTrimAs },
  };
}

export async function getProposal(
  who: { userId: string; hospitalId: string },
  now: Date,
  medicineIds: readonly string[] | null = null,
  database?: EmrDb,
) {
  return asClinicalReader(
    who,
    (tx) => buildProposal(tx, who.hospitalId, now, medicineIds),
    database,
  );
}

/* ─── Saved orders and what is still owed (5.10) ─────────────────────── */

export interface SavedOrder {
  id: string;
  kind: "cycle" | "emergency";
  state: "draft" | "open" | "closed";
  supplier: string | null;
  cutAt: Date;
  savedAt: Date | null;
  budget: number | null;
  status: "draft" | "open" | "part_received" | "received" | "closed";
  lines: {
    id: string;
    productId: string;
    medicineId: string;
    proposedUnits: number | null;
    proposedPacks: number | null;
    chosenUnits: number | null;
    reason: string | null;
    cut: unknown;
    inputs: unknown;
    ordered: number;
    received: number;
    owed: number;
    state: "open" | "part_received" | "received" | "closed";
    closeReason: string | null;
  }[];
}

export async function loadOrders(
  tx: Db,
  hospitalId: string,
  orderId?: string,
): Promise<SavedOrder[]> {
  const orders = await tx
    .select({
      id: pharmacyOrders.id,
      kind: pharmacyOrders.kind,
      state: pharmacyOrders.state,
      supplier: pharmacyCounterparties.name,
      cutAt: pharmacyOrders.cutAt,
      savedAt: pharmacyOrders.savedAt,
      budget: pharmacyOrders.budget,
    })
    .from(pharmacyOrders)
    .leftJoin(pharmacyCounterparties, eq(pharmacyCounterparties.id, pharmacyOrders.counterpartyId))
    .where(
      and(
        eq(pharmacyOrders.hospitalId, hospitalId),
        orderId ? eq(pharmacyOrders.id, orderId) : sql`true`,
      ),
    )
    .orderBy(desc(pharmacyOrders.cutAt));
  if (!orders.length) return [];
  const ids = orders.map((o) => o.id);
  const [lines, deliveries] = await Promise.all([
    tx.select().from(pharmacyOrderLines).where(inArray(pharmacyOrderLines.orderId, ids)),
    tx
      .select({
        state: pharmacyDeliveries.state,
        orderLineId: pharmacyDeliveryLines.orderLineId,
        acceptedQuantity: pharmacyDeliveryLines.acceptedQuantity,
      })
      .from(pharmacyDeliveries)
      .innerJoin(pharmacyDeliveryLines, eq(pharmacyDeliveryLines.deliveryId, pharmacyDeliveries.id))
      .where(
        and(
          eq(pharmacyDeliveries.hospitalId, hospitalId),
          inArray(pharmacyDeliveries.orderId, ids),
        ),
      ),
  ]);
  const owed = stillOwed(
    lines.map((l) => ({ id: l.id, units: l.chosenUnits ?? 0, closedReason: l.closeReason })),
    // RG-6: each delivery line as received; the projection sums accepted quantities per order line.
    deliveries.map((d) => ({
      state: d.state,
      lines: [
        {
          orderLineId: d.orderLineId,
          acceptedQuantity: d.acceptedQuantity,
        } as unknown as DeliveryLine,
      ],
    })),
  );
  return orders.map((o) => {
    const own = lines
      .filter((l) => l.orderId === o.id)
      .map((l) => {
        const s = owed.find((x) => x.orderLineId === l.id)!;
        return {
          id: l.id,
          productId: l.productId,
          medicineId: l.medicineId,
          proposedUnits: l.proposedUnits,
          proposedPacks: l.proposedPacks,
          chosenUnits: l.chosenUnits,
          reason: l.reason,
          cut: l.cut,
          inputs: l.inputs,
          ordered: s.ordered,
          received: s.received,
          owed: s.owed,
          state: s.state,
          closeReason: l.closeReason,
        };
      });
    return {
      ...o,
      budget: o.budget === null ? null : Number(o.budget),
      status:
        o.state === "draft"
          ? "draft"
          : o.state === "closed"
            ? "closed"
            : own.length
              ? orderStatus(own.map((l) => l.state))
              : "open",
      lines: own,
    };
  });
}

export async function getOrders(who: { userId: string; hospitalId: string }, database?: EmrDb) {
  return asClinicalReader(who, (tx) => loadOrders(tx, who.hospitalId), database);
}

/** S47: ordering's go-live condition from the latest paper comparison. */
export async function orderingReadiness(tx: Db, hospitalId: string) {
  const [c] = await tx
    .select()
    .from(pharmacyOrderComparisons)
    .where(eq(pharmacyOrderComparisons.hospitalId, hospitalId))
    .orderBy(desc(pharmacyOrderComparisons.recordedAt))
    .limit(1);
  if (!c) return orderingReady(null);
  const lines =
    (c.lines as { proposedUnits: number; paperUnits: number; explanation: string | null }[]) ?? [];
  return orderingReady({
    recordedAt: new Date(c.recordedAt),
    differences: lines
      .filter((l) => l.paperUnits !== l.proposedUnits)
      .map((l) => ({ explanation: l.explanation })),
  });
}
