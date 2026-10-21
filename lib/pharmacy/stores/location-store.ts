import type { Condition } from "./readiness-stores";
import type { StockLocation } from "./write";
import type { Verifier } from "@/lib/auth/attest";
import type { EmrTx } from "@/lib/emr/db";
import type { PharmacyCtx } from "@/lib/pharmacy/write";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import { COUNT_DIFFERENCE_REASONS } from "@/content/pharmacy-stock";
import { STORE } from "@/content/pharmacy-stores-store";
import { staffAffiliations } from "@/db/schema/clinician-profiles";
import { hospitalDepartments } from "@/db/schema/hospital-departments";
import { hospitalWards } from "@/db/schema/hospital-wards";
import { wardInChargeAssignments } from "@/db/schema/nurse-workspace";
import {
  pharmacyAttestations,
  pharmacyBatches,
  pharmacyCountLines,
  pharmacyCounts,
  pharmacyProducts,
  pharmacyStockMovements,
} from "@/db/schema/pharmacy-dispensing";
import {
  pharmacyCounterparties,
  pharmacyLocationGolive,
  pharmacyLocationPacks,
  pharmacyLocations,
  pharmacyProductLocations,
} from "@/db/schema/pharmacy-stores";
import {
  downtimeLocationDrills,
  pharmacyLocationBriefings,
} from "@/db/schema/pharmacy-stores-0182";
import { crashCarts } from "@/db/schema/prescribing";
import { cadres } from "@/db/schema/reference-data";
import { userRoles } from "@/db/schema/user-roles";
import { attestSecondPerson } from "@/lib/auth/attest";
import { attestationStands } from "@/lib/pharmacy/controlled";
import { controlledMedicineIds } from "@/lib/pharmacy/controlled-read";
import { isExpired, localDate } from "@/lib/pharmacy/stock/ledger";
import { parseExpiry } from "@/lib/pharmacy/stock/store";
import { drugById } from "@/lib/prescribing/formulary";
import { locationConditions } from "./readiness-stores";
import { parseGs1 } from "./scan";
import {
  balancesAt,
  batchAtLocation,
  batchRef,
  fail,
  hasLocationRight,
  loadLocation,
  locationLive,
  move,
  requireAttestation,
  requireLive,
} from "./write";

/**
 * Places, suppliers, store counts and going live per location (Pharmacy Phase 2, 5.1, 5.12, LC-1, LC-2, SC-3,
 * GL2-1; Section 8 createLocation, setLocationInCharge, setWardSupplyModel, saveCounterparty, setGtin, recordCount,
 * switchLocationOn/Off). Each pharmacy write is `(ctx, input) => { id }` for `runPharmacyWrite`; the go-live writes
 * take the hospital admin's transaction, as Phase 1's go-live does. A client key becomes the id of the row a write
 * creates, so a retried request finds its own row.
 */

const key = z.uuid();
const text = (min: number, max: number) => z.string().trim().min(min).max(max);
const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((s) => (s ? s : null));

/** An expiry as a day or the month the pack gives (Phase 1's parser). */
export const expiryField = z.string().transform((s, c) => {
  const e = parseExpiry(s);
  if (!e) c.addIssue({ code: "custom", message: "Give the expiry as YYYY-MM or YYYY-MM-DD." });
  return e ?? { expiry: "", monthOnly: false };
});

/* ─── Shared: replays, controlled products and their witness ───────────── */

/** A retried request: the row its client key created at this hospital. */
export async function replayedRow(
  tx: EmrTx,
  table: "pharmacy_locations" | "pharmacy_counterparties" | "pharmacy_counts",
  id: string,
  hospitalId: string,
): Promise<boolean> {
  const rows = (await tx.execute(
    sql`SELECT hospital_id FROM ${sql.identifier(table)} WHERE id = ${id}::uuid`,
  )) as unknown as { hospital_id: string }[] | { rows: { hospital_id: string }[] };
  const list = Array.isArray(rows) ? rows : rows.rows;
  if (!list[0]) return false;
  if (list[0].hospital_id !== hospitalId)
    throw fail("conflict", "That request key is already in use.");
  return true;
}

/** CD-1: the controlled medicines at this hospital (flagged at prescribing, or signed here). */
export async function controlledSet(tx: EmrTx, hospitalId: string) {
  const signed = await controlledMedicineIds(tx, hospitalId);
  return (medicineId: string) => signed.has(medicineId) || !!drugById(medicineId)?.flags.controlled;
}

/**
 * CD-5, IS-6: a controlled product moves only by a holder of `pharmacy.controlled`, with a standing witness
 * attestation (passed, by someone else, for this actor, under 30 minutes old). Null for anything else.
 */
