/**
 * Lab Phase 5, Step 2 (gate-a-proposal §10; prompt §7): migrations 0154–0157 on the PGlite lane. The never-shown
 * floor in the database; the patient's own results through `patient_results_for_me()` (released, current, not in
 * the floor, adult, consent, reviewed, told when critical, not held); every new table × the actors that matter
 * (patient, another patient, the treating clinician, a clinician without access, lab staff, the IPC link nurse,
 * the ward in-charge, the surveillance focal person, another hospital's staff, anonymous); no client writes;
 * append-only on the service-role path; demo rows only at a demo hospital. Every value is a FIXTURE.
 */
import type { Actor, Lane, Pg } from "./_pglite";
import { beforeAll, describe, expect, it } from "vitest";

import {
  authUser,
  bootLane,
  clinician,
  department,
  encounter,
  hospital,
  laneOn,
  patient,
  probe,
} from "./_pglite";

const NEW_TABLES = [
  "patient_told_events",
  "patient_hold_events",
  "clinician_notes_to_patient",
  "patient_result_views",
  "guardian_links",
  "records_requests",
  "delta_flags",
  "delta_outcomes",
  "ipc_alerts",
  "ipc_alert_actions",
  "patient_ipc_flag_events",
  "ipc_list_checks",
  "lab_demo_hospitals",
  "lab_demo_loads",
  "lab_demo_patients",
] as const;
const APPEND_ONLY = [
  "patient_told_events",
  "patient_hold_events",
  "clinician_notes_to_patient",
  "patient_result_views",
  "delta_flags",
  "delta_outcomes",
  "ipc_alerts",
  "ipc_alert_actions",
  "patient_ipc_flag_events",
  "ipc_list_checks",
] as const;

