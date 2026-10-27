import type { GapExplanation } from "./carts";
import type { StoreBatch } from "./ledger";
import type { Who } from "./ward-store";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { pharmacyCountLines, pharmacyCounts } from "@/db/schema";
import {
  pharmacyCartChecks,
  pharmacyIssueConfirmations,
  pharmacyIssues,
} from "@/db/schema/pharmacy-stores";
import { isControlledMedicine } from "@/lib/pharmacy/controlled-read";
import { sealApplied } from "@/lib/pharmacy/distribution/store";
import { daysBetween, expiresOn, localDate } from "@/lib/pharmacy/stock/ledger";
import { gapMovement, restockPlan, shortDatedSwaps } from "./carts";
import { issueAllowed } from "./locations";
import { cartListOf, cartLookaheadDays, cartUsesSince, lastChecks, packsOf } from "./ward-read";
import { attested, quarantineOf } from "./ward-store";
import { balancesAt, batchRef, fail, loadLocation, move, movePair, requireLive } from "./write";

/**
 * The cart check (Pharmacy Phase 2, 5.5, 6.8: EC-1 to EC-4; D-PH2-06, D-PH2-21). A pharmacy person counts
 * the cart blind; the list quantity and the uses recorded on the resus desk come back only with the
 * committed count, and the uses are never subtracted (EC-2). The person explains each gap; MedSync never
 * decides which it was (EC-3). Short-dated batches are swapped by default (EC-4); the restock is an issue
 * with both legs from the first-expiring unexpired stock (EC-1). The unit's nurse in charge confirms with
 * their second factor; confirmer and checker differ.
 */

const uuid = z.uuid();
const rowsOf = <T>(r: unknown): T[] =>
  Array.isArray(r) ? (r as T[]) : ((r as { rows: T[] }).rows ?? []);

const EXPLANATIONS = [
  "used_not_recorded",
  "recorded_uses_accepted",
  "broken_or_discarded",
  "moved_to_another_cart",
  "cannot_explain",
] as const satisfies readonly GapExplanation[];

export const CartCheckInput = z.discriminatedUnion("step", [
  z.object({
    step: z.literal("count"),
    clientKey: uuid,
    locationId: uuid,
    lines: z
      .array(z.object({ batchId: uuid, counted: z.number().int().min(0).max(100_000) }))
      .max(500),
  }),
  z.object({
    step: z.literal("complete"),
    countId: uuid,
    locationId: uuid,
    fromLocationId: uuid,
    sealNumber: z.string().trim().min(1).max(40).nullable(),
    confirmAttestationId: uuid,
    explanations: z
      .array(
        z.object({
          batchId: uuid,
          explanation: z.enum(EXPLANATIONS).nullable(),
          reasonCode: z.string().trim().min(2).max(60).nullable(),
          note: z.string().trim().max(500).nullable(),
          toCartLocationId: uuid.nullable(),
        }),
      )
      .max(500),
    swaps: z
      .array(z.object({ batchId: uuid, route: z.enum(["return_to_issuer", "quarantine", "keep"]) }))
      .max(500),
  }),
]);

async function cartBatches(who: Who, locationId: string) {
  const rows = rowsOf<{
    id: string;
    product_id: string;
    product: string;
    medicine_id: string;
    batch_number: string;
    expiry: string;
    expiry_month_only: boolean;
  }>(
    await who.tx.execute(
      sql`SELECT b.id, b.product_id, p.name AS product, p.medicine_id, b.batch_number, b.expiry::text AS expiry,
                 b.expiry_month_only
            FROM public.pharmacy_batches b JOIN public.pharmacy_products p ON p.id = b.product_id
           WHERE b.location_id = ${locationId}::uuid FOR UPDATE OF b`,
    ),
  );
  return rows.map((r) => ({
    id: r.id,
    pointId: locationId,
    productId: r.product_id,
    productName: r.product,
    medicineId: r.medicine_id,
    batchNumber: r.batch_number,
    expiry: String(r.expiry).slice(0, 10),
    expiryMonthOnly: r.expiry_month_only,
  }));
}

