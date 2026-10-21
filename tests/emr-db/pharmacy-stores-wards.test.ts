/**
 * Pharmacy Phase 2, Steps 5 and 6 (5.4, 5.5, 6.8) on the PGlite lane: ward stock and emergency carts driven
 * through lib/pharmacy/stores/ward-store.ts and cart-store.ts by the house write path (pharmacy side) and
 * `withLocationRight` (the ward's side), and the reads in ward-read.ts.
 *
 * S18 stale count · S19 ward_used and consumption · S20 more than issued · S20a 10 issued, 8 confirmed, no
 * further use · S21 a nurse in charge sees only their ward · S22 doses shown, never subtracted · S23 a
 * controlled ward line needs the nurse's second factor · S24 cart counted 7 of 10 → cart_used 3, uses as
 * context · S25 restock first-expiring, short-dated swapped · S26 an overdue cart is listed.
 *
 * Every person, product, batch and quantity is a fixture. Runs with EMR_PGLITE=1.
 */
import { randomUUID } from "node:crypto";
import type { Lane, Pg } from "./_pglite";
import type { Who } from "@/lib/pharmacy/stores/ward-store";
import type { PharmacyActor } from "@/lib/pharmacy/write";
import type { z } from "zod";
import { beforeAll, describe, expect, it } from "vitest";

import { pharmacyIssues } from "@/db/schema/pharmacy-stores";
import { asClinicalWriter } from "@/lib/emr/db";
import { PHARMACY_MAP_V2, pharmacyDispensingAccess, withStoreAccess } from "@/lib/pharmacy/access";
import * as cartStore from "@/lib/pharmacy/stores/cart-store";
import { consumption } from "@/lib/pharmacy/stores/consumption";
import { controlledRefusals } from "@/lib/pharmacy/stores/issue";
import * as loc from "@/lib/pharmacy/stores/location-store";
import {
  getCartPage,
  getCartsPage,
  getWardStockPage,
  wardsOf,
} from "@/lib/pharmacy/stores/ward-read";
import * as ws from "@/lib/pharmacy/stores/ward-store";
import {
  batchAtLocation,
  batchRef,
  loadLocation,
  movePair,
  storeNeed,
  withLocationRight,
} from "@/lib/pharmacy/stores/write";
import { runPharmacyWrite } from "@/lib/pharmacy/write";
import { bootLane, department, encounter, hospital, laneOn, patient, staff } from "./_pglite";

const id = async (pg: Pg, q: string, p?: unknown[]) =>
  (await pg.query<{ id: string }>(q, p)).rows[0]!.id;
const DAY = 86_400_000;
const isoDay = (offsetDays: number) =>
  new Date(Date.now() + offsetDays * DAY).toISOString().slice(0, 10);

