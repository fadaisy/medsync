/**
 * Pharmacy Phase 2, lane C on the PGlite lane: signed packs, expiry and quarantine, recall, month end and the order,
 * driven through `runPharmacyWrite` as the actions run them, against migrations 0180–0184.
 *
 * Scenarios: S28, S29, S30, S31, S32, S33, S33a, S33b, S33c, S34, S35, S36, S37, S38, S39, S42, S43, S47, and the
 * signing rules (two different signers or the D-PH2-22 exception; signing retires the version before; an unsigned
 * `order_parameters` blocks the proposal). Every product, batch, person, figure and date is a fixture.
 *
 * Runs with EMR_PGLITE=1 (tests/emr-db/_pglite.ts).
 */
import { randomUUID } from "node:crypto";
import type { Lane, Pg } from "./_pglite";
import type { EmrTx } from "@/lib/emr/db";
import type { PharmacyActor, PharmacyCtx, PharmacyNeed } from "@/lib/pharmacy/write";
import type { z } from "zod";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { EXPIRY, IN_CHARGE_SIGNS } from "@/content/pharmacy-stores-supply";
import { asClinicalWriter } from "@/lib/emr/db";
import { PHARMACY_MAP_V2, pharmacyDispensingAccess } from "@/lib/pharmacy/access";
import * as stock from "@/lib/pharmacy/stock/store";
import * as expiry from "@/lib/pharmacy/stores/expiry-store";
import {
  buildMonth,
  buildStockStatus,
  monthEndReadiness,
} from "@/lib/pharmacy/stores/month-end-read";
import * as month from "@/lib/pharmacy/stores/month-end-store";
import { buildProposal, loadOrders, orderingReadiness } from "@/lib/pharmacy/stores/order-read";
import * as orders from "@/lib/pharmacy/stores/order-store";
import * as packs from "@/lib/pharmacy/stores/packs";
import { getRecallTrace, recalledAmong } from "@/lib/pharmacy/stores/recall-read";
import * as recall from "@/lib/pharmacy/stores/recall-store";
import {
  batchAtLocation,
  batchRef,
  loadLocation,
  move,
  movePair,
} from "@/lib/pharmacy/stores/write";
import { runPharmacyWrite } from "@/lib/pharmacy/write";
import { bootLane, encounter, hospital, laneOn, patient, staff } from "./_pglite";

const MED = "amoxicillin";
const MED_ORDER = "paracetamol";
const MED_CONTROLLED = "morphine";

