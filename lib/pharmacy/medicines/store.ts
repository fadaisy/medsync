import "server-only";

import { randomUUID } from "node:crypto";
import type { PharmacyCtx, PharmacyNeed } from "@/lib/pharmacy/write";
import { sql } from "drizzle-orm";
import { z } from "zod";

import {
  FLAGS,
  LOCAL_REASONS,
  MEDICINES,
  PAYER_KINDS,
  qty,
  RULE_GROUPS,
  RX_CHECKS,
  ugx,
  VEN,
} from "@/content/pharmacy-medicines";
import { STOCK_UP_POLISH } from "@/content/pharmacy-stock-up-polish";
import { EmrWriteError } from "@/lib/emr/write/context";
import { rowsOf } from "@/lib/pharmacy/audit/read";
import { lineIdentityKey } from "@/lib/pharmacy/derive/medicines";
import { catalogueKey } from "@/lib/pharmacy/shared-catalogue/store";
import { localDate } from "@/lib/pharmacy/stock/ledger";
import { productForPick } from "@/lib/pharmacy/stores/receiving-store";
import { onNationalList, permissionsFor } from "./read";

/**
 * The medicine master's writes (MEDICINES-TAB.md §16). Each runs in one transaction through `runPharmacyWrite`, checks
 * the viewer's capability (§17) inside it, and writes one history line per changed area, ending
 * " · from <date> · by <name, role>". Saves are diffs against the stored line, so a replayed save changes nothing;
 * inserts take the client key as their id.
 */

const M = MEDICINES;
const H = M.history;
const day = z.iso.date();
const fail = (m: string) => new EmrWriteError("invalid", m);
const forbid = () => new EmrWriteError("forbidden", M.refused.notAllowed);

/** A Postgres array literal: a JS array parameter is not portable across drivers. */
const intArray = (xs: readonly number[]) => `{${xs.map((x) => Math.trunc(x)).join(",")}}`;

export const MED_NEED: PharmacyNeed = {
  permission: ["pharmacy.manage", "pharmacy.review", "pharmacy.store", "pharmacy.stock"],
  point: "none",
};
export const VIEW_NEED: PharmacyNeed = { permission: "pharmacy.view", point: "none" };

const can = (ctx: PharmacyCtx) => permissionsFor(ctx.actor, ctx.manages);

async function actorLabel(ctx: PharmacyCtx) {
  const [u] = rowsOf<{ who: string | null }>(
    await ctx.tx.execute(
      sql`SELECT coalesce(full_name, email) AS who FROM public.users WHERE id = ${ctx.actor.userId}`,
    ),
  );
  return `${u?.who ?? "—"}, ${ctx.actor.cadreName}`;
}

async function history(
  ctx: PharmacyCtx,
  productId: string,
  area: string,
  text: string,
  fromDate: string | null,
  bulk = false,
  label?: string,
) {
  const who = label ?? (await actorLabel(ctx));
  await ctx.tx.execute(sql`
    INSERT INTO public.pharmacy_line_history (hospital_id, product_id, area, line, from_date, actor_id, actor_label, bulk)
    VALUES (${ctx.actor.hospitalId}, ${productId}, ${area}, ${`${text}${H.by(fromDate, who, bulk)}`.slice(0, 600)},
            ${fromDate}::date, ${ctx.actor.userId}, ${who.slice(0, 160)}, ${bulk})`);
}

function fromToday(ctx: PharmacyCtx, fromDate: string) {
  if (fromDate < localDate(ctx.now)) throw fail("A change runs from today or a later date.");
}

interface Stored {
  id: string;
  name: string;
  generic: string;
  form: string | null;
  unit: string;
  medicine_id: string;
  ven: string | null;
  cls: string | null;
  controlled_class: string | null;
  high_risk: boolean;
  cold_chain: boolean;
  freeze_sensitive: boolean;
  cytotoxic: boolean;
  packs: number[];
  loose: boolean;
  national: boolean;
}

async function stored(ctx: PharmacyCtx, id: string): Promise<Stored> {
  const [p] = rowsOf<Stored>(
    await ctx.tx.execute(sql`
      SELECT p.id, p.name, coalesce(p.generic, cm.generic, p.name) AS generic, coalesce(p.form, cm.form_label) AS form,
             p.issue_unit AS unit, p.medicine_id, p.ven, coalesce(p.therapeutic_class, cm.therapeutic_class) AS cls,
             p.controlled_class, p.high_risk, p.cold_chain, p.freeze_sensitive, p.cytotoxic, p.packs, p.loose,
             coalesce(cm.national_controlled, false) AS national
        FROM public.pharmacy_products p LEFT JOIN public.cat_medicines cm ON cm.id = p.catalogue_medicine_id
       WHERE p.id = ${id} AND p.hospital_id = ${ctx.actor.hospitalId} AND p.active
       FOR UPDATE OF p`),
  );
  if (!p) throw new EmrWriteError("not_found", "That medicine is not stocked here.");
  return { ...p, packs: (p.packs ?? []).map(Number) };
}

const nationalOf = (p: Stored) => p.national || onNationalList(p.generic, p.form);

async function places(ctx: PharmacyCtx) {
  return rowsOf<{ id: string; name: string; kind: string }>(
    await ctx.tx.execute(sql`
      SELECT id, name, kind FROM public.pharmacy_locations
       WHERE hospital_id = ${ctx.actor.hospitalId} AND archived_at IS NULL AND switched_off_at IS NULL
         AND kind IN ('store','dispensing_point','ward')`),
  );
}