describe.skipIf(!laneOn)("Ward stock and emergency carts (Steps 5 and 6)", () => {
  let lane: Lane;
  let pg: Pg;
  const f = {} as Record<string, string>;

  const actor = (userId: string): PharmacyActor => ({
    userId,
    hospitalId: f.h!,
    cadreCode: "PHARMACIST",
    cadreName: "Pharmacist",
    pointId: null,
    access: withStoreAccess(
      pharmacyDispensingAccess("PHARMACIST", PHARMACY_MAP_V2),
      "PHARMACIST",
      true,
    ),
  });

  /** A pharmacy write through the house path, as the action runs it. */
  function pharm<I, R extends { id: string }>(
    schema: z.ZodType<I>,
    fn: (who: Who, input: I) => Promise<R>,
    raw: unknown,
    perm: "pharmacy.manage" | "pharmacy.stock" | "pharmacy.store",
    who = f.head!,
  ) {
    return runPharmacyWrite(
      schema,
      raw,
      actor(who),
      storeNeed(perm),
      (ctx, i) => fn(ws.whoOf(ctx), i),
      {
        database: lane.db,
      },
    );
  }
  /** A ward-side write through the hub right, as the nurse action runs it. */
  async function ward<I extends { locationId: string }, R>(
    schema: z.ZodType<I>,
    fn: (who: Who, input: I) => Promise<R>,
    raw: unknown,
    userId: string,
    right: "ward_act" | "ward_confirm" = "ward_act",
  ): Promise<{ ok: true; data: R } | { ok: false; error: string }> {
    const input = schema.parse(raw);
    try {
      const data = await withLocationRight(
        { userId, hospitalId: f.h! },
        input.locationId,
        right,
        (tx, _l, now) => fn({ tx, hospitalId: f.h!, userId, now }, input),
        { database: lane.db },
      );
      return { ok: true, data };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }
  const one = async <T>(q: string, p?: unknown[]) => (await pg.query<T>(q, p)).rows[0] as T;
  const balanceAt = async (loc: string) =>
    (
      await one<{ n: number }>(
        `SELECT coalesce(sum(quantity),0)::int AS n FROM public.pharmacy_stock_movements WHERE location_id = $1`,
        [loc],
      )
    ).n;
  const moves = (loc: string, kind: string) =>
    pg.query<{ quantity: number; allocated: boolean; source_id: string; batch_id: string }>(
      `SELECT quantity, allocated, source_id, batch_id FROM public.pharmacy_stock_movements WHERE location_id = $1 AND kind = $2 ORDER BY recorded_at`,
      [loc, kind],
    );
  /** A passed signer attestation (the password and code are checked in lib/auth/attest.ts's own tests). */
  const attest = (actorId: string, attester: string, action: string) =>
    id(
      pg,
      `INSERT INTO public.pharmacy_attestations (hospital_id, actor_user_id, attester_user_id, purpose, action, outcome)
       VALUES ($1, $2, $3, 'signer', $4, 'passed') RETURNING id`,
      [f.h, actorId, attester, action],
    );
  /** An issue with both legs, store → place, as the issuing screen writes it (IS-2). */
  async function issue(toId: string, batchId: string, quantity: number) {
    return asClinicalWriter(
      { userId: f.pharmacist!, hospitalId: f.h! },
      async (tx) => {
        const from = await loadLocation(tx, f.h!, f.store!);
        const to = await loadLocation(tx, f.h!, toId);
        const [row] = await tx
          .insert(pharmacyIssues)
          .values({
            hospitalId: f.h!,
            kind: "issue",
            fromLocationId: from.id,
            toLocationId: to.id,
            issuedBy: f.pharmacist!,
          })
          .returning({ id: pharmacyIssues.id });
        const issueId = row!.id;
        const legs = await movePair(tx, {
          pair: "issue",
          hospitalId: f.h!,
          from,
          to,
          batch: await batchRef(tx, f.h!, batchId, from.id),
          quantity,
          sourceId: issueId,
          actorUserId: f.pharmacist!,
          effectiveAt: new Date(),
        });
        return { issueId, toBatchId: legs.toBatchId };
      },
      lane.db,
    );
  }
  async function storeBatch(productId: string, number: string, expiry: string, quantity: number) {
    const batchId = await asClinicalWriter(
      { userId: f.pharmacist!, hospitalId: f.h! },
      async (tx) => {
        const store = await loadLocation(tx, f.h!, f.store!);
        return batchAtLocation(tx, {
          hospitalId: f.h!,
          location: store,
          productId,
          batchNumber: number,
          expiry,
          monthOnly: false,
          actorUserId: f.pharmacist!,
        });
      },
      lane.db,
    );
    await pg.query(
      `INSERT INTO public.pharmacy_stock_movements (hospital_id, location_id, batch_id, kind, quantity, effective_at, actor_user_id, source_kind)
       VALUES ($1, $2, $3, 'received', $4, now(), $5, 'delivery')`,
      [f.h, f.store, batchId, quantity, f.pharmacist],
    );
    return batchId;
  }
  const goLive = (loc: string) =>
    pg.query(
      `INSERT INTO public.pharmacy_location_golive (hospital_id, location_id, action, conditions, requested_by, approved_by)
       VALUES ($1, $2, 'on', '{}', $3, $4)`,
      [f.h, loc, f.pharmacist, f.head],
    );

  beforeAll(async () => {
    lane = await bootLane();
    pg = lane.pg;
    f.h = await hospital(pg, "Wards");
    f.pharmDept = await id(
      pg,
      `INSERT INTO public.hospital_departments (hospital_id, name, slug, kind, catalogue_code)
       VALUES ($1, 'Pharmacy', $2, 'support', 'PHARMACY') RETURNING id`,
      [f.h, `ph-${randomUUID().slice(0, 8)}`],
    );
    const unit = (name: string) =>
      id(
        pg,
        `INSERT INTO public.hospital_departments (hospital_id, parent_id, name, slug, kind) VALUES ($1, $2, $3, $4, 'support') RETURNING id`,
        [f.h, f.pharmDept, name, `u-${randomUUID().slice(0, 8)}`],
      );
    f.storeDept = await unit("Main store");
    f.pointDept = await unit("Fixture point");
    await pg.query(
      `INSERT INTO public.pharmacy_dispensing_points (department_id, hospital_id, serves, count_freshness_days) VALUES ($1, $2, 'window', 7)`,
      [f.pointDept, f.h],
    );
    f.wardDept = await department(pg, f.h, "Medicine");
    f.cartDept = await department(pg, f.h, "Emergency");
    f.pharmacist = (
      await staff(pg, { hospitalId: f.h, departmentId: f.pharmDept, cadre: "PHARMACIST" })
    ).userId;
    f.head = (
      await staff(pg, { hospitalId: f.h, departmentId: f.pharmDept, cadre: "PHARMACIST" })
    ).userId;
    await pg.query(
      `INSERT INTO public.department_heads (hospital_id, department_id, user_id, starts_at) VALUES ($1, $2, $3, now() - interval '1 day')`,
      [f.h, f.pharmDept, f.head],
    );
    f.nurseInCharge = (
      await staff(pg, { hospitalId: f.h, departmentId: f.wardDept, cadre: "NURSE" })
    ).userId;
    f.nurseOther = (
      await staff(pg, { hospitalId: f.h, departmentId: f.wardDept, cadre: "NURSE" })
    ).userId;
    f.cartHead = (
      await staff(pg, { hospitalId: f.h, departmentId: f.cartDept, cadre: "NURSE" })
    ).userId;
    await pg.query(
      `INSERT INTO public.department_heads (hospital_id, department_id, user_id, starts_at) VALUES ($1, $2, $3, now() - interval '1 day')`,
      [f.h, f.cartDept, f.cartHead],
    );
    const hubWard = (name: string) =>
      id(
        pg,
        `INSERT INTO public.hospital_wards (hospital_id, department_id, name, slug) VALUES ($1, $2, $3, $4) RETURNING id`,
        [f.h, f.wardDept, name, `w-${randomUUID().slice(0, 8)}`],
      );
    f.hubW = await hubWard("Ward W");
    f.hubW2 = await hubWard("Ward W2");
    await pg.query(
      `INSERT INTO public.ward_in_charge_assignments (hospital_id, ward_id, nurse_user_id, starts_at) VALUES ($1, $2, $3, now() - interval '1 day')`,
      [f.h, f.hubW, f.nurseInCharge],
    );
    const crash = (label: string) =>
      id(
        pg,
        `INSERT INTO public.crash_carts (hospital_id, department_id, label) VALUES ($1, $2, $3) RETURNING id`,
        [f.h, f.cartDept, label],
      );
    f.crash1 = await crash("Cart one");
    f.crash2 = await crash("Cart two");
    f.store = await id(
      pg,
      `INSERT INTO public.pharmacy_locations (hospital_id, kind, department_id, name) VALUES ($1, 'store', $2, 'Main store') RETURNING id`,
      [f.h, f.storeDept],
    );
    f.quar = await id(
      pg,
      `INSERT INTO public.pharmacy_locations (hospital_id, kind, department_id, name) VALUES ($1, 'quarantine', $2, 'Quarantine') RETURNING id`,
      [f.h, f.storeDept],
    );
    await goLive(f.store);
    await goLive(f.quar);
    await pg.query(
      `INSERT INTO public.pharmacy_hospital_settings (hospital_id, expiry_lookahead_days, updated_by) VALUES ($1, 90, $2)`,
      [f.h, f.head],
    );
    const product = (medicine: string, name: string) =>
      id(
        pg,
        `INSERT INTO public.pharmacy_products (hospital_id, medicine_id, name, issue_unit, created_by) VALUES ($1, $2, $3, 'vial', $4) RETURNING id`,
        [f.h, medicine, name, f.head],
      );
    f.product = await product("ceftriaxone", "Fixture vial A");
    f.controlled = await product("morphine", "Fixture controlled vial");
    f.b1 = await storeBatch(f.product!, "FX-A1", "2099-12-31", 500);
    f.bCtl = await storeBatch(f.controlled, "FX-C1", "2099-12-31", 50);
  }, 180_000);

  it("creates wards and carts (lane A's createLocation) with pharmacy.manage only", async () => {
    const create = (raw: unknown, who = f.head!) =>
      runPharmacyWrite(
        loc.CreateLocationInput,
        raw,
        actor(who),
        storeNeed("pharmacy.manage"),
        (ctx, i) => loc.createLocation(ctx, i),
        { database: lane.db },
      );
    const raw = {
      kind: "ward",
      clientKey: randomUUID(),
      name: "Ward W",
      wardId: f.hubW,
      wardSupplyModel: "stocked",
      anyNurseConfirms: false,
    };
    expect((await create(raw, f.pharmacist)).ok).toBe(false);
    const ok = await create(raw);
    expect(ok.ok).toBe(true);
    f.W = (ok as { id: string }).id;
    for (const [k, hub, kind] of [
      ["W2", f.hubW2, "ward"],
      ["C1", f.crash1, "cart"],
      ["C2", f.crash2, "cart"],
    ] as const) {
      const r = await create(
        kind === "ward"
          ? { kind, clientKey: randomUUID(), name: k, wardId: hub, wardSupplyModel: "stocked" }
          : { kind, clientKey: randomUUID(), name: k, crashCartId: hub },
      );
      expect(r.ok).toBe(true);
      f[k] = (r as { id: string }).id;
    }
    for (const l of [f.W, f.W2, f.C1, f.C2]) await goLive(l!);
  });

  it("S20a: 10 issued, 8 confirmed (−2 adjusted), the next count finds 8: ward_used is 0, not 2", async () => {
    const { issueId, toBatchId } = await issue(f.W!, f.b1!, 10);
    f.wb1 = toBatchId;
    // IS-3: the confirmer's own second factor is required.
    const noFactor = await ward(
      ws.ConfirmReceiptInput,
      ws.confirmWardIssue,
      {
        issueId,
        locationId: f.W,
        attestationId: randomUUID(),
        lines: [{ batchId: toBatchId, arrived: 8 }],
        reasonCode: "short",
      },
      f.nurseInCharge!,
      "ward_confirm",
    );
    expect(noFactor.ok).toBe(false);
    const factor = await attest(f.nurseInCharge!, f.nurseInCharge!, "pharmacy_receipt");
    const ok = await ward(
      ws.ConfirmReceiptInput,
      ws.confirmWardIssue,
      {
        issueId,
        locationId: f.W,
        attestationId: factor,
        lines: [{ batchId: toBatchId, arrived: 8 }],
        reasonCode: "short",
      },
      f.nurseInCharge!,
      "ward_confirm",
    );
    expect(ok.ok).toBe(true);
    expect((await moves(f.W!, "adjusted")).rows.map((r) => r.quantity)).toEqual([-2]);
    expect(await balanceAt(f.W!)).toBe(8);

    const count = await ward(
      ws.WardCountInput,
      ws.recordWardCount,
      {
        step: "count",
        clientKey: randomUUID(),
        locationId: f.W,
        lines: [{ productId: f.product, batchId: toBatchId, counted: 8 }],
      },
      f.nurseInCharge!,
    );
    expect(count.ok).toBe(true);
    expect((await moves(f.W!, "ward_used")).rows).toEqual([]);
    expect(await balanceAt(f.W!)).toBe(8);
    // SL-15: a ward count never writes count_correction.
    expect((await moves(f.W!, "count_correction")).rows).toEqual([]);
  });

  it("S19: a ward count writes ward_used, and the hospital's consumption includes it", async () => {
    const r = await pharm(
      ws.WardCountInput,
      ws.recordWardCount,
      {
        step: "count",
        clientKey: randomUUID(),
        locationId: f.W,
        lines: [{ productId: f.product, batchId: f.wb1, counted: 5 }],
      },
      "pharmacy.stock",
      f.pharmacist,
    );
    expect(r.ok).toBe(true);
    expect((await moves(f.W!, "ward_used")).rows.map((m) => m.quantity)).toEqual([-3]);
    expect(await balanceAt(f.W!)).toBe(5);
    const rows = await pg.query<{
      id: string;
      batch_id: string;
      place: string;
      kind: never;
      quantity: number;
      effective_at: string;
      recorded_at: string;
    }>(
      `SELECT id, batch_id, coalesce(location_id, dispensing_point_id) AS place, kind, quantity, effective_at, recorded_at
         FROM public.pharmacy_stock_movements WHERE hospital_id = $1`,
      [f.h],
    );
    const locs = await pg.query<{ id: string; kind: never; ward_supply_model: never }>(
      `SELECT id, kind, ward_supply_model FROM public.pharmacy_locations WHERE hospital_id = $1`,
      [f.h],
    );
    const c = consumption(
      rows.rows.map((m) => ({
        id: m.id,
        batchId: m.batch_id,
        pointId: m.place,
        kind: m.kind,
        quantity: m.quantity,
        effectiveAt: new Date(m.effective_at),
        recordedAt: new Date(m.recorded_at),
        downtime: false,
      })),
      new Map(locs.rows.map((l) => [l.id, { kind: l.kind, model: l.ward_supply_model }])),
      { from: new Date(Date.now() - DAY), to: new Date(Date.now() + DAY) },
    );
    expect(c.terms.wardUsed).toBe(3);
    expect(c.consumption).toBe(3);
  });

  it("S20: a count higher than possible writes no ward_used, is listed, and takes the counter's reason", async () => {
    const before = (await moves(f.W!, "ward_used")).rows.length;
    const r = await ward(
      ws.WardCountInput,
      ws.recordWardCount,
      {
        step: "count",
        clientKey: randomUUID(),
        locationId: f.W,
        lines: [{ productId: f.product, batchId: f.wb1, counted: 9 }],
      },
      f.nurseInCharge!,
    );
    expect(r.ok).toBe(true);
    const answer = (r as { data: ws.WardCountResult }).data;
    expect(answer.surplus).toEqual([expect.objectContaining({ batchId: f.wb1, extra: 4 })]);
    expect((await moves(f.W!, "ward_used")).rows.length).toBe(before);
    const page = await getWardStockPage(lane.db, f.h!, f.W!, new Date());
    expect(page!.surplus.find((s) => s.countId === answer.id)?.reasoned).toBe(false);
    const reasons = await ward(
      ws.WardCountInput,
      ws.recordWardCount,
      {
        step: "reasons",
        countId: answer.id,
        locationId: f.W,
        reasons: [{ batchId: f.wb1, reasonCode: "receipt_unrecorded", note: null }],
      },
      f.nurseInCharge!,
    );
    expect(reasons.ok).toBe(true);
    expect(await balanceAt(f.W!)).toBe(9);
    const listed = await getWardStockPage(lane.db, f.h!, f.W!, new Date());
    expect(listed!.surplus.find((s) => s.countId === answer.id)?.reasoned).toBe(true);
  });

  it("S18: unsigned levels suggest nothing; signed, a fresh count suggests level − count; a stale count says count first", async () => {
    let page = await getWardStockPage(lane.db, f.h!, f.W!, new Date());
    expect(page!.rows[0]!.topUp).toEqual({ kind: "missing", missing: ["ward_level"] });
    const draft = await pharm(
      ws.WardLevelsInput,
      ws.setWardLevels,
      { locationId: f.W, levels: [{ productId: f.product, level: 20 }] },
      "pharmacy.manage",
    );
    expect(draft.ok).toBe(true);
    // The second signer must hold the ward's in-charge right.
    const wrong = await pharm(
      ws.SignPackInput,
      ws.signLocationPack,
      {
        packId: draft.ok ? draft.id : "",
        firstAttestationId: await attest(f.head!, f.head!, "pharmacy_pack_first"),
        secondAttestationId: await attest(f.head!, f.nurseOther!, "pharmacy_pack_second"),
        exception: false,
      },
      "pharmacy.manage",
    );
    expect(wrong.ok).toBe(false);
    const signed = await pharm(
      ws.SignPackInput,
      ws.signLocationPack,
      {
        packId: draft.ok ? draft.id : "",
        firstAttestationId: await attest(f.head!, f.head!, "pharmacy_pack_first"),
        secondAttestationId: await attest(f.head!, f.nurseInCharge!, "pharmacy_pack_second"),
        exception: false,
      },
      "pharmacy.manage",
    );
    expect(signed.ok).toBe(true);
    page = await getWardStockPage(lane.db, f.h!, f.W!, new Date());
    expect(page!.rows[0]!.topUp).toEqual({ kind: "top_up", quantity: 11 });
    const stale = await getWardStockPage(lane.db, f.h!, f.W!, new Date(Date.now() + 10 * DAY));
    expect(stale!.rows[0]!.topUp).toEqual({ kind: "count_first" });
  });

  it("S21: a nurse in charge sees and acts on only their own ward", async () => {
    expect((await wardsOf(lane.db, f.h!, f.nurseInCharge!)).map((w) => w.id)).toEqual([f.W]);
    expect(await wardsOf(lane.db, f.h!, f.nurseOther!)).toEqual([]);
    const other = await ward(
      ws.WardCountInput,
      ws.recordWardCount,
      {
        step: "count",
        clientKey: randomUUID(),
        locationId: f.W2,
        lines: [{ productId: f.product, batchId: f.wb1, counted: 1 }],
      },
      f.nurseInCharge!,
    );
    expect(other).toEqual({ ok: false, error: "You are not in charge of this place." });
    const notInCharge = await ward(
      ws.WardRequisitionInput,
      ws.raiseWardRequisition,
      {
        clientKey: randomUUID(),
        locationId: f.W,
        issuingLocationId: f.store,
        lines: [{ productId: f.product, quantity: 5 }],
      },
      f.nurseOther!,
    );
    expect(notInCharge.ok).toBe(false);
    const raised = await ward(
      ws.WardRequisitionInput,
      ws.raiseWardRequisition,
      {
        clientKey: randomUUID(),
        locationId: f.W,
        issuingLocationId: f.store,
        lines: [{ productId: f.product, quantity: 11 }],
      },
      f.nurseInCharge!,
    );
    expect(raised.ok).toBe(true);
    const page = await getWardStockPage(lane.db, f.h!, f.W!, new Date());
    expect(page!.rows[0]!.ask).toEqual({ asked: 11, state: "raised" });
  });

  it("S22: doses charted are shown and never subtracted", async () => {
    const before = await getWardStockPage(lane.db, f.h!, f.W!, new Date());
    const p = await patient(pg);
    const src = await encounter(pg, {
      hospitalId: f.h!,
      patientUserId: p,
      clinicianUserId: f.nurseInCharge!,
    });
    const inp = await encounter(pg, {
      hospitalId: f.h!,
      patientUserId: p,
      clinicianUserId: f.nurseInCharge!,
    });
    const adm = await id(
      pg,
      `INSERT INTO public.admissions (hospital_id, patient_user_id, source_encounter_id, ward_id, status, decided_by)
       VALUES ($1, $2, $3, $4, 'bed_allocated', $5) RETURNING id`,
      [f.h, p, src, f.hubW, f.nurseInCharge],
    );
    await pg.query(
      `UPDATE public.admissions SET status = 'arrived', inpatient_encounter_id = $2, arrived_at = now(), arrived_by = $3 WHERE id = $1`,
      [adm, inp, f.nurseInCharge],
    );
    const rx = await id(
      pg,
      `INSERT INTO public.prescriptions (hospital_id, encounter_id, patient_user_id, prescriber_user_id, drug_id, drug_name, dose, route)
       VALUES ($1, $2, $3, $4, 'ceftriaxone', 'Ceftriaxone', '1 g', 'iv') RETURNING id`,
      [f.h, inp, p, f.nurseInCharge],
    );
    for (let i = 0; i < 2; i++)
      await pg.query(
        `INSERT INTO public.medication_administration_records (hospital_id, patient_user_id, encounter_id,
           administered_by_user_id, drug_name, dose, route, state, emr_prescription_id)
         VALUES ($1, $2, $3, $4, 'Ceftriaxone', '1 g', 'iv', 'administered', $5)`,
        [f.h, p, inp, f.nurseInCharge, rx],
      );
    const after = await getWardStockPage(lane.db, f.h!, f.W!, new Date());
    const [a, b] = [before!.rows[0]!, after!.rows[0]!];
    expect(b.dosesCharted).toBe(a.dosesCharted + 2);
    // WS-2: nothing else on the row moved.
    expect({ ...b, dosesCharted: 0 }).toEqual({ ...a, dosesCharted: 0 });
    expect(await balanceAt(f.W!)).toBe(9);
  });

  it("S23: a controlled line reaches the ward only with the nurse's second factor; the issue needs its witness", async () => {
    expect(
      controlledRefusals({
        controlled: true,
        movement: "issue",
        witnessAttestationId: null,
        confirmerSecondFactor: false,
      }),
    ).toEqual(["witness_needed"]);
    const { issueId, toBatchId } = await issue(f.W!, f.bCtl!, 2);
    // Another person's attestation is not the confirmer's own second factor.
    const notOwn = await attest(f.nurseInCharge!, f.head!, "pharmacy_receipt");
    const refused = await ward(
      ws.ConfirmReceiptInput,
      ws.confirmWardIssue,
      {
        issueId,
        locationId: f.W,
        attestationId: notOwn,
        lines: [{ batchId: toBatchId, arrived: 2 }],
        reasonCode: null,
      },
      f.nurseInCharge!,
      "ward_confirm",
    );
    expect(refused.ok).toBe(false);
    const own = await attest(f.nurseInCharge!, f.nurseInCharge!, "pharmacy_receipt");
    const ok = await ward(
      ws.ConfirmReceiptInput,
      ws.confirmWardIssue,
      {
        issueId,
        locationId: f.W,
        attestationId: own,
        lines: [{ batchId: toBatchId, arrived: 2 }],
        reasonCode: null,
      },
      f.nurseInCharge!,
      "ward_confirm",
    );
    expect(ok.ok).toBe(true);
    // D-PH2-19: a controlled return from the ward goes through the pharmacy, with a witness.
    const back = await ward(
      ws.WardReturnInput,
      ws.returnWardStock,
      {
        clientKey: randomUUID(),
        locationId: f.W,
        toLocationId: f.store,
        batchId: toBatchId,
        quantity: 1,
        reasonCode: "no_longer_needed",
        note: null,
        fit: true,
      },
      f.nurseInCharge!,
    );
    expect(back.ok).toBe(false);
  });

  it("IS-5: a ward return goes back to its issuer, or to quarantine when not fit", async () => {
    const fit = await ward(
      ws.WardReturnInput,
      ws.returnWardStock,
      {
        clientKey: randomUUID(),
        locationId: f.W,
        toLocationId: f.store,
        batchId: f.wb1,
        quantity: 1,
        reasonCode: "near_expiry",
        note: null,
        fit: true,
      },
      f.nurseInCharge!,
    );
    expect(fit.ok).toBe(true);
    const unfit = await ward(
      ws.WardReturnInput,
      ws.returnWardStock,
      {
        clientKey: randomUUID(),
        locationId: f.W,
        toLocationId: f.store,
        batchId: f.wb1,
        quantity: 1,
        reasonCode: "other",
        note: "Broken seal",
        fit: false,
      },
      f.nurseInCharge!,
    );
    expect(unfit.ok).toBe(true);
    expect((await moves(f.W!, "returned_out")).rows.map((m) => m.quantity)).toEqual([-1]);
    expect((await moves(f.W!, "quarantined_out")).rows.map((m) => m.quantity)).toEqual([-1]);
    expect((await moves(f.quar!, "quarantined_in")).rows.map((m) => m.quantity)).toEqual([1]);
    const page = await getWardStockPage(lane.db, f.h!, f.W!, new Date());
    expect(page!.rows.find((r) => r.productId === f.product)!.returnedSince).toBe(2);
  });

  describe("emergency carts", () => {
    const check = (raw: unknown) =>
      runPharmacyWrite(
        cartStore.CartCheckInput,
        raw,
        actor(f.pharmacist!),
        storeNeed("pharmacy.stock"),
        (ctx, i) => cartStore.recordCartCheck(ws.whoOf(ctx), i),
        { database: lane.db },
      );
    const confirm = () => attest(f.pharmacist!, f.cartHead!, "pharmacy_cart_confirm");

    it("the cart list is signed by the pharmacy in charge with the unit lead; unsigned, no check completes", async () => {
      const draft = await pharm(
        ws.CartListInput,
        ws.setCartList,
        {
          locationId: f.C1,
          items: [{ productId: f.product, quantity: 10 }],
          checkIntervalDays: 7,
          names: ["Cart one", "Resus trolley 1"],
        },
        "pharmacy.manage",
      );
      expect(draft.ok).toBe(true);
      const count = await check({
        step: "count",
        clientKey: randomUUID(),
        locationId: f.C1,
        lines: [],
      });
      expect(count.ok).toBe(true);
      const early = await check({
        step: "complete",
        countId: count.ok ? count.id : "",
        locationId: f.C1,
        fromLocationId: f.store,
        sealNumber: null,
        confirmAttestationId: await confirm(),
        explanations: [],
        swaps: [],
      });
      expect(early).toMatchObject({ ok: false, error: "Sign the cart list first." });
      const signed = await pharm(
        ws.SignPackInput,
        ws.signLocationPack,
        {
          packId: draft.ok ? draft.id : "",
          firstAttestationId: await attest(f.head!, f.head!, "pharmacy_pack_first"),
          secondAttestationId: await attest(f.head!, f.cartHead!, "pharmacy_pack_second"),
          exception: false,
        },
        "pharmacy.manage",
      );
      expect(signed.ok).toBe(true);
      // The checker cannot confirm their own check.
      const self = await check({
        step: "complete",
        countId: count.ok ? count.id : "",
        locationId: f.C1,
        fromLocationId: f.store,
        sealNumber: null,
        confirmAttestationId: await attest(f.pharmacist!, f.pharmacist!, "pharmacy_cart_confirm"),
        explanations: [],
        swaps: [],
      });
      expect(self.ok).toBe(false);
      const done = await check({
        step: "complete",
        countId: count.ok ? count.id : "",
        locationId: f.C1,
        fromLocationId: f.store,
        sealNumber: "S-001",
        confirmAttestationId: await confirm(),
        explanations: [],
        swaps: [],
      });
      expect(done.ok).toBe(true);
      expect(await balanceAt(f.C1!)).toBe(10);
    });

    it("S24: restocked to 10, counted at 7: cart_used 3 from the count; the three resus uses are context only", async () => {
      const ep = await id(
        pg,
        `INSERT INTO public.resus_episodes (hospital_id, trigger_kind) VALUES ($1, 'triage_red') RETURNING id`,
        [f.h],
      );
      for (const cart of ["cart ONE", " Resus trolley 1", "Cart one"])
        await pg.query(
          `INSERT INTO public.resus_timeline_events (episode_id, kind, payload) VALUES ($1, 'drug', $2)`,
          [ep, JSON.stringify({ prescribing: { drugName: "Fixture drug", dose: "1 mg", cart } })],
        );
      // H2-16: a name that matches no cart is listed.
      await pg.query(
        `INSERT INTO public.resus_timeline_events (episode_id, kind, payload) VALUES ($1, 'drug', $2)`,
        [ep, JSON.stringify({ prescribing: { drugName: "Fixture drug", cart: "Trolley X" } })],
      );
      const batch = (
        await pg.query<{ id: string }>(
          `SELECT id FROM public.pharmacy_batches WHERE location_id = $1`,
          [f.C1],
        )
      ).rows[0]!.id;
      const count = await check({
        step: "count",
        clientKey: randomUUID(),
        locationId: f.C1,
        lines: [{ batchId: batch, counted: 7 }],
      });
      expect(count.ok).toBe(true);
      const shown = (count as { data: cartStore.CartCountRevealed }).data;
      expect(shown.uses).toHaveLength(3);
      expect(shown.lines).toEqual([expect.objectContaining({ before: 10, counted: 7 })]);
      // The person must say what they found.
      const silent = await check({
        step: "complete",
        countId: shown.id,
        locationId: f.C1,
        fromLocationId: f.store,
        sealNumber: null,
        confirmAttestationId: await confirm(),
        explanations: [],
        swaps: [],
      });
      expect(silent.ok).toBe(false);
      const done = await check({
        step: "complete",
        countId: shown.id,
        locationId: f.C1,
        fromLocationId: f.store,
        sealNumber: "S-002",
        confirmAttestationId: await confirm(),
        explanations: [
          {
            batchId: batch,
            explanation: "recorded_uses_accepted",
            reasonCode: null,
            note: null,
            toCartLocationId: null,
          },
        ],
        swaps: [],
      });
      expect(done.ok).toBe(true);
      expect((await moves(f.C1!, "cart_used")).rows.map((m) => m.quantity)).toEqual([-3]);
      expect(await balanceAt(f.C1!)).toBe(10);
      const carts = await getCartsPage(lane.db, f.h!, new Date());
      expect(carts.unmatched).toEqual([{ name: "Trolley X", n: 1 }]);
      const after = await getCartPage(lane.db, f.h!, f.C1!, new Date());
      expect(after!.uses).toEqual([]);
    });

    it("S25: restock takes the first-expiring stock and swaps short-dated items", async () => {
      const short = await storeBatch(f.product!, "FX-SHORT", isoDay(30), 5);
      const early = await storeBatch(f.product!, "FX-EARLY", isoDay(400), 20);
      await storeBatch(f.product!, "FX-LATE", isoDay(800), 20);
      const { toBatchId } = await issue(f.C2!, short, 4);
      const draft = await pharm(
        ws.CartListInput,
        ws.setCartList,
        {
          locationId: f.C2,
          items: [{ productId: f.product, quantity: 6 }],
          checkIntervalDays: 7,
          names: ["Cart two"],
        },
        "pharmacy.manage",
      );
      await pharm(
        ws.SignPackInput,
        ws.signLocationPack,
        {
          packId: draft.ok ? draft.id : "",
          firstAttestationId: await attest(f.head!, f.head!, "pharmacy_pack_first"),
          secondAttestationId: null,
          exception: true,
        },
        "pharmacy.manage",
      );
      const count = await check({
        step: "count",
        clientKey: randomUUID(),
        locationId: f.C2,
        lines: [{ batchId: toBatchId, counted: 4 }],
      });
      const shown = (count as { data: cartStore.CartCountRevealed }).data;
      expect(shown.swaps).toEqual([expect.objectContaining({ batchId: toBatchId })]);
      const done = await check({
        step: "complete",
        countId: shown.id,
        locationId: f.C2,
        fromLocationId: f.store,
        sealNumber: null,
        confirmAttestationId: await confirm(),
        explanations: [],
        swaps: [],
      });
      expect(done.ok).toBe(true);
      expect((await moves(f.C2!, "returned_out")).rows.map((m) => m.quantity)).toEqual([-4]);
      const restock = await pg.query<{ batch_number: string; quantity: number }>(
        `SELECT b.batch_number, m.quantity FROM public.pharmacy_stock_movements m JOIN public.pharmacy_batches b ON b.id = m.batch_id
          WHERE m.location_id = $1 AND m.kind = 'issued' AND m.source_id = (SELECT restock_issue_id FROM public.pharmacy_cart_checks WHERE count_id = $2)`,
        [f.store, shown.id],
      );
      expect(restock.rows).toEqual([{ batch_number: "FX-EARLY", quantity: -6 }]);
      expect(early).toBeTruthy();
      expect(await balanceAt(f.C2!)).toBe(6);
      const signedBy = await one<{ exception_text: string; second_signer: string | null }>(
        `SELECT exception_text, second_signer FROM public.pharmacy_location_packs WHERE location_id = $1 AND status = 'signed'`,
        [f.C2],
      );
      expect(signedBy).toEqual({
        exception_text: "CSO signs alone (ADR 0281)",
        second_signer: null,
      });
    });

    it("S26: a cart past its signed check interval is listed overdue", async () => {
      const now = await getCartsPage(lane.db, f.h!, new Date());
      expect(now.rows.find((r) => r.id === f.C1)?.overdue).toBe(false);
      const later = await getCartsPage(lane.db, f.h!, new Date(Date.now() + 8 * DAY));
      expect(later.rows.find((r) => r.id === f.C1)?.overdue).toBe(true);
    });
  });
});
