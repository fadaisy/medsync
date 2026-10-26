import type { MovementKind } from "@/db/schema/pharmacy-dispensing";
import type { LocationKind } from "@/db/schema/pharmacy-stores";
import type { EmrDb, EmrTx } from "@/lib/emr/db";
import type { PharmacyCtx, PharmacyNeed } from "@/lib/pharmacy/write";
import { and, eq, gte, sql } from "drizzle-orm";

import {
  pharmacyAttestations,
  pharmacyBatches,
  pharmacyDispensingPoints,
  pharmacyProducts,
  pharmacyStockMovements,
} from "@/db/schema";
import { pharmacyLocations, pharmacyProductLocations } from "@/db/schema/pharmacy-stores";
import { asClinicalWriter } from "@/lib/emr/db";
import { EmrWriteError } from "@/lib/emr/write/context";

/**
 * Pharmacy Phase 2: the write layer every Store screen shares (Law 2, Law 3). One ledger, Phase 1's, written at
 * a location: a dispensing point's rows carry `dispensing_point_id` too, so every Phase 1 read still sees them.
 * Two-place movements share a pair id and are checked at commit by 0180's `psm_pair_check` (SL-13). The guard in
 * the database refuses blocked batches (SL-14) and below-zero balances (SL-4) under the batch row lock.
 */

export const fail = (
  code: "invalid" | "conflict" | "not_found" | "config" | "forbidden",
  m: string,
) => new EmrWriteError(code, m);

export interface StockLocation {
  id: string;
  hospitalId: string;
  kind: LocationKind;
  name: string;
  departmentId: string | null;
  wardId: string | null;
  crashCartId: string | null;
  wardSupplyModel: "stocked" | "issue_only" | null;
  anyNurseConfirms: boolean;
  inChargeUserId: string | null;
  liveAt: Date | null;
  switchedOffAt: Date | null;
}

