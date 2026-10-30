/**
 * Removing the pharmacy demo (owner request 28 Oct 2026; migration 0260) on the PGlite lane. Since the rework (0265,
 * S14) removal is a dry run only: demos run in a separate project, and the live database never disables a trigger. A demo hospital with real
 * rows beside the demo: a real pharmacy head, a real patient's visit, and a real pharmacist affiliated to
 * one of the demo's points. The removal deletes every demo row and nothing else; the point the real pharmacist uses is
 * kept. Runs with EMR_PGLITE=1.
 */
import type { Lane, Pg } from "./_pglite";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { generateKey } from "@/lib/encryption";
import { bootLane, encounter, hospital, laneOn, patient, staff, superadmin } from "./_pglite";
import { PHARMACY_FLAGS } from "./_pharmacy-demo";

vi.mock("server-only", () => ({}));
const held = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("@/db", () => ({
  get db() {
    return held.db;
  },
}));

type Snap = Record<string, string[]>;

describe.skipIf(!laneOn)("Pharmacy demo: remove (0260–0263)", () => {
  let lane: Lane;
  let pg: Pg;
  let h: string;
  let real: string;
  let admin: string;
  let before: Snap;
  let realEntry: string;
  let realCount: string;
  let realPharmacist: string;
  const one = async <T = Record<string, unknown>>(q: string, params: unknown[] = []) =>
    (await pg.query<T>(q, params)).rows[0] as T;
  /** Every table's rows, as text, so a changed row shows as well as a missing one. */
  const snapshot = async (): Promise<Snap> => {
    const tables = (
      await pg.query<{ t: string }>(
        `SELECT table_schema || '.' || table_name AS t FROM information_schema.tables
          WHERE table_schema IN ('public', 'auth') AND table_type = 'BASE TABLE'`,
      )
    ).rows;
    const out: Snap = {};
    for (const { t } of tables)
      out[t] = (await pg.query<{ r: string }>(`SELECT x::text AS r FROM ${t} x`)).rows
        .map((r) => r.r)
        .sort();
    return out;
  };
  const remove = async (dry: boolean) =>
    (
      await one<{ r: Record<string, number> }>(
        `SELECT public.pharmacy_demo_remove($1, $2, $3) AS r`,
        [h, admin, dry],
      )
    ).r;

  beforeAll(async () => {
    process.env.MEDSYNC_PHI_KEY ??= generateKey();
    for (const k of PHARMACY_FLAGS) process.env[k] = "1";
    lane = await bootLane();
    pg = lane.pg;
    held.db = lane.db;
    h = await hospital(pg, "Demo national referral");
    real = await hospital(pg, "Real");
    admin = await superadmin(pg);
    await pg.query(
      `INSERT INTO lab_demo_hospitals (hospital_id, marked_by, note) VALUES ($1, $2, 'Demo sandbox')`,
      [h, admin],
    );
    // Real rows: the pharmacy with its head, and a real patient's visit.
    const pharm = (
      await one<{ id: string }>(
        `INSERT INTO hospital_departments (hospital_id, name, slug, kind, catalogue_code)
         VALUES ($1, 'Pharmacy', 'pharmacy', 'support', 'PHARMACY') RETURNING id`,
        [h],
      )
    ).id;
    const head = await staff(pg, { hospitalId: h, departmentId: pharm, cadre: "PHARMACIST" });
    await pg.query(
      `INSERT INTO department_heads (hospital_id, department_id, user_id, acting) VALUES ($1, $2, $3, false)`,
      [h, pharm, head.userId],
    );
    const doctor = await staff(pg, { hospitalId: h, departmentId: pharm });
    const realPatient = await patient(pg);
    await encounter(pg, {
      hospitalId: h,
      patientUserId: realPatient,
      clinicianUserId: doctor.userId,
      departmentId: pharm,
    });
    // A real AWaRe edition, written and signed by real staff before the demo (production, 29 Oct 2026). The demo's own
    // edition replaces it, so the demo chief pharmacist is its `withdrawn_by`; it is still real and stays.
    realEntry = (
      await one<{ id: string }>(
        `INSERT INTO pharmacy_content_entries (hospital_id, pack, key, version, payload, status, author_user_id, in_force_at)
         VALUES ($1, 'aware_pack', 'edition', 1, '{}', 'in_force', $2, now()) RETURNING id`,
        [h, head.userId],
      )
    ).id;
    const att = (
      await one<{ id: string }>(
        `INSERT INTO pharmacy_attestations (hospital_id, actor_user_id, attester_user_id, purpose, action, outcome)
         VALUES ($1, $2, $2, 'signer', 'sign_pack', 'passed') RETURNING id`,
        [h, head.userId],
      )
    ).id;
    await pg.query(
      `INSERT INTO pharmacy_content_signatures (entry_id, hospital_id, signer_user_id, role, attestation_id)
       VALUES ($1, $2, $3, 'cso', $4)`,
      [realEntry, h, head.userId, att],
    );
    before = await snapshot();

    const { loadPharmacyDemo } = await import("@/lib/pharmacy/demo");
    const deps = {
      makeUser: async () =>
        (
          await one<{ id: string }>(
            `INSERT INTO auth.users (email) VALUES ('pharmacy-demo-' || gen_random_uuid() || '@demo.medsync.invalid') RETURNING id`,
          )
        ).id,
    };
    const r = await loadPharmacyDemo(lane.db, { userId: admin, hospitalId: h }, deps);
    expect(r.notes).toEqual({});
  }, 900_000);

  it("refuses a hospital that is not a demo hospital", async () => {
    await expect(
      pg.query(`SELECT public.pharmacy_demo_remove($1, $2, true)`, [real, admin]),
    ).rejects.toThrow(/not a demo hospital/);
  });

  it("a dry run counts the demo and deletes nothing", async () => {
    const dry = await remove(true);
    expect(dry).toMatchObject({ patients: 60, staff: 35 });
    expect(dry.prescriptions).toBeGreaterThan(200);
    expect(dry.records).toBeGreaterThan(5000);
    expect(
      (await one<{ n: number }>(`SELECT count(*)::int AS n FROM pharmacy_demo_patients`)).n,
    ).toBe(60);
  });

  it("a real pharmacist's work on demo records waits for the removal", async () => {
    // Production, 29 Oct 2026: real staff accepted and dispensed demo patients' prescriptions. A real pharmacist at a
    // demo point counts a demo batch and accepts a demo prescription; the removal (next test) takes that work too.
    const demoPoint = (
      await one<{ id: string }>(
        `SELECT id FROM hospital_departments WHERE hospital_id = $1 AND name = 'Main outpatient pharmacy'`,
        [h],
      )
    ).id;
    const real = await staff(pg, { hospitalId: h, departmentId: demoPoint, cadre: "PHARMACIST" });
    const batch = (
      await one<{ id: string }>(`SELECT id FROM pharmacy_batches WHERE hospital_id = $1 LIMIT 1`, [
        h,
      ])
    ).id;
    realCount = (
      await one<{ id: string }>(
        `INSERT INTO pharmacy_counts (hospital_id, dispensing_point_id, scope, counted_by) VALUES ($1, $2, 'full', $3)
         RETURNING id`,
        [h, demoPoint, real.userId],
      )
    ).id;
    await pg.query(
      `INSERT INTO pharmacy_count_lines (count_id, batch_id, counted_quantity, recorded_balance) VALUES ($1, $2, 1, 1)`,
      [realCount, batch],
    );
    const rx = await one<{ id: string; patient_user_id: string }>(
      `SELECT id, patient_user_id FROM prescriptions
        WHERE patient_user_id IN (SELECT patient_user_id FROM pharmacy_demo_patients) LIMIT 1`,
    );
    await pg.query(
      `INSERT INTO pharmacy_line_events (hospital_id, prescription_id, patient_user_id, kind, actor_user_id)
       VALUES ($1, $2, $3, 'reviewed', $4)`,
      [h, rx.id, rx.patient_user_id, real.userId],
    );
    // A table the demo itself never writes: the payment the real pharmacist recorded on the demo prescription.
    await pg.query(
      `INSERT INTO pharmacy_payment_statuses (hospital_id, patient_user_id, prescription_id, status, dispensing_point_id,
         actor_user_id) VALUES ($1, $2, $3, 'paid', $4, $5)`,
      [h, rx.patient_user_id, rx.id, demoPoint, real.userId],
    );
    // Production, 29 Oct 2026: the append-only "who viewed which patient" log names the demo patient they opened.
    await pg.query(
      `INSERT INTO clinical_phi_access_log (hospital_id, clinician_user_id, patient_user_id, access_basis)
       VALUES ($1, $2, $3, 'care_team')`,
      [h, real.userId, rx.patient_user_id],
    );
    realPharmacist = real.userId;
  });

  it("rework S14: removal is off; nothing is deleted and no trigger is disabled", async () => {
    const now = await snapshot();
    await expect(remove(false)).rejects.toThrow(/removal is off/);
    expect(await snapshot()).toEqual(now);
    expect(Object.keys(now).length).toBeGreaterThanOrEqual(Object.keys(before).length);
    expect([realCount, realPharmacist].every(Boolean)).toBe(true);
    const triggersOff = await one<{ n: number }>(
      `SELECT count(*)::int AS n FROM pg_trigger WHERE NOT tgisinternal AND tgenabled = 'D'`,
    );
    expect(triggersOff.n).toBe(0);
  });
});