async function currentLevels(ctx: PharmacyCtx, p: Stored) {
  const rows = rowsOf<{ place_id: string; level: number | null }>(
    await ctx.tx.execute(sql`
      SELECT DISTINCT ON (coalesce(location_id, dispensing_point_id)) coalesce(location_id, dispensing_point_id) AS place_id, level
        FROM public.pharmacy_reorder_levels
       WHERE hospital_id = ${ctx.actor.hospitalId}
         AND (product_id = ${p.id} OR (product_id IS NULL AND medicine_id = ${p.medicine_id}))
       ORDER BY coalesce(location_id, dispensing_point_id), set_at DESC`),
  );
  return new Map(rows.map((r) => [r.place_id, r.level ?? 0]));
}

async function writeLevel(
  ctx: PharmacyCtx,
  p: Pick<Stored, "id" | "medicine_id">,
  place: { id: string; kind: string },
  level: number | null,
  fromDate: string,
) {
  await ctx.tx.execute(sql`
    INSERT INTO public.pharmacy_reorder_levels (hospital_id, dispensing_point_id, medicine_id, level, set_by, location_id,
      product_id, valid_from)
    VALUES (${ctx.actor.hospitalId}, ${place.kind === "dispensing_point" ? place.id : null}::uuid, ${p.medicine_id},
            ${level && level > 0 ? level : null}::int, ${ctx.actor.userId}, ${place.id}, ${p.id}, ${fromDate}::date)`);
}

async function currentPrices(ctx: PharmacyCtx, productId: string) {
  const rows = rowsOf<{ payer_id: string; price: number | null; free: boolean }>(
    await ctx.tx.execute(sql`
      SELECT DISTINCT ON (payer_id) payer_id, price_ugx AS price, free FROM public.pharmacy_product_prices
       WHERE hospital_id = ${ctx.actor.hospitalId} AND product_id = ${productId} AND from_date <= ${localDate(ctx.now)}::date
       ORDER BY payer_id, from_date DESC, created_at DESC`),
  );
  return new Map(rows.map((r) => [r.payer_id, r]));
}

async function payers(ctx: PharmacyCtx) {
  await ctx.tx.execute(sql`
    INSERT INTO public.pharmacy_payers (hospital_id, code, name, kind)
    VALUES (${ctx.actor.hospitalId}, 'cash', 'Cash', 'cash') ON CONFLICT DO NOTHING`);
  return rowsOf<{ id: string; code: string; name: string }>(
    await ctx.tx.execute(sql`SELECT id, code, name FROM public.pharmacy_payers
      WHERE hospital_id = ${ctx.actor.hospitalId} AND active ORDER BY kind <> 'cash', created_at`),
  );
}

async function writePrice(
  ctx: PharmacyCtx,
  productId: string,
  payerId: string,
  price: number | null,
  fromDate: string,
) {
  await ctx.tx.execute(sql`
    INSERT INTO public.pharmacy_product_prices (hospital_id, product_id, payer_id, price_ugx, free, from_date, source, set_by)
    VALUES (${ctx.actor.hospitalId}, ${productId}, ${payerId}, ${price}::int, ${price === null}, ${fromDate}::date,
            'typed', ${ctx.actor.userId})`);
}

const flagsText = (f: Record<keyof typeof FLAGS, boolean>) =>
  (Object.keys(FLAGS) as (keyof typeof FLAGS)[])
    .filter((k) => f[k])
    .map((k) => FLAGS[k][0])
    .join(", ");

/* ─── Save a line (§4) ───────────────────────────────────────────────── */

const Price = z.number().int().min(1).max(100_000_000);
export const SaveLineInput = z.object({
  id: z.uuid(),
  fromDate: day,
  ven: z.enum(["V", "E", "N"]).nullable(),
  cls: z.string().trim().min(2).max(80).nullable(),
  flags: z.object({
    controlled: z.boolean(),
    high: z.boolean(),
    cold: z.boolean(),
    freeze: z.boolean(),
    cyto: z.boolean(),
  }),
  packs: z.array(z.number().int().min(1).max(1_000_000)).max(20),
  loose: z.boolean(),
  free: z.boolean(),
  prices: z.record(z.uuid(), Price.nullable()),
  levels: z.record(z.uuid(), z.number().int().min(0).max(10_000_000).nullable()),
  brands: z
    .array(
      z.object({
        id: z.uuid().nullable(),
        name: z.string().trim().min(1).max(120),
        maker: z.string().trim().min(1).max(120).nullable(),
        price: Price.nullable(),
      }),
    )
    .max(40),
});

