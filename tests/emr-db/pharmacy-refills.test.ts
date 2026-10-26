/**
 * Pharmacy Phase 4, Step 5 (S15–S24): refills at the hospital on the PGlite lane. Drives lib/pharmacy/refill-store.ts
 * through `runPharmacyWrite` (the action's own path) and the patient's own transaction, and reads back through
 * lib/pharmacy/refill-read.ts. Every pack value, medicine, batch, quantity and date of birth is a fixture.
 */
import { randomUUID } from "node:crypto";
import type { Lane, Pg } from "./_pglite";
import type { PharmacyActor, PharmacyCtx, PharmacyNeed } from "@/lib/pharmacy/write";
import type { z } from "zod";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { asClinicalWriter } from "@/lib/emr/db";
import { encrypt, generateKey } from "@/lib/encryption";
import { PHARMACY_MAP_V2, pharmacyDispensingAccess } from "@/lib/pharmacy/access";
import { localDate } from "@/lib/pharmacy/stock/ledger";
import { addDays } from "@/lib/pharmacy/stores/ledger";
import { balancesAt } from "@/lib/pharmacy/stores/write";
import { runPharmacyWrite } from "@/lib/pharmacy/write";
import { bootLane, department, hospital, laneOn, patient, staff } from "./_pglite";

vi.mock("server-only", () => ({}));
const held = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("@/db", () => ({
  get db() {
    return held.db;
  },
}));

const refills = await import("@/lib/pharmacy/refill-store");
const read = await import("@/lib/pharmacy/refill-read");
const supply = await import("@/lib/pharmacy/supply/store");

const DAY = 86_400_000;
const env = { ...process.env };

