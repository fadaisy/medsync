import type { StockLocation } from "./write";
import type { Verifier } from "@/lib/auth/attest";
import type { EmrTx } from "@/lib/emr/db";
import type { PharmacyCtx } from "@/lib/pharmacy/write";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { COUNT_DIFFERENCE_REASONS } from "@/content/pharmacy-stock";
import { RECEIPT_DIFFERENCE_REASONS, RETURN_REASONS, WARDS } from "@/content/pharmacy-stores-wards";
import {
  pharmacyBatches,
  pharmacyCountLines,
  pharmacyCounts,
  pharmacyProducts,
  pharmacyStockMovements,
} from "@/db/schema";
import {
  pharmacyIssues,
  pharmacyLocationPacks,
  pharmacyLocations,
  pharmacyRequisitionLines,
  pharmacyRequisitions,
} from "@/db/schema/pharmacy-stores";
import { attestSecondPerson } from "@/lib/auth/attest";
import { isControlledMedicine } from "@/lib/pharmacy/controlled-read";
import { returnRoute } from "./issue";
import { confirmIssue } from "./issue-store";
import { allows, mayBeCounted } from "./locations";
import { ALLOCATED_NOTE, allocationRuleSigned } from "./ward-read";
import { wardCountMovements } from "./ward-stock";
import {
  balancesAt,
  batchRef,
  fail,
  hasLocationRight,
  loadLocation,
  move,
  movePair,
  placeAt,
  requireLive,
} from "./write";

/**
 * Ward stock and ward-side issues (Pharmacy Phase 2, 5.3 ward side, 5.4, 6.8: WS-1 to WS-3, IS-3, IS-5;
 * D-PH2-04 to D-PH2-07, D-PH2-21, D-PH2-22). Pure of Next.js: the pharmacy actions run these through
 * `runPharmacyWrite` (a permission), the nurse actions through `withLocationRight` (a hub right); both
 * hand in the same `Who`. Ward use is written only by a count (SL-15); doses never enter a figure (Law 4).
 */

export interface Who {
  tx: EmrTx;
  hospitalId: string;
  userId: string;
  now: Date;
}
export const whoOf = (ctx: PharmacyCtx): Who => ({
  tx: ctx.tx,
  hospitalId: ctx.actor.hospitalId,
  userId: ctx.actor.userId,
  now: ctx.now,
});

const uuid = z.uuid();
const qty = z.number().int().min(0).max(1_000_000);
const note = z.string().trim().max(500).nullable().optional();
const rowsOf = <T>(r: unknown): T[] =>
  Array.isArray(r) ? (r as T[]) : ((r as { rows: T[] }).rows ?? []);

async function lockPlace(tx: EmrTx, hospitalId: string, id: string, kind: "ward" | "cart") {
  const l = await loadLocation(tx, hospitalId, id);
  if (l.kind !== kind) throw fail("not_found", "That place is not a " + kind + ".");
  return l;
}

/* ─── Ward settings (D-PH2-04, D-PH2-05) ──────────────────────────────── */

export const WardSupplyInput = z.object({
  locationId: uuid,
  supplyModel: z.enum(["stocked", "issue_only"]),
  anyNurseConfirms: z.boolean(),
});

/** D-PH2-04, D-PH2-05: the ward's supply model and who confirms receipt. A ward holding stock stays stocked. */
export async function setWardSupplyModel(who: Who, input: z.infer<typeof WardSupplyInput>) {
  const l = await lockPlace(who.tx, who.hospitalId, input.locationId, "ward");
  if (input.supplyModel === "issue_only" && l.wardSupplyModel !== "issue_only") {
    const held = [...(await balancesAt(who.tx, l.id)).values()].reduce((s, n) => s + n, 0);
    if (held !== 0)
      throw fail(
        "conflict",
        "The ward still holds stock. Count it and return it before it becomes issue-only.",
      );
  }
  await who.tx
    .update(pharmacyLocations)
    .set({ wardSupplyModel: input.supplyModel, anyNurseConfirms: input.anyNurseConfirms })
    .where(eq(pharmacyLocations.id, l.id));
  return { id: l.id };
}

