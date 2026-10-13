/**
 * Lab Phase 2, Step 2 (gate-a-proposal §3, §7): migrations 0107, 0109, 0110, 0111 on the PGlite lane. Every new
 * table is read only through the clinical reader, scoped to the hospital (and, for patient rows, to access);
 * no client writes; event tables are append-only for the owner too; the signed configuration needs two
 * different signers, freezes its payload and only moves forward; a band with an open verification cannot be
 * signed; an emergency's payment state never changes; a label is only voided, once; a profile in use is
 * frozen; the lab channel reaches only that hospital's lab staff with ids and event names. Fixture values are
 * invented and named as fixtures. Runs with EMR_PGLITE=1.
 */
import { randomUUID } from "node:crypto";
import type { Actor, Lane, Pg } from "./_pglite";
import type { EmrActor } from "@/lib/emr/actor";
import type { WriteCtx } from "@/lib/emr/write/context";
import { beforeAll, describe, expect, it } from "vitest";

import { withPatientWrite } from "@/lib/emr/write/context";
import { placeOrders } from "@/lib/emr/write/orders";
import { collectSpecimen } from "@/lib/emr/write/specimens";
import { generateKey } from "@/lib/encryption";
import {
  actAs,
  authUser,
  bootLane,
  clinician,
  department,
  encounter,
  hospital,
  intake,
  laneOn,
  patient,
  probe,
} from "./_pglite";

const GLUCOSE_FASTING = "79a7098d-6585-5bff-ab14-3a4a09b3bf68";
const key = () => `k-${randomUUID()}`;

const NEW_TABLES = [
  "lab_signed_configs",
  "analyser_profiles",
  "research_imports",
  "lab_labels",
  "lab_payment_events",
  "lab_identity_checks",
  "lab_high_risk_events",
  "poct_lots",
  "poct_operators",
] as const;