describe.skipIf(!laneOn)("refills at the hospital (Phase 4 Step 5, S15–S24)", () => {
  let lane: Lane;
  let pg: Pg;
  const f = {} as Record<string, string>;
  const one = async <T = { id: string }>(q: string, p?: unknown[]) =>
    (await pg.query<T>(q, p)).rows[0] as T;
  const rows = async <T = Record<string, unknown>>(q: string, p?: unknown[]) =>
    (await pg.query<T>(q, p)).rows;

  const pharmacist = (): PharmacyActor => ({
    userId: f.pharmacist!,
    hospitalId: f.h!,
    cadreCode: "PHARMACIST",
    cadreName: "Pharmacist",
    pointId: f.point!,
    access: pharmacyDispensingAccess("PHARMACIST", PHARMACY_MAP_V2),
  });
  const run = <I, R extends { id: string }>(
    need: PharmacyNeed,
    schema: z.ZodType<I>,
    write: (ctx: PharmacyCtx, input: I) => Promise<R>,
    raw: Record<string, unknown>,
    now = new Date(),
  ) =>
    runPharmacyWrite(schema, { clientKey: randomUUID(), ...raw }, pharmacist(), need, write, {
      database: lane.db,
      now,
    });
  const at = (days: number) => new Date(Date.now() + days * DAY);

  const sign = (kind: string, content: unknown) =>
    pg.query(
      `INSERT INTO public.pharmacy_signed_sets (hospital_id, kind, version, content, sha256, status, authored_by,
         first_signer, second_signer, signed_at)
       VALUES ($1, $2, 1, $3::jsonb, repeat('d', 64), 'signed', $4, $4, $5, now())`,
      [f.h, kind, JSON.stringify(content), f.pharmacist, f.doctor],
    );
  let batchNo = 0;
  const batch = async (qty: number, expiry = "2099-03-31") => {
    batchNo += 1;
    const id = (
      await one(
        `INSERT INTO public.pharmacy_batches (hospital_id, dispensing_point_id, product_id, batch_number, expiry,
           first_batch_number, first_expiry, created_by)
         VALUES ($1, $2, $3, $4, $5, $4, $5, $6) RETURNING id`,
        [f.h, f.point, f.product, `RF-${batchNo}`, expiry, f.pharmacist],
      )
    ).id;
    await pg.query(
      `INSERT INTO public.pharmacy_stock_movements (hospital_id, dispensing_point_id, batch_id, kind, quantity,
         effective_at, actor_user_id, source_kind) VALUES ($1, $2, $3, 'received', $4, now() - interval '300 days', $5, 'delivery')`,
      [f.h, f.point, id, qty, f.pharmacist],
    );
    return id;
  };

  /** A line with repeats, and its first supply `daysAgo` days ago (written as Phase 1 writes it). */
  const lineWithRepeats = async (
    o: { n?: number; d?: number; daysAgo?: number; days?: number } = {},
  ) => {
    const p = f.patient!;
    const rx = (
      await one(
        `INSERT INTO public.prescriptions (hospital_id, patient_user_id, prescriber_user_id, prescriber_cadre, drug_id,
           drug_name, dose, route, frequency, is_emergency, state, placement_id, created_at, updated_at)
         VALUES ($1, $2, $3, 'MEDICAL_OFFICER', 'fixture_a', 'Fixture medicine A', '[fixture dose]', 'oral',
                 '[fixture frequency]', false, 'active', gen_random_uuid(), now() - interval '200 days', now() - interval '200 days')
         RETURNING id`,
        [f.h, p, f.doctor],
      )
    ).id;
    await pg.query(
      `INSERT INTO public.prescription_repeat_authorisations (hospital_id, patient_user_id, prescription_id,
         further_supplies, min_interval_days, not_after, rule_version, prescriber_user_id, prescriber_cadre)
       VALUES ($1, $2, $3, $4, $5, current_date + 300, 1, $6, 'MEDICAL_OFFICER')`,
      [f.h, p, rx, o.n ?? 2, o.d ?? 28, f.doctor],
    );
    const when = new Date(Date.now() - (o.daysAgo ?? 30) * DAY).toISOString();
    const handover = (
      await one(
        `INSERT INTO public.pharmacy_handovers (hospital_id, dispensing_point_id, patient_user_id, collector,
           identity_route, second_identifier, label_mode, payment_status, actor_user_id, actor_cadre, client_key,
           supplied_at, entered_at)
         VALUES ($1, $2, $3, 'patient', 'two_identifiers', 'date_of_birth', 'printed', 'paid', $4, 'Pharmacist', $5, $6, $6)
         RETURNING id`,
        [f.h, f.point, p, f.pharmacist, `first-${randomUUID()}`, when],
      )
    ).id;
    // Law 3 checks the supply and its movement at commit: one transaction.
    await pg.transaction(async (t) => {
      const supplyId = (
        await t.query<{ id: string }>(
          `INSERT INTO public.pharmacy_supplies (handover_id, hospital_id, dispensing_point_id, supplying_hospital_id,
           patient_user_id, prescription_id, product_id, batch_id, quantity, issue_unit, days_covered, supplied_at)
         VALUES ($1, $2, $3, $2, $4, $5, $6, $7, 28, 'tablet', $8, $9) RETURNING id`,
          [handover, f.h, f.point, p, rx, f.product, f.firstBatch, o.days ?? 28, when],
        )
      ).rows[0]!.id;
      await t.query(
        `INSERT INTO public.pharmacy_stock_movements (hospital_id, dispensing_point_id, batch_id, kind, quantity,
         effective_at, actor_user_id, source_kind, source_id) VALUES ($1, $2, $3, 'supplied', -28, $4, $5, 'supply', $6)`,
        [f.h, f.point, f.firstBatch, when, f.pharmacist, supplyId],
      );
    });
    return rx;
  };

  const askApp = (
    lineIds: string[],
    o: { collectorId?: string; now?: Date; clientKey?: string } = {},
  ) =>
    asClinicalWriter(
      { userId: f.patient!, hospitalId: f.h! },
      (tx) =>
        refills.requestRefill(
          { tx, hospitalId: f.h!, userId: f.patient!, cadre: null, now: o.now ?? new Date() },
          refills.RequestRefillInput.parse({
            clientKey: o.clientKey ?? randomUUID(),
            patientUserId: f.patient,
            lineIds,
            collector: o.collectorId
              ? { kind: "named", collectorId: o.collectorId }
              : { kind: "self" },
            pointId: f.point,
          }),
          "app",
        ),
      lane.db,
    );
  const askWindow = (lineIds: string[], now = new Date()) =>
    run(
      refills.DISPENSE_POINT,
      refills.RequestRefillInput,
      (ctx, input) => refills.requestRefill(refills.writerOf(ctx), input, "window"),
      { patientUserId: f.patient, lineIds, collector: { kind: "self" }, pointId: f.point },
      now,
    );
  const lineOf = async (requestId: string) =>
    one<{
      id: string;
      status_at_request: string;
      instance_id: string | null;
      renewal_id: string | null;
    }>(
      `SELECT id, status_at_request, instance_id, renewal_id FROM public.pharmacy_refill_request_lines WHERE request_id = $1`,
      [requestId],
    );
  const setAside = (lineId: string, quantity = 28, now = new Date()) =>
    run(
      refills.DISPENSE_POINT,
      refills.SetAsideInput,
      refills.setAsideRefill,
      { lineId, productId: f.product, quantity },
      now,
    );
  const handOver = async (lineId: string, rx: string, now = new Date()) => {
    const clientKey = randomUUID();
    const id = await run(
      supply.DISPENSE_LIVE,
      supply.IdentifierInput,
      supply.checkSecondIdentifier,
      { clientKey, lineId: rx, kind: "date_of_birth", typed: "01/07/1988" },
      now,
    );
    expect(id.ok && id.data?.result).toBe("match");
    return run(
      refills.DISPENSE_POINT,
      refills.HandOverInput,
      refills.handOverPrepared,
      {
        clientKey,
        lineIds: [lineId],
        identity: { route: "two_identifiers", nameAttested: true },
        payment: { status: "paid" },
      },
      now,
    );
  };
  const board = (now = new Date()) => read.refillBoard(lane.db, f.h!, now);
  const prepared = async () => {
    const place = await one(
      `SELECT id FROM public.pharmacy_locations WHERE hospital_id = $1 AND kind = 'prepared' AND department_id = $2`,
      [f.h, f.point],
    );
    return asClinicalWriter(
      { userId: f.pharmacist!, hospitalId: f.h! },
      (tx) => balancesAt(tx, place.id),
      lane.db,
    );
  };
  const atPoint = () =>
    asClinicalWriter(
      { userId: f.pharmacist!, hospitalId: f.h! },
      (tx) => balancesAt(tx, f.point!),
      lane.db,
    );
  const sum = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0);

  beforeAll(async () => {
    process.env.MEDSYNC_PHI_KEY ??= generateKey();
    process.env.PHARMACY_WORKSPACE = "1";
    process.env.PHARMACY_RECALL = "1";
    lane = await bootLane();
    pg = lane.pg;
    held.db = lane.db;
    f.h = await hospital(pg, "Refills");
    const pharm = (
      await one(
        `INSERT INTO public.hospital_departments (hospital_id, name, slug, kind, catalogue_code)
         VALUES ($1, 'Pharmacy', $2, 'support', 'PHARMACY') RETURNING id`,
        [f.h, `ph-${Date.now()}`],
      )
    ).id;
    f.point = (
      await one(
        `INSERT INTO public.hospital_departments (hospital_id, parent_id, name, slug, kind)
         VALUES ($1, $2, 'Fixture point A', $3, 'support') RETURNING id`,
        [f.h, pharm, `pt-${Date.now()}`],
      )
    ).id;
    await pg.query(
      `INSERT INTO public.pharmacy_dispensing_points (department_id, hospital_id, serves, live_at, phone)
       VALUES ($1, $2, 'window', now() - interval '300 days', '+256 700 000000')`,
      [f.point, f.h],
    );
    const clinic = await department(pg, f.h, "Clinic");
    f.pharmacist = (
      await staff(pg, { hospitalId: f.h, departmentId: pharm, cadre: "PHARMACIST" })
    ).userId;
    f.doctor = (
      await staff(pg, { hospitalId: f.h, departmentId: clinic, cadre: "MEDICAL_OFFICER" })
    ).userId;
    await pg.query(
      `INSERT INTO public.pharmacy_hospital_settings (hospital_id, updated_by) VALUES ($1, $2)`,
      [f.h, f.pharmacist],
    );
    f.patient = await patient(pg);
    await pg.query(
      `INSERT INTO public.patient_profiles (id, first_name_encrypted, surname_encrypted, sex, date_of_birth, id_type,
         phone_encrypted, district_id)
       VALUES ($1, $2, $3, 'female', '1988-07-01', 'none', $4, (SELECT id FROM public.districts LIMIT 1))`,
      [f.patient, encrypt("Fixture"), encrypt("Patient"), encrypt("0700000000")],
    );
    f.product = (
      await one(
        `INSERT INTO public.pharmacy_products (hospital_id, medicine_id, name, issue_unit, created_by)
         VALUES ($1, 'fixture_a', 'Fixture tablet A', 'tablet', $2) RETURNING id`,
        [f.h, f.pharmacist],
      )
    ).id;
    await pg.query(
      `INSERT INTO public.pharmacy_product_points (product_id, dispensing_point_id, hospital_id) VALUES ($1, $2, $3)`,
      [f.product, f.point, f.h],
    );
    f.firstBatch = await batch(5000);
    await sign("repeat_rules", {
      repeatList: ["fixture_a"],
      neverRepeat: [],
      maxSupplies: 5,
      maxPeriodDays: 365,
      minIntervalDays: 7,
      toleranceDays: 2,
    });
    await sign("hold_rules", {
      holdDays: 7,
      extensions: 1,
      holdLongerMaxDays: 21,
      missThreshold: 2,
    });
    await sign("refill_timing", { requestWindowDays: 5, lateWindowDays: 7 });
  }, 180_000);
  afterAll(() => {
    process.env = env;
  });

  it("S15, S22b: an allowed refill opens one instance, however many channels ask", async () => {
    const rx = await lineWithRepeats();
    const r = await askApp([rx]);
    const l = await lineOf(r.id);
    expect(l).toMatchObject({ status_at_request: "allowed", renewal_id: null });
    expect(l.instance_id).not.toBeNull();
    const w = await askWindow([rx]);
    expect(w.ok).toBe(true);
    expect((await lineOf(w.ok ? w.id : "")).instance_id).toBe(l.instance_id);
    expect(
      await rows(`SELECT 1 FROM public.pharmacy_repeat_instances WHERE prescription_id = $1`, [rx]),
    ).toHaveLength(1);
    expect((await board()).filter((b) => b.prescriptionId === rx).map((b) => b.tab)).toEqual([
      "to_prepare",
      "to_prepare",
    ]);
  });

  it("S16, S22c, S17, S18: set aside, held off the shelf, ready for the patient, handed to the named collector", async () => {
    const rx = await lineWithRepeats();
    const collector = await asClinicalWriter(
      { userId: f.patient!, hospitalId: f.h! },
      (tx) =>
        refills.saveCollector(
          { tx, hospitalId: f.h!, userId: f.patient!, cadre: null, now: new Date() },
          f.patient!,
          {
            name: "Fixture Collector",
            relationship: "Sister",
          },
        ),
      lane.db,
    );
    const r = await askApp([rx], { collectorId: collector.id });
    const line = await lineOf(r.id);
    const shelf = sum(await atPoint());
    const s = await setAside(line.id, 28);
    expect(s.ok).toBe(true);
    // S22c: the held units are in another place; the point's own balance (what a count compares) excludes them.
    expect(sum(await atPoint())).toBe(shelf - 28);
    expect(sum(await prepared())).toBeGreaterThanOrEqual(28);
    const row = (await board()).find((b) => b.lineId === line.id)!;
    expect(row).toMatchObject({ tab: "prepared", heldUntil: addDays(localDate(new Date()), 7) });
    expect(row.collector).toBe("Fixture Collector (Sister)");
    // S17: the patient's page says where and until when.
    const mine = await read.patientRefills(lane.db, f.patient!, new Date());
    expect(mine.repeats.find((m) => m.prescriptionId === rx)?.request).toMatch(
      /^Ready to collect at Fixture point A, until /,
    );
    // S18
    const h = await handOver(line.id, rx);
    expect(h.ok).toBe(true);
    expect(
      await one(
        `SELECT collector, collector_name, identity_route FROM public.pharmacy_handovers WHERE id = $1`,
        [h.ok ? h.id : ""],
      ),
    ).toEqual({
      collector: "representative",
      collector_name: "Fixture Collector",
      identity_route: "two_identifiers",
    });
    expect(
      await rows(
        `SELECT kind FROM public.pharmacy_repeat_instance_events WHERE instance_id = $1 AND kind = 'supplied'`,
        [line.instance_id],
      ),
    ).toHaveLength(1);
    expect((await board()).find((b) => b.lineId === line.id)?.tab).toBe("collected");
  });

  it("S21: a third supply on two repeats goes to the clinic", async () => {
    // The ledger takes no future movement: the story runs in the past, ending today.
    const rx = await lineWithRepeats({ n: 2, d: 28, daysAgo: 130 });
    for (const days of [-100, -70]) {
      const r = await askApp([rx], { now: at(days) });
      const l = await lineOf(r.id);
      expect(l.status_at_request).toBe("allowed");
      expect((await setAside(l.id, 28, at(days))).ok).toBe(true);
      expect((await handOver(l.id, rx, at(days))).ok).toBe(true);
    }
    // S21: both repeats used, a month later: a renewal request, no instance (RP-6 checks "none left" first).
    const third = await lineOf((await askApp([rx], { now: at(-38) })).id);
    expect(third).toMatchObject({ status_at_request: "none_left", instance_id: null });
    expect(
      await one(`SELECT reason, asked_by FROM public.prescription_renewal_requests WHERE id = $1`, [
        third.renewal_id,
      ]),
    ).toEqual({ reason: "none_left", asked_by: "patient" });
  });

  it("S22: asked before the interval is listed for the clinic with the date, and never prepared", async () => {
    const rx = await lineWithRepeats({ daysAgo: 10 });
    const early = await lineOf((await askApp([rx])).id);
    expect(early).toMatchObject({
      status_at_request: "too_early",
      instance_id: null,
      renewal_id: null,
    });
    expect((await setAside(early.id, 28)).ok).toBe(false);
    const row = (await board()).find((b) => b.lineId === early.id)!;
    expect(row.tab).toBe("needs_clinic");
    expect(row.timing.early).toMatch(/^Early: possible from /);
  });

  it("S19: asked well after the refill date is labelled late and still prepared", async () => {
    const rx = await lineWithRepeats({ daysAgo: 50, days: 28 });
    const r = await askApp([rx]);
    const row = (await board()).find((b) => b.requestId === r.id)!;
    expect(row).toMatchObject({ tab: "to_prepare", timing: { early: null, late: true } });
    expect(row.lastSupply).toMatch(/22 days after it was due$/);
  });

  it("S20: past its date it is listed as not collected; Release returns it; a released refill is not handed over", async () => {
    const rx = await lineWithRepeats({ daysAgo: 60 });
    const l = await lineOf((await askApp([rx], { now: at(-10) })).id);
    expect((await setAside(l.id, 28, at(-10))).ok).toBe(true);
    const shelf = sum(await atPoint());
    expect((await board()).find((b) => b.lineId === l.id)?.tab).toBe("not_collected");
    const rel = await run(refills.DISPENSE_POINT, refills.ReleaseInput, refills.releasePrepared, {
      lineId: l.id,
      reasonCode: "not_collected",
    });
    expect(rel.ok).toBe(true);
    expect(sum(await atPoint())).toBe(shelf + 28);
    expect((await handOver(l.id, rx)).ok).toBe(false);
    // The instance ended unsupplied: the patient may ask again.
    expect((await lineOf((await askApp([rx])).id)).status_at_request).toBe("allowed");
  });

  it("S22a: a refill split across two batches uses one repeat", async () => {
    const rx = await lineWithRepeats({ n: 3 });
    // A short batch that expires first is taken first (FEFO), then the long one.
    await batch(10, "2098-01-31");
    const l = await lineOf((await askApp([rx])).id);
    expect((await setAside(l.id, 28)).ok).toBe(true);
    const h = await handOver(l.id, rx);
    expect(h.ok).toBe(true);
    const supplies = await rows(
      `SELECT batch_id FROM public.pharmacy_supplies WHERE handover_id = $1`,
      [h.ok ? h.id : ""],
    );
    expect(supplies.length).toBe(2);
    expect(
      await rows(
        `SELECT 1 FROM public.pharmacy_repeat_instance_events WHERE instance_id = $1 AND kind = 'supplied'`,
        [l.instance_id],
      ),
    ).toHaveLength(1);
  });

  it("S22d: a prepared refill whose repeats are stopped stays listed for release and is not handed over", async () => {
    const rx = await lineWithRepeats();
    const l = await lineOf((await askApp([rx])).id);
    await setAside(l.id, 28);
    await pg.query(
      `INSERT INTO public.prescription_repeat_events (authorisation_id, hospital_id, kind, reason, actor_user_id)
       SELECT id, hospital_id, 'stopped', 'Fixture reason', $2 FROM public.prescription_repeat_authorisations WHERE prescription_id = $1`,
      [rx, f.doctor],
    );
    expect((await board()).find((b) => b.lineId === l.id)?.tab).toBe("prepared");
    const h = await handOver(l.id, rx);
    expect(h.ok).toBe(false);
    if (!h.ok) expect(h.error).toContain("stopped or changed");
  });

  it("S23: a stewardship review asking for a stop sends the refill to the clinic", async () => {
    const rx = await lineWithRepeats();
    await pg.query(
      `INSERT INTO public.pharmacy_ams_reviews (hospital_id, patient_user_id, prescription_id, answer, reason, actor_user_id)
       VALUES ($1, $2, $3, 'stop', 'Fixture reason', $4)`,
      [f.h, f.patient, rx, f.pharmacist],
    );
    const l = await lineOf((await askApp([rx])).id);
    expect(l.status_at_request).toBe("blocked");
    expect(
      await one(
        `SELECT reason, blocked_reason FROM public.prescription_renewal_requests WHERE id = $1`,
        [l.renewal_id],
      ),
    ).toEqual({ reason: "blocked", blocked_reason: "stewardship_review" });
  });

  it("S24: a recall of a held batch blocks the hand-over", async () => {
    const rx = await lineWithRepeats();
    const l = await lineOf((await askApp([rx])).id);
    await setAside(l.id, 28);
    await pg.query(
      `INSERT INTO public.pharmacy_recalls (hospital_id, product_id, batch_number, source, notice_ref, notice_date,
         stated_class, level, instructions, started_by)
       VALUES ($1, $2, NULL, 'supplier', 'FX-NOTICE', current_date, 'not_stated', 'Fixture level', 'Fixture instructions', $3)`,
      [f.h, f.product, f.pharmacist],
    );
    const h = await handOver(l.id, rx);
    expect(h.ok).toBe(false);
    await pg.query(
      `UPDATE public.pharmacy_recalls SET closed_at = now(), closed_by = $2, returned_quantity = 0, destroyed_quantity = 0 WHERE hospital_id = $1`,
      [f.h, f.pharmacist],
    );
  });
});