export async function storeWitness(
  ctx: PharmacyCtx,
  controlled: boolean,
  attestationId: string | null | undefined,
): Promise<string | null> {
  if (!controlled) return null;
  if (!ctx.actor.access.permissions.has("pharmacy.controlled"))
    throw fail(
      "forbidden",
      "Only a holder of the controlled drugs permission can move a controlled drug.",
    );
  if (!attestationId)
    throw fail(
      "config",
      "A controlled drug moves only with a witness. The witness confirms first.",
    );
  const [a] = await ctx.tx
    .select()
    .from(pharmacyAttestations)
    .where(eq(pharmacyAttestations.id, attestationId));
  if (
    !attestationStands({
      attestation: a ?? null,
      actorUserId: ctx.actor.userId,
      hospitalId: ctx.actor.hospitalId,
      now: ctx.now,
    })
  )
    throw fail("conflict", "The witness has to confirm again, with their password and code.");
  return attestationId;
}

/** A product of this hospital, active. */
export async function productAt(tx: EmrTx, hospitalId: string, productId: string) {
  const [p] = await tx
    .select()
    .from(pharmacyProducts)
    .where(and(eq(pharmacyProducts.id, productId), eq(pharmacyProducts.hospitalId, hospitalId)));
  if (!p) throw fail("not_found", "That product is not set up at this hospital.");
  if (!p.active) throw fail("conflict", "That product has been ended.");
  return p;
}

/** A location the pharmacy keeps (store, point, quarantine), as opposed to a ward or cart. */
export const isPharmacyPlace = (l: Pick<StockLocation, "kind">) =>
  l.kind === "store" || l.kind === "dispensing_point" || l.kind === "quarantine";

/** The hospital's quarantine for stock received at a place: one under the same unit first, else the hospital's. */
export async function quarantineFor(
  tx: EmrTx,
  hospitalId: string,
  near: Pick<StockLocation, "departmentId"> | null,
): Promise<StockLocation | null> {
  const rows = await tx
    .select({ id: pharmacyLocations.id, departmentId: pharmacyLocations.departmentId })
    .from(pharmacyLocations)
    .where(
      and(
        eq(pharmacyLocations.hospitalId, hospitalId),
        eq(pharmacyLocations.kind, "quarantine"),
        isNull(pharmacyLocations.archivedAt),
      ),
    )
    .orderBy(pharmacyLocations.createdAt);
  const pick =
    rows.find((r) => near?.departmentId && r.departmentId === near.departmentId) ??
    rows.find((r) => r.departmentId === null) ??
    rows[0];
  return pick ? loadLocation(tx, hospitalId, pick.id) : null;
}

/* ─── Places (LC-1, D-PH2-05) ─────────────────────────────────────────── */

export const CreateLocationInput = z
  .object({
    clientKey: key,
    kind: z.enum(["store", "ward", "cart", "quarantine"], { message: "Choose the kind of place." }),
    name: text(1, 120),
    departmentId: z.uuid().nullish(),
    wardId: z.uuid().nullish(),
    crashCartId: z.uuid().nullish(),
    wardSupplyModel: z.enum(["stocked", "issue_only"]).nullish(),
    anyNurseConfirms: z.boolean().optional(),
  })
  .refine((v) => v.kind !== "store" || !!v.departmentId, {
    message: "A store belongs to a hub unit. Choose it.",
    path: ["departmentId"],
  })
  .refine((v) => v.kind !== "ward" || !!v.wardId, { message: "Choose the ward.", path: ["wardId"] })
  .refine((v) => v.kind !== "cart" || !!v.crashCartId, {
    message: "Choose the emergency cart.",
    path: ["crashCartId"],
  });

/**
 * LC-1, 0180's hub rules: a store is a hub unit; a ward is a hub ward (stocked or issue-only, nothing defaults);
 * a cart names its crash cart; quarantine is one per hospital, or one per unit. Dispensing points are Phase 1's,
 * made on the hub, and copied in by 0180's trigger, so they are never created here.
 */