describe.skipIf(!laneOn)("Lab Phase 2 data layer (0107, 0109–0111)", () => {
  let lane: Lane;
  let pg: Pg;
  let hA: string;
  let hB: string;
  const a: Record<string, EmrActor> = {};
  let stranger: string;
  let readerB: string;
  let labB: string;
  let patientId: string;
  let orderId: string;
  let specimenId: string;
  let encounterId: string;
  let testId: string;
  let profileId: string;
  let deviceId: string;

  const reader = (userId: string, hospitalId: string): Actor => ({
    userId,
    role: "medsync_clinical_reader",
    hospitalId,
  });
  const one = async <T = Record<string, unknown>>(sql: string, params?: unknown[]) =>
    (await pg.query<T>(sql, params)).rows[0]!;
  const count = async (actor: Actor, table: string) => {
    const r = await probe(pg, actor, `SELECT count(*)::int AS n FROM public.${table}`);
    return r.ok ? (r.rows[0]!.n as number) : -1;
  };

  beforeAll(async () => {
    process.env.MEDSYNC_PHI_KEY ??= generateKey();
    lane = await bootLane();
    pg = lane.pg;
    hA = await hospital(pg, "Phase 2 A");
    hB = await hospital(pg, "Phase 2 B");
    const ward = await department(pg, hA, "Ward");
    const other = await department(pg, hA, "Other ward");
    const lab = await department(pg, hA, "Laboratory");
    const wardB = await department(pg, hB, "Ward B");
    const labDeptB = await department(pg, hB, "Laboratory B");
    const make = async (h: string, d: string, cadreCode: string, surface: EmrActor["surface"]) => ({
      ...(await clinician(pg, { hospitalId: h, departmentId: d, cadre: cadreCode })),
      fullName: null,
      hospitalId: h,
      departmentId: d,
      cadreCode,
      isClinical: true,
      surface,
    });
    a.doctor = await make(hA, ward, "MEDICAL_OFFICER", "doctor");
    a.nurse = await make(hA, ward, "NURSE", "nurse");
    a.lab = await make(hA, lab, "LAB_TECHNOLOGIST", "lab");
    stranger = (
      await clinician(pg, { hospitalId: hA, departmentId: other, cadre: "MEDICAL_OFFICER" })
    ).userId;
    readerB = (
      await clinician(pg, { hospitalId: hB, departmentId: wardB, cadre: "MEDICAL_OFFICER" })
    ).userId;
    labB = (
      await clinician(pg, { hospitalId: hB, departmentId: labDeptB, cadre: "LAB_TECHNOLOGIST" })
    ).userId;

    patientId = await patient(pg);
    await intake(pg, { hospitalId: hA, patientUserId: patientId });
    encounterId = await encounter(pg, {
      hospitalId: hA,
      patientUserId: patientId,
      clinicianUserId: a.doctor!.userId,
      departmentId: ward,
    });
    const as = <T>(actor: EmrActor, fn: (ctx: WriteCtx) => Promise<T>) =>
      withPatientWrite(actor, patientId, fn, { database: lane.db });
    const order = await as(a.doctor!, (ctx) =>
      placeOrders(ctx, {
        patientUserId: patientId,
        encounterId,
        orders: [
          { clientKey: key(), testId: GLUCOSE_FASTING, priority: "routine", reasonText: "Check" },
        ],
      }),
    );
    orderId = order.id;
    await pg.exec(`GRANT SELECT ON realtime.messages TO authenticated`); // as Supabase grants it
    specimenId = (
      await as(a.nurse!, (ctx) =>
        collectSpecimen(ctx, {
          patientUserId: patientId,
          orderId,
          identifiersConfirmed: true,
          fastingState: "fasting",
          fastingHours: 9,
          clientKey: key(),
        }),
      )
    ).id;
    testId = GLUCOSE_FASTING;
    await pg.query(`UPDATE patient_intakes SET status = 'completed' WHERE patient_user_id = $1`, [
      patientId,
    ]);

    const labUser = a.lab!.userId;
    // One row in every new table, as the owner (the write paths come in Steps 3–9).
    await pg.query(
      `INSERT INTO lab_signed_configs (hospital_id, kind, key, version, payload, authored_by)
       VALUES ($1, 'flag_basis', 'obs.glucose', 1, '{"basis":"reference"}', $2)`,
      [hA, labUser],
    );
    profileId = (
      await one<{ id: string }>(
        `INSERT INTO analyser_profiles (hospital_id, test_id, model, kind, created_by)
         VALUES ($1, $2, 'Fixture analyser', 'chemistry', $3) RETURNING id`,
        [hA, testId, labUser],
      )
    ).id;
    await pg.query(
      `INSERT INTO research_imports (hospital_id, hash, imported_by, report) VALUES ($1, $2, $3, '{}')`,
      [hA, "a".repeat(64), labUser],
    );
    await pg.query(
      `INSERT INTO lab_labels (order_id, hospital_id, patient_user_id, issued_by) VALUES ($1, $2, $3, $4)`,
      [orderId, hA, patientId, a.nurse!.userId],
    );
    await pg.query(
      `INSERT INTO lab_payment_events (order_id, hospital_id, state, actor_user_id) VALUES ($1, $2, 'awaiting', $3)`,
      [orderId, hA, a.doctor!.userId],
    );
    await pg.query(
      `INSERT INTO lab_identity_checks (order_id, hospital_id, patient_user_id, label_typed, outcome, method, actor_user_id)
       VALUES ($1, $2, $3, 'L-fixture', 'unknown_label', 'typed', $4)`,
      [orderId, hA, patientId, a.nurse!.userId],
    );
    await pg.query(
      `INSERT INTO lab_high_risk_events (encounter_id, hospital_id, patient_user_id, kind, source, reason, actor_user_id)
       VALUES ($1, $2, $3, 'flag', 'manual', 'fixture reason', $4)`,
      [encounterId, hA, patientId, a.doctor!.userId],
    );
    deviceId = (
      await one<{ id: string }>(
        `INSERT INTO devices (hospital_id, kind, model, serial) VALUES ($1, 'glucometer', 'Fixture meter', 'FX-1') RETURNING id`,
        [hA],
      )
    ).id;
    await pg.query(
      `INSERT INTO poct_lots (hospital_id, device_id, lot, use_by, added_by) VALUES ($1, $2, 'FX-LOT', current_date + 30, $3)`,
      [hA, deviceId, labUser],
    );
    await pg.query(
      `INSERT INTO poct_operators (hospital_id, user_id, granted_by) VALUES ($1, $2, $3)`,
      [hA, a.nurse!.userId, labUser],
    );
  }, 240_000);

  it("every new table: no client INSERT, UPDATE or DELETE", async () => {
    const client = await authUser(pg, "client");
    for (const t of NEW_TABLES) {
      const me: Actor = { userId: client, role: "authenticated" };
      const ins = await probe(pg, me, `INSERT INTO public.${t} DEFAULT VALUES`);
      const upd = await probe(pg, me, `UPDATE public.${t} SET hospital_id = hospital_id`);
      const del = await probe(pg, me, `DELETE FROM public.${t}`);
      expect(ins.ok, `${t} insert`).toBe(false);
      expect(upd.ok ? upd.affected : 0, `${t} update`).toBe(0);
      expect(del.ok ? del.affected : 0, `${t} delete`).toBe(0);
    }
  });

  it("anonymous reads nothing", async () => {
    for (const t of NEW_TABLES) {
      const r = await probe(
        pg,
        { userId: null, role: "anon" },
        `SELECT count(*)::int AS n FROM public.${t}`,
      );
      expect(r.ok ? (r.rows[0]!.n as number) : 0, t).toBe(0);
    }
  });

  it("another hospital's reader sees none of hospital A's rows", async () => {
    for (const t of NEW_TABLES) expect(await count(reader(readerB, hB), t), t).toBe(0);
  });

  it("the lab sees the patient's label, payment, check and warning; a clinician without access sees none", async () => {
    for (const t of [
      "lab_labels",
      "lab_payment_events",
      "lab_identity_checks",
      "lab_high_risk_events",
    ]) {
      expect(await count(reader(a.lab!.userId, hA), t), t).toBe(1);
      expect(await count(reader(stranger, hA), t), t).toBe(0);
    }
    // Set-up rows are the hospital's, readable by its staff.
    expect(await count(reader(stranger, hA), "lab_signed_configs")).toBe(1);
    expect(await count(reader(stranger, hA), "analyser_profiles")).toBe(1);
  });

  it("event tables and imports are append-only, for the owner too", async () => {
    for (const t of [
      "lab_payment_events",
      "lab_identity_checks",
      "lab_high_risk_events",
      "research_imports",
      "poct_lots",
    ]) {
      await expect(
        pg.query(`UPDATE public.${t} SET hospital_id = hospital_id`),
        t,
      ).rejects.toThrow();
      await expect(pg.query(`DELETE FROM public.${t}`), t).rejects.toThrow();
    }
  });

  it("a signed configuration needs two different signers, freezes its payload and only moves forward", async () => {
    const c = await one<{ id: string }>(
      `SELECT id FROM lab_signed_configs WHERE hospital_id = $1`,
      [hA],
    );
    const lead = a.lab!.userId;
    await expect(
      pg.query(
        `UPDATE lab_signed_configs SET status = 'signed', lead_signed_by = $2, lead_signed_at = now(), cso_signed_by = $2,
           cso_signed_at = now(), in_force_from = now() WHERE id = $1`,
        [c.id, lead],
      ),
    ).rejects.toThrow(/lsc_signed_by_two/);
    await pg.query(
      `UPDATE lab_signed_configs SET status = 'signed', lead_signed_by = $2, lead_signed_at = now(), cso_signed_by = $3,
         cso_signed_at = now(), in_force_from = now() WHERE id = $1`,
      [c.id, lead, stranger],
    );
    await expect(
      pg.query(`UPDATE lab_signed_configs SET payload = '{"basis":"scheme"}' WHERE id = $1`, [
        c.id,
      ]),
    ).rejects.toThrow(/frozen/);
    await expect(
      pg.query(`UPDATE lab_signed_configs SET status = 'draft' WHERE id = $1`, [c.id]),
    ).rejects.toThrow(/moves forward/);
    // A second signed version for the same key is refused until the first is superseded.
    await expect(
      pg.query(
        `INSERT INTO lab_signed_configs (hospital_id, kind, key, version, status, payload, authored_by, lead_signed_by,
           lead_signed_at, cso_signed_by, cso_signed_at, in_force_from)
         VALUES ($1, 'flag_basis', 'obs.glucose', 2, 'signed', '{}', $2, $2, now(), $3, now(), now())`,
        [hA, lead, stranger],
      ),
    ).rejects.toThrow(/lsc_one_signed/);
  });

  it("a band with an open verification cannot be signed until the check is recorded (RI-5)", async () => {
    const v = await one<{ id: string }>(
      `INSERT INTO reference_range_versions (hospital_id, test_id, concept_id, unit_ucum, version, authored_by)
       VALUES ($1, $2, 'obs.glucose', 'mmol/L', 1, $3) RETURNING id`,
      [hA, testId, a.lab!.userId],
    );
    const b = await one<{ id: string }>(
      `INSERT INTO reference_range_bands (version_id, sex, low, high, source, verification)
       VALUES ($1, 'any', 1, 2, 'fixture', 'fixture: read the table again') RETURNING id`,
      [v.id],
    );
    const sign = () =>
      pg.query(
        `UPDATE reference_range_versions SET status = 'signed', lead_signed_by = $2, lead_signed_at = now(),
           cso_signed_by = $3, cso_signed_at = now(), in_force_from = now() WHERE id = $1`,
        [v.id, a.lab!.userId, stranger],
      );
    await expect(sign()).rejects.toThrow(/verification check/);
    await pg.query(
      `UPDATE reference_range_bands SET check_note = 'fixture: matches', checked_by = $2, checked_at = now() WHERE id = $1`,
      [b.id, a.lab!.userId],
    );
    await sign();
  });

  it("an emergency's payment state never changes", async () => {
    const o2 = await one<{ id: string }>(
      `INSERT INTO lab_payment_events (order_id, hospital_id, state, actor_user_id) VALUES ($1, $2, 'emergency', $3)
       RETURNING id`,
      [orderId, hA, a.doctor!.userId],
    );
    expect(o2.id).toBeTruthy();
    await expect(
      pg.query(
        `INSERT INTO lab_payment_events (order_id, hospital_id, state, receipt_no, actor_user_id)
         VALUES ($1, $2, 'paid', 'R-FX', $3)`,
        [orderId, hA, a.lab!.userId],
      ),
    ).rejects.toThrow(/never held/);
  });

  it("a label is only voided, once; one live label per order", async () => {
    const l = await one<{ label_no: string }>(
      `SELECT label_no FROM lab_labels WHERE order_id = $1`,
      [orderId],
    );
    expect(l.label_no).toMatch(/^L\d{8}$/);
    await expect(
      pg.query(
        `INSERT INTO lab_labels (order_id, hospital_id, patient_user_id, issued_by) VALUES ($1, $2, $3, $4)`,
        [orderId, hA, patientId, a.nurse!.userId],
      ),
    ).rejects.toThrow(/lab_labels_live/);
    await expect(
      pg.query(`UPDATE lab_labels SET order_id = order_id, issued_at = now() WHERE label_no = $1`, [
        l.label_no,
      ]),
    ).rejects.toThrow(/only ever voided/);
    await pg.query(
      `UPDATE lab_labels SET voided_by = $2, voided_at = now(), void_reason = 'fixture: smudged' WHERE label_no = $1`,
      [l.label_no, a.nurse!.userId],
    );
    await expect(
      pg.query(`UPDATE lab_labels SET void_reason = 'again' WHERE label_no = $1`, [l.label_no]),
    ).rejects.toThrow(/only ever voided/);
  });

  it("a profile in use is frozen", async () => {
    await pg.query(
      `UPDATE analyser_profiles SET state = 'in_use', activated_by = $2, activated_at = now() WHERE id = $1`,
      [profileId, a.lab!.userId],
    );
    await expect(
      pg.query(`UPDATE analyser_profiles SET mappings = '[{"code":"X"}]' WHERE id = $1`, [
        profileId,
      ]),
    ).rejects.toThrow(/frozen/);
    await pg.query(`UPDATE analyser_profiles SET state = 'retired' WHERE id = $1`, [profileId]);
    await expect(
      pg.query(`UPDATE analyser_profiles SET state = 'in_use' WHERE id = $1`, [profileId]),
    ).rejects.toThrow(/frozen/);
  });

  it("a device is in use only with a recorded verification; a bedside report carries both device and lot", async () => {
    await expect(
      pg.query(`UPDATE devices SET state = 'in_use' WHERE id = $1`, [deviceId]),
    ).rejects.toThrow(/devices_verified/);
    await pg.query(
      `UPDATE devices SET state = 'in_use', verified_by = $2, verified_at = now(), verification_note = 'fixture check'
        WHERE id = $1`,
      [deviceId, a.lab!.userId],
    );
  });

  it("the lab channel reaches only that hospital's lab staff, with ids and event names", async () => {
    const msg = await one<{ payload: Record<string, unknown> }>(
      `SELECT payload FROM realtime.messages WHERE topic = $1 ORDER BY id DESC LIMIT 1`,
      [`lab:${hA}`],
    );
    expect(Object.keys(msg.payload).sort()).toEqual(["at", "event", "specimenId"]);
    expect(msg.payload.specimenId).toBe(specimenId);
    const hear = (userId: string, topic: string) =>
      actAs(pg, { userId, role: "authenticated" }, async (tx) => {
        await tx.query(`SELECT set_config('realtime.topic', $1, true)`, [topic]);
        return (await tx.query<{ n: number }>(`SELECT count(*)::int AS n FROM realtime.messages`))
          .rows[0]!.n;
      });
    expect(await hear(a.lab!.userId, `lab:${hA}`)).toBeGreaterThan(0);
    expect(await hear(labB, `lab:${hA}`)).toBe(0); // LV-5
    expect(await hear(a.doctor!.userId, `lab:${hA}`)).toBe(0); // not lab staff
  });
});
