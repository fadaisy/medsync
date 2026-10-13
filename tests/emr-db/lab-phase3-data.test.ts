/**
 * Lab Phase 3, Step 2 (gate-a-proposal §3, §7, §12): migrations 0112–0117 on the PGlite lane. Every new table ×
 * every actor of §12: lab staff, the laboratory lead (acting head), a non-lab head of the laboratory, the
 * In-Charge, the focal person, a bedside operator (nurse), the hospital admin, a clinician, staff of another
 * hospital, a superadmin without break-glass and anonymous. No client writes anywhere; append-only tables refuse
 * UPDATE and DELETE on the service-role path too; a lot moves only along §5.1 with its event; the bedside lots
 * moved from poct_lots keep their ids and every report's lot resolves; the hospital admin, the In-Charge and the
 * focal person read HMIS reports as aggregates only. Fixture values are invented and named as fixtures; no
 * clinical number. Runs with EMR_PGLITE=1.
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
  readMigration,
  seedRecord,
  seedRegistries,
  superadmin,
} from "./_pglite";

const NEW_TABLES = [
  "lab_stock_items",
  "lab_stock_lots",
  "lab_stock_lot_events",
  "lab_stock_transactions",
  "lab_deliveries",
  "lab_stock_counts",
  "lab_lot_acceptances",
  "lab_lots_in_use",
  "lab_equipment_logs",
  "lab_breakdowns",
  "lab_qc_runs",
  "lab_qc_status",
  "lab_control_checks",
  "lab_nonconformities",
  "lab_nc_events",
  "lab_lookback_items",
  "lab_eqa_schemes",
  "lab_eqa_rounds",
  "lab_alt_assessments",
  "lab_competencies",
  "lab_register_prints",
  "lab_hmis_reports",
  "hmis_designations",
] as const;
type Table = (typeof NEW_TABLES)[number];

/** Strictly append-only: UPDATE and DELETE refused by trigger for every actor. */
const APPEND_ONLY = [
  "lab_stock_lot_events",
  "lab_stock_transactions",
  "lab_deliveries",
  "lab_stock_counts",
  "lab_lot_acceptances",
  "lab_lots_in_use",
  "lab_equipment_logs",
  "lab_qc_runs",
  "lab_control_checks",
  "lab_nc_events",
  "lab_register_prints",
] as const;

type ActorKey =
  | "lab"
  | "lead"
  | "inCharge"
  | "focal"
  | "nurse"
  | "admin"
  | "clinician"
  | "otherHospital"
  | "superadmin"
  | "anon";

