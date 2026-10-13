import "server-only";

import type { Payload } from "./signed-config";
import type { LotRefusal, LotState, StockKind, StockLot, StockTx, TxKind } from "./stock";
import type { EmrTx } from "@/lib/emr/db";
import { and, desc, eq, gte, sql } from "drizzle-orm";

import {
  diagnosticReports,
  labSettings,
  labSignedConfigs,
  labStockCounts,
  labStockItems,
  labStockLots,
  labStockTransactions,
  testCatalogue,
} from "@/db/schema";
import { DEFAULT_TIME_ZONE } from "@/supabase/functions/_shared/slots";
import { loadConfigs } from "./catalogue-v2";
import { inForce } from "./signed-config";
import {
  addDays,
  averageMonthlyUse,
  consumed,
  countsDue,
  dayOf,
  daysOutOfStock,
  endOfDay,
  expectedVersusIssued,
  expiryAlerts,
  lotRefusal,
  nextLotToUse,
  onHand,
  stockLevel,
} from "./stock";

/**
 * Stock and lots, read (Lab Phase 3 §5.5, §5.6; ST-3..ST-10). One read of the hospital's items, lots, ledger,
 * plans and settings; every figure is computed here from the ledger at read time with its basis, never stored.
 * Operational settings: the consumption look-back and the count frequency carry D-LAB3-09's accepted
 * values (3 months, weekly) until the lead changes them; the expiry window and the ST-9 tolerance have no
 * default and read "not set" (Law 3, Law 8).
 * ponytail: the whole ledger is read per page; window it by date when a lab's history makes this slow.
 */

const TZ = DEFAULT_TIME_ZONE;

export interface Settings {
  lookBackMonths: number;
  countEveryDays: number;
  expiryWindowDays: number | null;
  tolerancePct: number | null;
}

export interface LotRow {
  id: string;
  lot: string;
  useBy: string | null;
  state: LotState;
  onHand: number;
  refusal: LotRefusal | null;
  useFirst: boolean;
  basis: string | null;
  statement: string | null;
}

export interface ItemRow {
  id: string;
  name: string;
  kind: StockKind;
  unitOfIssue: string;
  packSize: number | null;
  testsPerUnit: number | null;
  testCodes: string[];
  conceptIds: string[];
  hmisTracerCode: string | null;
  storageDeviceId: string | null;
  minMonths: number | null;
  maxMonths: number | null;
  onHand: number;
  /** ST-4: null = "Not enough history". */
  averageUse: number | null;
  monthsOfStock: number | null;
  belowMinimum: boolean;
  toMaximum: number | null;
  /** ST-7: ended days this month with nothing on hand. */
  daysOut: number;
  nearestExpiry: string | null;
  expiring: boolean;
  quarantined: boolean;
  countDue: boolean;
  /** ST-9, this month so far; null without tests per unit or a tolerance. */
  expected: ReturnType<typeof expectedVersusIssued>;
  lots: LotRow[];
  plan: { id: string; version: number; payload: Payload<"acceptance_plan"> } | null;
  planDraft: { id: string; authoredBy: string; payload: Payload<"acceptance_plan"> } | null;
}

const num = (v: string | null) => (v === null ? null : Number(v));