/* ─── Ward levels and cart lists (Appendix D, signed per location) ────── */

export const WardLevelsInput = z.object({
  locationId: uuid,
  levels: z
    .array(z.object({ productId: uuid, level: qty }))
    .min(1)
    .max(300),
});
export const CartListInput = z.object({
  locationId: uuid,
  items: z
    .array(z.object({ productId: uuid, quantity: qty }))
    .min(1)
    .max(200),
  checkIntervalDays: z.number().int().min(1).max(366),
  names: z.array(z.string().trim().min(1).max(48)).max(20),
});

async function saveDraft(
  who: Who,
  location: StockLocation,
  kind: "ward_levels" | "cart_list",
  content: Record<string, unknown>,
  productIds: readonly string[],
) {
  const found = await who.tx
    .select({ id: pharmacyProducts.id })
    .from(pharmacyProducts)
    .where(
      and(
        eq(pharmacyProducts.hospitalId, who.hospitalId),
        sql`${pharmacyProducts.id} IN (${sql.join(
          productIds.map((p) => sql`${p}::uuid`),
          sql`, `,
        )})`,
      ),
    );
  if (found.length !== new Set(productIds).size)
    throw fail("not_found", "A product is not at your hospital.");
  const [draft] = await who.tx
    .select({ id: pharmacyLocationPacks.id })
    .from(pharmacyLocationPacks)
    .where(
      and(
        eq(pharmacyLocationPacks.locationId, location.id),
        eq(pharmacyLocationPacks.kind, kind),
        eq(pharmacyLocationPacks.status, "draft"),
      ),
    )
    .for("update");
  let id: string;
  if (draft) {
    // A changed draft is signed afresh: the first signature, if any, is cleared.
    await who.tx
      .update(pharmacyLocationPacks)
      .set({ content, authoredBy: who.userId, firstSigner: null, firstSignerRole: null })
      .where(eq(pharmacyLocationPacks.id, draft.id));
    id = draft.id;
  } else {
    const [v] = rowsOf<{ v: number }>(
      await who.tx.execute(
        sql`SELECT coalesce(max(version), 0)::int + 1 AS v FROM public.pharmacy_location_packs
             WHERE location_id = ${location.id}::uuid AND kind = ${kind}`,
      ),
    );
    const [row] = await who.tx
      .insert(pharmacyLocationPacks)
      .values({
        hospitalId: who.hospitalId,
        locationId: location.id,
        kind,
        version: Number(v?.v ?? 1),
        content,
        authoredBy: who.userId,
      })
      .returning({ id: pharmacyLocationPacks.id });
    id = row!.id;
  }
  for (const p of productIds) await placeAt(who.tx, who.hospitalId, p, location.id);
  return { id };
}

/** 5.4 `setWardLevels`: a draft, by the pharmacy in charge. No figure is proposed (Law 6). */
export async function setWardLevels(who: Who, input: z.infer<typeof WardLevelsInput>) {
  const l = await lockPlace(who.tx, who.hospitalId, input.locationId, "ward");
  const levels = Object.fromEntries(input.levels.map((x) => [x.productId, x.level]));
  return saveDraft(who, l, "ward_levels", { levels }, Object.keys(levels));
}

/** 5.5 `setCartList`: the quantities, the check interval and the resus-desk names (D-PH2-21). */
export async function setCartList(who: Who, input: z.infer<typeof CartListInput>) {
  const l = await lockPlace(who.tx, who.hospitalId, input.locationId, "cart");
  const items = Object.fromEntries(input.items.map((x) => [x.productId, x.quantity]));
  const names = [...new Set(input.names.map((n) => n.trim()))];
  return saveDraft(
    who,
    l,
    "cart_list",
    { items, checkIntervalDays: input.checkIntervalDays, names },
    Object.keys(items),
  );
}

/* ─── Second factors (D-PH2-23: password and code, through pharmacy_attestations) ─ */

