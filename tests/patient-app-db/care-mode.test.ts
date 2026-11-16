/**
 * Care mode engine on real Postgres (migration 0301; patient app v2 §8.1; ADR 0519). PGlite lane only.
 * S18 offline readings and ticks sync once · S19 a danger reading tells the team, paid or not (MR9) ·
 * S20 names only with consent (MR8) · MR3 no dose in a plan · RLS for patient, team, helper, desk ·
 * programmes priced from an approved list, four-eyes, never ranked; a paid period switches proactive work on.
 */
import type { Actor, Pg } from "../emr-db/_pglite";
import { beforeAll, describe, expect, it } from "vitest";

import {
  authUser,
  bootLane,
  department,
  hospital,
  laneOn,
  patient,
  probe,
  reception,
} from "../emr-db/_pglite";

const as = (userId: string | null): Actor => ({ userId, role: userId ? "authenticated" : "anon" });

let pg: Pg;
let H: string,
  P: string,
  Q: string,
  NURSE: string,
  NUT: string,
  HELPER: string,
  DESK: string,
  ADMIN1: string,
  ADMIN2: string;
let E: string, PLAN: string, PROG: string;

const q = async <T = Record<string, unknown>>(sql: string, params?: unknown[]) =>
  (await pg.query<T>(sql, params)).rows;
const reading = async (key: string, kind: string, v1: number, v2: number | null = null) =>
  (
    await q<{ reading_id: string; created: boolean }>(
      `SELECT * FROM public.care_record_reading($1, $2, $3, $4, $5, 'u', null, now())`,
      [P, key, kind, v1, v2],
    )
  )[0]!;

