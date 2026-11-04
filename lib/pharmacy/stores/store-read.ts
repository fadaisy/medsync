import "server-only";

import type { StoreBatch } from "./ledger";
import type { LineResult } from "./receiving";
import type { CatalogueFacts } from "./receiving-store";
import type { EmrDb, EmrTx } from "@/lib/emr/db";
import { and, asc, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";

import { db as appDb } from "@/db";
import { staffAffiliations } from "@/db/schema/clinician-profiles";
import { hospitalDepartments } from "@/db/schema/hospital-departments";
import { hospitalWards } from "@/db/schema/hospital-wards";
import { hospitals } from "@/db/schema/hospitals";
import { pharmacyDispensingPoints } from "@/db/schema/pharmacy";
import {
  pharmacyBatches,
  pharmacyCounts,
  pharmacyProducts,
  pharmacyStockMovements,
} from "@/db/schema/pharmacy-dispensing";
import {
  pharmacyCounterparties,
  pharmacyDeliveries,
  pharmacyDeliveryLines,
  pharmacyIssueConfirmations,
  pharmacyIssues,
  pharmacyLocations,
  pharmacyOrderLines,
  pharmacyOrders,
  pharmacyRecalls,
  pharmacyRequisitionLines,
  pharmacyRequisitions,
} from "@/db/schema/pharmacy-stores";
import { pharmacyLoanClosures } from "@/db/schema/pharmacy-stores-0182";
import { crashCarts } from "@/db/schema/prescribing";
import { cadres } from "@/db/schema/reference-data";
import { users } from "@/db/schema/users";
import { asClinicalReader } from "@/lib/emr/db";
import { pickedLines } from "@/lib/pharmacy/distribution/store";
import { pharmacyCatalogueLiveFor } from "@/lib/pharmacy/feature";
import { expiresOn, isExpired, localDate } from "@/lib/pharmacy/stock/ledger";
import { controlledRefusals, planIssue } from "./issue";
import { controlledSet } from "./location-store";
import { discrepancyLines, lineResults, stillOwed } from "./receiving";
import { asLine, expiryLookahead, productCatalogueFacts } from "./receiving-store";
import { shelvesOf } from "./shelves";
import { locationLive } from "./write";

/**
 * The store's reads (Pharmacy Phase 2, 5.2, 5.3, 5.12). Ledger and record rows are read as the pharmacy viewer
 * (`asClinicalReader`): RLS returns them only to a holder of `pharmacy.view` at the hospital. Hub names (units,
 * wards, carts, staff names) are read as the owner, scoped to the hospital, as Phase 1's go-live read does; none
 * names a patient. No count screen receives a balance (Law 5): the batch lists for counts carry none.
 */

type Scope = { userId: string; hospitalId: string };
const defaultDb = () => appDb as unknown as EmrDb;

const place = sql`coalesce(${pharmacyBatches.locationId}, ${pharmacyBatches.dispensingPointId})`;

/** Every place of the hospital with its live state (a point's is Phase 1's). */
/** Read as the owner: Phase 1's points table has no reader grant; names and live state only, never PHI. */
async function locationsOf(tx: EmrTx | EmrDb, hospitalId: string) {
  const rows = await tx
    .select({
      id: pharmacyLocations.id,
      kind: pharmacyLocations.kind,
      name: pharmacyLocations.name,
      departmentId: pharmacyLocations.departmentId,
      wardId: pharmacyLocations.wardId,
      crashCartId: pharmacyLocations.crashCartId,
      wardSupplyModel: pharmacyLocations.wardSupplyModel,
      anyNurseConfirms: pharmacyLocations.anyNurseConfirms,
      inChargeUserId: pharmacyLocations.inChargeUserId,
      liveAt: sql<Date | null>`coalesce(${pharmacyDispensingPoints.liveAt}, ${pharmacyLocations.liveAt})`,
      switchedOffAt: sql<Date | null>`CASE WHEN ${pharmacyLocations.kind} = 'dispensing_point' THEN ${pharmacyDispensingPoints.switchedOffAt} ELSE ${pharmacyLocations.switchedOffAt} END`,
    })
    .from(pharmacyLocations)
    .leftJoin(
      pharmacyDispensingPoints,
      eq(pharmacyDispensingPoints.departmentId, pharmacyLocations.id),
    )
    .where(and(eq(pharmacyLocations.hospitalId, hospitalId), isNull(pharmacyLocations.archivedAt)))
    .orderBy(asc(pharmacyLocations.kind), asc(pharmacyLocations.name));
  return rows.map((r) => {
    const l = {
      ...r,
      hospitalId,
      liveAt: r.liveAt ? new Date(r.liveAt) : null,
      switchedOffAt: r.switchedOffAt ? new Date(r.switchedOffAt) : null,
    };
    return { ...l, live: locationLive(l) };
  });
}
export type PlaceRow = Awaited<ReturnType<typeof locationsOf>>[number];

/** Products of the hospital, for pickers and scans (no stock figure). */
async function productsOf(tx: EmrTx, hospitalId: string) {
  return tx
    .select({
      id: pharmacyProducts.id,
      medicineId: pharmacyProducts.medicineId,
      name: pharmacyProducts.name,
      issueUnit: pharmacyProducts.issueUnit,
      gtin: pharmacyProducts.gtin,
      active: pharmacyProducts.active,
    })
    .from(pharmacyProducts)
    .where(eq(pharmacyProducts.hospitalId, hospitalId))
    .orderBy(asc(pharmacyProducts.name));
}
export type PickProduct = Awaited<ReturnType<typeof productsOf>>[number] & { controlled: boolean };

async function withControlled(tx: EmrTx, hospitalId: string) {
  const [list, controlled] = await Promise.all([
    productsOf(tx, hospitalId),
    controlledSet(tx, hospitalId),
  ]);
  return list.map((p): PickProduct => ({ ...p, controlled: controlled(p.medicineId) }));
}

/** The batch ids under an open recall (RC-1: product, and its current or first number). */
export async function recalledBatches(tx: EmrTx, hospitalId: string, batchIds: readonly string[]) {
  if (!batchIds.length) return new Set<string>();
  const rows = await tx
    .select({ id: pharmacyBatches.id })
    .from(pharmacyBatches)
    .innerJoin(
      pharmacyRecalls,
      and(
        eq(pharmacyRecalls.productId, pharmacyBatches.productId),
        eq(pharmacyRecalls.hospitalId, hospitalId),
        isNull(pharmacyRecalls.closedAt),
      ),
    )
    .where(
      and(
        inArray(pharmacyBatches.id, [...batchIds]),
        or(
          isNull(pharmacyRecalls.batchNumber),
          sql`lower(${pharmacyRecalls.batchNumber}) IN (lower(${pharmacyBatches.batchNumber}), lower(${pharmacyBatches.firstBatchNumber}))`,
        ),
      ),
    );
  return new Set(rows.map((r) => r.id));
}

/** Batches at some places, with their products (and balances only where the caller asks). */
export async function batchesAtPlaces(tx: EmrTx, locationIds: readonly string[]) {
  if (!locationIds.length) return [];
  return tx
    .select({
      id: pharmacyBatches.id,
      locationId: sql<string>`${place}`,
      productId: pharmacyBatches.productId,
      productName: pharmacyProducts.name,
      issueUnit: pharmacyProducts.issueUnit,
      medicineId: pharmacyProducts.medicineId,
      batchNumber: pharmacyBatches.batchNumber,
      expiry: pharmacyBatches.expiry,
      expiryMonthOnly: pharmacyBatches.expiryMonthOnly,
    })
    .from(pharmacyBatches)
    .innerJoin(pharmacyProducts, eq(pharmacyProducts.id, pharmacyBatches.productId))
    .where(
      sql`${place} IN (${sql.join(
        locationIds.map((id) => sql`${id}::uuid`),
        sql`, `,
      )})`,
    )
    .orderBy(asc(pharmacyProducts.name), asc(pharmacyBatches.expiry));
}

export async function balancesOf(tx: EmrTx, batchIds: readonly string[]) {
  if (!batchIds.length) return new Map<string, number>();
  const rows = await tx
    .select({
      batchId: pharmacyStockMovements.batchId,
      n: sql<number>`coalesce(sum(${pharmacyStockMovements.quantity}), 0)::int`,
    })
    .from(pharmacyStockMovements)
    .where(inArray(pharmacyStockMovements.batchId, [...batchIds]))
    .groupBy(pharmacyStockMovements.batchId);
  return new Map(rows.map((r) => [r.batchId, Number(r.n)]));
}

/** Names of people, read as the owner (no patient is ever looked up here). */
async function namesOf(database: EmrDb, ids: readonly (string | null)[]) {
  const list = [...new Set(ids.filter((x): x is string => !!x))];
  if (!list.length) return new Map<string, string>();
  const rows = await database
    .select({ id: users.id, name: users.fullName })
    .from(users)
    .where(inArray(users.id, list));
  return new Map(rows.map((r) => [r.id, r.name]));
}

async function hospitalNameOf(database: EmrDb, hospitalId: string) {
  const [h] = await database
    .select({ name: hospitals.name })
    .from(hospitals)
    .where(eq(hospitals.id, hospitalId));
  return h?.name ?? "";
}

/* ─── Places and suppliers ────────────────────────────────────────────── */

export async function getPlacesPage(scope: Scope, database: EmrDb = defaultDb()) {
  const locations = await locationsOf(database, scope.hospitalId);
  const read = await asClinicalReader(
    scope,
    async (tx) => {
      const countable = locations.filter((l) => l.kind === "store" || l.kind === "quarantine");
      const batches = await batchesAtPlaces(
        tx,
        countable.map((l) => l.id),
      );
      const counts = countable.length
        ? await tx
            .select({
              locationId: pharmacyCounts.locationId,
              at: sql<Date>`max(${pharmacyCounts.countedAt})`,
            })
            .from(pharmacyCounts)
            .where(
              inArray(
                pharmacyCounts.locationId,
                countable.map((l) => l.id),
              ),
            )
            .groupBy(pharmacyCounts.locationId)
        : [];
      const counterparties = await tx
        .select()
        .from(pharmacyCounterparties)
        .where(eq(pharmacyCounterparties.hospitalId, scope.hospitalId))
        .orderBy(asc(pharmacyCounterparties.kind), asc(pharmacyCounterparties.name));
      return {
        locations,
        batches,
        lastCounted: new Map(counts.map((c) => [c.locationId!, c.at ? new Date(c.at) : null])),
        counterparties,
        products: await withControlled(tx, scope.hospitalId),
      };
    },
    database,
  );
  const h = scope.hospitalId;
  const [units, wards, carts, staff] = await Promise.all([
    database
      .select({ id: hospitalDepartments.id, name: hospitalDepartments.name })
      .from(hospitalDepartments)
      .where(and(eq(hospitalDepartments.hospitalId, h), isNull(hospitalDepartments.archivedAt)))
      .orderBy(asc(hospitalDepartments.name)),
    database
      .select({ id: hospitalWards.id, name: hospitalWards.name })
      .from(hospitalWards)
      .where(eq(hospitalWards.hospitalId, h))
      .orderBy(asc(hospitalWards.name)),
    database
      .select({ id: crashCarts.id, name: crashCarts.label })
      .from(crashCarts)
      .where(eq(crashCarts.hospitalId, h))
      .orderBy(asc(crashCarts.label)),
    database
      .selectDistinct({ id: staffAffiliations.userId, name: users.fullName })
      .from(staffAffiliations)
      .innerJoin(cadres, eq(cadres.id, staffAffiliations.cadreId))
      .innerJoin(users, eq(users.id, staffAffiliations.userId))
      .where(
        and(
          eq(staffAffiliations.hospitalId, h),
          inArray(staffAffiliations.state, ["approved", "active"]),
          inArray(cadres.code, ["PHARMACIST", "PHARMACY_TECH"]),
        ),
      )
      .orderBy(asc(users.fullName)),
  ]);
  const names = await namesOf(
    database,
    read.locations.map((l) => l.inChargeUserId),
  );
  return {
    ...read,
    locations: read.locations.map((l) => ({
      ...l,
      inChargeName: l.inChargeUserId ? (names.get(l.inChargeUserId) ?? null) : null,
      lastCountedAt: read.lastCounted.get(l.id) ?? null,
    })),
    // Count lists carry no balance (Law 5).
    countBatches: read.batches,
    units,
    wards,
    carts,
    staff,
  };
}

/* ─── Deliveries ──────────────────────────────────────────────────────── */

export async function getDeliveriesPage(scope: Scope, database: EmrDb = defaultDb()) {
  const places = await locationsOf(database, scope.hospitalId);
  return asClinicalReader(
    scope,
    async (tx) => {
      const [deliveries, locations, suppliers, orders] = await Promise.all([
        tx
          .select({
            id: pharmacyDeliveries.id,
            noteNumber: pharmacyDeliveries.noteNumber,
            supplier: pharmacyCounterparties.name,
            locationName: pharmacyLocations.name,
            arrivedAt: pharmacyDeliveries.arrivedAt,
            state: pharmacyDeliveries.state,
            finishedAt: pharmacyDeliveries.finishedAt,
            lines: sql<number>`(SELECT count(*)::int FROM public.pharmacy_delivery_lines l WHERE l.delivery_id = ${pharmacyDeliveries.id})`,
          })
          .from(pharmacyDeliveries)
          .innerJoin(
            pharmacyCounterparties,
            eq(pharmacyCounterparties.id, pharmacyDeliveries.supplierId),
          )
          .innerJoin(pharmacyLocations, eq(pharmacyLocations.id, pharmacyDeliveries.locationId))
          .where(eq(pharmacyDeliveries.hospitalId, scope.hospitalId))
          .orderBy(
            sql`CASE WHEN ${pharmacyDeliveries.state} = 'counting' THEN 0 ELSE 1 END`,
            desc(pharmacyDeliveries.arrivedAt),
          )
          .limit(200),
        places,
        tx
          .select({ id: pharmacyCounterparties.id, name: pharmacyCounterparties.name })
          .from(pharmacyCounterparties)
          .where(
            and(
              eq(pharmacyCounterparties.hospitalId, scope.hospitalId),
              eq(pharmacyCounterparties.kind, "supplier"),
              isNull(pharmacyCounterparties.retiredAt),
            ),
          )
          .orderBy(asc(pharmacyCounterparties.name)),
        tx
          .select({
            id: pharmacyOrders.id,
            kind: pharmacyOrders.kind,
            savedAt: pharmacyOrders.savedAt,
          })
          .from(pharmacyOrders)
          .where(
            and(eq(pharmacyOrders.hospitalId, scope.hospitalId), eq(pharmacyOrders.state, "open")),
          )
          .orderBy(desc(pharmacyOrders.savedAt)),
      ]);
      return {
        deliveries: deliveries.map((d) => ({ ...d, lines: Number(d.lines) })),
        receivingPlaces: locations.filter(
          (l) => l.live && (l.kind === "store" || l.kind === "dispensing_point"),
        ),
        suppliers,
        orders,
      };
    },
    database,
  );
}

export interface DeliveryLineView {
  id: string;
  lineNo: number;
  productId: string;
  productName: string;
  issueUnit: string;
  noteProductId: string | null;
  noteProductName: string | null;
  orderLineId: string | null;
  noteQuantity: number | null;
  accepted: number;
  rejectedKept: number;
  rejectedReturned: number;
  rejectReason: string | null;
  batchNumber: string | null;
  expiry: string | null;
  expiryMonthOnly: boolean;
  unitCost: string | null;
  shortDatedDecision: "accept" | "accept_tell" | "reject" | null;
  controlled: boolean;
  results: LineResult[];
  needsDecision: boolean;
  // Catalogue slice Step 7 (0256).
  packs: number | null;
  packContents: number | null;
  identitySource: "scan" | "catalogue" | "typed" | null;
  registrationReason: string | null;
  registrationNote: string | null;
}

/** RG-2, RG-5, RG-6: the delivery, its lines with their results, the report lines, and what the order still owes. */
export async function getDelivery(
  scope: Scope,
  id: string,
  now: Date = new Date(),
  database: EmrDb = defaultDb(),
) {
  const places = await locationsOf(database, scope.hospitalId);
  const read = await asClinicalReader(
    scope,
    async (tx) => {
      const [d] = await tx
        .select()
        .from(pharmacyDeliveries)
        .where(
          and(eq(pharmacyDeliveries.id, id), eq(pharmacyDeliveries.hospitalId, scope.hospitalId)),
        );
      if (!d) return null;
      const [stored, products, lookaheadDays, [supplier], locations] = await Promise.all([
        tx
          .select()
          .from(pharmacyDeliveryLines)
          .where(eq(pharmacyDeliveryLines.deliveryId, d.id))
          .orderBy(asc(pharmacyDeliveryLines.lineNo)),
        withControlled(tx, scope.hospitalId),
        expiryLookahead(tx, scope.hospitalId),
        tx.select().from(pharmacyCounterparties).where(eq(pharmacyCounterparties.id, d.supplierId ?? d.id)),
        places,
      ]);
      const orderLines = d.orderId
        ? await tx
            .select({
              id: pharmacyOrderLines.id,
              productId: pharmacyOrderLines.productId,
              units: sql<number>`coalesce(${pharmacyOrderLines.chosenUnits}, ${pharmacyOrderLines.proposedUnits}, 0)::int`,
              closeReason: pharmacyOrderLines.closeReason,
            })
            .from(pharmacyOrderLines)
            .where(eq(pharmacyOrderLines.orderId, d.orderId))
        : [];
      const otherDeliveries = d.orderId
        ? await tx
            .select({ id: pharmacyDeliveries.id, state: pharmacyDeliveries.state })
            .from(pharmacyDeliveries)
            .where(
              and(
                eq(pharmacyDeliveries.orderId, d.orderId),
                eq(pharmacyDeliveries.state, "received"),
              ),
            )
        : [];
      const otherLines = otherDeliveries.length
        ? await tx
            .select()
            .from(pharmacyDeliveryLines)
            .where(
              inArray(
                pharmacyDeliveryLines.deliveryId,
                otherDeliveries.map((o) => o.id),
              ),
            )
        : [];
      const facts = await productCatalogueFacts(tx, scope.hospitalId);
      return {
        catalogue: {
          live: pharmacyCatalogueLiveFor(scope.hospitalId),
          facts: Object.fromEntries(facts) as Record<string, CatalogueFacts>,
        },
        d,
        stored,
        products,
        lookaheadDays,
        supplier,
        locations,
        orderLines,
        otherDeliveries,
        otherLines,
      };
    },
    database,
  );
  if (!read) return null;
  const hospitalName = await hospitalNameOf(database, scope.hospitalId);
  const { d, stored, products, lookaheadDays, orderLines } = read;
  const today = localDate(now);
  const productOf = new Map(products.map((p) => [p.id, p]));
  const lines = stored.map(asLine);
  // RG-6: owed before this delivery = the order's lines over every *other* received delivery.
  const owedRows = (exclude: string | null) =>
    stillOwed(
      orderLines.map((o) => ({ id: o.id, units: Number(o.units), closedReason: o.closeReason })),
      read.otherDeliveries
        .filter((o) => o.id !== exclude)
        .map((o) => ({
          state: o.state,
          lines: read.otherLines.filter((l) => l.deliveryId === o.id).map(asLine),
        })),
    );
  const owedBefore = new Map(owedRows(d.id).map((o) => [o.orderLineId, o.owed]));
  const ctx = { today, lookaheadDays, orderNamed: d.orderId !== null };
  const view: DeliveryLineView[] = stored.map((s, i) => {
    const line = lines[i]!;
    const p = productOf.get(s.productId);
    const results = lineResults(line, {
      ...ctx,
      owedBefore: line.orderLineId === null ? null : (owedBefore.get(line.orderLineId) ?? null),
    }).results;
    return {
      id: s.id,
      lineNo: s.lineNo,
      productId: s.productId,
      productName: p?.name ?? "",
      issueUnit: p?.issueUnit ?? "",
      noteProductId: s.noteProductId,
      noteProductName: s.noteProductId ? (productOf.get(s.noteProductId)?.name ?? null) : null,
      orderLineId: s.orderLineId,
      noteQuantity: s.noteQuantity,
      accepted: s.acceptedQuantity,
      rejectedKept: s.rejectedKeptQuantity,
      rejectedReturned: s.rejectedReturnedQuantity,
      rejectReason: s.rejectReason,
      batchNumber: s.batchNumber,
      expiry: s.expiry,
      expiryMonthOnly: s.expiryMonthOnly,
      unitCost: s.unitCost,
      shortDatedDecision: s.shortDatedDecision,
      controlled: !!p?.controlled,
      results,
      needsDecision: results.some((r) => r.kind === "expires_within") && s.acceptedQuantity > 0,
      packs: s.packs,
      packContents: s.packContents,
      identitySource: s.identitySource === "order" ? "catalogue" : s.identitySource,
      registrationReason: s.registrationReason,
      registrationNote: s.registrationNote,
    };
  });
  const report = discrepancyLines(lines, { ...ctx, owed: owedBefore }).map((x) => x.line.lineNo);
  const receivedOrders = d.state === "received" ? owedRows(null) : owedRows(d.id);
  const quarantine = read.locations.find((l) => l.kind === "quarantine" && l.live) ?? null;
  return {
    delivery: d,
    supplier: read.supplier ?? null,
    hospitalName,
    location: read.locations.find((l) => l.id === d.locationId) ?? null,
    quarantine,
    lookaheadDays,
    lines: view,
    reportLineNos: new Set(report),
    owed: receivedOrders
      .filter((o) => o.owed > 0)
      .map((o) => ({
        ...o,
        productName:
          productOf.get(orderLines.find((x) => x.id === o.orderLineId)?.productId ?? "")?.name ??
          "",
      })),
    orderLines: orderLines.map((o) => ({
      id: o.id,
      productId: o.productId,
      productName: productOf.get(o.productId)?.name ?? "",
    })),
    products: products.filter((p) => p.active),
    catalogue: read.catalogue,
  };
}
export type DeliveryView = NonNullable<Awaited<ReturnType<typeof getDelivery>>>;

/* ─── Issues, requisitions, loans ─────────────────────────────────────── */

export async function getIssuesPage(scope: Scope, database: EmrDb = defaultDb()) {
  const locations = await locationsOf(database, scope.hospitalId);
  const read = await asClinicalReader(
    scope,
    async (tx) => {
      const name = new Map(locations.map((l) => [l.id, l.name]));
      const pharmacyPlaces = locations.filter(
        (l) => l.kind === "store" || l.kind === "dispensing_point",
      );
      const requisitions = await tx
        .select({
          id: pharmacyRequisitions.id,
          from: pharmacyRequisitions.requestingLocationId,
          to: pharmacyRequisitions.issuingLocationId,
          raisedAt: pharmacyRequisitions.raisedAt,
          state: pharmacyRequisitions.state,
          refusedReason: pharmacyRequisitions.refusedReason,
          lines: sql<number>`(SELECT count(*)::int FROM public.pharmacy_requisition_lines l WHERE l.requisition_id = ${pharmacyRequisitions.id})`,
          issuedAt: sql<Date | null>`(SELECT max(i.issued_at) FROM public.pharmacy_issues i WHERE i.requisition_id = ${pharmacyRequisitions.id})`,
        })
        .from(pharmacyRequisitions)
        .where(
          and(
            eq(pharmacyRequisitions.hospitalId, scope.hospitalId),
            inArray(
              pharmacyRequisitions.issuingLocationId,
              pharmacyPlaces.map((l) => l.id).concat(["00000000-0000-0000-0000-000000000000"]),
            ),
          ),
        )
        .orderBy(desc(pharmacyRequisitions.raisedAt))
        .limit(200);
      // Issues to a pharmacy place still to confirm, with what each batch was issued (a voucher check, not a count).
      const toConfirm = await tx
        .select({
          issueId: pharmacyIssues.id,
          from: pharmacyIssues.fromLocationId,
          to: pharmacyIssues.toLocationId,
          issuedAt: pharmacyIssues.issuedAt,
          batchId: pharmacyStockMovements.batchId,
          quantity: pharmacyStockMovements.quantity,
          batchNumber: pharmacyBatches.batchNumber,
          productName: pharmacyProducts.name,
          issueUnit: pharmacyProducts.issueUnit,
        })
        .from(pharmacyIssues)
        .leftJoin(
          pharmacyIssueConfirmations,
          eq(pharmacyIssueConfirmations.issueId, pharmacyIssues.id),
        )
        .innerJoin(
          pharmacyStockMovements,
          and(
            eq(pharmacyStockMovements.sourceId, pharmacyIssues.id),
            inArray(pharmacyStockMovements.kind, ["received_from_issue", "returned_in"]),
          ),
        )
        .innerJoin(pharmacyBatches, eq(pharmacyBatches.id, pharmacyStockMovements.batchId))
        .innerJoin(pharmacyProducts, eq(pharmacyProducts.id, pharmacyBatches.productId))
        .where(
          and(
            eq(pharmacyIssues.hospitalId, scope.hospitalId),
            isNull(pharmacyIssueConfirmations.id),
            inArray(pharmacyIssues.kind, ["issue", "return"]),
          ),
        )
        .orderBy(asc(pharmacyIssues.issuedAt));
      const loans = await tx
        .select({
          id: pharmacyStockMovements.id,
          kind: pharmacyStockMovements.kind,
          quantity: pharmacyStockMovements.quantity,
          loanMovementId: pharmacyStockMovements.loanMovementId,
          counterpartyId: pharmacyStockMovements.counterpartyId,
          effectiveAt: pharmacyStockMovements.effectiveAt,
          batchId: pharmacyStockMovements.batchId,
        })
        .from(pharmacyStockMovements)
        .where(
          and(
            eq(pharmacyStockMovements.hospitalId, scope.hospitalId),
            inArray(pharmacyStockMovements.kind, [
              "lent",
              "borrowed",
              "loan_returned_in",
              "loan_returned_out",
            ]),
          ),
        );
      const closures = await tx
        .select({ loanMovementId: pharmacyLoanClosures.loanMovementId })
        .from(pharmacyLoanClosures)
        .where(eq(pharmacyLoanClosures.hospitalId, scope.hospitalId));
      const facilities = await tx
        .select({
          id: pharmacyCounterparties.id,
          name: pharmacyCounterparties.name,
          code: pharmacyCounterparties.code,
        })
        .from(pharmacyCounterparties)
        .where(
          and(
            eq(pharmacyCounterparties.hospitalId, scope.hospitalId),
            eq(pharmacyCounterparties.kind, "facility"),
            isNull(pharmacyCounterparties.retiredAt),
          ),
        )
        .orderBy(asc(pharmacyCounterparties.name));
      const batches = await batchesAtPlaces(
        tx,
        pharmacyPlaces.filter((l) => l.live).map((l) => l.id),
      );
      const balances = await balancesOf(
        tx,
        batches.map((b) => b.id),
      );
      const loanBatches = await batchesAtPlaces(tx, [...new Set(locations.map((l) => l.id))]);
      return {
        locations,
        name,
        requisitions,
        toConfirm,
        loans,
        closures: new Set(closures.map((c) => c.loanMovementId)),
        facilities,
        batches,
        balances,
        loanBatches,
        products: await withControlled(tx, scope.hospitalId),
      };
    },
    database,
  );
  const n = (id: string) => read.name.get(id) ?? "";
  // IS-7: outstanding per loan = the loan less its linked returns; a closed loan owes nothing.
  const settled = new Map<string, number>();
  for (const m of read.loans)
    if (m.loanMovementId)
      settled.set(m.loanMovementId, (settled.get(m.loanMovementId) ?? 0) + Math.abs(m.quantity));
  const batchOf = new Map(read.loanBatches.map((b) => [b.id, b]));
  const facilityName = new Map(read.facilities.map((f) => [f.id, f.name]));
  const loans = read.loans
    .filter((m) => (m.kind === "lent" || m.kind === "borrowed") && !read.closures.has(m.id))
    .map((m) => ({
      id: m.id,
      direction: m.kind as "lent" | "borrowed",
      facility: facilityName.get(m.counterpartyId ?? "") ?? "",
      productName: batchOf.get(m.batchId)?.productName ?? "",
      batchNumber: batchOf.get(m.batchId)?.batchNumber ?? "",
      issueUnit: batchOf.get(m.batchId)?.issueUnit ?? "",
      outstanding: Math.abs(m.quantity) - (settled.get(m.id) ?? 0),
      since: m.effectiveAt,
    }))
    .filter((l) => l.outstanding > 0);
  const confirm = new Map<
    string,
    {
      issueId: string;
      from: string;
      to: string;
      toId: string;
      issuedAt: Date;
      lines: { batchId: string; label: string; issued: number }[];
    }
  >();
  for (const r of read.toConfirm) {
    const to = read.locations.find((l) => l.id === r.to);
    if (!to || (to.kind !== "store" && to.kind !== "dispensing_point" && to.kind !== "quarantine"))
      continue;
    const c =
      confirm.get(r.issueId) ??
      confirm
        .set(r.issueId, {
          issueId: r.issueId,
          from: n(r.from),
          to: n(r.to),
          toId: r.to,
          issuedAt: r.issuedAt,
          lines: [],
        })
        .get(r.issueId)!;
    c.lines.push({
      batchId: r.batchId,
      label: `${r.productName} · ${r.batchNumber}`,
      issued: r.quantity,
    });
  }
  return {
    requisitions: read.requisitions.map((r) => ({
      ...r,
      fromName: n(r.from),
      toName: n(r.to),
      lines: Number(r.lines),
      issuedAt: r.issuedAt ? new Date(r.issuedAt) : null,
    })),
    toConfirm: [...confirm.values()],
    loans,
    facilities: read.facilities,
    places: read.locations.filter(
      (l) => l.live && (l.kind === "store" || l.kind === "dispensing_point"),
    ),
    batches: read.batches
      .filter((b) => (read.balances.get(b.id) ?? 0) > 0)
      .map((b) => ({ ...b, balance: read.balances.get(b.id) ?? 0, locationName: n(b.locationId) })),
    products: read.products.filter((p) => p.active),
  };
}

/** 5.3 The issuing screen: per line what was asked, what is held here, the batch that expires first, the prefill. */
export async function getRequisition(
  scope: Scope,
  id: string,
  now: Date = new Date(),
  database: EmrDb = defaultDb(),
) {
  const locations = await locationsOf(database, scope.hospitalId);
  const read = await asClinicalReader(
    scope,
    async (tx) => {
      const [r] = await tx
        .select()
        .from(pharmacyRequisitions)
        .where(
          and(
            eq(pharmacyRequisitions.id, id),
            eq(pharmacyRequisitions.hospitalId, scope.hospitalId),
          ),
        );
      if (!r) return null;
      const lines = await tx
        .select({
          id: pharmacyRequisitionLines.id,
          productId: pharmacyRequisitionLines.productId,
          asked: pharmacyRequisitionLines.quantityAsked,
          issued: pharmacyRequisitionLines.quantityIssued,
          notIssuedReason: pharmacyRequisitionLines.notIssuedReason,
          productName: pharmacyProducts.name,
          issueUnit: pharmacyProducts.issueUnit,
          medicineId: pharmacyProducts.medicineId,
          cold: sql<boolean>`coalesce(${pharmacyProducts}.cold_chain, false)`,
        })
        .from(pharmacyRequisitionLines)
        .innerJoin(pharmacyProducts, eq(pharmacyProducts.id, pharmacyRequisitionLines.productId))
        .where(eq(pharmacyRequisitionLines.requisitionId, r.id))
        .orderBy(asc(pharmacyProducts.name));
      const batches = await batchesAtPlaces(tx, [r.issuingLocationId]);
      const balances = await balancesOf(
        tx,
        batches.map((b) => b.id),
      );
      const recalled = await recalledBatches(
        tx,
        scope.hospitalId,
        batches.map((b) => b.id),
      );
      const issues = await tx
        .select({
          id: pharmacyIssues.id,
          issuedAt: pharmacyIssues.issuedAt,
          issuedBy: pharmacyIssues.issuedBy,
          confirmedAt: pharmacyIssueConfirmations.confirmedAt,
          confirmedBy: pharmacyIssueConfirmations.confirmedBy,
        })
        .from(pharmacyIssues)
        .leftJoin(
          pharmacyIssueConfirmations,
          eq(pharmacyIssueConfirmations.issueId, pharmacyIssues.id),
        )
        .where(eq(pharmacyIssues.requisitionId, r.id));
      const issued = issues.length
        ? await tx
            .select({
              productId: pharmacyBatches.productId,
              batchNumber: pharmacyBatches.batchNumber,
              expiry: pharmacyBatches.expiry,
              expiryMonthOnly: pharmacyBatches.expiryMonthOnly,
              quantity: sql<number>`(-${pharmacyStockMovements.quantity})::int`,
            })
            .from(pharmacyStockMovements)
            .innerJoin(pharmacyBatches, eq(pharmacyBatches.id, pharmacyStockMovements.batchId))
            .where(
              and(
                inArray(
                  pharmacyStockMovements.sourceId,
                  issues.map((i) => i.id),
                ),
                eq(pharmacyStockMovements.kind, "issued"),
              ),
            )
        : [];
      const [lastCount] = await tx
        .select({ at: pharmacyCounts.countedAt })
        .from(pharmacyCounts)
        .where(eq(pharmacyCounts.locationId, r.requestingLocationId))
        .orderBy(desc(pharmacyCounts.countedAt))
        .limit(1);
      const controlled = await controlledSet(tx, scope.hospitalId);
      const picks = pharmacyCatalogueLiveFor(scope.hospitalId) ? await pickedLines(tx, r.id) : null;
      const shelves = await shelvesOf(
        tx,
        batches.map((b) => b.id),
      );
      return {
        picks,
        shelves,
        r,
        locations,
        lines,
        batches,
        balances,
        recalled,
        issues,
        issued,
        lastCount,
        controlled,
      };
    },
    database,
  );
  if (!read) return null;
  const today = localDate(now);
  const from = read.locations.find((l) => l.id === read.r.requestingLocationId) ?? null;
  const at = read.locations.find((l) => l.id === read.r.issuingLocationId) ?? null;
  const lines = read.lines.map((l) => {
    const batches: StoreBatch[] = read.batches
      .filter((b) => b.productId === l.productId)
      .map((b) => ({ ...b, pointId: b.locationId }));
    const plan = planIssue(l.asked, {
      batches,
      balances: read.balances,
      blocked: read.recalled,
      localDate: today,
    });
    // What a pick list takes from: usable batches, first to expire first.
    const usable = batches
      .filter(
        (b) =>
          !read.recalled.has(b.id) && !isExpired(b, today) && (read.balances.get(b.id) ?? 0) > 0,
      )
      .sort(
        (a, b) =>
          expiresOn(a).localeCompare(expiresOn(b)) || a.batchNumber.localeCompare(b.batchNumber),
      );
    const byId = new Map(batches.map((b) => [b.id, b]));
    return {
      ...l,
      held: plan.held,
      prefill: plan.issue,
      /** 4.11: the plan's batches, first to expire first, and the line's pick (null with the check off). */
      planned: plan.rows.map((p) => ({
        ...p,
        batchNumber: byId.get(p.batchId)!.batchNumber,
        expiry: byId.get(p.batchId)!.expiry,
      })),
      pick: read.picks ? (read.picks.get(l.id) ?? null) : undefined,
      needs: controlledRefusals({
        controlled: read.controlled(l.medicineId),
        movement: "issue",
        witnessAttestationId: null,
        confirmerSecondFactor: false,
      }),
      controlled: read.controlled(l.medicineId),
      stock: usable.map((b) => ({
        batchNumber: b.batchNumber,
        expiry: b.expiry,
        expiryMonthOnly: b.expiryMonthOnly,
        held: read.balances.get(b.id) ?? 0,
        shelf: read.shelves.get(b.id) ?? null,
      })),
      issuedRows: read.issued.filter((x) => x.productId === l.productId),
    };
  });
  const names = await namesOf(database, [
    read.r.raisedBy,
    ...read.issues.map((i) => i.issuedBy),
    ...read.issues.map((i) => i.confirmedBy),
  ]);
  return {
    requisition: read.r,
    hospitalName: await hospitalNameOf(database, scope.hospitalId),
    from,
    at,
    lines,
    issues: read.issues.map((i) => ({
      ...i,
      issuedByName: names.get(i.issuedBy) ?? "",
      confirmedByName: i.confirmedBy ? (names.get(i.confirmedBy) ?? "") : null,
    })),
    raisedByName: names.get(read.r.raisedBy) ?? "",
    lastCountAt: read.lastCount?.at ?? null,
  };
}
export type RequisitionView = NonNullable<Awaited<ReturnType<typeof getRequisition>>>;