describe.skipIf(!laneOn)("Lab Phase 3 data layer (0112–0117)", () => {
  let lane: Lane;
  let pg: Pg;
  let hA: string;
  let hB: string;
  const u: Record<string, string> = {};
  const id: Record<string, string> = {};
  const actors = {} as Record<ActorKey, Actor>;
  /** Rows each actor should see, per table: every row of hospital A unless listed. */
  const sees = {} as Record<ActorKey, Partial<Record<Table, number>>>;

  const one = async <T = Record<string, unknown>>(sql: string, params?: unknown[]) =>
    (await pg.query<T>(sql, params)).rows[0]!;
  const ins = async (sql: string, params: unknown[]) =>
    (await one<{ id: string }>(`${sql} RETURNING id`, params)).id;
  const count = async (actor: Actor, table: string) => {
    const r = await probe(pg, actor, `SELECT count(*)::int AS n FROM public.${table}`);
    return r.ok ? (r.rows[0]!.n as number) : -1;
  };
  /** As the service role (BYPASSRLS, keeps its table grants): only triggers can stop it. */
  const asService = (sql: string, params: unknown[] = []) =>
    pg.transaction(async (tx) => {
      await tx.exec("SET LOCAL ROLE service_role");
      await tx.query(sql, params);
      await tx.rollback();
    });

  beforeAll(async () => {
    lane = await bootLane();
    pg = lane.pg;
    hA = await hospital(pg, "Phase 3 A");
    hB = await hospital(pg, "Phase 3 B");
    await seedRegistries(pg, hA);
    const labDept = await department(pg, hA, "Laboratory");
    await pg.query(`UPDATE hospital_departments SET catalogue_code = 'LABORATORY' WHERE id = $1`, [
      labDept,
    ]);
    const chem = await ins(
      `INSERT INTO hospital_departments (hospital_id, parent_id, name, slug) VALUES ($1, $2, 'Chemistry fixture', 'chem-fx')`,
      [hA, labDept],
    );
    const wardDept = await department(pg, hA, "Medical ward");
    const otherDept = await department(pg, hA, "Surgical ward");
    const opd = await department(pg, hA, "OPD");
    const labDeptB = await department(pg, hB, "Laboratory B");
    const ward = await ins(
      `INSERT INTO hospital_wards (hospital_id, department_id, name, slug) VALUES ($1, $2, 'Ward fixture', 'ward-fx')`,
      [hA, wardDept],
    );
    const otherWard = await ins(
      `INSERT INTO hospital_wards (hospital_id, department_id, name, slug) VALUES ($1, $2, 'Other ward fixture', 'ward-fx2')`,
      [hA, otherDept],
    );

    const staffAt = async (h: string, d: string, cadre: string) =>
      (await clinician(pg, { hospitalId: h, departmentId: d, cadre })).userId;
    u.lab = await staffAt(hA, labDept, "LAB_TECH");
    u.lead = await staffAt(hA, chem, "LAB_TECHNOLOGIST");
    u.pathologist = await staffAt(hA, otherDept, "CONSULTANT");
    u.inCharge = await staffAt(hA, opd, "MEDICAL_OFFICER");
    u.focal = await staffAt(hA, opd, "MEDICAL_OFFICER");
    u.nurse = await staffAt(hA, wardDept, "NURSE");
    u.doctor = await staffAt(hA, opd, "MEDICAL_OFFICER");
    u.labB = await staffAt(hB, labDeptB, "LAB_TECHNOLOGIST");
    u.admin = await authUser(pg, "hospital-admin");
    await pg.query(
      `INSERT INTO user_roles (user_id, role, hospital_id) VALUES ($1, 'hospital_admin', $2)`,
      [u.admin, hA],
    );
    u.superadmin = await superadmin(pg);
    // The lead is the ACTING head of a lab section; the pathologist the substantive head of the Laboratory.
    await pg.query(
      `INSERT INTO department_heads (hospital_id, department_id, user_id, acting) VALUES ($1, $2, $3, true),
         ($1, $4, $5, false)`,
      [hA, chem, u.lead, labDept, u.pathologist],
    );
    await pg.query(
      `INSERT INTO poct_operators (hospital_id, user_id, granted_by) VALUES ($1, $2, $3)`,
      [hA, u.nurse, u.lead],
    );

    // Patient, encounter, a released report and observation, and a lab order (the lab's access basis).
    const pt = await patient(pg);
    u.patient = pt;
    const enc = await encounter(pg, {
      hospitalId: hA,
      patientUserId: pt,
      clinicianUserId: u.doctor!,
      departmentId: opd,
    });
    const aff = await one<{ id: string }>(`SELECT id FROM staff_affiliations WHERE user_id = $1`, [
      u.doctor,
    ]);
    const rec = await seedRecord(pg, {
      hospitalId: hA,
      patientUserId: pt,
      encounterId: enc,
      authorId: u.doctor!,
      authorAffiliationId: aff.id,
    });
    id.report = rec.diagnostic_reports[0];
    id.observation = rec.clinical_observations[0];
    await pg.query(
      `INSERT INTO encounter_orders (encounter_id, patient_user_id, kind, text, authored_by_user_id, hospital_id)
       VALUES ($1, $2, 'lab', 'Fixture lab order', $3, $4)`,
      [enc, pt, u.doctor, hA],
    );

    // Machines: a meter on the nurse's ward, one on another ward, an analyser and a fridge.
    const device = (kind: string, model: string, wardId: string | null) =>
      ins(
        `INSERT INTO devices (hospital_id, kind, model, serial, test_code, ward_id) VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          hA,
          kind,
          model,
          `${model}-SN`,
          kind === "glucometer" ? "test.capillary_glucose" : null,
          wardId,
        ],
      );
    id.meter = await device("glucometer", "Fixture meter 1", ward);
    id.otherMeter = await device("glucometer", "Fixture meter 2", otherWard);
    id.analyser = await device("analyser", "Fixture analyser", null);
    await pg.query(
      `UPDATE devices SET section_id = $2, linked_concepts = '{lane.quantity}' WHERE id = $1`,
      [id.analyser, chem],
    );

    // Bedside lots written the Phase 2 way, then moved into the ledger with their own ids (0112's move).
    id.lot1 = await ins(
      `INSERT INTO poct_lots (hospital_id, device_id, lot, use_by, added_by) VALUES ($1, $2, 'FX-STRIP', current_date + 30, $3)`,
      [hA, id.meter, u.lead],
    );
    id.lot2 = await ins(
      `INSERT INTO poct_lots (hospital_id, device_id, lot, use_by, added_by) VALUES ($1, $2, 'FX-STRIP', current_date + 30, $3)`,
      [hA, id.otherMeter, u.lead],
    );
    for (const l of [id.lot1, id.lot2])
      await pg.query(`SELECT private.poct_lot_into_ledger($1)`, [l]);

    // Signed configuration drafts the rows below point at.
    const config = (kind: string, key: string) =>
      ins(
        `INSERT INTO lab_signed_configs (hospital_id, kind, key, version, payload, authored_by) VALUES ($1, $2, $3, 1, '{}', $4)`,
        [hA, kind, key, u.lead],
      );
    id.qcPlan = await config("qc_plan", `${id.analyser}:lane.quantity`);
    id.kitRule = await config("kit_qc_rule", "fixture-kit");
    id.mapping = await config("hmis_mapping", "2019-09-print");

    // A reagent lot received, then accepted with its event in the same transaction, then set in use.
    id.reagent = await ins(
      `INSERT INTO lab_stock_items (hospital_id, name, kind, unit_of_issue, concept_ids, created_by)
       VALUES ($1, 'Fixture reagent', 'reagent', 'pack', '{lane.quantity}', $2)`,
      [hA, u.lead],
    );
    id.reagentLot = await ins(
      `INSERT INTO lab_stock_lots (hospital_id, item_id, lot, use_by) VALUES ($1, $2, 'FX-R1', current_date + 90)`,
      [hA, id.reagent],
    );
    await pg.transaction(async (tx) => {
      await tx.query(
        `INSERT INTO lab_stock_lot_events (lot_id, hospital_id, from_state, to_state, actor) VALUES ($1, $2, 'received', 'accepted', $3)`,
        [id.reagentLot, hA, u.lead],
      );
      await tx.query(
        `UPDATE lab_stock_lots SET state = 'accepted', accepted_basis = 'none' WHERE id = $1`,
        [id.reagentLot],
      );
    });
    id.delivery = await ins(
      `INSERT INTO lab_deliveries (hospital_id, supplier, received_by, lines) VALUES ($1, 'nms', $2, '[]')`,
      [hA, u.lab],
    );
    id.count = await ins(
      `INSERT INTO lab_stock_counts (hospital_id, counted_by, lines) VALUES ($1, $2, '[]')`,
      [hA, u.lab],
    );
    await pg.query(
      `INSERT INTO lab_stock_transactions (hospital_id, item_id, lot_id, kind, quantity, delivery_id, actor)
       VALUES ($1, $2, $3, 'receipt', 4, $4, $5)`,
      [hA, id.reagent, id.reagentLot, id.delivery, u.lab],
    );
    await pg.query(
      `INSERT INTO lab_lot_acceptances (hospital_id, lot_id, method, outcome, decided_by) VALUES ($1, $2, 'none', 'accepted', $3)`,
      [hA, id.reagentLot, u.lead],
    );
    await pg.query(
      `INSERT INTO lab_lots_in_use (hospital_id, device_id, concept_id, kind, lot_id, set_by)
       VALUES ($1, $2, 'lane.quantity', 'reagent', $3, $4)`,
      [hA, id.analyser, id.reagentLot, u.lab],
    );

    // Equipment.
    await pg.query(
      `INSERT INTO lab_equipment_logs (hospital_id, device_id, kind, note, done_at, actor) VALUES
         ($1, $2, 'maintenance', 'fixture', now(), $4), ($1, $3, 'maintenance', 'fixture', now(), $4)`,
      [hA, id.meter, id.analyser, u.lab],
    );
    id.repair = await ins(
      `INSERT INTO lab_equipment_logs (hospital_id, device_id, kind, note, done_at, actor)
       VALUES ($1, $2, 'repair', 'fixture repair', now(), $3)`,
      [hA, id.analyser, u.lab],
    );
    id.breakdown = await ins(
      `INSERT INTO lab_breakdowns (hospital_id, device_id, since, cause) VALUES ($1, $2, now() - interval '1 hour', 'fixture cause')`,
      [hA, id.analyser],
    );

    // QC, control checks, a nonconformity with an event and a look-back item.
    id.run = await ins(
      `INSERT INTO lab_qc_runs (hospital_id, device_id, concept_id, plan_config_id, plan_version, "values", decision,
         first_step, run_at, recorded_by)
       VALUES ($1, $2, 'lane.quantity', $3, 1, '[]', 'rejected', 'fixture step', now(), $4)`,
      [hA, id.analyser, id.qcPlan, u.lab],
    );
    await pg.query(
      `INSERT INTO lab_qc_status (hospital_id, device_id, concept_id, status, run_id, held) VALUES ($1, $2, 'lane.quantity', 'failed', $3, true)`,
      [hA, id.analyser, id.run],
    );
    await pg.query(
      `INSERT INTO lab_control_checks (hospital_id, subject, device_id, lot_id, trigger, controls, outcome, operator) VALUES
         ($1, 'device', $2, $4, 'daily', '[]', 'pass', $5), ($1, 'device', $3, $6, 'daily', '[]', 'pass', $5)`,
      [hA, id.meter, id.otherMeter, id.lot1, u.nurse, id.lot2],
    );
    await pg.query(
      `INSERT INTO lab_control_checks (hospital_id, subject, item_id, trigger, controls, outcome, operator)
       VALUES ($1, 'kit', $2, 'new_lot', '[]', 'pass', $3)`,
      [hA, id.reagent, u.lab],
    );
    id.nc = await ins(
      `INSERT INTO lab_nonconformities (hospital_id, number, source, subject_device_id, subject_concept_id, title,
         what_happened, testing_halted, owner)
       VALUES ($1, 'NC-2026-001', 'qc_reject', $2, 'lane.quantity', 'Fixture QC rejection', 'fixture', true, $3)`,
      [hA, id.analyser, u.lead],
    );
    await pg.query(
      `INSERT INTO lab_nc_events (nc_id, hospital_id, kind, payload) VALUES ($1, $2, 'action_added', '{"what":"fixture"}')`,
      [id.nc, hA],
    );
    id.lookback = await ins(
      `INSERT INTO lab_lookback_items (nc_id, hospital_id, patient_user_id, report_id, observation_id, released_at, value, sort)
       VALUES ($1, $2, $3, $4, $5, now(), 1, 'unchanged')`,
      [id.nc, hA, pt, id.report, id.observation],
    );

    // EQA, competencies, registers, HMIS.
    id.scheme = await ins(
      `INSERT INTO lab_eqa_schemes (hospital_id, name, provider, covers) VALUES ($1, 'Fixture scheme', 'Fixture provider', '{test.fixture}')`,
      [hA],
    );
    await pg.query(
      `INSERT INTO lab_eqa_rounds (hospital_id, scheme_id, label, received_on) VALUES ($1, $2, 'FX-1', current_date)`,
      [hA, id.scheme],
    );
    await pg.query(
      `INSERT INTO lab_alt_assessments (hospital_id, test_code, method, done_on, results, conclusion, recorded_by)
       VALUES ($1, 'test.fixture', 'retained_samples', current_date, '[]', 'fixture conclusion', $2)`,
      [hA, u.lab],
    );
    id.competency = await ins(
      `INSERT INTO lab_competencies (hospital_id, user_id, test_code, assessed_on, assessor, valid_to)
       VALUES ($1, $2, 'test.capillary_glucose', current_date, $3, current_date + 1)`,
      [hA, u.nurse, u.lead],
    );
    await pg.query(
      `INSERT INTO lab_competencies (hospital_id, user_id, test_code, assessed_on, valid_to, grandfathered)
       VALUES ($1, $2, 'test.capillary_glucose', current_date, current_date + 1, true)`,
      [hA, u.lab],
    );
    await pg.query(
      `INSERT INTO lab_register_prints (hospital_id, register, day, pages, printed_by) VALUES ($1, 'general', current_date, 1, $2)`,
      [hA, u.lab],
    );
    id.hmis = await ins(
      `INSERT INTO lab_hmis_reports (hospital_id, month, form_hash, cells, sources)
       VALUES ($1, date '2026-09-01', $2, '{"HE02":{"done":1}}', '{"HE02":["fixture-record-id"]}')`,
      [hA, "a".repeat(64)],
    );
    await pg.query(
      `INSERT INTO hmis_designations (hospital_id, role, user_id, starts_on, set_by) VALUES
         ($1, 'in_charge', $2, current_date - 1, $4), ($1, 'focal', $3, current_date - 1, $4)`,
      [hA, u.inCharge, u.focal, u.admin],
    );

    const reader = (userId: string, hospitalId = hA): Actor => ({
      userId,
      role: "medsync_clinical_reader",
      hospitalId,
    });
    Object.assign(actors, {
      lab: reader(u.lab!),
      lead: reader(u.lead!),
      inCharge: reader(u.inCharge!),
      focal: reader(u.focal!),
      nurse: reader(u.nurse!),
      admin: reader(u.admin!),
      clinician: reader(u.doctor!),
      otherHospital: reader(u.labB!, hB),
      superadmin: reader(u.superadmin!),
      anon: { userId: null, role: "anon" },
    } satisfies Record<ActorKey, Actor>);
    const none = Object.fromEntries(NEW_TABLES.map((t) => [t, 0])) as Record<Table, number>;
    Object.assign(sees, {
      lab: {},
      lead: {},
      inCharge: { ...none, hmis_designations: 1 },
      focal: { ...none, hmis_designations: 1 },
      // Own devices only: the ward meter, its lot and item, its log and check; own competency.
      nurse: {
        ...none,
        lab_stock_items: 1,
        lab_stock_lots: 1,
        lab_lots_in_use: 1,
        lab_equipment_logs: 1,
        lab_control_checks: 1,
        lab_competencies: 1,
      },
      admin: { ...none, hmis_designations: 2 },
      clinician: none,
      otherHospital: none,
      superadmin: none,
      anon: none,
    } satisfies Record<ActorKey, Partial<Record<Table, number>>>);
  }, 240_000);

  it("every new table × every actor of §12 reads exactly what the plan allows", async () => {
    const rows: string[] = [];
    for (const t of NEW_TABLES) {
      const all = (
        await one<{ n: number }>(
          `SELECT count(*)::int AS n FROM public.${t} WHERE hospital_id = $1`,
          [hA],
        )
      ).n;
      expect(all, `${t} has fixture rows`).toBeGreaterThan(0);
      for (const k of Object.keys(actors) as ActorKey[]) {
        const want = sees[k][t] ?? all;
        const got = await count(actors[k], t);
        if (got !== want) rows.push(`${t} × ${k}: ${got}, expected ${want}`);
      }
    }
    expect(rows).toEqual([]);
  });

  it("another hospital's lab staff see nothing even when asserting hospital A", async () => {
    for (const t of NEW_TABLES)
      expect(await count({ ...actors.otherHospital, hospitalId: hA }, t), t).toBe(0);
  });

  it("the substantive head of the Laboratory (no lab cadre) reads the quality records but no patient row", async () => {
    const head: Actor = { userId: u.pathologist!, role: "medsync_clinical_reader", hospitalId: hA };
    for (const t of [
      "lab_qc_runs",
      "lab_nonconformities",
      "lab_stock_transactions",
      "lab_hmis_reports",
    ])
      expect(await count(head, t), t).toBeGreaterThan(0);
    expect(await count(head, "lab_lookback_items")).toBe(0);
  });

  it("no client INSERT, UPDATE or DELETE on any new table", async () => {
    const client = await authUser(pg, "client");
    for (const t of NEW_TABLES) {
      const me: Actor = { userId: client, role: "authenticated" };
      const insert = await probe(pg, me, `INSERT INTO public.${t} DEFAULT VALUES`);
      const update = await probe(pg, me, `UPDATE public.${t} SET hospital_id = hospital_id`);
      const del = await probe(pg, me, `DELETE FROM public.${t}`);
      expect(insert.ok, `${t} insert`).toBe(false);
      expect(update.ok ? update.affected : 0, `${t} update`).toBe(0);
      expect(del.ok ? del.affected : 0, `${t} delete`).toBe(0);
    }
  });

  it("once-only records: a breakdown closes once, a look-back item is decided once, a competency is revoked once", async () => {
    await expect(
      asService(`UPDATE lab_breakdowns SET cause = 'rewritten' WHERE id = $1`, [id.breakdown]),
    ).rejects.toThrow(/closed, once/);
    await pg.query(
      `UPDATE lab_breakdowns SET repair_log_id = $2, back_at = now(), back_by = $3, downtime_minutes = 60 WHERE id = $1`,
      [id.breakdown, id.repair, u.lead],
    );
    await expect(
      pg.query(`UPDATE lab_breakdowns SET downtime_minutes = 1 WHERE id = $1`, [id.breakdown]),
    ).rejects.toThrow(/closed, once/);

    await pg.query(
      `UPDATE lab_lookback_items SET decision = 'stands', decided_by = $2, decided_at = now() WHERE id = $1`,
      [id.lookback, u.lead],
    );
    await expect(
      asService(`UPDATE lab_lookback_items SET decision = 'repeat' WHERE id = $1`, [id.lookback]),
    ).rejects.toThrow(/decided once/);

    await expect(
      pg.query(`UPDATE lab_competencies SET valid_to = valid_to + 365 WHERE id = $1`, [
        id.competency,
      ]),
    ).rejects.toThrow(/revoked, once/);
    await pg.query(
      `UPDATE lab_competencies SET revoked_at = now(), revoked_by = $2 WHERE id = $1`,
      [id.competency, u.lead],
    );
    for (const t of [
      "lab_breakdowns",
      "lab_lookback_items",
      "lab_competencies",
      "lab_nonconformities",
    ])
      await expect(asService(`DELETE FROM public.${t}`), t).rejects.toThrow();
  });

  it("a nonconformity keeps what was opened, and is frozen once closed", async () => {
    await expect(
      pg.query(`UPDATE lab_nonconformities SET what_happened = 'rewritten' WHERE id = $1`, [id.nc]),
    ).rejects.toThrow(/what was opened is kept/);
    await pg.query(
      `UPDATE lab_nonconformities SET state = 'closed', cause_category = 'calibration', effectiveness_met = true,
         closed_at = now(), closed_by = $2 WHERE id = $1`,
      [id.nc, u.lead],
    );
    await expect(
      asService(`UPDATE lab_nonconformities SET owner = NULL WHERE id = $1`, [id.nc]),
    ).rejects.toThrow(/frozen/);
  });

  it("a signed HMIS report is frozen for every actor: only the export is recorded, once", async () => {
    await pg.query(
      `UPDATE lab_hmis_reports SET state = 'checked', checked_by = $2, checked_at = now() WHERE id = $1`,
      [id.hmis, u.lead],
    );
    await pg.query(
      `UPDATE lab_hmis_reports SET state = 'signed', signed_by = $2, signed_at = now(), mapping_config_id = $3,
         mapping_version = 1 WHERE id = $1`,
      [id.hmis, u.inCharge, id.mapping],
    );
    await expect(
      asService(`UPDATE lab_hmis_reports SET cells = '{}' WHERE id = $1`, [id.hmis]),
    ).rejects.toThrow(/signed report is frozen/);
    await pg.query(
      `UPDATE lab_hmis_reports SET state = 'exported', exported_by = $2, exported_at = now() WHERE id = $1`,
      [id.hmis, u.lead],
    );
    await expect(
      asService(`UPDATE lab_hmis_reports SET exported_at = now() WHERE id = $1`, [id.hmis]),
    ).rejects.toThrow(/signed report is frozen/);
    await expect(
      asService(`DELETE FROM lab_hmis_reports WHERE id = $1`, [id.hmis]),
    ).rejects.toThrow(/never deleted/);
  });

  /**
   * S52: every append-only table of Phase 3 refuses UPDATE and DELETE, for the owner and for the service role (which
   * bypasses RLS and keeps its grants: only the triggers stop it). The once-only tables are here with an update
   * their trigger always refuses (after the once-only tests above have used their one change).
   */
  const S52: readonly (readonly [string, string, RegExp, RegExp])[] = [
    ...APPEND_ONLY.map(
      (t) =>
        [
          t,
          `UPDATE public.${t} SET hospital_id = hospital_id`,
          /append-only/,
          /append-only/,
        ] as const,
    ),
    [
      "lab_stock_lots",
      `UPDATE lab_stock_lots SET lot = lot || '-x'`,
      /never change/,
      /never deleted/,
    ],
    [
      "lab_breakdowns",
      `UPDATE lab_breakdowns SET cause = 'rewritten'`,
      /closed, once/,
      /closed, once/,
    ],
    [
      "lab_lookback_items",
      `UPDATE lab_lookback_items SET value = value + 1`,
      /decided once/,
      /decided once/,
    ],
    [
      "lab_competencies",
      `UPDATE lab_competencies SET valid_to = valid_to + 1`,
      /revoked, once/,
      /revoked, once/,
    ],
    [
      "lab_nonconformities",
      `UPDATE lab_nonconformities SET title = 'rewritten'`,
      /frozen|kept/,
      /frozen|kept/,
    ],
    ["lab_hmis_reports", `UPDATE lab_hmis_reports SET cells = '{}'`, /frozen/, /never deleted/],
  ];
  it.each(S52)(
    "S52: %s refuses UPDATE and DELETE as the owner and as the service role",
    async (t, update, u1, d1) => {
      expect(
        Number((await one<{ n: number }>(`SELECT count(*)::int AS n FROM public.${t}`)).n),
        t,
      ).toBeGreaterThan(0);
      await expect(pg.query(update)).rejects.toThrow(u1);
      await expect(pg.query(`DELETE FROM public.${t}`)).rejects.toThrow(d1);
      await expect(asService(update)).rejects.toThrow(u1);
      await expect(asService(`DELETE FROM public.${t}`)).rejects.toThrow(d1);
    },
  );

  it("admin aggregates only (Law 10): the admin, In-Charge and focal person get the cells, never the record ids", async () => {
    const agg = (a: Actor) => probe(pg, a, `SELECT * FROM private.lab_hmis_aggregates()`);
    for (const k of ["admin", "inCharge", "focal", "lab"] as const) {
      const r = await agg(actors[k]);
      expect(r.ok && r.rows.length, k).toBe(1);
      if (r.ok) {
        expect(Object.keys(r.rows[0]!), k).not.toContain("sources");
        expect(r.rows[0]!.cells, k).toEqual({ HE02: { done: 1 } });
      }
    }
    for (const k of ["admin", "inCharge", "focal"] as const) {
      const direct = await probe(pg, actors[k], `SELECT sources FROM public.lab_hmis_reports`);
      expect(direct.ok && direct.rows.length, k).toBe(0);
    }
    for (const k of ["clinician", "nurse", "otherHospital", "superadmin"] as const) {
      const r = await agg(actors[k]);
      expect(r.ok ? r.rows.length : 0, k).toBe(0);
    }
    // And no patient row reaches the admin: no look-back item, no report line.
    expect(await count(actors.admin, "lab_lookback_items")).toBe(0);
    expect(await count(actors.admin, "diagnostic_reports")).toBe(0);
  });

  it("the doctor's lines: qc_held reads where the clinician may open the result, never for the admin", async () => {
    const q = `SELECT qc_held FROM public.diagnostic_reports WHERE id = '${id.report}'`;
    const doc = await probe(pg, actors.clinician, q);
    expect(doc.ok && doc.rows.length).toBe(1);
    const admin = await probe(pg, actors.admin, q);
    expect(admin.ok ? admin.rows.length : 0).toBe(0);
  });

  it("a lot moves only along §5.1, with its event in the same transaction", async () => {
    const lot = await ins(
      `INSERT INTO lab_stock_lots (hospital_id, item_id, lot) VALUES ($1, $2, 'FX-R2')`,
      [hA, id.reagent],
    );
    await expect(
      pg.query(
        `INSERT INTO lab_stock_lots (hospital_id, item_id, lot, state, accepted_basis) VALUES ($1, $2, 'FX-R3', 'accepted', 'none')`,
        [hA, id.reagent],
      ),
    ).rejects.toThrow(/starts as received/);
    await expect(
      pg.query(`UPDATE lab_stock_lots SET state = 'in_acceptance' WHERE id = $1`, [lot]),
    ).rejects.toThrow(/lot event in the same transaction/);
    // An event from an earlier transaction does not count.
    await pg.query(
      `INSERT INTO lab_stock_lot_events (lot_id, hospital_id, from_state, to_state) VALUES ($1, $2, 'received', 'in_acceptance')`,
      [lot, hA],
    );
    await expect(
      pg.query(`UPDATE lab_stock_lots SET state = 'in_acceptance' WHERE id = $1`, [lot]),
    ).rejects.toThrow(/lot event in the same transaction/);
    await expect(
      pg.transaction(async (tx) => {
        await tx.query(
          `INSERT INTO lab_stock_lot_events (lot_id, hospital_id, from_state, to_state) VALUES ($1, $2, 'received', 'in_use')`,
          [lot, hA],
        );
        await tx.query(
          `UPDATE lab_stock_lots SET state = 'in_use', accepted_basis = 'none' WHERE id = $1`,
          [lot],
        );
      }),
    ).rejects.toThrow(/not a lot transition/);
    // LU-2: a lot not yet accepted is never set in use.
    await expect(
      pg.query(
        `INSERT INTO lab_lots_in_use (hospital_id, device_id, kind, lot_id, set_by) VALUES ($1, $2, 'reagent', $3, $4)`,
        [hA, id.analyser, lot, u.lab],
      ),
    ).rejects.toThrow(/only an accepted lot/);
    await expect(pg.query(`DELETE FROM lab_stock_lots WHERE id = $1`, [lot])).rejects.toThrow(
      /never deleted/,
    );
    await expect(
      pg.query(`UPDATE lab_stock_lots SET lot = 'FX-OTHER' WHERE id = $1`, [lot]),
    ).rejects.toThrow(/never change/);
  });

  it("signers per kind (E-LAB3-12): lead-only kinds sign with the lead alone; a QC plan needs a second person", async () => {
    await pg.query(
      `UPDATE lab_signed_configs SET status = 'signed', lead_signed_by = $2, lead_signed_at = now(), in_force_from = now()
        WHERE id = $1`,
      [id.kitRule, u.lead],
    );
    const plan = await ins(
      `INSERT INTO lab_signed_configs (hospital_id, kind, key, version, payload, authored_by) VALUES ($1, 'qc_plan', 'fx-2', 1, '{}', $2)`,
      [hA, u.lead],
    );
    await expect(
      pg.query(
        `UPDATE lab_signed_configs SET status = 'signed', lead_signed_by = $2, lead_signed_at = now(), in_force_from = now()
          WHERE id = $1`,
        [plan, u.lead],
      ),
    ).rejects.toThrow(/lsc_signed_by_two/);
  });

  it("poct_lots → lab_stock_lots (§7): same ids, every report's lot resolves, the backfill is re-runnable", async () => {
    // A lot written before the move, then 0112 run again.
    id.lot3 = await ins(
      `INSERT INTO poct_lots (hospital_id, device_id, lot, use_by, added_by) VALUES ($1, $2, 'FX-OLD', current_date - 1, $3)`,
      [hA, id.meter, u.lead],
    );
    expect(
      (
        await one<{ n: number }>(`SELECT count(*)::int AS n FROM lab_stock_lots WHERE id = $1`, [
          id.lot3,
        ])
      ).n,
    ).toBe(0);
    await pg.exec(readMigration("0112_lab_stock.sql"));
    await pg.exec(readMigration("0112_lab_stock.sql")); // twice: nothing more
    const check = await one<{ poct: number; moved: number; events: number; in_use: number }>(
      `SELECT (SELECT count(*)::int FROM poct_lots) AS poct,
              (SELECT count(*)::int FROM lab_stock_lots s WHERE s.accepted_basis = 'before_medsync'
                 AND s.id IN (SELECT id FROM poct_lots)) AS moved,
              (SELECT count(*)::int FROM lab_stock_lot_events WHERE ref_kind = 'poct_lot') AS events,
              (SELECT count(*)::int FROM lab_lots_in_use u JOIN poct_lots p ON p.id = u.lot_id) AS in_use`,
    );
    expect(check).toEqual({ poct: 3, moved: 3, events: 3, in_use: 3 });
    const moved = await one<{ lot: string; use_by: string; state: string; device_ok: boolean }>(
      `SELECT s.lot, s.use_by::text, s.state,
              EXISTS (SELECT 1 FROM lab_lots_in_use u WHERE u.lot_id = s.id AND u.device_id = $2) AS device_ok
         FROM lab_stock_lots s WHERE s.id = $1`,
      [id.lot3, id.meter],
    );
    expect(moved).toMatchObject({ lot: "FX-OLD", state: "in_use", device_ok: true });
    // Two meters on one strip lot share one item (one per test), as two lots with their own ids.
    const items = await one<{ n: number }>(
      `SELECT count(DISTINCT item_id)::int AS n FROM lab_stock_lots WHERE id IN ($1, $2)`,
      [id.lot1, id.lot2],
    );
    expect(items.n).toBe(1);
    // The report's foreign key now points at the ledger: a moved lot resolves, an unknown id does not.
    const fk = await one<{ target: string }>(
      `SELECT confrelid::regclass::text AS target FROM pg_constraint WHERE conname = 'diagnostic_reports_lot_id_fkey'`,
    );
    expect(fk.target).toBe("lab_stock_lots");
    const orphans = await one<{ n: number }>(
      `SELECT count(*)::int AS n FROM diagnostic_reports r WHERE r.lot_id IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM lab_stock_lots s WHERE s.id = r.lot_id)`,
    );
    expect(orphans.n).toBe(0);
    // No copy trigger: the bedside code writes the ledger itself (Step 4).
    const trig = await one<{ n: number }>(
      `SELECT count(*)::int AS n FROM pg_trigger WHERE tgname = 'poct_lots_into_ledger'`,
    );
    expect(trig.n).toBe(0);
  });
});