export async function saveLine(ctx: PharmacyCtx, input: z.infer<typeof SaveLineInput>) {
  const c = can(ctx);
  if (!c.levels) throw forbid();
  if (!input.packs.length && !input.loose) throw fail(M.row.needPack);
  fromToday(ctx, input.fromDate);
  const p = await stored(ctx, input.id);
  const from = input.fromDate;
  const lines: [string, string][] = [];
  const unit = p.unit;

  const wasFlags = {
    controlled: p.controlled_class !== null,
    high: p.high_risk,
    cold: p.cold_chain,
    freeze: p.freeze_sensitive,
    cyto: p.cytotoxic,
  };
  const flagsChanged = (Object.keys(wasFlags) as (keyof typeof wasFlags)[]).some(
    (k) => wasFlags[k] !== input.flags[k],
  );
  const identityChanged =
    (input.ven ?? null) !== (p.ven ?? null) || (input.cls ?? null) !== (p.cls ?? null);
  if ((flagsChanged || identityChanged) && !c.edit) throw forbid();
  if (wasFlags.controlled && !input.flags.controlled && nationalOf(p))
    throw fail(M.row.lockedError(p.generic));

  if ((input.ven ?? null) !== (p.ven ?? null))
    lines.push([
      "ven",
      H.ven(p.ven ? VEN[p.ven as "V"] : "Not set", input.ven ? VEN[input.ven] : "Not set"),
    ]);
  if ((input.cls ?? null) !== (p.cls ?? null))
    lines.push(["cls", H.cls(p.cls ?? "Not set", input.cls ?? "Not set")]);
  if (flagsChanged) lines.push(["handling", H.handling(flagsText(input.flags))]);
  const packsNow = [...input.packs].sort((a, b) => a - b);
  const packsWere = [...p.packs].sort((a, b) => a - b);
  if (packsNow.join(",") !== packsWere.join(",") || input.loose !== p.loose)
    lines.push([
      "packs",
      H.packs(
        [...packsNow.map(String), ...(input.loose ? [M.grid.loose] : [])].join(" · ") ||
          M.grid.noPacks,
      ),
    ]);
  await ctx.tx.execute(sql`
    UPDATE public.pharmacy_products SET ven = ${input.ven}, therapeutic_class = ${input.cls},
      controlled_class = CASE WHEN ${input.flags.controlled} THEN coalesce(controlled_class, 'controlled') ELSE NULL END,
      high_risk = ${input.flags.high}, cold_chain = ${input.flags.cold}, freeze_sensitive = ${input.flags.freeze},
      cytotoxic = ${input.flags.cyto}, packs = ${intArray(packsNow)}::int[], loose = ${input.loose}, updated_at = now()
     WHERE id = ${p.id}`);

  // Levels per place.
  const ps = await places(ctx);
  const was = await currentLevels(ctx, p);
  const changedLevels: string[] = [];
  for (const [placeId, level] of Object.entries(input.levels)) {
    const place = ps.find((x) => x.id === placeId);
    if (!place) continue;
    if ((was.get(placeId) ?? 0) === (level ?? 0)) continue;
    await writeLevel(ctx, p, place, level, from);
    changedLevels.push(
      level
        ? `${place.name.split(" · ")[0]} ${level.toLocaleString("en-US")}`
        : `${place.name.split(" · ")[0]} ${M.row.notKept.toLowerCase()}`,
    );
  }
  if (changedLevels.length)
    lines.push(["levels", H.levels(`${changedLevels.join(" · ")} ${unit}s`)]);

  // Prices and free.
  const pay = await payers(ctx);
  const cash = pay.find((x) => x.code === "cash")!;
  const cur = await currentPrices(ctx, p.id);
  const wasFree = cur.get(cash.id)?.free === true;
  if (input.free !== wasFree) {
    if (!c.edit) throw forbid();
    if (input.free) for (const x of pay) await writePrice(ctx, p.id, x.id, null, from);
    else {
      const cashPrice = input.prices[cash.id];
      if (!cashPrice) throw fail(M.row.needCash);
      for (const x of pay) await writePrice(ctx, p.id, x.id, input.prices[x.id] ?? cashPrice, from);
    }
    lines.push(["free", H.free(input.free)]);
  }
  if (!input.free)
    for (const x of pay) {
      const v = input.prices[x.id];
      const before = cur.get(x.id);
      const beforePrice = before && !before.free ? Number(before.price) : null;
      if (!v || v === beforePrice) continue;
      if (!c.edit) throw forbid();
      if (input.free === wasFree) await writePrice(ctx, p.id, x.id, v, from);
      lines.push([
        "price",
        H.price(
          x.name,
          beforePrice ? ugx(beforePrice) : H.priceNotSet,
          `${ugx(v)} ${M.grid.per(unit)}`,
        ),
      ]);
    }

  // Brands: added, removed, repriced.
  const brandRows = rowsOf<{
    id: string;
    brand: string;
    maker: string | null;
    price: number | null;
  }>(
    await ctx.tx
      .execute(sql`SELECT id, brand, maker, price_ugx AS price FROM public.pharmacy_line_brands
      WHERE product_id = ${p.id} AND removed_at IS NULL`),
  );
  const brandNotes: string[] = [];
  const keep = new Set(input.brands.filter((b) => b.id).map((b) => b.id!));
  for (const b of brandRows)
    if (!keep.has(b.id)) {
      if (!c.edit) throw forbid();
      await ctx.tx
        .execute(sql`UPDATE public.pharmacy_line_brands SET removed_at = now(), removed_by = ${ctx.actor.userId}
        WHERE id = ${b.id}`);
      brandNotes.push(`removed ${b.brand}`);
    }
  const names = new Set<string>();
  for (const b of input.brands) {
    const k = b.name.toLowerCase();
    if (names.has(k)) throw fail(M.row.brandDup(b.name));
    names.add(k);
    const old = brandRows.find((x) => x.id === b.id);
    if (!b.id) {
      if (!c.edit) throw forbid();
      await ctx.tx
        .execute(sql`INSERT INTO public.pharmacy_line_brands (hospital_id, product_id, brand, maker, price_ugx, added_by)
        VALUES (${ctx.actor.hospitalId}, ${p.id}, ${b.name}, ${b.maker}, ${b.price}::int, ${ctx.actor.userId})`);
      brandNotes.push(`added ${b.name}${b.price ? ` at ${ugx(b.price)}` : ""}`);
    } else if (old && (old.price === null ? null : Number(old.price)) !== b.price) {
      if (!c.edit) throw forbid();
      await ctx.tx.execute(
        sql`UPDATE public.pharmacy_line_brands SET price_ugx = ${b.price}::int WHERE id = ${b.id}`,
      );
      brandNotes.push(`${b.name} ${b.price ? ugx(b.price) : "same as the generic"}`);
    }
  }
  if (brandNotes.length) lines.push(["brands", H.brands(brandNotes.join(", "))]);

  if (lines.length) {
    const who = await actorLabel(ctx);
    for (const [area, text] of lines) await history(ctx, p.id, area, text, from, false, who);
  }
  return { id: p.id, changed: lines.length };
}

