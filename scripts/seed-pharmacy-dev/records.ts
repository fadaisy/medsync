/**
 * Dev seed for Records (rework PRD §6.6; TECH-SPEC §8 "Seeds"): the prototype's `seedLoss` (audit.js) — this month's
 * losses by cause and two slow movers that will expire before they are used — at this hospital's first store.
 * Local and dev only; never imported by the app. Idempotent: every movement carries a `seed-records:` key.
 *
 * ponytail: every loss is booked at the main store (the prototype spreads them over wards, the EPI clinic and the
 * window); add the places when a seed for wards exists. EPI opened-vial wastage comes from the immunisation seed.
 */
import { sql } from "drizzle-orm";

type Db = { execute: (q: ReturnType<typeof sql>) => Promise<unknown> };
const rows = <T>(r: unknown): T[] =>
  (Array.isArray(r) ? r : ((r as { rows?: T[] }).rows ?? [])) as T[];

/** The prototype's medicines and prices (audit.js `P.PRICE`, UGX per issue unit). */
const MEDS: Record<string, { name: string; unit: string; price: number }> = {
  proto_amox: { name: "Amoxicillin capsules", unit: "caps", price: 80 },
  proto_ctx: { name: "Cotrimoxazole tablets", unit: "tabs", price: 40 },
  proto_ceft: { name: "Ceftriaxone injection", unit: "vials", price: 3500 },
  proto_penta: { name: "Pentavalent (DTP-HepB-Hib) vaccine", unit: "doses", price: 3500 },
  proto_ipv: { name: "IPV (inactivated polio) vaccine", unit: "doses", price: 6500 },
  proto_oxy: { name: "Oxytocin injection", unit: "ampoules", price: 1500 },
  proto_ors: { name: "Oral rehydration salts", unit: "sachets", price: 600 },
  proto_ferr: { name: "Ferrous sulphate + folic acid tablets", unit: "tabs", price: 20 },
  proto_amlo: { name: "Amlodipine tablets", unit: "tabs", price: 60 },
};

/** [medicine, batch, expiry, quantity, day of this month, cause, what happened] */
const LOSSES: [string, string, string, number, number, string, string][] = [
  [
    "proto_amox",
    "AX24050",
    "2026-09-30",
    400,
    3,
    "expired",
    "Expired 30 Sep, removed from the shelf",
  ],
  [
    "proto_ctx",
    "CT24112",
    "2026-09-30",
    900,
    7,
    "expired",
    "Expired 30 Sep, removed from the shelf",
  ],
  [
    "proto_ceft",
    "CF25002",
    "2027-03-31",
    3,
    12,
    "damaged",
    "Box dropped on the ward, 3 vials broken",
  ],
  [
    "proto_penta",
    "PE25120",
    "2027-02-28",
    30,
    20,
    "cold_chain",
    "Froze on the 20th: shake test failed",
  ],
  [
    "proto_ipv",
    "IP25041",
    "2027-01-31",
    10,
    20,
    "cold_chain",
    "Froze on the 20th: shake test failed",
  ],
  [
    "proto_oxy",
    "OX25040",
    "2027-02-28",
    10,
    23,
    "cold_chain",
    "Maternity fridge at +8.6 °C for 30 min, discarded",
  ],
  ["proto_ors", "OR25071", "2027-06-30", 12, 25, "damaged", "Water damage under the window"],
];
/** Slow movers: more than will be used before expiry (Scenario 11: amlodipine at risk). */
const SLOW: [string, string, string, number][] = [
  ["proto_ferr", "FF24190", "2026-11-30", 3000],
  ["proto_amlo", "AM24233", "2026-12-31", 4000],
];

