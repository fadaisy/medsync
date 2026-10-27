import "server-only";

import type { PharmacyV2 } from "./v2";
import type { EmrDb } from "@/lib/emr/db";
import type { Stage } from "@/lib/pharmacy/lines";
import type { QueueIn, TodayRows } from "@/lib/pharmacy/workspace-v2/today";
import { and, desc, eq, gte, inArray, isNull, or, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  pharmacyControlledDifferences,
  pharmacyHandovers,
  pharmacyLineEvents,
  pharmacyLookBacks,
  pharmacyMedicineLinks,
  pharmacyNationalListEditions,
  pharmacyNationalListRows,
  pharmacyStockouts,
  pharmacySupplies,
} from "@/db/schema/pharmacy-dispensing";
import { asClinicalReader } from "@/lib/emr/db";
import { leastAdvanced, queryState } from "@/lib/pharmacy/lines";
import { refillBoard } from "@/lib/pharmacy/refill-read";
import { loadHospitalContext, loadScopeGroups, pointIsLive } from "@/lib/pharmacy/review/load";
import { getExpiryPage, listRecalls } from "@/lib/pharmacy/stores/recall-read";
import { getDeliveriesPage, getIssuesPage } from "@/lib/pharmacy/stores/store-read";
import { getCartsPage, listPlaces } from "@/lib/pharmacy/stores/ward-read";
import { DEFAULT_TIME_ZONE, startOfLocalDay } from "@/supabase/functions/_shared/slots";
import { hasTab } from "./v2";

const DAY_MS = 86_400_000;
const appDb = () => db as unknown as EmrDb;

/**
 * Today's reads (GATE A §6, step-0/data-sources.md § Today): the review queue's groups (as the rail counts them),
 * then the hand-overs, line events, stock-outs, look-backs and controlled differences of the last eight local days
 * as plain rows for `todayFigures`. Read only, as the clinician (RLS applies).
 */
export async function loadTodayRows(v2: PharmacyV2, now: Date): Promise<TodayRows> {
  const { hospitalId } = v2.scope;
  const today = startOfLocalDay(now, DEFAULT_TIME_ZONE);
  const since = startOfLocalDay(new Date(now.getTime() - 7 * DAY_MS), DEFAULT_TIME_ZONE);
  // ponytail: the rail (dispensingNavCounts) loads the same scope groups again; share one cached load if it shows.
  const ctx = await loadHospitalContext(appDb(), hospitalId);
  const [groups, read, refills] = await Promise.all([
    loadScopeGroups(appDb(), ctx),
    asClinicalReader(v2.scope, async (tx) => {
      const [handovers, notOnShelf, stockouts, lookBacks, differences, [edition]] = await Promise.all([
        tx
          .select({ pointId: pharmacyHandovers.dispensingPointId, at: pharmacyHandovers.suppliedAt })
          .from(pharmacyHandovers)
          .where(and(eq(pharmacyHandovers.hospitalId, hospitalId), gte(pharmacyHandovers.suppliedAt, since))),
        tx
          .select({
            pointId: pharmacyLineEvents.dispensingPointId,
            at: pharmacyLineEvents.occurredAt,
            kind: pharmacyLineEvents.kind,
          })
          .from(pharmacyLineEvents)
          .where(
            and(
              eq(pharmacyLineEvents.hospitalId, hospitalId),
              inArray(pharmacyLineEvents.kind, ["owed", "buying_outside"]),
              gte(pharmacyLineEvents.occurredAt, since),
            ),
          ),
        tx
          .select({
            pointId: pharmacyStockouts.dispensingPointId,
            medicineId: pharmacyStockouts.medicineId,
            startedAt: pharmacyStockouts.startedAt,
            endedAt: pharmacyStockouts.endedAt,
          })
          .from(pharmacyStockouts)
          .where(
            and(
              eq(pharmacyStockouts.hospitalId, hospitalId),
              or(isNull(pharmacyStockouts.endedAt), gte(pharmacyStockouts.endedAt, since)),
            ),
          ),
        tx
          .select({
            pointId: pharmacySupplies.dispensingPointId,
            at: pharmacyLookBacks.at,
            open: sql<boolean>`NOT EXISTS (SELECT 1 FROM public.pharmacy_look_backs l
                       WHERE l.supply_id = ${pharmacyLookBacks.supplyId} AND l.kind = 'looked')`,
          })
          .from(pharmacyLookBacks)
          .innerJoin(pharmacySupplies, eq(pharmacySupplies.id, pharmacyLookBacks.supplyId))
          .where(and(eq(pharmacyLookBacks.hospitalId, hospitalId), eq(pharmacyLookBacks.kind, "flagged"))),
        tx
          .select({
            pointId: pharmacyControlledDifferences.dispensingPointId,
            recordedAt: pharmacyControlledDifferences.recordedAt,
            closedAt: pharmacyControlledDifferences.closedAt,
          })
          .from(pharmacyControlledDifferences)
          .where(
            and(
              eq(pharmacyControlledDifferences.hospitalId, hospitalId),
              or(
                isNull(pharmacyControlledDifferences.closedAt),
                gte(pharmacyControlledDifferences.recordedAt, since),
              ),
            ),
          ),
        tx.select({ id: pharmacyNationalListEditions.id }).from(pharmacyNationalListEditions).limit(1),
      ]);
      const medicineIds = [...new Set(stockouts.map((s) => s.medicineId))];
      // As the stock page reads VEN: the newest link per medicine wins.
      const links =
        edition && medicineIds.length
          ? await tx
              .select({ medicineId: pharmacyMedicineLinks.medicineId, ven: pharmacyNationalListRows.venClass })
              .from(pharmacyMedicineLinks)
              .innerJoin(pharmacyNationalListRows, eq(pharmacyNationalListRows.id, pharmacyMedicineLinks.rowId))
              .where(inArray(pharmacyMedicineLinks.medicineId, medicineIds))
              .orderBy(desc(pharmacyMedicineLinks.linkedAt))
          : [];
      const ven = new Map<string, string>();
      for (const l of links) if (l.ven && !ven.has(l.medicineId)) ven.set(l.medicineId, l.ven);
      return {
        handovers,
        notOnShelf,
        stockouts,
        lookBacks: lookBacks.filter((l) => l.open || l.at >= since),
        differences,
        vital: edition ? new Set([...ven].filter(([, v]) => v === "V").map(([m]) => m)) : null,
      };
    }),
    v2.flags.refills && hasTab(v2, "window", "refills") ? refillBoard(appDb(), hospitalId, now) : null,
  ]);

  const iso = (d: Date | null) => (d ? d.toISOString() : null);
  const queue: QueueIn[] = groups.flatMap((g) => {
    const staged = g.lines.filter((l) => l.status?.kind === "stage");
    if (!staged.length) return [];
    return [
      {
        key: g.key,
        origin: g.origin,
        stage: leastAdvanced(staged.map((l) => (l.status as { stage: Stage }).stage))!,
        lane: g.lane.lane,
        reasons: g.lane.reasons,
        writtenAt: g.writtenAt.toISOString(),
        queriedSince: iso(g.queries.find((q) => queryState(q.lite) === "open")?.createdAt ?? null),
        earlier: g.writtenAt.getTime() < today.getTime(),
      },
    ];
  });
  return {
    queue,
    arrivals: groups
      .filter((g) => g.writtenAt.getTime() >= today.getTime())
      .map((g) => ({ origin: g.origin, at: g.writtenAt.toISOString() })),
    handovers: read.handovers.map((h) => ({ pointId: h.pointId, at: h.at.toISOString() })),
    notOnShelf: read.notOnShelf.map((e) => ({ ...e, at: e.at.toISOString() })),
    stockouts: read.stockouts.map((s) => ({ ...s, startedAt: s.startedAt.toISOString(), endedAt: iso(s.endedAt) })),
    vital: read.vital,
    lookBacks: read.lookBacks.map((l) => ({ pointId: l.pointId, at: l.at.toISOString(), open: l.open })),
    differences: read.differences.map((d) => ({
      pointId: d.pointId,
      recordedAt: d.recordedAt.toISOString(),
      closedAt: iso(d.closedAt),
    })),
    refills: refills ? refills.filter((r) => r.tab === "to_prepare").map((r) => ({ pointId: r.pointId })) : null,
  };
}