export const ATTEST_ROLES = ["pack_first", "pack_second", "cart_confirm", "receipt"] as const;
export type AttestRole = (typeof ATTEST_ROLES)[number];
export const AttestInput = z.object({
  clientKey: uuid,
  locationId: uuid,
  role: z.enum(ATTEST_ROLES),
  personUserId: uuid,
  // Never logged, stored or returned (D-PH1-42).
  password: z.string().min(1, "Type the password.").max(200),
  code: z
    .string()
    .transform((s) => s.replace(/\s/g, ""))
    .pipe(z.string().regex(/^\d{6}$/, "Type the 6-digit code.")),
});

/** Who may give each second factor at a place. `self` roles are the actor's own. */
const SELF: Record<AttestRole, boolean> = {
  pack_first: true,
  pack_second: false,
  cart_confirm: false,
  receipt: true,
};
async function rightFor(tx: EmrTx, role: AttestRole, location: StockLocation, userId: string) {
  if (role === "pack_first") return true; // the action's own permission (pharmacy.manage) stands for it
  if (role === "receipt") return hasLocationRight(tx, userId, location.id, "ward_confirm");
  if (role === "cart_confirm" || location.kind === "cart")
    return hasLocationRight(tx, userId, location.id, "cart_confirm");
  return hasLocationRight(tx, userId, location.id, "ward_act");
}

/**
 * A second factor at this place: the actor's own (first signer, receipt) or the right person's (the
 * ward's nurse in charge, the unit lead or nurse in charge). Every attempt is recorded, passed or not;
 * a failure is returned, not thrown, so its row commits and the lock counts it (H5).
 */
export async function attestAtPlace(
  who: Who,
  input: z.infer<typeof AttestInput>,
  allowed: readonly AttestRole[],
  verify?: Verifier,
) {
  if (!allowed.includes(input.role))
    throw fail("forbidden", "That confirmation is not asked for here.");
  const location = await loadLocation(who.tx, who.hospitalId, input.locationId);
  const self = SELF[input.role];
  if (self !== (input.personUserId === who.userId))
    throw fail(
      "forbidden",
      self ? "Type your own password and code." : "The second person types their own.",
    );
  if (!(await rightFor(who.tx, input.role, location, input.personUserId)))
    throw fail("forbidden", "That person cannot confirm here.");
  const r = await attestSecondPerson(
    {
      hospitalId: who.hospitalId,
      actorUserId: who.userId,
      witnessUserId: input.personUserId,
      password: input.password,
      code: input.code,
      purpose: "signer",
      action: `pharmacy_${input.role}`,
    },
    { tx: who.tx, now: who.now, ...(verify ? { verify } : {}) },
  );
  return { id: r.attestationId, ok: r.ok, words: r.ok ? null : r.words };
}

/** A passed signer attestation for this actor in the last 15 minutes: the actor's own, or another's. */
export async function attested(
  who: Who,
  id: string,
  self: boolean,
  action: `pharmacy_${AttestRole}`,
): Promise<string> {
  const [a] = rowsOf<{ attester: string | null }>(
    await who.tx.execute(
      sql`SELECT attester_user_id AS attester FROM public.pharmacy_attestations
           WHERE id = ${id}::uuid AND hospital_id = ${who.hospitalId}::uuid AND actor_user_id = ${who.userId}::uuid
             AND outcome = 'passed' AND purpose = 'signer' AND action = ${action}
             AND attested_at >= ${new Date(who.now.getTime() - 15 * 60_000).toISOString()}::timestamptz`,
    ),
  );
  if (!a?.attester || (a.attester === who.userId) !== self)
    throw fail("forbidden", "The second factor has to be given again.");
  return a.attester;
}

export const SIGN_EXCEPTION = WARDS.sign.exception;
export const SignPackInput = z.object({
  packId: uuid,
  firstAttestationId: uuid,
  secondAttestationId: uuid.nullable(),
  exception: z.boolean(),
});

/**
 * Appendix D, D-PH2-22: a ward levels pack is signed by the pharmacy in charge (first) and the ward's
 * nurse in charge; a cart list by the pharmacy in charge and the unit's clinical lead; each with a fresh
 * second factor, or the first alone with the exception "CSO signs alone (ADR 0281)". The signed version
 * it replaces is retired; a signed pack never changes.
 */
