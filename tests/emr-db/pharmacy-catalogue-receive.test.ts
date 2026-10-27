/**
 * Counting a delivery against the catalogue (catalogue slice Step 7; migration 0256) on the demo lane, after the
 * stores section: a 20-line delivery counted by scan with two typed identities (S20), packs to units (S21), a
 * rescan adding one pack (S22), a lapsed registration needing a reason and listed for the in-charge (S23), and a
 * controlled product still needing its witness (S24). Runs with EMR_PGLITE=1.
 */
import { randomUUID } from "node:crypto";
import type { DemoLane } from "./_pharmacy-demo";
import type * as DemoState from "@/lib/pharmacy/demo/state";
import type * as Receiving from "@/lib/pharmacy/stores/receiving-store";
import type { PharmacyActor, PharmacyNeed } from "@/lib/pharmacy/write";
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

/** GTIN-14 with its check digit, from 13 digits. */
const gtin = (base: string) => {
  const sum = [...base].reduce((a, c, i) => a + Number(c) * (i % 2 === 0 ? 3 : 1), 0);
  return base + ((10 - (sum % 10)) % 10);
};
const dataMatrix = (g: string, batch: string) => `01${g}17280630${"10"}${batch}`;

describe.skipIf(!laneOn)("receiving against the catalogue (Step 7, 0256)", () => {
  let L: DemoLane;
  let keeper: PharmacyActor;
  const f = {
    store: "",
    supplier: "",
    products: [] as { id: string; gtin: string; pack: string; catProduct: string }[],
    loose: [] as string[],
    controlled: { id: "", gtin: "" },
  };
  const one = async <T = { id: string }>(q: string, p: unknown[] = []) =>
    (await L.pg.query<T>(q, p)).rows[0] as T;
  const fails = async (p: Promise<unknown>, re: RegExp) => {
    const e = (await p.then(
      () => null,
      (x: unknown) => x,
    )) as { message?: string } | null;
    expect(e, "expected a refusal").not.toBeNull();
    expect(e!.message).toMatch(re);
  };
  let rcv: typeof Receiving;
  let write: typeof DemoState.write;
  let NEED: PharmacyNeed;
  const start = async (note: string) =>
    (
      await write(L.s, keeper, rcv.StartDeliveryInput, NEED, rcv.startDelivery, {
        supplierId: f.supplier,
        noteNumber: note,
        arrivedAt: new Date(L.s.now.getTime() + 3 * 3_600_000 - 3_600_000)
          .toISOString()
          .slice(0, 16)
          .replace("T", " "),
        locationId: f.store,
      })
    ).id;
  const scan = (deliveryId: string, raw: string) =>
    write(L.s, keeper, rcv.DeliveryScanInput, NEED, rcv.scanIntoDelivery, { deliveryId, raw });

  beforeAll(async () => {
    process.env.PHARMACY_CATALOGUE = "1";
    L = await demoLane((db) => (held.db = db));
    const { storesSection } = await import("@/lib/pharmacy/demo/stores");
    await storesSection(L.s);
    rcv = await import("@/lib/pharmacy/stores/receiving-store");
    ({ write } = await import("@/lib/pharmacy/demo/state"));
    const { pharmacyActor } = await import("@/lib/pharmacy/demo/state");
    const { withStoreAccess } = await import("@/lib/pharmacy/access");
    const { storeNeed } = await import("@/lib/pharmacy/stores/write");
    const { drugById } = await import("@/lib/prescribing/formulary");
    NEED = storeNeed("pharmacy.store");
    const a = pharmacyActor(L.s, L.s.people.storekeeper, "PHARMACY_TECH", null);
    keeper = { ...a, access: withStoreAccess(a.access, "PHARMACY_TECH", true) };
    f.store = (
      await one(
        `SELECT id FROM pharmacy_locations WHERE hospital_id = $1 AND kind = 'store' AND archived_at IS NULL ORDER BY created_at LIMIT 1`,
        [L.h],
      )
    ).id;
    f.supplier = (
      await one(
        `SELECT id FROM pharmacy_counterparties WHERE hospital_id = $1 AND kind = 'supplier' ORDER BY created_at LIMIT 1`,
        [L.h],
      )
    ).id;
    const all = (
      await L.pg.query<{ id: string; medicine_id: string }>(
        `SELECT id, medicine_id FROM pharmacy_products WHERE hospital_id = $1 AND active ORDER BY name`,
        [L.h],
      )
    ).rows;
    const plain = all.filter((p) => !drugById(p.medicine_id)?.flags.controlled);
    const cd = all.find((p) => drugById(p.medicine_id)?.flags.controlled)!;
    const prop = await one(
      `INSERT INTO cat_proposals (kind, payload, source, proposer_source, required_reviews, state, decided_at)
       VALUES ('new_pack', '{}', 'Test catalogue rows', 'test', 1, 'applied', now()) RETURNING id`,
    );
    const pack = async (productId: string, i: number) => {
      const m = await one(
        `INSERT INTO cat_medicines (key, display_name, kind, proposal_id) VALUES ($1, $2, 'medicine', $3) RETURNING id`,
        [`test:${i}`, `Test medicine ${i}`, prop.id],
      );
      const c = await one(
        `INSERT INTO cat_products (medicine_id, brand_name, proposal_id) VALUES ($1, $2, $3) RETURNING id`,
        [m.id, `Brand ${i}`, prop.id],
      );
      const k = await one(
        `INSERT INTO cat_packs (product_id, description, contents, proposal_id) VALUES ($1, '10 × 10', 100, $2) RETURNING id`,
        [c.id, prop.id],
      );
      const g = gtin(`0600988${String(i).padStart(6, "0")}`);
      await L.pg.query(
        `INSERT INTO cat_pack_codes (pack_id, code_type, code, state, proposal_id, created_by) VALUES ($1, 'GTIN', $2, 'confirmed', $3, $4)`,
        [k.id, g, prop.id, L.admin],
      );
      await L.pg.query(`UPDATE pharmacy_products SET catalogue_pack_id = $2 WHERE id = $1`, [
        productId,
        k.id,
      ]);
      return { id: productId, gtin: g, pack: k.id, catProduct: c.id };
    };
    for (const [i, p] of plain.slice(0, 18).entries()) f.products.push(await pack(p.id, i + 1));
    f.loose = plain.slice(18, 20).map((p) => p.id);
    f.controlled = await pack(cd.id, 99);
  }, 900_000);

  it("S20, S22: a 20-line delivery by scan, two identities typed; a rescan adds one pack", async () => {
    const d = await start(`CAT-S20-${randomUUID().slice(0, 6)}`);
    const t0 = performance.now();
    for (const [i, p] of f.products.entries()) {
      const r = await scan(d, dataMatrix(p.gtin, `B${i + 1}`));
      expect(r).toMatchObject({ kind: "added", lineNo: i + 1, counted: 1 });
    }
    // S22: the same pack and batch again adds one pack to its line and says so; another batch opens a line.
    expect(await scan(d, dataMatrix(f.products[0]!.gtin, "B1"))).toMatchObject({
      kind: "rescan",
      lineNo: 1,
      counted: 2,
      note: "+1 pack · 2 counted",
    });
    for (const [i, id] of f.loose.entries())
      await write(L.s, keeper, rcv.DeliveryLineInput, NEED, rcv.saveDeliveryLine, {
        deliveryId: d,
        lineNo: 19 + i,
        productId: id,
        accepted: 50,
        rejectedKept: 0,
        rejectedReturned: 0,
        batchNumber: `T${i}`,
        expiry: "2028-06",
        identitySource: "typed",
      });
    const ms = performance.now() - t0;
    const lines = (
      await L.pg.query<{
        line_no: number;
        identity_source: string;
        accepted_quantity: number;
        packs: number | null;
        batch_number: string;
        expiry: string;
      }>(
        `SELECT line_no, identity_source, accepted_quantity, packs, batch_number, expiry::text FROM pharmacy_delivery_lines
          WHERE delivery_id = $1 ORDER BY line_no`,
        [d],
      )
    ).rows;
    expect(lines).toHaveLength(20);
    expect(lines.filter((l) => l.identity_source !== "scan")).toHaveLength(2);
    expect(lines[0]).toMatchObject({
      accepted_quantity: 200,
      packs: 2,
      batch_number: "B1",
      expiry: "2028-06-30",
    });
    await write(L.s, keeper, rcv.ReceiveDeliveryInput, NEED, rcv.receiveDelivery, {
      deliveryId: d,
      witnesses: [],
    });
    const moved = await one<{ n: number }>(
      `SELECT sum(m.quantity)::int AS n FROM pharmacy_stock_movements m JOIN pharmacy_delivery_lines l ON l.id = m.source_id
        WHERE l.delivery_id = $1`,
      [d],
    );
    expect(moved.n).toBe(200 + 17 * 100 + 2 * 50);
    // Q8 counted about 120 entries by hand for 20 lines; here 19 scans and 2 typed identities.
    process.stderr.write(`S20: 20 lines, 19 scans, 2 typed, ${ms.toFixed(0)} ms on PGlite\n`);
  });

  it("S21: packs to units only by whole contents", async () => {
    const d = await start(`CAT-S21-${randomUUID().slice(0, 6)}`);
    const base = {
      deliveryId: d,
      rejectedKept: 0,
      rejectedReturned: 0,
      batchNumber: "P1",
      expiry: "2028-06",
    };
    await write(L.s, keeper, rcv.DeliveryLineInput, NEED, rcv.saveDeliveryLine, {
      ...base,
      lineNo: 1,
      productId: f.products[1]!.id,
      packs: 20,
      accepted: 2000,
    });
    expect(
      await one(`SELECT packs, pack_contents FROM pharmacy_delivery_lines WHERE delivery_id = $1`, [
        d,
      ]),
    ).toEqual({ packs: 20, pack_contents: 100 });
    await fails(
      write(L.s, keeper, rcv.DeliveryLineInput, NEED, rcv.saveDeliveryLine, {
        ...base,
        lineNo: 1,
        productId: f.products[1]!.id,
        packs: 20,
        accepted: 1500,
      }),
      /packs times the pack's contents/,
    );
    await fails(
      write(L.s, keeper, rcv.DeliveryLineInput, NEED, rcv.saveDeliveryLine, {
        ...base,
        lineNo: 2,
        productId: f.loose[0]!,
        packs: 2,
        accepted: 200,
      }),
      /not a whole number/,
    );
    // The database holds the same rule.
    await fails(
      L.pg.query(
        `UPDATE pharmacy_delivery_lines SET accepted_quantity = 7 WHERE delivery_id = $1`,
        [d],
      ),
      /pdl_packs_whole/,
    );
  });

  it("S23: a lapsed registration needs a reason at the line and at receipt, and is listed for the in-charge", async () => {
    const p = f.products[2]!;
    await L.pg.query(`UPDATE cat_products SET nda_state = 'lapsed' WHERE id = $1`, [p.catProduct]);
    const d = await start(`CAT-S23-${randomUUID().slice(0, 6)}`);
    const line = {
      deliveryId: d,
      lineNo: 1,
      productId: p.id,
      accepted: 100,
      rejectedKept: 0,
      rejectedReturned: 0,
      batchNumber: "R1",
      expiry: "2028-06",
    };
    await fails(
      write(L.s, keeper, rcv.DeliveryLineInput, NEED, rcv.saveDeliveryLine, line),
      /registration lapsed/,
    );
    await fails(
      write(L.s, keeper, rcv.DeliveryLineInput, NEED, rcv.saveDeliveryLine, {
        ...line,
        registrationReason: "other",
      }),
      /Say what happened/,
    );
    // A scanned line skips the dialog; receipt refuses it until the reason is given.
    await scan(d, dataMatrix(p.gtin, "R2"));
    await fails(
      write(L.s, keeper, rcv.ReceiveDeliveryInput, NEED, rcv.receiveDelivery, {
        deliveryId: d,
        witnesses: [],
      }),
      /registration lapsed/,
    );
    await write(L.s, keeper, rcv.DeliveryLineInput, NEED, rcv.saveDeliveryLine, {
      ...line,
      batchNumber: "R2",
      registrationReason: "renewal_pending",
    });
    await write(L.s, keeper, rcv.ReceiveDeliveryInput, NEED, rcv.receiveDelivery, {
      deliveryId: d,
      witnesses: [],
    });
    const list = await L.lane.db.transaction((tx) => rcv.registrationList(tx as never, L.h));
    expect(list).toEqual([
      expect.objectContaining({ delivery_id: d, line_no: 1, reason: "renewal_pending" }),
    ]);
    await L.pg.query(`UPDATE cat_products SET nda_state = 'unknown' WHERE id = $1`, [p.catProduct]);
  });

  it("S24: a scanned controlled product still needs its witness", async () => {
    const d = await start(`CAT-S24-${randomUUID().slice(0, 6)}`);
    expect(await scan(d, dataMatrix(f.controlled.gtin, "C1"))).toMatchObject({ kind: "added" });
    await fails(
      write(L.s, keeper, rcv.ReceiveDeliveryInput, NEED, rcv.receiveDelivery, {
        deliveryId: d,
        witnesses: [],
      }),
      /witness|controlled/i,
    );
  });

  it("Add a product: a picked pack links only to the medicine it is linked to", async () => {
    const stock = await import("@/lib/pharmacy/stock/store");
    const { pharmacyActor } = await import("@/lib/pharmacy/demo/state");
    const p = f.products[3]!;
    const { medicine, formulary } = await one<{ medicine: string; formulary: string }>(
      `SELECT c.medicine_id AS medicine, pp.medicine_id AS formulary FROM cat_packs k
         JOIN cat_products c ON c.id = k.product_id JOIN pharmacy_products pp ON pp.catalogue_pack_id = k.id
        WHERE k.id = $1`,
      [p.pack],
    );
    const tech = pharmacyActor(L.s, L.s.people.techs[0]!, "PHARMACY_TECH", "opd");
    const add = {
      medicineId: formulary,
      name: "Picked brand",
      issueUnit: "tablet",
      cataloguePackId: p.pack,
    };
    await fails(
      write(L.s, tech, stock.ProductInput, stock.STOCK_NEED, stock.addProduct, add),
      /not this medicine/,
    );
    const prop = await one(`SELECT proposal_id AS id FROM cat_medicines WHERE id = $1`, [medicine]);
    await L.pg.query(
      `INSERT INTO cat_medicine_links (medicine_id, link_kind, formulary_id, proposal_id) VALUES ($1, 'formulary', $2, $3)`,
      [medicine, formulary, prop.id],
    );
    const { id } = await write(
      L.s,
      tech,
      stock.ProductInput,
      stock.STOCK_NEED,
      stock.addProduct,
      add,
    );
    expect(
      await one(
        `SELECT catalogue_pack_id AS pack, catalogue_medicine_id AS medicine FROM pharmacy_products WHERE id = $1`,
        [id],
      ),
    ).toEqual({ pack: p.pack, medicine });
  });

  it("an unknown barcode, a wrong check digit and plain text fill nothing", async () => {
    const d = await start(`CAT-UNK-${randomUUID().slice(0, 6)}`);
    expect(await scan(d, `01${gtin("0600988777777")}`)).toMatchObject({ kind: "unknown" });
    expect(await scan(d, "0106009880123457")).toMatchObject({ kind: "refused" });
    expect(await scan(d, "paracetamol")).toMatchObject({ kind: "text" });
    expect(
      await one<{ n: number }>(
        `SELECT count(*)::int AS n FROM pharmacy_delivery_lines WHERE delivery_id = $1`,
        [d],
      ),
    ).toEqual({ n: 0 });
  });
});
