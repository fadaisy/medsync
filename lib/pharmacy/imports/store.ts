import "server-only";

import type { CatalogueEntry, ImportKind, Judged } from "./engine";
import type { EmrDb, EmrTx } from "@/lib/emr/db";
import type { PharmacyCtx } from "@/lib/pharmacy/write";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import { pharmacyProducts } from "@/db/schema/pharmacy-dispensing";
import { pharmacyImportDrafts, pharmacyImportRows } from "@/db/schema/pharmacy-imports";
import { pharmacyPriceListLines, pharmacyPriceLists } from "@/db/schema/pharmacy-prices";
import { pharmacyCounterparties } from "@/db/schema/pharmacy-stores";
import { EmrWriteError } from "@/lib/emr/write/context";
import { rowsOf } from "@/lib/exchange/store";
import {
  addHealthSupply,
  addProduct,
  HealthSupplyInput,
  ProductInput,
} from "@/lib/pharmacy/stock/store";
import { loadLocation, locationLive, placeAt } from "@/lib/pharmacy/stores/write";
import { fold, judgeOpening, judgePriceLine, judgeProduct, MAX_BYTES, readImport } from "./engine";

/**
 * Imports, server side (catalogue slice Step 9; ADR 0462). A file becomes a draft with every row judged; a person
 * decides each row; commit writes only the accepted rows through the existing stores (S34). Opening stock places
 * the products at the store and writes no count or movement: the blind opening count is still needed (S36).
 * Writes run through `runPharmacyWrite` with `pharmacy.stock` at the set-up point. Behind `PHARMACY_CATALOGUE`.
 */

type Db = EmrDb | EmrTx;
/** A CSV row through the store's own schema (lengths, trimming), refused in words with its line. */
function valid<I>(line: number, schema: z.ZodType<I>, raw: unknown): I {
  const r = schema.safeParse(raw);
  if (r.success) return r.data;
  throw new EmrWriteError(
    "invalid",
    `Line ${line}: ${r.error.issues[0]?.message ?? "cannot be added"}`,
  );
}
const fail = (code: "invalid" | "conflict" | "not_found", words: string) =>
  new EmrWriteError(code, words);

/** The catalogue as the products import sees it: every active medicine's names, strength, packs and barcodes. */
async function productIndex(tx: Db, hospitalId: string) {
  const meds = rowsOf<{
    medicine_id: string;
    name: string;
    kind: "medicine" | "health_supply";
    strength: string | null;
    formulary_id: string | null;
  }>(
    await tx.execute(sql`
      SELECT m.id AS medicine_id, m.display_name AS name, m.kind, m.strength_text AS strength,
             (SELECT f.id FROM (
                SELECT l.formulary_id AS id, 0 AS o FROM public.cat_medicine_links l
                 WHERE l.medicine_id = m.id AND l.link_kind = 'formulary'
                UNION ALL
                SELECT n.medicine_id, 1 FROM public.cat_medicine_links l
                  JOIN public.pharmacy_medicine_links n ON n.row_id = l.row_id
                 WHERE l.medicine_id = m.id AND l.link_kind = 'emhslu_row') f ORDER BY f.o LIMIT 1) AS formulary_id
        FROM public.cat_medicines m WHERE m.status = 'active' AND m.kind IN ('medicine','health_supply')`),
  );
  const [names, codes, own] = await Promise.all([
    tx.execute(sql`SELECT n.medicine_id, n.name FROM public.cat_medicine_names n`),
    tx.execute(sql`
      SELECT c.code, k.id AS pack_id, p.medicine_id FROM public.cat_pack_codes c
        JOIN public.cat_packs k ON k.id = c.pack_id AND k.status = 'active'
        JOIN public.cat_products p ON p.id = k.product_id
       WHERE c.code_type = 'GTIN' AND (c.state = 'confirmed' OR c.hospital_id = ${hospitalId})`),
    tx
      .select({
        medicineId: pharmacyProducts.medicineId,
        strength: pharmacyProducts.strength,
        packId: pharmacyProducts.cataloguePackId,
      })
      .from(pharmacyProducts)
      .where(and(eq(pharmacyProducts.hospitalId, hospitalId), eq(pharmacyProducts.active, true))),
  ]);
  const entry = new Map(
    meds.map((m): [string, CatalogueEntry] => [
      m.medicine_id,
      {
        medicineId: m.medicine_id,
        name: m.name,
        kind: m.kind,
        strength: m.strength,
        formularyId: m.formulary_id,
        packId: null,
      },
    ]),
  );
  const byName = new Map<string, CatalogueEntry[]>();
  const add = (n: string, e: CatalogueEntry) => {
    const k = fold(n);
    const list = byName.get(k) ?? [];
    if (!list.includes(e)) byName.set(k, [...list, e]);
  };
  for (const e of entry.values()) add(e.name, e);
  for (const n of rowsOf<{ medicine_id: string; name: string }>(names)) {
    const e = entry.get(n.medicine_id);
    if (e) add(n.name, e);
  }
  const byGtin = new Map<string, CatalogueEntry>();
  for (const c of rowsOf<{ code: string; pack_id: string; medicine_id: string }>(codes)) {
    const e = entry.get(c.medicine_id);
    if (e) byGtin.set(c.code, { ...e, packId: c.pack_id });
  }
  const existing = new Set<string>();
  for (const p of own) {
    if (p.packId) existing.add(p.packId);
    existing.add(`${p.medicineId}|${fold(p.strength ?? "")}`);
  }
  return { byGtin, byName, existing };
}

