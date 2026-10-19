/**
 * Lab Phase 2, Step 5: one menu on the PGlite lane (S19–S24, and G1 proved red then green). Lab test menu v2
 * (TM-3): the hub row is keyed by the test itself, so there is no link step. The hub rows are
 * FIXTURES (an invented stated turnaround, an invented referral laboratory). Runs with EMR_PGLITE=1.
 */
import { randomUUID } from "node:crypto";
import type { Lane, Pg } from "./_pglite";
import type { EmrActor } from "@/lib/emr/actor";
import type { WriteCtx } from "@/lib/emr/write/context";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { loadTestMenu } from "@/lib/emr/read/orders";
import { withPatientWrite } from "@/lib/emr/write/context";
import { placeOrders } from "@/lib/emr/write/orders";
import { generateKey } from "@/lib/encryption";
import { menuToday } from "@/lib/lab/one-menu-read";
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

const CREAT = "668a99dc-2017-572e-91e8-c3d6ed116ea6";
const HBA1C = "f05a6f3e-5793-584a-a6d2-c357de241001";
const FBC = "bfd23c30-1989-5fdb-8030-c87016ab22c9";
const key = () => `k-${randomUUID()}`;

describe.skipIf(!laneOn)("Lab Phase 2 one menu (Step 5)", () => {
  let lane: Lane;
  let pg: Pg;
  let h: string;
  let doctor: EmrActor;
  let p: string;
  let enc: string;
  const env = { ...process.env };
  const order = (testId: string) =>
    withPatientWrite(
      doctor,
      p,
      (ctx: WriteCtx) =>
        placeOrders(ctx, {
          patientUserId: p,
          encounterId: enc,
          orders: [{ clientKey: key(), testId, priority: "routine", reasonText: "Fixture reason" }],
        }),
      { database: lane.db },
    );
  const offer = (code: string, provision: string, extra = "") =>
    pg.query(
      `INSERT INTO diagnostic_offerings (hospital_id, kind, code, provision, hours, stated_tat, referred_to, confirmed_at)
       VALUES ($1, 'lab', $2, $3, ${provision === "in_house" ? "'24h'" : "NULL"}, 'fixture 2 h',
               ${provision === "referred" ? "'Fixture reference lab'" : "NULL"}, now()) ${extra}
       ON CONFLICT (hospital_id, kind, code) DO UPDATE SET provision = EXCLUDED.provision`,
      [h, code, provision],
    );

  beforeAll(async () => {
    process.env.MEDSYNC_PHI_KEY ??= generateKey();
    lane = await bootLane();
    pg = lane.pg;
    h = await hospital(pg, "One menu");
    const ward = await department(pg, h, "Ward");
    doctor = {
      ...(await clinician(pg, { hospitalId: h, departmentId: ward, cadre: "MEDICAL_OFFICER" })),
      fullName: null,
      hospitalId: h,
      departmentId: ward,
      cadreCode: "MEDICAL_OFFICER",
      isClinical: true,
      surface: "doctor",
    };
    p = await patient(pg);
    await intake(pg, { hospitalId: h, patientUserId: p });
    enc = await encounter(pg, {
      hospitalId: h,
      patientUserId: p,
      clinicianUserId: doctor.userId,
      departmentId: ward,
    });
    await offer("test.creatinine", "not_offered");
  }, 300_000);
  afterAll(() => {
    process.env.LAB_WORKSPACE = env.LAB_WORKSPACE;
    process.env.LAB_ONE_MENU = env.LAB_ONE_MENU;
  });

  it("G1 (red before): with one menu off, a test the hub marks not offered is still ordered", async () => {
    process.env.LAB_WORKSPACE = "";
    process.env.LAB_ONE_MENU = "";
    await expect(order(CREAT)).resolves.toMatchObject({ id: expect.any(String) });
  });

  it("S20, OM-4 (G1 green): with one menu on, it is refused, and it has no Add in the menu", async () => {
    process.env.LAB_WORKSPACE = "1";
    process.env.LAB_ONE_MENU = "1";
    await expect(order(CREAT)).rejects.toThrow(/Not offered at One menu/);
    const menu = await loadTestMenu(lane.db, h);
    expect(menu.find((t) => t.code === "test.creatinine")?.today).toMatchObject({
      orderable: false,
    });
  });

  it("S21, OM-1, TM-3: a test not on this hospital's menu is hidden from doctors and cannot be ordered", async () => {
    const menu = await loadTestMenu(lane.db, h);
    expect(menu.find((t) => t.code === "test.hba1c")).toBeUndefined();
    await expect(order(HBA1C)).rejects.toThrow(/Not linked/);
  });

  it("S19, S24, OM-6: the analyser down is said before ordering; the order keeps what it saw", async () => {
    await offer("test.fbc", "in_house");
    await pg.query(
      `INSERT INTO availability_events (hospital_id, problem_id, subject_kind, subject_ref, subject_label, event, state, reason, at)
       VALUES ($1, $2, 'test', 'test.fbc', 'Full blood count', 'reported', 'unavailable', 'equipment_down', now() - interval '30 minutes')`,
      [h, randomUUID()],
    );
    const fbc = (await loadTestMenu(lane.db, h)).find((t) => t.code === "test.fbc");
    expect(fbc?.today?.words).toMatch(
      /^Analyser down since \d\d:\d\d\. Will be referred, result in about fixture 2 h$/,
    );
    const placed = await order(FBC);
    const snap = await pg.query<{ s: Record<string, unknown> }>(
      `SELECT availability_snapshot AS s FROM encounter_orders WHERE id = $1`,
      [placed.id],
    );
    expect(snap.rows[0]!.s).toMatchObject({ state: "down_referred" });
    // S23, OM-7: the hub changes after ordering; the order is not cancelled and keeps its snapshot.
    await pg.query(
      `UPDATE diagnostic_offerings SET provision = 'referred', referred_to = 'Fixture reference lab' WHERE hospital_id = $1 AND code = 'test.fbc'`,
      [h],
    );
    const after = await pg.query<{ s: Record<string, unknown>; n: number }>(
      `SELECT o.availability_snapshot AS s, (SELECT count(*)::int FROM encounter_order_events e WHERE e.order_id = o.id AND e.kind = 'cancelled') AS n
         FROM encounter_orders o WHERE o.id = $1`,
      [placed.id],
    );
    expect(after.rows[0]).toMatchObject({ s: { state: "down_referred" }, n: 0 });
    const today = await menuToday(lane.db, h);
    expect(today("test.fbc")).toMatchObject({
      state: "referred",
      referredTo: "Fixture reference lab",
    });
  });

  it("S22, OM-3: an offering nobody has confirmed reads Not known today, and is orderable", async () => {
    await pg.query(
      `INSERT INTO diagnostic_offerings (hospital_id, kind, code, provision, confirmed_at) VALUES ($1, 'lab', 'test.hba1c', 'in_house', NULL)`,
      [h],
    );
    const t = (await loadTestMenu(lane.db, h)).find((x) => x.code === "test.hba1c");
    expect(t?.today).toMatchObject({ state: "unknown", words: "Not known today", orderable: true });
    await expect(order(HBA1C)).resolves.toMatchObject({ id: expect.any(String) });
  });
});