export async function signLocationPack(who: Who, input: z.infer<typeof SignPackInput>) {
  const [pack] = await who.tx
    .select()
    .from(pharmacyLocationPacks)
    .where(
      and(
        eq(pharmacyLocationPacks.id, input.packId),
        eq(pharmacyLocationPacks.hospitalId, who.hospitalId),
      ),
    )
    .for("update");
  if (!pack || pack.status !== "draft")
    throw fail("not_found", "That draft is not waiting to be signed.");
  const location = await loadLocation(who.tx, who.hospitalId, pack.locationId);
  const first = await attested(who, input.firstAttestationId, true, "pharmacy_pack_first");
  let second: string | null = null;
  if (!input.exception) {
    if (!input.secondAttestationId)
      throw fail("invalid", "The second signer confirms, or sign with the exception.");
    second = await attested(who, input.secondAttestationId, false, "pharmacy_pack_second");
    if (!(await rightFor(who.tx, "pack_second", location, second)))
      throw fail("forbidden", "The second signer is no longer in charge here.");
  }
  await who.tx
    .update(pharmacyLocationPacks)
    .set({ status: "retired", retiredAt: who.now })
    .where(
      and(
        eq(pharmacyLocationPacks.locationId, pack.locationId),
        eq(pharmacyLocationPacks.kind, pack.kind),
        eq(pharmacyLocationPacks.status, "signed"),
      ),
    );
  await who.tx
    .update(pharmacyLocationPacks)
    .set({
      status: "signed",
      firstSigner: first,
      firstSignerRole: "pharmacy_in_charge",
      secondSigner: second,
      secondSignerRole: second
        ? pack.kind === "ward_levels"
          ? "ward_nurse_in_charge"
          : "unit_clinical_lead"
        : null,
      exceptionText: input.exception ? SIGN_EXCEPTION : null,
      signedAt: who.now,
    })
    .where(eq(pharmacyLocationPacks.id, pack.id));
  return { id: pack.id };
}

/* ─── The ward count (WS-3, SL-15, SL-18, D-PH2-07) ───────────────────── */

const countReason = z.enum(
  Object.keys(COUNT_DIFFERENCE_REASONS) as [keyof typeof COUNT_DIFFERENCE_REASONS],
);
export const WardCountInput = z.discriminatedUnion("step", [
  z.object({
    step: z.literal("count"),
    clientKey: uuid,
    locationId: uuid,
    /** batchId null: one figure for the product (SL-18), allocated first expiry first. */
    lines: z
      .array(z.object({ productId: uuid, batchId: uuid.nullable(), counted: qty }))
      .min(1)
      .max(1000),
  }),
  z.object({
    step: z.literal("reasons"),
    countId: uuid,
    locationId: uuid,
    reasons: z
      .array(z.object({ batchId: uuid, reasonCode: countReason, note }))
      .min(1)
      .max(500)
      .refine((rs) => rs.every((r) => r.reasonCode !== "other" || !!r.note?.trim()), {
        message: "Say what happened.",
      }),
  }),
]);

export interface WardCountResult {
  id: string;
  products: { productId: string; name: string; used: number }[];
  /** Listed: "More on the ward than was issued" (WS-3), each waiting for the counter's reason. */
  surplus: { batchId: string; product: string; batchNumber: string; extra: number }[];
}

async function batchesAt(tx: EmrTx, locationId: string) {
  return tx
    .select({
      id: pharmacyBatches.id,
      productId: pharmacyBatches.productId,
      medicineId: pharmacyProducts.medicineId,
      productName: pharmacyProducts.name,
      batchNumber: pharmacyBatches.batchNumber,
      expiry: pharmacyBatches.expiry,
      expiryMonthOnly: pharmacyBatches.expiryMonthOnly,
    })
    .from(pharmacyBatches)
    .innerJoin(pharmacyProducts, eq(pharmacyProducts.id, pharmacyBatches.productId))
    .where(eq(pharmacyBatches.locationId, locationId))
    .for("update", { of: pharmacyBatches });
}

