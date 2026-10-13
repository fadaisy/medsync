/**
 * Lab Phase 2, Step 7: the bench on the PGlite lane (S38–S41, S44, S45; S43 is in lab-phase2-data). Scan
 * lookups are scoped to the hospital; receipts are idempotent and undoable within the window; the working
 * diagnosis is read now, logged, and masked when restricted. Fixture values only. Runs with EMR_PGLITE=1.
 */
import { randomUUID } from "node:crypto";
import type { Lane, Pg } from "./_pglite";
import type { EmrActor } from "@/lib/emr/actor";
import type { WriteCtx } from "@/lib/emr/write/context";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { withPatientWrite } from "@/lib/emr/write/context";
import { placeOrders } from "@/lib/emr/write/orders";
import { collectSpecimen, receiveSpecimen, setSpecimenHighRisk, undoReceipt } from "@/lib/emr/write/specimens";
import { encrypt, generateKey } from "@/lib/encryption";
import { lookupLabel, workingDiagnosis } from "@/lib/lab/bench-store";
import { receiveDecision } from "@/lib/lab/one-menu";
import { bootLane, clinician, department, encounter, hospital, intake, laneOn, patient } from "./_pglite";

const FBC = "bfd23c30-1989-5fdb-8030-c87016ab22c9";
const key = () => `k-${randomUUID()}`;