export async function createLocation(ctx: PharmacyCtx, input: z.infer<typeof CreateLocationInput>) {
  const h = ctx.actor.hospitalId;
  if (await replayedRow(ctx.tx, "pharmacy_locations", input.clientKey, h))
    return { id: input.clientKey };
  let departmentId = input.departmentId ?? null;
  if (departmentId) {
    const [d] = await ctx.tx
      .select({ id: hospitalDepartments.id })
      .from(hospitalDepartments)
      .where(
        and(
          eq(hospitalDepartments.id, departmentId),
          eq(hospitalDepartments.hospitalId, h),
          isNull(hospitalDepartments.archivedAt),
        ),
      );
    if (!d) throw fail("not_found", "That unit is not on this hospital's hub.");
  }
  if (input.kind === "ward") {
    const [w] = await ctx.tx
      .select({ departmentId: hospitalWards.departmentId })
      .from(hospitalWards)
      .where(and(eq(hospitalWards.id, input.wardId!), eq(hospitalWards.hospitalId, h)));
    if (!w) throw fail("not_found", "That ward is not on this hospital's hub.");
    departmentId = w.departmentId;
  }
  if (input.kind === "cart") {
    const [c] = await ctx.tx
      .select({ departmentId: crashCarts.departmentId })
      .from(crashCarts)
      .where(and(eq(crashCarts.id, input.crashCartId!), eq(crashCarts.hospitalId, h)));
    if (!c) throw fail("not_found", "That emergency cart is not at this hospital.");
    departmentId = c.departmentId;
  }
  if (input.kind === "quarantine") {
    const [dup] = await ctx.tx
      .select({ id: pharmacyLocations.id })
      .from(pharmacyLocations)
      .where(
        and(
          eq(pharmacyLocations.hospitalId, h),
          eq(pharmacyLocations.kind, "quarantine"),
          isNull(pharmacyLocations.archivedAt),
          departmentId
            ? eq(pharmacyLocations.departmentId, departmentId)
            : isNull(pharmacyLocations.departmentId),
        ),
      );
    if (dup) throw fail("conflict", "There is already a quarantine here.");
  }
  try {
    const [row] = await ctx.tx
      .insert(pharmacyLocations)
      .values({
        id: input.clientKey,
        hospitalId: h,
        kind: input.kind,
        name: input.name,
        departmentId,
        wardId: input.kind === "ward" ? input.wardId! : null,
        crashCartId: input.kind === "cart" ? input.crashCartId! : null,
        wardSupplyModel: input.kind === "ward" ? (input.wardSupplyModel ?? null) : null,
        anyNurseConfirms: input.kind === "ward" ? !!input.anyNurseConfirms : false,
        createdBy: ctx.actor.userId,
        createdAt: ctx.now,
      })
      .returning({ id: pharmacyLocations.id });
    return { id: row!.id };
  } catch (e) {
    if (/pl_one_(ward|cart)/.test(String(e) + String((e as { cause?: unknown }).cause ?? "")))
      throw fail("conflict", "That ward or cart is already a place.");
    throw e;
  }
}

export const InChargeInput = z.object({ locationId: z.uuid(), userId: z.uuid().nullable() });

/**
 * The person in charge of a place. At a store, point or quarantine: pharmacy staff of this hospital. At a ward
 * or cart: someone the hub already names there (ward in-charge, unit head), never chosen freely (Appendix A).
 */
export async function setLocationInCharge(ctx: PharmacyCtx, input: z.infer<typeof InChargeInput>) {
  const l = await loadLocation(ctx.tx, ctx.actor.hospitalId, input.locationId);
  if (input.userId) {
    if (l.kind === "ward" || l.kind === "cart") {
      const right = l.kind === "ward" ? "ward_act" : "cart_confirm";
      if (!(await hasLocationRight(ctx.tx, input.userId, l.id, right)))
        throw fail("forbidden", "That person is not in charge of this place on the hub.");
    } else {
      const [s] = await ctx.tx
        .select({ id: staffAffiliations.id })
        .from(staffAffiliations)
        .innerJoin(cadres, eq(cadres.id, staffAffiliations.cadreId))
        .where(
          and(
            eq(staffAffiliations.userId, input.userId),
            eq(staffAffiliations.hospitalId, ctx.actor.hospitalId),
            inArray(staffAffiliations.state, ["approved", "active"]),
            inArray(cadres.code, ["PHARMACIST", "PHARMACY_TECH"]),
          ),
        );
      if (!s)
        throw fail("forbidden", "Only pharmacy staff of this hospital can be in charge here.");
    }
  }
  await ctx.tx
    .update(pharmacyLocations)
    .set({ inChargeUserId: input.userId })
    .where(eq(pharmacyLocations.id, l.id));
  return { id: l.id };
}

export const SupplyModelInput = z.object({
  locationId: z.uuid(),
  model: z.enum(["stocked", "issue_only"]),
});

/** D-PH2-05: how a ward is supplied, set per ward. It does not change once stock has moved there. */
export async function setWardSupplyModel(
  ctx: PharmacyCtx,
  input: z.infer<typeof SupplyModelInput>,
) {
  const l = await loadLocation(ctx.tx, ctx.actor.hospitalId, input.locationId);
  if (l.kind !== "ward") throw fail("invalid", "Only a ward is stocked or issue only.");
  if (l.wardSupplyModel === input.model) return { id: l.id };
  const [moved] = await ctx.tx
    .select({ id: pharmacyStockMovements.id })
    .from(pharmacyStockMovements)
    .where(eq(pharmacyStockMovements.locationId, l.id))
    .limit(1);
  if (moved)
    throw fail("conflict", "Stock has moved on this ward, so how it is supplied stays as it is.");
  await ctx.tx
    .update(pharmacyLocations)
    .set({ wardSupplyModel: input.model })
    .where(eq(pharmacyLocations.id, l.id));
  return { id: l.id };
}

/* ─── Counterparties (LC-2) ───────────────────────────────────────────── */

export const CounterpartyInput = z.object({
  clientKey: key,
  /** Set to change an existing one. */
  id: z.uuid().nullish(),
  kind: z.enum(["supplier", "facility"]),
  name: text(2, 160),
  code: optional(40),
  takesReturns: z.boolean(),
  retired: z.boolean().optional(),
});

