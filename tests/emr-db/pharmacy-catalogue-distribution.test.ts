/**
 * Distribution checks (catalogue slice Step 10; migration 0259) on the demo lane, with the check on: picks before an
 * issue (S38, S39), the receipt's existing rule (S40), ward use against the charts (S41), cart seals and signals (S42),
 * no movement from any check (S43), and IS-6 on the screen (S44). Runs with EMR_PGLITE=1.
 */
import type { DemoLane } from "./_pharmacy-demo";
import type * as State from "@/lib/pharmacy/demo/state";
import type * as Dist from "@/lib/pharmacy/distribution/store";
import type * as Issues from "@/lib/pharmacy/stores/issue-store";
import type { PharmacyActor } from "@/lib/pharmacy/write";
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

/** A GTIN-14 with its check digit, from 13 digits. */
const gtin = (base: string) => {
  const sum = [...base].reverse().reduce((s, d, i) => s + Number(d) * (i % 2 === 0 ? 3 : 1), 0);
  return base + ((10 - (sum % 10)) % 10);
};

describe.skipIf(!laneOn)("distribution checks (Step 10, 0259)", () => {
  let L: DemoLane;
  let chief: PharmacyActor;
  let dist: typeof Dist;
  let iss: typeof Issues;
  let write: typeof State.write;
  let STORE: Parameters<typeof write>[3];
  const rows = async <T>(q: string, p: unknown[] = []) => (await L.pg.query<T>(q, p)).rows;
  const movements = async () =>
    Number((await rows<{ n: string }>(`SELECT count(*) AS n FROM pharmacy_stock_movements`))[0]!.n);
  const run = (schema: unknown, fn: unknown, raw: Record<string, unknown>) =>
    write(L.s, chief, schema as never, STORE, fn as never, raw);

  /** A raised requisition with a line whose product has two usable batches at the issuing place. */
  let req: {
    id: string;
    line: string;
    product: string;
    other: string;
    later: string;
    from: string;
  };

  beforeAll(async () => {
    process.env.PHARMACY_CATALOGUE = "1";
    L = await demoLane((db) => (held.db = db));
    const state = await import("@/lib/pharmacy/demo/state");
    write = state.write;
    chief = state.chiefActor(L.s, null);
    dist = await import("@/lib/pharmacy/distribution/store");
    iss = await import("@/lib/pharmacy/stores/issue-store");
    STORE = (await import("@/lib/pharmacy/stores/write")).storeNeed("pharmacy.store");
    const { storesSection } = await import("@/lib/pharmacy/demo/stores");
    await storesSection(L.s);
    const { wardsSection } = await import("@/lib/pharmacy/demo/wards");
    await wardsSection(L.s);
    // A fresh requisition to the main store for a product it holds in two batches.
    const [two] = await rows<{ product: string; place: string; later: string }>(
      `SELECT b.product_id AS product, b.location_id AS place,
              (array_agg(b.batch_number ORDER BY b.expiry DESC))[1] AS later
         FROM pharmacy_batches b
         JOIN pharmacy_locations l ON l.id = b.location_id AND l.kind = 'store'
        WHERE b.hospital_id = $1 AND b.expiry > now() + interval '120 days'
          AND (SELECT coalesce(sum(quantity), 0) FROM pharmacy_stock_movements m WHERE m.batch_id = b.id) > 0
        GROUP BY b.product_id, b.location_id HAVING count(*) >= 2 LIMIT 1`,
      [L.h],
    );
    expect(two).toBeTruthy();
    const [other] = await rows<{ id: string }>(
      `SELECT id FROM pharmacy_products WHERE hospital_id = $1 AND id <> $2 AND active LIMIT 1`,
      [L.h, two!.product],
    );
    await L.pg.query(`UPDATE pharmacy_products SET gtin = $2 WHERE id = $1`, [
      two!.product,
      gtin("0950600013435"),
    ]);
    await L.pg.query(`UPDATE pharmacy_products SET gtin = $2 WHERE id = $1`, [
      other!.id,
      gtin("0950600099999"),
    ]);
    const point = L.s.points.inpatient.id;
    const raised = await run(iss.RaiseRequisitionInput, iss.raiseRequisition, {
      clientKey: crypto.randomUUID(),
      requestingLocationId: point,
      issuingLocationId: two!.place,
      lines: [{ productId: two!.product, quantity: 2 }],
    });
    const [line] = await rows<{ id: string }>(
      `SELECT id FROM pharmacy_requisition_lines WHERE requisition_id = $1`,
      [raised.id],
    );
    req = {
      id: raised.id,
      line: line!.id,
      product: two!.product,
      other: other!.id,
      later: two!.later,
      from: two!.place,
    };
  }, 600_000);

  it("S38: a wrong product is refused in words; an unpicked line is not issued; a scan of the right pack is", async () => {
    const before = await movements();
    await expect(
      run(dist.RecordPickInput, dist.recordPick, {
        requisitionId: req.id,
        lineId: req.line,
        raw: `01${gtin("0950600099999")}`,
      }),
    ).rejects.toThrow(/The line asks for/);
    await expect(
      run(iss.IssueRequisitionInput, iss.issueRequisition, {
        requisitionId: req.id,
        lines: [{ lineId: req.line, quantity: 2 }],
      }),
    ).rejects.toThrow(/Pick every line/);
    await run(dist.RecordPickInput, dist.recordPick, {
      requisitionId: req.id,
      lineId: req.line,
      raw: `01${gtin("0950600013435")}`,
    });
    expect(await movements()).toBe(before); // S43: a pick is a check, never stock.
    const { getRequisition } = await import("@/lib/pharmacy/stores/store-read");
    const v = await getRequisition(
      { hospitalId: L.h, userId: L.s.people.chief },
      req.id,
      L.s.now,
      L.lane.db as never,
    );
    expect(v!.lines[0]!.pick?.method).toBe("scan");
    expect(v!.lines[0]!.planned.length).toBeGreaterThan(0);
  });

  it("S39: a later batch than planned needs the coded reason", async () => {
    const raw = `01${gtin("0950600013435")}10${req.later}`;
    await expect(
      run(dist.RecordPickInput, dist.recordPick, { requisitionId: req.id, lineId: req.line, raw }),
    ).rejects.toThrow(/expires first/);
    await run(dist.RecordPickInput, dist.recordPick, {
      requisitionId: req.id,
      lineId: req.line,
      raw,
      laterReason: "first_unfit",
    });
    const [p] = await rows<{ later_batch_reason: string; method: string }>(
      `SELECT later_batch_reason, method FROM pharmacy_issue_picks WHERE line_id = $1 ORDER BY picked_at DESC LIMIT 1`,
      [req.line],
    );
    expect(p).toEqual({ later_batch_reason: "first_unfit", method: "scan" });
    await run(iss.IssueRequisitionInput, iss.issueRequisition, {
      requisitionId: req.id,
      lines: [{ lineId: req.line, quantity: 2 }],
    });
  });

  it("S40, S41: the ward page reads use against the charts; a gap reason is written once, never a movement", async () => {
    const { getWardStockPage } = await import("@/lib/pharmacy/stores/ward-read");
    const [w] = await rows<{ id: string }>(
      `SELECT c.location_id AS id FROM pharmacy_counts c JOIN pharmacy_locations l ON l.id = c.location_id
        WHERE c.hospital_id = $1 AND l.kind = 'ward' LIMIT 1`,
      [L.h],
    );
    expect(w).toBeTruthy();
    const page = await getWardStockPage(L.lane.db as never, L.h, w!.id, L.s.now);
    expect(page!.useCheck!.length).toBeGreaterThan(0);
    // The administration record names no ward-stock source: no row is read as a gap on real data.
    expect(new Set(page!.useCheck!.map((r) => r.compared.words))).toEqual(
      new Set(["Not charted from ward stock"]),
    );
    const r = page!.useCheck![0]!;
    const before = await movements();
    const asWho = (fn: (w: unknown, i: unknown) => unknown) => (ctx: never, i: unknown) =>
      fn(
        {
          tx: (ctx as { tx: unknown }).tx,
          hospitalId: L.h,
          userId: L.s.people.chief,
          now: L.s.now,
        },
        i,
      );
    const input = {
      locationId: w!.id,
      countId: r.countId,
      productId: r.productId,
      gap: 3,
      reasonCode: "given_not_charted",
    };
    await run(dist.GapReasonInput, asWho(dist.recordGapReason as never), input);
    await expect(
      run(dist.GapReasonInput, asWho(dist.recordGapReason as never), input),
    ).rejects.toThrow(/already recorded/);
    expect(await movements()).toBe(before);
  });

  it("S42: a broken seal puts the cart on the check list; the demo's checks applied their seals", async () => {
    const { getCartsPage } = await import("@/lib/pharmacy/stores/ward-read");
    const [cart] = await rows<{ id: string }>(
      `SELECT id FROM pharmacy_locations WHERE hospital_id = $1 AND kind = 'cart' LIMIT 1`,
      [L.h],
    );
    const applied = await rows<{ n: string }>(
      `SELECT count(*) AS n FROM pharmacy_seal_events WHERE hospital_id = $1 AND kind = 'applied'`,
      [L.h],
    );
    const sealed = await rows<{ n: string }>(
      `SELECT count(*) AS n FROM pharmacy_cart_checks WHERE hospital_id = $1 AND seal_number IS NOT NULL`,
      [L.h],
    );
    expect(Number(applied[0]!.n)).toBe(Number(sealed[0]!.n));
    const before = await movements();
    const asWho = (ctx: never, i: unknown) =>
      dist.reportSealBroken(
        {
          tx: (ctx as { tx: never }).tx,
          hospitalId: L.h,
          userId: L.s.people.chief,
          now: new Date(),
        },
        i as never,
      );
    await run(dist.SealBrokenInput, asWho, { locationId: cart!.id, note: "Demo: seal found cut" });
    expect(await movements()).toBe(before); // S43
    const page = await getCartsPage(L.lane.db as never, L.h, new Date());
    const row = page.rows.find((c) => c.id === cart!.id)!;
    expect(row.signal).toEqual({ due: true, why: expect.arrayContaining(["seal_broken"]) });
  });

  it("S44: every line of every demo requisition says whether it needs a witness before it is issued", async () => {
    const { getRequisition } = await import("@/lib/pharmacy/stores/store-read");
    const all = await rows<{ id: string }>(
      `SELECT id FROM pharmacy_requisitions WHERE hospital_id = $1`,
      [L.h],
    );
    expect(all.length).toBeGreaterThan(1);
    for (const r of all) {
      const v = await getRequisition(
        { hospitalId: L.h, userId: L.s.people.chief },
        r.id,
        L.s.now,
        L.lane.db as never,
      );
      for (const l of v!.lines) expect(l.needs).toEqual(l.controlled ? ["witness_needed"] : []);
    }
  });

  it("S45, S47, S50: every place's value and holdings are the ledger's sums; an issue-only ward shows no balance", async () => {
    const { hospitalStockMap } = await import("@/lib/pharmacy/distribution/map");
    const { stockValueOf } = await import("@/lib/pharmacy/prices/store");
    const times: number[] = [];
    let map!: Awaited<ReturnType<typeof hospitalStockMap>>;
    for (let i = 0; i < 6; i++) {
      const t0 = performance.now();
      map = await hospitalStockMap(L.lane.db as never, L.h, new Date());
      times.push(performance.now() - t0);
    }
    const held = await rows<{ place: string; n: string }>(
      `SELECT coalesce(b.location_id, b.dispensing_point_id) AS place, sum(x.n) AS n
         FROM pharmacy_batches b
         JOIN LATERAL (SELECT sum(quantity) AS n FROM pharmacy_stock_movements m WHERE m.batch_id = b.id) x ON true
        WHERE b.hospital_id = $1 AND x.n > 0 GROUP BY 1`,
      [L.h],
    );
    const sql = new Map(held.map((r) => [r.place, Number(r.n)]));
    expect(map.rows.length).toBe(
      Number(
        (
          await rows<{ n: string }>(
            `SELECT count(*) AS n FROM pharmacy_locations WHERE hospital_id = $1`,
            [L.h],
          )
        )[0]!.n,
      ),
    );
    let total = 0;
    for (const r of map.rows) {
      if (r.how === "issueOnly") {
        expect([r.value, r.units]).toEqual([null, null]);
        continue;
      }
      expect(r.units).toBe(sql.get(r.id) ?? 0);
      expect(r.value).toBeCloseTo((await stockValueOf(L.lane.db as never, L.h, r.id)).valueUgx, 2);
      total += r.value!;
    }
    expect(map.figures.valueUgx).toBeCloseTo(total, 2);
    const p95 = [...times].sort((a, b) => a - b)[Math.ceil(times.length * 0.95) - 1]!;
    process.stderr.write(
      `stock map: ${map.rows.length} places; p95 ${p95.toFixed(0)} ms over ${times.length} loads\n`,
    );
    expect(p95).toBeLessThan(1500);
  });

  it("S46: a broken seal reads first and every next step comes from the fixed list", async () => {
    const { hospitalStockMap } = await import("@/lib/pharmacy/distribution/map");
    const { CATALOGUE } = await import("@/content/pharmacy-catalogue");
    const map = await hospitalStockMap(L.lane.db as never, L.h, new Date());
    for (const r of map.rows) expect(Object.keys(CATALOGUE.map.next)).toContain(r.next);
    const broken = map.rows.filter((r) => r.sealBroken);
    expect(broken.length).toBeGreaterThan(0); // reported in S42
    for (const r of broken) expect(r.next).toBe("seal");
  });

  it("S48, S49: the trace's holdings by place and by batch are one total; a recalled batch opens its recall", async () => {
    const { medicineTrace } = await import("@/lib/pharmacy/distribution/map");
    const { MANAGE } = await import("@/lib/pharmacy/stock/store");
    const recall = await import("@/lib/pharmacy/stores/recall-store");
    const [b] = await rows<{ batch_number: string }>(
      `SELECT batch_number FROM pharmacy_batches WHERE product_id = $1 LIMIT 1`,
      [req.product],
    );
    await write(L.s, chief, recall.StartRecallInput, MANAGE, recall.startRecall, {
      clientKey: crypto.randomUUID(),
      productId: req.product,
      batchNumber: b!.batch_number,
      source: "supplier",
      noticeRef: "Demo notice",
      noticeDate: new Date().toISOString().slice(0, 10),
      statedClass: "not_stated",
      level: "Demo: hospital level",
      instructions: "Demo: hold the batch",
    });
    const now = new Date();
    const t = (await medicineTrace(
      L.lane.db as never,
      L.h,
      req.product,
      { from: new Date(now.getTime() - 400 * 86_400_000), to: new Date(now.getTime() + 1) },
      now,
    ))!;
    const byPlace = t.where.reduce((a, w) => a + w.units, 0);
    const byBatch = t.batches.reduce((a, x) => a + x.units, 0);
    expect(byPlace).toBe(byBatch);
    expect(t.figures.inHospital).toBe(byBatch);
    const [sum] = await rows<{ n: string }>(
      `SELECT coalesce(sum(m.quantity), 0) AS n FROM pharmacy_stock_movements m
         JOIN pharmacy_batches b ON b.id = m.batch_id WHERE b.product_id = $1`,
      [req.product],
    );
    expect(byBatch).toBe(Number(sum!.n));
    const hit = t.batches.filter(
      (x) => x.batchNumber.toLowerCase() === b!.batch_number.toLowerCase(),
    );
    expect(hit.length).toBeGreaterThan(0);
    for (const x of hit) expect(x.recallId).toBeTruthy();
    expect(t.movements.length).toBeGreaterThan(0);
    for (let i = 1; i < t.movements.length; i++)
      expect(+t.movements[i - 1]!.at).toBeGreaterThanOrEqual(+t.movements[i]!.at);
  });
});
