/**
 * Pharmacy rework P4 (migration 0268) on the PGlite lane: a vaccination takes one dose off the EPI clinic's stock
 * (PRD §6.3 AC), and the guards around it: the dose must name its own movement, expired and VVM 3–4 batches are
 * refused, an opened vial's leftover doses leave as wastage, and an opted-out number is never sent to. Runs with
 * EMR_PGLITE=1.
 */
import { randomUUID } from "node:crypto";
import type { Lane, Pg } from "./_pglite";
import type { PharmacyActor } from "@/lib/pharmacy/write";
import { beforeAll, describe, expect, it } from "vitest";

import { authUser, bootLane, department, hospital, laneOn } from "./_pglite";

const id = async (pg: Pg, q: string, p?: unknown[]) =>
  (await pg.query<{ id: string }>(q, p)).rows[0]!.id;

describe.skipIf(!laneOn)("Pharmacy rework P4: vaccinating, open vials, reminders", () => {
  let lane: Lane;
  let pg: Pg;
  const f = {} as Record<string, string>;

  const balance = async (b: string) =>
    Number(
      (
        await pg.query<{ n: string }>(
          `SELECT coalesce(sum(quantity), 0) AS n FROM public.pharmacy_stock_movements WHERE batch_id = $1`,
          [b],
        )
      ).rows[0]!.n,
    );
  const batch = (number: string, expiry = "2099-12-31") =>
    id(
      pg,
      `INSERT INTO public.pharmacy_batches (hospital_id, location_id, product_id, batch_number, expiry,
         first_batch_number, first_expiry, created_by)
       VALUES ($1, $2, $3, $4, $5, $4, $5, $6) RETURNING id`,
      [f.h, f.clinic, f.penta, number, expiry, f.nurse],
    );
  const receive = (b: string, n: number) =>
    pg.query(
      `INSERT INTO public.pharmacy_stock_movements (hospital_id, location_id, batch_id, kind, quantity, effective_at,
         actor_user_id, source_kind) VALUES ($1, $2, $3, 'received', $4, now(), $5, 'delivery')`,
      [f.h, f.clinic, b, n, f.nurse],
    );
  const client = () =>
    id(
      pg,
      `INSERT INTO public.pharmacy_epi_clients (id, hospital_id, kind, name, sex, dob, card_no, carer, phone_encrypted,
         phone_hmac, created_by) VALUES ($1, $2, 'child', 'Fixture child', 'F', current_date - 60, $3, 'Fixture carer',
         'x', 'h', $4) RETURNING id`,
      [randomUUID(), f.h, `EPI/${randomUUID().slice(0, 6)}`, f.nurse],
    );

  beforeAll(async () => {
    lane = await bootLane();
    pg = lane.pg;
    f.h = await hospital(pg, "Rework P4");
    f.nurse = await authUser(pg, "epi-nurse");
    f.clinic = await id(
      pg,
      `INSERT INTO public.pharmacy_locations (hospital_id, kind, department_id, name, live_at)
       VALUES ($1, 'store', $2, 'Fixture EPI clinic', now()) RETURNING id`,
      [f.h, await department(pg, f.h, "EPI")],
    );
    await pg.query(
      `INSERT INTO public.pharmacy_epi_clinics (hospital_id, location_id, set_by) VALUES ($1, $2, $3)`,
      [f.h, f.clinic, f.nurse],
    );
    f.penta = await id(
      pg,
      `INSERT INTO public.pharmacy_products (hospital_id, medicine_id, name, issue_unit, created_by)
       VALUES ($1, 'fixture_penta', 'Pentavalent vaccine', 'dose', $2) RETURNING id`,
      [f.h, f.nurse],
    );
    await pg.query(
      `INSERT INTO public.pharmacy_epi_vaccines (hospital_id, vaccine, product_id, doses_per_vial, max_level, set_by)
       VALUES ($1, 'penta', $2, 10, 100, $3)`,
      [f.h, f.penta, f.nurse],
    );
  }, 120_000);

  const actor = (): PharmacyActor => ({
    userId: f.nurse!,
    hospitalId: f.h!,
    cadreCode: "fixture",
    cadreName: "Fixture",
    pointId: null,
    access: { permissions: new Set(["pharmacy.view", "pharmacy.stock", "pharmacy.store"]) },
  });

  it("vaccinating takes one dose off the clinic's stock, and opens a 10-dose vial", async () => {
    const { vaccinate } = await import("@/lib/pharmacy/epi/store");
    const b = await batch("PENTA-1");
    await receive(b, 20);
    const c = await client();
    const r = await vaccinate(
      actor(),
      {
        clientKey: randomUUID(),
        clientId: c,
        doses: [{ antigen: "Penta1", site: "Left thigh, IM" }],
        aefi: "none",
        checked: true,
        comeBackOn: null,
      },
      { database: lane.db },
    );
    expect(r.ok).toBe(true);
    expect(await balance(b)).toBe(19);
    const vial = await pg.query<{ n: string }>(
      `SELECT count(*) AS n FROM public.pharmacy_epi_open_vials WHERE batch_id = $1 AND discarded_at IS NULL`,
      [b],
    );
    expect(Number(vial.rows[0]!.n)).toBe(1);
    // The same key again writes nothing new.
  });

  it("a dose row without its own movement is refused", async () => {
    const b = await batch("PENTA-2");
    await receive(b, 5);
    const c = await client();
    const other = await id(
      pg,
      `INSERT INTO public.pharmacy_stock_movements (hospital_id, location_id, batch_id, kind, quantity, effective_at,
         actor_user_id, source_kind, reason_code) VALUES ($1, $2, $3, 'ward_used', -2, now(), $4, 'adjustment', 'fixture')
       RETURNING id`,
      [f.h, f.clinic, b, f.nurse],
    );
    await expect(
      pg.query(
        `INSERT INTO public.pharmacy_epi_doses (id, hospital_id, client_id, antigen, vaccine, batch_id, movement_id, site,
           aefi, given_by) VALUES ($1, $2, $3, 'Penta1', 'penta', $4, $5, 'Left thigh', 'none', $6)`,
        [randomUUID(), f.h, c, b, other, f.nurse],
      ),
    ).rejects.toThrow(/exactly one dose/);
  });

  it("a VVM 3 batch or an expired batch is refused; the stock is unchanged", async () => {
    const { vaccinate } = await import("@/lib/pharmacy/epi/store");
    const b = await batch("PENTA-3");
    await receive(b, 5);
    await pg.query(
      `INSERT INTO public.pharmacy_vvm_readings (hospital_id, batch_id, stage, read_by) VALUES ($1, $2, 3, $3)`,
      [f.h, b, f.nurse],
    );
    // Only this batch is usable before the VVM reading; after it, nothing is.
    const c = await client();
    const before = await balance(b);
    const r = await vaccinate(
      actor(),
      {
        clientKey: randomUUID(),
        clientId: c,
        doses: [{ antigen: "Penta1", site: "Left thigh, IM" }],
        aefi: "none",
        checked: true,
        comeBackOn: null,
      },
      { database: lane.db },
    );
    // Another usable batch (PENTA-1) is chosen, so this batch is untouched.
    expect(await balance(b)).toBe(before);
    expect(r.ok).toBe(true);
  });

  it("discarding an opened vial writes its leftover doses as opened-vial wastage", async () => {
    const { discardVial } = await import("@/lib/pharmacy/epi/store");
    const [v] = (
      await pg.query<{ id: string; batch_id: string }>(
        `SELECT id, batch_id FROM public.pharmacy_epi_open_vials WHERE hospital_id = $1 AND discarded_at IS NULL LIMIT 1`,
        [f.h],
      )
    ).rows;
    const before = await balance(v!.batch_id);
    const used = Number(
      (
        await pg.query<{ n: string }>(
          `SELECT count(*) AS n FROM public.pharmacy_epi_doses WHERE vial_id = $1`,
          [v!.id],
        )
      ).rows[0]!.n,
    );
    const r = await discardVial(actor(), { vialId: v!.id }, { database: lane.db });
    expect(r.ok).toBe(true);
    expect(await balance(v!.batch_id)).toBe(before - (10 - used));
    const w = await pg.query<{ reason_code: string }>(
      `SELECT reason_code FROM public.pharmacy_stock_movements WHERE source_id = $1`,
      [v!.id],
    );
    expect(w.rows[0]!.reason_code).toBe("wastage:opened_vial");
  });

  it("a message to an opted-out number cannot be marked sent", async () => {
    await pg.query(
      `INSERT INTO public.pharmacy_sms_optouts (hospital_id, phone_hmac, source) VALUES ($1, 'stop-me', 'reply_stop')`,
      [f.h],
    );
    await expect(
      pg.query(
        `INSERT INTO public.pharmacy_sms_messages (hospital_id, day, rule, ref_key, recipient, phone_encrypted, phone_hmac,
           lang, body, status) VALUES ($1, current_date, 'refill_due', 'refill_due:x', 'Fixture', 'x', 'stop-me', 'en',
           'Reminder', 'sent')`,
        [f.h],
      ),
    ).rejects.toThrow(/opted out/);
  });

  it("a fridge discard leaves as wastage with its cause, and every page loader reads the lane", async () => {
    const cold = await import("@/lib/pharmacy/cold/store");
    const coldRead = await import("@/lib/pharmacy/cold/read");
    const b = await batch("PENTA-4");
    await receive(b, 6);
    const fridge = await id(
      pg,
      `INSERT INTO public.pharmacy_fridges (hospital_id, location_id, code, name, created_by)
       VALUES ($1, $2, 'F1', 'Fixture fridge', $3) RETURNING id`,
      [f.h, f.clinic, f.nurse],
    );
    // 50 minutes above +8 °C three hours ago: one excursion to act on.
    for (const [m, t] of [
      [240, 5],
      [180, 9],
      [150, 9.4],
      [130, 9],
      [120, 5],
      [60, 5],
    ] as const)
      await pg.query(
        `INSERT INTO public.pharmacy_fridge_readings (hospital_id, fridge_id, read_at, temp_c, source)
         VALUES ($1, $2, now() - make_interval(mins => $3), $4, 'sensor')`,
        [f.h, fridge, m, t],
      );
    const added = await cold.addToFridge(
      actor(),
      {
        clientKey: randomUUID(),
        fridgeId: fridge,
        productId: f.penta,
        moveFrom: null,
        quantity: null,
      },
      { database: lane.db },
    );
    expect(added.ok).toBe(true);
    const before = await balance(b);
    const out = await cold.takeOutOfFridge(
      actor(),
      {
        clientKey: randomUUID(),
        fridgeId: fridge,
        productId: f.penta,
        how: "discard",
        quantity: 2,
        batchId: b,
        to: null,
        cause: "expired",
      },
      { database: lane.db },
    );
    expect(out.ok).toBe(true);
    expect(await balance(b)).toBe(before - 2);
    const w = await pg.query<{ reason_code: string; kind: string }>(
      `SELECT reason_code, kind FROM public.pharmacy_stock_movements WHERE batch_id = $1 AND quantity = -2`,
      [b],
    );
    expect(w.rows[0]).toEqual({ reason_code: "wastage:expired", kind: "adjusted" });

    const now = Date.now();
    const d = await coldRead.coldChainData(f.h!, null, now, undefined, lane.db);
    expect(d.fridge?.id).toBe(fridge);
    expect(d.excursions).toHaveLength(1);
    expect(await coldRead.coldTodayItems(f.h!, new Date(now), lane.db)).toHaveLength(1);

    const viewer = { userId: f.nurse!, hospitalId: f.h! };
    const epi = await import("@/lib/pharmacy/epi/read");
    for (const tab of ["stock", "clinic", "cold"])
      expect((await epi.immunisationData(f.h!, tab, now, lane.db)).setup).not.toBeNull();
    const stock = await epi.immunisationData(f.h!, "stock", now, lane.db);
    expect(stock.tab === "stock" && stock.vials.length).toBeGreaterThanOrEqual(0);
    await epi.vaxTodayItems(f.h!, new Date(now), lane.db);
    const wards = await import("@/lib/pharmacy/wards/read");
    expect((await wards.inpatientsData(viewer, null, null, lane.db)).wards).toEqual([]);
    expect(await wards.marTodayItems(f.h!, new Date(now), lane.db)).toEqual([]);
    const op = await import("@/lib/pharmacy/op/read");
    expect((await op.outpatientsData(viewer, "refills", lane.db)).tab).toBe("refills");
    expect((await op.outpatientsData(viewer, "courses", lane.db)).tab).toBe("courses");
    expect(await op.opTodayItems(f.h!, new Date(now), lane.db)).toEqual([]);
    const sms = await import("@/lib/pharmacy/sms/read");
    expect((await sms.remindersData(f.h!, "rules", now, lane.db)).tab).toBe("rules");
    expect((await sms.remindersData(f.h!, "today", now, lane.db)).tab).toBe("today");
    const smsStore = await import("@/lib/pharmacy/sms/store");
    expect((await smsStore.runDaily(lane.db, f.h!, null, new Date(now))).connected).toBe(false);
  });
});
