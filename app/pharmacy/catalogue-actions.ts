"use server";

import type { CatalogueMedicine } from "@/lib/pharmacy/shared-catalogue/medicine";
import type { CatalogueHit } from "@/lib/pharmacy/shared-catalogue/search";
import type { PharmacyCtx } from "@/lib/pharmacy/write";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { asClinicalReader } from "@/lib/emr/db";
import { requirePharmacyActor } from "@/lib/pharmacy/actor";
import { pharmacyCatalogueLiveFor } from "@/lib/pharmacy/feature";
import * as imports from "@/lib/pharmacy/imports/store";
import * as prices from "@/lib/pharmacy/prices/store";
import { catalogueMedicine } from "@/lib/pharmacy/shared-catalogue/medicine";
import { resolveScan } from "@/lib/pharmacy/shared-catalogue/scan";
import { catalogueSearch } from "@/lib/pharmacy/shared-catalogue/search";
import { linkBarcode, linkProducts } from "@/lib/pharmacy/shared-catalogue/store";
import { addHealthSupply, HealthSupplyInput, MANAGE, STOCK_NEED } from "@/lib/pharmacy/stock/store";
import { orderCandidates, productsForPack } from "@/lib/pharmacy/stores/receiving-store";
import { runPharmacyWrite } from "@/lib/pharmacy/write";
import { hasTab, pharmacyV2 } from "./_lib/v2";

const Search = z.object({
  q: z.string().trim().min(2).max(120),
  prescribing: z.boolean().optional(),
});
const Medicine = z.object({ id: z.string().uuid() });

/** The viewer's scope, when the catalogue tab is theirs (its flag, the stock item). */
async function catalogueScope() {
  const v2 = await pharmacyV2();
  return v2.live && hasTab(v2, "setup", "catalogue") ? v2.scope : null;
}

/**
 * The picker's search (4.2). A read: Zod, then the pharmacy scope; read as the viewer (RLS gives the catalogue to
 * `pharmacy.view`). The text travels in the request body and is not stored or logged (brief §7).
 */
export async function catalogueSearchAction(
  input: unknown,
): Promise<{ ok: true; hits: CatalogueHit[] } | { ok: false }> {
  const parsed = Search.safeParse(input);
  if (!parsed.success) return { ok: false };
  const scope = await catalogueScope();
  if (!scope) return { ok: false };
  const hits = await asClinicalReader(scope, (tx) =>
    catalogueSearch(tx, parsed.data.q, {
      hospitalId: scope.hospitalId,
      prescribing: parsed.data.prescribing,
    }),
  );
  return { ok: true, hits };
}

/** One medicine's names and packs, for the picker's right column. */
export async function catalogueMedicineAction(
  input: unknown,
): Promise<{ ok: true; medicine: CatalogueMedicine } | { ok: false }> {
  const parsed = Medicine.safeParse(input);
  if (!parsed.success) return { ok: false };
  const scope = await catalogueScope();
  if (!scope) return { ok: false };
  const medicine = await asClinicalReader(scope, (tx) =>
    catalogueMedicine(tx, parsed.data.id, scope.hospitalId),
  );
  return medicine ? { ok: true, medicine } : { ok: false };
}

const OFF = {
  ok: false as const,
  code: "config" as const,
  error: "The catalogue is not on at this hospital.",
};

const Link = z.object({
  packId: z.uuid(),
  gtin: z.string().regex(/^\d{14}$/, "A GTIN is 14 digits."),
});

/**
 * 4.3 "Link and fill the line" (D-CAT-07): the hospital's link to the pack, used here at once, and a proposal the
 * catalogue team checks before any other hospital uses it. Through the pharmacy write path (receiving rights); a
 * refusal comes back in words.
 */
export async function linkBarcodeAction(raw: unknown) {
  const actor = await requirePharmacyActor();
  if (!pharmacyCatalogueLiveFor(actor.hospitalId)) return OFF;
  return runPharmacyWrite(
    Link,
    raw,
    actor,
    { permission: ["pharmacy.stock", "pharmacy.store"], point: "none" },
    async (ctx, input) => {
      const r = await linkBarcode(ctx.tx, ctx.actor, {
        packId: input.packId,
        codeType: "GTIN",
        code: input.gtin,
      });
      return { id: r.codeId, state: r.state };
    },
  );
}

/** 4.4: a health supply typed from the pack (S18). A local medicine is refused in words (D-CAT-18). */
export async function addHealthSupplyAction(raw: unknown) {
  const actor = await requirePharmacyActor();
  if (!pharmacyCatalogueLiveFor(actor.hospitalId)) return OFF;
  const r = await runPharmacyWrite(HealthSupplyInput, raw, actor, STOCK_NEED, addHealthSupply);
  if (r.ok) revalidatePath("/pharmacy", "layout");
  return r;
}

const Links = z.object({
  links: z
    .array(
      z.object({
        productId: z.uuid(),
        catalogueMedicineId: z.uuid(),
        cataloguePackId: z.uuid().nullable().optional(),
      }),
    )
    .min(1)
    .max(200),
});

