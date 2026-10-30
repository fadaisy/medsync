/**
 * Pharmacy Phase 2, Step 4: the store (5.2, 5.3, 5.12, store counts) on the PGlite lane, driven through
 * lib/pharmacy/stores/{location,receiving,issue}-store.ts by the house write path (runPharmacyWrite) and the
 * reads in store-read.ts as the pharmacy viewer under RLS.
 *
 * S11 a 20-line delivery with two discrepancies enters at counted quantities; the discrepancy report and the
 * goods received note are its projections and their prints are logged · S12 expired on delivery never enters
 * stock · S13 short-dated needs a decision · S14 store → point issue, both legs, the point confirms, a difference
 * is adjusted at the point · S15 a controlled receipt and issue need their witness · S16 a loan stays listed until
 * returned or closed · S17 the store goes live only with its conditions and a second hospital admin · S17a with
 * the store on, Phase 1's "from Main store" is refused · S17b a damaged line goes to quarantine, never the shelf.
 *
 * Every product, batch, person and quantity is a fixture. Runs with EMR_PGLITE=1.
 */
import { randomUUID } from "node:crypto";
import type { Lane, Pg } from "./_pglite";
import type { PharmacyActor, PharmacyCtx } from "@/lib/pharmacy/write";
import type { z } from "zod";
import { beforeAll, describe, expect, it } from "vitest";

import { asClinicalWriter } from "@/lib/emr/db";
import { PHARMACY_MAP_V2, pharmacyDispensingAccess, withStoreAccess } from "@/lib/pharmacy/access";
import * as phase1 from "@/lib/pharmacy/stock/store";
import * as iss from "@/lib/pharmacy/stores/issue-store";
import * as loc from "@/lib/pharmacy/stores/location-store";
import * as rcv from "@/lib/pharmacy/stores/receiving-store";
import { getDelivery, getIssuesPage, getRequisition } from "@/lib/pharmacy/stores/store-read";
import { loadLocation, storeNeed } from "@/lib/pharmacy/stores/write";
import { runPharmacyWrite } from "@/lib/pharmacy/write";
import { bootLane, hospital, laneOn, staff } from "./_pglite";

// S17a and every Store action: the store is on for every hospital in this file (never production here).
process.env.PHARMACY_WORKSPACE = "1";
process.env.PHARMACY_STORE = "1";

const id = async (pg: Pg, q: string, p?: unknown[]) =>
  (await pg.query<{ id: string }>(q, p)).rows[0]!.id;
const DAY = 86_400_000;
const isoDay = (offset: number) => new Date(Date.now() + offset * DAY).toISOString().slice(0, 10);
const FAR = "2031-06-30";

type Perm = "pharmacy.store" | "pharmacy.stock" | "pharmacy.manage" | "pharmacy.controlled";

