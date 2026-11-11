/**
 * Pharmacy Phase 1, Step 4: stock at the dispensing point (5.8, 5.3.1, SL-1..SL-11) on the PGlite lane.
 * Scenarios S1–S11 drive lib/pharmacy/stock/store.ts through the shared write path, and the reads in
 * lib/pharmacy/stock/read.ts as the clinician under RLS. Direct client writes to the ledger (S9's
 * second half) are proven in pharmacy-dispensing-data.test.ts and not repeated here.
 *
 * Medicines are catalogue ids (CT-1: there is one medicine list); every product, batch and quantity is
 * a fixture. Runs with EMR_PGLITE=1.
 */
import { randomUUID } from "node:crypto";
import type { Lane, Pg } from "./_pglite";
import type { PharmacyActor, PharmacyNeed } from "@/lib/pharmacy/write";
import type { z } from "zod";
import { beforeAll, describe, expect, it } from "vitest";

import { dispensingMap, PHARMACY_MAP_V2, pharmacyDispensingAccess } from "@/lib/pharmacy/access";
import { proposeBatches } from "@/lib/pharmacy/stock/fefo";
import { getStockDetail, getStockPage } from "@/lib/pharmacy/stock/read";
import * as store from "@/lib/pharmacy/stock/store";
import { runPharmacyWrite } from "@/lib/pharmacy/write";
import { bootLane, hospital, laneOn, probe, staff } from "./_pglite";

const id = async (pg: Pg, q: string, p?: unknown[]) =>
  (await pg.query<{ id: string }>(q, p)).rows[0]!.id;

/** Two catalogue medicines, neither controlled, and one that prescribing flags as controlled. */
const MED_A = "benzylpenicillin";
const MED_B = "amoxicillin";
const MED_CONTROLLED = "morphine";