/** A supplier or another facility: a name, an optional code, whether it takes returns. Never a place. */
export async function saveCounterparty(ctx: PharmacyCtx, input: z.infer<typeof CounterpartyInput>) {
  const h = ctx.actor.hospitalId;
  const values = {
    kind: input.kind,
    name: input.name,
    code: input.code,
    takesReturns: input.takesReturns,
    retiredAt: input.retired ? ctx.now : null,
  };
  try {
    if (input.id) {
      const [row] = await ctx.tx
        .update(pharmacyCounterparties)
        .set(values)
        .where(
          and(eq(pharmacyCounterparties.id, input.id), eq(pharmacyCounterparties.hospitalId, h)),
        )
        .returning({ id: pharmacyCounterparties.id });
      if (!row) throw fail("not_found", "That supplier or facility is not at this hospital.");
      return { id: row.id };
    }
    if (await replayedRow(ctx.tx, "pharmacy_counterparties", input.clientKey, h))
      return { id: input.clientKey };
    const [row] = await ctx.tx
      .insert(pharmacyCounterparties)
      .values({
        id: input.clientKey,
        hospitalId: h,
        ...values,
        createdBy: ctx.actor.userId,
        createdAt: ctx.now,
      })
      .returning({ id: pharmacyCounterparties.id });
    return { id: row!.id };
  } catch (e) {
    if (/pcp_name/.test(String(e) + String((e as { cause?: unknown }).cause ?? "")))
      throw fail("conflict", "There is already one with that name.");
    throw e;
  }
}

/** A counterparty of this hospital, of a kind, not retired. */
export async function counterpartyOf(
  tx: EmrTx,
  hospitalId: string,
  id: string,
  kind: "supplier" | "facility",
) {
  const [c] = await tx
    .select()
    .from(pharmacyCounterparties)
    .where(
      and(
        eq(pharmacyCounterparties.id, id),
        eq(pharmacyCounterparties.hospitalId, hospitalId),
        eq(pharmacyCounterparties.kind, kind),
        isNull(pharmacyCounterparties.retiredAt),
      ),
    );
  if (!c)
    throw fail(
      "not_found",
      kind === "supplier" ? "Choose a supplier of this hospital." : "Choose a facility.",
    );
  return c;
}

/* ─── GTIN (SC-3) ─────────────────────────────────────────────────────── */

export const GtinInput = z.object({
  productId: z.uuid(),
  gtin: z
    .string()
    .trim()
    .regex(/^\d{14}$/, "A GTIN is 14 digits.")
    .refine((g) => parseGs1(`01${g}`).ok, "That GTIN's check digit is wrong."),
});

/** SC-3: the GTIN on a product, set the first time it is scanned. One active product per GTIN per hospital. */
export async function setGtin(ctx: PharmacyCtx, input: z.infer<typeof GtinInput>) {
  const p = await productAt(ctx.tx, ctx.actor.hospitalId, input.productId);
  if (p.gtin === input.gtin) return { id: p.id };
  const [other] = await ctx.tx
    .select({ name: pharmacyProducts.name })
    .from(pharmacyProducts)
    .where(
      and(
        eq(pharmacyProducts.hospitalId, ctx.actor.hospitalId),
        eq(pharmacyProducts.gtin, input.gtin),
        eq(pharmacyProducts.active, true),
      ),
    );
  if (other) throw fail("conflict", `This code is already linked to ${other.name}.`);
  await ctx.tx
    .update(pharmacyProducts)
    .set({ gtin: input.gtin, updatedAt: ctx.now })
    .where(eq(pharmacyProducts.id, p.id));
  return { id: p.id };
}

/* ─── Store counts (Law 5; Phase 1 SL-6 at a store or quarantine) ─────── */

const countReason = z.enum(
  Object.keys(COUNT_DIFFERENCE_REASONS) as [keyof typeof COUNT_DIFFERENCE_REASONS],
);
const counted = z.number().int().min(0).max(1_000_000);

export const StoreCountInput = z.discriminatedUnion("step", [
  z.object({
    step: z.literal("opening"),
    clientKey: key,
    locationId: z.uuid(),
    lines: z
      .array(
        z.object({
          productId: z.uuid(),
          batchNumber: text(1, 60),
          expiry: expiryField,
          counted,
        }),
      )
      .min(1)
      .max(500),
    witnessAttestationId: z.uuid().nullish(),
  }),
  z.object({
    step: z.literal("count"),
    clientKey: key,
    locationId: z.uuid(),
    lines: z.array(z.object({ batchId: z.uuid(), counted })).max(500),
    witnessAttestationId: z.uuid().nullish(),
  }),
  z.object({
    step: z.literal("reasons"),
    countId: z.uuid(),
    corrections: z
      .array(
        z
          .object({ batchId: z.uuid(), reasonCode: countReason, note: optional(500) })
          .refine((v) => v.reasonCode !== "other" || (v.note?.length ?? 0) >= 3, {
            message: "Say what happened.",
            path: ["note"],
          }),
      )
      .min(1)
      .max(500),
  }),
]);

export interface StoreCountLine {
  batchId: string;
  batchNumber: string;
  counted: number;
  recorded: number;
}