async function hospitalProducts(tx: Db, hospitalId: string) {
  const rows = rowsOf<{ id: string; name: string; gtins: string[] }>(
    await tx.execute(sql`
      SELECT p.id, p.name, array_remove(array_agg(DISTINCT c.code) || array[p.gtin], NULL) AS gtins
        FROM public.pharmacy_products p
        LEFT JOIN public.cat_pack_codes c ON c.pack_id = p.catalogue_pack_id AND c.code_type = 'GTIN'
       WHERE p.hospital_id = ${hospitalId} AND p.active
       GROUP BY p.id`),
  );
  return rows.map((r) => ({ ...r, gtins: r.gtins ?? [] }));
}

async function priceIndex(tx: Db, hospitalId: string, supplierId: string) {
  const [codes, prior, names] = await Promise.all([
    tx.execute(sql`
      SELECT c.code, c.pack_id,
             (SELECT p.id FROM public.pharmacy_products p
               WHERE p.hospital_id = ${hospitalId} AND p.active AND p.catalogue_pack_id = c.pack_id LIMIT 1) AS product_id
        FROM public.cat_pack_codes c
       WHERE c.code_type = 'GTIN' AND (c.state = 'confirmed' OR c.hospital_id = ${hospitalId})`),
    tx.execute(sql`
      SELECT DISTINCT ON (lower(l.supplier_code)) lower(l.supplier_code) AS code, l.pack_id, l.product_id
        FROM public.pharmacy_price_list_lines l JOIN public.pharmacy_price_lists s ON s.id = l.price_list_id
       WHERE s.hospital_id = ${hospitalId} AND s.supplier_id = ${supplierId}
         AND l.supplier_code IS NOT NULL AND l.pack_id IS NOT NULL
       ORDER BY lower(l.supplier_code), l.created_at DESC`),
    tx.execute(sql`
      SELECT k.id AS pack_id, m.display_name || ' ' || coalesce(p.brand_name, '') || ' ' || k.description AS name,
             coalesce(p.brand_name, '') AS brand,
             (SELECT x.id FROM public.pharmacy_products x
               WHERE x.hospital_id = ${hospitalId} AND x.active AND x.catalogue_pack_id = k.id LIMIT 1) AS product_id
        FROM public.cat_packs k JOIN public.cat_products p ON p.id = k.product_id
        JOIN public.cat_medicines m ON m.id = p.medicine_id
       WHERE k.status = 'active'`),
  ]);
  type Hit = { packId: string; productId: string | null };
  const byGtin = new Map<string, Hit>();
  for (const c of rowsOf<{ code: string; pack_id: string; product_id: string | null }>(codes))
    byGtin.set(c.code, { packId: c.pack_id, productId: c.product_id });
  const bySupplierCode = new Map<string, Hit>();
  for (const c of rowsOf<{ code: string; pack_id: string; product_id: string | null }>(prior))
    bySupplierCode.set(c.code, { packId: c.pack_id, productId: c.product_id });
  const byName = new Map<string, Hit[]>();
  for (const n of rowsOf<{
    pack_id: string;
    name: string;
    brand: string;
    product_id: string | null;
  }>(names))
    for (const k of [fold(n.name), fold(n.brand)].filter(Boolean)) {
      byName.set(k, [...(byName.get(k) ?? []), { packId: n.pack_id, productId: n.product_id }]);
    }
  return { byGtin, bySupplierCode, byName };
}

