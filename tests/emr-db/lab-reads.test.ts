/**
 * Lab Phase 0, Step 3 (gate-a-proposal §5, §7): the three reads behind /lab, /lab/released and
 * /lab/rejected on the PGlite lane, over orders, specimens and reports written by the real EMR
 * write paths. Two hospitals (LW-9), the offering seam for section and stated turnaround (LW-3,
 * TA-3), the ordering department (LW-5), a fixed number of round trips (§11), release and rejection
 * moving a row between lists (S8, S9), and the lab permission guard on the server (S16).
 */
import { randomUUID } from "node:crypto";
import type { Lane } from "./_pglite";
import type { EmrActor } from "@/lib/emr/actor";
import type { WriteCtx } from "@/lib/emr/write/context";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { withPatientWrite } from "@/lib/emr/write/context";
import { placeOrders } from "@/lib/emr/write/orders";
import { enterResults, releaseResults } from "@/lib/emr/write/results";
import { collectSpecimen, receiveSpecimen, rejectSpecimen } from "@/lib/emr/write/specimens";
import { generateKey } from "@/lib/encryption";
import { LAB_PERMISSIONS } from "@/lib/lab/access";
import {
  loadLabWorklist,
  loadRejectableSpecimen,
  loadRejected,
  loadReleasedToday,
} from "@/lib/lab/read";
import { computeWorklist } from "@/lib/lab/worklist";
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

const held = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("@/db", () => ({
  get db() {
    return held.db;
  },
}));

const GLUCOSE_FASTING = "79a7098d-6585-5bff-ab14-3a4a09b3bf68";
const key = () => `k-${randomUUID()}`;
const TZ = "Africa/Kampala";