/** Your products (S17): link to the catalogue; batches, movements and issue unit stay as they are. */
export async function linkProductsAction(raw: unknown) {
  const actor = await requirePharmacyActor();
  if (!pharmacyCatalogueLiveFor(actor.hospitalId)) return OFF;
  const r = await runPharmacyWrite(Links, raw, actor, STOCK_NEED, async (ctx, input) => ({
    id: String(await linkProducts(ctx.tx, ctx.actor, input.links)),
  }));
  if (r.ok) revalidatePath("/pharmacy/setup");
  return r;
}

const Delivery = z.object({ deliveryId: z.uuid() });

/** 4.3 on a delivery: the order's uncounted lines with a catalogue pack, as picks the person may choose from. */
export async function orderCandidatesAction(
  input: unknown,
): Promise<
  | { ok: true; picks: { medicine: CatalogueMedicine; pack: CatalogueMedicine["packs"][number] }[] }
  | { ok: false }
> {
  const parsed = Delivery.safeParse(input);
  if (!parsed.success) return { ok: false };
  const actor = await requirePharmacyActor();
  if (!pharmacyCatalogueLiveFor(actor.hospitalId)) return { ok: false };
  const picks = await asClinicalReader(actor, async (tx) => {
    const out = [];
    for (const c of await orderCandidates(tx, actor.hospitalId, parsed.data.deliveryId)) {
      const medicine = await catalogueMedicine(tx, c.medicine_id, actor.hospitalId);
      const pack = medicine?.packs.find((p) => p.packId === c.pack_id);
      if (medicine && pack) out.push({ medicine, pack });
    }
    return out;
  });
  return { ok: true, picks };
}

const Raw = z.object({ raw: z.string().trim().min(1).max(300) });

/**
 * The store screens' scan field (catalogue slice Step 7): a code no product here carries resolves through this
 * hospital's link, then the shared link, to the one product linked to that pack. Never a guess: none or several
 * gives nothing.
 */
export async function scanProductAction(
  input: unknown,
): Promise<{ ok: true; productId: string | null } | { ok: false }> {
  const parsed = Raw.safeParse(input);
  if (!parsed.success) return { ok: false };
  const actor = await requirePharmacyActor();
  if (!pharmacyCatalogueLiveFor(actor.hospitalId)) return { ok: false };
  const productId = await asClinicalReader(actor, async (tx) => {
    const r = await resolveScan(tx, actor.hospitalId, parsed.data.raw);
    if (r.kind === "product") return r.productId;
    if (r.kind !== "pack") return null;
    const linked = await productsForPack(tx, actor.hospitalId, r.packId);
    return linked.length === 1 ? linked[0]! : null;
  });
  return { ok: true, productId };
}

/* ─── Set-up › Prices (catalogue slice Step 8; ADR 0460): each a new row from a date, `pharmacy.manage` ─── */

async function priceWrite<I>(
  schema: z.ZodType<I>,
  raw: unknown,
  fn: (ctx: PharmacyCtx, input: I) => Promise<{ id: string }>,
) {
  const actor = await requirePharmacyActor();
  if (!pharmacyCatalogueLiveFor(actor.hospitalId)) return OFF;
  const r = await runPharmacyWrite(schema, raw, actor, MANAGE, fn);
  if (r.ok) revalidatePath("/pharmacy/setup");
  return r;
}

export async function setPriceRuleAction(raw: unknown) {
  return priceWrite(prices.RuleInput, raw, prices.setPriceRule);
}
export async function addPayerAction(raw: unknown) {
  return priceWrite(prices.PayerInput, raw, prices.addPayer);
}
export async function setChargeModeAction(raw: unknown) {
  return priceWrite(prices.ChargeModeInput, raw, prices.setChargeMode);
}
export async function setPayFirstAction(raw: unknown) {
  return priceWrite(prices.PayFirstInput, raw, prices.setPayFirst);
}
export async function setPriceAction(raw: unknown) {
  return priceWrite(prices.SetPriceInput, raw, prices.setPrice);
}

/* ─── Set-up › Import (catalogue slice Step 9; ADR 0462): drafts, one decision per row, commit ─── */

async function importWrite<I>(
  schema: z.ZodType<I>,
  raw: unknown,
  fn: (ctx: PharmacyCtx, input: I) => Promise<{ id: string }>,
) {
  const actor = await requirePharmacyActor();
  if (!pharmacyCatalogueLiveFor(actor.hospitalId)) return OFF;
  const r = await runPharmacyWrite(schema, raw, actor, STOCK_NEED, fn);
  if (r.ok) revalidatePath("/pharmacy/setup");
  return r;
}

export async function createImportDraftAction(raw: unknown) {
  return importWrite(imports.CreateDraftInput, raw, imports.createDraft);
}
export async function decideImportRowsAction(raw: unknown) {
  return importWrite(imports.DecideInput, raw, imports.decideRows);
}
export async function commitImportAction(raw: unknown) {
  return importWrite(imports.CommitInput, raw, imports.commitDraft);
}