async function countResult(tx: EmrTx, countId: string): Promise<WardCountResult> {
  const lines = rowsOf<{
    batch_id: string;
    product_id: string;
    product: string;
    batch_number: string;
    counted: number;
    recorded: number;
  }>(
    await tx.execute(
      sql`SELECT l.batch_id, b.product_id, p.name AS product, b.batch_number, l.counted_quantity AS counted,
                 l.recorded_balance AS recorded
            FROM public.pharmacy_count_lines l JOIN public.pharmacy_batches b ON b.id = l.batch_id
            JOIN public.pharmacy_products p ON p.id = b.product_id WHERE l.count_id = ${countId}::uuid`,
    ),
  );
  const used = new Map<string, { productId: string; name: string; used: number }>();
  for (const l of lines) {
    const u = used.get(l.product_id) ?? { productId: l.product_id, name: l.product, used: 0 };
    u.used += Math.max(0, Number(l.recorded) - Number(l.counted));
    used.set(l.product_id, u);
  }
  return {
    id: countId,
    products: [...used.values()],
    surplus: lines
      .filter((l) => Number(l.counted) > Number(l.recorded))
      .map((l) => ({
        batchId: l.batch_id,
        product: l.product,
        batchNumber: l.batch_number,
        extra: Number(l.counted) - Number(l.recorded),
      })),
  };
}

const REFUSAL: Record<string, string> = {
  invalid_count: "A count is a whole number, zero or more.",
  no_batch: "Count this product batch by batch: its batches do not add up.",
  controlled_counted_per_batch: WARDS.count.controlledPerBatch,
  reason_needed: "Give a reason.",
};

/**
 * 5.4 Ward count, blind. Step "count": the typed figures are committed with the balance read in the same
 * transaction; a positive use writes `ward_used` (never `count_correction`), allocated first expiry first
 * when the ward keeps one figure per product. A figure higher than the ward could hold writes nothing yet
 * and is listed; step "reasons" then writes its `adjusted` with the counter's reason (WS-3). Afterwards the
 * ward's balance equals its count.
 */
