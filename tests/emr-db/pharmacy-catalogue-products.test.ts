/**
 * The hospital's products against the shared catalogue (catalogue slice Step 6; ADR 0459; migration 0255) on the
 * demo lane: linking keeps a product's batches, movements and issue unit (S17); a health supply is received, counted,
 * moved, quarantined and written off like any other product (S18) and is never prescribed (S19); a local medicine is
 * refused (D-CAT-18), in the app and in the database. Runs with EMR_PGLITE=1.
 */
import { randomUUID } from "node:crypto";
import type { DemoLane } from "./_pharmacy-demo";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { laneOn } from "./_pglite";
import { demoLane } from "./_pharmacy-demo";

vi.mock("server-only", () => ({}));
const held = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("@/db", () => ({
  get db() {
    return held.db;
  },
}));

describe.skipIf(!laneOn)("products and the catalogue (ADR 0459, 0255)", () => {
  let L: DemoLane;
  const f = { medicine: "", supply: "", product: "", formularyId: "" };
  const one = async <T = { id: string }>(q: string, p: unknown[] = []) =>
    (await L.pg.query<T>(q, p)).rows[0] as T;
  const fails = async (p: Promise<unknown>, re: RegExp) => {
    const e = (await p.then(
      () => null,
      (x: unknown) => x,
    )) as { message?: string; cause?: { message?: string } } | null;
    expect(e, "expected a refusal").not.toBeNull();
    expect(`${e!.message} ${e!.cause?.message ?? ""}`).toMatch(re);
  };

  beforeAll(async () => {
    L = await demoLane((db) => (held.db = db));
    const { expirySection } = await import("@/lib/pharmacy/demo/wards");
    await expirySection(L.s);
    const prop = await one(
      `INSERT INTO public.cat_proposals (kind, payload, source, proposer_source, required_reviews, state, decided_at)
       VALUES ('new_product', '{}', 'Test catalogue rows', 'test', 1, 'applied', now()) RETURNING id`,
    );
    const p = await one<{ id: string; medicine_id: string }>(
      `SELECT id, medicine_id FROM public.pharmacy_products WHERE hospital_id = $1 AND item_kind = 'formulary'
        ORDER BY name LIMIT 1`,
      [L.h],
    );
    f.product = p.id;
    f.formularyId = p.medicine_id;
    f.medicine = (
      await one(
        `INSERT INTO public.cat_medicines (key, display_name, kind, proposal_id)
         VALUES ('test:medicine', 'Test medicine', 'medicine', $1) RETURNING id`,
        [prop.id],
      )
    ).id;
    f.supply = (
      await one(
        `INSERT INTO public.cat_medicines (key, display_name, kind, issue_unit_kind, proposal_id)
         VALUES ('test:gloves', 'Examination gloves, nitrile, medium', 'health_supply', 'pair', $1) RETURNING id`,
        [prop.id],
      )
    ).id;
    await L.pg.query(
      `INSERT INTO public.cat_medicine_links (medicine_id, link_kind, formulary_id, proposal_id)
       VALUES ($1, 'formulary', $2, $3)`,
      [f.medicine, f.formularyId, prop.id],
    );
  }, 900_000);

  it("S17: a product with one signed match links; its batches, movements and issue unit stay", async () => {
    const { productLinkRows } = await import("@/lib/pharmacy/shared-catalogue/products");
    const { linkProducts } = await import("@/lib/pharmacy/shared-catalogue/store");
    const rows = await productLinkRows(L.lane.db as never, L.h);
    const row = rows.find((r) => r.productId === f.product)!;
    expect(row.match).toBe("single");
    expect(row.candidates[0]).toMatchObject({ medicineId: f.medicine, via: "formulary" });
    expect(rows.filter((r) => r.productId !== f.product).every((r) => r.match === "none")).toBe(
      true,
    );

    const snap = () =>
      one<{
        medicine_id: string;
        issue_unit: string;
        batches: number;
        movements: number;
        total: number;
      }>(
        `SELECT p.medicine_id, p.issue_unit,
                (SELECT count(*)::int FROM pharmacy_batches b WHERE b.product_id = p.id) AS batches,
                (SELECT count(*)::int FROM pharmacy_stock_movements m JOIN pharmacy_batches b ON b.id = m.batch_id
                  WHERE b.product_id = p.id) AS movements,
                (SELECT coalesce(sum(m.quantity), 0)::int FROM pharmacy_stock_movements m
                   JOIN pharmacy_batches b ON b.id = m.batch_id WHERE b.product_id = p.id) AS total
           FROM pharmacy_products p WHERE p.id = $1`,
        [f.product],
      );
    const before = await snap();
    expect(before.batches).toBeGreaterThan(0);
    await L.lane.db.transaction((tx) =>
      linkProducts(tx as never, { hospitalId: L.h }, [
        { productId: f.product, catalogueMedicineId: f.medicine },
      ]),
    );
    expect(await snap()).toEqual(before);
    expect(
      (
        await one<{ c: string }>(
          `SELECT catalogue_medicine_id AS c FROM pharmacy_products WHERE id = $1`,
          [f.product],
        )
      ).c,
    ).toBe(f.medicine);
    expect(
      (await productLinkRows(L.lane.db as never, L.h)).some((r) => r.productId === f.product),
    ).toBe(false);

    // Another hospital's product is not found; a medicine's product never links to a supply (0255).
    await fails(
      L.lane.db.transaction((tx) =>
        linkProducts(tx as never, { hospitalId: L.real }, [
          { productId: f.product, catalogueMedicineId: f.medicine },
        ]),
      ),
      /not at your hospital/,
    );
    await fails(
      L.lane.db.transaction((tx) =>
        linkProducts(tx as never, { hospitalId: L.h }, [
          { productId: f.product, catalogueMedicineId: f.supply },
        ]),
      ),
      /a formulary product cannot link to a catalogue health_supply/,
    );
  });

  it("S18, S19: a health supply is received, counted, moved, quarantined and written off, and never prescribed", async () => {
    const stock = await import("@/lib/pharmacy/stock/store");
    const expiry = await import("@/lib/pharmacy/stores/expiry-store");
    const { catalogueKey } = await import("@/lib/pharmacy/shared-catalogue/store");
    const { chiefActor, pharmacyActor, witness, write } = await import("@/lib/pharmacy/demo/state");
    const { isMedicine } = await import("@/lib/pharmacy/catalogue");
    const s = L.s;
    const tech = pharmacyActor(s, s.people.techs[0]!, "PHARMACY_TECH", "opd");
    const pharmacist = pharmacyActor(s, s.people.pharmacists[0]!, "PHARMACIST", "opd");
    const supply = {
      catalogueMedicineId: f.supply,
      kind: "health_supply",
      name: "Nitrile gloves, medium",
      issueUnit: "pair",
      pack: { description: "Box of 50 pairs", contents: 50 },
      brand: "Test brand",
      maker: "Test maker",
      registration: { answer: "none_on_pack" },
      gtin: "06009880123452",
    };

    // D-CAT-18: a local medicine is refused in words, and nothing is written.
    const n = Number((await one<{ n: string }>(`SELECT count(*) AS n FROM pharmacy_products`)).n);
    await fails(
      write(s, tech, stock.HealthSupplyInput, stock.STOCK_NEED, stock.addHealthSupply, {
        ...supply,
        kind: "local_medicine",
      }),
      /^forbidden: .*clinical safety officer/,
    );
    expect(
      Number((await one<{ n: string }>(`SELECT count(*) AS n FROM pharmacy_products`)).n),
    ).toBe(n);

    const { id } = await write(
      s,
      tech,
      stock.HealthSupplyInput,
      stock.STOCK_NEED,
      stock.addHealthSupply,
      supply,
    );
    const p = await one<{
      medicine_id: string;
      item_kind: string;
      catalogue_medicine_id: string;
      kind: string;
      payload: { registration: unknown };
    }>(
      `SELECT p.medicine_id, p.item_kind, p.catalogue_medicine_id, c.kind, c.payload
         FROM pharmacy_products p JOIN cat_proposals c ON c.id = p.local_proposal_id WHERE p.id = $1`,
      [id],
    );
    expect(p).toMatchObject({
      medicine_id: catalogueKey(f.supply),
      item_kind: "health_supply",
      catalogue_medicine_id: f.supply,
      kind: "new_product",
    });
    expect(p.payload.registration).toEqual({ answer: "none_on_pack" });

    const r = await write(
      s,
      tech,
      stock.ReceiveInput,
      stock.STOCK_NEED,
      (ctx, i) => stock.receiveStock(ctx, i, null),
      {
        productId: id,
        batchNumber: "GLV-001",
        expiry: new Date(s.now.getTime() + 200 * 86_400_000).toISOString().slice(0, 10),
        quantity: 40,
        from: "supplier",
      },
    );
    const batchId = r.batchId!;
    await write(s, tech, stock.CountInput, stock.STOCK_NEED, stock.recordCount, {
      step: "count",
      medicineId: catalogueKey(f.supply),
      lines: [{ batchId, counted: 40 }],
    });
    await write(
      s,
      tech,
      stock.TransferInput,
      stock.STOCK_NEED,
      (ctx, i) => stock.transferStock(ctx, i, null),
      {
        batchId,
        quantity: 10,
        toPointId: s.points.inpatient.id,
      },
    );
    await write(s, pharmacist, expiry.QuarantineInput, expiry.STOCK_NEED, expiry.moveToQuarantine, {
      locationId: s.points.opd.id,
      batchId,
      quantity: 5,
      reasonCode: "damaged",
      note: "Torn box.",
    });
    const inQ = await one(
      `SELECT b.id FROM pharmacy_batches b JOIN pharmacy_locations l ON l.id = b.location_id
        WHERE l.kind = 'quarantine' AND l.hospital_id = $1 AND b.product_id = $2`,
      [L.h, id],
    );
    const chief = chiefActor(s, null);
    await write(s, chief, expiry.WriteOffInput, expiry.MANAGE_NEED, expiry.writeOff, {
      batchId: inQ.id,
      quantity: 5,
      reasonCode: "damaged",
      registerNumber: "Test 001",
      witnessAttestationId: await witness(
        s,
        s.people.chief,
        s.people.pharmacists[2] ?? s.people.storekeeper,
        "write_off",
      ),
    });
    const at = await L.pg.query<{ place: string; n: number }>(
      `SELECT coalesce(m.location_id, m.dispensing_point_id) AS place, sum(m.quantity)::int AS n
         FROM pharmacy_stock_movements m JOIN pharmacy_batches b ON b.id = m.batch_id
        WHERE b.product_id = $1 GROUP BY 1`,
      [id],
    );
    const by = new Map(at.rows.map((x) => [x.place, x.n]));
    const q = await one(`SELECT location_id AS id FROM pharmacy_batches WHERE id = $1`, [inQ.id]);
    const left = {
      opd: by.get(s.points.opd.id),
      inpatient: by.get(s.points.inpatient.id),
      quarantine: by.get(q.id) ?? 0,
    };
    expect(left).toEqual({ opd: 25, inpatient: 10, quarantine: 0 });

    // The catalogue team confirms the proposal: brand, maker, pack and barcode join the catalogue; the product
    // links to that pack.
    const { reviewProposals } = await import("@/lib/pharmacy/shared-catalogue/store");
    const { superadmin } = await import("./_pglite");
    const curator = await superadmin(L.pg);
    await L.pg.query(
      `INSERT INTO public.catalogue_curators (user_id, granted_by) VALUES ($1, $2)`,
      [curator, L.admin],
    );
    const prop = await one(`SELECT local_proposal_id AS id FROM pharmacy_products WHERE id = $1`, [
      id,
    ]);
    const done = await L.lane.db.transaction((tx) =>
      reviewProposals(tx as never, { userId: curator }, [prop.id], "confirm"),
    );
    expect(done.applied).toEqual([prop.id]);
    const linked = await one<{ brand: string; code: string; state: string; medicine: string }>(
      `SELECT c.brand_name AS brand, k.code, k.state, p.catalogue_medicine_id AS medicine
         FROM pharmacy_products p JOIN cat_packs pk ON pk.id = p.catalogue_pack_id
         JOIN cat_products c ON c.id = pk.product_id JOIN cat_pack_codes k ON k.pack_id = pk.id WHERE p.id = $1`,
      [id],
    );
    expect(linked).toEqual({
      brand: "Test brand",
      code: "06009880123452",
      state: "confirmed",
      medicine: f.supply,
    });

    // S19: never prescribed. Not a prescribing-list medicine; a formulary product cannot take its key.
    expect(isMedicine(p.medicine_id)).toBe(false);
    expect(
      stock.ProductInput.safeParse({
        clientKey: randomUUID(),
        medicineId: p.medicine_id,
        name: "x x",
        issueUnit: "pair",
      }).success,
    ).toBe(false);
    await fails(
      L.pg.query(
        `INSERT INTO pharmacy_products (hospital_id, medicine_id, name, issue_unit, created_by) VALUES ($1, $2, 'Gloves', 'pair', $3)`,
        [L.h, p.medicine_id, s.people.chief],
      ),
      /pp_kind_key/,
    );
    // D-CAT-18 in the database too.
    await fails(
      L.pg.query(
        `INSERT INTO pharmacy_products (hospital_id, medicine_id, name, issue_unit, item_kind, created_by)
         VALUES ($1, $2, 'Local tablets', 'tablet', 'local_medicine', $3)`,
        [L.h, catalogueKey(randomUUID()), s.people.chief],
      ),
      /pp_no_local_medicine/,
    );
    // A supply's product cannot link to a medicine.
    await fails(
      L.pg.query(
        `UPDATE pharmacy_products SET catalogue_pack_id = NULL, catalogue_medicine_id = $2 WHERE id = $1`,
        [id, f.medicine],
      ),
      /a health_supply product cannot link to a catalogue medicine/,
    );
  });
});