/* ─── One-tap line actions ───────────────────────────────────────────── */

export const LineInput = z.object({ id: z.uuid() });

export async function markReviewed(ctx: PharmacyCtx, input: z.infer<typeof LineInput>) {
  if (!can(ctx).review) throw forbid();
  const p = await stored(ctx, input.id);
  await ctx.tx
    .execute(sql`UPDATE public.pharmacy_products SET reviewed_at = now(), reviewed_by = ${ctx.actor.userId}
    WHERE id = ${p.id}`);
  await history(ctx, p.id, "review", M.row.reviewedLine, null);
  return { id: p.id };
}

export async function stopStocking(ctx: PharmacyCtx, input: z.infer<typeof LineInput>) {
  if (!can(ctx).edit) throw forbid();
  const p = await stored(ctx, input.id);
  await ctx.tx.execute(sql`UPDATE public.pharmacy_products SET active = false, stopped_at = now(),
    stopped_by = ${ctx.actor.userId}, updated_at = now() WHERE id = ${p.id}`);
  await history(ctx, p.id, "stopped", H.stopped, localDate(ctx.now));
  return { id: p.id };
}

/* ─── Add lines (§11) ────────────────────────────────────────────────── */

export const LineCellInput = z.object({
  id: z.uuid(),
  form: z.string().trim().min(2).max(60).nullable().optional(),
  route: z.string().trim().min(2).max(40).nullable().optional(),
  flags: SaveLineInput.shape.flags.optional(),
});

/**
 * One cell changed from the table: form, route or handling. Form and route are part of the line's identity, so a
 * change that makes it the same as another line is refused; a form that puts it on the national controlled list
 * turns Controlled on.
 */
export async function setLineCell(ctx: PharmacyCtx, input: z.infer<typeof LineCellInput>) {
  if (!can(ctx).edit) throw forbid();
  const p = await stored(ctx, input.id);
  if (input.form !== undefined || input.route !== undefined) {
    const [cur] = rowsOf<{ strength: string | null; form: string | null; route: string | null }>(
      await ctx.tx.execute(sql`
        SELECT p.strength, coalesce(p.form, cm.form_label) AS form, coalesce(p.route, cm.route_label) AS route
          FROM public.pharmacy_products p LEFT JOIN public.cat_medicines cm ON cm.id = p.catalogue_medicine_id
         WHERE p.id = ${p.id}`),
    );
    const form = input.form !== undefined ? input.form : cur!.form;
    const route = input.route !== undefined ? input.route : cur!.route;
    const same = (a: string | null, b: string | null) =>
      (a ?? "").toLowerCase() === (b ?? "").toLowerCase();
    if (!same(form, cur!.form) || !same(route, cur!.route)) {
      const as = await stockedAs(ctx, { generic: p.generic, strength: cur!.strength, form, route });
      if (as) throw fail(M.catalogue.alreadyAs(as));
      const national = onNationalList(p.generic, form);
      await ctx.tx.execute(sql`
        UPDATE public.pharmacy_products SET generic = ${p.generic}, form = ${form}, route = ${route},
          controlled_class = CASE WHEN ${national} THEN coalesce(controlled_class, 'controlled') ELSE controlled_class END,
          updated_at = now()
         WHERE id = ${p.id}`);
      if (!same(form, cur!.form))
        await history(ctx, p.id, "form", H.form(cur!.form ?? "Not set", form ?? "Not set"), null);
      if (!same(route, cur!.route))
        await history(
          ctx,
          p.id,
          "route",
          H.route(cur!.route ?? "Not set", route ?? "Not set"),
          null,
        );
    }
  }
  if (input.flags) {
    const f = input.flags;
    if (p.controlled_class !== null && !f.controlled && nationalOf(p))
      throw fail(M.row.lockedError(p.generic));
    await ctx.tx.execute(sql`
      UPDATE public.pharmacy_products SET
        controlled_class = CASE WHEN ${f.controlled} THEN coalesce(controlled_class, 'controlled') ELSE NULL END,
        high_risk = ${f.high}, cold_chain = ${f.cold}, freeze_sensitive = ${f.freeze}, cytotoxic = ${f.cyto},
        updated_at = now()
       WHERE id = ${p.id}`);
    await history(ctx, p.id, "handling", H.handling(flagsText(f)), null);
  }
  return { id: p.id };
}

async function stockedAs(
  ctx: PharmacyCtx,
  ident: { generic: string; strength: string | null; form: string | null; route: string | null },
) {
  const key = lineIdentityKey(ident);
  const rows = rowsOf<{ name: string; k: string }>(
    await ctx.tx.execute(sql`
      SELECT p.name, lower(coalesce(p.generic, cm.generic, '') || '|' || coalesce(p.strength, '') || '|' ||
             coalesce(p.form, cm.form_label, '') || '|' || coalesce(p.route, cm.route_label, '')) AS k
        FROM public.pharmacy_products p LEFT JOIN public.cat_medicines cm ON cm.id = p.catalogue_medicine_id
       WHERE p.hospital_id = ${ctx.actor.hospitalId} AND p.active
         AND lower(coalesce(p.generic, cm.generic, p.name)) = lower(${ident.generic})`),
  );
  return rows.find((r) => r.k === key)?.name ?? null;
}