describe.skipIf(!laneOn)("Lab Phase 2 bench (Step 7)", () => {
  let lane: Lane;
  let pg: Pg;
  let hA: string;
  let hB: string;
  let ward: string;
  const a: Record<string, EmrActor> = {};
  const env = { ...process.env };
  const as = <T>(x: EmrActor, p: string, fn: (ctx: WriteCtx) => Promise<T>) => withPatientWrite(x, p, fn, { database: lane.db });
  const tx = <T>(fn: (t: Parameters<Parameters<Lane["db"]["transaction"]>[0]>[0]) => Promise<T>) => lane.db.transaction(fn);

  async function collected() {
    const p = await patient(pg);
    await intake(pg, { hospitalId: hA, patientUserId: p });
    const enc = await encounter(pg, { hospitalId: hA, patientUserId: p, clinicianUserId: a.doctor!.userId, departmentId: ward });
    const o = await as(a.doctor!, p, (ctx) =>
      placeOrders(ctx, { patientUserId: p, encounterId: enc, orders: [{ clientKey: key(), testId: FBC, priority: "routine", reasonText: "Fixture" }] }),
    );
    const label = (await pg.query<{ label_no: string }>(`SELECT label_no FROM lab_labels WHERE order_id = $1`, [o.id])).rows[0]!.label_no;
    const sp = await as(a.nurse!, p, (ctx) =>
      collectSpecimen(ctx, { patientUserId: p, orderId: o.id, identifiersConfirmed: true, labelNo: label, labelMethod: "scan", clientKey: key() }),
    );
    return { p, enc, orderId: o.id, label, specimenId: sp.id };
  }
  const decide = async (hospitalId: string, label: string, extra: { procedureFollowed?: boolean; reason?: string } = {}) => {
    const f = await tx((t) => lookupLabel(t, hospitalId, label));
    return {
      f,
      d: receiveDecision({
        label: f ? { voided: f.voided, hospitalMatches: true } : null,
        specimen: f?.specimenId ? { id: f.specimenId } : null,
        lastEvent: f?.lastEvent ?? null,
        highRisk: f?.highRisk ?? false,
        procedureFollowed: !!extra.procedureFollowed,
        receiveAnywayReason: extra.reason ?? null,
      }),
    };
  };

  beforeAll(async () => {
    process.env.MEDSYNC_PHI_KEY ??= generateKey();
    process.env.LAB_WORKSPACE = "1";
    process.env.LAB_COLLECTION_CHECK = "1";
    process.env.LAB_HIGH_RISK = "1";
    lane = await bootLane();
    pg = lane.pg;
    hA = await hospital(pg, "Bench A");
    hB = await hospital(pg, "Bench B");
    ward = await department(pg, hA, "Ward");
    const lab = await department(pg, hA, "Laboratory");
    const make = async (d: string, cadreCode: string, surface: EmrActor["surface"]): Promise<EmrActor> => ({
      ...(await clinician(pg, { hospitalId: hA, departmentId: d, cadre: cadreCode })),
      fullName: null,
      hospitalId: hA,
      departmentId: d,
      cadreCode,
      isClinical: true,
      surface,
      ...(surface === "lab" ? { labPermissions: ["lab.receive", "lab.result.enter", "lab.result.release"] } : {}),
    });
    a.doctor = await make(ward, "MEDICAL_OFFICER", "doctor");
    a.nurse = await make(ward, "NURSE", "nurse");
    a.lab = await make(lab, "LAB_TECHNOLOGIST", "lab");
  }, 300_000);
  afterAll(() => {
    for (const k of ["LAB_WORKSPACE", "LAB_COLLECTION_CHECK", "LAB_HIGH_RISK"]) process.env[k] = env[k];
  });

  it("S38, SR-1: a scan receives once; a second scan says already received, with when and by whom", async () => {
    const s = await collected();
    const first = await decide(hA, s.label);
    expect(first.d).toEqual({ do: "receive" });
    await as(a.lab!, s.p, (ctx) => receiveSpecimen(ctx, { patientUserId: s.p, specimenId: s.specimenId, clientKey: key(), via: "scan" }));
    const again = await decide(hA, s.label);
    expect(again.d).toMatchObject({ do: "already", cadre: "LAB_TECHNOLOGIST" });
    const ev = await pg.query(`SELECT received_via FROM specimen_events WHERE specimen_id = $1`, [s.specimenId]);
    expect(ev.rows).toEqual([{ received_via: "scan" }]);
  });

  it("S39, SR-2: another hospital's label number is not found there (no disclosure)", async () => {
    const s = await collected();
    expect((await decide(hB, s.label)).d).toEqual({ do: "not_found" });
    expect((await decide(hA, "L00000000")).d).toEqual({ do: "not_found" });
  });

  it("S40, SR-2: a label for an order not collected yet needs Receive anyway with a reason", async () => {
    const p = await patient(pg);
    await intake(pg, { hospitalId: hA, patientUserId: p });
    const enc = await encounter(pg, { hospitalId: hA, patientUserId: p, clinicianUserId: a.doctor!.userId, departmentId: ward });
    const o = await as(a.doctor!, p, (ctx) =>
      placeOrders(ctx, { patientUserId: p, encounterId: enc, orders: [{ clientKey: key(), testId: FBC, priority: "routine", reasonText: "Fixture" }] }),
    );
    const label = (await pg.query<{ label_no: string }>(`SELECT label_no FROM lab_labels WHERE order_id = $1`, [o.id])).rows[0]!.label_no;
    expect((await decide(hA, label)).d).toEqual({ do: "not_collected" });
    expect((await decide(hA, label, { reason: "Fixture: tube arrived without a ward record" })).d).toEqual({ do: "receive" });
  });

  it("S41, SR-5: undo within the window returns the specimen to To receive with a reversal event; too late is refused", async () => {
    const s = await collected();
    await as(a.lab!, s.p, (ctx) => receiveSpecimen(ctx, { patientUserId: s.p, specimenId: s.specimenId, clientKey: key() }));
    await as(a.lab!, s.p, (ctx) => undoReceipt(ctx, { patientUserId: s.p, specimenId: s.specimenId, clientKey: key() }, 5 * 60_000));
    expect((await decide(hA, s.label)).d).toEqual({ do: "receive" });
    const ev = await pg.query<{ kind: string; reversal_of: string | null }>(
      `SELECT kind, reversal_of FROM specimen_events WHERE specimen_id = $1 ORDER BY recorded_at`,
      [s.specimenId],
    );
    expect(ev.rows.map((r) => r.kind)).toEqual(["received", "receipt_undone"]);
    await as(a.lab!, s.p, (ctx) => receiveSpecimen(ctx, { patientUserId: s.p, specimenId: s.specimenId, clientKey: key() }));
    await expect(
      as(a.lab!, s.p, (ctx) => undoReceipt(ctx, { patientUserId: s.p, specimenId: s.specimenId, clientKey: key() }, -1)),
    ).rejects.toThrow(/Too late/);
  });

  it("S45, SR-3: a high-risk specimen is received only after Procedure followed, which is recorded", async () => {
    const s = await collected();
    await as(a.doctor!, s.p, (ctx) =>
      setSpecimenHighRisk(ctx, { patientUserId: s.p, encounterId: s.enc, kind: "flag", source: "manual", reason: "Fixture: suspected VHF", clientKey: key() }),
    );
    expect((await decide(hA, s.label)).d).toEqual({ do: "procedure_first" });
    expect((await decide(hA, s.label, { procedureFollowed: true })).d).toEqual({ do: "receive" });
    await as(a.lab!, s.p, (ctx) =>
      receiveSpecimen(ctx, { patientUserId: s.p, specimenId: s.specimenId, clientKey: key(), via: "scan", procedureFollowed: true }),
    );
    const ev = await pg.query(`SELECT procedure_followed_at IS NOT NULL AS ok FROM specimen_events WHERE specimen_id = $1`, [s.specimenId]);
    expect(ev.rows).toEqual([{ ok: true }]);
  });

  it("S44, CX-3, CX-4: the working diagnosis is read now; a restricted one is masked unless the order shares it", async () => {
    const s = await collected();
    expect(await tx((t) => workingDiagnosis(t, s.enc, false))).toEqual({ kind: "none" });
    await pg.query(
      `WITH n AS (SELECT gen_random_uuid() AS id)
       INSERT INTO conditions (id, logical_id, hospital_id, patient_user_id, encounter_id, recorded_by_user_id, effective_at, source,
         trust, category, rank, text_ciphertext, clinical_status, verification, asserted_by, sensitivity)
       SELECT n.id, n.id, $1, $2, $3, $4, now(), 'clinician', 3, 'encounter_diagnosis', 'primary', $5, 'active', 'provisional',
         'clinician', 'restricted' FROM n`,
      [hA, s.p, s.enc, a.doctor!.userId, encrypt("Fixture restricted diagnosis")],
    );
    expect(await tx((t) => workingDiagnosis(t, s.enc, false))).toEqual({ kind: "masked" });
    expect(await tx((t) => workingDiagnosis(t, s.enc, true))).toMatchObject({ kind: "shown", text: "Fixture restricted diagnosis" });
  });
});