export const CreateDraftInput = z
  .object({
    kind: z.enum(["products", "opening_stock", "price_list"]),
    fileName: z.string().trim().min(1).max(200),
    text: z.string().min(1).max(MAX_BYTES),
    locationId: z.uuid().nullish(),
    supplierId: z.uuid().nullish(),
    editionDate: z.iso.date().nullish(),
  })
  .refine((v) => (v.kind === "opening_stock") === !!v.locationId, {
    message: "Choose the store this opening stock is for.",
  })
  .refine((v) => (v.kind === "price_list") === !!(v.supplierId && v.editionDate), {
    message: "Choose the supplier and the edition date.",
  });

/** S34: the draft and every judged row. Nothing outside the draft is written. */
export async function createDraft(ctx: PharmacyCtx, input: z.infer<typeof CreateDraftInput>) {
  const h = ctx.actor.hospitalId;
  const read = readImport(input.kind as ImportKind, input.text);
  if (!read.ok) throw fail("invalid", read.error);
  let judged: Judged<unknown>[];
  if (input.kind === "products") {
    const idx = await productIndex(ctx.tx, h);
    judged = read.rows.map((r) => judgeProduct(r, idx));
  } else if (input.kind === "opening_stock") {
    const l = await loadLocation(ctx.tx, h, input.locationId!);
    if (l.kind !== "store") throw fail("invalid", "Opening stock is imported for a store.");
    if (locationLive(l))
      throw fail("conflict", `${l.name} is live. Opening stock is for a store not yet live.`);
    const products = await hospitalProducts(ctx.tx, h);
    judged = read.rows.map((r) => judgeOpening(r, l.name, products));
  } else {
    const [s] = await ctx.tx
      .select({ name: pharmacyCounterparties.name })
      .from(pharmacyCounterparties)
      .where(
        and(
          eq(pharmacyCounterparties.id, input.supplierId!),
          eq(pharmacyCounterparties.hospitalId, h),
          eq(pharmacyCounterparties.kind, "supplier"),
        ),
      );
    if (!s) throw fail("not_found", "That supplier is not at this hospital.");
    const idx = await priceIndex(ctx.tx, h, input.supplierId!);
    judged = read.rows.map((r) => judgePriceLine(r, s.name, idx));
  }
  const [d] = await ctx.tx
    .insert(pharmacyImportDrafts)
    .values({
      hospitalId: h,
      kind: input.kind,
      fileName: input.fileName,
      rowCount: read.rows.length,
      locationId: input.locationId ?? null,
      supplierId: input.supplierId ?? null,
      editionDate: input.editionDate ?? null,
      createdBy: ctx.actor.userId,
    })
    .returning({ id: pharmacyImportDrafts.id });
  const values = read.rows.map((raw, i) => ({
    draftId: d!.id,
    hospitalId: h,
    lineNo: i + 1,
    raw,
    match: judged[i]!.match,
    why: judged[i]!.why.slice(0, 300),
    proposal: judged[i]!.proposal,
  }));
  for (let i = 0; i < values.length; i += 500)
    await ctx.tx.insert(pharmacyImportRows).values(values.slice(i, i + 500));
  return { id: d!.id };
}

async function openDraft(ctx: PharmacyCtx, draftId: string) {
  const [d] = await ctx.tx
    .select()
    .from(pharmacyImportDrafts)
    .where(
      and(
        eq(pharmacyImportDrafts.id, draftId),
        eq(pharmacyImportDrafts.hospitalId, ctx.actor.hospitalId),
      ),
    );
  if (!d) throw fail("not_found", "That import is not at this hospital.");
  if (d.committedAt) throw fail("conflict", "This import is already committed.");
  return d;
}

type Opt = { options?: unknown[] } | null;
const options = (p: unknown) => ((p as Opt)?.options ?? null) as unknown[] | null;