export const CatalogueAddInput = z.object({
  ids: z.array(z.uuid()).min(1).max(50),
  /** The unit chosen for a medicine the catalogue gives none. */
  units: z.record(z.uuid(), z.string().trim().min(2).max(40)).optional(),
});

export async function addLinesFromCatalogue(
  ctx: PharmacyCtx,
  input: z.infer<typeof CatalogueAddInput>,
) {
  if (!can(ctx).edit) throw forbid();
  const who = await actorLabel(ctx);
  const added: string[] = [];
  const refused: string[] = [];
  for (const id of input.ids) {
    const [m] = rowsOf<{
      name: string;
      generic: string | null;
      strength: string | null;
      form: string | null;
      route: string | null;
      cls: string | null;
      grp: string | null;
      sale: string | null;
      flags: Record<string, boolean> | string;
      packs: number[] | null;
      national: boolean;
    }>(
      await ctx.tx.execute(sql`
        SELECT display_name AS name, generic, strength_text AS strength, form_label AS form, route_label AS route,
               therapeutic_class AS cls, pharm_group AS grp, sale_category AS sale, default_flags AS flags,
               default_packs AS packs, national_controlled AS national
          FROM public.cat_medicines WHERE id = ${id} AND status = 'active'`),
    );
    if (!m) continue;
    const generic = m.generic ?? m.name;
    const as = await stockedAs(ctx, {
      generic,
      strength: m.strength,
      form: m.form,
      route: m.route,
    });
    if (as) {
      refused.push(M.catalogue.refused(m.name, M.catalogue.alreadyAs(as)));
      continue;
    }
    const r = await productForPick(ctx, { medicineId: id, issueUnit: input.units?.[id] });
    if (!("id" in r)) {
      const note = r.note === STOCK_UP_POLISH.make.noIssueUnit ? M.catalogue.needUnit : r.note;
      refused.push(M.catalogue.refused(m.name, note));
      continue;
    }
    const f = typeof m.flags === "string" ? JSON.parse(m.flags) : (m.flags ?? {});
    const controlled = f.controlled === true || m.national || onNationalList(generic, m.form);
    await ctx.tx.execute(sql`
      UPDATE public.pharmacy_products SET generic = ${generic}, form = ${m.form}, route = ${m.route},
        therapeutic_class = ${m.cls}, pharm_group = ${m.grp}, sale_category = ${m.sale},
        controlled_class = CASE WHEN ${controlled} THEN coalesce(controlled_class, 'controlled') ELSE controlled_class END,
        high_risk = ${f.high === true}, cold_chain = ${f.cold === true}, freeze_sensitive = ${f.freeze === true},
        cytotoxic = ${f.cyto === true}, packs = ${intArray((m.packs ?? []).map(Number))}::int[], updated_at = now()
       WHERE id = ${r.id} AND hospital_id = ${ctx.actor.hospitalId}`);
    await history(ctx, r.id, "added", H.added, null, false, who);
    added.push(r.id);
  }
  return { id: ctx.actor.hospitalId, added: added.length, refused };
}

export const LocalInput = z.object({
  clientKey: z.uuid(),
  generic: z.string().trim().min(2).max(160),
  strength: z.string().trim().min(1).max(60),
  form: z.string().trim().min(2).max(60).nullable(),
  route: z.string().trim().min(2).max(60).nullable(),
  unit: z.string().trim().min(2).max(40),
  cls: z.string().trim().min(2).max(80).nullable(),
  packs: z.array(z.number().int().min(1).max(1_000_000)).max(20),
  reason: z.enum(Object.keys(LOCAL_REASONS) as [keyof typeof LOCAL_REASONS]),
});

export async function addLocalLine(ctx: PharmacyCtx, input: z.infer<typeof LocalInput>) {
  if (!can(ctx).edit) throw forbid();
  const [again] = rowsOf<{ id: string }>(
    await ctx.tx.execute(sql`SELECT id FROM public.pharmacy_products WHERE id = ${input.clientKey}
      AND hospital_id = ${ctx.actor.hospitalId}`),
  );
  if (again) return { id: again.id };
  const as = await stockedAs(ctx, input);
  if (as) throw new EmrWriteError("conflict", M.local.dup(as));
  const name = [input.generic, input.strength, input.form?.toLowerCase()]
    .filter(Boolean)
    .join(" ")
    .slice(0, 160);
  const controlled = onNationalList(input.generic, input.form);
  await ctx.tx.execute(sql`
    INSERT INTO public.pharmacy_products (id, hospital_id, medicine_id, name, strength, issue_unit, item_kind, generic,
      form, route, therapeutic_class, packs, controlled_class, hand_added, local_reason, created_by)
    VALUES (${input.clientKey}, ${ctx.actor.hospitalId}, ${catalogueKey(randomUUID())}, ${name}, ${input.strength},
      ${input.unit}, 'local_medicine', ${input.generic}, ${input.form}, ${input.route}, ${input.cls},
      ${intArray(input.packs)}::int[], ${controlled ? "controlled" : null}, true, ${input.reason}, ${ctx.actor.userId})`);
  await history(ctx, input.clientKey, "added", H.addedLocal(LOCAL_REASONS[input.reason]), null);
  return { id: input.clientKey };
}