export async function seedRecords(db: Db, hospitalId: string) {
  const [actor] = rows<{ user_id: string }>(
    await db.execute(sql`SELECT user_id FROM public.staff_affiliations WHERE hospital_id = ${hospitalId}::uuid
      AND state IN ('approved','active') ORDER BY created_at LIMIT 1`),
  );
  const [store] = rows<{ id: string }>(
    await db.execute(sql`SELECT id FROM public.pharmacy_locations WHERE hospital_id = ${hospitalId}::uuid AND kind = 'store'
      AND switched_off_at IS NULL ORDER BY created_at LIMIT 1`),
  );
  if (!actor || !store) return { skipped: "no staff or no store at this hospital" };

  const product: Record<string, string> = {};
  for (const [medicineId, m] of Object.entries(MEDS)) {
    const [p] = rows<{ id: string }>(
      await db.execute(sql`
      WITH ins AS (
        INSERT INTO public.pharmacy_products (hospital_id, medicine_id, name, issue_unit, price_ugx, created_by)
        SELECT ${hospitalId}::uuid, ${medicineId}, ${m.name}, ${m.unit}, ${m.price}, ${actor.user_id}::uuid
         WHERE NOT EXISTS (SELECT 1 FROM public.pharmacy_products WHERE hospital_id = ${hospitalId}::uuid AND medicine_id = ${medicineId})
        RETURNING id)
      SELECT id FROM ins UNION ALL
      SELECT id FROM public.pharmacy_products WHERE hospital_id = ${hospitalId}::uuid AND medicine_id = ${medicineId}
      LIMIT 1`),
    );
    product[medicineId] = p!.id;
  }

  const now = new Date();
  const monthStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 7);
  const dayOf = (d: number) =>
    new Date(Math.min(monthStart + (d - 1) * 86_400_000, now.getTime() - 3_600_000));

  const book = async (
    medicineId: string,
    no: string,
    expiry: string,
    qty: number,
    at: Date,
    loss?: [string, string],
  ) => {
    const [b] = rows<{ id: string }>(
      await db.execute(sql`
      WITH ins AS (
        INSERT INTO public.pharmacy_batches (hospital_id, location_id, product_id, batch_number, expiry,
               first_batch_number, first_expiry, created_by)
        SELECT ${hospitalId}::uuid, ${store.id}::uuid, ${product[medicineId]}::uuid, ${no}, ${expiry}::date, ${no},
               ${expiry}::date, ${actor.user_id}::uuid
         WHERE NOT EXISTS (SELECT 1 FROM public.pharmacy_batches WHERE location_id = ${store.id}::uuid
               AND product_id = ${product[medicineId]}::uuid AND batch_number = ${no})
        RETURNING id)
      SELECT id FROM ins UNION ALL
      SELECT id FROM public.pharmacy_batches WHERE location_id = ${store.id}::uuid
         AND product_id = ${product[medicineId]}::uuid AND batch_number = ${no}
      LIMIT 1`),
    );
    const price = MEDS[medicineId]!.price;
    const opened = new Date(at.getTime() - 20 * 86_400_000);
    await db.execute(sql`
      INSERT INTO public.pharmacy_stock_movements (hospital_id, location_id, batch_id, kind, quantity, unit_cost, effective_at,
             actor_user_id, source_kind, reason_note, idempotency_key)
      VALUES (${hospitalId}::uuid, ${store.id}::uuid, ${b!.id}::uuid, 'received', ${qty}, ${price}, ${opened},
             ${actor.user_id}::uuid, 'delivery', 'Opening balance (sample)', ${`seed-records:${no}:in`})
      ON CONFLICT DO NOTHING`);
    if (loss)
      await db.execute(sql`
        INSERT INTO public.pharmacy_stock_movements (hospital_id, location_id, batch_id, kind, quantity, effective_at,
               actor_user_id, source_kind, reason_code, reason_note, idempotency_key)
        VALUES (${hospitalId}::uuid, ${store.id}::uuid, ${b!.id}::uuid, 'adjusted', ${-qty}, ${at},
               ${actor.user_id}::uuid, 'adjustment', ${loss[0]}, ${loss[1]}, ${`seed-records:${no}:out`})
        ON CONFLICT DO NOTHING`);
  };

  for (const [med, no, exp, qty, day, cause, note] of LOSSES)
    await book(med, no, exp, qty, dayOf(day), [cause, note]);
  for (const [med, no, exp, qty] of SLOW) await book(med, no, exp, qty, dayOf(1));
  return { losses: LOSSES.length, slowMovers: SLOW.length };
}