export const DecideInput = z.object({
  draftId: z.uuid(),
  decisions: z
    .array(
      z.object({
        rowId: z.uuid(),
        decision: z.enum(["accept", "skip", "add_supply"]),
        /** For a "check" row with options: which one (its index). For "add_supply": no number on the pack. */
        option: z.number().int().min(0).max(99).nullish(),
        noRegistration: z.boolean().optional(),
      }),
    )
    .min(1)
    .max(5000),
});

/**
 * One decision per row by a person. "accept" takes the proposal (a row with options needs its choice); a row with
 * no proposal cannot be accepted. "add_supply" is a products row not in the catalogue, added as a health supply
 * (D-CAT-18: never a medicine).
 */
export async function decideRows(ctx: PharmacyCtx, input: z.infer<typeof DecideInput>) {
  const d = await openDraft(ctx, input.draftId);
  const rows = await ctx.tx
    .select()
    .from(pharmacyImportRows)
    .where(eq(pharmacyImportRows.draftId, d.id));
  const byId = new Map(rows.map((r) => [r.id, r]));
  for (const x of input.decisions) {
    const r = byId.get(x.rowId);
    if (!r) throw fail("not_found", "A row is not of this import.");
    let chosen: unknown = null;
    if (x.decision === "accept") {
      const opts = options(r.proposal);
      if (opts) {
        if (x.option == null || !opts[x.option])
          throw fail("invalid", `Line ${r.lineNo}: choose one.`);
        chosen = opts[x.option];
      } else if (r.proposal && (r.match === "matched" || r.match === "not_in_catalogue"))
        chosen = r.proposal;
      else throw fail("invalid", `Line ${r.lineNo} has nothing to accept: ${r.why}`);
      if (d.kind !== "price_list" && r.match === "not_in_catalogue")
        throw fail("invalid", `Line ${r.lineNo} has nothing to accept: ${r.why}`);
      const e = chosen as Partial<CatalogueEntry>;
      if (d.kind === "products" && e.kind === "medicine" && !e.formularyId)
        throw fail("invalid", `Line ${r.lineNo}: that medicine is not on the prescribing list.`);
    }
    if (x.decision === "add_supply") {
      if (d.kind !== "products" || r.match !== "not_in_catalogue")
        throw fail(
          "invalid",
          `Line ${r.lineNo}: only a product not in the catalogue is added as a health supply.`,
        );
      if (!r.raw.nda && !x.noRegistration)
        throw fail(
          "invalid",
          `Line ${r.lineNo}: give the registration number, or say the pack has none.`,
        );
      chosen = { noRegistration: !r.raw.nda };
    }
    await ctx.tx
      .update(pharmacyImportRows)
      .set({ decision: x.decision, chosen, decidedBy: ctx.actor.userId, decidedAt: ctx.now })
      .where(eq(pharmacyImportRows.id, r.id));
  }
  return { id: d.id };
}

export const CommitInput = z.object({ draftId: z.uuid() });