describe.skipIf(!laneOn)("lab reads (PGlite lane)", () => {
  let lane: Lane;
  let hA: string;
  let hB: string;
  let ward: string;
  let chem: string;
  const actors: Record<string, EmrActor> = {};

  beforeAll(async () => {
    process.env.MEDSYNC_PHI_KEY ??= generateKey();
    lane = await bootLane();
    held.db = lane.db;
    hA = await hospital(lane.pg, "Lab reads A");
    hB = await hospital(lane.pg, "Lab reads B");
    // A Laboratory department with a Clinical chemistry section, as the hub builds them.
    const lab = (
      await lane.pg.query<{ id: string }>(
        `INSERT INTO hospital_departments (hospital_id, name, slug, kind, catalogue_code, medsync_live_at)
         VALUES ($1, 'Laboratory', 'lab-${randomUUID().slice(0, 6)}', 'diagnostic', 'LABORATORY', now()) RETURNING id`,
        [hA],
      )
    ).rows[0]!.id;
    chem = (
      await lane.pg.query<{ id: string }>(
        `INSERT INTO hospital_departments (hospital_id, parent_id, name, slug, kind, catalogue_code, medsync_live_at)
         VALUES ($1, $2, 'Clinical chemistry', 'chem-${randomUUID().slice(0, 6)}', 'diagnostic', 'CLIN_CHEM', now()) RETURNING id`,
        [hA, lab],
      )
    ).rows[0]!.id;
    ward = await department(lane.pg, hA, "Ward 4A");
    const wardB = await department(lane.pg, hB, "Ward B");
    const labB = await department(lane.pg, hB, "Laboratory");
    const make = async (h: string, d: string, cadreCode: string, surface: EmrActor["surface"]) => ({
      ...(await clinician(lane.pg, { hospitalId: h, departmentId: d, cadre: cadreCode })),
      fullName: null,
      hospitalId: h,
      departmentId: d,
      cadreCode,
      isClinical: true,
      surface,
    });
    actors.doctorA = await make(hA, ward, "MEDICAL_OFFICER", "doctor");
    actors.nurseA = await make(hA, ward, "NURSE", "nurse");
    actors.labA = await make(hA, lab, "LAB_TECH", "lab");
    actors.doctorB = await make(hB, wardB, "MEDICAL_OFFICER", "doctor");
    actors.nurseB = await make(hB, wardB, "NURSE", "nurse");
    actors.labB = await make(hB, labB, "LAB_TECH", "lab");
  }, 180_000);

  const as = <T>(a: EmrActor, p: string, fn: (ctx: WriteCtx) => Promise<T>) =>
    withPatientWrite(a, p, fn, { database: lane.db });

  /** A patient at hospital `h` with one collected glucose order; optionally received. */
  async function specimen(h: "A" | "B", opts: { receive?: boolean; priority?: string } = {}) {
    const hospitalId = h === "A" ? hA : hB;
    const doctor = actors[`doctor${h}`]!;
    const p = await patient(lane.pg);
    await intake(lane.pg, { hospitalId, patientUserId: p });
    const enc = await encounter(lane.pg, {
      hospitalId,
      patientUserId: p,
      clinicianUserId: doctor.userId,
      departmentId: doctor.departmentId!,
    });
    const order = await as(doctor, p, (ctx) =>
      placeOrders(ctx, {
        patientUserId: p,
        encounterId: enc,
        orders: [
          {
            clientKey: key(),
            testId: GLUCOSE_FASTING,
            priority: (opts.priority ?? "routine") as "routine",
            reasonText: "Check",
          },
        ],
      }),
    );
    const s = await as(actors[`nurse${h}`]!, p, (ctx) =>
      collectSpecimen(ctx, {
        patientUserId: p,
        orderId: order.id,
        identifiersConfirmed: true,
        fastingState: "fasting",
        fastingHours: 9,
        clientKey: key(),
      }),
    );
    if (opts.receive)
      await as(actors[`lab${h}`]!, p, (ctx) =>
        receiveSpecimen(ctx, { patientUserId: p, specimenId: s.id, clientKey: key() }),
      );
    return { p, orderId: order.id, specimenId: s.id };
  }
  const glucose = {
    conceptId: "obs.glucose",
    value: "5.1",
    unit: "mmol/L",
    referenceRange: { low: 3.9, high: 5.5, unit: "mmol/L" },
  };

  it("LW-2, LW-5, LW-9: stages, times and the ordering department, one hospital only", async () => {
    const a1 = await specimen("A");
    const a2 = await specimen("A", { receive: true });
    const b1 = await specimen("B", { receive: true });
    const data = await loadLabWorklist(hA, lane.db);
    const ids = data.inputs.map((i) => i.orderId);
    expect(ids).toEqual(expect.arrayContaining([a1.orderId, a2.orderId]));
    expect(ids).not.toContain(b1.orderId);
    expect(data.inputs.every((i) => i.hospitalId === hA)).toBe(true);
    const one = data.inputs.find((i) => i.orderId === a1.orderId)!;
    expect(one).toMatchObject({
      stage: "to_receive",
      receivedAt: null,
      from: { id: ward, name: expect.stringContaining("Ward 4A") },
    });
    expect(one.collectedAt).toBeInstanceOf(Date);
    const two = data.inputs.find((i) => i.orderId === a2.orderId)!;
    expect(two.stage).toBe("to_result");
    expect(two.receivedAt).toBeInstanceOf(Date);
    expect(data.sections).toEqual([{ id: chem, name: "Clinical chemistry", code: "CLIN_CHEM" }]);
  });

  it("LW-3, TA-3, TM-3: the test's hub offering gives the section and the stated turnaround; none gives No section", async () => {
    const one = await specimen("A", { receive: true });
    // Lab test menu v2: the offering is keyed by the test itself (this fixture's unit has no A.3 code, so the
    // catalogue section maps to no unit and only the offering's own unit places the row).
    await lane.pg.query(
      `INSERT INTO diagnostic_offerings (hospital_id, kind, code, provision, section_id, stated_tat)
       VALUES ($1, 'lab', 'test.glucose_fasting', 'in_house', $2, '1 h') ON CONFLICT DO NOTHING`,
      [hA, chem],
    );
    const viewer = { hospitalId: hA, permissions: new Set(LAB_PERMISSIONS), sectionIds: [chem] };
    const data = await loadLabWorklist(hA, lane.db);
    const w = computeWorklist({
      rows: data.inputs,
      sections: data.sections,
      viewer,
      filters: {},
      serverNow: new Date(),
    });
    expect(w.rows.find((r) => r.orderId === one.orderId)).toMatchObject({
      sectionId: chem,
      target: { minutes: 60, source: "facility" },
    });
    expect(w.section).toBe(chem);
    await lane.pg.query(
      `DELETE FROM diagnostic_offerings WHERE hospital_id = $1 AND code = 'test.glucose_fasting'`,
      [hA],
    );
    const again = await loadLabWorklist(hA, lane.db);
    const everything = computeWorklist({
      rows: again.inputs,
      sections: again.sections,
      viewer: { ...viewer, sectionIds: [] },
      filters: {},
      serverNow: new Date(),
    });
    expect(everything.rows.find((r) => r.orderId === one.orderId)).toMatchObject({
      sectionId: null,
      target: null,
    });
  });

  it("§11: a fixed number of round trips whatever the row count", async () => {
    // Count every statement: on the connection, and inside transactions (loadEmrLabWorklist's).
    let statements = 0;
    const pg = lane.pg as unknown as Record<string, (...a: unknown[]) => unknown>;
    const real = { query: pg.query!, exec: pg.exec!, transaction: pg.transaction! };
    const counted =
      (fn: (...a: unknown[]) => unknown, self: unknown) =>
      (...a: unknown[]) => {
        statements += 1;
        return fn.apply(self, a);
      };
    pg.query = counted(real.query, lane.pg);
    pg.exec = counted(real.exec, lane.pg);
    pg.transaction = (fn: unknown) =>
      real.transaction.call(lane.pg, (tx: Record<string, (...a: unknown[]) => unknown>) => {
        tx.query = counted(tx.query!, tx);
        tx.exec = counted(tx.exec!, tx);
        return (fn as (t: unknown) => unknown)(tx);
      });
    const count = async () => {
      statements = 0;
      await loadLabWorklist(hA, lane.db);
      return statements;
    };
    try {
      // From one row up the count is fixed (an empty list skips the follow-up reads entirely).
      await specimen("A", { receive: true });
      const before = await count();
      await specimen("A", { receive: true });
      await specimen("A");
      await specimen("A", { receive: true });
      const after = await count();
      expect(after).toBe(before);
      // 9 statements, or 10 when an order carries a LOINC code (the offering lookup).
      expect(after).toBeLessThanOrEqual(10);
    } finally {
      Object.assign(pg, real);
    }
  });

  it("S8: release moves a row from the worklist to Released today, with its turnaround", async () => {
    const s = await specimen("A", { receive: true });
    const prelim = await as(actors.labA!, s.p, (ctx) =>
      enterResults(ctx, {
        patientUserId: s.p,
        orderId: s.orderId,
        status: "preliminary",
        values: [glucose],
        clientKey: key(),
      }),
    );
    expect(
      (await loadLabWorklist(hA, lane.db)).inputs.find((i) => i.orderId === s.orderId)?.stage,
    ).toBe("preliminary");
    await as(actors.labA!, s.p, (ctx) =>
      releaseResults(ctx, { patientUserId: s.p, reportId: prelim.id, clientKey: key() }),
    );
    expect((await loadLabWorklist(hA, lane.db)).inputs.map((i) => i.orderId)).not.toContain(
      s.orderId,
    );
    const released = await loadReleasedToday(hA, new Date(), TZ, lane.db);
    const row = released.find((r) => r.orderId === s.orderId);
    expect(row).toMatchObject({ state: "final", releasedByCadre: expect.any(String) });
    expect(row?.turnaround?.minutes).toBeGreaterThanOrEqual(0);
    expect(await loadReleasedToday(hB, new Date(), TZ, lane.db)).toEqual([]);
  });

  it("S9: rejection moves a row to Rejected with its coded reason; re-collection is shown", async () => {
    const s = await specimen("A");
    await as(actors.labA!, s.p, (ctx) =>
      rejectSpecimen(ctx, {
        patientUserId: s.p,
        specimenId: s.specimenId,
        reasonCode: "haemolysed",
        clientKey: key(),
      }),
    );
    expect((await loadLabWorklist(hA, lane.db)).inputs.map((i) => i.orderId)).not.toContain(
      s.orderId,
    );
    let rejected = (await loadRejected(hA, new Date(), lane.db)).find(
      (r) => r.orderId === s.orderId,
    );
    expect(rejected).toMatchObject({
      reasonCode: "haemolysed",
      recollectedAt: null,
      rejectedByCadre: expect.any(String),
    });
    await as(actors.nurseA!, s.p, (ctx) =>
      collectSpecimen(ctx, {
        patientUserId: s.p,
        orderId: s.orderId,
        identifiersConfirmed: true,
        fastingState: "fasting",
        fastingHours: 9,
        clientKey: key(),
      }),
    );
    rejected = (await loadRejected(hA, new Date(), lane.db)).find((r) => r.orderId === s.orderId);
    expect(rejected?.recollectedAt).toBeInstanceOf(Date);
    expect(
      (await loadLabWorklist(hA, lane.db)).inputs.find((i) => i.orderId === s.orderId)?.stage,
    ).toBe("to_receive");
    expect(await loadRejected(hB, new Date(), lane.db)).toEqual([]);
  });

  it("Reject on the result screen: only this order's own specimen and report count", async () => {
    // Another order released at the same hospital must not hide this one's Reject (STOP 4 bug).
    const other = await specimen("A", { receive: true });
    const op = await as(actors.labA!, other.p, (ctx) =>
      enterResults(ctx, {
        patientUserId: other.p,
        orderId: other.orderId,
        status: "preliminary",
        values: [glucose],
        clientKey: key(),
      }),
    );
    await as(actors.labA!, other.p, (ctx) =>
      releaseResults(ctx, { patientUserId: other.p, reportId: op.id, clientKey: key() }),
    );
    const s = await specimen("A", { receive: true });
    expect(await loadRejectableSpecimen(hA, s.orderId, lane.db)).toBe(s.specimenId);
    expect(await loadRejectableSpecimen(hA, other.orderId, lane.db)).toBeNull();
    expect(await loadRejectableSpecimen(hB, s.orderId, lane.db)).toBeNull();
    await as(actors.labA!, s.p, (ctx) =>
      rejectSpecimen(ctx, {
        patientUserId: s.p,
        specimenId: s.specimenId,
        reasonCode: "clotted",
        clientKey: key(),
      }),
    );
    expect(await loadRejectableSpecimen(hA, s.orderId, lane.db)).toBeNull();
  });

  it("S16, LA-7: a lab actor without the permission is refused on the server", async () => {
    const s = await specimen("A");
    const narrowed: EmrActor = {
      ...actors.labA!,
      labPermissions: ["lab.view", "lab.result.enter"],
    };
    const refused = await as(narrowed, s.p, (ctx) =>
      receiveSpecimen(ctx, { patientUserId: s.p, specimenId: s.specimenId, clientKey: key() }),
    ).then(
      () => "ok",
      (e: { code?: string }) => e.code,
    );
    expect(refused).toBe("forbidden");
    const full: EmrActor = { ...actors.labA!, labPermissions: [...LAB_PERMISSIONS] };
    await expect(
      as(full, s.p, (ctx) =>
        receiveSpecimen(ctx, { patientUserId: s.p, specimenId: s.specimenId, clientKey: key() }),
      ),
    ).resolves.toBeTruthy();
  });
});
