/**
 * Lab Phase 2, Step 6: payment, identity at collection and the high-risk warning on the PGlite lane (S26–S28,
 * S30–S35, S37; G4 proved red then green; PY-5 at the database). Fixture people, receipts and reasons only.
 * Runs with EMR_PGLITE=1.
 */
import { randomUUID } from "node:crypto";
import type { Lane, Pg } from "./_pglite";
import type { EmrActor } from "@/lib/emr/actor";
import type { WriteCtx } from "@/lib/emr/write/context";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { withPatientWrite } from "@/lib/emr/write/context";
import { placeOrders } from "@/lib/emr/write/orders";
import {
  checkSpecimenLabel,
  collectSpecimen,
  setSpecimenHighRisk,
  voidAndReprintLabel,
} from "@/lib/emr/write/specimens";
import { generateKey } from "@/lib/encryption";
import {
  actAs,
  bootLane,
  clinician,
  department,
  encounter,
  hospital,
  intake,
  laneOn,
  patient,
  reception,
} from "./_pglite";

const FBC = "bfd23c30-1989-5fdb-8030-c87016ab22c9";
const HIV = "3d7e5b6b-0000-0000-0000-000000000000"; // replaced below by the seeded uuid
const key = () => `k-${randomUUID()}`;

describe.skipIf(!laneOn)("Lab Phase 2 payment, collection check, high-risk (Step 6)", () => {
  let lane: Lane;
  let pg: Pg;
  let h: string;
  let ward: string;
  let doctor: EmrActor;
  let nurse: EmrActor;
  let labTech: EmrActor;
  let cashier: string;
  const env = { ...process.env };
  let hivTest = HIV;

  const as = <T>(a: EmrActor, p: string, fn: (ctx: WriteCtx) => Promise<T>) =>
    withPatientWrite(a, p, fn, { database: lane.db });
  async function visit() {
    const p = await patient(pg);
    await intake(pg, { hospitalId: h, patientUserId: p });
    const enc = await encounter(pg, { hospitalId: h, patientUserId: p, clinicianUserId: doctor.userId, departmentId: ward });
    return { p, enc };
  }
  const order = (v: { p: string; enc: string }, testId: string, priority = "routine", intentSource?: string) =>
    as(doctor, v.p, (ctx) =>
      placeOrders(ctx, {
        patientUserId: v.p,
        encounterId: v.enc,
        orders: [{ clientKey: key(), testId, priority: priority as "routine", reasonText: "Fixture reason", ...(intentSource ? { intentSource: intentSource as "clinician" } : {}) }],
      }),
    );
  const label = async (orderId: string) =>
    (await pg.query<{ label_no: string }>(`SELECT label_no FROM lab_labels WHERE order_id = $1 AND voided_at IS NULL`, [orderId])).rows[0]?.label_no;
  const collect = (v: { p: string }, orderId: string, extra: Record<string, unknown> = {}) =>
    as(nurse, v.p, (ctx) =>
      collectSpecimen(ctx, { patientUserId: v.p, orderId, identifiersConfirmed: true, clientKey: key(), ...extra }),
    );
  const mode = (m: string) =>
    pg.query(`INSERT INTO lab_settings (hospital_id, payment_mode) VALUES ($1, $2) ON CONFLICT (hospital_id) DO UPDATE SET payment_mode = $2`, [h, m]);
  const payState = async (orderId: string) =>
    (await pg.query<{ state: string }>(`SELECT state FROM lab_payment_events WHERE order_id = $1 ORDER BY recorded_at DESC LIMIT 1`, [orderId])).rows[0]?.state;

  beforeAll(async () => {
    process.env.MEDSYNC_PHI_KEY ??= generateKey();
    lane = await bootLane();
    pg = lane.pg;
    h = await hospital(pg, "Collection");
    ward = await department(pg, h, "Ward");
    const lab = await department(pg, h, "Laboratory");
    const make = async (d: string, cadreCode: string, surface: EmrActor["surface"]): Promise<EmrActor> => ({
      ...(await clinician(pg, { hospitalId: h, departmentId: d, cadre: cadreCode })),
      fullName: null,
      hospitalId: h,
      departmentId: d,
      cadreCode,
      isClinical: true,
      surface,
    });
    doctor = await make(ward, "MEDICAL_OFFICER", "doctor");
    nurse = await make(ward, "NURSE", "nurse");
    labTech = await make(lab, "LAB_TECHNOLOGIST", "lab");
    cashier = (await reception(pg, { hospitalId: h, departmentId: ward })).userId;
    hivTest = (await pg.query<{ id: string }>(`SELECT id FROM test_catalogue WHERE code = 'test.hiv_rapid' AND hospital_id IS NULL`)).rows[0]!.id;
  }, 300_000);
  afterAll(() => {
    for (const k of ["LAB_WORKSPACE", "LAB_PAYMENT", "LAB_COLLECTION_CHECK", "LAB_HIGH_RISK", "LAB_CATALOGUE_V2"]) process.env[k] = env[k];
  });

  it("G4 (red before): with the check off, a tube is collected with another patient's label", async () => {
    process.env.LAB_WORKSPACE = "1";
    process.env.LAB_COLLECTION_CHECK = "";
    const a = await visit();
    const o = await order(a, FBC);
    await expect(collect(a, o.id, { labelNo: "L99999999" })).resolves.toMatchObject({ id: expect.any(String) });
  });

  it("S31, S32 (G4 green), ID-1..ID-3: the right label collects; another patient's is refused and recorded, no override", async () => {
    process.env.LAB_COLLECTION_CHECK = "1";
    const a = await visit();
    const b = await visit();
    const oa = await order(a, FBC);
    const ob = await order(b, FBC);
    const la = await label(oa.id);
    const lb = await label(ob.id);
    expect(la).toMatch(/^L\d{8}$/);
    const mismatch = await as(nurse, a.p, (ctx) =>
      checkSpecimenLabel(ctx, { patientUserId: a.p, orderId: oa.id, labelNo: lb!, method: "scan", wristbandChecked: true, clientKey: key() }),
    );
    expect(mismatch).toMatchObject({ outcome: "other_patient", otherPatientUserId: b.p });
    await expect(collect(a, oa.id, { labelNo: lb, labelMethod: "scan" })).rejects.toThrow(/does not match/);
    await expect(collect(a, oa.id)).rejects.toThrow(/Scan or type the label/);
    const events = await pg.query(`SELECT outcome FROM lab_identity_checks WHERE order_id = $1`, [oa.id]);
    expect(events.rows).toEqual([{ outcome: "other_patient" }]); // the refused collection's own check rolled back with it
    await expect(collect(a, oa.id, { labelNo: la, labelMethod: "scan", wristbandChecked: true })).resolves.toMatchObject({ id: expect.any(String) });
    const sp = await pg.query(`SELECT label_no FROM specimens WHERE order_id = $1`, [oa.id]);
    expect(sp.rows[0]).toEqual({ label_no: la });
  });

  it("S33, ID-5: void and print new; the old number reads as voided", async () => {
    const a = await visit();
    const o = await order(a, FBC);
    const old = await label(o.id);
    const fresh = await as(nurse, a.p, (ctx) => voidAndReprintLabel(ctx, { patientUserId: a.p, orderId: o.id, reason: "Fixture: smudged", clientKey: key() }));
    expect(fresh.labelNo).not.toBe(old);
    const r = await as(nurse, a.p, (ctx) =>
      checkSpecimenLabel(ctx, { patientUserId: a.p, orderId: o.id, labelNo: old!, method: "typed", wristbandChecked: false, clientKey: key() }),
    );
    expect(r.outcome).toBe("voided_label");
  });

  it("S26, S27, PY-2: Immediate and resus orders are emergencies, collectable at once even in hold mode", async () => {
    process.env.LAB_COLLECTION_CHECK = "";
    process.env.LAB_PAYMENT = "1";
    await mode("hold");
    const a = await visit();
    const imm = await order(a, FBC, "immediate");
    const resus = await order(a, FBC, "routine", "resus_handover");
    expect(await payState(imm.id)).toBe("emergency");
    expect(await payState(resus.id)).toBe("emergency");
    await expect(collect(a, imm.id)).resolves.toMatchObject({ id: expect.any(String) });
    await expect(collect(a, resus.id)).resolves.toMatchObject({ id: expect.any(String) });
  });

  it("S28, PY-3: awaiting payment — inform needs a reason; hold waits for the cashier", async () => {
    await mode("inform");
    const a = await visit();
    const o1 = await order(a, FBC);
    expect(await payState(o1.id)).toBe("awaiting");
    await expect(collect(a, o1.id)).rejects.toThrow(/Give a reason/);
    await expect(collect(a, o1.id, { paymentReason: "Clinician asked to proceed" })).resolves.toMatchObject({ id: expect.any(String) });
    const s = await pg.query(`SELECT payment_state, payment_reason FROM specimens WHERE order_id = $1`, [o1.id]);
    expect(s.rows[0]).toEqual({ payment_state: "awaiting", payment_reason: "Clinician asked to proceed" });
    await mode("hold");
    const o2 = await order(a, FBC);
    await expect(collect(a, o2.id, { paymentReason: "Clinician asked to proceed" })).rejects.toThrow(/cashier must record/);
    await pg.query(
      `INSERT INTO lab_payment_events (order_id, hospital_id, state, receipt_no, actor_user_id) VALUES ($1, $2, 'paid', 'R-FIXTURE-1', $3)`,
      [o2.id, h, cashier],
    );
    await expect(collect(a, o2.id)).resolves.toMatchObject({ id: expect.any(String) });
  });

  it("S30, PY-5: the cashier sees names of unrestricted tests and a count of restricted ones; never the restricted name, at the database", async () => {
    process.env.LAB_CATALOGUE_V2 = "1"; // CC-8: the restricted class propagates to the order
    await mode("inform");
    const a = await visit();
    await order(a, FBC);
    await order(a, hivTest);
    const rows = await actAs(pg, { userId: cashier, role: "authenticated" }, async (tx) =>
      (await tx.query<{ tests: string[]; restricted_count: number; patient_user_id: string }>(`SELECT * FROM public.lab_awaiting_payment($1)`, [h])).rows,
    );
    const mine = rows.find((r) => r.patient_user_id === a.p)!;
    expect(mine.restricted_count).toBe(1);
    expect(mine.tests).toEqual(["Full blood count (FBC/CBC)"]);
    expect(JSON.stringify(rows)).not.toMatch(/HIV/i);
    // The cashier cannot read the orders table at all (not a clinician): no route to the restricted name.
    const direct = await actAs(pg, { userId: cashier, role: "medsync_clinical_reader", hospitalId: h }, async (tx) =>
      (await tx.query(`SELECT text FROM encounter_orders WHERE patient_user_id = $1`, [a.p])).rows,
    );
    expect(direct).toEqual([]);
    // A doctor asking the function gets nothing: it serves the cashier only.
    const asDoctor = await actAs(pg, { userId: doctor.userId, role: "authenticated" }, async (tx) =>
      (await tx.query(`SELECT * FROM public.lab_awaiting_payment($1)`, [h])).rows,
    );
    expect(asDoctor).toEqual([]);
  });

  it("S35, HR-2: a clinician flags by hand with a reason and clears with a reason; the lab cannot clear", async () => {
    process.env.LAB_HIGH_RISK = "1";
    const a = await visit();
    await expect(
      as(doctor, a.p, (ctx) => setSpecimenHighRisk(ctx, { patientUserId: a.p, encounterId: a.enc, kind: "flag", source: "manual", clientKey: key() })),
    ).rejects.toThrow(/Say why/);
    await as(doctor, a.p, (ctx) =>
      setSpecimenHighRisk(ctx, { patientUserId: a.p, encounterId: a.enc, kind: "flag", source: "manual", reason: "Fixture: bleeding gums and fever", clientKey: key() }),
    );
    await expect(
      as(labTech, a.p, (ctx) => setSpecimenHighRisk(ctx, { patientUserId: a.p, encounterId: a.enc, kind: "clear", source: "manual", reason: "Fixture", clientKey: key() })),
    ).rejects.toThrow();
    const cleared = await as(doctor, a.p, (ctx) =>
      setSpecimenHighRisk(ctx, { patientUserId: a.p, encounterId: a.enc, kind: "clear", source: "manual", reason: "Fixture: alternative diagnosis confirmed", clientKey: key() }),
    );
    expect(cleared.changed).toBe(true);
    const ev = await pg.query(`SELECT kind, source FROM lab_high_risk_events WHERE encounter_id = $1 ORDER BY recorded_at`, [a.enc]);
    expect(ev.rows).toEqual([{ kind: "flag", source: "manual" }, { kind: "clear", source: "manual" }]);
  });

  it("S34 (data), HR-1: the desk's rule flags once; a second firing adds nothing", async () => {
    const a = await visit();
    const once = () =>
      as(doctor, a.p, (ctx) =>
        setSpecimenHighRisk(ctx, { patientUserId: a.p, encounterId: a.enc, kind: "flag", source: "rule", ruleId: "FLAG-VHF-BLEEDING", clientKey: key() }),
      );
    expect((await once()).changed).toBe(true);
    expect((await once()).changed).toBe(false);
  });

  it("S37: with the flags off, collection is Phase 1's (no label, no payment)", async () => {
    process.env.LAB_PAYMENT = "";
    process.env.LAB_COLLECTION_CHECK = "";
    await mode("hold");
    const a = await visit();
    const o = await order(a, FBC);
    expect(await payState(o.id)).toBeUndefined();
    expect(await label(o.id)).toBeUndefined();
    await expect(collect(a, o.id)).resolves.toMatchObject({ id: expect.any(String) });
  });
});