/* ─── Payers and the price rule (§4.4) ───────────────────────────────── */

export const PayerInput = z.object({
  name: z.string().trim().min(2).max(120),
  kind: z.enum(Object.keys(PAYER_KINDS) as [keyof typeof PAYER_KINDS]),
});

export async function addPayer(ctx: PharmacyCtx, input: z.infer<typeof PayerInput>) {
  if (!can(ctx).edit) throw forbid();
  const all = await payers(ctx);
  if (all.some((x) => x.name.toLowerCase() === input.name.toLowerCase()))
    throw new EmrWriteError("conflict", M.row.payerDup(input.name));
  const code = `${
    input.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "")
      .slice(0, 30) || "payer"
  }_${randomUUID().slice(0, 6)}`;
  const [r] = rowsOf<{ id: string }>(
    await ctx.tx
      .execute(sql`INSERT INTO public.pharmacy_payers (hospital_id, code, name, kind, created_by)
      VALUES (${ctx.actor.hospitalId}, ${code}, ${input.name}, ${input.kind}, ${ctx.actor.userId}) RETURNING id`),
  );
  return { id: r!.id };
}

export const RulePctInput = z.object({ pct: z.number().int().min(0).max(500) });

export async function setPriceRulePct(ctx: PharmacyCtx, input: z.infer<typeof RulePctInput>) {
  if (!ctx.manages) throw forbid();
  const [r] = rowsOf<{ id: string }>(
    await ctx.tx
      .execute(sql`INSERT INTO public.pharmacy_price_rules (hospital_id, multiplier, rounding_step, from_date, set_by)
      VALUES (${ctx.actor.hospitalId}, ${(1 + input.pct / 100).toFixed(3)}::numeric, 50, ${localDate(ctx.now)}::date,
              ${ctx.actor.userId}) RETURNING id`),
  );
  return { id: r!.id };
}

/* ─── Bulk (§8) ──────────────────────────────────────────────────────── */

const Ids = z.array(z.uuid()).min(1).max(500);
export const BulkVenInput = z.object({ ids: Ids, ven: z.enum(["V", "E", "N"]) });
export const BulkLevelInput = z.object({
  ids: Ids,
  placeId: z.uuid(),
  level: z.number().int().min(1).max(10_000_000),
});
export const BulkFreeInput = z.object({ ids: Ids });

export async function bulkSetVen(ctx: PharmacyCtx, input: z.infer<typeof BulkVenInput>) {
  if (!can(ctx).edit) throw forbid();
  const who = await actorLabel(ctx);
  const today = localDate(ctx.now);
  for (const id of input.ids) {
    const p = await stored(ctx, id);
    if (p.ven === input.ven) continue;
    await ctx.tx.execute(
      sql`UPDATE public.pharmacy_products SET ven = ${input.ven}, updated_at = now() WHERE id = ${id}`,
    );
    await history(
      ctx,
      id,
      "ven",
      H.ven(p.ven ? VEN[p.ven as "V"] : "Not set", VEN[input.ven]),
      today,
      true,
      who,
    );
  }
  return { id: ctx.actor.hospitalId };
}

export async function bulkSetLevel(ctx: PharmacyCtx, input: z.infer<typeof BulkLevelInput>) {
  if (!can(ctx).levels) throw forbid();
  const place = (await places(ctx)).find((p) => p.id === input.placeId);
  if (!place) throw fail(M.bulk.chooseLevel);
  const who = await actorLabel(ctx);
  const today = localDate(ctx.now);
  for (const id of input.ids) {
    const p = await stored(ctx, id);
    await writeLevel(ctx, p, place, input.level, today);
    await history(
      ctx,
      id,
      "levels",
      H.levels(`${place.name.split(" · ")[0]} ${qty(input.level, p.unit)}`),
      today,
      true,
      who,
    );
  }
  return { id: ctx.actor.hospitalId };
}

export async function bulkMarkFree(ctx: PharmacyCtx, input: z.infer<typeof BulkFreeInput>) {
  if (!can(ctx).edit) throw forbid();
  const who = await actorLabel(ctx);
  const today = localDate(ctx.now);
  const pay = await payers(ctx);
  const cash = pay.find((x) => x.code === "cash")!;
  for (const id of input.ids) {
    await stored(ctx, id);
    if ((await currentPrices(ctx, id)).get(cash.id)?.free) continue;
    for (const x of pay) await writePrice(ctx, id, x.id, null, today);
    await history(ctx, id, "free", H.free(true), today, true, who);
  }
  return { id: ctx.actor.hospitalId };
}

/* ─── Top-ups (§4.3, §8) ─────────────────────────────────────────────── */

export const TopUpInput = z.object({
  items: z
    .array(
      z.object({
        clientKey: z.uuid(),
        lineId: z.uuid(),
        placeId: z.uuid(),
        qty: z.number().int().min(1).max(10_000_000),
      }),
    )
    .min(1)
    .max(500),
});

