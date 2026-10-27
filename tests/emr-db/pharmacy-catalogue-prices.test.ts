/**
 * Prices and billable lines (catalogue slice Step 8; migration 0257) on the demo lane: cash prices for some
 * products and a free emergency point before the dispensing day, then the supplies' snapshots (S28, S29), the
 * bill keeping its snapshot and changing version (S30), stock value against a hand sum (S31), no price read
 * across hospitals (S32), and pay-before-collecting never holding an admitted patient or an emergency (S33).
 * The migration's copy of `price_ugx` is checked on the demo hospital. Runs with EMR_PGLITE=1.
 */
import { randomUUID } from "node:crypto";
import type { DemoLane } from "./_pharmacy-demo";
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

describe.skipIf(!laneOn)("prices and billable lines (Step 8, 0257)", () => {
  let L: DemoLane;
  let chief: PharmacyActor;
  let cash = "";
  const priced = new Map<string, number>();
  const rows = async <T>(q: string, p: unknown[] = []) => (await L.pg.query<T>(q, p)).rows;
  const today = () => new Date(L.s.now.getTime() + 3 * 3_600_000).toISOString().slice(0, 10);

  beforeAll(async () => {
    process.env.PHARMACY_CATALOGUE = "1";
    L = await demoLane((db) => (held.db = db));
    const { chiefActor, write } = await import("@/lib/pharmacy/demo/state");
    const prices = await import("@/lib/pharmacy/prices/store");
    const { MANAGE } = await import("@/lib/pharmacy/stock/store");
    chief = chiefActor(L.s, null);
    const run = <I>(
      schema: Parameters<typeof write>[2],
      fn: (c: never, i: I) => Promise<{ id: string }>,
      raw: Record<string, unknown>,
    ) => write(L.s, chief, schema, MANAGE, fn as never, raw);
    // The demo's products have no price; every second one gets a cash price from today.
    const products = await rows<{ id: string }>(
      `SELECT id FROM pharmacy_products WHERE hospital_id = $1 ORDER BY name`,
      [L.h],
    );
    await run(prices.PayerInput, prices.addPayer, { code: "staff", name: "Staff", kind: "staff" });
    cash = (
      await rows<{ id: string }>(
        `SELECT id FROM pharmacy_payers WHERE hospital_id = $1 AND code = 'cash'`,
        [L.h],
      )
    )[0]!.id;
    for (const [i, p] of products.entries())
      if (i % 2 === 0) {
        const n = 100 * (i + 1);
        priced.set(p.id, n);
        await run(prices.SetPriceInput, prices.setPrice, {
          kind: "typed",
          productId: p.id,
          payerId: cash,
          fromDate: today(),
          priceUgx: n,
        });
      }
    await run(prices.ChargeModeInput, prices.setChargeMode, {
      pointId: L.s.points.emergency.id,
      mode: "free",
      fromDate: today(),
    });
    for (const k of ["inpatient", "emergency"] as const)
      await run(prices.PayFirstInput, prices.setPayFirst, {
        pointId: L.s.points[k].id,
        required: true,
        fromDate: today(),
      });
    const { dispensingSection } = await import("@/lib/pharmacy/demo/dispensing");
    await dispensingSection(L.s);
  }, 900_000);

  it("S28, S29: each supply's snapshot is the price in force, free at a free point, else price not set (never 0)", async () => {
    const supplies = await rows<{
      product_id: string;
      price_ugx: string | null;
      price_kind: string;
      payer_id: string;
      point: string;
      day: string;
    }>(
      `SELECT product_id, price_ugx, price_kind, payer_id, dispensing_point_id AS point,
              (supplied_at AT TIME ZONE 'Africa/Kampala')::date::text AS day FROM pharmacy_supplies WHERE hospital_id = $1`,
      [L.h],
    );
    expect(supplies.length).toBeGreaterThan(20);
    const kinds = new Set<string>();
    for (const s of supplies) {
      kinds.add(s.price_kind);
      expect(s.payer_id).toBe(cash);
      if (s.day < today()) {
        // Before today no price or mode was in force.
        expect(s.price_kind).toBe("price_not_set");
      } else if (s.point === L.s.points.emergency.id) {
        expect(s.price_kind).toBe("free");
        expect(s.price_ugx).toBeNull();
      } else if (priced.has(s.product_id) && s.day >= today()) {
        expect(s.price_kind).toBe("priced");
        expect(Number(s.price_ugx)).toBe(priced.get(s.product_id));
      } else {
        expect(s.price_kind).toBe("price_not_set");
        expect(s.price_ugx).toBeNull();
      }
    }
    expect(kinds).toEqual(new Set(["priced", "free", "price_not_set"]));
    expect(supplies.some((s) => s.price_ugx !== null && Number(s.price_ugx) === 0)).toBe(false);
  });

  it("S30: a bill keeps its snapshot after the price changes; a change to a line makes a new version", async () => {
    const { billableLines } = await import("@/lib/pharmacy/prices/store");
    const { asClinicalReader } = await import("@/lib/emr/db");
    const [s] = await rows<{
      id: string;
      prescription_id: string;
      product_id: string;
      dispensing_point_id: string;
    }>(
      `SELECT id, prescription_id, product_id, dispensing_point_id FROM pharmacy_supplies
        WHERE hospital_id = $1 AND price_kind = 'priced' ORDER BY supplied_at LIMIT 1`,
      [L.h],
    );
    const read = () =>
      asClinicalReader(
        chief,
        (tx) => billableLines(tx, L.h, [s!.prescription_id]),
        L.lane.db as never,
      );
    const before = await read();
    const line = before.lines.find((l) => l.supplyId === s!.id)!;
    expect(line).toMatchObject({
      kind: "priced",
      unitPrice: priced.get(s!.product_id),
      payerId: cash,
    });
    expect(line.lineTotal).toBe(line.unitPrice! * line.quantity);
    expect(before.totalUgx).toBe(before.lines.reduce((a, l) => a + (l.lineTotal ?? 0), 0));
    await L.pg.query(
      `INSERT INTO pharmacy_product_prices (hospital_id, product_id, payer_id, price_ugx, from_date, source, set_by)
       VALUES ($1, $2, $3, 999999, $4, 'typed', $5)`,
      [L.h, s!.product_id, cash, today(), chief.userId],
    );
    expect(await read()).toEqual(before);
    // A reversal takes the line off the bill, and the version changes.
    const [m] = await rows<{ id: string }>(
      `SELECT id FROM pharmacy_stock_movements WHERE source_id = $1 LIMIT 1`,
      [s!.id],
    );
    await L.pg.query(
      `INSERT INTO pharmacy_supply_reversals (supply_id, hospital_id, dispensing_point_id, reason_code, pack_fit, returned_movement_id, actor_user_id)
       VALUES ($1, $2, $3, 'test', true, $4, $5)`,
      [s!.id, L.h, s!.dispensing_point_id, m!.id, chief.userId],
    );
    const after = await read();
    expect(after.lines.some((l) => l.supplyId === s!.id)).toBe(false);
    expect(after.version).not.toBe(before.version);
  });

  it("S31: stock value is the hand sum of balance × the batch's mean received cost; costless batches are named", async () => {
    const { stockValueOf } = await import("@/lib/pharmacy/prices/store");
    const { asClinicalReader } = await import("@/lib/emr/db");
    const v = await asClinicalReader(chief, (tx) => stockValueOf(tx, L.h), L.lane.db as never);
    const hand = await rows<{ batch_id: string; bal: string; cost: string | null }>(
      `WITH bal AS (SELECT batch_id, sum(quantity) AS bal FROM pharmacy_stock_movements WHERE hospital_id = $1 GROUP BY batch_id),
            k AS (SELECT id, product_id || '|' || batch_number AS key FROM pharmacy_batches WHERE hospital_id = $1),
            c AS (SELECT k.key, sum(m.quantity * coalesce(x.new_cost, m.unit_cost)) / sum(m.quantity) AS cost
                    FROM pharmacy_stock_movements m JOIN k ON k.id = m.batch_id
                    LEFT JOIN LATERAL (SELECT new_cost FROM pharmacy_cost_corrections y WHERE y.movement_id = m.id
                                        ORDER BY corrected_at DESC LIMIT 1) x ON true
                   WHERE m.kind = 'received' AND m.quantity > 0 AND coalesce(x.new_cost, m.unit_cost) IS NOT NULL
                   GROUP BY k.key)
       SELECT bal.batch_id, bal.bal, c.cost FROM bal JOIN k ON k.id = bal.batch_id LEFT JOIN c ON c.key = k.key WHERE bal.bal > 0`,
      [L.h],
    );
    const sum = hand
      .filter((h) => h.cost !== null)
      .reduce((a, h) => a + Number(h.bal) * Number(h.cost), 0);
    expect(v.valueUgx).toBeCloseTo(sum, 0);
    expect(new Set(v.unvalued)).toEqual(
      new Set(hand.filter((h) => h.cost === null).map((h) => h.batch_id)),
    );
  });

  it("S32: no price, payer or rule is readable from another hospital", async () => {
    const { pricesPage } = await import("@/lib/pharmacy/prices/store");
    const { asClinicalReader } = await import("@/lib/emr/db");
    const { pharmacyProductPrices, pharmacyPayers } = await import("@/db/schema/pharmacy-prices");
    const outsider = { ...chief, hospitalId: L.real };
    const [p, y] = await asClinicalReader(
      outsider,
      async (tx) => [
        await tx.select().from(pharmacyProductPrices),
        await tx.select().from(pharmacyPayers),
      ],
      L.lane.db as never,
    );
    expect(p).toEqual([]);
    expect(y).toEqual([]);
    const page = await asClinicalReader(
      outsider,
      (tx) => pricesPage(tx, L.h, [], today()),
      L.lane.db as never,
    );
    expect(page.payers).toEqual([]);
    expect(page.history).toEqual([]);
  });

  it("S33: pay-before-collecting on, an admitted patient and an emergency pass with no payment; a window line does not", async () => {
    const { paymentPasses } = await import("@/lib/pharmacy/supply/handover");
    expect(paymentPasses("not_recorded", true, true)).toBe(true);
    expect(paymentPasses("emergency", true)).toBe(true);
    expect(paymentPasses("not_recorded", true)).toBe(false);
    // Today's demo hand-overs at both points ran with pay-first on.
    const done = await rows<{ point: string; n: string }>(
      `SELECT dispensing_point_id AS point, count(*) AS n FROM pharmacy_handovers
        WHERE hospital_id = $1 AND (supplied_at AT TIME ZONE 'Africa/Kampala')::date >= $2::date GROUP BY 1`,
      [L.h, today()],
    );
    for (const k of ["inpatient", "emergency"] as const)
      expect(Number(done.find((d) => d.point === L.s.points[k].id)?.n ?? 0), k).toBeGreaterThan(0);
    // A ready ward line handed over with no payment recorded, at a pay-first point.
    const { getReviewQueue } = await import("@/lib/pharmacy/review/read");
    const supply = await import("@/lib/pharmacy/supply/store");
    const { pharmacyActor, write } = await import("@/lib/pharmacy/demo/state");
    const point = L.s.points.inpatient.id;
    const queue = await getReviewQueue(L.h, point, L.lane.db as never, L.s.now);
    const ready = queue.rows.filter((r) => r.stage === "ready");
    const staged = async (lineId: string) =>
      (
        await rows<{
          decision: { productId: string; batches: { batchId: string; quantity: number }[] };
        }>(
          `SELECT decision FROM pharmacy_line_events WHERE kind = 'decision_saved' AND prescription_id = $1 ORDER BY occurred_at DESC LIMIT 1`,
          [lineId],
        )
      )[0]?.decision;
    const tech = pharmacyActor(
      L.s,
      L.s.people.techs[Object.keys(L.s.points).indexOf("inpatient")]!,
      "PHARMACY_TECH",
      "inpatient",
    );
    const hand = async (lineId: string, ward: boolean) => {
      const d = (await staged(lineId))!;
      return write(L.s, tech, supply.HandoverInput, supply.DISPENSE_LIVE, supply.recordHandover, {
        clientKey: randomUUID(),
        lines: [{ lineId, productId: d.productId, rows: d.batches, strengthConfirmed: true }],
        collector: ward
          ? { kind: "ward_staff", userId: L.s.people.nurses[0] }
          : { kind: "patient" },
        identity: ward
          ? { route: "ward_staff" }
          : { route: "identified_another_way", nameAttested: true, how: "card_shown" },
        counselling: ward ? [] : ["purpose", "how_when"],
        payment: { status: "not_recorded" },
      });
    };
    const wardRow = ready.find((r) => r.origin === "ward");
    expect(wardRow, "a ready ward line in the demo").toBeDefined();
    await expect(hand(wardRow!.firstLineId, true)).resolves.toMatchObject({
      id: expect.any(String),
    });
    const windowRow = ready.find((r) => r.origin === "window");
    expect(windowRow, "a ready window line at the same point").toBeDefined();
    await expect(hand(windowRow!.firstLineId, false)).rejects.toThrow(/pay/i);
  });

  it("0257 copies a product's price as cash from its update date, and never a zero", async () => {
    const sql = (await import("node:fs")).readFileSync(
      "supabase/migrations/0257_pharmacy_prices.sql",
      "utf8",
    );
    const [p] = await rows<{ id: string }>(
      `SELECT id FROM pharmacy_products WHERE hospital_id = $1 AND id NOT IN (SELECT product_id FROM pharmacy_product_prices) LIMIT 2`,
      [L.h],
    );
    await L.pg.query(`UPDATE pharmacy_products SET price_ugx = 1250.40 WHERE id = $1`, [p!.id]);
    await L.pg.exec(sql);
    await L.pg.exec(sql); // re-runnable: no second copy
    const got = await rows<{ price_ugx: number; source: string; code: string }>(
      `SELECT x.price_ugx, x.source, y.code FROM pharmacy_product_prices x JOIN pharmacy_payers y ON y.id = x.payer_id WHERE x.product_id = $1`,
      [p!.id],
    );
    expect(got).toEqual([{ price_ugx: 1250, source: "typed", code: "cash" }]);
  });
});