async function countLinesOf(tx: EmrTx, countId: string): Promise<StoreCountLine[]> {
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

/** The batches at a location with their medicine, locked as the guard locks them. */
async function batchesAt(tx: EmrTx, locationId: string) {
  return tx
    .select({
      id: pharmacyBatches.id,
      productId: pharmacyBatches.productId,
      batchNumber: pharmacyBatches.batchNumber,
      expiry: pharmacyBatches.expiry,
      expiryMonthOnly: pharmacyBatches.expiryMonthOnly,
      medicineId: pharmacyProducts.medicineId,
    })
    .from(pharmacyBatches)
    .innerJoin(pharmacyProducts, eq(pharmacyProducts.id, pharmacyBatches.productId))
    .where(
      sql`coalesce(${pharmacyBatches.locationId}, ${pharmacyBatches.dispensingPointId}) = ${locationId}::uuid`,
    )
    .for("update", { of: pharmacyBatches });
}

/**
 * A count at a store or quarantine (Law 5, the Phase 1 blind rule). "opening": before a store goes live, every
 * product it holds is counted with its batch and expiry, and what was counted is entered as an `adjusted`
 * opening movement (5.12: the opening count is the store's go-live set-up, as Phase 1's points have). "count":
 * the typed figures are written with the balance read in this transaction, and only then returned beside it.
 * "reasons": each difference becomes a `count_correction` with its reason, once per batch. A controlled product
 * is counted with a witness, committed before its figure is shown.
 */
export async function recordStoreCount(ctx: PharmacyCtx, input: z.infer<typeof StoreCountInput>) {
  const h = ctx.actor.hospitalId;
  if (input.step === "reasons") return correctStoreCount(ctx, input);
  if (await replayedRow(ctx.tx, "pharmacy_counts", input.clientKey, h))
    return { id: input.clientKey, lines: await countLinesOf(ctx.tx, input.clientKey) };
  const l = await loadLocation(ctx.tx, h, input.locationId);
  if (l.kind !== "store" && l.kind !== "quarantine")
    throw fail(
      "invalid",
      "Count a dispensing point on its Stock page, and a ward or cart on its own page.",
    );
  const controlled = await controlledSet(ctx.tx, h);

  if (input.step === "opening") {
    if (l.kind !== "store") throw fail("invalid", "Only a store takes an opening count.");
    if (locationLive(l)) throw fail("conflict", `${l.name} is live. Count it with a normal count.`);
    const seen = new Set<string>();
    for (const line of input.lines) {
      const k = `${line.productId}|${line.batchNumber.toLowerCase()}`;
      if (seen.has(k)) throw fail("invalid", `Batch ${line.batchNumber} is on two lines.`);
      seen.add(k);
    }
    const products = await Promise.all(input.lines.map((x) => productAt(ctx.tx, h, x.productId)));
    const witness = await storeWitness(
      ctx,
      products.some((p) => controlled(p.medicineId)),
      input.witnessAttestationId,
    );
    const [count] = await ctx.tx
      .insert(pharmacyCounts)
      .values({
        id: input.clientKey,
        hospitalId: h,
        locationId: l.id,
        scope: "opening",
        countedBy: ctx.actor.userId,
        witnessAttestationId: witness,
        countedAt: ctx.now,
      })
      .returning({ id: pharmacyCounts.id });
    const balances = await balancesAt(ctx.tx, l.id);
    const lines: StoreCountLine[] = [];
    for (const line of input.lines) {
      const batchId = await batchAtLocation(ctx.tx, {
        hospitalId: h,
        location: l,
        productId: line.productId,
        batchNumber: line.batchNumber,
        expiry: line.expiry.expiry,
        monthOnly: line.expiry.monthOnly,
        actorUserId: ctx.actor.userId,
      });
      const recorded = balances.get(batchId) ?? 0;
      await ctx.tx.insert(pharmacyCountLines).values({
        countId: count!.id,
        batchId,
        countedQuantity: line.counted,
        recordedBalance: recorded,
      });
      if (line.counted !== recorded)
        await move(ctx.tx, {
          hospitalId: h,
          location: l,
          batchId,
          kind: "adjusted",
          quantity: line.counted - recorded,
          sourceKind: "opening",
          sourceId: count!.id,
          reasonCode: "opening",
          actorUserId: ctx.actor.userId,
          effectiveAt: ctx.now,
          witnessAttestationId: witness,
        });
      lines.push({
        batchId,
        batchNumber: line.batchNumber,
        counted: line.counted,
        recorded: line.counted,
      });
    }
    return { id: count!.id, lines };
  }

  requireLive(l);
  const all = await batchesAt(ctx.tx, l.id);
  const byId = new Map(all.map((b) => [b.id, b]));
  const typed = new Map(input.lines.map((x) => [x.batchId, x.counted]));
  if (typed.size !== input.lines.length) throw fail("invalid", "Each batch is counted once.");
  for (const id of typed.keys())
    if (!byId.has(id)) throw fail("not_found", `That batch is not at ${l.name}.`);
  const balances = await balancesAt(ctx.tx, l.id);
  const today = localDate(ctx.now);
  const missing = all.filter(
    (b) => !typed.has(b.id) && !(isExpired(b, today) && (balances.get(b.id) ?? 0) === 0),
  );
  if (missing.length)
    throw fail(
      "invalid",
      `Type a figure for every batch: ${missing.map((b) => b.batchNumber).join(", ")}.`,
    );
  const witness = await storeWitness(
    ctx,
    input.lines.some((x) => controlled(byId.get(x.batchId)!.medicineId)),
    input.witnessAttestationId,
  );
  const [count] = await ctx.tx
    .insert(pharmacyCounts)
    .values({
      id: input.clientKey,
      hospitalId: h,
      locationId: l.id,
      scope: "full",
      countedBy: ctx.actor.userId,
      witnessAttestationId: witness,
      countedAt: ctx.now,
    })
    .returning({ id: pharmacyCounts.id });
  if (input.lines.length)
    await ctx.tx.insert(pharmacyCountLines).values(
      input.lines.map((x) => ({
        countId: count!.id,
        batchId: x.batchId,
        countedQuantity: x.counted,
        recordedBalance: balances.get(x.batchId) ?? 0,
      })),
    );
  return {
    id: count!.id,
    lines: input.lines.map(
      (x): StoreCountLine => ({
        batchId: x.batchId,
        batchNumber: byId.get(x.batchId)!.batchNumber,
        counted: x.counted,
        recorded: balances.get(x.batchId) ?? 0,
      }),
    ),
  };
}

async function correctStoreCount(
  ctx: PharmacyCtx,
  input: Extract<z.infer<typeof StoreCountInput>, { step: "reasons" }>,
) {
  await ctx.tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtext(${`pharmacy-count:${input.countId}`}))`,
  );
  const [count] = await ctx.tx
    .select({
      id: pharmacyCounts.id,
      locationId: pharmacyCounts.locationId,
      scope: pharmacyCounts.scope,
    })
    .from(pharmacyCounts)
    .where(
      and(
        eq(pharmacyCounts.id, input.countId),
        eq(pharmacyCounts.hospitalId, ctx.actor.hospitalId),
      ),
    );
  if (!count?.locationId || count.scope === "opening")
    throw fail("not_found", "That count is not a store count.");
  const l = await loadLocation(ctx.tx, ctx.actor.hospitalId, count.locationId);
  requireLive(l);
  const lines = new Map((await countLinesOf(ctx.tx, count.id)).map((x) => [x.batchId, x]));
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
    if (line.counted === line.recorded) throw fail("invalid", STORE.count.matched(line.counted));
    if (done.has(c.batchId)) continue;
    await batchRef(ctx.tx, ctx.actor.hospitalId, c.batchId, l.id);
    await move(ctx.tx, {
      hospitalId: ctx.actor.hospitalId,
      location: l,
      batchId: c.batchId,
      kind: "count_correction",
      quantity: line.counted - line.recorded,
      sourceKind: "count",
      sourceId: count.id,
      reasonCode: c.reasonCode,
      reasonNote: c.note,
      actorUserId: ctx.actor.userId,
      effectiveAt: ctx.now,
    });
    done.add(c.batchId);
  }
  return { id: count.id };
}

/* ─── Going live per location (5.12, GL2-1; the hospital admin's page) ── */

export type Admin = { userId: string; hospitalId: string };

/** GL2-1: a location's conditions, each with its evidence, read from records (no movement, no patient). */
export async function locationReadiness(
  tx: EmrTx,
  hospitalId: string,
  location: StockLocation,
): Promise<Condition[]> {
  const [products, counted, packs, briefing, drill, assigned] = await Promise.all([
    tx
      .select({ id: pharmacyProductLocations.productId })
      .from(pharmacyProductLocations)
      .where(
        and(
          eq(pharmacyProductLocations.locationId, location.id),
          eq(pharmacyProductLocations.active, true),
        ),
      ),
    tx
      .selectDistinct({ id: pharmacyBatches.productId })
      .from(pharmacyCountLines)
      .innerJoin(pharmacyCounts, eq(pharmacyCounts.id, pharmacyCountLines.countId))
      .innerJoin(pharmacyBatches, eq(pharmacyBatches.id, pharmacyCountLines.batchId))
      .where(eq(pharmacyCounts.locationId, location.id)),
    tx
      .select({ id: pharmacyLocationPacks.id })
      .from(pharmacyLocationPacks)
      .where(
        and(
          eq(pharmacyLocationPacks.locationId, location.id),
          eq(pharmacyLocationPacks.status, "signed"),
          eq(pharmacyLocationPacks.kind, location.kind === "cart" ? "cart_list" : "ward_levels"),
        ),
      ),
    tx
      .select({ at: pharmacyLocationBriefings.recordedAt })
      .from(pharmacyLocationBriefings)
      .where(
        and(
          eq(pharmacyLocationBriefings.hospitalId, hospitalId),
          eq(pharmacyLocationBriefings.locationId, location.id),
        ),
      )
      .orderBy(desc(pharmacyLocationBriefings.recordedAt))
      .limit(1),
    tx
      .select({
        at: downtimeLocationDrills.createdAt,
        includedDelivery: downtimeLocationDrills.includedDelivery,
        includedIssue: downtimeLocationDrills.includedIssue,
      })
      .from(downtimeLocationDrills)
      .where(
        and(
          eq(downtimeLocationDrills.hospitalId, hospitalId),
          eq(downtimeLocationDrills.workspace, "pharmacy"),
          eq(downtimeLocationDrills.locationId, location.id),
        ),
      )
      .orderBy(
        desc(downtimeLocationDrills.includedDelivery),
        desc(downtimeLocationDrills.includedIssue),
        desc(downtimeLocationDrills.createdAt),
      )
      .limit(1),
    location.kind === "ward" && location.wardId
      ? tx
          .select({ userId: wardInChargeAssignments.nurseUserId })
          .from(wardInChargeAssignments)
          .where(
            and(
              eq(wardInChargeAssignments.wardId, location.wardId),
              sql`${wardInChargeAssignments.startsAt} <= now()`,
              sql`(${wardInChargeAssignments.endsAt} IS NULL OR ${wardInChargeAssignments.endsAt} > now())`,
            ),
          )
          .limit(1)
      : Promise.resolve([] as { userId: string }[]),
  ]);
  return locationConditions({
    kind: location.kind,
    model: location.wardSupplyModel,
    name: location.name,
    productIds: products.map((p) => p.id),
    openingCounted: new Set(counted.map((c) => c.id)),
    packSigned: packs.length > 0,
    inChargeUserId: location.inChargeUserId ?? assigned[0]?.userId ?? null,
    briefedAt: briefing[0]?.at ?? null,
    drill: drill[0]
      ? {
          at: drill[0].at,
          includedDelivery: drill[0].includedDelivery,
          includedIssue: drill[0].includedIssue,
        }
      : null,
  });
}

async function isHospitalAdmin(tx: EmrTx, userId: string, hospitalId: string) {
  const [r] = await tx
    .select({ id: userRoles.id })
    .from(userRoles)
    .where(
      and(
        eq(userRoles.userId, userId),
        eq(userRoles.hospitalId, hospitalId),
        eq(userRoles.role, "hospital_admin"),
      ),
    );
  return !!r;
}

export const ApproverInput = z.object({
  approverUserId: z.uuid({ message: "Choose the second admin." }),
  // Never logged, stored or returned (D-PH1-42).
  password: z.string().min(1, "The second admin types their password.").max(200),
  code: z
    .string()
    .transform((s) => s.replace(/\s/g, ""))
    .pipe(z.string().regex(/^\d{6}$/, "The second admin types the 6-digit code.")),
});

/**
 * D-PH2-23: the second approver is another hospital admin, proved by their own password and code on this
 * screen. A failed try is recorded (and counts towards Phase 1's lock), so this never throws for a wrong password.
 */
export async function attestApprover(
  tx: EmrTx,
  admin: Admin,
  input: z.infer<typeof ApproverInput>,
  now: Date,
  verify?: Verifier,
): Promise<{ id: string; ok: boolean; words: string | null }> {
  if (input.approverUserId === admin.userId)
    throw fail("forbidden", "You made this request: a second hospital admin approves it.");
  if (!(await isHospitalAdmin(tx, input.approverUserId, admin.hospitalId)))
    throw fail("forbidden", "That person is not a hospital admin here.");
  const r = await attestSecondPerson(
    {
      hospitalId: admin.hospitalId,
      actorUserId: admin.userId,
      witnessUserId: input.approverUserId,
      password: input.password,
      code: input.code,
      purpose: "signer",
      action: "location_golive",
    },
    { tx, now, ...(verify ? { verify } : {}) },
  );
  return { id: r.attestationId, ok: r.ok, words: r.ok ? null : r.words };
}

export const SwitchLocationInput = z
  .object({
    locationId: z.uuid(),
    action: z.enum(["on", "off"]),
    reason: optional(500),
    approvalAttestationId: z.uuid(),
  })
  .refine((v) => v.action === "on" || (v.reason?.length ?? 0) >= 10, {
    message: "Say in a sentence why the place is switched off.",
    path: ["reason"],
  });

/**
 * GL2-1, 5.12: a store, ward, cart or quarantine switched on (every condition met) or off (with a reason), with
 * a second hospital admin (approved_by ≠ requested_by, 0180). 0180's trigger stamps the location in the same
 * transaction. A dispensing point goes live on its own Phase 1 page; an issue-only ward needs none.
 */
export async function switchLocation(
  tx: EmrTx,
  admin: Admin,
  input: z.infer<typeof SwitchLocationInput>,
  now: Date,
) {
  const l = await loadLocation(tx, admin.hospitalId, input.locationId);
  if (l.kind === "dispensing_point")
    throw fail("invalid", "A dispensing point goes live on its own page.");
  if (l.kind === "ward" && l.wardSupplyModel === "issue_only")
    throw fail("invalid", "An issue-only ward needs no switch of its own.");
  const approver = await requireAttestation(tx, {
    id: input.approvalAttestationId,
    hospitalId: admin.hospitalId,
    actorUserId: admin.userId,
    now,
  });
  if (!(await isHospitalAdmin(tx, approver, admin.hospitalId)))
    throw fail("forbidden", "The second approver must be a hospital admin here.");
  const conditions = await locationReadiness(tx, admin.hospitalId, l);
  const live = l.liveAt !== null && l.switchedOffAt === null;
  if (input.action === "on") {
    if (live) throw fail("conflict", `${l.name} is already live.`);
    if (conditions.some((c) => !c.met))
      throw fail("conflict", "Every condition must be met first. See the list.");
  } else if (!live) throw fail("conflict", `${l.name} is not live.`);
  const [row] = await tx
    .insert(pharmacyLocationGolive)
    .values({
      hospitalId: admin.hospitalId,
      locationId: l.id,
      action: input.action,
      conditions: { conditions },
      reason: input.action === "off" ? input.reason : null,
      requestedBy: admin.userId,
      approvedBy: approver,
      approvalAttestationId: input.approvalAttestationId,
      at: now,
    })
    .returning({ id: pharmacyLocationGolive.id });
  return row!.id;
}

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Give the date as YYYY-MM-DD.");

export const LocationBriefingInput = z.object({
  locationId: z.uuid(),
  heldOn: day,
  notes: optional(1000),
});

/** 5.12 "its people briefed": a briefing on this place, recorded after it is held. */
export async function recordLocationBriefing(
  tx: EmrTx,
  admin: Admin,
  input: z.infer<typeof LocationBriefingInput>,
  now: Date,
) {
  if (input.heldOn > localDate(now))
    throw fail("invalid", "A briefing is recorded after it is held.");
  const l = await loadLocation(tx, admin.hospitalId, input.locationId);
  const [row] = await tx
    .insert(pharmacyLocationBriefings)
    .values({
      hospitalId: admin.hospitalId,
      locationId: l.id,
      audience: "pharmacy",
      heldOn: input.heldOn,
      notes: input.notes,
      recordedBy: admin.userId,
      recordedAt: now,
    })
    .returning({ id: pharmacyLocationBriefings.id });
  return row!.id;
}

export const LocationDrillInput = z.object({
  locationId: z.uuid(),
  heldOn: day,
  participants: text(2, 500),
  whatWasDone: text(3, 1000),
  problems: optional(1000),
  includedDelivery: z.boolean(),
  includedIssue: z.boolean(),
});

/** 5.12: the store's downtime drill, with whether it included a delivery and an issue on paper. */
export async function recordLocationDrill(
  tx: EmrTx,
  admin: Admin,
  input: z.infer<typeof LocationDrillInput>,
  now: Date,
) {
  if (input.heldOn > localDate(now)) throw fail("invalid", "A drill is recorded after it is held.");
  const l = await loadLocation(tx, admin.hospitalId, input.locationId);
  const [row] = await tx
    .insert(downtimeLocationDrills)
    .values({
      hospitalId: admin.hospitalId,
      heldOn: input.heldOn,
      participants: input.participants,
      whatWasDone: input.whatWasDone,
      problems: input.problems,
      recordedBy: admin.userId,
      createdAt: now,
      workspace: "pharmacy",
      locationId: l.id,
      includedDelivery: input.includedDelivery,
      includedIssue: input.includedIssue,
    })
    .returning({ id: downtimeLocationDrills.id });
  return row!.id;
}

/** The hospital's places for the go-live page, with their conditions. No movement and no patient is read. */
export async function locationsForGoLive(
  tx: EmrTx,
  hospitalId: string,
  kinds: readonly StockLocation["kind"][],
) {
  if (!kinds.length) return [];
  const rows = await tx
    .select({ id: pharmacyLocations.id })
    .from(pharmacyLocations)
    .where(
      and(
        eq(pharmacyLocations.hospitalId, hospitalId),
        inArray(pharmacyLocations.kind, [...kinds]),
        isNull(pharmacyLocations.archivedAt),
      ),
    )
    .orderBy(pharmacyLocations.kind, pharmacyLocations.name);
  const out = [];
  for (const r of rows) {
    const location = await loadLocation(tx, hospitalId, r.id);
    out.push({ location, conditions: await locationReadiness(tx, hospitalId, location) });
  }
  return out;
}

/** The other hospital admins who may approve (names only). */
export async function otherAdmins(tx: EmrTx, hospitalId: string, userId: string) {
  const rows = (await tx.execute(
    sql`SELECT ur.user_id AS "userId", coalesce(u.full_name, 'Hospital admin') AS name
          FROM public.user_roles ur LEFT JOIN public.users u ON u.id = ur.user_id
         WHERE ur.hospital_id = ${hospitalId}::uuid AND ur.role = 'hospital_admin' AND ur.user_id <> ${userId}::uuid
         ORDER BY 2`,
  )) as unknown as
    | { userId: string; name: string }[]
    | { rows: { userId: string; name: string }[] };
  return Array.isArray(rows) ? rows : rows.rows;
}
