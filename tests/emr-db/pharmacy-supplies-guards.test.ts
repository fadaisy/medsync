/** SUPPLIES.md invariants, in the database (0277): one guard test each. Runs with EMR_PGLITE=1. */
import { randomUUID } from "node:crypto";
import type { Lane, Pg } from "./_pglite";
import { beforeAll, describe, expect, it } from "vitest";

import { bootLane, hospital, laneOn, staff } from "./_pglite";

describe.skipIf(!laneOn)("Supplies guards (0277)", () => {
  let lane: Lane;
  let pg: Pg;
  let h: string;
  let keeper: string;
  let place: string;
  let supplier: string;
  let payer: string;

  const hint = (e: unknown) => {
    const x = e as { hint?: string; message: string };
    return x.hint ?? x.message;
  };
  const item = async (section: "B" | "C" | "D", flags: Record<string, boolean> = {}) => {
    const name = `Item ${randomUUID()}`;
    const si = (
      await pg.query<{ id: string }>(
        `INSERT INTO public.cat_supply_items (section, category, name, issue_unit, level_of_care, ven, sterile, test_kit, no_expiry)
         VALUES ($1,'Gloves',$2,'piece','HC3','V',false,false,false) RETURNING id`,
        [section, name],
      )
    ).rows[0]!.id;
    const keys = Object.keys(flags);
    return (
      await pg.query<{ id: string; item_type: string; item_kind: string; level_of_care: string }>(
        `INSERT INTO public.pharmacy_products (hospital_id, medicine_id, name, issue_unit, created_by, supply_item_id, item_type${keys.map((k) => `, ${k}`).join("")})
         VALUES ($1,$2,$3,'piece',$4,$5,'medicine'${keys.map((_, i) => `, $${i + 6}`).join("")})
         RETURNING id, item_type, item_kind, level_of_care`,
        [
          h,
          `cat_sup_${randomUUID().replaceAll("-", "_")}`,
          name,
          keeper,
          si,
          ...Object.values(flags),
        ],
      )
    ).rows[0]!;
  };
  const deliver = async (productId: string, over: Record<string, unknown> = {}) => {
    const d = (
      await pg.query<{ id: string }>(
        `INSERT INTO public.pharmacy_deliveries (hospital_id, location_id, kind, pharmacy_supplier_id, note_number, arrived_at, counted_by)
         VALUES ($1,$2,'supplier',$3,$4,now(),$5) RETURNING id`,
        [h, place, supplier, `DN-${randomUUID()}`, keeper],
      )
    ).rows[0]!.id;
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
    return d;
  };
  const finish = (d: string) =>
    pg
      .query(
        `UPDATE public.pharmacy_deliveries SET state='received', finished_by=$2, finished_at=now(), grn='GRN-1' WHERE id=$1`,
        [d, keeper],
      )
      .then(
        () => "ok",
        (e: unknown) => hint(e),
      );
  const batch = async (productId: string, expiry = "2030-01-31") =>
    (
      await pg.query<{ id: string; expiry: string }>(
        `INSERT INTO public.pharmacy_batches (hospital_id, location_id, product_id, batch_number, first_batch_number, expiry, first_expiry, created_by)
         VALUES ($1,$6,$2,$3,$3,$4,$4,$5) RETURNING id, expiry::text`,
        [h, productId, `B-${randomUUID()}`, expiry, keeper, place],
      )
    ).rows[0]!;

  beforeAll(async () => {
    lane = await bootLane();
    pg = lane.pg;
    h = await hospital(pg, "Supplies guards");
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
    keeper = (await staff(pg, { hospitalId: h, departmentId: dept, cadre: "PHARMACIST" })).userId;
    supplier = (
      await pg.query<{ id: string }>(
        `INSERT INTO public.pharmacy_suppliers (hospital_id,name,updated_by) VALUES ($1,'NMS',$2) RETURNING id`,
        [h, keeper],
      )
    ).rows[0]!.id;
    payer = (
      await pg.query<{ id: string }>(
        `INSERT INTO public.pharmacy_payers (hospital_id, code, name, kind) VALUES ($1,'cash','Cash','cash')
         ON CONFLICT (hospital_id, code) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
        [h],
      )
    ).rows[0]!.id;
  }, 300_000);

  it("loads the EMHSLU list", async () => {
    const n = await pg.query<{ section: string; n: number }>(
      `SELECT section, count(*)::int AS n FROM public.cat_supply_items GROUP BY 1 ORDER BY 1`,
    );
    expect(n.rows.map((r) => r.section)).toEqual(["B", "C", "D"]);
    expect(n.rows.reduce((a, r) => a + r.n, 0)).toBeGreaterThan(1900);
  });

  it("derives the type from the section, whatever is typed", async () => {
    const b = await item("B");
    const d = await item("D");
    expect(b.item_type).toBe("health_supply");
    expect(d.item_type).toBe("lab_supply");
    expect(d.item_kind).toBe("health_supply");
    expect(d.level_of_care).toBe("HC3");
    await pg.query(`UPDATE public.pharmacy_products SET item_type='medicine' WHERE id=$1`, [b.id]);
    const after = await pg.query<{ item_type: string }>(
      `SELECT item_type FROM public.pharmacy_products WHERE id=$1`,
      [b.id],
    );
    expect(after.rows[0]!.item_type).toBe("health_supply");
  });

  it("keeps Section C out until the hospital turns it on", async () => {
    await expect(item("C").catch((e: unknown) => hint(e))).resolves.toBe("section_c");
    await pg.query(
      `INSERT INTO public.pharmacy_hospital_settings (hospital_id, section_c, updated_by) VALUES ($1,true,$2)
       ON CONFLICT (hospital_id) DO UPDATE SET section_c = true`,
      [h, keeper],
    );
    expect((await item("C")).item_type).toBe("health_supply");
    await pg.query(
      `UPDATE public.pharmacy_hospital_settings SET section_c = false WHERE hospital_id = $1`,
      [h],
    );
  });

  it("sterile seal: no stock-in of an accepted line unanswered or broken", async () => {
    const p = await item("B", { sterile: true });
    expect(await finish(await deliver(p.id))).toBe("seal_unanswered");
    expect(await finish(await deliver(p.id, { seal: "broken" }))).toBe("seal_broken");
    expect(await finish(await deliver(p.id, { seal: "broken", accepted_quantity: 0 }))).toBe("ok");
    expect(await finish(await deliver(p.id, { seal: "ok" }))).toBe("ok");
  });

  it("kit temperature: no stock-in of an accepted line unanswered or hot", async () => {
    const p = await item("D", { test_kit: true });
    expect(await finish(await deliver(p.id))).toBe("kit_unanswered");
    expect(await finish(await deliver(p.id, { kit_temp: "hot" }))).toBe("kit_hot");
    expect(await finish(await deliver(p.id, { kit_temp: "hot", accepted_quantity: 0 }))).toBe("ok");
    expect(await finish(await deliver(p.id, { kit_temp: "ok" }))).toBe("ok");
  });

  it("dispense: a supply never makes a supplied movement", async () => {
    const p = await item("B");
    const b = await batch(p.id);
    const e = await pg
      .query(
        `INSERT INTO public.pharmacy_stock_movements (hospital_id, location_id, batch_id, kind, quantity, effective_at, actor_user_id, source_kind)
         VALUES ($1,$2,$3,'supplied',-1,now(),$4,'supply')`,
        [h, place, b.id, keeper],
      )
      .catch((x: unknown) => hint(x));
    expect(e).toBe("supply_not_dispensed");
  });

  it("billing: no bill line for a supply without a price, or a free one", async () => {
    const bill = (productId: string) =>
      pg
        .query(
          `INSERT INTO public.pharmacy_supply_bill_lines (hospital_id, product_id, patient_user_id, payer_id, quantity, unit_price_ugx, billed_by)
           VALUES ($1,$2,$3,$4,1,1,$3)`,
          [h, productId, keeper, payer],
        )
        .then(
          () => "ok",
          (e: unknown) => hint(e),
        );
    const p = await item("B");
    expect(await bill(p.id)).toBe("supply_no_price");
    await pg.query(
      `INSERT INTO public.pharmacy_product_prices (hospital_id, product_id, payer_id, price_ugx, free, from_date, source, set_by)
       VALUES ($1,$2,$3,500,false,current_date,'typed',$4)`,
      [h, p.id, payer, keeper],
    );
    expect(await bill(p.id)).toBe("ok");
    const free = await item("D", { free_issue: true });
    expect(await bill(free.id)).toBe("supply_free");
  });

  it("expiry: a no_expiry batch always holds the far date, and a medicine cannot be no_expiry", async () => {
    const p = await item("B", { no_expiry: true });
    expect((await batch(p.id, "2027-01-01")).expiry).toBe("2099-12-31");
    await expect(
      pg.query(
        `INSERT INTO public.pharmacy_products (hospital_id, medicine_id, name, issue_unit, created_by, no_expiry)
         VALUES ($1,$2,'A medicine','tablet',$3,true)`,
        [h, `m_${randomUUID().replaceAll("-", "_")}`, keeper],
      ),
    ).rejects.toThrow(/pp_no_expiry_supply/);
  });
});
