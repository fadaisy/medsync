/**
 * Lab Phase 3, Step 4: stock, lots and acceptance on the PGlite lane (S1–S10). Every item, lot, quantity,
 * criterion, value and date is a FIXTURE, never a clinical or operational default. Runs with EMR_PGLITE=1.
 */
import { randomUUID } from "node:crypto";
import type { Lane, Pg } from "./_pglite";
import type { EmrActor } from "@/lib/emr/actor";
import type { DeliveryLineInput } from "@/lib/lab/stock-store";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { withPatientWrite } from "@/lib/emr/write/context";
import { encrypt, generateKey } from "@/lib/encryption";
import {
  recordBedsideResult,
  registerDevice,
  setDeviceState,
  setOperator,
} from "@/lib/lab/bedside-store";
import { saveMeasure } from "@/lib/lab/measures-setup";
import { loadStock } from "@/lib/lab/stock-read";
import {
  acceptLot,
  grandfatherLots,
  issueStock,
  quarantineLot,
  receiveDelivery,
  recordCount,
  rejectLot,
  saveItem,
  setLotInUse,
  setQualitySettings,
} from "@/lib/lab/stock-store";
import { DEFAULT_TIME_ZONE, localDateKey } from "@/supabase/functions/_shared/slots";
import {
  bootLane,
  clinician,
  department,
  encounter,
  hospital,
  intake,
  laneOn,
  patient,
} from "./_pglite";