/** A location at this hospital. A dispensing point's live state is Phase 1's (pharmacy_dispensing_points). */
export async function loadLocation(
  tx: EmrTx,
  hospitalId: string,
  id: string,
): Promise<StockLocation> {
  const [l] = await tx
    .select({
      id: pharmacyLocations.id,
      hospitalId: pharmacyLocations.hospitalId,
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
    .where(
      and(
        eq(pharmacyLocations.id, id),
        eq(pharmacyLocations.hospitalId, hospitalId),
        sql`${pharmacyLocations.archivedAt} IS NULL`,
      ),
    )
    .for("share", { of: pharmacyLocations });
  if (!l) throw fail("not_found", "That place is not at your hospital.");
  return {
    ...l,
    liveAt: l.liveAt ? new Date(l.liveAt) : null,
    switchedOffAt: l.switchedOffAt ? new Date(l.switchedOffAt) : null,
  };
}

/** Live for movements: switched on and not off. An issue-only ward needs no go-live of its own (LC-4). */
export const locationLive = (l: StockLocation) =>
  (l.kind === "ward" && l.wardSupplyModel === "issue_only") ||
  (l.liveAt !== null && l.switchedOffAt === null);

/** Law 7: no movement to or from a location that is not live (issue-only wards excepted). */
export function requireLive(l: StockLocation) {
  if (!locationLive(l)) throw fail("config", `${l.name} is not live yet.`);
}

/** A person's hub-assignment right at a ward or cart (0180 `pharmacy_location_right`, Appendix A). */
export async function hasLocationRight(
  tx: EmrTx,
  userId: string,
  locationId: string,
  right: "ward_act" | "ward_read" | "ward_confirm" | "cart_confirm",
): Promise<boolean> {
  const rows = (await tx.execute(
    sql`SELECT private.pharmacy_location_right(${userId}::uuid, ${locationId}::uuid, ${right}) AS ok`,
  )) as unknown as { ok: boolean }[] | { rows: { ok: boolean }[] };
  const list = Array.isArray(rows) ? rows : rows.rows;
  return list[0]?.ok === true;
}

/**
 * A second person's proof (D-PH2-23): a passed password+TOTP attestation at this hospital, for this actor, not by
 * the actor, made in the last `minutes`. Returns the attester.
 */
export async function requireAttestation(
  tx: EmrTx,
  input: { id: string; hospitalId: string; actorUserId: string; now: Date; minutes?: number },
): Promise<string> {
  const since = new Date(input.now.getTime() - (input.minutes ?? 15) * 60_000);
  const [a] = await tx
    .select({ attester: pharmacyAttestations.attesterUserId })
    .from(pharmacyAttestations)
    .where(
      and(
        eq(pharmacyAttestations.id, input.id),
        eq(pharmacyAttestations.hospitalId, input.hospitalId),
        eq(pharmacyAttestations.actorUserId, input.actorUserId),
        eq(pharmacyAttestations.outcome, "passed"),
        gte(pharmacyAttestations.attestedAt, since),
      ),
    );
  if (!a?.attester || a.attester === input.actorUserId)
    throw fail(
      "forbidden",
      "The second person has to confirm again, with their password and code.",
    );
  return a.attester;
}

/** Place a product at a location (any kind). */
export async function placeAt(
  tx: EmrTx,
  hospitalId: string,
  productId: string,
  locationId: string,
) {
  await tx
    .insert(pharmacyProductLocations)
    .values({ productId, locationId, hospitalId })
    .onConflictDoUpdate({
      target: [pharmacyProductLocations.productId, pharmacyProductLocations.locationId],
      set: { active: true, endedAt: null, endedBy: null },
      setWhere: eq(pharmacyProductLocations.active, false),
    });
}

export interface BatchRef {
  id: string;
  productId: string;
  medicineId: string;
  batchNumber: string;
  expiry: string;
  expiryMonthOnly: boolean;
  firstBatchNumber: string;
}

/** The place columns for a row at a location: a point keeps Phase 1's column as well. */
export const placeCols = (l: Pick<StockLocation, "id" | "kind">) =>
  l.kind === "dispensing_point"
    ? { locationId: l.id, dispensingPointId: l.id }
    : { locationId: l.id, dispensingPointId: null };

/** The batch at a location, made if absent. Same number with another expiry is refused (SL-3). */
export async function batchAtLocation(
  tx: EmrTx,
  input: {
    hospitalId: string;
    location: Pick<StockLocation, "id" | "kind">;
    productId: string;
    batchNumber: string;
    expiry: string;
    monthOnly: boolean;
    actorUserId: string;
  },
): Promise<string> {
  const place = sql`coalesce(${pharmacyBatches.locationId}, ${pharmacyBatches.dispensingPointId})`;
  const [b] = await tx
    .select({
      id: pharmacyBatches.id,
      expiry: pharmacyBatches.expiry,
      monthOnly: pharmacyBatches.expiryMonthOnly,
    })
    .from(pharmacyBatches)
    .where(
      and(
        sql`${place} = ${input.location.id}::uuid`,
        eq(pharmacyBatches.productId, input.productId),
        eq(pharmacyBatches.batchNumber, input.batchNumber),
      ),
    )
    .for("update");
  if (b) {
    if (b.expiry !== input.expiry || b.monthOnly !== input.monthOnly)
      throw fail(
        "conflict",
        `Batch ${input.batchNumber} is already here with expiry ${b.expiry}. Check the pack before going on.`,
      );
    return b.id;
  }
  const [row] = await tx
    .insert(pharmacyBatches)
    .values({
      hospitalId: input.hospitalId,
      ...placeCols(input.location),
      productId: input.productId,
      batchNumber: input.batchNumber,
      expiry: input.expiry,
      expiryMonthOnly: input.monthOnly,
      firstBatchNumber: input.batchNumber,
      firstExpiry: input.expiry,
      createdBy: input.actorUserId,
    })
    .returning({ id: pharmacyBatches.id });
  await placeAt(tx, input.hospitalId, input.productId, input.location.id);
  return row!.id;
}

/** A batch with its medicine, locked as the guard locks it. */
export async function batchRef(tx: EmrTx, hospitalId: string, batchId: string, locationId: string) {
  const [b] = await tx
    .select({
      id: pharmacyBatches.id,
      productId: pharmacyBatches.productId,
      medicineId: pharmacyProducts.medicineId,
      batchNumber: pharmacyBatches.batchNumber,
      expiry: pharmacyBatches.expiry,
      expiryMonthOnly: pharmacyBatches.expiryMonthOnly,
      firstBatchNumber: pharmacyBatches.firstBatchNumber,
    })
    .from(pharmacyBatches)
    .innerJoin(pharmacyProducts, eq(pharmacyProducts.id, pharmacyBatches.productId))
    .where(
      and(
        eq(pharmacyBatches.id, batchId),
        eq(pharmacyBatches.hospitalId, hospitalId),
        sql`coalesce(${pharmacyBatches.locationId}, ${pharmacyBatches.dispensingPointId}) = ${locationId}::uuid`,
      ),
    )
    .for("update", { of: pharmacyBatches });
  if (!b) throw fail("not_found", "That batch is not at this place.");
  return b as BatchRef;
}

export interface MoveInput {
  id?: string;
  hospitalId: string;
  location: Pick<StockLocation, "id" | "kind">;
  batchId: string;
  kind: MovementKind;
  quantity: number;
  sourceKind:
    | "delivery"
    | "count"
    | "adjustment"
    | "issue"
    | "return"
    | "loan"
    | "quarantine"
    | "write_off"
    | "supplier_return"
    | "opening"
    | "downtime"
    | "set_aside"
    | "release";
  sourceId?: string | null;
  actorUserId: string;
  effectiveAt: Date;
  pairId?: string | null;
  unitCost?: string | null;
  allocated?: boolean;
  counterpartyId?: string | null;
  loanMovementId?: string | null;
  reasonCode?: string | null;
  reasonNote?: string | null;
  witnessAttestationId?: string | null;
  downtime?: boolean;
}

/** One ledger row. The database guard decides blocked and below zero (SL-4, SL-14). */
export async function move(tx: EmrTx, m: MoveInput): Promise<string> {
  const [row] = await tx
    .insert(pharmacyStockMovements)
    .values({
      ...(m.id ? { id: m.id } : {}),
      hospitalId: m.hospitalId,
      ...placeCols(m.location),
      batchId: m.batchId,
      kind: m.kind,
      quantity: m.quantity,
      effectiveAt: m.effectiveAt,
      actorUserId: m.actorUserId,
      reasonCode: m.reasonCode ?? null,
      reasonNote: m.reasonNote ?? null,
      sourceKind: m.sourceKind,
      sourceId: m.sourceId ?? null,
      witnessAttestationId: m.witnessAttestationId ?? null,
      downtime: m.downtime ?? false,
      pairId: m.pairId ?? null,
      unitCost: m.unitCost ?? null,
      allocated: m.allocated ?? false,
      counterpartyId: m.counterpartyId ?? null,
      loanMovementId: m.loanMovementId ?? null,
    })
    .returning({ id: pharmacyStockMovements.id });
  return row!.id;
}

const PAIRS = {
  issue: ["issued", "received_from_issue"],
  return: ["returned_out", "returned_in"],
  quarantine: ["quarantined_out", "quarantined_in"],
  // Pharmacy Phase 4 (SA-1): a point and its prepared place.
  set_aside: ["set_aside_out", "set_aside_in"],
  release: ["released_out", "released_in"],
} as const;

/**
 * SL-13: a two-place movement. The same batch (number and expiry) is made at the other place if absent; both
 * legs share one pair id, in this transaction, or neither is written.
 */
export async function movePair(
  tx: EmrTx,
  input: {
    pair: keyof typeof PAIRS;
    hospitalId: string;
    from: Pick<StockLocation, "id" | "kind">;
    to: Pick<StockLocation, "id" | "kind">;
    batch: BatchRef;
    quantity: number;
    sourceId: string;
    actorUserId: string;
    effectiveAt: Date;
    reasonCode?: string | null;
    reasonNote?: string | null;
    witnessAttestationId?: string | null;
  },
): Promise<{ pairId: string; outId: string; inId: string; toBatchId: string }> {
  if (input.quantity <= 0) throw fail("invalid", "The quantity is a whole number above zero.");
  const [outKind, inKind] = PAIRS[input.pair];
  const pairId = crypto.randomUUID();
  const toBatchId = await batchAtLocation(tx, {
    hospitalId: input.hospitalId,
    location: input.to,
    productId: input.batch.productId,
    batchNumber: input.batch.batchNumber,
    expiry: input.batch.expiry,
    monthOnly: input.batch.expiryMonthOnly,
    actorUserId: input.actorUserId,
  });
  const sourceKind = input.pair;
  const common = {
    hospitalId: input.hospitalId,
    sourceKind,
    sourceId: input.sourceId,
    actorUserId: input.actorUserId,
    effectiveAt: input.effectiveAt,
    pairId,
    reasonCode: input.reasonCode ?? null,
    reasonNote: input.reasonNote ?? null,
    witnessAttestationId: input.witnessAttestationId ?? null,
  } as const;
  const outId = await move(tx, {
    ...common,
    location: input.from,
    batchId: input.batch.id,
    kind: outKind,
    quantity: -input.quantity,
  });
  const inId = await move(tx, {
    ...common,
    location: input.to,
    batchId: toBatchId,
    kind: inKind,
    quantity: input.quantity,
  });
  return { pairId, outId, inId, toBatchId };
}

/** The current balance of every batch at a location (the sum of its ledger, Law 2). */
export async function balancesAt(tx: EmrTx | EmrDb, locationId: string) {
  const rows = await tx
    .select({
      batchId: pharmacyStockMovements.batchId,
      balance: sql<number>`coalesce(sum(${pharmacyStockMovements.quantity}), 0)::int`,
    })
    .from(pharmacyStockMovements)
    .where(
      sql`coalesce(${pharmacyStockMovements.locationId}, ${pharmacyStockMovements.dispensingPointId}) = ${locationId}::uuid`,
    )
    .groupBy(pharmacyStockMovements.batchId);
  return new Map(rows.map((r) => [r.batchId, Number(r.balance)]));
}

/** Phase 1's need for a Store action: the permission, at no point (the location is checked by the action). */
export const storeNeed = (permission: PharmacyNeed["permission"]): PharmacyNeed => ({
  permission,
  point: "none",
});

/**
 * A ward's or cart's person writing (a ward count, a receipt, a requisition, a cart confirmation): no pharmacy
 * actor, only the hub-assignment right at that location, checked inside the transaction (Appendix A).
 */
export async function withLocationRight<T>(
  who: { userId: string; hospitalId: string },
  locationId: string,
  right: "ward_act" | "ward_confirm" | "cart_confirm",
  fn: (tx: EmrTx, location: StockLocation, now: Date) => Promise<T>,
  options?: { database?: EmrDb; now?: Date },
): Promise<T> {
  return asClinicalWriter(
    who,
    async (tx) => {
      const location = await loadLocation(tx, who.hospitalId, locationId);
      if (!(await hasLocationRight(tx, who.userId, locationId, right)))
        throw fail("forbidden", "You are not in charge of this place.");
      return fn(tx, location, options?.now ?? new Date());
    },
    options?.database,
  );
}

export type { PharmacyCtx };