export async function recordWardCount(who: Who, input: z.infer<typeof WardCountInput>) {
  const l = await lockPlace(who.tx, who.hospitalId, input.locationId, "ward");
  if (!mayBeCounted(l.kind, l.wardSupplyModel))
    throw fail("config", "An issue-only ward is not counted.");
  if (input.step === "reasons") return wardCountReasons(who, l, input);

  const [replay] = await who.tx
    .select({ h: pharmacyCounts.hospitalId, loc: pharmacyCounts.locationId })
    .from(pharmacyCounts)
    .where(eq(pharmacyCounts.id, input.clientKey));
  if (replay) {
    if (replay.h !== who.hospitalId || replay.loc !== l.id)
      throw fail("conflict", "That request key is already in use.");
    return countResult(who.tx, input.clientKey);
  }
  const perProduct = input.lines.some((x) => x.batchId === null);
  if (perProduct && !(await allocationRuleSigned(who.tx, who.hospitalId)))
    throw fail("config", WARDS.count.perProductRefused);

  const batches = await batchesAt(who.tx, l.id);
  const balances = await balancesAt(who.tx, l.id);
  const byProduct = new Map<string, typeof batches>();
  for (const b of batches) byProduct.set(b.productId, [...(byProduct.get(b.productId) ?? []), b]);
  const lines = new Map<string, { productId: string; batchId: string | null; counted: number }[]>();
  for (const x of input.lines) lines.set(x.productId, [...(lines.get(x.productId) ?? []), x]);

  const countLines: { batchId: string; counted: number; recorded: number; note: string | null }[] =
    [];
  const used: { batchId: string; quantity: number; allocated: boolean }[] = [];
  for (const [productId, typed] of lines) {
    const own = (byProduct.get(productId) ?? []).map((b) => ({ ...b, pointId: l.id }));
    if (!own.length) throw fail("not_found", "That product has no batch on this ward.");
    const one = typed.find((t) => t.batchId === null);
    if (one && typed.length > 1)
      throw fail("invalid", "Count a product either batch by batch or as one figure.");
    let count: Parameters<typeof wardCountMovements>[0]["count"];
    if (one) {
      count = {
        perProduct: one.counted,
        controlled: await isControlledMedicine(who.tx, who.hospitalId, own[0]!.medicineId),
      };
    } else {
      const per = new Map(typed.map((t) => [t.batchId!, t.counted]));
      if (per.size !== typed.length) throw fail("invalid", "Each batch is counted once.");
      for (const id of per.keys())
        if (!own.some((b) => b.id === id))
          throw fail("not_found", "That batch is not on this ward.");
      const missing = own.filter((b) => !per.has(b.id) && (balances.get(b.id) ?? 0) !== 0);
      if (missing.length)
        throw fail(
          "invalid",
          `Type a figure for every batch: ${missing.map((b) => b.batchNumber).join(", ")}.`,
        );
      count = { perBatch: per };
    }
    // The surplus's reason comes after the count is committed (blind); "pending" holds its place here.
    const r = wardCountMovements({ batches: own, balances, count, negativeReason: "pending" });
    if (!r.ok) throw fail("invalid", REFUSAL[r.reason] ?? "That count cannot be recorded.");
    const delta = new Map<string, number>();
    for (const m of r.movements) {
      delta.set(m.batchId, (delta.get(m.batchId) ?? 0) + m.quantity);
      if (m.kind === "ward_used")
        used.push({ batchId: m.batchId, quantity: m.quantity, allocated: m.allocated });
    }
    for (const b of own) {
      const recorded = balances.get(b.id) ?? 0;
      const typedHere = typed.find((t) => t.batchId === b.id);
      if (one)
        countLines.push({
          batchId: b.id,
          counted: recorded + (delta.get(b.id) ?? 0),
          recorded,
          note: ALLOCATED_NOTE,
        });
      else if (typedHere)
        countLines.push({ batchId: b.id, counted: typedHere.counted, recorded, note: null });
    }
  }
  if (used.length) requireLive(l);

  await who.tx.insert(pharmacyCounts).values({
    id: input.clientKey,
    hospitalId: who.hospitalId,
    locationId: l.id,
    scope: "ward",
    countedBy: who.userId,
    countedAt: who.now,
  });
  await who.tx.insert(pharmacyCountLines).values(
    countLines.map((c) => ({
      countId: input.clientKey,
      batchId: c.batchId,
      countedQuantity: c.counted,
      recordedBalance: c.recorded,
      differenceNote: c.note,
    })),
  );
  for (const u of used)
    await move(who.tx, {
      hospitalId: who.hospitalId,
      location: l,
      batchId: u.batchId,
      kind: "ward_used",
      quantity: u.quantity,
      allocated: u.allocated,
      sourceKind: "count",
      sourceId: input.clientKey,
      actorUserId: who.userId,
      effectiveAt: who.now,
    });
  return countResult(who.tx, input.clientKey);
}