const key = () => `k-${randomUUID()}`;
const CAP = "test.capillary_glucose";
const FLAGS = ["LAB_WORKSPACE", "LAB_STOCK", "LAB_BEDSIDE", "LAB_UNITS_RANGES", "LAB_CATALOGUE_V2"];
/** FIXTURE lot-comparison criterion and sample count (never a default). */
const FX_CRITERION = { absolute: 10, percent: 5, combine: "larger" as const };
const FX_SAMPLES = 5;
const today = () => localDateKey(new Date(), DEFAULT_TIME_ZONE);
const plusDays = (n: number) => {
  const d = new Date(`${today()}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

describe.skipIf(!laneOn)("Lab Phase 3 stock, lots and acceptance (Step 4)", () => {
  let lane: Lane;
  let pg: Pg;
  let h: string;
  let lead: { userId: string; hospitalId: string };
  let nurse: EmrActor;
  let p: string;
  let enc: string;
  let meter: string;
  let analyser: string;
  const env = { ...process.env };
  const tx = <T>(fn: (t: Parameters<Parameters<Lane["db"]["transaction"]>[0]>[0]) => Promise<T>) =>
    lane.db.transaction(fn);
  const one = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
    (await pg.query<T>(sql, params)).rows[0] as T;
  const item = (o: Partial<Parameters<typeof saveItem>[2]> & { name: string }) =>
    tx((t) =>
      saveItem(
        t,
        lead,
        {
          kind: "reagent",
          unitOfIssue: "box",
          packSize: null,
          testsPerUnit: null,
          testCodes: [],
          conceptIds: [],
          hmisTracerCode: null,
          storageDeviceId: null,
          minMonths: null,
          maxMonths: null,
          ...o,
        },
        new Date(),
      ),
    );
  /** A signed acceptance plan (lead-only kind), FIXTURE payload. */
  const plan = (itemId: string, payload: Record<string, unknown>) =>
    pg.query(
      `INSERT INTO lab_signed_configs (hospital_id, kind, key, version, status, payload, authored_by, lead_signed_by,
         lead_signed_at, in_force_from)
       VALUES ($1, 'acceptance_plan', $2, 1, 'signed', $3, $4, $4, now(), '2020-01-01T00:00:00Z')`,
      [
        h,
        itemId,
        JSON.stringify({ certificateAllowed: false, source: "Fixture plan", ...payload }),
        lead.userId,
      ],
    );
  const line = (
    itemId: string,
    lot: string,
    o: Partial<DeliveryLineInput> = {},
  ): DeliveryLineInput => ({
    itemId,
    lot,
    useBy: "2099-12-31",
    received: 10,
    rejected: 0,
    condition: { sealed: true, coldChain: true, note: null },
    ...o,
  });
  const receive = (lines: DeliveryLineInput[], at = new Date()) =>
    tx((t) =>
      receiveDelivery(
        t,
        lead,
        {
          supplier: "nms",
          supplierName: null,
          noteNumber: "FX-DN-1",
          receivedAt: at,
          lines,
          clientKey: key(),
        },
        at,
      ),
    );
  const lotIdOf = async (itemId: string, lot: string) =>
    (
      await one<{ id: string }>(`SELECT id FROM lab_stock_lots WHERE item_id = $1 AND lot = $2`, [
        itemId,
        lot,
      ])
    ).id;
  const stateOf = async (lotId: string) =>
    (await one<{ state: string }>(`SELECT state FROM lab_stock_lots WHERE id = $1`, [lotId])).state;
  const onHandOf = async (lotId: string) =>
    Number(
      (
        await one<{ n: string }>(
          `SELECT coalesce(sum(quantity),0) AS n FROM lab_stock_transactions WHERE lot_id = $1`,
          [lotId],
        )
      ).n,
    );
  const pairs = (diffs: number[]) =>
    diffs.map((d, i) => ({
      observationId: randomUUID(),
      level: i < 2 ? "low" : "high",
      current: 100,
      candidate: 100 + d,
    }));
  const bedside = (o: { lotId: string; measuredAt?: Date }) =>
    withPatientWrite(
      nurse,
      p,
      (ctx) =>
        recordBedsideResult(ctx, {
          patientUserId: p,
          encounterId: enc,
          testCode: CAP,
          deviceId: meter,
          lotId: o.lotId,
          wardId: null,
          measuredAt: o.measuredAt ?? new Date(Date.now() - 60_000),
          fasting: true,
          values: [{ conceptId: "obs.glucose", value: "6.5" }],
          clientKey: key(),
        }),
      { database: lane.db },
    );

  beforeAll(async () => {
    process.env.MEDSYNC_PHI_KEY ??= generateKey();
    for (const k of FLAGS) process.env[k] = "1";
    lane = await bootLane();
    pg = lane.pg;
    h = await hospital(pg, "Stock");
    const ward = await department(pg, h, "Ward");
    nurse = {
      ...(await clinician(pg, { hospitalId: h, departmentId: ward, cadre: "NURSE" })),
      fullName: null,
      hospitalId: h,
      departmentId: ward,
      cadreCode: "NURSE",
      isClinical: true,
      surface: "nurse",
    };
    const doc = await clinician(pg, {
      hospitalId: h,
      departmentId: ward,
      cadre: "MEDICAL_OFFICER",
    });
    lead = {
      userId: (
        await clinician(pg, { hospitalId: h, departmentId: ward, cadre: "LAB_TECHNOLOGIST" })
      ).userId,
      hospitalId: h,
    };
    p = await patient(pg);
    await pg.query(
      `INSERT INTO public.patient_profiles (id, first_name_encrypted, surname_encrypted, sex, date_of_birth, id_type, phone_encrypted, district_id)
       VALUES ($1, $2, $3, 'female', '1980-01-01', 'none', $4, (SELECT id FROM public.districts LIMIT 1))`,
      [p, encrypt("Fixture"), encrypt("Patient"), encrypt("0700000000")],
    );
    await intake(pg, { hospitalId: h, patientUserId: p });
    enc = await encounter(pg, {
      hospitalId: h,
      patientUserId: p,
      clinicianUserId: doc.userId,
      departmentId: ward,
    });
    await pg.query(
      `INSERT INTO lab_signed_configs (hospital_id, kind, key, version, status, payload, authored_by, lead_signed_by, lead_signed_at,
         cso_signed_by, cso_signed_at, in_force_from)
       VALUES (NULL, 'addendum', 'cfc-1.6.0', 1, 'signed', '{"hash":"${"e".repeat(64)}"}', $1, $1, now(), $2, now(), now())`,
      [lead.userId, doc.userId],
    );
    const capId = (
      await one<{ id: string }>(
        `SELECT id FROM test_catalogue WHERE code = $1 AND hospital_id IS NULL`,
        [CAP],
      )
    ).id;
    for (const c of ["obs.glucose", "obs.glucose_fasting"])
      await tx((t) =>
        saveMeasure(
          t,
          lead,
          {
            testId: capId,
            conceptId: c,
            draft: {
              resultType: "number",
              unitUcum: "mmol/L",
              unitDisplay: "mmol/L",
              decimalPlaces: 1,
              loincCode: null,
              entryCheckLow: null,
              entryCheckHigh: null,
            },
          },
          new Date(),
        ),
      );
    meter = await tx((t) =>
      registerDevice(t, lead, {
        kind: "glucometer",
        model: "Fixture meter",
        serial: "FX-1",
        testCode: CAP,
        wardId: null,
      }),
    );
    await tx((t) =>
      setDeviceState(
        t,
        lead,
        { deviceId: meter, state: "in_use", note: "Fixture: verified" },
        new Date(),
      ),
    );
    await tx((t) => setOperator(t, lead, { userId: nurse.userId, granted: true }, new Date()));
    analyser = (
      await one<{ id: string }>(
        `INSERT INTO devices (hospital_id, kind, model) VALUES ($1, 'analyser', 'Fixture chemistry analyser') RETURNING id`,
        [h],
      )
    ).id;
  }, 300_000);
  afterAll(() => {
    for (const k of FLAGS) process.env[k] = env[k];
  });

  it("S1: a 10-line delivery with 2 damaged packs: only accepted quantities enter stock; rejects are on the supplier's line (timed)", async () => {
    const consumable = await item({ name: "Fixture gloves", kind: "consumable" });
    await plan(consumable, { method: "none", triggers: [] });
    const lines = Array.from({ length: 10 }, (_, i) =>
      line(
        consumable,
        `FX-G-${i}`,
        i === 3
          ? {
              received: 10,
              rejected: 2,
              condition: { sealed: false, coldChain: null, note: "2 packs crushed" },
            }
          : {},
      ),
    );
    const t0 = performance.now();
    const deliveryId = await receive(lines);
    const ms = performance.now() - t0;
    console.warn(`S1 receiveDelivery, 10 lines: ${ms.toFixed(0)} ms (PGlite, in process)`);
    expect(ms).toBeLessThan(800); // §11 server budget, p95 < 800 ms
    const d = await one<{
      lines: { rejected: number; accepted: number; next: string }[];
      supplier: string;
    }>(`SELECT lines, supplier FROM lab_deliveries WHERE id = $1`, [deliveryId]);
    expect(d.supplier).toBe("nms");
    expect(d.lines[3]).toMatchObject({ received: 10, accepted: 8, rejected: 2 });
    expect(d.lines.every((l) => l.next === "none")).toBe(true);
    expect(await onHandOf(await lotIdOf(consumable, "FX-G-3"))).toBe(8);
    expect(await onHandOf(await lotIdOf(consumable, "FX-G-0"))).toBe(10);
    // A plan of "none" accepts on arrival.
    expect(await stateOf(await lotIdOf(consumable, "FX-G-0"))).toBe("accepted");
    const total = await one<{ n: string }>(
      `SELECT sum(quantity) AS n FROM lab_stock_transactions WHERE delivery_id = $1`,
      [deliveryId],
    );
    expect(Number(total.n)).toBe(98);
  });

  it("Law 8: a lot of an item with no acceptance plan waits, and says so", async () => {
    const noPlan = await item({ name: "Fixture stain, no plan", kind: "stain" });
    const id = await receive([line(noPlan, "FX-NP-1")]);
    const d = await one<{ lines: { next: string }[] }>(
      `SELECT lines FROM lab_deliveries WHERE id = $1`,
      [id],
    );
    expect(d.lines[0]!.next).toBe("no_plan");
    const lot = await lotIdOf(noPlan, "FX-NP-1");
    expect(await stateOf(lot)).toBe("received");
    await expect(
      tx((t) =>
        acceptLot(t, lead, { lotId: lot, pairs: [], qcIds: [], certificate: null }, new Date()),
      ),
    ).rejects.toThrow(/no signed acceptance plan/);
  });

  let creat: string;
  it("S2: a new creatinine reagent lot cannot be set in use until accepted; comparison within and QC passing accept it", async () => {
    creat = await item({ name: "Fixture creatinine reagent", conceptIds: ["obs.creatinine"] });
    await plan(creat, {
      method: "lot_comparison",
      triggers: ["new_lot"],
      comparison: {
        samples: FX_SAMPLES,
        spread: "Fixture: across the range",
        criterion: FX_CRITERION,
        qcAlso: true,
      },
    });
    const id = await receive([line(creat, "FX-CR-NEW")]);
    const d = await one<{ lines: { next: string }[] }>(
      `SELECT lines FROM lab_deliveries WHERE id = $1`,
      [id],
    );
    expect(d.lines[0]!.next).toBe("acceptance");
    const lot = await lotIdOf(creat, "FX-CR-NEW");
    expect(await stateOf(lot)).toBe("in_acceptance");
    const inUse = () =>
      tx((t) =>
        setLotInUse(
          t,
          lead,
          {
            lotId: lot,
            deviceId: analyser,
            sectionId: null,
            conceptId: "obs.creatinine",
            kind: "reagent",
          },
          new Date(),
        ),
      );
    await expect(inUse()).rejects.toThrow(/has not been accepted yet/);
    // Within on every sample, but QC on the new lot not recorded: not met yet.
    await expect(
      tx((t) =>
        acceptLot(
          t,
          lead,
          { lotId: lot, pairs: pairs([2, -3, 4, 1, 0]), qcIds: [], certificate: null },
          new Date(),
        ),
      ),
    ).rejects.toThrow(/not met yet/);
    // An accepted QC run on the new lot (FIXTURE run; QC itself is Step 6).
    const qcPlan = (
      await one<{ id: string }>(
        `INSERT INTO lab_signed_configs (hospital_id, kind, key, version, payload, authored_by) VALUES ($1, 'qc_plan', $2, 1, '{}', $3) RETURNING id`,
        [h, `${analyser}:obs.creatinine`, lead.userId],
      )
    ).id;
    const run = (
      await one<{ id: string }>(
        `INSERT INTO lab_qc_runs (hospital_id, device_id, concept_id, plan_config_id, plan_version, "values", decision, run_at, recorded_by)
         VALUES ($1, $2, 'obs.creatinine', $3, 1, '[]', 'accepted', now(), $4) RETURNING id`,
        [h, analyser, qcPlan, lead.userId],
      )
    ).id;
    await tx((t) =>
      acceptLot(
        t,
        lead,
        { lotId: lot, pairs: pairs([2, -3, 4, 1, 0]), qcIds: [run], certificate: null },
        new Date(),
      ),
    );
    expect(await stateOf(lot)).toBe("accepted");
    const a = await one<{
      outcome: string;
      method: string;
      pairs: unknown[];
      qc_check_ids: string[];
    }>(`SELECT outcome, method, pairs, qc_check_ids FROM lab_lot_acceptances WHERE lot_id = $1`, [
      lot,
    ]);
    expect(a).toMatchObject({ outcome: "accepted", method: "lot_comparison", qc_check_ids: [run] });
    expect(a.pairs).toHaveLength(FX_SAMPLES);
    await inUse();
    expect(await stateOf(lot)).toBe("in_use");
  });

  it("S3: one sample outside the criterion cannot accept the lot; Reject lot records the reason (and opens a nonconformity)", async () => {
    await receive([line(creat, "FX-CR-BAD")]);
    const lot = await lotIdOf(creat, "FX-CR-BAD");
    await expect(
      tx((t) =>
        acceptLot(
          t,
          lead,
          { lotId: lot, pairs: pairs([2, 30, 1, 0, 1]), qcIds: [], certificate: null },
          new Date(),
        ),
      ),
    ).rejects.toThrow(/outside the criterion/);
    await tx((t) =>
      rejectLot(
        t,
        lead,
        { lotId: lot, reason: "Fixture: sample 2 outside", pairs: pairs([2, 30, 1, 0, 1]) },
        new Date(),
      ),
    );
    expect(await stateOf(lot)).toBe("rejected");
    expect(
      await one(`SELECT outcome, reason FROM lab_lot_acceptances WHERE lot_id = $1`, [lot]),
    ).toEqual({ outcome: "rejected", reason: "Fixture: sample 2 outside" });
    const nc = await one<{ source: string; number: string }>(
      `SELECT source, number FROM lab_nonconformities WHERE source_ref = $1`,
      [lot],
    );
    expect(nc.source).toBe("lot_rejected");
    expect(nc.number).toMatch(/^NC-\d{4}-001$/);
    await expect(
      tx((t) =>
        setLotInUse(
          t,
          lead,
          { lotId: lot, deviceId: analyser, sectionId: null, conceptId: null, kind: "reagent" },
          new Date(),
        ),
      ),
    ).rejects.toThrow(/was rejected/);
  });

  let strip: string;
  let stripLot: string;
  let controlLot: string;
  it("S10, LA-6: lots on hand at switch-on are recorded as accepted (before MedSync) with the lead's statement", async () => {
    strip = await item({
      name: "Fixture glucose strips",
      kind: "strip",
      testCodes: [CAP],
      testsPerUnit: 1,
    });
    const control = await item({ name: "Fixture glucose control", kind: "control" });
    await expect(
      tx((t) =>
        grandfatherLots(
          t,
          lead,
          {
            statement: " ",
            lots: [{ itemId: strip, lot: "FX-S-1", useBy: null, quantity: 1 }],
            clientKey: key(),
          },
          new Date(),
        ),
      ),
    ).rejects.toThrow(/statement/);
    const statement = "Fixture: these lots were on the shelf and in use on 13 OCT 2026.";
    const [s1, c1] = await tx((t) =>
      grandfatherLots(
        t,
        lead,
        {
          statement,
          lots: [
            { itemId: strip, lot: "FX-S-1", useBy: plusDays(40), quantity: 5 },
            { itemId: control, lot: "FX-C-1", useBy: plusDays(40), quantity: 2 },
          ],
          clientKey: key(),
        },
        new Date(),
      ),
    );
    stripLot = s1!;
    controlLot = c1!;
    expect(
      await one(`SELECT state, accepted_basis, statement FROM lab_stock_lots WHERE id = $1`, [
        stripLot,
      ]),
    ).toEqual({ state: "accepted", accepted_basis: "before_medsync", statement });
    expect(await onHandOf(stripLot)).toBe(5);
  });

  it("S4: a released result snapshots the lots in use; changing the lot afterwards does not change the snapshot", async () => {
    for (const [lotId, kind] of [
      [stripLot, "strip"],
      [controlLot, "control"],
    ] as const)
      await tx((t) =>
        setLotInUse(
          t,
          lead,
          { lotId, deviceId: meter, sectionId: null, conceptId: null, kind },
          new Date(),
        ),
      );
    const r = await bedside({ lotId: stripLot });
    const snap = async (reportId: string) =>
      (
        await one<{ lots: unknown }>(`SELECT lots FROM lab_result_snapshots WHERE report_id = $1`, [
          reportId,
        ])
      ).lots;
    const first = await snap(r.id);
    expect(first).toEqual({
      strip: { id: stripLot, lot: "FX-S-1" },
      control: { id: controlLot, lot: "FX-C-1" },
    });
    const [s2] = await tx((t) =>
      grandfatherLots(
        t,
        lead,
        {
          statement: "Fixture: a second strip lot on the shelf.",
          lots: [{ itemId: strip, lot: "FX-S-2", useBy: plusDays(60), quantity: 5 }],
          clientKey: key(),
        },
        new Date(),
      ),
    );
    await tx((t) =>
      setLotInUse(
        t,
        lead,
        { lotId: s2!, deviceId: meter, sectionId: null, conceptId: null, kind: "strip" },
        new Date(Date.now() + 1000),
      ),
    );
    expect(await snap(r.id)).toEqual(first);
  });

  it("S5: FEFO offers the earliest-expiring accepted lot first; choosing another needs a reason", async () => {
    const kit = await item({ name: "Fixture kit", kind: "kit" });
    await plan(kit, { method: "none", triggers: [] });
    await receive([
      line(kit, "FX-K-LATE", { useBy: plusDays(90) }),
      line(kit, "FX-K-SOON", { useBy: plusDays(20) }),
    ]);
    const late = await lotIdOf(kit, "FX-K-LATE");
    const soon = await lotIdOf(kit, "FX-K-SOON");
    const issue = (lotId: string, fefoReason: string | null) =>
      tx((t) =>
        issueStock(
          t,
          lead,
          {
            itemId: kit,
            lotId,
            quantity: 1,
            toKind: "bench",
            toRef: null,
            fefoReason,
            clientKey: key(),
          },
          new Date(),
        ),
      );
    await expect(issue(late, null)).rejects.toThrow(/expires first/);
    const t1 = await issue(late, "Fixture: the soon lot is at the other bench");
    expect(await one(`SELECT fefo_reason FROM lab_stock_transactions WHERE id = $1`, [t1])).toEqual(
      {
        fefo_reason: "Fixture: the soon lot is at the other bench",
      },
    );
    const t2 = await issue(soon, null);
    expect(
      await one(`SELECT fefo_reason, quantity FROM lab_stock_transactions WHERE id = $1`, [t2]),
    ).toEqual({
      fefo_reason: null,
      quantity: -1,
    });
    // The first issue put each accepted lot in use.
    expect(await stateOf(soon)).toBe("in_use");
    const read = await tx((t) => loadStock(t, h, new Date()));
    expect(read.items.find((i) => i.id === kit)!.lots.find((l) => l.useFirst)!.id).toBe(soon);
  });

  it("S6: a lot expires at midnight, hospital-local: no issue, no bench lot in use, no bedside result after it", async () => {
    const kit = await item({ name: "Fixture midnight kit", kind: "kit" });
    await plan(kit, { method: "none", triggers: [] });
    const at = (iso: string) => new Date(iso);
    await receive([line(kit, "FX-MID", { useBy: "2026-10-13" })], at("2026-10-12T08:00:00Z"));
    const lot = await lotIdOf(kit, "FX-MID");
    const issue = (now: Date) =>
      tx((t) =>
        issueStock(
          t,
          lead,
          {
            itemId: kit,
            lotId: lot,
            quantity: 1,
            toKind: "bench",
            toRef: null,
            fefoReason: null,
            clientKey: key(),
          },
          now,
        ),
      );
    // 23:00 Kampala on the use-by day: still usable. 01:30 Kampala the next day (22:30 UTC the same date): expired.
    await issue(at("2026-10-13T20:00:00Z"));
    await expect(issue(at("2026-10-13T22:30:00Z"))).rejects.toThrow(/past its use-by date/);
    await expect(
      tx((t) =>
        setLotInUse(
          t,
          lead,
          { lotId: lot, deviceId: analyser, sectionId: null, conceptId: null, kind: "kit" },
          at("2026-10-13T22:30:00Z"),
        ),
      ),
    ).rejects.toThrow(/past its use-by date/);
    // Bedside: a strip lot set in use before it expired, used after: refused on the server.
    const [old] = await tx((t) =>
      grandfatherLots(
        t,
        lead,
        {
          statement: "Fixture: an old strip lot on the shelf.",
          lots: [{ itemId: strip, lot: "FX-S-OLD", useBy: plusDays(-1), quantity: 1 }],
          clientKey: key(),
        },
        new Date(),
      ),
    );
    await tx((t) =>
      setLotInUse(
        t,
        lead,
        { lotId: old!, deviceId: meter, sectionId: null, conceptId: null, kind: "strip" },
        new Date(Date.now() - 3 * 86_400_000),
      ),
    );
    await expect(bedside({ lotId: old! })).rejects.toThrow(/past its use-by date/);
    // A quarantined lot is refused at the bedside and the bench alike (LA-4).
    await tx((t) =>
      quarantineLot(t, lead, { lotId: stripLot, reason: "Fixture: control failed" }, new Date()),
    );
    await expect(bedside({ lotId: stripLot })).rejects.toThrow(/quarantined/);
  });

  it("S7: months of stock and quantity to maximum compute from issues; 1 month of history is 'Not enough history'", async () => {
    const now = new Date();
    const monthsAgo = (n: number) => {
      const d = new Date(now);
      d.setUTCDate(15);
      d.setUTCMonth(d.getUTCMonth() - n);
      return d;
    };
    const old = await item({ name: "Fixture reagent with history", minMonths: 1, maxMonths: 3 });
    await plan(old, { method: "none", triggers: [] });
    await receive([line(old, "FX-H", { received: 100 })], monthsAgo(4));
    const lot = await lotIdOf(old, "FX-H");
    for (const n of [3, 2, 1])
      await tx((t) =>
        issueStock(
          t,
          lead,
          {
            itemId: old,
            lotId: lot,
            quantity: 10,
            toKind: "bench",
            toRef: null,
            fefoReason: null,
            clientKey: key(),
          },
          monthsAgo(n),
        ),
      );
    const young = await item({ name: "Fixture reagent, new" });
    await plan(young, { method: "none", triggers: [] });
    await receive([line(young, "FX-Y", { received: 20 })], monthsAgo(1));
    const read = await tx((t) => loadStock(t, h, now));
    const o = read.items.find((i) => i.id === old)!;
    expect(o).toMatchObject({
      onHand: 70,
      averageUse: 10,
      monthsOfStock: 7,
      belowMinimum: false,
      toMaximum: 0,
    });
    const y = read.items.find((i) => i.id === young)!;
    expect(y).toMatchObject({ averageUse: null, monthsOfStock: null, toMaximum: null });
  });

  it("S8: a count with a discrepancy needs a reason, and adjusts the ledger", async () => {
    const c = await item({ name: "Fixture counted reagent" });
    await plan(c, { method: "none", triggers: [] });
    await receive([line(c, "FX-CNT", { received: 12 })]);
    const lot = await lotIdOf(c, "FX-CNT");
    await expect(
      tx((t) =>
        recordCount(
          t,
          lead,
          { lines: [{ lotId: lot, counted: 9, reason: null }], clientKey: key() },
          new Date(),
        ),
      ),
    ).rejects.toThrow(/say why/);
    const countId = await tx((t) =>
      recordCount(
        t,
        lead,
        { lines: [{ lotId: lot, counted: 9, reason: "Fixture: three broken" }], clientKey: key() },
        new Date(),
      ),
    );
    expect(await onHandOf(lot)).toBe(9);
    expect(
      await one(`SELECT kind, quantity, reason FROM lab_stock_transactions WHERE count_id = $1`, [
        countId,
      ]),
    ).toEqual({
      kind: "count",
      quantity: -3,
      reason: "Fixture: three broken",
    });
    const read = await tx((t) => loadStock(t, h, new Date()));
    expect(read.items.find((i) => i.id === c)!.countDue).toBe(false);
  });

  it("S9: expected use from released tests differs from issues beyond the tolerance: listed as possible wastage; nothing blocks", async () => {
    await tx((t) => setQualitySettings(t, lead, { tolerancePct: 20 }, new Date())); // FIXTURE tolerance
    const s = await item({
      name: "Fixture strips for ST-9",
      kind: "strip",
      testCodes: [CAP],
      testsPerUnit: 1,
    });
    await plan(s, { method: "none", triggers: [] });
    await receive([line(s, "FX-W", { received: 50 })]);
    const lot = await lotIdOf(s, "FX-W");
    await tx((t) =>
      issueStock(
        t,
        lead,
        {
          itemId: s,
          lotId: lot,
          quantity: 40,
          toKind: "ward",
          toRef: null,
          fefoReason: null,
          clientKey: key(),
        },
        new Date(),
      ),
    );
    const read = await tx((t) => loadStock(t, h, new Date()));
    const e = read.items.find((i) => i.id === s)!.expected!;
    const released = Number(
      (
        await one<{ n: string }>(
          `SELECT count(DISTINCT d.order_id) AS n FROM diagnostic_reports d JOIN test_catalogue t ON t.id = d.test_id
            WHERE d.hospital_id = $1 AND d.status = 'final' AND t.code = $2`,
          [h, CAP],
        )
      ).n,
    );
    expect(released).toBeGreaterThan(0);
    expect(e).toMatchObject({ expected: released, issued: 40, listed: true });
  });

  it("the bedside lot move: with stock off, adding a lot writes the ledger (in use at once), and no poct_lots copy trigger exists", async () => {
    process.env.LAB_STOCK = "";
    try {
      const { addLot } = await import("@/lib/lab/bedside-store");
      const id = await tx((t) =>
        addLot(t, lead, { deviceId: meter, lot: "FX-P2", useBy: plusDays(30) }),
      );
      expect(
        await one(`SELECT state, accepted_basis FROM lab_stock_lots WHERE id = $1`, [id]),
      ).toEqual({
        state: "in_use",
        accepted_basis: "before_medsync",
      });
      expect(
        await one(`SELECT kind FROM lab_lots_in_use WHERE lot_id = $1 AND device_id = $2`, [
          id,
          meter,
        ]),
      ).toEqual({ kind: "strip" });
      const r = await bedside({ lotId: id });
      expect(await one(`SELECT lot_id FROM diagnostic_reports WHERE id = $1`, [r.id])).toEqual({
        lot_id: id,
      });
    } finally {
      process.env.LAB_STOCK = "1";
    }
    const { addLot } = await import("@/lib/lab/bedside-store");
    await expect(
      tx((t) => addLot(t, lead, { deviceId: meter, lot: "FX-P3", useBy: plusDays(30) })),
    ).rejects.toThrow(/Stock is on here/);
  });
});