describe.skipIf(!laneOn)("care mode (0301)", () => {
  beforeAll(async () => {
    ({ pg } = await bootLane());
    H = await hospital(pg, "Care");
    const D = await department(pg, H);
    P = await patient(pg);
    Q = await patient(pg);
    NURSE = await authUser(pg, "nurse");
    NUT = await authUser(pg, "nutritionist");
    HELPER = await authUser(pg, "daughter");
    DESK = (await reception(pg, { hospitalId: H, departmentId: D })).userId;
    ADMIN1 = await authUser(pg, "admin1");
    ADMIN2 = await authUser(pg, "admin2");
    await q(
      `INSERT INTO public.user_roles (user_id, role, hospital_id) VALUES ($1,'hospital_admin',$3),($2,'hospital_admin',$3)`,
      [ADMIN1, ADMIN2, H],
    );
    PROG = (
      await q<{ id: string }>(
        `INSERT INTO public.care_programmes (hospital_id, condition, name, team, monthly_ugx, quarterly_ugx, yearly_ugx,
           proposed_by, approved_by, approved_at)
         VALUES ($1, 'diabetes', 'Diabetes, nurse and nutrition',
           '[{"role":"nurse","monthlyCostUgx":1500000,"caseload":200},{"role":"nutritionist","monthlyCostUgx":1800000,"caseload":400}]',
           30000, 85500, 300000, $2, $3, now()) RETURNING id`,
        [H, ADMIN1, ADMIN2],
      )
    )[0]!.id;
    E = (
      await q<{ id: string }>(
        `INSERT INTO public.care_enrolments (patient_user_id, hospital_id, programme, enrolled_by, programme_id)
         VALUES ($1, $2, 'diabetes', $3, $4) RETURNING id`,
        [P, H, NURSE, PROG],
      )
    )[0]!.id;
    await q(
      `INSERT INTO public.care_team_members (enrolment_id, user_id, role, first_contact, name_consent)
       VALUES ($1, $2, 'nurse', true, true), ($1, $3, 'nutritionist', false, false)`,
      [E, NURSE, NUT],
    );
    await q(
      `INSERT INTO public.care_helpers (patient_user_id, helper_user_id, scope) VALUES ($1, $2, 'readings')`,
      [P, HELPER],
    );
    PLAN = (
      await q<{ id: string }>(
        `INSERT INTO public.care_plan_versions (enrolment_id, version, items, targets, authored_by)
         VALUES ($1, 1, '[{"key":"metformin","name":"Metformin","times":["08:00","20:00"]}]',
                 '{"sugar_fasting_max":7.2,"set_by":"doctor"}', $2) RETURNING id`,
        [E, NURSE],
      )
    )[0]!.id;
  }, 120_000);

  it("S18: a reading or a tick sent twice is saved once", async () => {
    const a = await reading("offline-key-0001", "glucose", 6.1);
    const b = await reading("offline-key-0001", "glucose", 6.1);
    expect(a.created).toBe(true);
    expect(b).toEqual({ reading_id: a.reading_id, created: false });
    const dose = `SELECT * FROM public.care_record_dose($1, 'dose-key-0001', $2, 'metformin', now(), 'taken', null)`;
    const d1 = (await q<{ created: boolean }>(dose, [P, PLAN]))[0]!;
    const d2 = (await q<{ created: boolean }>(dose, [P, PLAN]))[0]!;
    expect([d1.created, d2.created]).toEqual([true, false]);
  });

  it("S19: a danger reading raises one alert for the team, with no programme fee paid", async () => {
    const { reading_id } = await reading("low-sugar-0001", "glucose", 3.2);
    const [a] = await q<{ id: string | null }>(
      `SELECT public.care_raise_alert($1, 'low_sugar', '0.1.0') AS id`,
      [reading_id],
    );
    const [again] = await q<{ id: string | null }>(
      `SELECT public.care_raise_alert($1, 'low_sugar', '0.1.0') AS id`,
      [reading_id],
    );
    expect(a!.id).not.toBeNull();
    expect(again!.id).toBeNull();
    const [st] = await q<{ proactive_active: boolean }>(
      `SELECT proactive_active FROM public.care_programme_status WHERE enrolment_id = $1`,
      [E],
    );
    expect(st!.proactive_active).toBe(false);
    const seen = await probe(
      pg,
      as(NURSE),
      `SELECT id FROM public.care_alerts WHERE reading_id = $1`,
      [reading_id],
    );
    expect(seen.ok && seen.rows.length).toBe(1);
  });

  it("MR3: a plan item that carries a dose is refused", async () => {
    await expect(
      q(
        `INSERT INTO public.care_plan_versions (enrolment_id, version, items, targets, authored_by)
         VALUES ($1, 2, '[{"key":"metformin","dose":"500mg"}]', '{}', $2)`,
        [E, NURSE],
      ),
    ).rejects.toThrow(/care_plan_no_dose/);
  });

  it("RLS: patient and team read the thread; the desk, other patients and a readings-only helper do not", async () => {
    await q(`SELECT public.care_patient_message($1, 'msg-key-0001', 'My feet are sore')`, [P]);
    const count = async (who: string) => {
      const r = await probe(
        pg,
        as(who),
        `SELECT id FROM public.care_messages WHERE enrolment_id = $1`,
        [E],
      );
      return r.ok ? r.rows.length : -1;
    };
    expect(await count(P)).toBe(1);
    expect(await count(NURSE)).toBe(1);
    expect(await count(DESK)).toBe(0);
    expect(await count(Q)).toBe(0);
    expect(await count(HELPER)).toBe(0);
    const team = await probe(
      pg,
      as(NURSE),
      `INSERT INTO public.care_messages (enrolment_id, author_user_id, from_patient, body) VALUES ($1, $2, false, 'Rest them tonight')`,
      [E, NURSE],
    );
    expect(team.ok).toBe(true);
    const forged = await probe(
      pg,
      as(Q),
      `INSERT INTO public.care_messages (enrolment_id, author_user_id, from_patient, body) VALUES ($1, $2, false, 'x')`,
      [E, Q],
    );
    expect(forged.ok).toBe(false);
  });

  it("a readings-only helper sees readings but not the plan or the doses", async () => {
    const readings = await probe(
      pg,
      as(HELPER),
      `SELECT id FROM public.personal_health_logs WHERE patient_user_id = $1`,
      [P],
    );
    expect(readings.ok && readings.rows.length).toBeGreaterThan(0);
    const plan = await probe(
      pg,
      as(HELPER),
      `SELECT id FROM public.care_plan_versions WHERE enrolment_id = $1`,
      [E],
    );
    expect(plan.ok && plan.rows.length).toBe(0);
    const doses = await probe(
      pg,
      as(HELPER),
      `SELECT id FROM public.dose_events WHERE patient_user_id = $1`,
      [P],
    );
    expect(doses.ok && doses.rows.length).toBe(0);
  });

  it("S20: roles always; who the person is only with consent", async () => {
    const r = await probe(
      pg,
      as(P),
      `SELECT role, member_user_id FROM public.care_team_view WHERE enrolment_id = $1 ORDER BY role`,
      [E],
    );
    expect(r.ok && r.rows).toEqual([
      { role: "nurse", member_user_id: NURSE },
      { role: "nutritionist", member_user_id: null },
    ]);
  });

  it("programmes: four-eyes approval and never ranked by name", async () => {
    const ins = (name: string, approver: string) =>
      q(
        `INSERT INTO public.care_programmes (hospital_id, condition, name, team, monthly_ugx, quarterly_ugx, yearly_ugx,
           proposed_by, approved_by, approved_at)
         VALUES ($1, 'hypertension', $2, '[{"role":"nurse","monthlyCostUgx":1500000,"caseload":200}]', 25000, 71250, 250000,
           $3, $4, now())`,
        [H, name, ADMIN1, approver],
      );
    await expect(ins("Blood pressure, nurse-led", ADMIN1)).rejects.toThrow(/four_eyes/);
    await expect(ins("Premium blood pressure", ADMIN2)).rejects.toThrow(/check/);
    await ins("Blood pressure, nurse-led", ADMIN2);
  });

  it("a programme bill comes from the approved price; paying it switches proactive work on", async () => {
    const [addon] = await q<{ id: string }>(
      `INSERT INTO public.care_programme_addons (hospital_id, kind, monthly_ugx, proposed_by, approved_by, approved_at)
       VALUES ($1, 'counselling', 12000, $2, $3, now()) RETURNING id`,
      [H, ADMIN1, ADMIN2],
    );
    await q(`UPDATE public.care_enrolments SET addon_ids = ARRAY[$2::uuid] WHERE id = $1`, [
      E,
      addon!.id,
    ]);
    await expect(
      q(`SELECT public.care_programme_bill($1, 'monthly', current_date, 30000)`, [E]),
    ).rejects.toThrow(/platform share/);
    const b = (
      await q<{ b: string }>(
        `SELECT public.care_programme_bill($1, 'monthly', current_date, 9000) AS b`,
        [E],
      )
    )[0]!.b;
    const [bill] = await q<{ total_ugx: number; platform_share_ugx: number; kind: string }>(
      `SELECT * FROM public.bills WHERE id = $1`,
      [b],
    );
    expect(bill).toMatchObject({ total_ugx: 42000, platform_share_ugx: 9000, kind: "programme" });
    const [i] = await q<{ id: string }>(
      `SELECT (public.pay_intent_start($1, 'prog-key-0001', 'app', 'mtn', null, $2, 'sandbox')).id`,
      [b, P],
    );
    await q(`SELECT public.pay_intent_prompted($1, 'sbx_prog-key-0001')`, [i!.id]);
    expect(
      (
        await q<{ r: string }>(
          `SELECT public.pay_apply_event('sandbox','prog-evt-1','sbx_prog-key-0001','succeeded',42000,true) AS r`,
        )
      )[0]!.r,
    ).toBe("paid");
    const [st] = await q<{ proactive_active: boolean }>(
      `SELECT proactive_active FROM public.care_programme_status WHERE enrolment_id = $1`,
      [E],
    );
    expect(st!.proactive_active).toBe(true);
  });
});