async function wardCountReasons(
  who: Who,
  l: StockLocation,
  input: Extract<z.infer<typeof WardCountInput>, { step: "reasons" }>,
) {
  await who.tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtext(${`pharmacy-count:${input.countId}`}))`,
  );
  const [c] = await who.tx
    .select({ id: pharmacyCounts.id })
    .from(pharmacyCounts)
    .where(
      and(
        eq(pharmacyCounts.id, input.countId),
        eq(pharmacyCounts.hospitalId, who.hospitalId),
        eq(pharmacyCounts.locationId, l.id),
      ),
    );
  if (!c) throw fail("not_found", "That count is not on this ward.");
  const lines = await who.tx
    .select()
    .from(pharmacyCountLines)
    .where(eq(pharmacyCountLines.countId, c.id));
  const done = new Set(
    (
      await who.tx
        .select({ b: pharmacyStockMovements.batchId })
        .from(pharmacyStockMovements)
        .where(
          and(
            eq(pharmacyStockMovements.sourceKind, "count"),
            eq(pharmacyStockMovements.sourceId, c.id),
            eq(pharmacyStockMovements.kind, "adjusted"),
          ),
        )
    ).map((m) => m.b),
  );
  requireLive(l);
  for (const r of input.reasons) {
    const line = lines.find((x) => x.batchId === r.batchId);
    if (!line || line.countedQuantity <= line.recordedBalance)
      throw fail("invalid", "That batch did not find more than was issued.");
    if (done.has(r.batchId)) continue;
    await move(who.tx, {
      hospitalId: who.hospitalId,
      location: l,
      batchId: r.batchId,
      kind: "adjusted",
      quantity: line.countedQuantity - line.recordedBalance,
      allocated: line.differenceNote === ALLOCATED_NOTE,
      sourceKind: "count",
      sourceId: c.id,
      reasonCode: r.reasonCode,
      reasonNote: r.note ?? null,
      actorUserId: who.userId,
      effectiveAt: who.now,
    });
    done.add(r.batchId);
  }
  return countResult(who.tx, c.id);
}

/* ─── Requisitions from the ward (5.3, 5.4) ───────────────────────────── */

export const WardRequisitionInput = z.object({
  clientKey: uuid,
  locationId: uuid,
  issuingLocationId: uuid,
  lines: z
    .array(z.object({ productId: uuid, quantity: z.number().int().min(1).max(1_000_000) }))
    .min(1)
    .max(300),
});

/** 5.4 "Raise a requisition": the suggested top-ups as editable lines, sent to the issuer the person chose. */
export async function raiseWardRequisition(who: Who, input: z.infer<typeof WardRequisitionInput>) {
  const [done] = await who.tx
    .select({ h: pharmacyRequisitions.hospitalId })
    .from(pharmacyRequisitions)
    .where(eq(pharmacyRequisitions.id, input.clientKey));
  if (done) {
    if (done.h !== who.hospitalId) throw fail("conflict", "That request key is already in use.");
    return { id: input.clientKey };
  }
  const ward = await lockPlace(who.tx, who.hospitalId, input.locationId, "ward");
  const from = await loadLocation(who.tx, who.hospitalId, input.issuingLocationId);
  if (from.kind !== "store" && from.kind !== "dispensing_point")
    throw fail("invalid", "Ask the store or a dispensing point.");
  if (new Set(input.lines.map((x) => x.productId)).size !== input.lines.length)
    throw fail("invalid", "Each product is asked for once.");
  await who.tx.insert(pharmacyRequisitions).values({
    id: input.clientKey,
    hospitalId: who.hospitalId,
    requestingLocationId: ward.id,
    issuingLocationId: from.id,
    raisedBy: who.userId,
    raisedAt: who.now,
  });
  await who.tx.insert(pharmacyRequisitionLines).values(
    input.lines.map((x) => ({
      requisitionId: input.clientKey,
      productId: x.productId,
      quantityAsked: x.quantity,
    })),
  );
  return { id: input.clientKey };
}

/* ─── Receipt confirmed at the ward (IS-3, IS-6, D-PH2-04) ────────────── */

const receiptReason = z.enum(
  Object.keys(RECEIPT_DIFFERENCE_REASONS) as [keyof typeof RECEIPT_DIFFERENCE_REASONS],
);
export const ConfirmReceiptInput = z.object({
  issueId: uuid,
  locationId: uuid,
  attestationId: uuid,
  lines: z
    .array(z.object({ batchId: uuid, arrived: qty }))
    .min(1)
    .max(500),
  reasonCode: receiptReason.nullable(),
});

/**
 * IS-3 at the ward: the confirmer's own second factor first (always, so a controlled line has it: IS-6),
 * then the receiving end's one write, shared with the pharmacy (`confirmIssue`, issue-store.ts). A
 * difference becomes an `adjusted` at the ward with its reason, listed for both in-charges.
 */
export async function confirmWardIssue(who: Who, input: z.infer<typeof ConfirmReceiptInput>) {
  await attested(who, input.attestationId, true, "pharmacy_receipt");
  return confirmIssue(who.tx, {
    hospitalId: who.hospitalId,
    issueId: input.issueId,
    receivingLocationId: input.locationId,
    confirmedByUserId: who.userId,
    lines: input.lines.map((l) => ({ batchId: l.batchId, confirmed: l.arrived })),
    reason: input.reasonCode ? RECEIPT_DIFFERENCE_REASONS[input.reasonCode] : null,
    attestationId: input.attestationId,
    now: who.now,
  });
}

/* ─── Returns from the ward (IS-5) ────────────────────────────────────── */

const returnReason = z.enum(Object.keys(RETURN_REASONS) as [keyof typeof RETURN_REASONS]);
export const WardReturnInput = z
  .object({
    clientKey: uuid,
    locationId: uuid,
    toLocationId: uuid,
    batchId: uuid,
    quantity: z.number().int().min(1).max(1_000_000),
    reasonCode: returnReason,
    note,
    fit: z.boolean(),
  })
  .refine((v) => v.reasonCode !== "other" || !!v.note?.trim(), {
    message: "Say why.",
    path: ["note"],
  });

/** The hospital's live quarantine location (one per hospital, or the first, by name). */
export async function quarantineOf(tx: EmrTx, hospitalId: string) {
  const [q] = await tx
    .select({ id: pharmacyLocations.id })
    .from(pharmacyLocations)
    .where(
      and(
        eq(pharmacyLocations.hospitalId, hospitalId),
        eq(pharmacyLocations.kind, "quarantine"),
        sql`${pharmacyLocations.archivedAt} IS NULL`,
      ),
    )
    .orderBy(pharmacyLocations.name)
    .limit(1);
  if (!q)
    throw fail("config", "There is no quarantine place yet. The pharmacy in charge adds one.");
  const l = await loadLocation(tx, hospitalId, q.id);
  requireLive(l);
  return l;
}

/**
 * IS-5, 5.3: a ward returns stock to its issuer as a return pair with a reason; stock not fit for the
 * shelf goes to quarantine instead. A controlled return goes through the pharmacy, with a witness.
 */
export async function returnWardStock(who: Who, input: z.infer<typeof WardReturnInput>) {
  const [done] = await who.tx
    .select({ h: pharmacyIssues.hospitalId })
    .from(pharmacyIssues)
    .where(eq(pharmacyIssues.id, input.clientKey));
  if (done) {
    if (done.h !== who.hospitalId) throw fail("conflict", "That request key is already in use.");
    return { id: input.clientKey };
  }
  const ward = await lockPlace(who.tx, who.hospitalId, input.locationId, "ward");
  requireLive(ward);
  const batch = await batchRef(who.tx, who.hospitalId, input.batchId, ward.id);
  if (await isControlledMedicine(who.tx, who.hospitalId, batch.medicineId))
    throw fail("config", "Return controlled drugs through the pharmacy, with a witness.");
  const issuer = await loadLocation(who.tx, who.hospitalId, input.toLocationId);
  if (issuer.kind !== "store" && issuer.kind !== "dispensing_point")
    throw fail("invalid", "Return to the store or a dispensing point.");
  const quarantine = input.fit ? null : await quarantineOf(who.tx, who.hospitalId);
  const route = returnRoute({
    fit: input.fit,
    reasonCode: input.reasonCode,
    issuerLocationId: issuer.id,
    quarantineLocationId: quarantine?.id ?? issuer.id,
  });
  if (!route.ok) throw fail("invalid", "Give a reason.");
  const to = quarantine ?? issuer;
  requireLive(to);
  if (!allows(ward.kind, ward.wardSupplyModel, route.outKind, "out"))
    throw fail("config", "This ward does not return stock.");
  await who.tx.insert(pharmacyIssues).values({
    id: input.clientKey,
    hospitalId: who.hospitalId,
    kind: "return",
    fromLocationId: ward.id,
    toLocationId: to.id,
    returnReason: input.reasonCode,
    issuedBy: who.userId,
    issuedAt: who.now,
  });
  await movePair(who.tx, {
    pair: input.fit ? "return" : "quarantine",
    hospitalId: who.hospitalId,
    from: ward,
    to,
    batch,
    quantity: input.quantity,
    sourceId: input.clientKey,
    actorUserId: who.userId,
    effectiveAt: who.now,
    reasonCode: input.reasonCode,
    reasonNote: input.note ?? null,
  });
  return { id: input.clientKey };
}
