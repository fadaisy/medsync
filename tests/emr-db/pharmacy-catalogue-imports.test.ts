/**
 * Imports as drafts (catalogue slice Step 9; migration 0258) on the demo lane, after the stores section: a 600-row
 * products file makes a draft and writes nothing else until commit (S34), a barcode in another strength is never
 * proposed (S35), opening stock for a store not yet live places its products and leaves the blind opening count
 * still to do (S36), and price-list lines match by barcode, then by supplier code, and by name only for a person
 * (S37). Runs with EMR_PGLITE=1.
 */
import type { DemoLane } from "./_pharmacy-demo";
import type * as DemoState from "@/lib/pharmacy/demo/state";
import type * as Imports from "@/lib/pharmacy/imports/store";
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

const gtin = (base: string) => {
  const sum = [...base].reduce((a, c, i) => a + Number(c) * (i % 2 === 0 ? 3 : 1), 0);
  return base + ((10 - (sum % 10)) % 10);
};
const G500 = gtin("0600977000500");
const G250 = gtin("0600977000250");
const csv = (rows: string[][]) =>
  rows
    .map((r) => r.map((v) => (/[",]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)).join(","))
    .join("\n");

describe.skipIf(!laneOn)("imports as drafts (Step 9, 0258)", () => {
  let L: DemoLane;
  let keeper: PharmacyActor;
  let imp: typeof Imports;
  let write: typeof DemoState.write;
  let NEED: PharmacyNeed;
  const f = { formulary: "", medicine: "", pack500: "", store: "", supplier: "", supplierName: "" };
  const rows = async <T>(q: string, p: unknown[] = []) => (await L.pg.query<T>(q, p)).rows;
  const one = async <T = { id: string }>(q: string, p: unknown[] = []) => (await rows<T>(q, p))[0]!;
  const count = async (t: string) =>
    Number(
      (await one<{ n: string }>(`SELECT count(*) AS n FROM ${t} WHERE hospital_id = $1`, [L.h])).n,
    );
  const draft = (raw: Record<string, unknown>) =>
    write(L.s, keeper, imp.CreateDraftInput, NEED, imp.createDraft, raw);
  const decide = (draftId: string, decisions: unknown[]) =>
    write(L.s, keeper, imp.DecideInput, NEED, imp.decideRows, { draftId, decisions });
  const commit = (draftId: string) =>
    write(L.s, keeper, imp.CommitInput, NEED, imp.commitDraft, { draftId });
  const rowsOf = (draftId: string) =>
    rows<{ id: string; line_no: number; match: string; why: string; proposal: unknown }>(
      `SELECT id, line_no, match, why, proposal FROM pharmacy_import_rows WHERE draft_id = $1 ORDER BY line_no`,
      [draftId],
    );

  beforeAll(async () => {
    process.env.PHARMACY_CATALOGUE = "1";
    L = await demoLane((db) => (held.db = db));
    const { storesSection } = await import("@/lib/pharmacy/demo/stores");
    await storesSection(L.s);
    imp = await import("@/lib/pharmacy/imports/store");
    const st = await import("@/lib/pharmacy/demo/state");
    write = st.write;
    const { STOCK_NEED } = await import("@/lib/pharmacy/stock/store");
    NEED = STOCK_NEED;
    keeper = st.chiefActor(L.s, "opd");
    const { DRUGS } = await import("@/lib/prescribing/formulary");
    const stocked = new Set(
      (
        await rows<{ medicine_id: string }>(
          `SELECT medicine_id FROM pharmacy_products WHERE hospital_id = $1`,
          [L.h],
        )
      ).map((r) => r.medicine_id),
    );
    f.formulary = DRUGS.find((d) => !stocked.has(d.id) && !d.flags.controlled)!.id;
    const prop = await one(
      `INSERT INTO cat_proposals (kind, payload, source, proposer_source, required_reviews, state, decided_at)
       VALUES ('new_pack', '{}', 'Test catalogue rows', 'test', 1, 'applied', now()) RETURNING id`,
    );
    const med = async (strength: string, g: string) => {
      const m = await one(
        `INSERT INTO cat_medicines (key, display_name, kind, strength_text, proposal_id)
         VALUES ($1, 'Importamycin', 'medicine', $2, $3) RETURNING id`,
        [`test:importamycin:${strength}`, strength, prop.id],
      );
      await L.pg.query(
        `INSERT INTO cat_medicine_links (medicine_id, link_kind, formulary_id, proposal_id) VALUES ($1, 'formulary', $2, $3)`,
        [m.id, f.formulary, prop.id],
      );
      const c = await one(
        `INSERT INTO cat_products (medicine_id, brand_name, proposal_id) VALUES ($1, 'Importa', $2) RETURNING id`,
        [m.id, prop.id],
      );
      const k = await one(
        `INSERT INTO cat_packs (product_id, description, contents, proposal_id) VALUES ($1, '10 x 10', 100, $2) RETURNING id`,
        [c.id, prop.id],
      );
      await L.pg.query(
        `INSERT INTO cat_pack_codes (pack_id, code_type, code, state, proposal_id, created_by) VALUES ($1, 'GTIN', $2, 'confirmed', $3, $4)`,
        [k.id, g, prop.id, L.admin],
      );
      return { medicine: m.id, pack: k.id };
    };
    const a = await med("500 mg", G500);
    await med("250 mg", G250);
    f.medicine = a.medicine;
    f.pack500 = a.pack;
    const dept = await one(
      `INSERT INTO hospital_departments (hospital_id, parent_id, name, slug, kind)
       SELECT $1, d.id, 'Import test store', 'import-test-store', 'support' FROM hospital_departments d
        WHERE d.hospital_id = $1 AND d.catalogue_code = 'PHARMACY' LIMIT 1 RETURNING id`,
      [L.h],
    );
    f.store = (
      await one(
        `INSERT INTO pharmacy_locations (hospital_id, kind, name, department_id, created_by)
         VALUES ($1, 'store', 'Import test store', $2, $3) RETURNING id`,
        [L.h, dept.id, L.admin],
      )
    ).id;
    const s = await one<{ id: string; name: string }>(
      `SELECT id, name FROM pharmacy_counterparties WHERE hospital_id = $1 AND kind = 'supplier' ORDER BY created_at LIMIT 1`,
      [L.h],
    );
    f.supplier = s.id;
    f.supplierName = s.name;
  }, 900_000);

  it("S34, S35: a 600-row file is a draft; a different strength is never proposed; commit writes only accepted rows", async () => {
    const head = ["Name", "Strength", "Form", "Issue unit", "GTIN", "NDA number", "Pack"];
    const body: string[][] = [
      ["Importamycin", "500 mg", "capsule", "capsule", G500, "", "10 x 10"],
      ["Importamycin", "500 mg", "capsule", "capsule", G250, "", "10 x 10"],
      ["Importamycin", "125 mg", "capsule", "capsule", "", "", ""],
    ];
    for (let i = body.length; i < 600; i++)
      body.push([
        `Gauze swab ${i}`,
        "10 cm x 10 cm",
        "dressing",
        "piece",
        "",
        i % 2 ? `NDA/MD/${i}` : "",
        "pack of 100",
      ]);
    const before = await count("pharmacy_products");
    const t0 = performance.now();
    const d = await draft({
      kind: "products",
      fileName: "products.csv",
      text: csv([head, ...body]),
    });
    const ms = performance.now() - t0;
    process.stderr.write(`[import] 600-row products draft in ${Math.round(ms)} ms\n`);
    expect(ms).toBeLessThan(10_000);
    expect(await count("pharmacy_products")).toBe(before);
    const r = await rowsOf(d.id);
    expect(r).toHaveLength(600);
    expect(r[0]).toMatchObject({
      match: "matched",
      why: "Barcode",
      proposal: { packId: f.pack500, formularyId: f.formulary },
    });
    expect(r[1]).toMatchObject({ match: "check", proposal: null });
    expect(r[1]!.why).toMatch(/never proposed/);
    expect(r[2]).toMatchObject({ match: "not_in_catalogue", proposal: null });
    // A row with nothing proposed cannot be accepted.
    await expect(decide(d.id, [{ rowId: r[1]!.id, decision: "accept" }])).rejects.toThrow(
      /nothing to accept/,
    );
    await expect(decide(d.id, [{ rowId: r[4]!.id, decision: "add_supply" }])).rejects.toThrow(
      /registration/,
    );
    await decide(d.id, [
      { rowId: r[0]!.id, decision: "accept" },
      { rowId: r[3]!.id, decision: "add_supply" },
      { rowId: r[4]!.id, decision: "add_supply", noRegistration: true },
      { rowId: r[5]!.id, decision: "skip" },
    ]);
    expect(await count("pharmacy_products")).toBe(before);
    expect(await commit(d.id)).toMatchObject({ id: d.id });
    expect(await count("pharmacy_products")).toBe(before + 3);
    const made = await rows<{
      medicine_id: string;
      catalogue_pack_id: string | null;
      item_kind: string;
    }>(
      `SELECT p.medicine_id, p.catalogue_pack_id, p.item_kind FROM pharmacy_import_rows r JOIN pharmacy_products p ON p.id = r.committed_id
        WHERE r.draft_id = $1 ORDER BY r.line_no`,
      [d.id],
    );
    expect(made[0]).toEqual({
      medicine_id: f.formulary,
      catalogue_pack_id: f.pack500,
      item_kind: "formulary",
    });
    expect(made.slice(1).map((m) => m.item_kind)).toEqual(["health_supply", "health_supply"]);
    await expect(commit(d.id)).rejects.toThrow(/already committed/);
  });

  it("S36: opening stock places the products at a store not yet live; its blind opening count is still to do", async () => {
    const { locationReadiness } = await import("@/lib/pharmacy/stores/location-store");
    const { loadLocation } = await import("@/lib/pharmacy/stores/write");
    const products = await rows<{ id: string; name: string }>(
      `SELECT id, name FROM pharmacy_products WHERE hospital_id = $1 AND active AND item_kind = 'formulary' ORDER BY name LIMIT 2`,
      [L.h],
    );
    const text = csv([
      ["Place", "Product", "Batch", "Expiry", "Quantity", "Unit cost"],
      ["Import test store", products[0]!.id, "OB-1", "2027-03", "40", "120"],
      ["Import test store", products[1]!.name, "OB-2", "2027-06-30", "15", ""],
      ["Ward 9", products[1]!.name, "OB-3", "2027-06-30", "15", ""],
    ]);
    const movesBefore = await count("pharmacy_stock_movements");
    const d = await draft({
      kind: "opening_stock",
      fileName: "opening.csv",
      text,
      locationId: f.store,
    });
    const r = await rowsOf(d.id);
    expect(r.map((x) => x.match)).toEqual(["matched", "matched", "invalid"]);
    expect(r[0]!.proposal).toMatchObject({
      productId: products[0]!.id,
      expiry: "2027-03-31",
      monthOnly: true,
      quantity: 40,
      unitCost: 120,
    });
    await decide(d.id, [
      { rowId: r[0]!.id, decision: "accept" },
      { rowId: r[1]!.id, decision: "accept" },
    ]);
    await commit(d.id);
    expect(await count("pharmacy_stock_movements")).toBe(movesBefore);
    const placed = await rows<{ product_id: string }>(
      `SELECT product_id FROM pharmacy_product_locations WHERE location_id = $1 AND active ORDER BY product_id`,
      [f.store],
    );
    expect(placed.map((p) => p.product_id).sort()).toEqual(products.map((p) => p.id).sort());
    expect(
      Number(
        (
          await one<{ n: string }>(
            `SELECT count(*) AS n FROM pharmacy_counts WHERE location_id = $1`,
            [f.store],
          )
        ).n,
      ),
    ).toBe(0);
    const conditions = await L.lane.db.transaction(async (tx) =>
      locationReadiness(tx as never, L.h, await loadLocation(tx as never, L.h, f.store)),
    );
    expect(conditions.find((c) => c.id === "opening_count")).toMatchObject({ met: false });
    // A live store is refused.
    const live = await one(
      `SELECT id FROM pharmacy_locations WHERE hospital_id = $1 AND kind = 'store' AND live_at IS NOT NULL LIMIT 1`,
      [L.h],
    );
    await expect(
      draft({ kind: "opening_stock", fileName: "x.csv", text, locationId: live.id }),
    ).rejects.toThrow(/is live/);
  });

  it("S37: price-list lines match by barcode, then the supplier's code, and by name only for a person", async () => {
    const head = ["Supplier", "Edition date", "Item text", "Pack price", "Supplier code", "GTIN"];
    const first = await draft({
      kind: "price_list",
      fileName: "prices-oct.csv",
      supplierId: f.supplier,
      editionDate: "2026-10-01",
      text: csv([
        head,
        [f.supplierName, "2026-10-01", "Importa 500mg caps 10x10", "12,000", "IMP-500", G500],
      ]),
    });
    const [a] = await rowsOf(first.id);
    expect(a).toMatchObject({
      match: "matched",
      why: "Barcode",
      proposal: { packId: f.pack500, packPrice: 12000 },
    });
    await decide(first.id, [{ rowId: a!.id, decision: "accept" }]);
    await commit(first.id);
    const second = await draft({
      kind: "price_list",
      fileName: "prices-nov.csv",
      supplierId: f.supplier,
      editionDate: "2026-11-01",
      text: csv([
        head,
        [f.supplierName, "2026-11-01", "Importa caps (new text)", "12,500", "imp-500", ""],
        [f.supplierName, "2026-11-01", "Importamycin Importa 10 x 10", "9,000", "", ""],
        [f.supplierName, "2026-11-01", "Something else entirely", "1,000", "", ""],
      ]),
    });
    const r = await rowsOf(second.id);
    expect(r.map((x) => [x.match, x.why])).toEqual([
      ["matched", "Supplier code, as matched before"],
      ["check", "Found by name: a person decides."],
      ["not_in_catalogue", "No pack by this barcode, code or name."],
    ]);
    await expect(decide(second.id, [{ rowId: r[1]!.id, decision: "accept" }])).rejects.toThrow(
      /choose one/,
    );
    await decide(second.id, [{ rowId: r[1]!.id, decision: "accept", option: 0 }]);
    await commit(second.id);
    const lines = await rows<{ pack_id: string; pack_price_ugx: number }>(
      `SELECT l.pack_id, l.pack_price_ugx FROM pharmacy_price_list_lines l JOIN pharmacy_import_drafts d ON d.price_list_id = l.price_list_id
        WHERE d.id = $1`,
      [second.id],
    );
    expect(lines).toEqual([{ pack_id: f.pack500, pack_price_ugx: 9000 }]);
  });
});
