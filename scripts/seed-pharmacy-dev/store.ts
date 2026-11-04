/**
 * Dev seed for Stock › Main store (STORE.md §L: sample rows go only here): eleven medicines, four places with levels,
 * 12 weeks of ledger, every requisition state (urgent, open, partial, issued, received, with a difference), dispatches
 * on the way, top-up runs due and not, a return, a draft and a sent order, a delivery waiting to be put away (a cold
 * line first), shelves counted and due, a count waiting for sign-off, quarantine batches, losses and room readings.
 * Local and dev only; never imported by the app. Runs once.
 *
 * ponytail: needs the roster seed first (the in-charge and two more people) and a store; unit costs ride on the
 * `received` legs, as a real delivery's do. Controlled stock moves only with a witness approval, like the real thing.
 */
import { sql } from "drizzle-orm";

type Db = { execute: (q: ReturnType<typeof sql>) => Promise<unknown> };
const rows = <T>(r: unknown): T[] =>
  (Array.isArray(r) ? r : ((r as { rows?: T[] }).rows ?? [])) as T[];
const DAY = 86_400_000;
const at = (daysAgo: number, hour = 9) => {
  const d = new Date(Date.now() - daysAgo * DAY);
  d.setUTCHours(hour - 3, 0, 0, 0);
  // The ledger refuses a future time: today's rows are capped at a minute ago.
  return new Date(Math.min(d.getTime(), Date.now() - 60_000)).toISOString();
};
const inDays = (n: number) => new Date(Date.now() + n * DAY).toISOString().slice(0, 10);

// [key, name, unit, VEN, use a month, UGX a unit, pack, shelf, cold, controlled]
const MEDS = [
  [
    "al",
    "Artemether + lumefantrine 20/120 mg tablet",
    "tablet",
    "V",
    2400,
    300,
    720,
    "A-02",
    false,
    false,
  ],
  ["amox", "Amoxicillin 250 mg capsule", "capsule", "V", 6000, 60, 100, "A-01", false, false],
  [
    "coamox",
    "Amoxicillin + clavulanic acid 250/125 mg tablet",
    "tablet",
    "E",
    800,
    450,
    100,
    "A-03",
    false,
    false,
  ],
  [
    "azis",
    "Azithromycin 200 mg/5 mL oral suspension",
    "bottle",
    "E",
    120,
    6000,
    1,
    "D-01",
    false,
    false,
  ],
  [
    "ceft",
    "Ceftriaxone 1 g powder for injection",
    "vial",
    "V",
    900,
    1800,
    50,
    "B-01",
    false,
    false,
  ],
  ["ins", "Insulin (soluble) 100 IU/mL injection", "vial", "V", 60, 9000, 1, "CR-01", true, false],
  ["met", "Metformin 500 mg tablet", "tablet", "E", 12000, 25, 1000, "C-01", false, false],
  ["morph", "Morphine 10 mg/mL injection", "ampoule", "V", 40, 3500, 10, "CD-1", false, true],
  ["mvit", "Multivitamin tablet", "tablet", "N", 50, 10, 1000, "C-03", false, false],
  ["ors", "Oral rehydration salts sachet", "sachet", "V", 1500, 400, 100, "D-02", false, false],
  ["para", "Paracetamol 500 mg tablet", "tablet", "E", 20000, 15, 1000, "C-02", false, false],
] as const;
type Key = (typeof MEDS)[number][0];