async function signedList(who: Who, locationId: string) {
  const packs = await packsOf(who.tx, locationId, "cart_list");
  return packs.signed ? cartListOf(packs.signed.content) : null;
}

/** What the checker sees once the count is committed: both figures, the list, the uses (context), swaps. */
async function revealed(who: Who, cartId: string, countId: string) {
  const lines = rowsOf<{ batch_id: string; counted: number; recorded: number }>(
    await who.tx.execute(
      sql`SELECT batch_id, counted_quantity AS counted, recorded_balance AS recorded
            FROM public.pharmacy_count_lines WHERE count_id = ${countId}::uuid`,
    ),
  );
  const batches = await cartBatches(who, cartId);
  const list = await signedList(who, cartId);
  const last = (await lastChecks(who.tx, [cartId])).get(cartId) ?? null;
  const uses = await cartUsesSince(who.tx, {
    hospitalId: who.hospitalId,
    names: list?.names ?? [],
    since: last,
  });
  const lookahead = await cartLookaheadDays(who.tx, who.hospitalId);
  const counted = new Map(lines.map((l) => [l.batch_id, Number(l.counted)]));
  const swaps = shortDatedSwaps({
    batches: batches.filter((b) => counted.has(b.id)),
    balances: counted,
    localDate: localDate(who.now),
    cartLookaheadDays: lookahead,
  });
  return {
    id: countId,
    lines: lines.map((l) => {
      const b = batches.find((x) => x.id === l.batch_id)!;
      return {
        batchId: l.batch_id,
        productId: b.productId,
        product: b.productName,
        batchNumber: b.batchNumber,
        counted: Number(l.counted),
        before: Number(l.recorded),
      };
    }),
    list: list ? Object.fromEntries(list.items) : null,
    // EC-2: shown beside the count; nothing below reads them.
    uses: uses.map((u) => ({ ...u, at: u.at.toISOString() })),
    swaps:
      "swaps" in swaps
        ? swaps.swaps.map((s) => ({ batchId: s.batchId, daysLeft: s.daysLeft }))
        : [],
    lookaheadMissing: "missing" in swaps,
  };
}
export type CartCountRevealed = Awaited<ReturnType<typeof revealed>>;

/** `recordCartCheck`, step "count": blind, every batch on the cart with stock counted; nothing moves yet. */
async function countCart(
  who: Who,
  input: Extract<z.infer<typeof CartCheckInput>, { step: "count" }>,
) {
  const cart = await loadLocation(who.tx, who.hospitalId, input.locationId);
  if (cart.kind !== "cart") throw fail("not_found", "That is not a cart.");
  const [replay] = await who.tx
    .select({ h: pharmacyCounts.hospitalId, loc: pharmacyCounts.locationId })
    .from(pharmacyCounts)
    .where(eq(pharmacyCounts.id, input.clientKey));
  if (replay) {
    if (replay.h !== who.hospitalId || replay.loc !== cart.id)
      throw fail("conflict", "That request key is already in use.");
    return revealed(who, cart.id, input.clientKey);
  }
  const batches = await cartBatches(who, cart.id);
  const balances = await balancesAt(who.tx, cart.id);
  const typed = new Map(input.lines.map((l) => [l.batchId, l.counted]));
  if (typed.size !== input.lines.length) throw fail("invalid", "Each batch is counted once.");
  for (const id of typed.keys())
    if (!batches.some((b) => b.id === id))
      throw fail("not_found", "That batch is not on this cart.");
  const missing = batches.filter((b) => !typed.has(b.id) && (balances.get(b.id) ?? 0) !== 0);
  if (missing.length)
    throw fail(
      "invalid",
      `Type a figure for every batch: ${missing.map((b) => b.batchNumber).join(", ")}.`,
    );
  await who.tx.insert(pharmacyCounts).values({
    id: input.clientKey,
    hospitalId: who.hospitalId,
    locationId: cart.id,
    scope: "cart",
    countedBy: who.userId,
    countedAt: who.now,
  });
  if (input.lines.length)
    await who.tx.insert(pharmacyCountLines).values(
      input.lines.map((l) => ({
        countId: input.clientKey,
        batchId: l.batchId,
        countedQuantity: l.counted,
        recordedBalance: balances.get(l.batchId) ?? 0,
      })),
    );
  return revealed(who, cart.id, input.clientKey);
}

