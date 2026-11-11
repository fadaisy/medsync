/**
 * Dev seed for Patients and cold chain (rework PRD §6.3, §6.4; TECH-SPEC §8 "Seeds"): the prototype's EPI clinic
 * (epi.js), its fridge with 30 days of sensor readings and one excursion, this month's chart readings (cold.js), the
 * vaccines with stock, and four clients with doses given. Local and dev only; never imported by the app. Idempotent:
 * fixed codes and `seed-patients:` keys.
 *
 * ponytail: wards and outpatients are not seeded (they read the EMR's own admissions and prescriptions; seed those
 * through the EMR seeds). Sample names are invented.
 */
import { sql } from "drizzle-orm";

import { blindIndex, encrypt } from "@/lib/encryption";

type Db = { execute: (q: ReturnType<typeof sql>) => Promise<unknown> };
const rows = <T>(r: unknown): T[] =>
  (Array.isArray(r) ? r : ((r as { rows?: T[] }).rows ?? [])) as T[];
const DAY = 86_400_000;

/** [vaccine, product name, doses per vial, batch, expiry, doses at the clinic, max level] */
const VACCINES: [string, string, number, string, string, number, number][] = [
  ["bcg", "BCG vaccine", 20, "BC25031", "2027-03-31", 120, 200],
  ["bopv", "bOPV (oral polio) vaccine", 20, "OP25102", "2027-04-30", 260, 400],
  ["ipv", "IPV (inactivated polio) vaccine", 5, "IP25041", "2027-01-31", 45, 100],
  ["penta", "Pentavalent (DTP-HepB-Hib) vaccine", 1, "PE25121", "2027-02-28", 30, 150],
  ["pcv", "PCV (pneumococcal) vaccine", 4, "PC25077", "2027-05-31", 96, 150],
  ["rota", "Rotavirus vaccine", 1, "RO25019", "2027-01-31", 80, 150],
  ["mr", "Measles-rubella vaccine", 10, "MR25066", "2027-06-30", 70, 100],
  ["td", "Td vaccine", 10, "TD25088", "2027-08-31", 110, 150],
];
/** [card, kind, name, sex, age in days, carer, doses already given] */
const CLIENTS: [string, "child" | "woman" | "girl", string, "F" | "M", number, string, string[]][] =
  [
    ["EPI-0001", "child", "Baby Nansubuga", "F", 44, "Nansubuga Aisha", ["BCG", "OPV0"]],
    [
      "EPI-0002",
      "child",
      "Baby Okello",
      "M",
      80,
      "Okello Peter",
      ["BCG", "OPV0", "OPV1", "Penta1", "PCV1", "Rota1"],
    ],
    [
      "EPI-0003",
      "child",
      "Baby Namata",
      "F",
      130,
      "Namata Ruth",
      ["BCG", "OPV1", "Penta1", "PCV1", "Rota1"],
    ],
    ["EPI-0004", "woman", "Achieng Mary", "F", 24 * 365, "Achieng Tom", []],
  ];
const VACCINE_OF: Record<string, string> = {
  BCG: "bcg",
  OPV0: "bopv",
  OPV1: "bopv",
  Penta1: "penta",
  PCV1: "pcv",
  Rota1: "rota",
};