/** A flow step's loader failing reads as "No data", never as 0 (Law 6). */
const safe = <T>(p: Promise<T>) => p.catch(() => null);

/**
 * "Where the hospital's medicines are" (§6 Medicines flow): each step from its own page's loader, only where that
 * step's store flag is on and its tab exists for this viewer; otherwise null ("No data").
 */
export async function loadFlow(v2: PharmacyV2, now: Date) {
  const who = { userId: v2.scope.userId, hospitalId: v2.scope.hospitalId };
  const s = v2.flags.stores;
  const on = (flag: boolean | undefined, key: string) => !!flag && hasTab(v2, "store", key);
  const [deliveries, issues, wards, carts, expiry, recalls] = await Promise.all([
    on(s?.store, "deliveries") ? safe(getDeliveriesPage(who)) : null,
    on(s?.store, "issues") ? safe(getIssuesPage(who)) : null,
    on(s?.wardStock, "wards") ? safe(listPlaces(appDb(), who.hospitalId, "ward")) : null,
    on(s?.carts, "carts") ? safe(getCartsPage(appDb(), who.hospitalId, now)) : null,
    on(s?.recall, "expiry") ? safe(getExpiryPage(who, now)) : null,
    on(s?.recall, "expiry") ? safe(listRecalls(who)) : null,
  ]);
  return {
    suppliers: deliveries && {
      counting: deliveries.deliveries.filter((d) => d.state === "counting").length,
      names: deliveries.suppliers.map((x) => x.name),
    },
    stores: issues && { raised: issues.requisitions.filter((r) => r.state === "raised").length },
    points: {
      live: v2.points.filter(pointIsLive).length,
      toConfirm: issues ? issues.toConfirm.length : null,
    },
    wards: wards ? wards.length : null,
    carts: carts && { n: carts.rows.length, overdue: carts.rows.filter((c) => c.overdue).length },
    expiry: expiry && {
      expiring: expiry.expiring.reduce((n, l) => n + l.rows.length, 0),
      quarantine: expiry.quarantine.length,
      recalls: recalls ? recalls.filter((r) => !r.closedAt).length : null,
    },
  };
}

export type TodayFlow = Awaited<ReturnType<typeof loadFlow>>;