const REFUSED: Record<string, string> = {
  explanation_needed: "Say what you found for every difference.",
  reason_needed: "Give a reason where the cart holds more than expected.",
  target_cart_needed: "Name the cart it was moved to.",
};

/**
 * `recordCartCheck`, step "complete": the gaps (EC-3), the swaps (EC-4), the restock (EC-1), the seal and
 * the confirmer, in one transaction. Controlled products are not restocked here: Issues, with a witness.
 */
async function completeCheck(
  who: Who,
  input: Extract<z.infer<typeof CartCheckInput>, { step: "complete" }>,
) {
  const cart = await loadLocation(who.tx, who.hospitalId, input.locationId);
  if (cart.kind !== "cart") throw fail("not_found", "That is not a cart.");
  const [count] = await who.tx
    .select({ id: pharmacyCounts.id })
    .from(pharmacyCounts)
    .where(
      and(
        eq(pharmacyCounts.id, input.countId),
        eq(pharmacyCounts.hospitalId, who.hospitalId),
        eq(pharmacyCounts.locationId, cart.id),
        eq(pharmacyCounts.scope, "cart"),
      ),
    )
    .for("update");
  if (!count) throw fail("not_found", "That count is not on this cart.");
  const [done] = await who.tx
    .select({ id: pharmacyCartChecks.id })
    .from(pharmacyCartChecks)
    .where(eq(pharmacyCartChecks.countId, count.id));
  if (done) return { id: done.id, restocked: [], short: [], controlled: [] };
  const list = await signedList(who, cart.id);
  if (!list) throw fail("config", "Sign the cart list first.");
  requireLive(cart);
  const confirmer = await attested(who, input.confirmAttestationId, false, "pharmacy_cart_confirm");
  const rights = rowsOf<{ ok: boolean }>(
    await who.tx.execute(
      sql`SELECT private.pharmacy_location_right(${confirmer}::uuid, ${cart.id}::uuid, 'cart_confirm') AS ok`,
    ),
  );
  if (!rights[0]?.ok)
    throw fail("forbidden", "The confirmer is not in charge of this cart's unit.");

  const lines = await who.tx
    .select()
    .from(pharmacyCountLines)
    .where(eq(pharmacyCountLines.countId, count.id));
  const batches = await cartBatches(who, cart.id);
  const answers = new Map(input.explanations.map((e) => [e.batchId, e]));
  const explanations: Record<string, unknown> = {};
  for (const l of lines) {
    const a = answers.get(l.batchId);
    const r = gapMovement({
      batchId: l.batchId,
      balanceBefore: l.recordedBalance,
      counted: l.countedQuantity,
      explanation: a?.explanation ?? null,
      reasonCode: a?.reasonCode ?? a?.explanation ?? null,
      toCartLocationId: a?.toCartLocationId ?? null,
    });
    if (!r.ok) throw fail("invalid", REFUSED[r.reason] ?? "Explain the difference.");
    const m = r.movement;
    if (!m) continue;
    explanations[l.batchId] = {
      gap: r.gap,
      explanation: a?.explanation ?? null,
      note: a?.note ?? null,
      toCart: a?.toCartLocationId ?? null,
      flagged: m.kind === "adjusted" && m.flagForInCharge,
    };
    const base = {
      hospitalId: who.hospitalId,
      location: cart,
      batchId: l.batchId,
      sourceKind: "count" as const,
      sourceId: count.id,
      actorUserId: who.userId,
      effectiveAt: who.now,
    };
    if (m.kind === "cart_used")
      await move(who.tx, { ...base, kind: "cart_used", quantity: m.quantity });
    else if (m.kind === "adjusted")
      await move(who.tx, {
        ...base,
        kind: "adjusted",
        quantity: m.quantity,
        reasonCode: m.reasonCode,
        reasonNote: a?.note ?? null,
      });
    else {
      const target = await loadLocation(who.tx, who.hospitalId, m.toCartLocationId);
      if (target.kind !== "cart" || target.id === cart.id || !issueAllowed(cart.kind, target.kind))
        throw fail("invalid", "Choose another cart.");
      requireLive(target);
      const [mv] = await who.tx
        .insert(pharmacyIssues)
        .values({
          hospitalId: who.hospitalId,
          kind: "cart_move",
          fromLocationId: cart.id,
          toLocationId: target.id,
          issuedBy: who.userId,
          issuedAt: who.now,
        })
        .returning({ id: pharmacyIssues.id });
      await movePair(who.tx, {
        pair: "issue",
        hospitalId: who.hospitalId,
        from: cart,
        to: target,
        batch: await batchRef(who.tx, who.hospitalId, l.batchId, cart.id),
        quantity: m.quantity,
        sourceId: mv!.id,
        actorUserId: who.userId,
        effectiveAt: who.now,
      });
    }
  }

  // EC-4: short-dated batches leave by default (to the issuer or quarantine); "keep" is the person's choice.
  const issuer = await loadLocation(who.tx, who.hospitalId, input.fromLocationId);
  if (issuer.kind !== "store" && issuer.kind !== "dispensing_point")
    throw fail("invalid", "Restock from the store or a dispensing point.");
  requireLive(issuer);
  const lookahead = await cartLookaheadDays(who.tx, who.hospitalId);
  const today = localDate(who.now);
  const onCart = new Map(lines.map((l) => [l.batchId, l.countedQuantity]));
  const due = shortDatedSwaps({
    batches: batches.filter((b) => onCart.has(b.id)),
    balances: onCart,
    localDate: today,
    cartLookaheadDays: lookahead,
  });
  const routeOf = new Map(input.swaps.map((s) => [s.batchId, s.route]));
  const swapIssue: Partial<Record<"return_to_issuer" | "quarantine", string>> = {};
  for (const s of "swaps" in due ? due.swaps : []) {
    const route = routeOf.get(s.batchId) ?? "return_to_issuer";
    if (route === "keep") continue;
    const quarantine = route === "quarantine" ? await quarantineOf(who.tx, who.hospitalId) : null;
    const to = quarantine ?? issuer;
    swapIssue[route] ??= (
      await who.tx
        .insert(pharmacyIssues)
        .values({
          hospitalId: who.hospitalId,
          kind: "return",
          fromLocationId: cart.id,
          toLocationId: to.id,
          returnReason: "near_expiry",
          issuedBy: who.userId,
          issuedAt: who.now,
        })
        .returning({ id: pharmacyIssues.id })
    )[0]!.id;
    await movePair(who.tx, {
      pair: quarantine ? "quarantine" : "return",
      hospitalId: who.hospitalId,
      from: cart,
      to,
      batch: await batchRef(who.tx, who.hospitalId, s.batchId, cart.id),
      quantity: s.quantity,
      sourceId: swapIssue[route]!,
      actorUserId: who.userId,
      effectiveAt: who.now,
      reasonCode: "near_expiry",
    });
    onCart.set(s.batchId, 0);
  }

  // EC-1: restock = list − what stays on the cart, first expiry first, unexpired and unblocked, never short-dated.
  const issuerBatches = rowsOf<{
    id: string;
    product_id: string;
    medicine_id: string;
    batch_number: string;
    expiry: string;
    expiry_month_only: boolean;
    blocked: boolean;
  }>(
    await who.tx.execute(
      sql`SELECT b.id, b.product_id, p.medicine_id, b.batch_number, b.expiry::text AS expiry, b.expiry_month_only,
                 private.pharmacy_batch_recalled(b.id) AS blocked
            FROM public.pharmacy_batches b JOIN public.pharmacy_products p ON p.id = b.product_id
           WHERE coalesce(b.location_id, b.dispensing_point_id) = ${issuer.id}::uuid
             AND b.product_id IN (${sql.join(
               [...list.items.keys(), "00000000-0000-0000-0000-000000000000"].map(
                 (p) => sql`${p}::uuid`,
               ),
               sql`, `,
             )})`,
    ),
  );
  const issuerBalances = await balancesAt(who.tx, issuer.id);
  const restocked: { product: string; quantity: number }[] = [];
  const short: { productId: string; quantity: number }[] = [];
  const controlled: string[] = [];
  let restockIssueId: string | null = null;
  for (const [productId, listQuantity] of list.items) {
    const staying = batches
      .filter((b) => b.productId === productId)
      .reduce((s, b) => s + (onCart.get(b.id) ?? 0), 0);
    const candidates: StoreBatch[] = issuerBatches
      .filter((b) => b.product_id === productId)
      .map((b) => ({
        id: b.id,
        pointId: issuer.id,
        productId: b.product_id,
        medicineId: b.medicine_id,
        batchNumber: b.batch_number,
        expiry: String(b.expiry).slice(0, 10),
        expiryMonthOnly: b.expiry_month_only,
      }))
      .filter((b) => lookahead === null || daysBetween(today, expiresOn(b)) > lookahead);
    const plan = restockPlan({
      listQuantity,
      counted: staying,
      batches: candidates,
      balances: issuerBalances,
      blocked: new Set(issuerBatches.filter((b) => b.blocked).map((b) => b.id)),
      localDate: today,
    });
    if (plan.need === 0) continue;
    const medicine = issuerBatches.find((b) => b.product_id === productId)?.medicine_id;
    if (medicine && (await isControlledMedicine(who.tx, who.hospitalId, medicine))) {
      controlled.push(productId);
      continue;
    }
    if (plan.short > 0) short.push({ productId, quantity: plan.short });
    for (const row of plan.rows) {
      restockIssueId ??= (
        await who.tx
          .insert(pharmacyIssues)
          .values({
            hospitalId: who.hospitalId,
            kind: "restock",
            fromLocationId: issuer.id,
            toLocationId: cart.id,
            issuedBy: who.userId,
            issuedAt: who.now,
          })
          .returning({ id: pharmacyIssues.id })
      )[0]!.id;
      await movePair(who.tx, {
        pair: "issue",
        hospitalId: who.hospitalId,
        from: issuer,
        to: cart,
        batch: await batchRef(who.tx, who.hospitalId, row.batchId, issuer.id),
        quantity: row.quantity,
        sourceId: restockIssueId,
        actorUserId: who.userId,
        effectiveAt: who.now,
      });
      restocked.push({ product: productId, quantity: row.quantity });
    }
  }
  // The confirmer's second factor stands for the cart's receipt of the restock (IS-3).
  if (restockIssueId)
    await who.tx.insert(pharmacyIssueConfirmations).values({
      issueId: restockIssueId,
      hospitalId: who.hospitalId,
      confirmedBy: confirmer,
      attestationId: input.confirmAttestationId,
      confirmedAt: who.now,
    });
  const [check] = await who.tx
    .insert(pharmacyCartChecks)
    .values({
      hospitalId: who.hospitalId,
      locationId: cart.id,
      countId: count.id,
      restockIssueId,
      sealNumber: input.sealNumber,
      explanations,
      checkedBy: who.userId,
      confirmedBy: confirmer,
      confirmAttestationId: input.confirmAttestationId,
      checkedAt: who.now,
    })
    .returning({ id: pharmacyCartChecks.id });
  await sealApplied(who, {
    locationId: cart.id,
    sealNumber: input.sealNumber,
    cartCheckId: check!.id,
  });
  return { id: check!.id, restocked, short, controlled };
}

/** `recordCartCheck` (Section 8): `pharmacy.stock` with the unit nurse in charge's confirmation. */
export async function recordCartCheck(who: Who, input: z.infer<typeof CartCheckInput>) {
  return input.step === "count" ? countCart(who, input) : completeCheck(who, input);
}