export async function seedStore(db: Db, hospitalId: string) {
  const h = sql`${hospitalId}::uuid`;
  const all = async <T>(q: ReturnType<typeof sql>) => rows<T>(await db.execute(q));
  const one = async <T>(q: ReturnType<typeof sql>) => (await all<T>(q))[0];
  if (
    (
      await one<{ ok: boolean }>(
        sql`SELECT to_regclass('public.pharmacy_shelves') IS NOT NULL AS ok`,
      )
    )?.ok !== true
  )
    return { skipped: "apply 0275 first" };
  if (
    (
      await one<{ n: number }>(
        sql`SELECT count(*)::int AS n FROM public.pharmacy_shelves WHERE hospital_id = ${h}`,
      )
    )?.n
  )
    return { skipped: "already seeded" };
  const people = (
    await all<{
      user_id: string;
    }>(sql`SELECT user_id FROM public.pharmacy_roster_people WHERE hospital_id = ${h}
      AND ended_at IS NULL ORDER BY created_at`)
  ).map((p) => p.user_id);
  const boss = (
    await one<{
      u: string;
    }>(sql`SELECT p.user_id AS u FROM public.pharmacy_roster_people p WHERE p.hospital_id = ${h}
      AND p.ended_at IS NULL AND private.pharmacy_is_in_charge(p.user_id, ${h}) LIMIT 1`)
  )?.u;
  const keeper = people.find((p) => p !== boss);
  const store = (
    await one<{
      id: string;
    }>(sql`SELECT id FROM public.pharmacy_locations WHERE hospital_id = ${h} AND kind = 'store'
      AND closed_at IS NULL ORDER BY created_at LIMIT 1`)
  )?.id;
  if (!boss || !keeper) return { skipped: "run the roster seed first" };
  if (!store) return { skipped: "needs a store" };

  const id = async (q: ReturnType<typeof sql>) => (await one<{ id: string }>(q))!.id;
  const place = async (kind: string, name: string) =>
    (
      await one<{ id: string }>(
        sql`SELECT id FROM public.pharmacy_locations WHERE hospital_id = ${h} AND name = ${name}`,
      )
    )?.id ??
    id(sql`INSERT INTO public.pharmacy_locations (hospital_id, kind, name, live_at, supplied_from)
      VALUES (${h}, ${kind}, ${name}, now(), ${store}::uuid) RETURNING id`);
  const opd = await place("clinic", "OPD dispensary");
  const ward = await place("clinic", "Ward 3 · Medical");
  const mat = await place("clinic", "Maternity");
  const paed = await place("clinic", "Paediatrics");
  const quar = await place("quarantine", "Q-shelf");
  const transit = (await one<{ id: string }>(
    sql`SELECT private.pharmacy_transit_location(${h}) AS id`,
  ))!.id;
  const voucher = async (p: string) =>
    (await one<{ v: string }>(sql`SELECT private.pharmacy_next_voucher(${h}, ${p}) AS v`))!.v;

  // ─── The medicines ───
  const P = {} as Record<Key, string>;
  for (const [key, name, unit, ven, , , pack, , cold, cd] of MEDS) {
    const medicine = `store_${key}`;
    P[key] = await id(sql`INSERT INTO public.pharmacy_products
        (hospital_id, medicine_id, name, issue_unit, pack_size, created_by, ven, cold_chain, packs, controlled_class)
      VALUES (${h}, ${medicine}, ${name}, ${unit}, ${String(pack)}, ${boss}::uuid, ${ven}, ${cold},
        ${`{${pack}}`}::int[], ${cd ? "class_a" : null})
      ON CONFLICT DO NOTHING RETURNING id`);
  }
  const med = (k: Key) => MEDS.find((m) => m[0] === k)!;

  // ─── Ledger helpers ───
  const batchAt = async (key: Key, no: string, expiry: string, loc: string) =>
    (
      await one<{
        id: string;
      }>(sql`SELECT id FROM public.pharmacy_batches WHERE location_id = ${loc}::uuid
        AND product_id = ${P[key]}::uuid AND batch_number = ${no}`)
    )?.id ??
    id(sql`INSERT INTO public.pharmacy_batches (hospital_id, location_id, product_id, batch_number, expiry, first_batch_number, first_expiry, created_by)
      VALUES (${h}, ${loc}::uuid, ${P[key]}::uuid, ${no}, ${expiry}::date, ${no}, ${expiry}::date, ${boss}::uuid) RETURNING id`);
  const receive = async (
    key: Key,
    no: string,
    expiry: string,
    qty: number,
    daysAgo: number,
    loc = store,
    delivery: string | null = null,
  ) => {
    const b = await batchAt(key, no, expiry, loc);
    await db.execute(sql`INSERT INTO public.pharmacy_stock_movements (hospital_id, location_id, batch_id, kind, quantity, effective_at, actor_user_id, source_kind, source_id, unit_cost)
      VALUES (${h}, ${loc}::uuid, ${b}::uuid, 'received', ${qty}, ${at(daysAgo)}::timestamptz, ${keeper}::uuid, 'delivery', ${delivery}::uuid, ${med(key)[5]})`);
    return b;
  };
  const put = (b: string, shelf: string) =>
    db.execute(
      sql`INSERT INTO public.pharmacy_batch_shelves (hospital_id, batch_id, shelf, actor_id) VALUES (${h}, ${b}::uuid, ${shelf}, ${keeper}::uuid)`,
    );
  const leg = async (
    issue: string,
    kindOut: string,
    kindIn: string,
    from: string,
    to: string,
    batch: string,
    key: Key,
    no: string,
    expiry: string,
    qty: number,
    daysAgo: number,
    source: string,
    witness: string | null = null,
    reason: string | null = null,
  ) => {
    const toBatch = await batchAt(key, no, expiry, to);
    const pair = crypto.randomUUID();
    const when = at(daysAgo, 11);
    await db.execute(sql`INSERT INTO public.pharmacy_stock_movements (hospital_id, location_id, batch_id, kind, quantity, effective_at, actor_user_id, source_kind, source_id, pair_id, witness_attestation_id, reason_code) VALUES
      (${h}, ${from}::uuid, ${batch}::uuid, ${kindOut}, ${-qty}, ${when}::timestamptz, ${keeper}::uuid, ${source}, ${issue}::uuid, ${pair}::uuid, ${witness}::uuid, ${reason}),
      (${h}, ${to}::uuid, ${toBatch}::uuid, ${kindIn}, ${qty}, ${when}::timestamptz, ${keeper}::uuid, ${source}, ${issue}::uuid, ${pair}::uuid, null, ${reason})`);
    return toBatch;
  };
  const approval = () =>
    id(sql`INSERT INTO public.pharmacy_attestations (hospital_id, actor_user_id, attester_user_id, purpose, action, method, outcome, attested_at)
      VALUES (${h}, ${keeper}::uuid, ${boss}::uuid, 'witness', 'store', 'session', 'passed', now()) RETURNING id`);

  // ─── 12 weeks: deliveries and the weekly run to each place ───
  const batches = {} as Record<Key, { id: string; no: string; expiry: string }>;
  const weekly: [string, Key, number][] = [
    [opd, "amox", 1000],
    [opd, "al", 500],
    [opd, "para", 3000],
    [opd, "ors", 250],
    [opd, "met", 2500],
    [ward, "ceft", 120],
    [ward, "amox", 100],
    [ward, "ins", 8],
    [mat, "ceft", 40],
    [paed, "al", 250],
    [paed, "azis", 25],
    [paed, "amox", 200],
    [ward, "coamox", 80],
  ];
  // What the store ends with; the first delivery is that plus everything sent out below.
  const ends = {
    al: 5000,
    amox: 9000,
    coamox: 900,
    azis: 500,
    ceft: 900,
    ins: 40,
    met: 30000,
    morph: 40,
    mvit: 800,
    ors: 0,
    para: 50000,
  } as Record<Key, number>;
  const later = { amox: 700, azis: 20, ceft: 284, morph: 10, para: 800 } as Partial<
    Record<Key, number>
  >;
  for (const [key, , , , , , , shelf] of MEDS) {
    const no = `${key.toUpperCase()}-2607`;
    const expiry = inDays(key === "coamox" ? 95 : key === "azis" ? 150 : 420);
    const sentOut = weekly.filter(([, k]) => k === key).reduce((a, [, , q]) => a + q * 11, 0);
    const b = await receive(key, no, expiry, ends[key] + sentOut + (later[key] ?? 0), 84);
    await put(b, shelf);
    batches[key] = { id: b, no, expiry };
  }
  // A second, later batch of amoxicillin: FEFO across two batches and shelf bins.
  const amox2 = await receive("amox", "AMOX-2610", inDays(600), 12000, 30);
  await put(amox2, "A-01");
  const dispatch = async (
    kind: string,
    to: string,
    lines: [Key, number][],
    daysAgo: number,
    requisition: string | null = null,
    confirmedNote: string | null | false = null,
  ) => {
    const v = await voucher(kind === "transfer" ? "TRF" : "RIV");
    const cd = lines.some(([k]) => med(k)[9]);
    const witness = cd ? await approval() : null;
    const issue =
      await id(sql`INSERT INTO public.pharmacy_issues (hospital_id, kind, from_location_id, to_location_id, requisition_id, issued_by, issued_at, voucher, dispatch_kind, witness_id, witness_attestation_id)
      VALUES (${h}, 'issue', ${store}::uuid, ${to}::uuid, ${requisition}::uuid, ${keeper}::uuid, ${at(daysAgo, 11)}::timestamptz, ${v}, ${kind}, ${cd ? boss : null}::uuid, ${witness}::uuid) RETURNING id`);
    for (const [key, qty] of lines) {
      const b = batches[key];
      const t = await leg(
        issue,
        "issued",
        "received_from_issue",
        store,
        transit,
        b.id,
        key,
        b.no,
        b.expiry,
        qty,
        daysAgo,
        "issue",
        witness,
      );
      if (confirmedNote !== false) {
        await db.execute(sql`INSERT INTO public.pharmacy_issue_confirmations (issue_id, hospital_id, confirmed_by, confirmed_at, note)
          VALUES (${issue}::uuid, ${h}, ${keeper}::uuid, ${at(daysAgo - 0.5, 15)}::timestamptz, ${confirmedNote})
          ON CONFLICT DO NOTHING`);
        await leg(
          issue,
          "issued",
          "received_from_issue",
          transit,
          to,
          t,
          key,
          b.no,
          b.expiry,
          qty,
          daysAgo,
          "issue",
        );
      }
    }
    return { issue, voucher: v };
  };
  for (let w = 11; w >= 1; w--)
    for (const pl of [opd, ward, mat, paed]) {
      const lines = weekly.filter(([to]) => to === pl).map(([, k, q]) => [k, q] as [Key, number]);
      await dispatch("topup", pl, lines, w * 7);
    }
  // A week-old shortfall: use at the places (dispensed), so days of cover span red, amber and green.
  const used = async (loc: string, key: Key, qty: number) => {
    const b = await batchAt(key, batches[key].no, batches[key].expiry, loc);
    await db.execute(sql`INSERT INTO public.pharmacy_stock_movements (hospital_id, location_id, batch_id, kind, quantity, effective_at, actor_user_id, source_kind)
      VALUES (${h}, ${loc}::uuid, ${b}::uuid, 'ward_used', ${-qty}, ${at(3)}::timestamptz, ${keeper}::uuid, 'adjustment')`);
  };
  for (const [pl, key, q] of [
    [opd, "amox", 9500],
    [opd, "al", 4800],
    [ward, "ceft", 1250],
    [paed, "al", 2650],
    [paed, "amox", 2050],
    [opd, "para", 31000],
    [opd, "ors", 2700],
    [opd, "met", 26000],
    [ward, "ins", 80],
    [ward, "amox", 1000],
    [mat, "ceft", 400],
    [paed, "azis", 270],
    [ward, "coamox", 800],
  ] as [string, Key, number][])
    await used(pl, key, q);

  // ─── Top-up levels ───
  for (const [pl, key, level] of [
    [opd, "amox", 6000],
    [opd, "al", 4000],
    [opd, "para", 22000],
    [opd, "ors", 1600],
    [opd, "met", 12000],
    [ward, "ceft", 600],
    [ward, "amox", 500],
    [ward, "ins", 40],
    [ward, "coamox", 400],
    [mat, "ceft", 200],
    [paed, "al", 1600],
    [paed, "amox", 1200],
    [paed, "azis", 150],
  ] as [string, Key, number][])
    await db.execute(sql`INSERT INTO public.pharmacy_reorder_levels (hospital_id, medicine_id, level, set_by, location_id, product_id)
      VALUES (${h}, ${`store_${key}`}, ${level}, ${boss}::uuid, ${pl}::uuid, ${P[key]}::uuid)`);

  // ─── Requisitions: urgent, open, partial, issued, received, with a difference ───
  const req = async (
    to: string,
    daysAgo: number,
    lines: [Key, number][],
    o: { urgent?: boolean; reason?: string; state?: string } = {},
  ) => {
    const r =
      await id(sql`INSERT INTO public.pharmacy_requisitions (hospital_id, requesting_location_id, issuing_location_id, raised_by, raised_at, urgent, reason)
      VALUES (${h}, ${to}::uuid, ${store}::uuid, ${keeper}::uuid, ${at(daysAgo, 8)}::timestamptz, ${o.urgent ?? false}, ${o.reason ?? null}) RETURNING id`);
    for (const [key, qty] of lines)
      await db.execute(
        sql`INSERT INTO public.pharmacy_requisition_lines (requisition_id, product_id, quantity_asked) VALUES (${r}::uuid, ${P[key]}::uuid, ${qty})`,
      );
    return r;
  };
  const setReq = (r: string, state: string) =>
    db.execute(sql`UPDATE public.pharmacy_requisitions SET state = ${state} WHERE id = ${r}::uuid`);
  await req(
    paed,
    0,
    [
      ["amox", 800],
      ["al", 1200],
    ],
    { urgent: true, reason: "Malaria admissions up this week" },
  );
  await req(opd, 0, [
    ["amox", 3000],
    ["para", 8000],
    ["ors", 600],
  ]);
  const part = await req(ward, 1, [
    ["ceft", 300],
    ["coamox", 200],
  ]);
  await dispatch("requisition", ward, [["ceft", 200]], 1, part, false);
  await setReq(part, "part_issued");
  const onWay = await req(mat, 1, [["ceft", 60]]);
  await dispatch("requisition", mat, [["ceft", 60]], 1, onWay, false);
  await setReq(onWay, "issued");
  const done = await req(opd, 6, [["amox", 500]]);
  await dispatch("requisition", opd, [["amox", 500]], 5, done);
  await setReq(done, "issued");
  await setReq(done, "confirmed");
  const diff = await req(paed, 8, [["azis", 20]]);
  await dispatch("requisition", paed, [["azis", 20]], 7, diff, "Two bottles cracked in the box");
  await setReq(diff, "issued");
  await setReq(diff, "confirmed_with_difference");
  await dispatch("urgent", ward, [["morph", 10]], 0, null, false);

  // ─── Top-up runs and one sent today ───
  const dow = ((new Date(Date.now() + 3 * 3_600_000).getUTCDay() + 6) % 7) + 1;
  const run = async (loc: string, days: number[], t: string) =>
    id(sql`INSERT INTO public.pharmacy_topup_runs (hospital_id, location_id, weekdays, at, created_by)
      VALUES (${h}, ${loc}::uuid, ${`{${days.join(",")}}`}::smallint[], ${t}, ${boss}::uuid) RETURNING id`);
  await run(opd, [1, 2, 3, 4, 5, 6, 7], "08:30");
  await run(paed, [dow], "10:00");
  await run(ward, [(dow % 7) + 1], "10:00");
  const matRun = await run(mat, [dow], "10:30");
  const sent = await dispatch("topup", mat, [["ceft", 20]], 0, null, false);
  await db.execute(sql`INSERT INTO public.pharmacy_topup_run_log (hospital_id, run_id, on_date, issue_id)
    VALUES (${h}, ${matRun}::uuid, ${inDays(0)}::date, ${sent.issue}::uuid)`);

  // ─── A return, proposed by the place ───
  const retBatch = await batchAt("coamox", batches.coamox.no, batches.coamox.expiry, opd);
  await db.execute(sql`INSERT INTO public.pharmacy_stock_movements (hospital_id, location_id, batch_id, kind, quantity, effective_at, actor_user_id, source_kind, unit_cost)
    VALUES (${h}, ${opd}::uuid, ${retBatch}::uuid, 'received', 200, ${at(40)}::timestamptz, ${keeper}::uuid, 'delivery', 450)`);
  await db.execute(sql`INSERT INTO public.pharmacy_store_returns (hospital_id, location_id, batch_id, qty, reason, proposed_by)
    VALUES (${h}, ${opd}::uuid, ${retBatch}::uuid, 200, 'Short-dated, not moving here', ${keeper}::uuid)`);

  // ─── Orders: a sent one part-delivered, and today's draft to the first supplier ───
  const supplier = (
    await one<{ id: string }>(
      sql`SELECT id FROM public.pharmacy_suppliers WHERE hospital_id = ${h} ORDER BY name LIMIT 1`,
    )
  )?.id;
  // The one who delivers and takes returns (0180); deliveries name it, orders name the 0274 supplier.
  const carrier =
    await id(sql`INSERT INTO public.pharmacy_counterparties (hospital_id, kind, name, takes_returns, created_by)
      VALUES (${h}, 'supplier', 'National Medical Stores', true, ${boss}::uuid) RETURNING id`);
  const delivery = async (daysAgo: number, order: string | null) =>
    id(sql`INSERT INTO public.pharmacy_deliveries (hospital_id, location_id, supplier_id, note_number, order_id, arrived_at, counted_by, state, finished_by, finished_at)
      VALUES (${h}, ${store}::uuid, ${carrier}::uuid, ${await voucher("GRN")}, ${order}::uuid, ${at(daysAgo)}::timestamptz, ${keeper}::uuid, 'received', ${keeper}::uuid, ${at(daysAgo)}::timestamptz) RETURNING id`);
  let sentOrder: string | null = null;
  if (supplier) {
    const order =
      await id(sql`INSERT INTO public.pharmacy_orders (hospital_id, kind, state, cut_at, budget, created_by, saved_at, saved_by, supplier_id, sent_at, sent_by)
      VALUES (${h}, 'cycle', 'open', ${at(30)}::timestamptz, 12000000, ${boss}::uuid, ${at(30)}::timestamptz, ${boss}::uuid, ${supplier}::uuid, ${at(30)}::timestamptz, ${boss}::uuid) RETURNING id`);
    await db.execute(sql`INSERT INTO public.pharmacy_order_lines (order_id, medicine_id, product_id, inputs, proposed_units, chosen_units)
      VALUES (${order}::uuid, 'store_ceft', ${P.ceft}::uuid, '{}', 1000, 1000), (${order}::uuid, 'store_amox', ${P.amox}::uuid, '{}', 12000, 12000)`);
    sentOrder = order;
    await db.execute(sql`INSERT INTO public.pharmacy_orders (hospital_id, kind, state, cut_at, budget, created_by, supplier_id)
      VALUES (${h}, 'cycle', 'draft', now(), 12000000, ${boss}::uuid, ${supplier}::uuid)`);
  }

  // ─── To put away: a delivery today, cold first ───
  const today = await delivery(0, sentOrder);
  await receive("ins", "INS-2611", inDays(300), 10, 0, store, today);
  await receive("al", "AL-2611", inDays(500), 2000, 0, store, today);
  await receive("amox", "AMOX-2611", inDays(700), 1800, 0, store, today);

  // ─── A place whose books do not balance this month ───
  const gap = await receive("ceft", "CEFT-2612", inDays(400), 300, 40, ward);
  await db.execute(sql`INSERT INTO public.pharmacy_stock_movements (hospital_id, location_id, batch_id, kind, quantity, effective_at, actor_user_id, source_kind, reason_code, reason_note)
    VALUES (${h}, ${ward}::uuid, ${gap}::uuid, 'adjusted', -120, ${at(0)}::timestamptz, ${keeper}::uuid, 'adjustment', 'other', 'Found short at the ward count')`);

  // ─── Shelves, counted at different ages; one count waiting for sign-off ───
  const shelf = async (code: string, name: string, controlled = false) =>
    id(sql`INSERT INTO public.pharmacy_shelves (hospital_id, location_id, code, name, controlled, created_by)
      VALUES (${h}, ${store}::uuid, ${code}, ${name}, ${controlled}, ${boss}::uuid) RETURNING id`);
  const counted = async (s: string, daysAgo: number, diff = 0) => {
    const v = await voucher("CNT");
    return id(sql`INSERT INTO public.pharmacy_shelf_counts (hospital_id, shelf_id, voucher, counted_by, counted_at, diff_value, sign_over)
      VALUES (${h}, ${s}::uuid, ${v}, ${keeper}::uuid, ${at(daysAgo)}::timestamptz, ${diff}, 50000) RETURNING id`);
  };
  await counted(await shelf("A", "Oral antibiotics and antimalarials"), 12);
  const b = await shelf("B", "Injectables");
  await counted(b, 44);
  await counted(await shelf("C", "Tablets"), 6);
  const d = await shelf("D", "Oral liquids and sachets");
  const waiting = await counted(d, 0, 64000);
  await db.execute(sql`INSERT INTO public.pharmacy_shelf_count_lines (count_id, batch_id, expected, counted, unit_cost)
    VALUES (${waiting}::uuid, ${batches.ors.id}::uuid, 1000, 840, 400)`);
  await counted(await shelf("CR-01", "Cold room"), 3);
  await counted(await shelf("CD-1", "Controlled cupboard (double lock)", true), 1);

  // ─── Quarantine: expired, recalled, rejected; losses; room readings ───
  for (const [key, no, qty, why] of [
    ["amox", "AMOX-2510", 1200, "expired"],
    ["ceft", "CEFT-2509", 150, "recalled"],
    ["coamox", "COAMOX-2514", 200, "rejected"],
  ] as [Key, string, number, string][]) {
    const out = await receive(key, no, inDays(key === "amox" ? -3 : 200), qty, 60);
    const q = crypto.randomUUID();
    await leg(
      q,
      "quarantined_out",
      "quarantined_in",
      store,
      quar,
      out,
      key,
      no,
      inDays(key === "amox" ? -3 : 200),
      qty,
      2,
      "quarantine",
      null,
      why,
    );
  }
  const loss = async (
    key: Key,
    qty: number,
    reason: string,
    note: string,
    daysAgo: number,
    kase: string | null,
  ) => {
    const v = await voucher("ADJ");
    const value = qty * med(key)[5];
    await db.execute(sql`INSERT INTO public.pharmacy_stock_movements (hospital_id, location_id, batch_id, kind, quantity, effective_at, actor_user_id, source_kind, reason_code, reason_note)
      VALUES (${h}, ${store}::uuid, ${batches[key].id}::uuid, 'adjusted', ${-qty}, ${at(daysAgo)}::timestamptz, ${keeper}::uuid, 'adjustment', ${reason}, ${note})`);
    await db.execute(sql`INSERT INTO public.pharmacy_store_losses (hospital_id, location_id, batch_id, qty, reason, note, value_ugx, voucher, case_id, recorded_by, recorded_at)
      VALUES (${h}, ${store}::uuid, ${batches[key].id}::uuid, ${qty}, ${reason}, ${note}, ${value}, ${v}, ${kase}::uuid, ${keeper}::uuid, ${at(daysAgo)}::timestamptz)`);
  };
  await loss("ceft", 4, "broken", "Dropped a box while shelving", 1, null);
  await loss("amox", 200, "spoilt", "Damp carton at the back of A-01", 20, null);
  const kase = (await one<{ id: string }>(
    sql`SELECT private.pharmacy_open_case(${h}, 'loss', gen_random_uuid(), 'store_para', ${store}::uuid, 800, 'high', ${keeper}::uuid, now()) AS id`,
  ))!.id;
  await loss("para", 800, "missing", "Box short at the count, not found", 40, kase);
  for (let n = 6; n >= 0; n--)
    for (const [hour, temp, humidity] of [
      [8, 23.1 + n * 0.1, 50],
      [14, 24.2 + (n % 3) * 0.3, n === 2 ? 58 : 52],
    ] as const) {
      if (n === 0 && hour === 14) continue;
      await db.execute(sql`INSERT INTO public.pharmacy_store_room_readings (hospital_id, location_id, read_at, temp_c, humidity, recorded_by)
        VALUES (${h}, ${store}::uuid, ${at(n, hour)}::timestamptz, ${temp}, ${humidity}, ${keeper}::uuid)`);
    }
  return { ok: true };
}