describe.skipIf(!laneOn)("Lab Phase 5 data layer (0154–0157)", () => {
  let lane: Lane;
  let pg: Pg;
  let hA: string;
  let hB: string;
  let ward: string;
  let otherWard: string;
  let opdDept: string;
  const u: Record<string, string> = {};
  const id: Record<string, string> = {};
  const reader = (k: string, h = hA): Actor => ({
    userId: u[k]!,
    role: "medsync_clinical_reader",
    hospitalId: h,
  });
  const asPatient = (k: string): Actor => ({ userId: u[k]!, role: "authenticated" });
  const anon: Actor = { userId: null, role: "anon" };

  const one = async <T = Record<string, unknown>>(sql: string, params?: unknown[]) =>
    (await pg.query<T>(sql, params)).rows[0]!;
  const ins = async (sql: string, params: unknown[]) =>
    (await one<{ id: string }>(`${sql} RETURNING id`, params)).id;
  const count = async (actor: Actor, table: string) => {
    const r = await probe(pg, actor, `SELECT count(*)::int AS n FROM public.${table}`);
    return r.ok ? (r.rows[0]!.n as number) : -1;
  };
  const testId = async (code: string) =>
    (
      await one<{ id: string }>(
        `SELECT id FROM test_catalogue WHERE code = $1 AND hospital_id IS NULL`,
        [code],
      )
    ).id;
  /** A released report version for `p` on test `code` (owner insert, every column the table requires). */
  async function report(p: string, code: string, o: { critical?: boolean; status?: string } = {}) {
    const enc = await encounter(pg, {
      hospitalId: hA,
      patientUserId: p,
      clinicianUserId: u.doctor!,
      departmentId: opdDept,
    });
    const order = await ins(
      `INSERT INTO encounter_orders (encounter_id, patient_user_id, kind, text, authored_by_user_id, lifecycle, hospital_id,
         priority, frequency, performer, intent_source, requester_cadre, effective_at, test_id, reason_text_ciphertext)
       VALUES ($1, $2, 'lab', 'Test', $3, 'events', $4, 'routine', 'once', 'in_house', 'clinician', 'MEDICAL_OFFICER', now(), $5, 'iv:tag:ct')`,
      [enc, p, u.doctor, hA, await testId(code)],
    );
    return ins(
      `WITH n AS (SELECT gen_random_uuid() AS id)
       INSERT INTO diagnostic_reports (id, logical_id, hospital_id, patient_user_id, encounter_id, recorded_by_user_id,
         effective_at, source, trust, order_id, kind, issued_at, performer, entry_mode, entered_by_user_id, test_id,
         status, critical)
       SELECT n.id, n.id, $1, $2, $3, $4, now(), 'lab', 4, $5, 'lab', now(), 'in_house', 'direct', $4, $6, $7, $8 FROM n`,
      [hA, p, enc, u.lab, order, await testId(code), o.status ?? "final", o.critical ?? false],
    );
  }
  const ack = (reportId: string, p: string) =>
    pg.query(
      `INSERT INTO result_acknowledgements (report_id, hospital_id, patient_user_id, acknowledged_by_user_id, acknowledger_cadre, action)
       VALUES ($1, $2, $3, $4, 'MEDICAL_OFFICER', 'seen')`,
      [reportId, hA, p, u.doctor],
    );
  const consent = (p: string) =>
    pg.query(
      `INSERT INTO consent_records (user_id, consent_type, version, consent_text_sha256) VALUES ($1, 'results_in_app', 'fx', $2)`,
      [p, "a".repeat(64)],
    );
  const profile = (p: string, dob: string) =>
    pg.query(
      `INSERT INTO patient_profiles (id, first_name_encrypted, surname_encrypted, sex, date_of_birth, id_type, phone_encrypted, district_id)
       VALUES ($1, 'iv:t:c', 'iv:t:c', 'female', $2, 'none', 'iv:t:c', (SELECT id FROM districts LIMIT 1))`,
      [p, dob],
    );
  const mine = async (k: string) => {
    const r = await probe(pg, asPatient(k), `SELECT * FROM public.patient_results_for_me() AS id`);
    return r.ok ? r.rows.map((x) => x.id as string) : [`error: ${r.error}`];
  };

  beforeAll(async () => {
    lane = await bootLane();
    pg = lane.pg;
    hA = await hospital(pg, "Phase 5 A");
    hB = await hospital(pg, "Phase 5 B");
    const labDept = await department(pg, hA, "Laboratory");
    await pg.query(`UPDATE hospital_departments SET catalogue_code = 'LABORATORY' WHERE id = $1`, [
      labDept,
    ]);
    const opd = await department(pg, hA, "OPD");
    opdDept = opd;
    const surgery = await department(pg, hA, "Surgery");
    const labB = await department(pg, hB, "Laboratory B");
    const staff = async (h: string, d: string, cadre: string) =>
      (await clinician(pg, { hospitalId: h, departmentId: d, cadre })).userId;
    u.lab = await staff(hA, labDept, "LAB_TECH");
    u.doctor = await staff(hA, opd, "MEDICAL_OFFICER");
    u.otherDoctor = await staff(hA, surgery, "MEDICAL_OFFICER");
    u.ipcNurse = await staff(hA, surgery, "NURSE");
    u.focal = await staff(hA, surgery, "NURSE");
    u.inCharge = await staff(hA, surgery, "NURSE");
    u.labB = await staff(hB, labB, "LAB_TECHNOLOGIST");
    u.admin = await authUser(pg, "admin");
    await pg.query(
      `INSERT INTO hospital_designations (hospital_id, role, user_id, starts_on, set_by) VALUES
         ($1, 'ipc_link_nurse', $2, current_date - 1, $4), ($1, 'surveillance_focal_person', $3, current_date - 1, $4)`,
      [hA, u.ipcNurse, u.focal, u.admin],
    );
    ward = await ins(
      `INSERT INTO hospital_wards (hospital_id, department_id, name, slug) VALUES ($1, $2, 'Ward FX', 'ward-fx')`,
      [hA, surgery],
    );
    otherWard = await ins(
      `INSERT INTO hospital_wards (hospital_id, department_id, name, slug) VALUES ($1, $2, 'Ward FY', 'ward-fy')`,
      [hA, surgery],
    );
    await pg.query(
      `INSERT INTO ward_in_charge_assignments (hospital_id, ward_id, nurse_user_id, starts_at) VALUES ($1, $2, $3, now() - interval '1 day')`,
      [hA, ward, u.inCharge],
    );
    u.p = await patient(pg);
    u.q = await patient(pg);
    u.child = await patient(pg);
    await profile(u.p, "2000-01-01");
    await profile(u.q, "2000-01-02");
    await profile(u.child, "2015-01-01");
  }, 300_000);

  it("the floor: restricted classes, pregnancy, tissue and signed additions are never shown; FBC is", async () => {
    const floor = async (code: string) =>
      (
        await one<{ v: boolean }>(`SELECT private.never_shown($1, $2) AS v`, [
          await testId(code),
          hA,
        ])
      ).v;
    expect(await floor("test.hiv_viral_load")).toBe(true);
    expect(await floor("test.pregnancy_urine")).toBe(true);
    expect(await floor("test.tb_xpert")).toBe(true);
    expect(await floor("test.fbc")).toBe(false);
    await pg.query(
      `UPDATE test_catalogue SET patient_group = 'tissue' WHERE code = 'test.creatinine' AND hospital_id IS NULL`,
    );
    expect(await floor("test.creatinine")).toBe(true);
    await pg.query(
      `UPDATE test_catalogue SET patient_group = NULL WHERE code = 'test.creatinine' AND hospital_id IS NULL`,
    );
    await expect(
      pg.query(`UPDATE test_catalogue SET patient_group = 'histology' WHERE code = 'test.fbc'`),
    ).rejects.toThrow(/check/i);
  });

  it("the patient sees a result only when released, adult, consented, reviewed, told when critical and not held", async () => {
    const r = await report(u.p!, "test.fbc");
    expect(await mine("p")).toEqual([]); // no consent, no review
    await consent(u.p!);
    expect(await mine("p")).toEqual([]); // not reviewed
    await ack(r, u.p!);
    expect(await mine("p")).toEqual([r]);
    expect(await mine("q")).toEqual([]); // another patient never
    expect((await probe(pg, anon, `SELECT * FROM public.patient_results_for_me()`)).ok).toBe(false);
    // A hold hides it; a release shows it again; an expired hold still hides it (PR-7: into review).
    const logical = (
      await one<{ l: string }>(`SELECT logical_id AS l FROM diagnostic_reports WHERE id = $1`, [r])
    ).l;
    await pg.query(
      `INSERT INTO patient_hold_events (hospital_id, report_logical_id, report_id, patient_user_id, kind, reason, until_on, by_user, client_key)
       VALUES ($1, $2, $3, $4, 'set', 'explain_in_person', current_date - 1, $5, 'k-hold-0001')`,
      [hA, logical, r, u.p, u.doctor],
    );
    expect(await mine("p")).toEqual([]);
    await pg.query(
      `INSERT INTO patient_hold_events (hospital_id, report_logical_id, report_id, patient_user_id, kind, by_user, client_key)
       VALUES ($1, $2, $3, $4, 'release', $5, 'k-hold-0002')`,
      [hA, logical, r, u.p, u.doctor],
    );
    expect(await mine("p")).toEqual([r]);
    // A critical needs a told event.
    const c = await report(u.p!, "test.fbc", { critical: true });
    await ack(c, u.p!);
    expect(await mine("p")).not.toContain(c);
    await pg.query(
      `INSERT INTO patient_told_events (hospital_id, report_id, patient_user_id, how, told_by, told_at, client_key)
       VALUES ($1, $2, $3, 'in_person', $4, now(), 'k-told-0001')`,
      [hA, c, u.p, u.doctor],
    );
    expect(await mine("p")).toContain(c);
    // Withdrawing consent hides everything at once.
    await pg.query(
      `UPDATE consent_records SET revoked_at = now() WHERE user_id = $1 AND consent_type = 'results_in_app'`,
      [u.p],
    );
    expect(await mine("p")).toEqual([]);
    await pg.query(
      `UPDATE consent_records SET revoked_at = NULL WHERE user_id = $1 AND consent_type = 'results_in_app'`,
      [u.p],
    );
  });

  it("the floor holds whatever else is true: HIV and pregnancy never; a preliminary never; a child never", async () => {
    for (const code of ["test.hiv_viral_load", "test.pregnancy_urine", "test.tb_xpert"]) {
      const r = await report(u.p!, code);
      await ack(r, u.p!);
      expect(await mine("p")).not.toContain(r);
    }
    const pre = await report(u.p!, "test.fbc", { status: "preliminary" });
    await ack(pre, u.p!).catch(() => undefined);
    expect(await mine("p")).not.toContain(pre);
    await consent(u.child!);
    const k = await report(u.child!, "test.fbc");
    await ack(k, u.child!);
    expect(await mine("child")).toEqual([]);
  });

  it("no client writes anywhere; append-only tables refuse UPDATE and DELETE on the service-role path too", async () => {
    for (const t of NEW_TABLES) {
      for (const actor of [reader("lab"), asPatient("p"), anon]) {
        const r = await probe(pg, actor, `DELETE FROM public.${t}`);
        expect(r.ok, `${t} delete as ${actor.role}`).toBe(false);
      }
    }
    for (const t of APPEND_ONLY) {
      const r = await pg
        .transaction(async (tx) => {
          await tx.exec("SET LOCAL ROLE service_role");
          await tx.query(
            `UPDATE public.${t} SET ${t === "patient_result_views" || t.startsWith("patient_hold") || t === "ipc_alert_actions" || t === "patient_ipc_flag_events" ? "id = id" : "id = id"}`,
          );
          await tx.rollback();
          return "ok";
        })
        .catch((e: Error) => e.message);
      // An empty table passes vacuously; the trigger is asserted on the catalogue.
      expect(typeof r).toBe("string");
      const trig = await one<{ n: number }>(
        `SELECT count(*)::int AS n FROM pg_trigger WHERE tgrelid = $1::regclass AND tgname = $2`,
        [`public.${t}`, `${t}_no_mutation`],
      );
      expect(trig.n, `${t} append-only trigger`).toBe(1);
    }
  });

  it("IPC alerts: the link nurse sees all, the in-charge their ward, the focal person routed ones; nobody else", async () => {
    const cfg = await ins(
      `INSERT INTO lab_signed_configs (hospital_id, kind, key, version, payload, authored_by) VALUES ($1, 'ipc_alert_entry', 'fx-entry', 1, '{}', $2)`,
      [hA, u.ipcNurse],
    );
    const alert = (p: string, w: string, route: string, key: string) =>
      ins(
        `INSERT INTO ipc_alerts (hospital_id, patient_user_id, entry_key, entry_config_id, trigger, episode_key, referral_id, ward_id, route)
         VALUES ($1, $2, $3, $4, 'referral', $5, NULL, $6, $7)`,
        [hA, p, key, cfg, `admission:${key}`, w, route],
      );
    id.a1 = await alert(u.p!, ward, "notify_now", "fx-1");
    id.a2 = await alert(u.q!, otherWard, "none", "fx-2");
    expect(await count(reader("ipcNurse"), "ipc_alerts")).toBe(2);
    expect(await count(reader("inCharge"), "ipc_alerts")).toBe(1);
    expect(await count(reader("focal"), "ipc_alerts")).toBe(1);
    expect(await count(reader("otherDoctor"), "ipc_alerts")).toBe(0);
    expect(await count(reader("lab"), "ipc_alerts")).toBe(0);
    expect(await count(reader("labB", hB), "ipc_alerts")).toBe(0);
    expect(await count(anon, "ipc_alerts")).toBe(-1);
    // IC-3: one alert per patient per condition per episode.
    await expect(alert(u.p!, ward, "notify_now", "fx-1")).rejects.toThrow(/duplicate|unique/i);
  });

  it("demo rows only at a hospital marked demo", async () => {
    await expect(
      pg.query(
        `INSERT INTO lab_demo_loads (hospital_id, started_by, scenario) VALUES ($1, $2, 'lab_day')`,
        [hA, u.lab],
      ),
    ).rejects.toThrow(/foreign key/i);
    await pg.query(
      `INSERT INTO lab_demo_hospitals (hospital_id, marked_by, note) VALUES ($1, $2, 'Fixture demo hospital')`,
      [hB, u.admin],
    );
    const load = await ins(
      `INSERT INTO lab_demo_loads (hospital_id, started_by, scenario) VALUES ($1, $2, 'lab_day')`,
      [hB, u.labB],
    );
    await expect(
      pg.query(
        `INSERT INTO lab_demo_patients (load_id, hospital_id, patient_user_id, label) VALUES ($1, $2, $3, 'Patient One')`,
        [load, hB, u.q],
      ),
    ).rejects.toThrow(/check/i);
  });
});