describe.skipIf(!laneOn)("Stock at the dispensing point (Step 4, S1–S11)", () => {
  let lane: Lane;
  let pg: Pg;
  const f = {} as Record<string, string>;

  const actor = (
    userId: string,
    cadre: string,
    pointId: string | null,
    hospitalId = f.h!,
    map = PHARMACY_MAP_V2,
  ): PharmacyActor => ({
    userId,
    hospitalId,
    cadreCode: cadre,
    cadreName: cadre,
    pointId,
    access: pharmacyDispensingAccess(cadre, map),
  });
  const pharmacist = () => actor(f.pharmacist!, "PHARMACIST", f.op!);

  /** One write through the house path, as an action would run it. */
  function write<I, R extends { id: string }>(
    schema: z.ZodType<I>,
    fn: (ctx: Parameters<typeof store.receiveStock>[0], input: I) => Promise<R>,
    raw: unknown,
    who: PharmacyActor = pharmacist(),
    need: PharmacyNeed = store.STOCK_NEED,
  ) {
    return runPharmacyWrite(schema, raw, who, need, fn, { database: lane.db }).catch(
      (e: Error) => ({ ok: false as const, code: "thrown", error: e.message }),
    );
  }
  const balance = async (batchId: string) =>
    (
      await pg.query<{ n: number }>(
        `SELECT coalesce(sum(quantity), 0)::int AS n FROM public.pharmacy_stock_movements WHERE batch_id = $1`,
        [batchId],
      )
    ).rows[0]!.n;
  const product = async (medicineId: string, name: string) => {
    const r = await write(store.ProductInput, store.addProduct, {
      clientKey: randomUUID(),
      medicineId,
      name,
      issueUnit: "tablet",
      strength: "[S1]",
    });
    if (!r.ok) throw new Error(r.error);
    return r.id;
  };
  const receive = (productId: string, batchNumber: string, expiry: string, quantity: number) =>
    write(store.ReceiveInput, store.receiveStock, {
      clientKey: randomUUID(),
      productId,
      batchNumber,
      expiry,
      quantity,
      from: "main_store",
    });
  const page = (who = { userId: f.pharmacist!, hospitalId: f.h! }, pointId = f.op!) =>
    getStockPage(who, { id: pointId }, new Date(), lane.db);

  beforeAll(async () => {
    lane = await bootLane();
    pg = lane.pg;
    for (const h of ["h", "h2"]) {
      f[h] = await hospital(pg, `Stock ${h}`);
      f[`${h}pharmacy`] = await id(
        pg,
        `INSERT INTO public.hospital_departments (hospital_id, name, slug, kind, catalogue_code)
         VALUES ($1, 'Pharmacy', $2, 'support', 'PHARMACY') RETURNING id`,
        [f[h], `ph-${h}-${Date.now()}`],
      );
    }
    for (const [k, h, name] of [
      ["op", "h", "Fixture point A"],
      ["ip", "h", "Fixture point B"],
      ["other", "h2", "Fixture point C"],
    ] as const) {
      f[k] = await id(
        pg,
        `INSERT INTO public.hospital_departments (hospital_id, parent_id, name, slug, kind)
         VALUES ($1, $2, $3, $4, 'support') RETURNING id`,
        [f[h], f[`${h}pharmacy`], name, `${k}-${Date.now()}`],
      );
      await pg.query(
        `INSERT INTO public.pharmacy_dispensing_points (department_id, hospital_id, serves) VALUES ($1, $2, 'window')`,
        [f[k], f[h]],
      );
    }
    f.pharmacist = (
      await staff(pg, { hospitalId: f.h!, departmentId: f.hpharmacy!, cadre: "PHARMACIST" })
    ).userId;
    f.tech = (
      await staff(pg, { hospitalId: f.h!, departmentId: f.op!, cadre: "PHARMACY_TECH" })
    ).userId;
    f.head = (
      await staff(pg, { hospitalId: f.h!, departmentId: f.op!, cadre: "PHARMACY_TECH" })
    ).userId;
    await pg.query(
      `INSERT INTO public.department_heads (hospital_id, department_id, user_id, starts_at)
       VALUES ($1, $2, $3, now() - interval '1 day')`,
      [f.h, f.op, f.head],
    );
    f.pharmacistB = (
      await staff(pg, { hospitalId: f.h2!, departmentId: f.h2pharmacy!, cadre: "PHARMACIST" })
    ).userId;
    await pg.query(
      `INSERT INTO public.pharmacy_hospital_settings (hospital_id, expiry_lookahead_days, updated_by)
       VALUES ($1, 90, $2)`,
      [f.h, f.pharmacist],
    );
    f.productA = await product(MED_A, "Fixture tablet A 28s");
  }, 180_000);

  it("S1, SL-8: a receipt with a batch and an expiry; the balance is the quantity and the ledger holds one row carrying its actor, point and times", async () => {
    const r = await receive(f.productA!, "FX-001", "2030-03", 120);
    expect(r.ok).toBe(true);
    const { batchId } = (r as { data: { batchId: string } }).data;
    f.batch1 = batchId;
    expect(await balance(batchId)).toBe(120);
    const rows = await pg.query(
      `SELECT kind, quantity, delivery_from, source_kind FROM public.pharmacy_stock_movements WHERE batch_id = $1`,
      [batchId],
    );
    expect(rows.rows).toEqual([
      { kind: "received", quantity: 120, delivery_from: "main_store", source_kind: "delivery" },
    ]);
    // SL-8: every movement names who, where and when (effective and recorded).
    const fields = await pg.query<{ ok: boolean }>(
      `SELECT bool_and(actor_user_id IS NOT NULL AND dispensing_point_id IS NOT NULL
                       AND effective_at IS NOT NULL AND recorded_at IS NOT NULL) AS ok
         FROM public.pharmacy_stock_movements WHERE batch_id = $1`,
      [batchId],
    );
    expect(fields.rows[0]!.ok).toBe(true);
    // The same client key again returns the same movement and writes nothing more.
    const key = randomUUID();
    const raw = {
      clientKey: key,
      productId: f.productA,
      batchNumber: "FX-001",
      expiry: "2030-03",
      quantity: 5,
      from: "supplier",
    };
    const once = await write(store.ReceiveInput, store.receiveStock, raw);
    const twice = await write(store.ReceiveInput, store.receiveStock, raw);
    expect(once.ok && twice.ok && once.id === twice.id).toBe(true);
    expect(await balance(batchId)).toBe(125);
  });

  it("S2: a blind count that matches records matched; one that differs shows both figures and takes a reason", async () => {
    const key = randomUUID();
    const matched = await write(store.CountInput, store.recordCount, {
      step: "count",
      clientKey: key,
      medicineId: MED_A,
      lines: [{ batchId: f.batch1, counted: 125 }],
    });
    expect(matched.ok).toBe(true);
    expect((matched as { data: { lines: unknown[] } }).data.lines).toEqual([
      { batchId: f.batch1, batchNumber: "FX-001", counted: 125, recorded: 125 },
    ]);

    // A batch left out of the count is refused before anything is written.
    const partial = await write(store.CountInput, store.recordCount, {
      step: "count",
      clientKey: randomUUID(),
      medicineId: MED_A,
      lines: [],
    });
    expect(partial).toMatchObject({ ok: false, error: expect.stringMatching(/FX-001/) });

    const countKey = randomUUID();
    const differs = await write(store.CountInput, store.recordCount, {
      step: "count",
      clientKey: countKey,
      medicineId: MED_A,
      lines: [{ batchId: f.batch1, counted: 121 }],
    });
    expect((differs as { data: { lines: unknown[] } }).data.lines).toEqual([
      { batchId: f.batch1, batchNumber: "FX-001", counted: 121, recorded: 125 },
    ]);
    // Saved as typed, the record unchanged until the reason is given.
    expect(await balance(f.batch1!)).toBe(125);
    const detail = await getStockDetail(
      { userId: f.pharmacist!, hospitalId: f.h! },
      { id: f.op! },
      MED_A,
      new Date(),
      lane.db,
    );
    expect(detail?.openDifferences).toEqual([
      expect.objectContaining({ countId: countKey, counted: 121, recorded: 125 }),
    ]);

    const noReason = await write(store.CountInput, store.recordCount, {
      step: "reasons",
      countId: countKey,
      corrections: [{ batchId: f.batch1 }],
    });
    expect(noReason.ok).toBe(false);
    const reasoned = {
      step: "reasons",
      countId: countKey,
      corrections: [{ batchId: f.batch1, reasonCode: "supply_unrecorded" }],
    };
    expect((await write(store.CountInput, store.recordCount, reasoned)).ok).toBe(true);
    expect((await write(store.CountInput, store.recordCount, reasoned)).ok).toBe(true); // once only
    expect(await balance(f.batch1!)).toBe(121);
    const corrections = await pg.query(
      `SELECT quantity, reason_code FROM public.pharmacy_stock_movements
        WHERE source_kind = 'count' AND source_id = $1`,
      [countKey],
    );
    expect(corrections.rows).toEqual([{ quantity: -4, reason_code: "supply_unrecorded" }]);
  });

  it("S3: an adjustment without a reason is refused; with one it is recorded and the balance moves", async () => {
    const without = await write(store.AdjustInput, store.adjustStock, {
      clientKey: randomUUID(),
      batchId: f.batch1,
      quantity: -2,
    });
    expect(without).toMatchObject({ ok: false, code: "invalid" });
    const otherNoText = await write(store.AdjustInput, store.adjustStock, {
      clientKey: randomUUID(),
      batchId: f.batch1,
      quantity: -2,
      reasonCode: "other",
    });
    expect(otherNoText).toMatchObject({ ok: false, code: "invalid" });
    const withReason = await write(store.AdjustInput, store.adjustStock, {
      clientKey: randomUUID(),
      batchId: f.batch1,
      quantity: -2,
      reasonCode: "damaged",
    });
    expect(withReason.ok).toBe(true);
    expect(await balance(f.batch1!)).toBe(119);
    // The guard refuses a live movement below zero, in words.
    const tooMany = await write(store.AdjustInput, store.adjustStock, {
      clientKey: randomUUID(),
      batchId: f.batch1,
      quantity: -500,
      reasonCode: "lost",
    });
    expect(tooMany).toMatchObject({
      ok: false,
      error: "Batch FX-001 now holds 119. Choose again.",
    });
  });

  it("S4: an expired batch shows Expired, remove, is not offered for supply and does not count as stock", async () => {
    const productB = await product(MED_B, "Fixture capsule C 100s");
    const r = await receive(productB, "FX-OLD", "2020-01-31", 30);
    expect(r.ok).toBe(true);
    const old = (r as { data: { batchId: string } }).data.batchId;
    const p = await page();
    const row = p.rows.find((x) => x.medicineId === MED_B)!;
    expect(row.state).toBe("expired_remove");
    expect(row.onShelf).toBe(0);
    expect(row.out).toBe(true);
    const batches = p.batches.filter((b) => b.medicineId === MED_B);
    const bal = new Map([[old, 30]]);
    expect(
      proposeBatches({ batches, balances: bal, quantity: 1, localDate: "2026-10-12" }),
    ).toEqual({ ok: false, reason: "not_enough", available: 0 });
  });

  it("S5, SL-7: a transfer writes both movements; with a failure between them, neither exists", async () => {
    const key = randomUUID();
    const ok = await write(store.TransferInput, store.transferStock, {
      clientKey: key,
      batchId: f.batch1,
      quantity: 9,
      toPointId: f.ip,
    });
    expect(ok.ok).toBe(true);
    const moves = await pg.query<{ kind: string; quantity: number; dispensing_point_id: string }>(
      `SELECT kind, quantity, dispensing_point_id FROM public.pharmacy_stock_movements
        WHERE id = $1 OR source_id = $1 ORDER BY kind`,
      [key],
    );
    expect(moves.rows).toEqual([
      { kind: "transfer_in", quantity: 9, dispensing_point_id: f.ip },
      { kind: "transfer_out", quantity: -9, dispensing_point_id: f.op },
    ]);
    const there = await pg.query(
      `SELECT batch_number, expiry::text, expiry_month_only FROM public.pharmacy_batches WHERE dispensing_point_id = $1`,
      [f.ip],
    );
    expect(there.rows).toEqual([
      { batch_number: "FX-001", expiry: "2030-03-01", expiry_month_only: true },
    ]);
    expect(await balance(f.batch1!)).toBe(110);

    await pg.exec(`
      CREATE FUNCTION public.lane_fail_transfer_in() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'injected failure between the two movements'; END $$;
      CREATE TRIGGER lane_fail_transfer_in BEFORE INSERT ON public.pharmacy_stock_movements
        FOR EACH ROW WHEN (NEW.kind = 'transfer_in') EXECUTE FUNCTION public.lane_fail_transfer_in();`);
    const failKey = randomUUID();
    try {
      const failed = await write(store.TransferInput, store.transferStock, {
        clientKey: failKey,
        batchId: f.batch1,
        quantity: 3,
        toPointId: f.ip,
      });
      expect(failed.ok).toBe(false);
    } finally {
      await pg.exec(`DROP TRIGGER lane_fail_transfer_in ON public.pharmacy_stock_movements;
                     DROP FUNCTION public.lane_fail_transfer_in();`);
    }
    const none = await pg.query(
      `SELECT 1 FROM public.pharmacy_stock_movements WHERE id = $1 OR source_id = $1`,
      [failKey],
    );
    expect(none.rows).toEqual([]);
    expect(await balance(f.batch1!)).toBe(110);
  });

  it("S5: a request from another point is listed there, and a transfer for it closes it", async () => {
    const req = await write(
      store.RequestInput,
      store.requestStock,
      { clientKey: randomUUID(), toPointId: f.op, medicineId: MED_A, quantity: 4 },
      actor(f.pharmacist!, "PHARMACIST", f.ip!),
    );
    expect(req.ok).toBe(true);
    const p = await page();
    expect(p.requests).toEqual([
      expect.objectContaining({ id: req.ok && req.id, fromPoint: "Fixture point B", quantity: 4 }),
    ]);
    const sent = await write(store.TransferInput, store.transferStock, {
      clientKey: randomUUID(),
      batchId: f.batch1,
      quantity: 4,
      toPointId: f.ip,
      requestId: req.ok && req.id,
    });
    expect(sent.ok).toBe(true);
    expect((await page()).requests).toEqual([]);
    const closeAgain = await write(store.CloseRequestInput, store.closeStockRequest, {
      requestId: req.ok && req.id,
      reason: "Fixture reason",
    });
    expect(closeAgain).toMatchObject({ ok: false, error: "This request is already closed." });
  });

  it("S6: a batch number already here with a different expiry is refused, with both shown", async () => {
    const r = await receive(f.productA!, "FX-001", "2031-06-30", 10);
    expect(r).toMatchObject({
      ok: false,
      code: "conflict",
      error: "FX-001 is already here with expiry 03/2030, not 30 Jun 2031. Check the label.",
    });
    // The month's last day is the same expiry as the month.
    expect((await receive(f.productA!, "FX-001", "2030-03-31", 1)).ok).toBe(true);
  });

  it("S7: a medicine with no product here says so and a stock holder can add one; no level, never Low", async () => {
    const MED_C = "ceftriaxone";
    const before = await getStockDetail(
      { userId: f.pharmacist!, hospitalId: f.h! },
      { id: f.op! },
      MED_C,
      new Date(),
      lane.db,
    );
    expect(before?.products.filter((p) => p.atPoint)).toEqual([]);
    const tech = actor(f.tech!, "PHARMACY_TECH", f.op!);
    const added = await write(
      store.ProductInput,
      store.addProduct,
      { clientKey: randomUUID(), medicineId: MED_C, name: "Fixture vial D", issueUnit: "vial" },
      tech,
    );
    expect(added.ok).toBe(true);
    const r = await receive(added.ok ? added.id : "", "FX-010", "2031-01-01", 2);
    expect(r.ok).toBe(true);
    let row = (await page()).rows.find((x) => x.medicineId === MED_C)!;
    expect(row.state).toBe("in_stock"); // two vials, no level: never Low
    expect(row.low).toBe(false);

    // A level set by the in-charge (manage) makes it Low; a technician without the post cannot set one.
    const level = { clientKey: randomUUID(), medicineId: MED_C, level: 5 };
    expect(
      await write(store.LevelInput, store.setReorderLevel, level, tech, store.MANAGE_AT_POINT),
    ).toMatchObject({ ok: false, code: "forbidden" });
    const head = actor(f.head!, "PHARMACY_TECH", f.op!);
    expect(
      (await write(store.LevelInput, store.setReorderLevel, level, head, store.MANAGE_AT_POINT)).ok,
    ).toBe(true);
    row = (await page()).rows.find((x) => x.medicineId === MED_C)!;
    expect(row.state).toBe("low");

    // Step 7: a controlled medicine's product is added; it is received only with a witness (CD-5).
    const controlled = await write(store.ProductInput, store.addProduct, {
      clientKey: randomUUID(),
      medicineId: MED_CONTROLLED,
      name: "Fixture injection E",
      issueUnit: "ampoule",
    });
    expect(controlled.ok).toBe(true);
    if (!controlled.ok) return;
    const unwitnessed = await write(store.ReceiveInput, store.receiveStock, {
      clientKey: randomUUID(),
      productId: controlled.id,
      batchNumber: "FX-CD-1",
      expiry: "2031-01",
      quantity: 5,
      from: "main_store",
    });
    expect(unwitnessed).toMatchObject({
      ok: false,
      error:
        "A controlled drug is received, counted and moved with a witness, on the Controlled drugs page.",
    });
  });

  it("S8: a batch found on the shelf is added with a reason and can then be chosen", async () => {
    const noReason = await write(store.FoundInput, store.addBatchFoundOnShelf, {
      clientKey: randomUUID(),
      productId: f.productA,
      batchNumber: "FX-002",
      expiry: "2031-09-30",
      quantity: 6,
    });
    expect(noReason.ok).toBe(false);
    const found = await write(store.FoundInput, store.addBatchFoundOnShelf, {
      clientKey: randomUUID(),
      productId: f.productA,
      batchNumber: "FX-002",
      expiry: "2031-09-30",
      quantity: 6,
      reason: "Fixture: on the back of the shelf",
    });
    expect(found.ok).toBe(true);
    const batchId = (found as { data: { batchId: string } }).data.batchId;
    expect(await balance(batchId)).toBe(6);
    const p = await page();
    const batches = p.batches.filter((b) => b.medicineId === MED_A);
    const bal = new Map(batches.map((b) => [b.id, b.id === batchId ? 6 : 0]));
    expect(
      proposeBatches({ batches, balances: bal, quantity: 6, localDate: "2026-10-12" }),
    ).toEqual({ ok: true, rows: [{ batchId, quantity: 6 }] });

    // A medicine with no product here: the same holder adds one, marked "Added at the window".
    const atWindow = await write(store.FoundInput, store.addBatchFoundOnShelf, {
      clientKey: randomUUID(),
      newProduct: { medicineId: "gentamicin", name: "Fixture ampoule F", issueUnit: "ampoule" },
      batchNumber: "FX-020",
      expiry: "2031-01",
      quantity: 3,
      reason: "Fixture: found at the window",
    });
    expect(atWindow.ok).toBe(true);
    const made = await pg.query(
      `SELECT added_at_window FROM public.pharmacy_products WHERE id = $1`,
      [(atWindow as { data: { productId: string } }).data.productId],
    );
    expect(made.rows).toEqual([{ added_at_window: true }]);
  });

  it("S9: a viewer with pharmacy.view only reads the page and can write nothing", async () => {
    const viewer = actor(f.pharmacist!, "PHARMACIST", f.op!, f.h!, dispensingMap("production"));
    expect([...viewer.access.permissions]).toEqual(["pharmacy.view"]);
    const k = () => randomUUID();
    const refusals = await Promise.all([
      write(
        store.ReceiveInput,
        store.receiveStock,
        {
          clientKey: k(),
          productId: f.productA,
          batchNumber: "FX-900",
          expiry: "2031-01",
          quantity: 1,
          from: "supplier",
        },
        viewer,
      ),
      write(
        store.FoundInput,
        store.addBatchFoundOnShelf,
        {
          clientKey: k(),
          productId: f.productA,
          batchNumber: "FX-901",
          expiry: "2031-01",
          quantity: 1,
          reason: "Fixture reason",
        },
        viewer,
      ),
      write(
        store.CountInput,
        store.recordCount,
        {
          step: "count",
          clientKey: k(),
          medicineId: MED_A,
          lines: [],
        },
        viewer,
      ),
      write(
        store.AdjustInput,
        store.adjustStock,
        {
          clientKey: k(),
          batchId: f.batch1,
          quantity: 1,
          reasonCode: "found",
        },
        viewer,
      ),
      write(
        store.TransferInput,
        store.transferStock,
        {
          clientKey: k(),
          batchId: f.batch1,
          quantity: 1,
          toPointId: f.ip,
        },
        viewer,
      ),
      write(
        store.RequestInput,
        store.requestStock,
        {
          clientKey: k(),
          toPointId: f.ip,
          medicineId: MED_A,
          quantity: null,
        },
        viewer,
      ),
      write(
        store.ProductInput,
        store.addProduct,
        {
          clientKey: k(),
          medicineId: MED_A,
          name: "Fixture tablet G",
          issueUnit: "tablet",
        },
        viewer,
      ),
      write(
        store.PriceInput,
        store.setProductPrice,
        { productId: f.productA, priceUgx: "100" },
        viewer,
        store.MANAGE,
      ),
      write(
        store.LevelInput,
        store.setReorderLevel,
        { clientKey: k(), medicineId: MED_A, level: 1 },
        viewer,
        store.MANAGE_AT_POINT,
      ),
      write(
        store.FreshnessInput,
        store.setCountFreshness,
        { days: 7 },
        viewer,
        store.MANAGE_AT_POINT,
      ),
      write(
        store.CorrectInput,
        store.correctBatchDetails,
        {
          clientKey: k(),
          batchId: f.batch1,
          batchNumber: "FX-999",
          expiry: "2030-03",
          reason: "Fixture reason",
        },
        viewer,
        store.MANAGE_AT_POINT,
      ),
    ]);
    for (const r of refusals) expect(r).toMatchObject({ ok: false, code: "forbidden" });
    const read = await page();
    expect(read.rows.length).toBeGreaterThan(0);
    expect(read.manages).toBe(false);
  });

  it("S10: a pharmacist of another hospital sees none of it", async () => {
    const theirs = await page({ userId: f.pharmacistB!, hospitalId: f.h2! });
    expect(theirs.rows).toEqual([]);
    // Claiming this hospital does not help: the permission is read from their own affiliation.
    const claimed = await page({ userId: f.pharmacistB!, hospitalId: f.h! });
    expect(claimed.rows).toEqual([]);
    for (const t of [
      "pharmacy_products",
      "pharmacy_batches",
      "pharmacy_stock_movements",
      "pharmacy_counts",
      "pharmacy_count_lines",
      "pharmacy_reorder_levels",
      "pharmacy_stock_requests",
    ]) {
      const r = await probe(
        pg,
        { userId: f.pharmacistB!, role: "medsync_clinical_reader", hospitalId: f.h! },
        `SELECT count(*)::int AS n FROM public.${t}`,
      );
      expect(r, t).toMatchObject({ ok: true, rows: [{ n: 0 }] });
    }
    // And their own writes cannot reach a point here.
    const r = await write(
      store.ReceiveInput,
      store.receiveStock,
      {
        clientKey: randomUUID(),
        productId: f.productA,
        batchNumber: "FX-777",
        expiry: "2031-01",
        quantity: 1,
        from: "supplier",
      },
      actor(f.pharmacistB!, "PHARMACIST", f.op!, f.h2!),
    );
    expect(r).toMatchObject({ ok: false, code: "forbidden" });
  });

  it("S11: a mistyped expiry is corrected by the in-charge; the old value stays and no movement changes", async () => {
    const r = await receive(f.productA!, "FX-003", "2032-01-31", 12);
    const batchId = (r as { data: { batchId: string } }).data.batchId;
    const ledgerBefore = await pg.query(
      `SELECT id, quantity FROM public.pharmacy_stock_movements WHERE batch_id = $1 ORDER BY id`,
      [batchId],
    );
    const raw = {
      clientKey: randomUUID(),
      batchId,
      batchNumber: "FX-003",
      expiry: "2032-07-31",
      reason: "Fixture: mistyped at receipt",
    };
    const tech = actor(f.tech!, "PHARMACY_TECH", f.op!);
    expect(
      await write(store.CorrectInput, store.correctBatchDetails, raw, tech, store.MANAGE_AT_POINT),
    ).toMatchObject({ ok: false, code: "forbidden" });
    const head = actor(f.head!, "PHARMACY_TECH", f.op!);
    const ok = await write(
      store.CorrectInput,
      store.correctBatchDetails,
      raw,
      head,
      store.MANAGE_AT_POINT,
    );
    expect(ok.ok).toBe(true);
    const b = await pg.query(
      `SELECT expiry::text, first_expiry::text FROM public.pharmacy_batches WHERE id = $1`,
      [batchId],
    );
    expect(b.rows).toEqual([{ expiry: "2032-07-31", first_expiry: "2032-01-31" }]);
    const c = await pg.query(
      `SELECT old_expiry::text, new_expiry::text, reason FROM public.pharmacy_batch_corrections WHERE batch_id = $1`,
      [batchId],
    );
    expect(c.rows).toEqual([
      {
        old_expiry: "2032-01-31",
        new_expiry: "2032-07-31",
        reason: "Fixture: mistyped at receipt",
      },
    ]);
    const ledgerAfter = await pg.query(
      `SELECT id, quantity FROM public.pharmacy_stock_movements WHERE batch_id = $1 ORDER BY id`,
      [batchId],
    );
    expect(ledgerAfter.rows).toEqual(ledgerBefore.rows);
  });

  it("the in-charge sets a price and the count freshness; a request is withdrawn with a reason", async () => {
    const head = actor(f.head!, "PHARMACY_TECH", f.op!);
    const price = await write(
      store.PriceInput,
      store.setProductPrice,
      { productId: f.productA, priceUgx: "1500.50" },
      head,
      store.MANAGE,
    );
    const fresh = await write(
      store.FreshnessInput,
      store.setCountFreshness,
      { days: 7 },
      head,
      store.MANAGE_AT_POINT,
    );
    expect(price.ok && fresh.ok).toBe(true);
    const rows = await pg.query(
      `SELECT (SELECT price_ugx::text FROM public.pharmacy_products WHERE id = $1) AS price,
              (SELECT count_freshness_days FROM public.pharmacy_dispensing_points WHERE department_id = $2) AS days`,
      [f.productA, f.op],
    );
    expect(rows.rows).toEqual([{ price: "1500.50", days: 7 }]);

    const req = await write(store.RequestInput, store.requestStock, {
      clientKey: randomUUID(),
      toPointId: f.ip,
      medicineId: MED_A,
      quantity: null,
    });
    const closed = await write(store.CloseRequestInput, store.closeStockRequest, {
      requestId: req.ok && req.id,
      reason: "Fixture: found it here",
    });
    expect(closed.ok).toBe(true);
  });

  it("the page: three figures and the opening count (RD-1)", async () => {
    const p = await page();
    expect(p.figures.lookaheadDays).toBe(90);
    expect(p.figures.medicines).toBe(p.rows.length);
    expect(p.figures.outVital).toBeNull(); // no national list imported
    // Only the first medicine has been counted; every other product here still needs its opening count.
    expect(p.figures.counted).toBe(1);
    expect(p.openingMissing).toBe(p.products.filter((x) => x.medicineId !== MED_A).length);
    expect(p.manages).toBe(false);
    const asHead = await page({ userId: f.head!, hospitalId: f.h! });
    expect(asHead.manages).toBe(true);
  });

});
