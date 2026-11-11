import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";

import { KIT_RANGE } from "@/content/pharmacy-rules";
import items from "@/lib/pharmacy/supplies/seed-items.json";

/**
 * The 28 prototype supplies (21 health, 7 lab), each linked to its EMHSLU row so its type and level are derived, with
 * shelves E and L, stock on them, and open ward requisitions that carry supply lines. Synthetic, dev hospitals only.
 * Needs 0277 and 0278, and the store seed first.
 */
type Db = {
  execute: (q: ReturnType<typeof sql>) => Promise<unknown>;
};
const rows = <T>(r: unknown) => (Array.isArray(r) ? r : (r as { rows: T[] }).rows) as T[];

const STOCK: Record<string, [no: string, exp: string, bin: string, qty: number]> = {
  glex: ["GL-2709", "2027-09-30", "E-01", 30000],
  sad5: ["AD-2803", "2028-03-31", "E-02", 12000],
  can18: ["CN-2711", "2027-11-30", "E-03", 900],
  gswab: ["GZ-2701", "2027-01-31", "E-04", 1500],
  sbox: ["SB-NOEXP", "2099-12-31", "E-05", 300],
  mrdt: ["RD-2706", "2027-06-30", "L-01", 3000],
  hivd: ["HV-2704", "2027-04-30", "L-02", 1200],
};
const ASKS: [place: string, lines: [key: string, n: number][]][] = [
  [
    "OPD dispensary",
    [
      ["glex", 4000],
      ["mrdt", 1000],
    ],
  ],
  ["Ward 3 · Medical", [["can18", 200]]],
  ["Paediatrics", [["sad5", 600]]],
];

export async function seedSupplies(db: Db, h: string) {
  const one = async <T>(q: ReturnType<typeof sql>) => rows<T>(await db.execute(q))[0];
  const ready = await one<{ ok: boolean }>(
    sql`SELECT to_regclass('public.cat_supply_items') IS NOT NULL AS ok`,
  );
  if (!ready?.ok) return { skipped: "needs 0277 and 0278" };
  const already = await one<{ n: number }>(
    sql`SELECT count(*)::int AS n FROM public.pharmacy_products WHERE hospital_id = ${h} AND supply_item_id IS NOT NULL`,
  );
  if (already!.n) return { skipped: "already seeded" };
  const store = await one<{ id: string }>(
    sql`SELECT id FROM public.pharmacy_locations WHERE hospital_id = ${h} AND kind = 'store' AND closed_at IS NULL ORDER BY created_at LIMIT 1`,
  );
  const who = await one<{ u: string }>(
    sql`SELECT user_id AS u FROM public.pharmacy_roster_people WHERE hospital_id = ${h} AND ended_at IS NULL ORDER BY created_at LIMIT 1`,
  );
  if (!store || !who) return { skipped: "run the roster and store seeds first" };

  const ids: Record<string, string> = {};
  for (const r of items) {
    const si = await one<{ id: string; sterile: boolean; test_kit: boolean; no_expiry: boolean }>(
      sql`SELECT id, sterile, test_kit, no_expiry FROM public.cat_supply_items WHERE name = ${r.emName} AND specification = ${r.emSpec} LIMIT 1`,
    );
    if (!si) throw new Error(`seed: no EMHSLU row for ${r.key}`);
    ids[r.key] = (await one<{ id: string }>(sql`INSERT INTO public.pharmacy_products
        (hospital_id, medicine_id, name, issue_unit, pack_size, created_by, ven, packs, loose, supply_item_id,
         sterile, test_kit, no_expiry, free_issue)
      VALUES (${h}, ${`cat_sup_${randomUUID().replaceAll("-", "_")}`}, ${r.name}, ${r.unit}, ${String(r.packs[0])},
        ${who.u}::uuid, ${r.ven}, ${`{${r.packs.join(",")}}`}::int[], ${r.loose}, ${si.id}::uuid,
        ${r.sterile}, ${r.kit}, ${r.key === "sbox"}, ${r.free})
      RETURNING id`))!.id;
  }

  for (const [code, name] of [
    ["E", "Health supplies (sterile consumables, PPE)"],
    ["L", `Laboratory supplies, kept ${KIT_RANGE}`],
  ] as const)
    await db.execute(sql`INSERT INTO public.pharmacy_shelves (hospital_id, location_id, code, name, controlled, created_by)
      VALUES (${h}, ${store.id}::uuid, ${code}, ${name}, false, ${who.u}::uuid) ON CONFLICT DO NOTHING`);

  for (const [key, [no, exp, bin, qty]] of Object.entries(STOCK)) {
    const b = await one<{ id: string }>(sql`INSERT INTO public.pharmacy_batches
        (hospital_id, location_id, product_id, batch_number, expiry, first_batch_number, first_expiry, created_by)
      VALUES (${h}, ${store.id}::uuid, ${ids[key]}::uuid, ${no}, ${exp}::date, ${no}, ${exp}::date, ${who.u}::uuid) RETURNING id`);
    await db.execute(sql`INSERT INTO public.pharmacy_stock_movements
        (hospital_id, location_id, batch_id, kind, quantity, effective_at, actor_user_id, source_kind)
      VALUES (${h}, ${store.id}::uuid, ${b!.id}::uuid, 'received', ${qty}, now() - interval '30 days', ${who.u}::uuid, 'delivery')`);
    await db.execute(sql`INSERT INTO public.pharmacy_batch_shelves (hospital_id, batch_id, shelf, actor_id)
      VALUES (${h}, ${b!.id}::uuid, ${bin}, ${who.u}::uuid)`);
  }

  for (const [place, lines] of ASKS) {
    const to = await one<{ id: string }>(
      sql`SELECT id FROM public.pharmacy_locations WHERE hospital_id = ${h} AND name = ${place}`,
    );
    if (!to) continue;
    const r = await one<{ id: string }>(sql`INSERT INTO public.pharmacy_requisitions
        (hospital_id, requesting_location_id, issuing_location_id, raised_by, raised_at)
      VALUES (${h}, ${to.id}::uuid, ${store.id}::uuid, ${who.u}::uuid, now()) RETURNING id`);
    for (const [key, n] of lines)
      await db.execute(sql`INSERT INTO public.pharmacy_requisition_lines (requisition_id, product_id, quantity_asked)
        VALUES (${r!.id}::uuid, ${ids[key]}::uuid, ${n})`);
  }
  return { supplies: items.length };
}