describe.skipIf(!laneOn)(
  "Pharmacy Phase 2 lane C: packs, expiry, recall, month end, orders",
  () => {
    let lane: Lane;
    let pg: Pg;
    const f = {} as Record<string, string>;
    const env = { ...process.env };

    const one = async <T = { id: string }>(q: string, p?: unknown[]) =>
      (await pg.query<T>(q, p)).rows[0] as T;
    const id = async (q: string, p?: unknown[]) => (await one(q, p)).id;

    const actor = (
      userId: string,
      cadre: string,
      pointId: string | null = null,
    ): PharmacyActor => ({
      userId,
      hospitalId: f.h!,
      cadreCode: cadre,
      cadreName: cadre,
      pointId,
      access: pharmacyDispensingAccess(cadre, PHARMACY_MAP_V2),
    });
    const head = () => actor(f.head!, "PHARMACIST");
    const pharmacist = () => actor(f.pharmacist!, "PHARMACIST");

    function write<I, R extends { id: string }>(
      schema: z.ZodType<I>,
      fn: (ctx: PharmacyCtx, input: I) => Promise<R>,
      raw: Record<string, unknown>,
      who: PharmacyActor = head(),
      need: PharmacyNeed = { permission: "pharmacy.view", point: "none" },
      now?: Date,
    ) {
      return runPharmacyWrite(schema, { clientKey: randomUUID(), ...raw }, who, need, fn, {
        database: lane.db,
        ...(now ? { now } : {}),
      }).catch((e: Error) => ({ ok: false as const, code: "thrown", error: e.message }));
    }
    const ok = <R>(r: { ok: boolean; error?: string; data?: R }) => {
      if (!r.ok) throw new Error(`refused: ${r.error}`);
      return r as { ok: true; id: string; data: R };
    };
    /** Owner writes through the shared write layer (deliveries and issues belong to the other lanes). */
    const asWriter = <T>(fn: (tx: EmrTx) => Promise<T>) =>
      asClinicalWriter({ userId: f.head!, hospitalId: f.h! }, fn, lane.db);
    /** Drizzle wraps the database's words in its cause. */
    const refusedWith = async (p: Promise<unknown>, re: RegExp) => {
      const e = await p.then(
        () => null,
        (x: unknown) => x,
      );
      expect(e).not.toBeNull();
      const cause = (e as { cause?: unknown }).cause;
      expect(
        `${String(e)} ${cause instanceof Error ? cause.message : String(cause ?? "")}`,
      ).toMatch(re);
    };
    const balance = async (batchId: string) =>
      (
        await one<{ n: number }>(
          `SELECT coalesce(sum(quantity), 0)::int AS n FROM public.pharmacy_stock_movements WHERE batch_id = $1`,
          [batchId],
        )
      ).n;
    const attest = async (actorId: string, attesterId: string, purpose: "signer" | "witness") =>
      id(
        `INSERT INTO public.pharmacy_attestations (hospital_id, actor_user_id, attester_user_id, purpose, action, outcome)
       VALUES ($1, $2, $3, $4, 'fixture', 'passed') RETURNING id`,
        [f.h, actorId, attesterId, purpose],
      );
    const sign = async (kind: packs.PackKind, content: unknown) => {
      const draft = ok(
        await write(
          packs.SavePackInput,
          packs.saveSignedPack,
          { kind, content },
          head(),
          packs.PACK_NEED,
        ),
      );
      const r = await write(
        packs.SignPackInput,
        packs.signPack,
        { packId: draft.id },
        head(),
        packs.PACK_NEED,
      );
      return { draft: draft.id, r };
    };
    const receive = (
      locationId: string,
      productId: string,
      number: string,
      expiryOn: string,
      qty: number,
      at = new Date(),
      unitCost: string | null = null,
    ) =>
      asWriter(async (tx) => {
        const loc = await loadLocation(tx, f.h!, locationId);
        const batchId = await batchAtLocation(tx, {
          hospitalId: f.h!,
          location: loc,
          productId,
          batchNumber: number,
          expiry: expiryOn,
          monthOnly: false,
          actorUserId: f.head!,
        });
        await move(tx, {
          hospitalId: f.h!,
          location: loc,
          batchId,
          kind: "received",
          quantity: qty,
          sourceKind: "delivery",
          actorUserId: f.head!,
          effectiveAt: at,
          unitCost,
        });
        return batchId;
      });
    const issue = (fromId: string, toId: string, batchId: string, qty: number, at = new Date()) =>
      asWriter(async (tx) => {
        const from = await loadLocation(tx, f.h!, fromId);
        const to = await loadLocation(tx, f.h!, toId);
        const batch = await batchRef(tx, f.h!, batchId, from.id);
        return movePair(tx, {
          pair: "issue",
          hospitalId: f.h!,
          from,
          to,
          batch,
          quantity: qty,
          sourceId: randomUUID(),
          actorUserId: f.head!,
          effectiveAt: at,
        });
      });
    /** A supply and its movement, as recordHandover writes them (0126 pairs them at commit). */
    const supply = (
      patientId: string,
      productId: string,
      batchId: string,
      qty: number,
      o: { at?: Date; downtime?: boolean } = {},
    ) =>
      pg.transaction(async (tx) => {
        const rx = (
          await tx.query<{ id: string }>(
            `INSERT INTO public.prescriptions (hospital_id, patient_user_id, prescriber_user_id, drug_id, drug_name, dose, route)
           VALUES ($1, $2, $3, $4, 'Fixture medicine', '[dose]', 'oral') RETURNING id`,
            [f.h, patientId, f.doctor, MED],
          )
        ).rows[0]!.id;
        const handover = (
          await tx.query<{ id: string }>(
            `INSERT INTO public.pharmacy_handovers (hospital_id, dispensing_point_id, patient_user_id, collector,
             identity_route, second_identifier, label_mode, actor_user_id, client_key)
           VALUES ($1, $2, $3, 'patient', 'two_identifiers', 'date_of_birth', 'printed', $4, $5) RETURNING id`,
            [f.h, f.P, patientId, f.pharmacist, randomUUID()],
          )
        ).rows[0]!.id;
        const at = (o.at ?? new Date()).toISOString();
        const supplyId = (
          await tx.query<{ id: string }>(
            `INSERT INTO public.pharmacy_supplies (handover_id, hospital_id, dispensing_point_id, supplying_hospital_id,
             patient_user_id, prescription_id, product_id, batch_id, quantity, issue_unit, supplied_at)
           VALUES ($1, $2, $3, $2, $4, $5, $6, $7, $8, 'tablet', $9) RETURNING id`,
            [handover, f.h, f.P, patientId, rx, productId, batchId, qty, at],
          )
        ).rows[0]!.id;
        await tx.query(
          `INSERT INTO public.pharmacy_stock_movements (hospital_id, dispensing_point_id, location_id, batch_id, kind, quantity,
           effective_at, actor_user_id, source_kind, source_id, downtime)
         VALUES ($1, $2, $2, $3, 'supplied', $4, $5, $6, 'supply', $7, $8)`,
          [f.h, f.P, batchId, -qty, at, f.pharmacist, supplyId, o.downtime ?? false],
        );
        return supplyId;
      });

    beforeAll(async () => {
      process.env.PHARMACY_WORKSPACE = "1";
      process.env.PHARMACY_RECALL = "1";
      process.env.PHARMACY_MONTH_END = "1";
      process.env.PHARMACY_ORDERING = "1";
      lane = await bootLane();
      pg = lane.pg;
      const s = Date.now();
      f.h = await hospital(pg, "Lane C");
      f.pharm = await id(
        `INSERT INTO public.hospital_departments (hospital_id, name, slug, kind, catalogue_code)
       VALUES ($1, 'Pharmacy', $2, 'support', 'PHARMACY') RETURNING id`,
        [f.h, `pharmacy-c-${s}`],
      );
      const unit = (name: string, parent: string | null = f.pharm!) =>
        id(
          `INSERT INTO public.hospital_departments (hospital_id, parent_id, name, slug, kind)
         VALUES ($1, $2, $3, $4, 'support') RETURNING id`,
          [f.h, parent, name, `u-${Math.random().toString(36).slice(2, 10)}`],
        );
      f.P = await unit("Outpatient pharmacy C");
      await pg.query(
        `INSERT INTO public.pharmacy_dispensing_points (department_id, hospital_id, serves, live_at, phone)
       VALUES ($1, $2, 'window', now(), '0700000000')`,
        [f.P, f.h],
      );
      f.storeDept = await unit("Main store C");
      f.wardDept = await unit("Medicine C", null);
      f.ward = await id(
        `INSERT INTO public.hospital_wards (hospital_id, department_id, name, slug) VALUES ($1, $2, 'Ward C', $3) RETURNING id`,
        [f.h, f.wardDept, `ward-c-${s}`],
      );
      const loc = (
        kind: string,
        name: string,
        extra: { department?: string; ward?: string } = {},
      ) =>
        id(
          `INSERT INTO public.pharmacy_locations (hospital_id, kind, department_id, ward_id, name, ward_supply_model)
         VALUES ($1, $2, $3, $4, $5, CASE WHEN $2 = 'ward' THEN 'stocked' END) RETURNING id`,
          [f.h, kind, extra.department ?? null, extra.ward ?? null, name],
        );
      f.S = await loc("store", "Main store C", { department: f.storeDept });
      f.Q = await loc("quarantine", "Quarantine C");
      f.W = await loc("ward", "Ward C", { ward: f.ward });
      f.head = (
        await staff(pg, { hospitalId: f.h, departmentId: f.pharm, cadre: "PHARMACIST" })
      ).userId;
      await pg.query(
        `INSERT INTO public.department_heads (hospital_id, department_id, user_id, starts_at) VALUES ($1, $2, $3, now() - interval '1 day')`,
        [f.h, f.pharm, f.head],
      );
      f.pharmacist = (
        await staff(pg, { hospitalId: f.h, departmentId: f.P, cadre: "PHARMACIST" })
      ).userId;
      f.doctor = (
        await staff(pg, { hospitalId: f.h, departmentId: f.wardDept, cadre: "MEDICAL_OFFICER" })
      ).userId;
      for (const l of [f.S, f.Q, f.W])
        await pg.query(
          `INSERT INTO public.pharmacy_location_golive (hospital_id, location_id, action, conditions, requested_by, approved_by)
         VALUES ($1, $2, 'on', '[]', $3, $4)`,
          [f.h, l, f.head, f.pharmacist],
        );
      await pg.query(
        `INSERT INTO public.pharmacy_hospital_settings (hospital_id, expiry_lookahead_days, updated_by) VALUES ($1, 90, $2)`,
        [f.h, f.head],
      );
      const product = (medicine: string, name: string, pack: string | null = null) =>
        id(
          `INSERT INTO public.pharmacy_products (hospital_id, medicine_id, name, issue_unit, pack_size, created_by)
         VALUES ($1, $2, $3, 'tablet', $4, $5) RETURNING id`,
          [f.h, medicine, name, pack, f.head],
        );
      f.A = await product(MED, "Fixture capsule A");
      f.B = await product("benzylpenicillin", "Fixture vial B");
      f.O = await product(MED_ORDER, "Fixture tablet O", "100");
      f.O2 = await id(
        `INSERT INTO public.pharmacy_products (hospital_id, medicine_id, name, issue_unit, created_by)
       VALUES ($1, $2, 'Fixture syrup O', 'bottle', $3) RETURNING id`,
        [f.h, MED_ORDER, f.head],
      );
      f.C = await product(MED_CONTROLLED, "Fixture ampoule C");
      f.X = await patient(pg);
      f.Y = await patient(pg);
      f.Z = await patient(pg);
    }, 180_000);

    afterAll(() => {
      process.env = env;
    });

    /* ─── Signed packs ───────────────────────────────────────────────── */

    it("signing: an unsigned order_parameters blocks the proposal and names what is missing", async () => {
      const p = await asWriter((tx) => buildProposal(tx, f.h!, new Date()));
      expect(p.missing).toContain("order_parameters");
      expect(p.lines).toEqual([]);
      const r = await write(
        orders.ProposalInput,
        orders.saveOrderProposal,
        { kind: "cycle", chosen: [] },
        head(),
        orders.MANAGE_NEED,
      );
      expect(r).toMatchObject({
        ok: false,
        error: expect.stringContaining("This needs a signed order parameter set"),
      });
    });

    it("signing: a pack needs two different signers or the exception text; signing retires the version before", async () => {
      const content = { rule: "end_of_day" };
      const draft = ok(
        await write(
          packs.SavePackInput,
          packs.saveSignedPack,
          { kind: "stockout_day_rule", content },
          head(),
          packs.PACK_NEED,
        ),
      );
      // A pharmacist without pharmacy.manage cannot sign.
      const notManage = await write(
        packs.SignPackInput,
        packs.signPack,
        { packId: draft.id },
        pharmacist(),
        packs.PACK_NEED,
      );
      expect(notManage.ok).toBe(false);
      const alone = await write(
        packs.SignPackInput,
        packs.signPack,
        { packId: draft.id },
        head(),
        packs.PACK_NEED,
      );
      expect(alone.ok).toBe(true);
      const v1 = await one<{ status: string; exception_text: string; version: number }>(
        `SELECT status, exception_text, version FROM public.pharmacy_signed_sets WHERE id = $1`,
        [draft.id],
      );
      expect(v1).toEqual({ status: "signed", exception_text: IN_CHARGE_SIGNS, version: 1 });
      // Version 2 retires version 1.
      const two = await sign("stockout_day_rule", { rule: "any_part" });
      expect(two.r.ok).toBe(true);
      const rows = await pg.query<{
        version: number;
        status: string;
        second_signer: string | null;
      }>(
        `SELECT version, status, second_signer FROM public.pharmacy_signed_sets
        WHERE hospital_id = $1 AND kind = 'stockout_day_rule' ORDER BY version`,
        [f.h],
      );
      expect(rows.rows).toEqual([
        { version: 1, status: "retired", second_signer: null },
        { version: 2, status: "signed", second_signer: null },
      ]);
      expect((await packs.signedPack(lane.db, f.h!, "stockout_day_rule"))?.content).toEqual({
        rule: "any_part",
      });
      // Back to the end-of-day rule for the scenarios below.
      expect((await sign("stockout_day_rule", content)).r.ok).toBe(true);
    });

    it("signing: content is checked against its kind; a recall template that names a medicine is refused", async () => {
      const bad = await write(
        packs.SavePackInput,
        packs.saveSignedPack,
        { kind: "order_parameters", content: { maxMonths: 4 } },
        head(),
        packs.PACK_NEED,
      );
      expect(bad.ok).toBe(false);
      const banned = await write(
        packs.SavePackInput,
        packs.saveSignedPack,
        {
          kind: "recall_template",
          content: { body: "{messageName}: your amoxicillin is recalled. Call {phone}." },
        },
        head(),
        packs.PACK_NEED,
      );
      expect(banned).toMatchObject({ ok: false, error: expect.stringMatching(/never says/) });
    });

    it("signs the reason lists the scenarios need", async () => {
      const r = await sign("stores_reason_lists", {
        lists: {
          quarantine: [
            { code: "expired", words: "Expired" },
            { code: "damaged", words: "Damaged" },
          ],
          write_off: [{ code: "expired", words: "Expired" }],
          month_end_differences: [{ code: "not_reached", words: "Could not be reached" }],
        },
      });
      expect(r.r.ok).toBe(true);
    });

    /* ─── Expiry, quarantine, write-off ───────────────────────────────── */

    it("S28: an expired batch cannot be issued or supplied anywhere; it moves only into quarantine", async () => {
      f.E1 = await receive(f.S!, f.A!, "EXP-1", "2020-01-31", 10);
      await refusedWith(issue(f.S!, f.W!, f.E1, 2), /expired/);
      f.E2 = await receive(f.P!, f.A!, "EXP-2", "2020-01-31", 5);
      await refusedWith(supply(f.X!, f.A!, f.E2, 1), /expired/);
      const q = await write(
        expiry.QuarantineInput,
        expiry.moveToQuarantine,
        { locationId: f.S, batchId: f.E1, quantity: 10, reasonCode: "expired" },
        pharmacist(),
        expiry.STOCK_NEED,
      );
      expect(q.ok).toBe(true);
      expect(await balance(f.E1)).toBe(0);
      const inQ = await one<{ n: number }>(
        `SELECT coalesce(sum(m.quantity), 0)::int AS n FROM public.pharmacy_stock_movements m
         JOIN public.pharmacy_batches b ON b.id = m.batch_id
        WHERE m.location_id = $1 AND b.batch_number = 'EXP-1'`,
        [f.Q],
      );
      expect(inQ.n).toBe(10);
    });

    it("S33: a write-off is from quarantine, witnessed, with its register entry; the print is logged; disposal later", async () => {
      const qBatch = await id(
        `SELECT id FROM public.pharmacy_batches WHERE location_id = $1 AND batch_number = 'EXP-1'`,
        [f.Q],
      );
      const noWitness = await write(
        expiry.WriteOffInput,
        expiry.writeOff,
        { batchId: qBatch, quantity: 10, reasonCode: "expired", registerNumber: "ESM-1" },
        head(),
        expiry.MANAGE_NEED,
      );
      expect(noWitness.ok).toBe(false);
      const selfWitness = await write(
        expiry.WriteOffInput,
        expiry.writeOff,
        {
          batchId: qBatch,
          quantity: 10,
          reasonCode: "expired",
          registerNumber: "ESM-1",
          witnessAttestationId: await attest(f.head!, f.head!, "signer"),
        },
        head(),
        expiry.MANAGE_NEED,
      );
      expect(selfWitness.ok).toBe(false);
      const w = ok(
        await write(
          expiry.WriteOffInput,
          expiry.writeOff,
          {
            batchId: qBatch,
            quantity: 10,
            reasonCode: "expired",
            registerNumber: "ESM-1",
            witnessAttestationId: await attest(f.head!, f.pharmacist!, "witness"),
          },
          head(),
          expiry.MANAGE_NEED,
        ),
      );
      expect(await balance(qBatch)).toBe(0);
      const print = await write(
        expiry.PrintInput,
        expiry.logPrint,
        { kind: "write_off_register", refId: w.id },
        head(),
        expiry.VIEW_NEED,
      );
      expect(print.ok).toBe(true);
      expect(
        (
          await one<{ n: number }>(
            `SELECT count(*)::int AS n FROM public.pharmacy_print_events WHERE ref_id = $1`,
            [w.id],
          )
        ).n,
      ).toBe(1);
      const disposal = await write(
        expiry.DisposalInput,
        expiry.recordDisposalReference,
        { writeOffId: w.id, reference: "BOS-2026-14", disposalOn: "2026-10-20" },
        head(),
        expiry.MANAGE_NEED,
      );
      expect(disposal.ok).toBe(true);
      // Write-off anywhere but quarantine is refused by the database.
      const shelf = await receive(f.S!, f.A!, "WO-SHELF", "2099-12-31", 3);
      await refusedWith(
        asWriter(async (tx) =>
          move(tx, {
            hospitalId: f.h!,
            location: await loadLocation(tx, f.h!, f.S!),
            batchId: shelf,
            kind: "written_off",
            quantity: -1,
            sourceKind: "write_off",
            actorUserId: f.head!,
            effectiveAt: new Date(),
          }),
        ),
        /quarantine only/,
      );
    });

    it("S33a: with pharmacyRecall on, Phase 1's Adjust refuses damaged and expired removals and says to use quarantine", async () => {
      const batch = await receive(f.P!, f.A!, "ADJ-1", "2099-12-31", 10);
      const who = actor(f.pharmacist!, "PHARMACIST", f.P!);
      const damaged = await write(
        stock.AdjustInput,
        stock.adjustStock,
        { batchId: batch, quantity: -2, reasonCode: "damaged" },
        who,
        stock.STOCK_NEED,
      );
      expect(damaged).toMatchObject({ ok: false, error: EXPIRY.useQuarantine });
      const expired = await write(
        stock.AdjustInput,
        stock.adjustStock,
        { batchId: batch, quantity: -1, reasonCode: "expired_removed" },
        who,
        stock.STOCK_NEED,
      );
      expect(expired).toMatchObject({ ok: false, error: EXPIRY.useQuarantine });
      // "Lost" stays an adjustment (Law 3).
      expect(
        (
          await write(
            stock.AdjustInput,
            stock.adjustStock,
            { batchId: batch, quantity: -1, reasonCode: "lost" },
            who,
            stock.STOCK_NEED,
          )
        ).ok,
      ).toBe(true);
      process.env.PHARMACY_RECALL = "0";
      expect(
        (
          await write(
            stock.AdjustInput,
            stock.adjustStock,
            { batchId: batch, quantity: -1, reasonCode: "damaged" },
            who,
            stock.STOCK_NEED,
          )
        ).ok,
      ).toBe(true);
      process.env.PHARMACY_RECALL = "1";
    });

    /* ─── Recall ───────────────────────────────────────────────────────── */

    it("sets up the recalled batch: received at the store, issued to the ward and the point, supplied to a patient, charted on the ward", async () => {
      const t0 = new Date(Date.now() - 10 * 86_400_000);
      f.B1 = await receive(f.S!, f.A!, "RC-1", "2099-12-31", 100, t0);
      await issue(f.S!, f.W!, f.B1, 30, new Date(t0.getTime() + 3_600_000));
      const toP = await issue(f.S!, f.P!, f.B1, 40, new Date(t0.getTime() + 7_200_000));
      f.B1P = toP.toBatchId;
      f.B1W = await id(
        `SELECT id FROM public.pharmacy_batches WHERE location_id = $1 AND batch_number = 'RC-1'`,
        [f.W],
      );
      await supply(f.X!, f.A!, f.B1P, 5, { at: new Date(t0.getTime() + 86_400_000) });
      // Y, an inpatient on the ward, had the medicine charted while the ward held the batch: list 4, not list 2.
      const src = await encounter(pg, {
        hospitalId: f.h!,
        patientUserId: f.Y!,
        clinicianUserId: f.doctor!,
        departmentId: f.wardDept,
      });
      const inpatient = await encounter(pg, {
        hospitalId: f.h!,
        patientUserId: f.Y!,
        clinicianUserId: f.doctor!,
        departmentId: f.wardDept,
      });
      await pg.query(
        `WITH a AS (
         INSERT INTO public.admissions (hospital_id, patient_user_id, source_encounter_id, ward_id, status, decided_by)
         VALUES ($1, $2, $3, $4, 'bed_allocated', $5) RETURNING id)
       SELECT id FROM a`,
        [f.h, f.Y, src, f.ward, f.doctor],
      );
      await pg.query(
        `UPDATE public.admissions SET status = 'arrived', inpatient_encounter_id = $2, arrived_at = now(), arrived_by = $3
        WHERE patient_user_id = $1`,
        [f.Y, inpatient, f.doctor],
      );
      const rx = await id(
        `INSERT INTO public.prescriptions (hospital_id, patient_user_id, prescriber_user_id, drug_id, drug_name, dose, route)
       VALUES ($1, $2, $3, $4, 'Fixture medicine', '[dose]', 'oral') RETURNING id`,
        [f.h, f.Y, f.doctor, MED],
      );
      await pg.query(
        `INSERT INTO public.medication_administration_records (hospital_id, patient_user_id, encounter_id, administered_by_user_id,
         emr_prescription_id, drug_name, dose, route, state, administered_at)
       VALUES ($1, $2, $3, $4, $5, 'Fixture medicine', '[dose]', 'oral', 'administered', $6)`,
        [f.h, f.Y, inpatient, f.doctor, rx, new Date(t0.getTime() + 2 * 86_400_000).toISOString()],
      );
    });

    it("RC-1: starting a recall blocks the batch at once and tells every ward that received it", async () => {
      const r = ok(
        await write(
          recall.StartRecallInput,
          recall.startRecall,
          {
            productId: f.A,
            batchNumber: "rc-1",
            source: "nda",
            noticeRef: "NDA/FX/1",
            noticeDate: "2026-10-20",
            statedClass: "not_stated",
            level: "All health facilities",
            instructions: "Quarantine and return.",
          },
          head(),
          recall.MANAGE_NEED,
        ),
      );
      f.R = r.id;
      expect(await recalledAmong(lane.db, f.h!, [f.B1!, f.B1P!, f.B1W!])).toEqual(
        new Set([f.B1, f.B1P, f.B1W]),
      );
      expect(
        (
          await one<{ n: number }>(
            `SELECT count(*)::int AS n FROM public.pharmacy_recall_ward_notices WHERE recall_id = $1 AND location_id = $2`,
            [f.R, f.W],
          )
        ).n,
      ).toBe(1);
      await refusedWith(issue(f.S!, f.W!, f.B1!, 1), /recalled/);
    });

    it("S33b: a live hand-over of the recalled batch is refused; a downtime back-entry is recorded and its patient joins list 2", async () => {
      await refusedWith(supply(f.Z!, f.A!, f.B1P!, 1), /recalled/);
      await supply(f.Z!, f.A!, f.B1P!, 1, { downtime: true });
      expect(await balance(f.B1P!)).toBe(34);
      const t = (await getRecallTrace(
        { userId: f.head!, hospitalId: f.h! },
        f.R!,
        lane.db,
        lane.db,
      ))!;
      expect(t.exact.map((p) => p.patientId).sort()).toEqual([f.X, f.Z].sort());
    });

    it("S30, S31: list 2 exact with contact routes; list 4 separate and never repeating list 2; wards, shelves; accounted for is zero", async () => {
      const t = (await getRecallTrace(
        { userId: f.head!, hospitalId: f.h! },
        f.R!,
        lane.db,
        lane.db,
      ))!;
      expect(t.received.map((r) => r.quantity)).toEqual([100]);
      expect(t.exact.find((p) => p.patientId === f.X)).toMatchObject({
        quantity: 5,
        contact: "none",
        status: "not_yet_contacted",
      });
      expect(t.issued).toEqual([expect.objectContaining({ locationId: f.W, quantity: 30 })]);
      expect(t.mayHave.map((p) => [p.patientId, p.source])).toEqual([[f.Y, "ward"]]);
      expect(t.mayHave.some((p) => t.exact.some((e) => e.patientId === p.patientId))).toBe(false);
      expect(Object.fromEntries(t.shelves.map((s) => [s.locationId, s.quantity]))).toEqual({
        [f.S!]: 30,
        [f.W!]: 30,
        [f.P!]: 34,
      });
      expect(t.accounted.gap).toBe(0);
      expect(t.accounted.balance).toBe(94);
    });

    it("S33c: a batch recorded under an earlier number is found by the recall", async () => {
      const b = await receive(f.P!, f.B!, "OLD-9", "2099-12-31", 4);
      await pg.transaction(async (tx) => {
        await tx.query(
          `INSERT INTO public.pharmacy_batch_corrections (batch_id, hospital_id, old_batch_number, new_batch_number, old_expiry, new_expiry, actor_user_id, reason)
         VALUES ($1, $2, 'OLD-9', 'NEW-9', '2099-12-31', '2099-12-31', $3, 'Typed wrong at receipt')`,
          [b, f.h, f.head],
        );
        await tx.query(`UPDATE public.pharmacy_batches SET batch_number = 'NEW-9' WHERE id = $1`, [
          b,
        ]);
      });
      const r = ok(
        await write(
          recall.StartRecallInput,
          recall.startRecall,
          {
            productId: f.B,
            batchNumber: "OLD-9",
            source: "supplier",
            noticeRef: "SUP/FX/2",
            noticeDate: "2026-10-20",
            statedClass: "B",
            level: "Facilities",
            instructions: "Return.",
          },
          head(),
          recall.MANAGE_NEED,
        ),
      );
      const t = (await getRecallTrace(
        { userId: f.head!, hospitalId: f.h! },
        r.id,
        lane.db,
        lane.db,
      ))!;
      expect(t.batches.map((x) => x.batchNumber)).toEqual(["NEW-9"]);
      expect(await recalledAmong(lane.db, f.h!, [b])).toEqual(new Set([b]));
    });

    it("S32, RC-5: the message passes the banned-term scan; sent only by a person to list 2; with no SMS the patient stays on the printed list", async () => {
      expect((await sign("message_name", { name: "Lane C Hospital" })).r.ok).toBe(true);
      const noTemplate = await write(
        recall.SendInput,
        (ctx, i) => recall.sendRecallMessage(ctx, i, { sender: null, production: false }),
        { recallId: f.R, patientUserIds: [f.X], list: "exact" },
        head(),
        recall.MANAGE_NEED,
      );
      expect(noTemplate.ok).toBe(false);
      const body =
        "{messageName} pharmacy needs to speak to you about a medicine you collected. Please call {phone} or come to the pharmacy.";
      expect(packs.templateScan(body)).toEqual([]);
      expect((await sign("recall_template", { body })).r.ok).toBe(true);
      const sent = ok(
        await write(
          recall.SendInput,
          (ctx, i) => recall.sendRecallMessage(ctx, i, { sender: null, production: false }),
          { recallId: f.R, patientUserIds: [f.X], list: "exact" },
          head(),
          recall.MANAGE_NEED,
        ),
      );
      expect(sent.data).toMatchObject({ sent: 0, printed: 1 });
      // Not sent is not "could not reach": no outcome is inferred; the patient stays on the printed list (RC-5).
      const ev = await pg.query(
        `SELECT 1 FROM public.pharmacy_recall_events WHERE recall_id = $1 AND patient_user_id = $2`,
        [f.R, f.X],
      );
      expect(ev.rows).toHaveLength(0);
      // List 4 is messaged only with the CSO's approval for this recall.
      const mayHave = await write(
        recall.SendInput,
        (ctx, i) => recall.sendRecallMessage(ctx, i, { sender: null, production: false }),
        { recallId: f.R, patientUserIds: [f.Y], list: "may_have" },
        head(),
        recall.MANAGE_NEED,
      );
      expect(mayHave.ok).toBe(false);
      // A patient on no list is refused; a contact for a listed one is recorded by pharmacy.stock.
      const stranger = await write(
        recall.ContactInput,
        recall.recordRecallContact,
        { recallId: f.R, patientUserId: f.Y, list: "exact", outcome: "reached_by_phone" },
        pharmacist(),
        recall.CONTACT_NEED,
      );
      expect(stranger.ok).toBe(false);
      expect(
        (
          await write(
            recall.ContactInput,
            recall.recordRecallContact,
            { recallId: f.R, patientUserId: f.X, list: "exact", outcome: "reached_by_phone" },
            pharmacist(),
            recall.CONTACT_NEED,
          )
        ).ok,
      ).toBe(true);
      const t = (await getRecallTrace(
        { userId: f.head!, hospitalId: f.h! },
        f.R!,
        lane.db,
        lane.db,
      ))!;
      expect(t.exact.find((p) => p.patientId === f.X)?.status).toBe("reached_by_phone");
    });

    it("S29: quarantine everything moves every balance of the recalled batch into quarantine in one action", async () => {
      const r = await write(
        recall.QuarantineRecallInput,
        recall.quarantineRecall,
        { recallId: f.R },
        head(),
        recall.MANAGE_NEED,
      );
      expect(r.ok).toBe(true);
      for (const b of [f.B1!, f.B1P!, f.B1W!]) expect(await balance(b)).toBe(0);
      const t = (await getRecallTrace(
        { userId: f.head!, hospitalId: f.h! },
        f.R!,
        lane.db,
        lane.db,
      ))!;
      expect(t.shelves).toEqual([expect.objectContaining({ locationId: f.Q, quantity: 94 })]);
      expect(t.accounted.gap).toBe(0);
      // One leg each way per balance, every pair whole (SL-13).
      const legs = await one<{ n: number; pairs: number }>(
        `SELECT count(*)::int AS n, count(DISTINCT pair_id)::int AS pairs FROM public.pharmacy_stock_movements WHERE source_kind = 'quarantine' AND reason_code = 'recalled'`,
      );
      expect(legs).toEqual({ n: 6, pairs: 3 });
      const closed = await write(
        recall.CloseRecallInput,
        recall.closeRecall,
        { recallId: f.R, returnedQuantity: 94, destroyedQuantity: 0 },
        head(),
        recall.MANAGE_NEED,
      );
      expect(closed.ok).toBe(true);
    });

    it("S29: a controlled product's quarantine-all needs its witness", async () => {
      const c = await receive(f.S!, f.C!, "CD-1", "2099-12-31", 5);
      const r = ok(
        await write(
          recall.StartRecallInput,
          recall.startRecall,
          {
            productId: f.C,
            batchNumber: "CD-1",
            source: "hospital",
            noticeRef: "OWN/1",
            noticeDate: "2026-10-20",
            statedClass: "not_stated",
            level: "Hospital",
            instructions: "Hold.",
          },
          head(),
          recall.MANAGE_NEED,
        ),
      );
      const refused = await write(
        recall.QuarantineRecallInput,
        recall.quarantineRecall,
        { recallId: r.id },
        head(),
        recall.MANAGE_NEED,
      );
      expect(refused.ok).toBe(false);
      expect(await balance(c)).toBe(5);
    });

    /* ─── Month end ────────────────────────────────────────────────────── */

    const SEPT = "2026-09-01";
    const at = (iso: string) => new Date(iso);

    it("S34: a month with an uncounted moved product cannot close without a reason; S38 money only where cost was recorded", async () => {
      f.M1 = await receive(
        f.S!,
        f.A!,
        "ME-1",
        "2099-12-31",
        100,
        at("2026-09-02T09:00:00+03:00"),
        "2.50",
      );
      await issue(f.S!, f.W!, f.M1, 30, at("2026-09-10T09:00:00+03:00"));
      f.M2 = await receive(f.S!, f.B!, "ME-2", "2099-12-31", 20, at("2026-09-05T09:00:00+03:00"));
      const counted = ok(
        await write(
          month.MonthEndCountInput,
          month.recordMonthEndCount,
          { locationId: f.S, lines: [{ batchId: f.M1, counted: 60 }] },
          pharmacist(),
          month.COUNT_NEED,
          at("2026-09-30T15:00:00+03:00"),
        ),
      );
      expect(counted.data).toMatchObject({ differences: 1 });
      const report = await asWriter((tx) =>
        buildMonth(tx, f.h!, { kind: "location", locationId: f.S! }, SEPT),
      );
      const rowA = report.rows.find((r) => r.productId === f.A)!;
      expect(rowA.difference).toBe(-10);
      expect(rowA.columns.adjusted).toBe(0);
      expect(rowA.money?.received).toBe(250);
      expect(report.rows.find((r) => r.productId === f.B)?.money).toBeNull();
      // The month-end rules are unsigned: nothing closes.
      const approver = await attest(f.head!, f.pharmacist!, "witness");
      const unsigned = await write(
        month.CloseMonthInput,
        month.closeMonth,
        { locationId: f.S, month: SEPT, approvalAttestationId: approver },
        head(),
        month.CLOSE_NEED,
        at("2026-10-02T10:00:00+03:00"),
      );
      expect(unsigned.ok).toBe(false);
      expect(
        (
          await sign("month_end_rules", {
            countWindow: { daysBefore: 3, daysAfter: 3 },
            outOfStockShare: 0.5,
            largeDifferenceUnits: 20,
            reportLocationKinds: ["store", "dispensing_point"],
          })
        ).r.ok,
      ).toBe(true);
      const blocked = await write(
        month.CloseMonthInput,
        month.closeMonth,
        { locationId: f.S, month: SEPT, approvalAttestationId: approver },
        head(),
        month.CLOSE_NEED,
        at("2026-10-02T10:00:00+03:00"),
      );
      expect(blocked).toMatchObject({ ok: false, error: expect.stringMatching(/was not counted/) });
      expect(blocked).toMatchObject({
        ok: false,
        error: expect.stringMatching(/difference with no reason/),
      });
    });

    it("S35: an unexplained difference is carried to the next month, never into its opening", async () => {
      const reasons = [
        { productId: f.A, kind: "difference", unexplained: true },
        { productId: f.B, kind: "not_counted", unexplained: false, reasonCode: "not_reached" },
      ];
      for (const r of reasons)
        expect(
          (
            await write(
              month.DifferenceReasonInput,
              month.recordDifferenceReason,
              { locationId: f.S, month: SEPT, ...r },
              pharmacist(),
              month.REASON_NEED,
            )
          ).ok,
        ).toBe(true);
      // The approver must be someone other than the person closing.
      const self = await write(
        month.CloseMonthInput,
        month.closeMonth,
        {
          locationId: f.S,
          month: SEPT,
          approvalAttestationId: await attest(f.head!, f.head!, "signer"),
        },
        head(),
        month.CLOSE_NEED,
        at("2026-10-02T10:00:00+03:00"),
      );
      expect(self.ok).toBe(false);
      // Closed now: every September movement above was recorded before the close.
      const closed = await write(
        month.CloseMonthInput,
        month.closeMonth,
        {
          locationId: f.S,
          month: SEPT,
          approvalAttestationId: await attest(f.head!, f.pharmacist!, "witness"),
        },
        head(),
        month.CLOSE_NEED,
      );
      expect(closed.ok).toBe(true);
      const oct = await asWriter((tx) =>
        buildMonth(tx, f.h!, { kind: "location", locationId: f.S! }, "2026-10-01"),
      );
      const rowA = oct.rows.find((r) => r.productId === f.A)!;
      expect(rowA.opening).toBe(60);
      expect(rowA.carried).toEqual([{ month: SEPT, difference: -10 }]);
      // A closed month never changes: a reason for it now is refused.
      const late = await write(
        month.DifferenceReasonInput,
        month.recordDifferenceReason,
        { locationId: f.S, month: SEPT, productId: f.A, kind: "difference", unexplained: true },
        pharmacist(),
        month.REASON_NEED,
      );
      expect(late.ok).toBe(false);
    });

    it("S36: a downtime entry back-dated into the closed month shows in the next month, labelled; the closed month reads the same", async () => {
      const before = await asWriter((tx) =>
        buildMonth(tx, f.h!, { kind: "location", locationId: f.S! }, SEPT),
      );
      await asWriter(async (tx) =>
        move(tx, {
          hospitalId: f.h!,
          location: await loadLocation(tx, f.h!, f.S!),
          batchId: f.M1!,
          kind: "adjusted",
          quantity: -1,
          reasonCode: "lost",
          sourceKind: "downtime",
          actorUserId: f.head!,
          effectiveAt: at("2026-09-15T09:00:00+03:00"),
          downtime: true,
        }),
      );
      const after = await asWriter((tx) =>
        buildMonth(tx, f.h!, { kind: "location", locationId: f.S! }, SEPT),
      );
      expect(after.closed?.sha256).toBe(before.closed?.sha256);
      expect(after.rows).toEqual(before.rows);
      const oct = await asWriter((tx) =>
        buildMonth(tx, f.h!, { kind: "location", locationId: f.S! }, "2026-10-01"),
      );
      expect(oct.rows.find((r) => r.productId === f.A)?.late).toEqual([
        expect.objectContaining({ belongsTo: SEPT }),
      ]);
      // The snapshot is immutable, the service role included.
      await expect(
        pg.query(
          `UPDATE public.pharmacy_period_snapshots SET sha256 = 'x' WHERE hospital_id = $1`,
          [f.h],
        ),
      ).rejects.toThrow();
    });

    it("S37: the stock status report for the signed tracer list, days out of stock from events; unsigned it does not run", async () => {
      const none = await asWriter((tx) => buildStockStatus(tx, f.h!, SEPT));
      expect(none.missing).toContain("tracer_list");
      expect(
        (await sign("tracer_list", { source: "MoH tracer list (fixture)", medicineIds: [MED] })).r
          .ok,
      ).toBe(true);
      const s = await asWriter((tx) => buildStockStatus(tx, f.h!, SEPT));
      expect(s.missing).toEqual([]);
      const row = s.rows.find((r) => r.medicineId === MED)!;
      expect(row.onHand).toBe(59);
      // Before the first receipt on 2 September the medicine was out at the store: 1 September is a day out.
      expect(row.daysOut).toBe(1);
    });

    it("S47: month end goes live only after a full month with every live location counted at its start and end", async () => {
      const r = await asWriter((tx) => monthEndReadiness(tx, f.h!, new Date()));
      expect(r.met).toBe(false);
      for (const l of [f.S, f.Q, f.W, f.P])
        for (const when of ["2026-08-31T12:00:00+03:00", "2026-09-30T12:00:00+03:00"])
          await pg.query(
            `INSERT INTO public.pharmacy_counts (hospital_id, location_id, scope, counted_by, counted_at) VALUES ($1, $2, 'month_end', $3, $4)`,
            [f.h, l, f.head, when],
          );
      const met = await asWriter((tx) => monthEndReadiness(tx, f.h!, new Date()));
      expect(met).toMatchObject({ met: true, evidence: { month: SEPT } });
    });

    /* ─── Orders ───────────────────────────────────────────────────────── */

    // The review window is the two whole months before the cut's month; every date is in the past.
    const CUT = new Date();
    const w0 = (() => {
      const d = new Date(
        `${new Date(CUT.getTime() + 3 * 3_600_000).toISOString().slice(0, 7)}-01T00:00:00Z`,
      );
      d.setUTCMonth(d.getUTCMonth() - 2);
      return d.toISOString().slice(0, 10);
    })();
    const dayIn = (days: number) =>
      new Date(new Date(`${w0}T09:00:00+03:00`).getTime() + days * 86_400_000);

    it("S39: the proposal equals the hand calculation, with each row's arithmetic; D-PH2-10 different units are not added", async () => {
      expect(
        (
          await sign("order_parameters", {
            cycleMonths: 2,
            maxMonths: 4,
            minMonths: null,
            emergencyOrderPointMonths: "not_kept",
            reviewWindowMonths: 2,
            minHistoryDays: 0,
            unclassedTrimAs: "N",
            budgetSource: null,
          })
        ).r.ok,
      ).toBe(true);
      const b = await receive(f.P!, f.O!, "ORD-1", "2099-12-31", 200, dayIn(-10), "1.00");
      await supply(f.X!, f.O!, b, 30, { at: dayIn(9) });
      await supply(f.X!, f.O!, b, 30, { at: dayIn(40) });
      const p = await asWriter((tx) => buildProposal(tx, f.h!, CUT, [MED_ORDER]));
      expect(p.missing).toEqual([]);
      const line = p.lines.find((l) => l.medicineId === MED_ORDER)!;
      // Hand calculation: 60 used over the window's days, none out → AMC 60 × days ÷ days ÷ 2 = 30 a month.
      // Maximum 30 × 4 = 120; on hand 140 → proposed 0 (never negative).
      expect(line.consumption).toBe(60);
      expect(line.amc).toBe(30);
      expect(line.row.maxStock).toBe(120);
      expect(line.row.inputs.stockOnHand).toBe(140);
      expect(line.row.proposedUnits).toBe(0);
      expect(line.steps.map((s) => s.step)).toContain("Adjusted average monthly consumption");
      expect(line.notAdded).toEqual([
        expect.objectContaining({ productId: f.O2, issueUnit: "bottle" }),
      ]);
      // More used, stock fixed: the proposal grows and is rounded up to whole packs of 100.
      await supply(f.X!, f.O!, b, 100, { at: dayIn(50) });
      const p2 = await asWriter((tx) => buildProposal(tx, f.h!, CUT, [MED_ORDER]));
      const l2 = p2.lines[0]!;
      // 160 used → AMC 80; maximum 320; on hand 40 → 280 → 3 packs = 300.
      expect([
        l2.amc,
        l2.row.maxStock,
        l2.row.inputs.stockOnHand,
        l2.row.proposedPacks,
        l2.row.proposedUnits,
      ]).toEqual([80, 320, 40, 3, 300]);
    });

    it("S42, S43: a saved order is filled by a delivery and still owed updates; nothing is sent anywhere", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch");
      const draft = ok(
        await write(
          orders.ProposalInput,
          orders.saveOrderProposal,
          { kind: "emergency", medicineIds: [MED_ORDER], chosen: [] },
          head(),
          orders.MANAGE_NEED,
          CUT,
        ),
      );
      // Your quantity is required to save.
      const missing = await write(
        orders.SaveOrderInput,
        orders.saveOrder,
        { orderId: draft.id },
        head(),
        orders.MANAGE_NEED,
        CUT,
      );
      expect(missing).toMatchObject({
        ok: false,
        error: expect.stringMatching(/Type your quantity/),
      });
      ok(
        await write(
          orders.ProposalInput,
          orders.saveOrderProposal,
          {
            clientKey: draft.id,
            kind: "emergency",
            medicineIds: [MED_ORDER],
            chosen: [{ productId: f.O, units: 300, reason: "Emergency top-up" }],
          },
          head(),
          orders.MANAGE_NEED,
          CUT,
        ),
      );
      ok(
        await write(
          orders.SaveOrderInput,
          orders.saveOrder,
          { orderId: draft.id },
          head(),
          orders.MANAGE_NEED,
          CUT,
        ),
      );
      const [lineId] = (
        await pg.query<{ id: string }>(
          `SELECT id FROM public.pharmacy_order_lines WHERE order_id = $1`,
          [draft.id],
        )
      ).rows.map((r) => r.id);
      // A delivery against the order, written directly (lane A owns receiving): 120 accepted.
      const supplier = await id(
        `INSERT INTO public.pharmacy_counterparties (hospital_id, kind, name, created_by) VALUES ($1, 'supplier', 'Fixture supplier', $2) RETURNING id`,
        [f.h, f.head],
      );
      const delivery = await id(
        `INSERT INTO public.pharmacy_deliveries (hospital_id, location_id, supplier_id, note_number, order_id, arrived_at, counted_by)
       VALUES ($1, $2, $3, 'DN-1', $4, now(), $5) RETURNING id`,
        [f.h, f.S, supplier, draft.id, f.head],
      );
      await pg.query(
        `INSERT INTO public.pharmacy_delivery_lines (delivery_id, line_no, product_id, order_line_id, note_quantity, accepted_quantity, batch_number, expiry)
       VALUES ($1, 1, $2, $3, 120, 120, 'DEL-1', '2099-12-31')`,
        [delivery, f.O, lineId],
      );
      let [o] = await loadOrders(lane.db, f.h!, draft.id);
      expect(o!.lines[0]).toMatchObject({ ordered: 300, received: 0, owed: 300, state: "open" });
      await pg.query(
        `UPDATE public.pharmacy_deliveries SET state = 'received', finished_at = now(), finished_by = $2 WHERE id = $1`,
        [delivery, f.head],
      );
      [o] = await loadOrders(lane.db, f.h!, draft.id);
      expect(o!.lines[0]).toMatchObject({ received: 120, owed: 180, state: "part_received" });
      expect(o!.status).toBe("part_received");
      const closeLine = await write(
        orders.CloseLineInput,
        orders.closeOrderLine,
        { orderLineId: lineId, reason: "supplier_out" },
        head(),
        orders.MANAGE_NEED,
      );
      expect(closeLine.ok).toBe(true);
      [o] = await loadOrders(lane.db, f.h!, draft.id);
      expect(o!.lines[0]).toMatchObject({ owed: 0, state: "closed" });
      expect(o!.state).toBe("closed");
      expect(fetchSpy).not.toHaveBeenCalled();
      fetchSpy.mockRestore();
      f.order = draft.id;
    });

    it("S47: ordering goes live only after a cycle's paper comparison with every difference explained", async () => {
      expect((await asWriter((tx) => orderingReadiness(tx, f.h!))).met).toBe(false);
      const unexplained = await write(
        orders.PaperComparisonInput,
        orders.recordPaperOrderComparison,
        { orderId: f.order, lines: [{ productId: f.O, paperUnits: 200 }] },
        head(),
        orders.MANAGE_NEED,
      );
      expect(unexplained.ok).toBe(true);
      expect(await asWriter((tx) => orderingReadiness(tx, f.h!))).toMatchObject({
        met: false,
        action: "explain_differences",
      });
      await write(
        orders.PaperComparisonInput,
        orders.recordPaperOrderComparison,
        {
          orderId: f.order,
          lines: [
            {
              productId: f.O,
              paperUnits: 200,
              explanation: "Paper used last cycle's consumption.",
            },
          ],
        },
        head(),
        orders.MANAGE_NEED,
      );
      expect((await asWriter((tx) => orderingReadiness(tx, f.h!))).met).toBe(true);
    });
  },
);
