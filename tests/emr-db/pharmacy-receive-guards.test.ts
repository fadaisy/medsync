/** RECEIVE hard rules, in the database (0276): one guard test each. Runs with EMR_PGLITE=1. */
import { randomUUID } from "node:crypto";
import type { Lane, Pg } from "./_pglite";
import { beforeAll, describe, expect, it } from "vitest";

import { bootLane, hospital, laneOn, staff } from "./_pglite";

describe.skipIf(!laneOn)("Receive guards (0276)", () => {
  let lane: Lane;
  let pg: Pg;
  let h: string;
  let boss: string;
  let keeper: string;
  let place: string;
  let supplier: string;
  let product: string;
  let cold: string;
  let vaccine: string;
  let controlled: string;

  const fails = async (p: Promise<unknown>, re: RegExp) => {
    await expect(p).rejects.toThrow(re);
  };
  const newProduct = async (over: Record<string, unknown> = {}) => {
    const keys = [
      "hospital_id",
      "medicine_id",
      "name",
      "issue_unit",
      "created_by",
      ...Object.keys(over),
    ];
    const vals = [
      h,
      `m_${randomUUID().replaceAll("-", "_")}`,
      "Test",
      "tablet",
      boss,
      ...Object.values(over),
    ];
    return (
      await pg.query<{ id: string }>(
        `INSERT INTO public.pharmacy_products (${keys.join(",")}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(",")}) RETURNING id`,
        vals,
      )
    ).rows[0]!.id;
  };
  const delivery = async (note = `DN-${randomUUID()}`) =>
    (
      await pg.query<{ id: string }>(
        `INSERT INTO public.pharmacy_deliveries (hospital_id, location_id, kind, pharmacy_supplier_id, note_number, arrived_at, counted_by)
         VALUES ($1,$2,'supplier',$3,$4,now(),$5) RETURNING id`,
        [h, place, supplier, note, keeper],
      )
    ).rows[0]!.id;
  const line = async (d: string, productId: string, over: Record<string, unknown> = {}) => {
    const row: Record<string, unknown> = {
      delivery_id: d,
      line_no: 1,
      product_id: productId,
      accepted_quantity: 10,
      batch_number: "B1",
      expiry: "2030-01-31",
      counted_packs: 1,
      pack_contents: 10,
      ...over,
    };
    const keys = Object.keys(row);
    await pg.query(
      `INSERT INTO public.pharmacy_delivery_lines (${keys.join(",")}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(",")})`,
      Object.values(row),
    );
  };
  const finish = (d: string, by = keeper, second: string | null = null) =>
    pg.query(
      `UPDATE public.pharmacy_deliveries SET state='received', finished_by=$2, finished_at=now(), grn='GRN-1', second_checker_id=$3 WHERE id=$1`,
      [d, by, second],
    );
  const finishErr = async (d: string, hint: string) => {
    const e = (await finish(d).then(
      () => null,
      (x: { hint?: string; message: string }) => x,
    )) as { hint?: string; message: string } | null;
    expect(e?.hint ?? e?.message).toBe(hint);
  };

  beforeAll(async () => {
    lane = await bootLane();
    pg = lane.pg;
    h = await hospital(pg, "Receive guards");
    const s = Date.now();
    const dept = (
      await pg.query<{ id: string }>(
        `INSERT INTO public.hospital_departments (hospital_id, name, slug, kind, catalogue_code) VALUES ($1,'Pharmacy',$2,'support','PHARMACY') RETURNING id`,
        [h, `ph-${s}`],
      )
    ).rows[0]!.id;
    const sub = (
      await pg.query<{ id: string }>(
        `INSERT INTO public.hospital_departments (hospital_id,parent_id,name,slug,kind) VALUES ($1,$2,'Main store',$3,'support') RETURNING id`,
        [h, dept, `st-${s}`],
      )
    ).rows[0]!.id;
    place = (
      await pg.query<{ id: string }>(
        `INSERT INTO public.pharmacy_locations (hospital_id,kind,department_id,name,live_at) VALUES ($1,'store',$2,'Main store',now()) RETURNING id`,
        [h, sub],
      )
    ).rows[0]!.id;
    boss = (await staff(pg, { hospitalId: h, departmentId: dept, cadre: "PHARMACIST" })).userId;
    keeper = (await staff(pg, { hospitalId: h, departmentId: dept, cadre: "PHARMACIST" })).userId;
    await pg.query(
      `INSERT INTO public.department_heads (hospital_id,department_id,user_id,starts_at) VALUES ($1,$2,$3,now()-interval '1 day')`,
      [h, dept, boss],
    );
    supplier = (
      await pg.query<{ id: string }>(
        `INSERT INTO public.pharmacy_suppliers (hospital_id,name,updated_by) VALUES ($1,'NMS',$2) RETURNING id`,
        [h, boss],
      )
    ).rows[0]!.id;
    product = await newProduct();
    cold = await newProduct({ cold_chain: true });
    vaccine = await newProduct({ vaccine: true });
    controlled = await newProduct({ controlled_class: "narcotic" });
  }, 300_000);

  it("a note is unique per supplier, unless abandoned", async () => {
    const d = await delivery("DN-DUP");
    await fails(delivery("DN-DUP"), /pd_source_note|duplicate/);
    await fails(delivery("dn-dup"), /pd_source_note|duplicate/);
    await pg.query(
      `UPDATE public.pharmacy_deliveries SET state='abandoned', abandon_reason='Wrong note', finished_by=$2, finished_at=now() WHERE id=$1`,
      [d, keeper],
    );
    await expect(delivery("DN-DUP")).resolves.toBeTruthy();
  });
  it("a pack serial is unique per GTIN", async () => {
    const d = await delivery();
    const add = (g: string) =>
      pg.query(
        `INSERT INTO public.pharmacy_pack_serials (hospital_id,gtin,serial,delivery_id) VALUES ($1,$2,'S1',$3)`,
        [h, g, d],
      );
    await add("08901234567890");
    await fails(add("08901234567890"), /duplicate|pharmacy_pack_serials/);
    await expect(add("08901234567891")).resolves.toBeTruthy();
  });
  it("an expired line cannot finish", async () => {
    const d = await delivery();
    await line(d, product, { expiry: "2020-01-31" });
    await finishErr(d, "expired");
  });
  it("a recalled batch cannot finish", async () => {
    const d = await delivery();
    const p = await newProduct();
    await line(d, p, { batch_number: "RC1" });
    await pg.query(
      `INSERT INTO public.pharmacy_recalls (hospital_id,product_id,batch_number,source,notice_ref,notice_date,stated_class,level,instructions,started_by)
       VALUES ($1,$2,'RC1','nda','N-1',current_date,'A','batch','Quarantine it',$3)`,
      [h, p, boss],
    );
    await finishErr(d, "recall");
  });
  it("VVM 3–4 and a tripped freeze cannot finish", async () => {
    let d = await delivery();
    await line(d, vaccine, { vvm_stage: 3, freeze_check: "ok" });
    await finishErr(d, "vvm");
    d = await delivery();
    await line(d, vaccine, { vvm_stage: 1, freeze_check: "tripped" });
    await finishErr(d, "freeze");
    d = await delivery();
    await line(d, vaccine, { vvm_stage: 1, freeze_check: "ok" });
    await expect(finish(d)).resolves.toBeTruthy();
  });
  it("a cold line outside the range cannot finish", async () => {
    let d = await delivery();
    await line(d, cold, { temp_c: 9 });
    await finishErr(d, "cold_range");
    d = await delivery();
    await line(d, cold);
    await finishErr(d, "cold_range");
    d = await delivery();
    await line(d, cold, { temp_c: 5 });
    await expect(finish(d)).resolves.toBeTruthy();
  });
  it("short-dated needs the in-charge, not just anyone", async () => {
    const soon = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
    let d = await delivery();
    await line(d, product, { expiry: soon });
    await finishErr(d, "short_dated");
    d = await delivery();
    await line(d, product, { expiry: soon, approved_by: keeper });
    await finishErr(d, "short_dated");
    d = await delivery();
    await line(d, product, { expiry: soon, approved_by: boss });
    await expect(finish(d)).resolves.toBeTruthy();
  });
  it("a controlled line needs a witness who is not the receiver", async () => {
    let d = await delivery();
    await line(d, controlled);
    await finishErr(d, "witness");
    d = await delivery();
    await line(d, controlled, { witness_id: keeper });
    await finishErr(d, "witness");
    d = await delivery();
    await line(d, controlled, { witness_id: boss });
    await expect(finish(d)).resolves.toBeTruthy();
  });
  it("over the limit needs a second checker who is not the receiver", async () => {
    const big = { counted_packs: 10, cost_per_pack: 300_000 };
    let d = await delivery();
    await line(d, product, big);
    await finishErr(d, "second_check");
    d = await delivery();
    await line(d, product, big);
    await fails(finish(d, keeper, keeper), /second checker/);
    d = await delivery();
    await line(d, product, big);
    await expect(finish(d, keeper, boss)).resolves.toBeTruthy();
  });
  it("a finished delivery changes only by being shelved", async () => {
    const d = await delivery();
    await line(d, product);
    await finish(d);
    await expect(
      pg.query(`UPDATE public.pharmacy_deliveries SET shelved_at=now() WHERE id=$1`, [d]),
    ).resolves.toBeTruthy();
    await fails(
      pg.query(`UPDATE public.pharmacy_deliveries SET note_number='X' WHERE id=$1`, [d]),
      /never changes/,
    );
  });
  it("an order line cannot go below what arrived; a line with something received stays", async () => {
    const o = (
      await pg.query<{ id: string }>(
        `INSERT INTO public.pharmacy_orders (hospital_id,kind,state,cut_at,created_by,supplier_id,sent_at,sent_by) VALUES ($1,'cycle','draft',now(),$2,$3,now(),$2) RETURNING id`,
        [h, boss, supplier],
      )
    ).rows[0]!.id;
    const l = (
      await pg.query<{ id: string }>(
        `INSERT INTO public.pharmacy_order_lines (order_id,medicine_id,product_id,inputs,packs,per_pack,received_packs) VALUES ($1,'x',$2,'{}',30,10,25) RETURNING id`,
        [o, product],
      )
    ).rows[0]!.id;
    await pg.query(`UPDATE public.pharmacy_orders SET state='open' WHERE id=$1`, [o]);
    await fails(
      pg.query(`UPDATE public.pharmacy_order_lines SET packs=24 WHERE id=$1`, [l]),
      /less than what arrived/,
    );
    await expect(
      pg.query(`UPDATE public.pharmacy_order_lines SET packs=25 WHERE id=$1`, [l]),
    ).resolves.toBeTruthy();
    await fails(
      pg.query(`DELETE FROM public.pharmacy_order_lines WHERE id=$1`, [l]),
      /never removed/,
    );
  });
  it("credit needs a note; donations make no claim", async () => {
    const d = await delivery();
    const insert = (delivery_id: string) =>
      pg.query<{ id: string }>(
        `INSERT INTO public.pharmacy_supplier_claims (hospital_id,ref,delivery_id,pharmacy_supplier_id,created_by,total) VALUES ($1,$2,$3,$4,$5,1000) RETURNING id`,
        [h, `CLM-${randomUUID()}`, delivery_id, supplier, boss],
      );
    const c = (await insert(d)).rows[0]!.id;
    await fails(
      pg.query(`UPDATE public.pharmacy_supplier_claims SET state='credit' WHERE id=$1`, [c]),
      /check|credit/i,
    );
    await expect(
      pg.query(
        `UPDATE public.pharmacy_supplier_claims SET state='credit', credit_note='CN-1', credited_at=now() WHERE id=$1`,
        [c],
      ),
    ).resolves.toBeTruthy();
    const don = (
      await pg.query<{ id: string }>(
        `INSERT INTO public.pharmacy_deliveries (hospital_id,location_id,kind,from_text,note_number,arrived_at,counted_by) VALUES ($1,$2,'donation','MSF',$3,now(),$4) RETURNING id`,
        [h, place, `L-${randomUUID()}`, keeper],
      )
    ).rows[0]!.id;
    await fails(insert(don), /supplier|no_claim/i);
  });
});