/** A place's request to the main store (Stock › Issue), or the store's line on the next order. */
export async function requestTopUps(ctx: PharmacyCtx, input: z.infer<typeof TopUpInput>) {
  if (!can(ctx).request) throw forbid();
  const ps = await places(ctx);
  const store = ps.find((p) => p.kind === "store");
  if (!store) throw fail(M.row.noStore);
  let requests = 0;
  let orders = 0;
  for (const it of input.items) {
    const p = await stored(ctx, it.lineId);
    if (it.placeId === store.id) {
      const r = rowsOf<{ id: string }>(
        await ctx.tx
          .execute(sql`INSERT INTO public.pharmacy_order_asks (id, hospital_id, product_id, quantity, asked_by)
          VALUES (${it.clientKey}, ${ctx.actor.hospitalId}, ${p.id}, ${it.qty}, ${ctx.actor.userId})
          ON CONFLICT DO NOTHING RETURNING id`),
      );
      if (r.length) orders++;
      continue;
    }
    if (!ps.some((x) => x.id === it.placeId)) continue;
    const open = rowsOf<{ id: string }>(
      await ctx.tx.execute(sql`SELECT r.id FROM public.pharmacy_requisitions r
        JOIN public.pharmacy_requisition_lines l ON l.requisition_id = r.id
       WHERE r.hospital_id = ${ctx.actor.hospitalId} AND r.state = 'raised' AND l.product_id = ${p.id}
         AND r.requesting_location_id = ${it.placeId}`),
    );
    if (open.length) continue;
    const r = rowsOf<{ id: string }>(
      await ctx.tx
        .execute(sql`INSERT INTO public.pharmacy_requisitions (id, hospital_id, requesting_location_id,
          issuing_location_id, raised_by)
        VALUES (${it.clientKey}, ${ctx.actor.hospitalId}, ${it.placeId}, ${store.id}, ${ctx.actor.userId})
        ON CONFLICT DO NOTHING RETURNING id`),
    );
    if (!r.length) continue;
    await ctx.tx
      .execute(sql`INSERT INTO public.pharmacy_requisition_lines (requisition_id, product_id, quantity_asked)
      VALUES (${it.clientKey}, ${p.id}, ${it.qty})`);
    requests++;
  }
  return { id: ctx.actor.hospitalId, requests, orders };
}

export const UndoTopUpInput = z.object({ id: z.uuid(), kind: z.enum(["request", "order"]) });

export async function undoTopUp(ctx: PharmacyCtx, input: z.infer<typeof UndoTopUpInput>) {
  if (!can(ctx).request) throw forbid();
  const r = rowsOf<{ id: string }>(
    input.kind === "order"
      ? await ctx.tx.execute(sql`UPDATE public.pharmacy_order_asks SET withdrawn_at = now()
          WHERE id = ${input.id} AND hospital_id = ${ctx.actor.hospitalId} AND withdrawn_at IS NULL AND order_id IS NULL
          RETURNING id`)
      : await ctx.tx
          .execute(sql`UPDATE public.pharmacy_requisitions SET state = 'withdrawn', closed_at = now()
          WHERE id = ${input.id} AND hospital_id = ${ctx.actor.hospitalId} AND state = 'raised' RETURNING id`),
  );
  if (!r.length)
    throw new EmrWriteError("conflict", "It has already been taken; it can no longer be undone.");
  return { id: input.id };
}

/* ─── Rules (§9.3) ───────────────────────────────────────────────────── */

const ruleDefault = (group: string, key: string): string | null => {
  if (group === "rx") return RX_CHECKS[key] ?? null;
  const g = RULE_GROUPS.find((x) => x.id === group);
  return g ? ((g.rules as readonly string[])[Number(key)] ?? null) : null;
};

export const ProposeInput = z.object({
  clientKey: z.uuid(),
  group: z.string().regex(/^[a-z_]{2,40}$/),
  /** Omitted for a new rule on one line. */
  key: z.string().min(1).max(120).nullable(),
  productId: z.uuid().nullable(),
  newText: z.string().trim().min(2).max(400),
  reason: z.string().trim().min(2).max(300),
});

export async function proposeRuleChange(ctx: PharmacyCtx, input: z.infer<typeof ProposeInput>) {
  if (!can(ctx).propose) throw forbid();
  const line = input.group === "line";
  if (line !== (input.productId !== null)) throw fail(M.refused.failed);
  if (line) await stored(ctx, input.productId!);
  else if (!RULE_GROUPS.some((g) => g.id === input.group)) throw fail(M.refused.failed);
  const key = input.key ?? `${input.productId}:${input.clientKey}`;
  const [cur] = rowsOf<{ text: string }>(
    await ctx.tx.execute(sql`SELECT text FROM public.pharmacy_rules
      WHERE hospital_id = ${ctx.actor.hospitalId} AND rule_group = ${input.group} AND key = ${key}`),
  );
  const old = cur?.text ?? ruleDefault(input.group, key);
  if (old !== null && old.trim() === input.newText) throw fail(M.rulesDlg.typeFirst);
  const r = rowsOf<{ id: string }>(
    await ctx.tx
      .execute(sql`INSERT INTO public.pharmacy_rule_proposals (id, hospital_id, rule_group, key, old_text, new_text,
        reason, product_id, proposed_by)
      VALUES (${input.clientKey}, ${ctx.actor.hospitalId}, ${input.group}, ${key}, ${old}, ${input.newText},
        ${input.reason}, ${input.productId}, ${ctx.actor.userId})
      ON CONFLICT DO NOTHING RETURNING id`),
  );
  if (!r.length)
    throw new EmrWriteError("conflict", "A change to this rule is already waiting for signatures.");
  return { id: r[0]!.id };
}

export const SignInput = z.object({ id: z.uuid(), role: z.enum(["in_charge", "second"]) });

