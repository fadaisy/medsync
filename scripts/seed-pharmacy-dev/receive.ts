/**
 * Dev seed for Stock › Receive a delivery (RECEIVE §K: sample rows go only here). Orders due in 3 days and 3 days late,
 * one part-delivered; a delivery being counted, one received with differences and a claim, one abandoned; batches
 * waiting for a shelf including a cold one; a recall; a medicine with no GTIN; a vaccine; a dispatch on its way to a
 * ward; claims in each state; 8 past deliveries per supplier for the figures. Runs after the store seed, once.
 *
 * ponytail: a delivery finished offline lives on the device (IndexedDB) by design, so it cannot be seeded here.
 */
import { sql } from "drizzle-orm";

type Db = { execute: (q: ReturnType<typeof sql>) => Promise<unknown> };
const rows = <T>(r: unknown): T[] =>
  (Array.isArray(r) ? r : ((r as { rows?: T[] }).rows ?? [])) as T[];
const DAY = 86_400_000;
const at = (daysAgo: number, minutes = 0) =>
  new Date(Date.now() - daysAgo * DAY + minutes * 60_000).toISOString();
const inDays = (n: number) => new Date(Date.now() + n * DAY).toISOString().slice(0, 10);

export async function seedReceive(db: Db, hospitalId: string) {
  const h = sql`${hospitalId}::uuid`;
  const all = async <T>(q: ReturnType<typeof sql>) => rows<T>(await db.execute(q));
  const one = async <T>(q: ReturnType<typeof sql>) => (await all<T>(q))[0];
  if (
    !(
      await one<{ ok: boolean }>(
        sql`SELECT to_regclass('public.pharmacy_supplier_claims') IS NOT NULL AS ok`,
      )
    )?.ok
  )
    return { skipped: "apply 0276 first" };
  if (
    (
      await one<{ n: number }>(
        sql`SELECT count(*)::int AS n FROM public.pharmacy_deliveries WHERE hospital_id = ${h} AND kind = 'supplier' AND pharmacy_supplier_id IS NOT NULL`,
      )
    )?.n
  )
    return { skipped: "already seeded" };
  const boss = (
    await one<{
      u: string;
    }>(sql`SELECT p.user_id AS u FROM public.pharmacy_roster_people p WHERE p.hospital_id = ${h}
      AND p.ended_at IS NULL AND private.pharmacy_is_in_charge(p.user_id, ${h}) LIMIT 1`)
  )?.u;
  const keeper = (
    await one<{
      u: string;
    }>(sql`SELECT user_id AS u FROM public.pharmacy_roster_people WHERE hospital_id = ${h}
      AND ended_at IS NULL AND user_id <> ${boss ?? null}::uuid LIMIT 1`)
  )?.u;
  const store = (
    await one<{ id: string }>(
      sql`SELECT id FROM public.pharmacy_locations WHERE hospital_id = ${h} AND kind = 'store' AND archived_at IS NULL LIMIT 1`,
    )
  )?.id;
  if (!boss || !keeper || !store) return { skipped: "run the roster and store seeds first" };
  const quar = (
    await one<{ id: string }>(
      sql`SELECT id FROM public.pharmacy_locations WHERE hospital_id = ${h} AND kind = 'quarantine' LIMIT 1`,
    )
  )?.id;

  const supplier = async (name: string, lead: number) => {
    const found = await one<{ id: string }>(
      sql`SELECT id FROM public.pharmacy_suppliers WHERE hospital_id = ${h} AND name = ${name}`,
    );
    if (found) {
      await db.execute(
        sql`UPDATE public.pharmacy_suppliers SET lead_days = ${lead} WHERE id = ${found.id}::uuid`,
      );
      return found.id;
    }
    return (await one<{ id: string }>(
      sql`INSERT INTO public.pharmacy_suppliers (hospital_id, name, lead_days, updated_by) VALUES (${h}, ${name}, ${lead}, ${boss}::uuid) RETURNING id`,
    ))!.id;
  };
  const nms = await supplier("National Medical Stores", 23);
  const jms = await supplier("Joint Medical Store", 7);
  const local = await supplier("A local wholesaler", 2);

  const product = async (k: string) =>
    (
      await one<{ id: string }>(
        sql`SELECT id FROM public.pharmacy_products WHERE hospital_id = ${h} AND medicine_id = ${`store_${k}`}`,
      )
    )?.id;
  const al = (await product("al"))!;
  const meds = await all<{
    id: string;
    name: string;
    cold: boolean;
  }>(sql`SELECT id, name, coalesce(cold_chain, false) AS cold FROM public.pharmacy_products
    WHERE hospital_id = ${h} AND controlled_class IS NULL AND medicine_id LIKE 'store_%' ORDER BY name`);
  const cold = meds.find((m) => m.cold)!.id;
  const plain = meds.filter((m) => !m.cold).map((m) => m.id);
  await db.execute(
    sql`UPDATE public.pharmacy_products SET gtin = '04006381333931' WHERE id = ${al}::uuid AND gtin IS NULL`,
  );
  const vaccine = (await one<{
    id: string;
  }>(sql`INSERT INTO public.pharmacy_products (hospital_id, medicine_id, name, issue_unit, pack_size, packs, created_by, cold_chain, vaccine)
    VALUES (${h}, 'store_measles_vaccine', 'Measles vaccine 10-dose vial', 'vial', '10', '{10}'::int[], ${boss}::uuid, true, true) RETURNING id`))!
    .id;
  void vaccine;

  const voucher = async (p: string) =>
    (await one<{ v: string }>(sql`SELECT private.pharmacy_next_voucher(${h}, ${p}) AS v`))!.v;
  const order = async (sup: string, daysAgo: number, lines: [string, number, number][]) => {
    const id = (await one<{
      id: string;
    }>(sql`INSERT INTO public.pharmacy_orders (hospital_id, kind, state, cut_at, created_by, supplier_id, sent_at, sent_by, saved_at, saved_by)
      VALUES (${h}, 'cycle', 'draft', ${at(daysAgo)}::timestamptz, ${boss}::uuid, ${sup}::uuid, ${at(daysAgo)}::timestamptz, ${boss}::uuid, ${at(daysAgo)}::timestamptz, ${boss}::uuid) RETURNING id`))!
      .id;
    for (const [p, packs, received] of lines)
      await db.execute(sql`INSERT INTO public.pharmacy_order_lines (order_id, medicine_id, product_id, inputs, chosen_units, packs, per_pack, price_per_pack, received_packs)
        SELECT ${id}::uuid, medicine_id, id, '{}'::jsonb, ${packs * 100}, ${packs}, 100, 45000, ${received} FROM public.pharmacy_products WHERE id = ${p}::uuid`);
    await db.execute(sql`UPDATE public.pharmacy_orders SET state = 'open' WHERE id = ${id}::uuid`);
    return id;
  };
  await order(jms, 4, [
    [plain[0]!, 40, 0],
    [plain[1]!, 20, 0],
  ]);
  const late = await order(local, 5, [
    [plain[2]!, 30, 0],
    [cold, 10, 0],
  ]);
  await order(nms, 30, [
    [plain[3]!, 50, 25],
    [plain[4]!, 25, 0],
  ]);
  void late;

  const start = async (o: {
    sup: string | null;
    note: string;
    arrivedDays: number;
    kind?: string;
    from?: string;
    orderId?: string;
  }) =>
    (await one<{
      id: string;
    }>(sql`INSERT INTO public.pharmacy_deliveries (hospital_id, location_id, kind, pharmacy_supplier_id, from_text, order_id, note_number, arrived_at, counted_by, deliverer_name, vehicle_registration)
      VALUES (${h}, ${store}::uuid, ${o.kind ?? "supplier"}, ${o.sup}::uuid, ${o.from ?? null}, ${o.orderId ?? null}::uuid, ${o.note}, ${at(o.arrivedDays)}::timestamptz, ${keeper}::uuid, 'Sample driver', 'UBK 123X') RETURNING id`))!
      .id;
  const batch = async (p: string, no: string, exp: string, loc = store) =>
    (
      await one<{
        id: string;
      }>(sql`INSERT INTO public.pharmacy_batches (hospital_id, location_id, product_id, batch_number, expiry, first_batch_number, first_expiry, created_by)
      VALUES (${h}, ${loc}::uuid, ${p}::uuid, ${no}, ${exp}::date, ${no}, ${exp}::date, ${boss}::uuid) ON CONFLICT DO NOTHING RETURNING id`)
    )?.id ??
    (await one<{ id: string }>(
      sql`SELECT id FROM public.pharmacy_batches WHERE location_id = ${loc}::uuid AND product_id = ${p}::uuid AND batch_number = ${no}`,
    ))!.id;
  const line = async (
    d: string,
    no: number,
    l: {
      p: string;
      batch: string;
      exp: string;
      packs: number;
      per: number;
      note?: number;
      cost: number;
      rej?: number;
      why?: string;
      fate?: string;
      temp?: number;
      when: string;
      done?: string;
    },
  ) => {
    const rej = l.rej ?? 0;
    const acc = (l.packs - rej) * l.per;
    const id = (await one<{
      id: string;
    }>(sql`INSERT INTO public.pharmacy_delivery_lines (delivery_id, line_no, product_id, identity_source, batch_number, expiry_text, expiry,
        counted_packs, pack_contents, note_packs, note_quantity, cost_per_pack, unit_cost, temp_c, accepted_quantity, rejected_kept_quantity, rejected_returned_quantity,
        reject_reason, rej_packs, rej_fate)
      VALUES (${d}::uuid, ${no}, ${l.p}::uuid, 'scan', ${l.batch}, ${l.exp}, ${l.exp}::date, ${l.packs}, ${l.per}, ${l.note ?? null}, ${l.note === undefined ? null : l.note * l.per}, ${l.cost}, ${(l.cost / l.per).toFixed(2)},
        ${l.temp ?? null}, ${acc}, ${l.fate === "quarantine" ? rej * l.per : 0}, ${l.fate === "quarantine" ? 0 : rej * l.per}, ${rej ? (l.why ?? null) : null}, ${rej || null}, ${rej ? (l.fate ?? null) : null}) RETURNING id`))!
      .id;
    const b = await batch(l.p, l.batch, l.exp);
    await db.execute(sql`INSERT INTO public.pharmacy_stock_movements (hospital_id, location_id, batch_id, kind, quantity, effective_at, actor_user_id, source_kind, source_id, unit_cost)
      VALUES (${h}, ${store}::uuid, ${b}::uuid, 'received', ${acc}, ${l.when}::timestamptz, ${keeper}::uuid, 'delivery', ${d}::uuid, ${(l.cost / l.per).toFixed(2)})`);
    await db.execute(sql`INSERT INTO public.pharmacy_delivery_put_away (hospital_id, delivery_line_id, batch_id, shelf, qty, done_at, done_by)
      VALUES (${h}, ${id}::uuid, ${b}::uuid, 'A-01', ${acc}, ${l.done ?? null}::timestamptz, ${l.done ? keeper : null}::uuid)`);
    if (rej && l.fate === "quarantine" && quar) {
      const q = await batch(l.p, l.batch, l.exp, quar);
      await db.execute(sql`INSERT INTO public.pharmacy_stock_movements (hospital_id, location_id, batch_id, kind, quantity, effective_at, actor_user_id, source_kind, source_id, reason_code)
        VALUES (${h}, ${quar}::uuid, ${q}::uuid, 'received', ${rej * l.per}, ${l.when}::timestamptz, ${keeper}::uuid, 'delivery', ${d}::uuid, ${l.why ?? null})`);
    }
  };
  const finish = async (d: string, whenIso: string, shelved: string | null) => {
    const grn = await voucher("GRN");
    await db.execute(
      sql`UPDATE public.pharmacy_deliveries SET state = 'received', grn = ${grn}, finished_by = ${keeper}::uuid, finished_at = ${whenIso}::timestamptz, shelved_at = ${shelved}::timestamptz WHERE id = ${d}::uuid`,
    );
  };

  // Eight past deliveries for each supplier: times and matches vary, so the figures have something to say.
  const SPANS = [95, 150, 110, 80, 200, 100, 125, 72];
  const SHELF = [40, 70, 55, 30, 90, 45, 62, 35];
  for (const [si, sup] of [nms, jms, local].entries())
    for (let i = 0; i < 8; i++) {
      const days = 60 - i * 7 - si;
      const d = await start({ sup, note: `DN-${19000 + si * 100 + i}`, arrivedDays: days });
      const span = SPANS[i]!;
      const when = at(days, span);
      await line(d, 1, {
        p: plain[i % plain.length]!,
        batch: `S${si}${i}A`,
        exp: inDays(500),
        packs: 20,
        per: 100,
        note: i % 3 === 0 ? 22 : 20,
        cost: 45000,
        when,
        done: at(days, span + SHELF[i]!),
      });
      await line(d, 2, {
        p: plain[(i + 1) % plain.length]!,
        batch: `S${si}${i}B`,
        exp: inDays(600),
        packs: 10,
        per: 100,
        note: 10,
        cost: 30000,
        when,
        done: at(days, span + SHELF[i]!),
      });
      await finish(d, when, at(days, span + SHELF[i]!));
    }

  // Being counted: nothing moved yet.
  const counting = await start({ sup: local, note: "DN-20418", arrivedDays: 0 });
  await db.execute(sql`INSERT INTO public.pharmacy_delivery_lines (delivery_id, line_no, product_id, identity_source, batch_number, expiry_text, counted_packs, pack_contents, cost_per_pack)
    VALUES (${counting}::uuid, 1, ${plain[0]!}::uuid, 'scan', 'B2410', ${inDays(700)}, 12, 100, 45000),
           (${counting}::uuid, 2, ${cold}::uuid, 'typed', NULL, NULL, NULL, 10, 60000)`);
  await db.execute(sql`INSERT INTO public.pharmacy_deliveries (hospital_id, location_id, kind, from_text, note_number, arrived_at, counted_by)
    VALUES (${h}, ${store}::uuid, 'donation', 'A sample donor', 'DON-77', ${at(1)}::timestamptz, ${keeper}::uuid)`);

  // Received with differences and a claim, batches still waiting, the cold one first.
  const differed = await start({ sup: jms, note: "DN-19977", arrivedDays: 1 });
  const when = at(1, 90);
  await line(differed, 1, {
    p: cold,
    batch: "OXY2401",
    exp: inDays(400),
    packs: 10,
    per: 10,
    note: 10,
    cost: 60000,
    temp: 5,
    when,
  });
  await line(differed, 2, {
    p: plain[1]!,
    batch: "PAR2410",
    exp: inDays(500),
    packs: 18,
    per: 100,
    note: 20,
    cost: 30000,
    rej: 2,
    why: "damaged",
    fate: "quarantine",
    when,
  });
  await finish(differed, when, null);
  const claim = async (d: string, sup: string, state: string, total: number, credit?: string) => {
    const ref = await voucher("CLM");
    const c = (await one<{
      id: string;
    }>(sql`INSERT INTO public.pharmacy_supplier_claims (hospital_id, ref, delivery_id, pharmacy_supplier_id, state, total, sent_at, sent_by, credit_note, credited_at, created_by)
      VALUES (${h}, ${ref}, ${d}::uuid, ${sup}::uuid, ${state}, ${total}, ${state === "draft" ? null : at(1)}::timestamptz, ${state === "draft" ? null : boss}::uuid, ${credit ?? null}, ${credit ? at(0) : null}::timestamptz, ${keeper}::uuid) RETURNING id`))!
      .id;
    await db.execute(
      sql`INSERT INTO public.pharmacy_claim_lines (claim_id, product_id, kind, packs, value) VALUES (${c}::uuid, ${plain[1]!}::uuid, 'Short on the note', 2, ${total})`,
    );
  };
  await claim(differed, jms, "draft", 60000);
  const past = await all<{ id: string }>(
    sql`SELECT id FROM public.pharmacy_deliveries WHERE hospital_id = ${h} AND note_number IN ('DN-19000', 'DN-19100')`,
  );
  await claim(past[0]!.id, nms, "sent", 90000);
  await claim(past[1]!.id, jms, "credit", 45000, "CN-552");

  const gone = await start({ sup: nms, note: "DN-19802", arrivedDays: 3 });
  await db.execute(
    sql`UPDATE public.pharmacy_deliveries SET state = 'abandoned', abandon_reason = 'Note was for another hospital', finished_by = ${keeper}::uuid, finished_at = ${at(3)}::timestamptz WHERE id = ${gone}::uuid`,
  );

  await db.execute(sql`INSERT INTO public.pharmacy_recalls (hospital_id, product_id, batch_number, source, notice_ref, notice_date, stated_class, level, instructions, started_by)
    VALUES (${h}, ${plain[2]!}::uuid, 'AMX2301', 'nda', 'NDA/RC/26/014', current_date, 'B', 'Batch recall', 'Quarantine and return', ${boss}::uuid)`);
  return { ok: true };
}