/** S34: writes the accepted rows only, through the existing stores; each row records what it made. */
export async function commitDraft(ctx: PharmacyCtx, input: z.infer<typeof CommitInput>) {
  const d = await openDraft(ctx, input.draftId);
  const rows = await ctx.tx
    .select()
    .from(pharmacyImportRows)
    .where(and(eq(pharmacyImportRows.draftId, d.id), isNull(pharmacyImportRows.committedId)))
    .orderBy(asc(pharmacyImportRows.lineNo));
  const take = rows.filter((r) => r.decision === "accept" || r.decision === "add_supply");
  if (!take.length) throw fail("invalid", "No row is accepted yet.");
  const made = async (rowId: string, id: string) =>
    ctx.tx
      .update(pharmacyImportRows)
      .set({ committedId: id })
      .where(eq(pharmacyImportRows.id, rowId));
  let priceListId: string | null = null;
  if (d.kind === "price_list") {
    const [l] = await ctx.tx
      .insert(pharmacyPriceLists)
      .values({
        hospitalId: d.hospitalId,
        supplierId: d.supplierId!,
        editionDate: d.editionDate!,
        fileName: d.fileName,
        createdBy: ctx.actor.userId,
      })
      .returning({ id: pharmacyPriceLists.id });
    priceListId = l!.id;
  }
  for (const r of take) {
    const raw = r.raw;
    const c = r.chosen as Record<string, unknown> | null;
    if (d.kind === "products" && r.decision === "add_supply") {
      const contents = /^\d{1,6}$/.test(raw.contents ?? "") ? Number(raw.contents) : null;
      const out = await addHealthSupply(
        ctx,
        valid(r.lineNo, HealthSupplyInput, {
          clientKey: r.id,
          catalogueMedicineId: null,
          kind: "health_supply",
          name: raw.name!,
          strength: raw.strength || undefined,
          issueUnit: raw.issueUnit!,
          pack: {
            description: raw.pack || raw.issueUnit!,
            contents: contents && contents > 0 ? contents : null,
          },
          brand: raw.brand || undefined,
          maker: raw.manufacturer || undefined,
          registration: raw.nda
            ? { answer: "number", number: raw.nda }
            : { answer: "none_on_pack" },
          gtin: null,
        }),
      );
      await made(r.id, out.id);
    } else if (d.kind === "products") {
      const e = c as unknown as CatalogueEntry;
      const out =
        e.kind === "health_supply"
          ? await addHealthSupply(
              ctx,
              valid(r.lineNo, HealthSupplyInput, {
                clientKey: r.id,
                catalogueMedicineId: e.medicineId,
                kind: "health_supply",
                name: raw.brand || raw.name!,
                strength: raw.strength || undefined,
                issueUnit: raw.issueUnit!,
                pack: { description: raw.pack || raw.issueUnit!, contents: null },
                brand: raw.brand || undefined,
                maker: raw.manufacturer || undefined,
                registration: raw.nda
                  ? { answer: "number", number: raw.nda }
                  : { answer: "none_on_pack" },
                gtin: null,
              }),
            )
          : await addProduct(
              ctx,
              valid(r.lineNo, ProductInput, {
                clientKey: r.id,
                medicineId: e.formularyId!,
                name: raw.brand || raw.name!,
                manufacturer: raw.manufacturer || undefined,
                strength: raw.strength,
                packSize: raw.pack || undefined,
                issueUnit: raw.issueUnit!,
                registrationNumber: raw.nda || undefined,
                cataloguePackId: e.packId,
              }),
            );
      await made(r.id, out.id);
    } else if (d.kind === "opening_stock") {
      // S36: placed at the store only. The figures stay on the draft; the blind opening count sets the stock.
      await placeAt(ctx.tx, d.hospitalId, String(c!.productId), d.locationId!);
      await made(r.id, String(c!.productId));
    } else {
      const [line] = await ctx.tx
        .insert(pharmacyPriceListLines)
        .values({
          priceListId: priceListId!,
          hospitalId: d.hospitalId,
          rawText: raw.itemText!.slice(0, 500),
          packId: (c?.packId as string | null) ?? null,
          productId: (c?.productId as string | null) ?? null,
          packPriceUgx: (c?.packPrice as number | null) ?? null,
          supplierCode: raw.supplierCode || null,
          gtin: r.raw.gtin && /^\d{14}$/.test(r.raw.gtin) ? r.raw.gtin : null,
          matchedBy: ctx.actor.userId,
        })
        .returning({ id: pharmacyPriceListLines.id });
      await made(r.id, line!.id);
    }
  }
  await ctx.tx
    .update(pharmacyImportDrafts)
    .set({ committedAt: ctx.now, committedBy: ctx.actor.userId, priceListId })
    .where(eq(pharmacyImportDrafts.id, d.id));
  return { id: d.id, written: take.length };
}

/** Set-up › Import (4.7): the recent drafts, and one draft's rows grouped by match. */
export async function importPage(tx: Db, hospitalId: string, draftId?: string) {
  const drafts = await tx
    .select()
    .from(pharmacyImportDrafts)
    .where(eq(pharmacyImportDrafts.hospitalId, hospitalId))
    .orderBy(sql`${pharmacyImportDrafts.createdAt} DESC`)
    .limit(20);
  const open = draftId ? (drafts.find((d) => d.id === draftId) ?? null) : null;
  const rows = open
    ? await tx
        .select()
        .from(pharmacyImportRows)
        .where(eq(pharmacyImportRows.draftId, open.id))
        .orderBy(asc(pharmacyImportRows.lineNo))
    : [];
  return { drafts, open, rows };
}
export type ImportPage = Awaited<ReturnType<typeof importPage>>;