describe.skipIf(!laneOn)("The store (Step 4: S11–S17b)", () => {
  let lane: Lane;
  let pg: Pg;
  const f = {} as Record<string, string>;
  const products: string[] = [];

  const actor = (
    userId: string,
    cadre = "PHARMACIST",
    pointId: string | null = null,
  ): PharmacyActor => ({
    userId,
    hospitalId: f.h!,
    cadreCode: cadre,
    cadreName: cadre,
    pointId,
    access: withStoreAccess(pharmacyDispensingAccess(cadre, PHARMACY_MAP_V2), cadre, true),
  });
  const pharmacist = () => actor(f.pharmacist!);
  const head = () => actor(f.head!, "PHARMACY_TECH");

  function write<I, R extends { id: string }>(
    schema: z.ZodType<I>,
    fn: (ctx: PharmacyCtx, input: I) => Promise<R>,
    raw: unknown,
    perm: Perm | readonly Perm[] = "pharmacy.store",
    who: PharmacyActor = pharmacist(),
  ) {
    return runPharmacyWrite(schema, raw, who, storeNeed(perm), fn, { database: lane.db });
  }
  const ok = <R>(r: { ok: boolean; error?: string; data?: R }) => {
    if (!r.ok) throw new Error(r.error);
    return r.data as R;
  };
  const admin = (userId: string) => ({ userId, hospitalId: f.h! });
  const asAdmin = <T>(
    userId: string,
    fn: (tx: Parameters<typeof loc.switchLocation>[0]) => Promise<T>,
  ) =>
    asClinicalWriter(admin(userId), fn, lane.db).then(
      (v) => ({ ok: true as const, v }),
      (e: Error) => ({ ok: false as const, error: e.message }),
    );
  const one = async <T>(q: string, p?: unknown[]) => (await pg.query<T>(q, p)).rows[0] as T;
  const balanceOf = async (locationId: string, productId?: string) =>
    (
      await one<{ n: number }>(
        `SELECT coalesce(sum(m.quantity),0)::int AS n FROM public.pharmacy_stock_movements m
           JOIN public.pharmacy_batches b ON b.id = m.batch_id
          WHERE coalesce(m.location_id, m.dispensing_point_id) = $1 AND ($2::uuid IS NULL OR b.product_id = $2)`,
        [locationId, productId ?? null],
      )
    ).n;
  const witnessFor = (actorId: string, by = f.witness!) =>
    id(
      pg,
      `INSERT INTO public.pharmacy_attestations (hospital_id, actor_user_id, attester_user_id, purpose, action, outcome)
       VALUES ($1, $2, $3, 'witness', 'controlled_receipt', 'passed') RETURNING id`,
      [f.h, actorId, by],
    );
  const signer = (actorId: string, by: string) =>
    id(
      pg,
      `INSERT INTO public.pharmacy_attestations (hospital_id, actor_user_id, attester_user_id, purpose, action, outcome)
       VALUES ($1, $2, $3, 'signer', 'location_golive', 'passed') RETURNING id`,
      [f.h, actorId, by],
    );
  const product = (name: string, medicine = "amoxicillin") =>
    id(
      pg,
      `INSERT INTO public.pharmacy_products (hospital_id, medicine_id, name, issue_unit, created_by)
       VALUES ($1, $2, $3, 'tablet', $4) RETURNING id`,
      [f.h, medicine, name, f.pharmacist],
    );
  const start = (note: string, locationId = f.store!) =>
    write(rcv.StartDeliveryInput, rcv.startDelivery, {
      clientKey: randomUUID(),
      supplierId: f.supplier,
      noteNumber: note,
      // An hour ago, typed in Kampala time (UTC+3).
      arrivedAt: new Date(Date.now() + 2 * 3_600_000).toISOString().slice(0, 16).replace("T", " "),
      locationId,
      delivererName: "Fixture deliverer",
      vehicleRegistration: "UAA 000A",
    });
  const delivery = async (note: string) => ok<{ id: string }>(await start(note)).id;
  const line = (deliveryId: string, lineNo: number, o: Record<string, unknown>) =>
    write(rcv.DeliveryLineInput, rcv.saveDeliveryLine, {
      deliveryId,
      lineNo,
      accepted: 0,
      rejectedKept: 0,
      rejectedReturned: 0,
      ...o,
    });
  const receive = (
    deliveryId: string,
    who = pharmacist(),
    witnesses: { lineNo: number; attestationId: string }[] = [],
  ) =>
    write(
      rcv.ReceiveDeliveryInput,
      rcv.receiveDelivery,
      { deliveryId, witnesses },
      "pharmacy.store",
      who,
    );

  beforeAll(async () => {
    lane = await bootLane();
    pg = lane.pg;
    f.h = await hospital(pg, "Store lane");
    f.pharmacyDept = await id(
      pg,
      `INSERT INTO public.hospital_departments (hospital_id, name, slug, kind, catalogue_code)
       VALUES ($1, 'Pharmacy', $2, 'support', 'PHARMACY') RETURNING id`,
      [f.h, `ph-${randomUUID().slice(0, 8)}`],
    );
    for (const k of ["storeDept", "point"]) {
      f[k] = await id(
        pg,
        `INSERT INTO public.hospital_departments (hospital_id, parent_id, name, slug, kind)
         VALUES ($1, $2, $3, $4, 'support') RETURNING id`,
        [
          f.h,
          f.pharmacyDept,
          k === "point" ? "Fixture point" : "Fixture main store",
          `${k}-${randomUUID().slice(0, 8)}`,
        ],
      );
    }
    await pg.query(
      `INSERT INTO public.pharmacy_dispensing_points (department_id, hospital_id, serves) VALUES ($1, $2, 'window')`,
      [f.point, f.h],
    );
    await pg.query(
      `UPDATE public.pharmacy_dispensing_points SET live_at = now() WHERE department_id = $1`,
      [f.point],
    );
    const person = async (k: string, dept: string, cadre: string) =>
      (f[k] = (await staff(pg, { hospitalId: f.h!, departmentId: dept, cadre })).userId);
    await person("pharmacist", f.storeDept!, "PHARMACIST");
    await person("witness", f.storeDept!, "PHARMACIST");
    await person("head", f.storeDept!, "PHARMACY_TECH");
    await pg.query(
      `INSERT INTO public.department_heads (hospital_id, department_id, user_id, starts_at)
       VALUES ($1, $2, $3, now() - interval '1 day')`,
      [f.h, f.pharmacyDept, f.head],
    );
    for (const k of ["adminA", "adminB"]) {
      f[k] = await id(pg, `INSERT INTO auth.users (email) VALUES ($1) RETURNING id`, [
        `${k}-${randomUUID().slice(0, 6)}@lane.test`,
      ]);
      await pg.query(
        `INSERT INTO public.user_roles (user_id, role, hospital_id) VALUES ($1, 'hospital_admin', $2)`,
        [f[k], f.h],
      );
    }
    await pg.query(
      `INSERT INTO public.pharmacy_hospital_settings (hospital_id, expiry_lookahead_days, updated_by) VALUES ($1, 90, $2)`,
      [f.h, f.pharmacist],
    );
    for (let i = 1; i <= 20; i++)
      products.push(await product(`Fixture product ${String(i).padStart(2, "0")}`));
    f.morphine = await product("Fixture controlled injection", "morphine");
  }, 240_000);

  it("places and suppliers: a store, a quarantine, a supplier and a facility (pharmacy.manage)", async () => {
    // A pharmacist without a hub head assignment does not manage.
    const refused = await write(
      loc.CreateLocationInput,
      loc.createLocation,
      { clientKey: randomUUID(), kind: "store", name: "Main store", departmentId: f.storeDept },
      "pharmacy.manage",
    );
    expect(refused.ok).toBe(false);
    f.store = ok<{ id: string }>(
      await write(
        loc.CreateLocationInput,
        loc.createLocation,
        { clientKey: randomUUID(), kind: "store", name: "Main store", departmentId: f.storeDept },
        "pharmacy.manage",
        head(),
      ),
    ).id;
    f.quarantine = ok<{ id: string }>(
      await write(
        loc.CreateLocationInput,
        loc.createLocation,
        { clientKey: randomUUID(), kind: "quarantine", name: "Quarantine" },
        "pharmacy.manage",
        head(),
      ),
    ).id;
    const second = await write(
      loc.CreateLocationInput,
      loc.createLocation,
      { clientKey: randomUUID(), kind: "quarantine", name: "Another quarantine" },
      "pharmacy.manage",
      head(),
    );
    expect(second).toMatchObject({ ok: false });
    for (const [k, kind, name] of [
      ["supplier", "supplier", "Fixture medical stores"],
      ["facility", "facility", "Fixture health centre"],
    ] as const)
      f[k] = ok<{ id: string }>(
        await write(
          loc.CounterpartyInput,
          loc.saveCounterparty,
          { clientKey: randomUUID(), kind, name, takesReturns: kind === "supplier" },
          "pharmacy.manage",
          head(),
        ),
      ).id;
  });

  it("S17: the store goes live only with its conditions met and a second hospital admin", async () => {
    // Not live: nothing is received there (Law 7).
    expect(await start("PRE-LIVE")).toMatchObject({
      ok: false,
      error: expect.stringMatching(/not live/),
    });
  }, 60_000);

  it("S17 (cont.): conditions, the second approver, and quarantine", async () => {
    const tryOn = async (attestationId: string) =>
      asAdmin(f.adminA!, (tx) =>
        loc.switchLocation(
          tx,
          admin(f.adminA!),
          {
            locationId: f.store!,
            action: "on",
            reason: null,
            approvalAttestationId: attestationId,
          },
          new Date(),
        ),
      );
    // Conditions unmet.
    expect(await tryOn(await signer(f.adminA!, f.adminB!))).toMatchObject({
      ok: false,
      error: expect.stringMatching(/Every condition/),
    });
    // The opening count (blind; before the store is live), the in-charge, the briefing, the drill.
    ok(
      await write(
        loc.StoreCountInput,
        loc.recordStoreCount,
        {
          step: "opening",
          clientKey: randomUUID(),
          locationId: f.store,
          lines: [{ productId: products[0], batchNumber: "OPEN-1", expiry: FAR, counted: 30 }],
        },
        "pharmacy.stock",
      ),
    );
    ok(
      await write(
        loc.InChargeInput,
        loc.setLocationInCharge,
        { locationId: f.store, userId: f.head },
        "pharmacy.manage",
        head(),
      ),
    );
    const conditions = async () =>
      (await asAdmin(f.adminA!, async (tx) =>
        loc.locationReadiness(tx, f.h!, await loadLocation(tx, f.h!, f.store!)),
      )) as { ok: true; v: { id: string; met: boolean }[] };
    expect((await conditions()).v.filter((c) => !c.met).map((c) => c.id)).toEqual([
      "people_briefed",
      "downtime_drill",
    ]);
    expect(
      (
        await asAdmin(f.adminA!, (tx) =>
          loc.recordLocationBriefing(
            tx,
            admin(f.adminA!),
            { locationId: f.store!, heldOn: isoDay(-1), notes: null },
            new Date(),
          ),
        )
      ).ok,
    ).toBe(true);
    // A drill without a delivery on paper does not meet the store's condition.
    await asAdmin(f.adminA!, (tx) =>
      loc.recordLocationDrill(
        tx,
        admin(f.adminA!),
        {
          locationId: f.store!,
          heldOn: isoDay(-1),
          participants: "Fixture team",
          whatWasDone: "Issues on paper",
          problems: null,
          includedDelivery: false,
          includedIssue: true,
        },
        new Date(),
      ),
    );
    expect((await conditions()).v.filter((c) => !c.met).map((c) => c.id)).toEqual([
      "downtime_drill",
    ]);
    await asAdmin(f.adminA!, (tx) =>
      loc.recordLocationDrill(
        tx,
        admin(f.adminA!),
        {
          locationId: f.store!,
          heldOn: isoDay(-1),
          participants: "Fixture team",
          whatWasDone: "A delivery and an issue on paper",
          problems: null,
          includedDelivery: true,
          includedIssue: true,
        },
        new Date(),
      ),
    );
    expect((await conditions()).v.every((c) => c.met)).toBe(true);
    // The requester cannot approve their own switch, nor can someone who is not a hospital admin.
    expect(await tryOn(await signer(f.adminA!, f.adminA!))).toMatchObject({ ok: false });
    expect(await tryOn(await signer(f.adminA!, f.pharmacist!))).toMatchObject({
      ok: false,
      error: expect.stringMatching(/hospital admin/),
    });
    // attestApprover with the verifier injected: a passed signer attestation by admin B.
    const att = await asAdmin(f.adminA!, (tx) =>
      loc.attestApprover(
        tx,
        admin(f.adminA!),
        { approverUserId: f.adminB!, password: "x", code: "123456" },
        new Date(),
        async () => ({ userId: f.adminB! }),
      ),
    );
    expect(att).toMatchObject({ ok: true, v: { ok: true } });
    const on = await tryOn((att as { v: { id: string } }).v.id);
    expect(on.ok).toBe(true);
    const row = await one<{ requested_by: string; approved_by: string; live: boolean }>(
      `SELECT g.requested_by, g.approved_by, l.live_at IS NOT NULL AS live FROM public.pharmacy_location_golive g
         JOIN public.pharmacy_locations l ON l.id = g.location_id WHERE g.location_id = $1`,
      [f.store],
    );
    expect(row).toEqual({ requested_by: f.adminA, approved_by: f.adminB, live: true });
    // Switching off needs a reason of a sentence.
    const offAttestation = await signer(f.adminB!, f.adminA!);
    expect(
      loc.SwitchLocationInput.safeParse({
        locationId: f.store,
        action: "off",
        reason: "short",
        approvalAttestationId: offAttestation,
      }).success,
    ).toBe(false);
    // Quarantine: its in-charge named, then the switch.
    ok(
      await write(
        loc.InChargeInput,
        loc.setLocationInCharge,
        { locationId: f.quarantine, userId: f.pharmacist },
        "pharmacy.manage",
        head(),
      ),
    );
    const qAttestation = await signer(f.adminA!, f.adminB!);
    const q = await asAdmin(f.adminA!, (tx) =>
      loc.switchLocation(
        tx,
        admin(f.adminA!),
        {
          locationId: f.quarantine!,
          action: "on",
          reason: null,
          approvalAttestationId: qAttestation,
        },
        new Date(),
      ),
    );
    expect(q.ok).toBe(true);
  }, 120_000);

  it("S11, S17b: a 20-line delivery with two discrepancies enters stock at the counted quantities; damaged goes to quarantine", async () => {
    const d = await delivery("DN-0001");
    for (let i = 0; i < 20; i++) {
      const base = {
        productId: products[i],
        batchNumber: `B-${i + 1}`,
        expiry: FAR,
        noteQuantity: 100,
        accepted: 100,
      };
      const o =
        i === 4
          ? { ...base, accepted: 90 } // 10 fewer than the note
          : i === 9
            ? { ...base, accepted: 90, rejectedKept: 10, rejectReason: "damaged" } // damaged, kept
            : base;
      ok(await line(d, i + 1, o));
    }
    // Saved and left: nothing has moved.
    expect(await balanceOf(f.store!, products[1])).toBe(0);
    const r = await receive(d);
    expect(r.ok).toBe(true);
    expect(await balanceOf(f.store!, products[1])).toBe(100);
    expect(await balanceOf(f.store!, products[4])).toBe(90);
    expect(await balanceOf(f.store!, products[9])).toBe(90);
    // S17b: the damaged 10 are in quarantine, received there with their reason, never on the shelf.
    expect(await balanceOf(f.quarantine!, products[9])).toBe(10);
    const q = await one<{ kind: string; reason_code: string }>(
      `SELECT kind, reason_code FROM public.pharmacy_stock_movements WHERE location_id = $1`,
      [f.quarantine],
    );
    expect(q).toEqual({ kind: "received", reason_code: "damaged" });
    // One `received` movement per batch and place, each linked to its delivery line.
    const n = await one<{ n: number; linked: number }>(
      `SELECT count(*)::int AS n, count(*) FILTER (WHERE l.id IS NOT NULL)::int AS linked
         FROM public.pharmacy_stock_movements m LEFT JOIN public.pharmacy_delivery_lines l ON l.id = m.source_id
        WHERE m.source_kind = 'delivery' AND l.delivery_id = $1`,
      [d],
    );
    expect(n).toEqual({ n: 21, linked: 21 });
    // RG-5: the discrepancy report lists exactly the two lines; both prints are logged.
    const view = (await getDelivery(
      { userId: f.pharmacist!, hospitalId: f.h! },
      d,
      new Date(),
      lane.db,
    ))!;
    expect([...view.reportLineNos].sort((a, b) => a - b)).toEqual([5, 10]);
    expect(view.lines[4]!.results).toEqual([{ kind: "fewer_than_note", n: 10 }]);
    expect(view.lines[9]!.results.map((x) => x.kind)).toEqual(["damaged"]);
    expect(view.lines[0]!.results).toEqual([{ kind: "matches" }]);
    for (const fn of [rcv.printDiscrepancyReport, rcv.printGrn])
      ok(await write(rcv.PrintDeliveryInput, fn, { clientKey: randomUUID(), deliveryId: d }));
    const prints = await pg.query<{ kind: string }>(
      `SELECT kind FROM public.pharmacy_print_events WHERE ref_id = $1 ORDER BY kind`,
      [d],
    );
    expect(prints.rows.map((p) => p.kind)).toEqual(["discrepancy_report", "goods_received_note"]);
    // A received delivery never changes.
    expect(
      (await line(d, 21, { productId: products[0], accepted: 1, batchNumber: "X", expiry: FAR }))
        .ok,
    ).toBe(false);
  }, 120_000);

  it("S12, SL-3: an expired line cannot enter stock; a batch here with another expiry is refused", async () => {
    const d = await delivery("DN-0002");
    ok(
      await line(d, 1, {
        productId: products[0],
        batchNumber: "EXP-1",
        expiry: isoDay(-5),
        noteQuantity: 10,
        accepted: 10,
      }),
    );
    expect(await receive(d)).toMatchObject({
      ok: false,
      error: expect.stringMatching(/expired on arrival/),
    });
    ok(
      await line(d, 1, {
        productId: products[0],
        batchNumber: "EXP-1",
        expiry: isoDay(-5),
        noteQuantity: 10,
        rejectedKept: 10,
        rejectReason: "expired",
      }),
    );
    ok(
      await line(d, 2, {
        productId: products[1],
        batchNumber: "B-2",
        expiry: "2031-07-31",
        noteQuantity: 5,
        accepted: 5,
      }),
    );
    expect(await receive(d)).toMatchObject({
      ok: false,
      error: expect.stringMatching(/already here with expiry/),
    });
    ok(
      await line(d, 2, {
        productId: products[1],
        batchNumber: "B-2",
        expiry: FAR,
        noteQuantity: 5,
        accepted: 5,
      }),
    );
    expect((await receive(d)).ok).toBe(true);
    expect(await balanceOf(f.quarantine!, products[0])).toBe(10);
    expect(await balanceOf(f.store!, products[1])).toBe(105);
  }, 60_000);

  it("S13: a short-dated line needs a decision; rejected means none is accepted", async () => {
    const d = await delivery("DN-0003");
    ok(
      await line(d, 1, {
        productId: products[2],
        batchNumber: "SHORT-1",
        expiry: isoDay(30),
        noteQuantity: 20,
        accepted: 20,
      }),
    );
    expect(await receive(d)).toMatchObject({
      ok: false,
      error: expect.stringMatching(/Record a decision/),
    });
    ok(
      await write(rcv.ShortDatedInput, rcv.recordShortDatedDecision, {
        deliveryId: d,
        lineNo: 1,
        decision: "reject",
      }),
    );
    expect(await receive(d)).toMatchObject({
      ok: false,
      error: expect.stringMatching(/rejected as short-dated/),
    });
    ok(
      await write(rcv.ShortDatedInput, rcv.recordShortDatedDecision, {
        deliveryId: d,
        lineNo: 1,
        decision: "accept_tell",
      }),
    );
    expect((await receive(d)).ok).toBe(true);
    const view = (await getDelivery(
      { userId: f.pharmacist!, hospitalId: f.h! },
      d,
      new Date(),
      lane.db,
    ))!;
    expect(view.lines[0]!.results).toEqual([{ kind: "expires_within", lookaheadDays: 90 }]);
    expect(view.reportLineNos.has(1)).toBe(true);
  });

  it("S14: store → point; both legs in one pair, first expiry first; the point confirms and a difference is adjusted there", async () => {
    // A second, later batch of product 3 so FEFO has a choice.
    const d = await delivery("DN-0004");
    ok(
      await line(d, 1, {
        productId: products[3],
        batchNumber: "LATE-4",
        expiry: "2032-01-31",
        noteQuantity: 50,
        accepted: 50,
      }),
    );
    ok(await receive(d));
    const raised = ok<{ id: string }>(
      await write(iss.RaiseRequisitionInput, iss.raiseRequisition, {
        clientKey: randomUUID(),
        requestingLocationId: f.point,
        issuingLocationId: f.store,
        lines: [
          { productId: products[3], quantity: 10 },
          { productId: products[5], quantity: 5 },
        ],
      }),
    ).id;
    const v = (await getRequisition(
      { userId: f.pharmacist!, hospitalId: f.h! },
      raised,
      new Date(),
      lane.db,
    ))!;
    const l3 = v.lines.find((l) => l.productId === products[3])!;
    expect(l3).toMatchObject({ asked: 10, held: 150, prefill: 10, first: { batchNumber: "B-4" } });
    const l5 = v.lines.find((l) => l.productId === products[5])!;
    // A line issued as zero needs its reason.
    const noReason = await write(iss.IssueRequisitionInput, iss.issueRequisition, {
      requisitionId: raised,
      lines: [
        { lineId: l3.id, quantity: 10 },
        { lineId: l5.id, quantity: 0 },
      ],
    });
    expect(noReason.ok).toBe(false);
    const issued = ok<{ id: string; state: string }>(
      await write(iss.IssueRequisitionInput, iss.issueRequisition, {
        requisitionId: raised,
        lines: [
          { lineId: l3.id, quantity: 10 },
          { lineId: l5.id, quantity: 0, notIssuedReason: "Kept for the wards" },
        ],
      }),
    );
    expect(issued.state).toBe("part_issued");
    const legs = await pg.query<{
      kind: string;
      quantity: number;
      place: string;
      pair_id: string;
      batch_number: string;
    }>(
      `SELECT m.kind, m.quantity, coalesce(m.location_id, m.dispensing_point_id) AS place, m.pair_id, b.batch_number
         FROM public.pharmacy_stock_movements m JOIN public.pharmacy_batches b ON b.id = m.batch_id
        WHERE m.source_id = $1 ORDER BY m.kind`,
      [issued.id],
    );
    expect(legs.rows.map((r) => [r.kind, r.quantity, r.place, r.batch_number])).toEqual([
      ["issued", -10, f.store, "B-4"],
      ["received_from_issue", 10, f.point, "B-4"],
    ]);
    expect(new Set(legs.rows.map((r) => r.pair_id)).size).toBe(1);
    // The point's dispensing_point_id is written too, so Phase 1's reads see it.
    expect(
      await one(
        `SELECT dispensing_point_id FROM public.pharmacy_stock_movements WHERE source_id = $1 AND kind = 'received_from_issue'`,
        [issued.id],
      ),
    ).toEqual({ dispensing_point_id: f.point });
    // "Issued {time}, not yet confirmed by {location}" until the point confirms.
    const page = await getIssuesPage({ userId: f.pharmacist!, hospitalId: f.h! }, lane.db);
    const pending = page.toConfirm.find((c) => c.issueId === issued.id)!;
    expect(pending.lines).toHaveLength(1);
    const pointBatch = pending.lines[0]!.batchId;
    // A difference needs words; then it is adjusted at the point, linked to the issue.
    expect(
      (
        await write(
          iss.ConfirmReceiptInput,
          iss.confirmIssueReceipt,
          { issueId: issued.id, lines: [{ batchId: pointBatch, confirmed: 8 }] },
          "pharmacy.stock",
        )
      ).ok,
    ).toBe(false);
    ok(
      await write(
        iss.ConfirmReceiptInput,
        iss.confirmIssueReceipt,
        {
          issueId: issued.id,
          lines: [{ batchId: pointBatch, confirmed: 8 }],
          reason: "Two broken in the box",
        },
        "pharmacy.stock",
      ),
    );
    expect(await balanceOf(f.point!, products[3])).toBe(8);
    const adj = await one<{
      kind: string;
      quantity: number;
      reason_code: string;
      source_id: string;
    }>(
      `SELECT kind, quantity, reason_code, source_id FROM public.pharmacy_stock_movements WHERE batch_id = $1 AND kind = 'adjusted'`,
      [pointBatch],
    );
    expect(adj).toEqual({
      kind: "adjusted",
      quantity: -2,
      reason_code: "receipt_difference",
      source_id: issued.id,
    });
    expect(
      await one(`SELECT state FROM public.pharmacy_requisitions WHERE id = $1`, [raised]),
    ).toEqual({ state: "confirmed_with_difference" });
    // IS-5: a return to the store (fit), and one not fit, which goes to quarantine.
    ok(
      await write(
        iss.ReturnInput,
        iss.returnStock,
        {
          clientKey: randomUUID(),
          fromLocationId: f.point,
          toLocationId: f.store,
          batchId: pointBatch,
          quantity: 2,
          reasonCode: "no_longer_needed",
          fit: true,
        },
        "pharmacy.stock",
      ),
    );
    ok(
      await write(
        iss.ReturnInput,
        iss.returnStock,
        {
          clientKey: randomUUID(),
          fromLocationId: f.point,
          toLocationId: f.store,
          batchId: pointBatch,
          quantity: 1,
          reasonCode: "other",
          note: "Label torn",
          fit: false,
        },
        "pharmacy.stock",
      ),
    );
    expect(await balanceOf(f.point!, products[3])).toBe(5);
    const back = await pg.query<{ kind: string; place: string; reason_code: string }>(
      `SELECT kind, coalesce(location_id, dispensing_point_id) AS place, reason_code FROM public.pharmacy_stock_movements
        WHERE kind IN ('returned_in','quarantined_in') AND batch_id IN (SELECT id FROM public.pharmacy_batches WHERE product_id = $1)
        ORDER BY kind`,
      [products[3]],
    );
    expect(back.rows).toEqual([
      { kind: "quarantined_in", place: f.quarantine, reason_code: "returned_not_fit" },
      { kind: "returned_in", place: f.store, reason_code: "no_longer_needed" },
    ]);
  }, 120_000);

  it("rework scenario 3: one witness covers every controlled line of a delivery, and stock rises", async () => {
    const d = await delivery("DN-RW3");
    ok(await line(d, 1, { productId: f.morphine, batchNumber: "RW3-A", expiry: FAR, noteQuantity: 5, accepted: 5 }));
    ok(await line(d, 2, { productId: f.morphine, batchNumber: "RW3-B", expiry: FAR, noteQuantity: 4, accepted: 4 }));
    ok(await line(d, 3, { productId: products[0], batchNumber: "RW3-C", expiry: FAR, noteQuantity: 6, accepted: 6 }));
    const one = await witnessFor(f.pharmacist!);
    ok(await receive(d, pharmacist(), [{ lineNo: 1, attestationId: one }, { lineNo: 2, attestationId: one }]));
    const r = await pg.query<{ n: number }>(
      `SELECT coalesce(sum(m.quantity), 0)::int AS n FROM public.pharmacy_stock_movements m
         JOIN public.pharmacy_batches b ON b.id = m.batch_id WHERE b.batch_number IN ('RW3-A','RW3-B','RW3-C')`,
    );
    expect(r.rows[0]!.n).toBe(15);
  });

  it("S15: a controlled receipt and a controlled issue need the witness", async () => {
    const d = await delivery("DN-0005");
    ok(
      await line(d, 1, {
        productId: f.morphine,
        batchNumber: "CD-1",
        expiry: FAR,
        noteQuantity: 10,
        accepted: 10,
      }),
    );
    expect(await receive(d)).toMatchObject({ ok: false, error: expect.stringMatching(/witness/) });
    // Without `pharmacy.controlled` (the technician), refused even with a witness.
    expect(
      await receive(d, head(), [{ lineNo: 1, attestationId: await witnessFor(f.head!) }]),
    ).toMatchObject({ ok: false });
    ok(
      await receive(d, pharmacist(), [
        { lineNo: 1, attestationId: await witnessFor(f.pharmacist!) },
      ]),
    );
    const m = await one<{ witness_attestation_id: string | null }>(
      `SELECT witness_attestation_id FROM public.pharmacy_stock_movements m JOIN public.pharmacy_batches b ON b.id = m.batch_id
        WHERE b.product_id = $1 AND m.kind = 'received'`,
      [f.morphine],
    );
    expect(m.witness_attestation_id).not.toBeNull();
    const raw = {
      clientKey: randomUUID(),
      fromLocationId: f.store,
      toLocationId: f.point,
      lines: [{ productId: f.morphine, quantity: 2 }],
    };
    expect(await write(iss.DirectIssueInput, iss.directIssue, raw)).toMatchObject({
      ok: false,
      error: expect.stringMatching(/witness/),
    });
    ok(
      await write(iss.DirectIssueInput, iss.directIssue, {
        ...raw,
        witnessAttestationId: await witnessFor(f.pharmacist!),
      }),
    );
    expect(await balanceOf(f.point!, f.morphine)).toBe(2);
    // Controlled drugs are never lent.
    const batch = await one<{ id: string }>(
      `SELECT id FROM public.pharmacy_batches WHERE product_id = $1 AND location_id = $2`,
      [f.morphine, f.store],
    );
    expect(
      await write(
        iss.LendInput,
        iss.lendStock,
        {
          clientKey: randomUUID(),
          locationId: f.store,
          batchId: batch.id,
          quantity: 1,
          counterpartyId: f.facility,
        },
        "pharmacy.manage",
        head(),
      ),
    ).toMatchObject({ ok: false, error: expect.stringMatching(/never lent/) });
  }, 60_000);

  it("S16: a loan stays listed until it is returned or closed; borrowing goes through receiving's checks", async () => {
    const batch = await one<{ id: string }>(
      `SELECT id FROM public.pharmacy_batches WHERE product_id = $1 AND location_id = $2`,
      [products[6], f.store],
    );
    const lent = ok<{ id: string }>(
      await write(
        iss.LendInput,
        iss.lendStock,
        {
          clientKey: randomUUID(),
          locationId: f.store,
          batchId: batch.id,
          quantity: 5,
          counterpartyId: f.facility,
        },
        "pharmacy.manage",
        head(),
      ),
    ).id;
    const listed = async () =>
      (await getIssuesPage({ userId: f.pharmacist!, hospitalId: f.h! }, lane.db)).loans.find(
        (l) => l.id === lent,
      )?.outstanding ?? 0;
    expect(await listed()).toBe(5);
    ok(
      await write(
        iss.CloseLoanInput,
        iss.closeLoan,
        { clientKey: randomUUID(), loanMovementId: lent, returned: 3 },
        "pharmacy.manage",
        head(),
      ),
    );
    expect(await listed()).toBe(2);
    expect(
      (
        await write(
          iss.CloseLoanInput,
          iss.closeLoan,
          { clientKey: randomUUID(), loanMovementId: lent, returned: 3 },
          "pharmacy.manage",
          head(),
        )
      ).ok,
    ).toBe(false);
    ok(
      await write(
        iss.CloseLoanInput,
        iss.closeLoan,
        { clientKey: randomUUID(), loanMovementId: lent, reason: "Facility will not return it" },
        "pharmacy.manage",
        head(),
      ),
    );
    expect(await listed()).toBe(0);
    expect(await balanceOf(f.store!, products[6])).toBe(98);
    // Borrowing: expired refused; then received, and returned against the loan.
    const borrow = (expiry: string) =>
      write(
        iss.BorrowInput,
        iss.borrowStock,
        {
          clientKey: randomUUID(),
          locationId: f.store,
          counterpartyId: f.facility,
          productId: products[7],
          batchNumber: "LOAN-8",
          expiry,
          quantity: 4,
        },
        "pharmacy.manage",
        head(),
      );
    expect(await borrow(isoDay(-1))).toMatchObject({
      ok: false,
      error: expect.stringMatching(/expired/),
    });
    const borrowed = ok<{ id: string }>(await borrow(FAR)).id;
    ok(
      await write(
        iss.CloseLoanInput,
        iss.closeLoan,
        { clientKey: randomUUID(), loanMovementId: borrowed, returned: 4 },
        "pharmacy.manage",
        head(),
      ),
    );
    const ret = await one<{ kind: string; quantity: number; loan_movement_id: string }>(
      `SELECT kind, quantity, loan_movement_id FROM public.pharmacy_stock_movements WHERE loan_movement_id = $1`,
      [borrowed],
    );
    expect(ret).toEqual({ kind: "loan_returned_out", quantity: -4, loan_movement_id: borrowed });
  }, 60_000);

  it("a blind store count: figures saved before the record is shown; a difference becomes a count correction with its reason", async () => {
    const batches = await pg.query<{ id: string; n: number }>(
      `SELECT b.id, coalesce(sum(m.quantity),0)::int AS n FROM public.pharmacy_batches b
         LEFT JOIN public.pharmacy_stock_movements m ON m.batch_id = b.id
        WHERE b.location_id = $1 GROUP BY b.id`,
      [f.store],
    );
    const short = batches.rows.find((b) => b.n >= 3)!.id;
    const lines = batches.rows.map((b) => ({
      batchId: b.id,
      counted: b.id === short ? b.n - 3 : b.n,
    }));
    expect(
      (
        await write(
          loc.StoreCountInput,
          loc.recordStoreCount,
          { step: "count", clientKey: randomUUID(), locationId: f.store, lines: lines.slice(1) },
          "pharmacy.stock",
        )
      ).ok,
    ).toBe(false);
    // The controlled batch here is counted with the witness.
    const r = ok(
      await write(
        loc.StoreCountInput,
        loc.recordStoreCount,
        {
          step: "count",
          clientKey: randomUUID(),
          locationId: f.store,
          lines,
          witnessAttestationId: await witnessFor(f.pharmacist!),
        },
        "pharmacy.stock",
      ),
    ) as { id: string; lines: { batchId: string; counted: number; recorded: number }[] };
    const differs = r.lines.filter((l) => l.counted !== l.recorded);
    expect(differs).toHaveLength(1);
    ok(
      await write(
        loc.StoreCountInput,
        loc.recordStoreCount,
        {
          step: "reasons",
          countId: r.id,
          corrections: [{ batchId: differs[0]!.batchId, reasonCode: "unknown" }],
        },
        "pharmacy.stock",
      ),
    );
    const c = await one<{ quantity: number; reason_code: string }>(
      `SELECT quantity, reason_code FROM public.pharmacy_stock_movements WHERE kind = 'count_correction' AND source_id = $1`,
      [r.id],
    );
    expect(c).toEqual({ quantity: -3, reason_code: "unknown" });
  }, 60_000);

  it("S17a: with the store on, Phase 1's Receive stock refuses 'from Main store', 'Borrowed' and 'Returned from a ward'", async () => {
    const pointActor = actor(f.pharmacist!, "PHARMACIST", f.point!);
    const raw = (from: string) => ({
      clientKey: randomUUID(),
      productId: products[0],
      batchNumber: "P1-1",
      expiry: "2031-06",
      quantity: 5,
      from,
    });
    expect(phase1.deliveryFromOffered(f.h!)).toEqual(["supplier"]);
    for (const from of ["main_store", "borrowed", "ward_return"]) {
      const r = await runPharmacyWrite(
        phase1.ReceiveInput,
        raw(from),
        pointActor,
        phase1.STOCK_NEED,
        phase1.receiveStock,
        { database: lane.db },
      );
      expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/arrives as an issue/) });
    }
    const r = await runPharmacyWrite(
      phase1.ReceiveInput,
      raw("supplier"),
      pointActor,
      phase1.STOCK_NEED,
      phase1.receiveStock,
      { database: lane.db },
    );
    expect(r.ok).toBe(true);
  });

  it("SL-13: no movement written in this file has only one leg", async () => {
    const one_leg = await one<{ n: number }>(
      `SELECT count(*)::int AS n FROM public.pharmacy_stock_movements m
        WHERE m.pair_id IS NOT NULL AND (SELECT count(*) FROM public.pharmacy_stock_movements o WHERE o.pair_id = m.pair_id) <> 2`,
    );
    expect(one_leg.n).toBe(0);
  });
});