export async function seedPatients(db: Db, hospitalId: string) {
  const one = async <T>(q: ReturnType<typeof sql>) => rows<T>(await db.execute(q))[0];
  const actor = await one<{
    user_id: string;
  }>(sql`SELECT user_id FROM public.staff_affiliations WHERE hospital_id = ${hospitalId}::uuid
      AND state IN ('approved','active') ORDER BY created_at LIMIT 1`);
  if (!actor) return { skipped: "no staff at this hospital" };
  const by = actor.user_id;
  const now = Date.now();

  // The EPI clinic: a live store-kind place of its own.
  await db.execute(sql`INSERT INTO public.pharmacy_locations (hospital_id, kind, name, live_at, created_by)
    SELECT ${hospitalId}::uuid, 'store', 'EPI clinic', now(), ${by}::uuid
     WHERE NOT EXISTS (SELECT 1 FROM public.pharmacy_locations WHERE hospital_id = ${hospitalId}::uuid AND name = 'EPI clinic')`);
  const clinic = (await one<{ id: string }>(
    sql`SELECT id FROM public.pharmacy_locations WHERE hospital_id = ${hospitalId}::uuid AND name = 'EPI clinic' LIMIT 1`,
  ))!;
  await db.execute(sql`INSERT INTO public.pharmacy_epi_clinics (hospital_id, location_id, set_by)
    VALUES (${hospitalId}::uuid, ${clinic.id}::uuid, ${by}::uuid) ON CONFLICT DO NOTHING`);

  const batchOf: Record<string, string> = {};
  for (const [vaccine, name, dpv, no, exp, qty, max] of VACCINES) {
    const medicineId = `proto_${vaccine}`;
    await db.execute(sql`INSERT INTO public.pharmacy_products (hospital_id, medicine_id, name, issue_unit, created_by)
      SELECT ${hospitalId}::uuid, ${medicineId}, ${name}, 'doses', ${by}::uuid
       WHERE NOT EXISTS (SELECT 1 FROM public.pharmacy_products WHERE hospital_id = ${hospitalId}::uuid AND medicine_id = ${medicineId})`);
    const p = (await one<{ id: string }>(
      sql`SELECT id FROM public.pharmacy_products WHERE hospital_id = ${hospitalId}::uuid AND medicine_id = ${medicineId} LIMIT 1`,
    ))!;
    await db.execute(sql`INSERT INTO public.pharmacy_epi_vaccines (hospital_id, vaccine, product_id, doses_per_vial, max_level, set_by)
      VALUES (${hospitalId}::uuid, ${vaccine}, ${p.id}::uuid, ${dpv}, ${max}, ${by}::uuid) ON CONFLICT DO NOTHING`);
    await db.execute(sql`INSERT INTO public.pharmacy_batches (hospital_id, location_id, product_id, batch_number, expiry, first_batch_number, first_expiry, created_by)
      SELECT ${hospitalId}::uuid, ${clinic.id}::uuid, ${p.id}::uuid, ${no}, ${exp}::date, ${no}, ${exp}::date, ${by}::uuid
       WHERE NOT EXISTS (SELECT 1 FROM public.pharmacy_batches WHERE location_id = ${clinic.id}::uuid AND product_id = ${p.id}::uuid AND batch_number = ${no})`);
    const b = (await one<{ id: string }>(
      sql`SELECT id FROM public.pharmacy_batches WHERE location_id = ${clinic.id}::uuid AND product_id = ${p.id}::uuid AND batch_number = ${no} LIMIT 1`,
    ))!;
    batchOf[vaccine] = b.id;
    await db.execute(sql`INSERT INTO public.pharmacy_stock_movements (hospital_id, location_id, batch_id, kind, quantity, effective_at,
        actor_user_id, source_kind, reason_note, idempotency_key)
      VALUES (${hospitalId}::uuid, ${clinic.id}::uuid, ${b.id}::uuid, 'received', ${qty}, ${new Date(now - 20 * DAY)}, ${by}::uuid,
        'delivery', 'Opening balance (sample)', ${`seed-patients:${no}:in`}) ON CONFLICT DO NOTHING`);
  }

  // The EPI fridge: 30 days of sensor samples every 30 minutes, one warm spell 6 days ago, and this month's chart.
  await db.execute(sql`INSERT INTO public.pharmacy_fridges (hospital_id, location_id, code, name, model, created_by)
    VALUES (${hospitalId}::uuid, ${clinic.id}::uuid, 'EPI-F1', 'EPI fridge', 'Vestfrost VLS 054A (sample)', ${by}::uuid) ON CONFLICT DO NOTHING`);
  const fridge = (await one<{ id: string }>(
    sql`SELECT id FROM public.pharmacy_fridges WHERE hospital_id = ${hospitalId}::uuid AND code = 'EPI-F1'`,
  ))!;
  const samples: string[] = [];
  for (let t = now - 30 * DAY; t <= now; t += 30 * 60_000) {
    const warm = t > now - 6 * DAY && t < now - 6 * DAY + 2 * 3_600_000;
    const v = warm ? 9.4 : 4.6 + 1.4 * Math.sin(t / 3_600_000 / 3.8);
    samples.push(`('${new Date(t).toISOString()}',${v.toFixed(1)})`);
  }
  await db.execute(sql`INSERT INTO public.pharmacy_fridge_readings (hospital_id, fridge_id, read_at, temp_c, source)
    SELECT ${hospitalId}::uuid, ${fridge.id}::uuid, s.at::timestamptz, s.v, 'sensor'
      FROM (VALUES ${sql.raw(samples.join(","))}) AS s(at, v) ON CONFLICT DO NOTHING`);
  const k = new Date(now + 3 * 3_600_000);
  const month = Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), 1) - 3 * 3_600_000;
  const exists = await one<{ n: number }>(
    sql`SELECT count(*)::int AS n FROM public.pharmacy_fridge_readings WHERE fridge_id = ${fridge.id}::uuid AND source = 'chart'`,
  );
  if (!exists?.n)
    for (let d = month; d + 15 * 3_600_000 < now; d += DAY) {
      await db.execute(sql`INSERT INTO public.pharmacy_fridge_readings (hospital_id, fridge_id, read_at, temp_c, source, slot, initials, recorded_by)
        VALUES (${hospitalId}::uuid, ${fridge.id}::uuid, ${new Date(d + 8 * 3_600_000)}, 5.0, 'chart', 'am', 'NS', ${by}::uuid)`);
      await db.execute(sql`INSERT INTO public.pharmacy_fridge_readings (hospital_id, fridge_id, read_at, temp_c, source, slot, freeze_indicator, initials, recorded_by)
        VALUES (${hospitalId}::uuid, ${fridge.id}::uuid, ${new Date(d + 15 * 3_600_000)}, 6.0, 'chart', 'pm', 'ok', 'NS', ${by}::uuid)`);
    }

  // Clients, each dose with its own ledger line (the 0268 dose guard checks the pair).
  for (const [card, kind, name, sex, age, carer, given] of CLIENTS) {
    const phone = `+25670000${card.slice(-4)}`;
    await db.execute(sql`INSERT INTO public.pharmacy_epi_clients (id, hospital_id, kind, name, sex, dob, card_no, carer, phone_encrypted, phone_hmac, created_by)
      SELECT gen_random_uuid(), ${hospitalId}::uuid, ${kind}, ${name}, ${sex}, ${new Date(now - age * DAY).toISOString().slice(0, 10)}::date,
             ${card}, ${carer}, ${encrypt(phone)}, ${blindIndex(phone)}, ${by}::uuid
       WHERE NOT EXISTS (SELECT 1 FROM public.pharmacy_epi_clients WHERE hospital_id = ${hospitalId}::uuid AND card_no = ${card})`);
    const c = (await one<{ id: string }>(
      sql`SELECT id FROM public.pharmacy_epi_clients WHERE hospital_id = ${hospitalId}::uuid AND card_no = ${card}`,
    ))!;
    for (const lab of given) {
      const v = VACCINE_OF[lab]!;
      const at = new Date(
        Math.min(now - (lab.endsWith("1") ? Math.max(1, age - 42) : age - 1) * DAY, now - DAY),
      );
      const done = await one<{ id: string }>(
        sql`SELECT id FROM public.pharmacy_epi_doses WHERE client_id = ${c.id}::uuid AND antigen = ${lab}`,
      );
      if (done) continue;
      const dose = crypto.randomUUID();
      const m = (await one<{
        id: string;
      }>(sql`INSERT INTO public.pharmacy_stock_movements (hospital_id, location_id, batch_id, kind, quantity, effective_at,
          actor_user_id, source_kind, source_id, reason_code)
        VALUES (${hospitalId}::uuid, ${clinic.id}::uuid, ${batchOf[v]}::uuid, 'ward_used', -1, ${at}, ${by}::uuid, 'adjustment', ${dose}::uuid, 'vaccinated')
        RETURNING id`))!;
      await db.execute(sql`INSERT INTO public.pharmacy_epi_doses (id, hospital_id, client_id, antigen, vaccine, batch_id, movement_id, site, aefi, given_by, given_at)
        VALUES (${dose}::uuid, ${hospitalId}::uuid, ${c.id}::uuid, ${lab}, ${v}, ${batchOf[v]}::uuid, ${m.id}::uuid, 'As scheduled', 'none', ${by}::uuid, ${at})`);
    }
  }
  return {
    clinic: clinic.id,
    fridge: fridge.id,
    vaccines: VACCINES.length,
    clients: CLIENTS.length,
    samples: samples.length,
  };
}