export async function signRuleProposal(ctx: PharmacyCtx, input: z.infer<typeof SignInput>) {
  const c = can(ctx);
  if (input.role === "in_charge" ? !c.signInCharge : !c.signSecond) throw forbid();
  const [p] = rowsOf<{ id: string; product_id: string | null; new_text: string }>(
    await ctx.tx.execute(sql`SELECT id, product_id, new_text FROM public.pharmacy_rule_proposals
      WHERE id = ${input.id} AND hospital_id = ${ctx.actor.hospitalId} AND status = 'pending' FOR UPDATE`),
  );
  if (!p) throw new EmrWriteError("conflict", "That proposal is closed.");
  const [other] = rowsOf<{ signed_by: string }>(
    await ctx.tx.execute(
      sql`SELECT signed_by FROM public.pharmacy_rule_signatures WHERE proposal_id = ${p.id}`,
    ),
  );
  if (other?.signed_by === ctx.actor.userId)
    throw new EmrWriteError("forbidden", "The second signature is from a different person.");
  await ctx.tx
    .execute(sql`INSERT INTO public.pharmacy_rule_signatures (proposal_id, role, signed_by)
    VALUES (${p.id}, ${input.role}, ${ctx.actor.userId}) ON CONFLICT DO NOTHING`);
  const [s] = rowsOf<{ status: string }>(
    await ctx.tx.execute(sql`SELECT status FROM public.pharmacy_rule_proposals WHERE id = ${p.id}`),
  );
  const applied = s?.status === "applied";
  if (applied && p.product_id)
    await history(ctx, p.product_id, "rule", H.rule(p.new_text), localDate(ctx.now));
  return { id: p.id, applied };
}

export async function withdrawRuleProposal(ctx: PharmacyCtx, input: z.infer<typeof LineInput>) {
  if (!can(ctx).propose) throw forbid();
  const r = rowsOf<{ id: string }>(
    await ctx.tx
      .execute(sql`UPDATE public.pharmacy_rule_proposals SET status = 'withdrawn', closed_at = now()
      WHERE id = ${input.id} AND hospital_id = ${ctx.actor.hospitalId} AND status = 'pending' RETURNING id`),
  );
  if (!r.length) throw new EmrWriteError("conflict", "That proposal is closed.");
  return { id: input.id };
}

/* ─── Saved views (§6) ───────────────────────────────────────────────── */

export const ViewInput = z.object({
  clientKey: z.uuid(),
  name: z.string().trim().min(1).max(80),
  conds: z
    .array(
      z.object({
        join: z.enum(["AND", "OR"]),
        col: z.string().max(20),
        op: z.string().max(30),
        val: z.string().max(120),
      }),
    )
    .min(1)
    .max(20),
});

export async function saveView(ctx: PharmacyCtx, input: z.infer<typeof ViewInput>) {
  await ctx.tx
    .execute(sql`INSERT INTO public.pharmacy_saved_views (id, hospital_id, user_id, name, conditions)
    VALUES (${input.clientKey}, ${ctx.actor.hospitalId}, ${ctx.actor.userId}, ${input.name},
            ${JSON.stringify(input.conds)}::jsonb) ON CONFLICT DO NOTHING`);
  return { id: input.clientKey };
}

export async function deleteView(ctx: PharmacyCtx, input: z.infer<typeof LineInput>) {
  await ctx.tx.execute(sql`UPDATE public.pharmacy_saved_views SET deleted_at = now()
    WHERE id = ${input.id} AND hospital_id = ${ctx.actor.hospitalId} AND user_id = ${ctx.actor.userId}`);
  return { id: input.id };
}

/* ─── The catalogue (§11) ────────────────────────────────────────────── */

export interface CatalogueItem {
  id: string;
  name: string;
  generic: string;
  strength: string | null;
  form: string | null;
  route: string | null;
  unit: string | null;
  formCode: string | null;
  atc: string | null;
  cls: string | null;
  group: string | null;
  sale: string | null;
  sources: string[];
}

export async function catalogueItems(ctx: PharmacyCtx): Promise<CatalogueItem[]> {
  const rows = rowsOf<Record<string, unknown>>(
    await ctx.tx.execute(sql`
      SELECT id, display_name, coalesce(generic, display_name) AS generic, strength_text, form_label, route_label,
             issue_unit_kind, dose_form_code, atc_level1, therapeutic_class, pharm_group, sale_category,
             -- The EMHSLU seed (0251) set the list's level and VEN but never the tag; read either as on the list.
             CASE WHEN (emhslu_level IS NOT NULL OR emhslu_ven IS NOT NULL) AND NOT 'EMHSLU' = ANY (sources)
                  THEN sources || 'EMHSLU'::text ELSE sources END AS sources
        FROM public.cat_medicines WHERE status = 'active' AND kind = 'medicine'
       ORDER BY 3, strength_text LIMIT 5000`),
  );
  return rows.map((r) => ({
    id: String(r.id),
    name: String(r.display_name),
    generic: String(r.generic),
    strength: (r.strength_text as string | null) ?? null,
    form: (r.form_label as string | null) ?? null,
    route: (r.route_label as string | null) ?? null,
    unit: (r.issue_unit_kind as string | null) ?? null,
    formCode: (r.dose_form_code as string | null) ?? null,
    atc: (r.atc_level1 as string | null) ?? null,
    cls: (r.therapeutic_class as string | null) ?? null,
    group: (r.pharm_group as string | null) ?? null,
    sale: (r.sale_category as string | null) ?? null,
    sources: ((r.sources as string[] | null) ?? []).map(String),
  }));
}
