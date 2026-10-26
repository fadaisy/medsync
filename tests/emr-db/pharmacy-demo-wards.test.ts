/**
 * The pharmacy demo's sections 9–11 (ADR 0450) on the PGlite lane: ward stock and carts, expiry and a recall, month
 * end. Boots the demo (setup and stock), runs the three sections, then reads each page back through its own loader
 * with the scope the page uses. Two supplies are written between the sections as the supply tests write them, so the
 * recall has patients on its exact list. Runs with EMR_PGLITE=1.
 */
import type { DemoLane } from "./_pharmacy-demo";
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { demoLane } from "./_pharmacy-demo";
import { laneOn } from "./_pglite";

vi.mock("server-only", () => ({}));
const held = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("@/db", () => ({
  get db() {
    return held.db;
  },
}));

describe.skipIf(!laneOn)("Pharmacy demo: wards, carts, expiry, recall, month end (ADR 0450)", () => {
  let d: DemoLane;
  let who: { userId: string; hospitalId: string };
  let lastMonth: string;

  beforeAll(async () => {
    d = await demoLane((db) => (held.db = db));
    const { s, pg, h } = d;
    who = { userId: s.people.chief, hospitalId: h };
    // The resus desk's uses (another section); the carts read them when present.
    try {
      const { emergencySection } = await import("@/lib/pharmacy/demo/controlled");
      await emergencySection(s);
    } catch {
      /* the cart checks do not need them */
    }
    const { wardsSection, expirySection, monthEndSection } = await import("@/lib/pharmacy/demo/wards");
    await wardsSection(s);

    // Two outpatients supplied from the issuing point's batch of a medicine charted on a ward (as recordHandover writes them).
    const [b] = (
      await pg.query<{ batch: string; point: string; product: string; medicine: string }>(
        `SELECT src.id AS batch, src.dispensing_point_id AS point, src.product_id AS product, p.medicine_id AS medicine
           FROM pharmacy_stock_movements m
           JOIN pharmacy_batches wb ON wb.id = m.batch_id
           JOIN pharmacy_batches src ON src.product_id = wb.product_id AND src.batch_number = wb.batch_number
            AND src.dispensing_point_id IS NOT NULL
           JOIN pharmacy_products p ON p.id = wb.product_id
          WHERE m.hospital_id = $1 AND m.kind = 'received_from_issue'
            AND EXISTS (SELECT 1 FROM medication_administration_records mar
                          JOIN prescriptions rx ON rx.id = mar.emr_prescription_id WHERE rx.drug_id = p.medicine_id)
          LIMIT 1`,
        [h],
      )
    ).rows;
    expect(b).toBeTruthy();
    for (const p of s.patients.filter((x) => x.kind === "outpatient").slice(0, 2))
      await pg.transaction(async (tx) => {
        const rx = (
          await tx.query<{ id: string }>(
            `INSERT INTO public.prescriptions (hospital_id, patient_user_id, prescriber_user_id, drug_id, drug_name, dose, route)
             VALUES ($1, $2, $3, $4, 'Demo medicine', '[demo dose]', 'oral') RETURNING id`,
            [h, p.id, s.people.doctors[0], b!.medicine],
          )
        ).rows[0]!.id;
        const handover = (
          await tx.query<{ id: string }>(
            `INSERT INTO public.pharmacy_handovers (hospital_id, dispensing_point_id, patient_user_id, collector,
               identity_route, second_identifier, label_mode, actor_user_id, client_key)
             VALUES ($1, $2, $3, 'patient', 'two_identifiers', 'date_of_birth', 'printed', $4, $5) RETURNING id`,
            [h, b!.point, p.id, s.people.pharmacists[2], randomUUID()],
          )
        ).rows[0]!.id;
        const at = new Date(s.now.getTime() - 2 * 86_400_000).toISOString();
        const supply = (
          await tx.query<{ id: string }>(
            `INSERT INTO public.pharmacy_supplies (handover_id, hospital_id, dispensing_point_id, supplying_hospital_id,
               patient_user_id, prescription_id, product_id, batch_id, quantity, issue_unit, supplied_at)
             VALUES ($1, $2, $3, $2, $4, $5, $6, $7, 2, 'tablet', $8) RETURNING id`,
            [handover, h, b!.point, p.id, rx, b!.product, b!.batch, at],
          )
        ).rows[0]!.id;
        await tx.query(
          `INSERT INTO public.pharmacy_stock_movements (hospital_id, dispensing_point_id, location_id, batch_id, kind, quantity,
             effective_at, actor_user_id, source_kind, source_id, downtime)
           VALUES ($1, $2, $2, $3, 'supplied', -2, $4, $5, 'supply', $6, false)`,
          [h, b!.point, b!.batch, at, s.people.pharmacists[2], supply],
        );
      });

    await expirySection(s);
    await monthEndSection(s);
    const { addDays, localMonth } = await import("@/lib/pharmacy/stores/ledger");
    lastMonth = `${addDays(localMonth(s.now), -1).slice(0, 7)}-01`;
    expect(s.notes).toEqual({});
  }, 600_000);

  it("Store › Wards: six live wards, each state on its page", async () => {
    const { listPlaces, getWardStockPage } = await import("@/lib/pharmacy/stores/ward-read");
    const wards = await listPlaces(d.lane.db, d.h, "ward");
    expect(wards.length).toBe(6);
    const pages = await Promise.all(wards.map((w) => getWardStockPage(d.lane.db, d.h, w.id, d.s.now)));
    const byName = (n: string) => pages.find((p) => p!.location.name.toLowerCase().includes(n))!;
    for (const p of pages) expect(p!.rows.length).toBeGreaterThan(0);
    const all = pages.flatMap((p) => p!.rows);
    expect(all.some((r) => r.topUp.kind === "top_up")).toBe(true);
    expect(all.some((r) => r.dosesCharted > 0)).toBe(true);
    expect(all.some((r) => r.ask)).toBe(true);
    expect(byName("maternity").rows.every((r) => r.topUp.kind === "count_first")).toBe(true);
    const icu = pages.find((p) => p!.packs.draft && !p!.packs.signed);
    expect(icu).toBeTruthy();
    expect(pages.filter((p) => p!.packs.signed).length).toBe(5);
    expect(pages.some((p) => p!.receipts.length > 0)).toBe(true);
    expect(pages.some((p) => p!.notices.length > 0)).toBe(true);
    expect(pages.every((p) => p!.freshnessDays !== null)).toBe(true);
  });

  it("Store › Carts: three carts, one overdue, a check with gaps, an unsigned revision", async () => {
    const { getCartsPage, getCartPage } = await import("@/lib/pharmacy/stores/ward-read");
    const page = await getCartsPage(d.lane.db, d.h, d.s.now);
    expect(page.rows.length).toBe(3);
    expect(page.rows.every((r) => r.list && r.lastCheck)).toBe(true);
    expect(page.rows.filter((r) => r.overdue).length).toBe(1);
    const carts = await Promise.all(page.rows.map((r) => getCartPage(d.lane.db, d.h, r.id, d.s.now)));
    for (const c of carts) expect(c!.products.length).toBeGreaterThan(0);
    expect(carts.some((c) => c!.draft)).toBe(true);
    const [gaps] = await d.pg.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM pharmacy_stock_movements m JOIN pharmacy_locations l ON l.id = m.location_id
        WHERE l.kind = 'cart' AND m.source_kind = 'count' AND m.hospital_id = $1`,
      [d.h],
    ).then((r) => r.rows);
    expect(gaps!.n).toBeGreaterThanOrEqual(2);
  });

  it("Store › Expiry: expiring, expired, quarantine and a write-off", async () => {
    const { getExpiryPage } = await import("@/lib/pharmacy/stores/recall-read");
    const page = await getExpiryPage(who, d.s.now, d.lane.db);
    expect(page.expiring.flatMap((e) => e.rows).length).toBeGreaterThan(0);
    expect(page.expired.length).toBeGreaterThan(0);
    expect(page.quarantine.length).toBeGreaterThan(0);
    expect(page.writeOffs.length).toBeGreaterThan(0);
  });

  it("Store › Recalls: one open recall traced to supplies, a ward and its patients", async () => {
    const { listRecalls, getRecallTrace } = await import("@/lib/pharmacy/stores/recall-read");
    const recalls = await listRecalls(who, d.lane.db);
    expect(recalls.length).toBe(1);
    const trace = await getRecallTrace(who, recalls[0]!.id, d.lane.db, d.lane.db);
    expect(trace!.exact.length).toBe(2);
    expect(trace!.issued.length).toBeGreaterThan(0);
    expect(trace!.mayHave.length).toBeGreaterThan(0);
    expect(trace!.wardsNotified.size).toBeGreaterThan(0);
  });

  it("Store › Month end: last month closed at quarantine, the hospital view, HMIS 105 and the tracer audit", async () => {
    const m = await import("@/lib/pharmacy/stores/month-end-read");
    const [q] = (await d.pg.query<{ id: string }>(`SELECT id FROM pharmacy_locations WHERE hospital_id = $1 AND kind = 'quarantine'`, [d.h])).rows;
    const closed = await m.getMonthReport(who, { kind: "location", locationId: q!.id }, lastMonth, d.lane.db);
    expect(closed.closed).toBeTruthy();
    expect(closed.rows.length).toBeGreaterThan(0);
    const hospital = await m.getMonthReport(who, { kind: "hospital" }, lastMonth, d.lane.db);
    expect(hospital.rows.length).toBeGreaterThan(0);
    const status = await m.getStockStatus(who, lastMonth, d.lane.db);
    expect(status.missing).toEqual([]);
    expect(status.rows.length).toBeGreaterThan(0);
    const month = Number(lastMonth.slice(5, 7));
    const audit = await m.getTracerAudit(who, `${lastMonth.slice(0, 5)}${String(month - ((month - 1) % 3)).padStart(2, "0")}-01`, d.lane.db);
    expect(audit.missing).toBe(false);
    expect(audit.rows.length).toBeGreaterThan(0);
    const ready = await m.monthEndReadiness(d.lane.db, d.h, d.s.now);
    expect(ready).toBeTruthy();
    const [n] = (await d.pg.query<{ n: number }>(`SELECT count(*)::int AS n FROM pharmacy_periods WHERE hospital_id = $1`, [d.h])).rows;
    expect(n!.n).toBeGreaterThanOrEqual(1);
  });
});