export async function loadStock(tx: EmrTx, hospitalId: string, now: Date) {
  const [items, lots, txRows, [settingsRow], configs, drafts, counts, released] = await Promise.all(
    [
      tx
        .select()
        .from(labStockItems)
        .where(and(eq(labStockItems.hospitalId, hospitalId), eq(labStockItems.active, true)))
        .orderBy(labStockItems.name),
      tx.select().from(labStockLots).where(eq(labStockLots.hospitalId, hospitalId)),
      tx.select().from(labStockTransactions).where(eq(labStockTransactions.hospitalId, hospitalId)),
      tx
        .select({ quality: labSettings.quality })
        .from(labSettings)
        .where(eq(labSettings.hospitalId, hospitalId)),
      loadConfigs(tx, hospitalId),
      tx
        .select()
        .from(labSignedConfigs)
        .where(
          and(
            eq(labSignedConfigs.hospitalId, hospitalId),
            eq(labSignedConfigs.kind, "acceptance_plan"),
            eq(labSignedConfigs.status, "draft"),
          ),
        )
        .orderBy(desc(labSignedConfigs.version)),
      tx
        .select({ at: labStockCounts.countedAt, lines: labStockCounts.lines })
        .from(labStockCounts)
        .where(eq(labStockCounts.hospitalId, hospitalId)),
      releasedThisMonth(tx, hospitalId, now),
    ],
  );
  const q = (settingsRow?.quality ?? {}) as Partial<Record<keyof Settings, number | null>>;
  const settings: Settings = {
    lookBackMonths: q.lookBackMonths ?? 3,
    countEveryDays: q.countEveryDays ?? 7,
    expiryWindowDays: q.expiryWindowDays ?? null,
    tolerancePct: q.tolerancePct ?? null,
  };

  const ledger: StockTx[] = txRows.map((t) => ({
    hospitalId: t.hospitalId,
    itemId: t.itemId,
    lotId: t.lotId,
    kind: t.kind as TxKind,
    quantity: t.quantity,
    reason: t.reason,
    at: t.at,
  }));
  const stockLots: (StockLot & { basis: string | null; statement: string | null })[] = lots.map(
    (l) => ({
      id: l.id,
      hospitalId: l.hospitalId,
      itemId: l.itemId,
      lot: l.lot,
      useBy: l.useBy,
      receivedAt: l.receivedAt,
      state: l.state as LotState,
      basis: l.acceptedBasis,
      statement: l.statement,
    }),
  );
  const lastCounted = new Map<string, Date>();
  for (const c of counts)
    for (const l of c.lines as { itemId: string }[])
      if (!(lastCounted.get(l.itemId)! > c.at)) lastCounted.set(l.itemId, c.at);
  const due = new Set(
    countsDue(
      items.map((i) => ({ id: i.id, hospitalId: i.hospitalId })),
      lastCounted,
      { hospitalId, now, timeZone: TZ, everyDays: settings.countEveryDays },
    ),
  );
  const expiring = new Set(
    settings.expiryWindowDays === null
      ? []
      : expiryAlerts(
          stockLots.filter((l) => l.state !== "quarantined"),
          { hospitalId, at: now, timeZone: TZ, windowDays: settings.expiryWindowDays },
        ).map((a) => a.lotId),
  );
  const after = new Date(now.getTime() + 1);
  const today = dayOf(now, TZ);
  const monthStart = endOfDay(addDays(`${today.slice(0, 7)}-01`, -1), TZ);

  const rows: ItemRow[] = items.map((i) => {
    const mine = stockLots.filter((l) => l.itemId === i.id);
    const use = averageMonthlyUse(ledger, {
      hospitalId,
      itemId: i.id,
      now,
      timeZone: TZ,
      lookBackMonths: settings.lookBackMonths,
    });
    const have = onHand(ledger, { hospitalId, itemId: i.id, at: after });
    const level = stockLevel(
      { minMonths: num(i.minMonths), maxMonths: num(i.maxMonths) },
      have,
      use,
    );
    const first = nextLotToUse(mine, { hospitalId, itemId: i.id, at: now, timeZone: TZ });
    const lotRows: LotRow[] = mine
      .map((l) => ({
        id: l.id,
        lot: l.lot,
        useBy: l.useBy,
        state: l.state,
        onHand: onHand(ledger, { hospitalId, itemId: i.id, lotId: l.id, at: after }),
        refusal: lotRefusal(l, now, TZ),
        useFirst: first?.id === l.id,
        basis: l.basis,
        statement: l.statement,
      }))
      .filter((l) => l.state !== "finished" && l.state !== "rejected")
      .sort((a, b) => (a.useBy ?? "9999").localeCompare(b.useBy ?? "9999"));
    const yesterday = addDays(today, -1);
    const testsPerUnit = num(i.testsPerUnit);
    const plan = inForce(configs, "acceptance_plan", i.id, now);
    const draft = drafts.find((d) => d.key === i.id && !d.leadSignedBy);
    return {
      id: i.id,
      name: i.name,
      kind: i.kind as StockKind,
      unitOfIssue: i.unitOfIssue,
      packSize: i.packSize,
      testsPerUnit,
      testCodes: i.testCodes,
      conceptIds: i.conceptIds,
      hmisTracerCode: i.hmisTracerCode,
      storageDeviceId: i.storageDeviceId,
      minMonths: num(i.minMonths),
      maxMonths: num(i.maxMonths),
      onHand: have,
      averageUse: use,
      ...level,
      daysOut:
        yesterday.slice(0, 7) === today.slice(0, 7)
          ? daysOutOfStock(ledger, {
              hospitalId,
              itemId: i.id,
              fromDay: `${today.slice(0, 7)}-01`,
              toDay: yesterday,
              timeZone: TZ,
            }).length
          : 0,
      nearestExpiry: lotRows.filter((l) => l.onHand > 0 && l.useBy).map((l) => l.useBy!)[0] ?? null,
      expiring: lotRows.some((l) => expiring.has(l.id) && l.onHand > 0),
      quarantined: lotRows.some((l) => l.state === "quarantined"),
      countDue: due.has(i.id),
      expected:
        settings.tolerancePct === null
          ? null
          : expectedVersusIssued(
              { testsPerUnit },
              i.testCodes.reduce((n, c) => n + (released.get(c) ?? 0), 0),
              consumed(ledger, { hospitalId, itemId: i.id, from: monthStart, to: after }),
              settings.tolerancePct,
            ),
      lots: lotRows,
      plan: plan ? { id: plan.id, version: plan.version, payload: plan.payload } : null,
      planDraft: draft
        ? {
            id: draft.id,
            authoredBy: draft.authoredBy,
            payload: draft.payload as Payload<"acceptance_plan">,
          }
        : null,
    };
  });
  const lastCount = counts.reduce<Date | null>((m, c) => (!m || c.at > m ? c.at : m), null);
  return { settings, items: rows, lastCount };
}

/** ST-9: released patient tests this month (hospital-local), by test code, first release only. */
async function releasedThisMonth(tx: EmrTx, hospitalId: string, now: Date) {
  const today = dayOf(now, TZ);
  const from = endOfDay(addDays(`${today.slice(0, 7)}-01`, -1), TZ);
  const rows = await tx
    .select({
      code: testCatalogue.code,
      n: sql<string>`count(distinct ${diagnosticReports.orderId})`,
    })
    .from(diagnosticReports)
    .innerJoin(testCatalogue, eq(testCatalogue.id, diagnosticReports.testId))
    .where(
      and(
        eq(diagnosticReports.hospitalId, hospitalId),
        eq(diagnosticReports.status, "final"),
        eq(diagnosticReports.performer, "in_house"),
        gte(diagnosticReports.recordedAt, from),
      ),
    )
    .groupBy(testCatalogue.code);
  return new Map(rows.map((r) => [r.code, Number(r.n)]));
}
