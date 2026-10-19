/**
 * Lab Phase 3, Step 10: lab reports and quality indicators on the PGlite lane (S46–S49). Every test, ward,
 * section, stated turnaround, time and count here is a FIXTURE built to be counted by hand (the comments carry the
 * hand count); none is a target or a real figure (Law 3). The month is September 2026, Africa/Kampala; times are
 * moved there with triggers off (replica role), as Step 9 did. Runs with EMR_PGLITE=1.
 */
import { randomUUID } from "node:crypto";
import type { Lane, Pg } from "./_pglite";
import type { EmrActor } from "@/lib/emr/actor";
import type { WriteCtx } from "@/lib/emr/write/context";
import type { LabReport, ReportRow } from "@/lib/lab/report-store";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { asClinicalReader } from "@/lib/emr/db";
import { withPatientWrite } from "@/lib/emr/write/context";
import { placeOrders } from "@/lib/emr/write/orders";
import { amendResults, enterResults } from "@/lib/emr/write/results";
import { collectSpecimen, receiveSpecimen, rejectSpecimen } from "@/lib/emr/write/specimens";
import { encrypt, generateKey } from "@/lib/encryption";
import {
  DRILL,
  drillRows,
  monthPeriod,
  reportCsv,
  reportFromCounts,
  reportFromRows,
  reportRows,
  statedTargets,
} from "@/lib/lab/report-store";
import {
  authUser,
  bootLane,
  clinician,
  encounter,
  hospital,
  intake,
  laneOn,
  patient,
} from "./_pglite";

const UE = "08f6ba15-f76d-5ce9-b1f1-a473a54931cb";
const FBC = "bfd23c30-1989-5fdb-8030-c87016ab22c9";
const RDT = "461e61e7-1f95-589b-a8e4-87e9e007d16e";
const HBA1C = "f05a6f3e-5793-584a-a6d2-c357de241001";
const key = () => `k-${randomUUID()}`;
const kla = (s: string) => new Date(`${s.replace(" ", "T")}:00+03:00`);
const SEP = monthPeriod("2026-09");

describe.skipIf(!laneOn)("Lab Phase 3 lab reports and quality indicators (Step 10)", () => {
  let lane: Lane;
  let pg: Pg;
  let h: string;
  let hB: string;
  const ward: Record<"w1" | "w2", string> = { w1: "", w2: "" };
  const section: Record<"s1" | "s2", string> = { s1: "", s2: "" };
  const actor: Record<string, EmrActor> = {};
  let admin: string;
  const rec: Record<string, { p: string; orderId: string; reportId: string | null }> = {};
  const dev: Record<string, string> = {};
  const env = { ...process.env };
  const one = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
    (await pg.query<T>(sql, params)).rows[0] as T;
  const as = <T>(a: EmrActor, p: string, fn: (ctx: WriteCtx) => Promise<T>) =>
    withPatientWrite(a, p, fn, { database: lane.db });
  const reader = <T>(userId: string, fn: Parameters<typeof asClinicalReader<T>>[1]) =>
    asClinicalReader({ userId, hospitalId: h }, fn, lane.db);
  const replica = async (fn: () => Promise<unknown>) => {
    await pg.query(`SET session_replication_role = replica`);
    try {
      await fn();
    } finally {
      await pg.query(`SET session_replication_role = origin`);
    }
  };

  async function newPatient(dept: string) {
    const p = await patient(pg);
    await pg.query(
      `INSERT INTO public.patient_profiles (id, first_name_encrypted, surname_encrypted, sex, date_of_birth, id_type, phone_encrypted, district_id)
       VALUES ($1, $2, $3, 'female', '1980-01-01', 'none', $4, (SELECT id FROM public.districts LIMIT 1))`,
      [p, encrypt("Fixture"), encrypt("Patient"), encrypt("0700000000")],
    );
    await intake(pg, { hospitalId: h, patientUserId: p });
    const enc = await encounter(pg, {
      hospitalId: h,
      patientUserId: p,
      clinicianUserId: actor.doctor!.userId,
      departmentId: dept,
    });
    return { p, enc };
  }

  /** Order from a ward, collect, receive (or reject), result; then move the receipt and release times. */
  async function test(
    testId: string,
    o: {
      ward: string;
      priority?: "routine" | "urgent";
      values?: { conceptId: string; value?: string; code?: string }[];
      by?: EmrActor;
      received?: Date;
      released?: Date;
      reject?: "clotted" | "haemolysed";
    },
  ) {
    const { p, enc } = await newPatient(o.ward);
    const order = await as(actor.doctor!, p, (ctx) =>
      placeOrders(ctx, {
        patientUserId: p,
        encounterId: enc,
        orders: [
          {
            clientKey: key(),
            testId,
            priority: o.priority ?? "routine",
            reasonText: "Fixture check",
          },
        ],
      }),
    );
    const bedside = o.by?.cadreCode === "NURSE";
    const sp = await as(actor.nurse!, p, (ctx) =>
      collectSpecimen(ctx, {
        patientUserId: p,
        orderId: order.id,
        identifiersConfirmed: true,
        clientKey: key(),
      }),
    );
    if (o.reject)
      await as(actor.tech!, p, (ctx) =>
        rejectSpecimen(ctx, {
          patientUserId: p,
          specimenId: sp.id,
          reasonCode: o.reject!,
          clientKey: key(),
        }),
      );
    else if (!bedside)
      await as(actor.tech!, p, (ctx) =>
        receiveSpecimen(ctx, { patientUserId: p, specimenId: sp.id, clientKey: key() }),
      );
    let reportId: string | null = null;
    if (o.values)
      reportId = (
        await as(o.by ?? actor.tech!, p, (ctx) =>
          enterResults(ctx, {
            patientUserId: p,
            orderId: order.id,
            status: "final",
            values: o.values!,
            clientKey: key(),
          }),
        )
      ).id;
    await replica(async () => {
      if (o.received)
        await pg.query(`UPDATE specimen_events SET recorded_at = $2 WHERE specimen_id = $1`, [
          sp.id,
          o.received,
        ]);
      if (reportId && o.released) {
        await pg.query(`UPDATE diagnostic_reports SET recorded_at = $2 WHERE id = $1`, [
          reportId,
          o.released,
        ]);
        await pg.query(`UPDATE clinical_observations SET recorded_at = $2 WHERE report_id = $1`, [
          reportId,
          o.released,
        ]);
      }
    });
    return { p, orderId: order.id, reportId };
  }

  const fbc = () => [
    { conceptId: "obs.haemoglobin", value: "12.0" },
    { conceptId: "obs.wbc", value: "6.0" },
    { conceptId: "obs.platelets", value: "250" },
  ];
  const ue = () => [
    { conceptId: "obs.sodium", value: "140" },
    { conceptId: "obs.potassium", value: "4.1" },
  ];

  beforeAll(async () => {
    process.env.MEDSYNC_PHI_KEY ??= generateKey();
    for (const k of ["LAB_WORKSPACE", "LAB_REPORTS"]) process.env[k] = "1";
    lane = await bootLane();
    pg = lane.pg;
    h = await hospital(pg, "Reports");
    hB = await hospital(pg, "Reports B");
    const dept = async (name: string, extra = "", params: unknown[] = []) =>
      (
        await one<{ id: string }>(
          `INSERT INTO hospital_departments (hospital_id, name, slug${extra ? `, ${extra}` : ""}) VALUES ($1, $2, $3${params.map((_, i) => `, $${i + 4}`).join("")}) RETURNING id`,
          [h, name, `d-${randomUUID().slice(0, 8)}`, ...params],
        )
      ).id;
    ward.w1 = await dept("Medical ward");
    ward.w2 = await dept("OPD clinic");
    const lab = await dept("Laboratory", "catalogue_code", ["LABORATORY"]);
    section.s1 = await dept("Fixture haematology", "parent_id", [lab]);
    section.s2 = await dept("Fixture chemistry", "parent_id", [lab]);
    const make = async (
      d: string,
      cadre: string,
      surface: EmrActor["surface"],
      perms?: string[],
    ) => ({
      ...(await clinician(pg, { hospitalId: h, departmentId: d, cadre })),
      fullName: null,
      hospitalId: h,
      departmentId: d,
      cadreCode: cadre,
      isClinical: true,
      surface,
      ...(perms ? { labPermissions: perms } : {}),
    });
    actor.doctor = await make(ward.w1, "MEDICAL_OFFICER", "doctor");
    actor.nurse = await make(ward.w1, "NURSE", "nurse");
    actor.tech = await make(lab, "LAB_TECHNOLOGIST", "lab", [
      "lab.view",
      "lab.receive",
      "lab.result.enter",
      "lab.result.release",
    ]);
    admin = await authUser(pg, "admin");
    await pg.query(
      `INSERT INTO user_roles (user_id, role, hospital_id) VALUES ($1, 'hospital_admin', $2)`,
      [admin, h],
    );
    // The hub's menu: FBC and the RDT in section 1, U&E and HbA1c in section 2. Stated times are FIXTURES; HbA1c's
    // is not one figure, so it has no target (TA-*).
    for (const [code, sec, stated] of [
      ["test.fbc", section.s1, "2 h"],
      ["test.malaria_rdt", section.s1, "30 min"],
      ["test.urea_electrolytes", section.s2, "1 h"],
      ["test.hba1c", section.s2, "same day"],
    ] as const) {
      await pg.query(
        `INSERT INTO diagnostic_offerings (hospital_id, kind, code, provision, hours, stated_tat, confirmed_at, section_id)
         VALUES ($1, 'lab', $2, 'in_house', '24h', $3, now(), $4)`,
        [h, code, stated, sec],
      );
    }

    // Released in September (8): turnaround in minutes from receipt to release.
    rec.r1 = await test(FBC, {
      ward: ward.w1,
      values: fbc(),
      received: kla("2026-09-02 09:00"),
      released: kla("2026-09-02 10:00"),
    }); // 60, on time (120)
    rec.r2 = await test(FBC, {
      ward: ward.w2,
      priority: "urgent",
      values: fbc(),
      received: kla("2026-09-03 09:00"),
      released: kla("2026-09-03 12:00"),
    }); // 180, late
    rec.r3 = await test(UE, {
      ward: ward.w1,
      values: ue(),
      received: kla("2026-09-04 08:00"),
      released: kla("2026-09-04 08:45"),
    }); // 45, on time (60); corrected below
    rec.r4 = await test(UE, {
      ward: ward.w2,
      values: ue(),
      received: kla("2026-09-05 08:00"),
      released: kla("2026-09-05 10:00"),
    }); // 120, late
    rec.r5 = await test(HBA1C, {
      ward: ward.w1,
      values: [{ conceptId: "obs.hba1c", value: "6.1" }],
      received: kla("2026-09-06 08:00"),
      released: kla("2026-09-06 09:00"),
    }); // 60, no target
    rec.r6 = await test(RDT, {
      ward: ward.w1,
      by: actor.nurse,
      values: [{ conceptId: "obs.malaria_test", code: "negative" }],
      released: kla("2026-09-07 11:00"),
    }); // bedside, no receipt
    // A downtime form: on paper collected 29 SEP 09:00, resulted 10:30 (90 min, late against 30); entered 9 OCT.
    rec.r7 = await test(RDT, {
      ward: ward.w1,
      values: [{ conceptId: "obs.malaria_test", code: "positive" }],
      received: kla("2026-10-09 08:00"),
      released: kla("2026-10-09 09:00"),
    });
    await replica(() =>
      pg.query(
        `INSERT INTO downtime_entries (report_id, hospital_id, patient_user_id, form_number, collected_at, resulted_at, entered_at, released_on_paper_by, entered_by)
         VALUES ($1, $2, $3, 4711, $4, $5, $6, 'Fixture technologist', $7)`,
        [
          rec.r7!.reportId,
          h,
          rec.r7!.p,
          kla("2026-09-29 09:00"),
          kla("2026-09-29 10:30"),
          kla("2026-10-09 09:00"),
          actor.tech!.userId,
        ],
      ),
    );
    rec.r9 = await test(FBC, {
      ward: ward.w1,
      values: fbc(),
      received: kla("2026-09-30 23:00"),
      released: kla("2026-09-30 23:30"),
    }); // 30, on time
    // Outside the month: August.
    rec.r8 = await test(FBC, {
      ward: ward.w1,
      values: fbc(),
      received: kla("2026-08-31 22:00"),
      released: kla("2026-08-31 23:30"),
    });
    await as(actor.tech!, rec.r3.p, (ctx) =>
      amendResults(ctx, {
        patientUserId: rec.r3!.p,
        reportId: rec.r3!.reportId!,
        status: "corrected",
        values: [{ conceptId: "obs.potassium", value: "4.3" }],
        reasonText: "Fixture correction",
        clientKey: key(),
      }),
    );
    // Rejected in September (4): clotted 2 from the OPD clinic and 1 from the ward; haemolysed 1 from the ward.
    for (const [w, reason, at] of [
      [ward.w2, "clotted", "2026-09-12 09:00"],
      [ward.w2, "clotted", "2026-09-13 09:00"],
      [ward.w1, "clotted", "2026-09-14 09:00"],
      [ward.w1, "haemolysed", "2026-09-15 09:00"],
    ] as const)
      await test(FBC, { ward: w, reject: reason, received: kla(at) });

    // Label checks at collection: 4 in September (2 caught), one in August, one at hospital B.
    for (const [outcome, at, hosp] of [
      ["match", "2026-09-02 08:00", h],
      ["other_patient", "2026-09-02 08:05", h],
      ["match", "2026-09-03 08:00", h],
      ["unknown_label", "2026-09-04 08:00", h],
      ["other_patient", "2026-08-30 08:00", h],
      ["other_patient", "2026-09-02 08:00", hB],
    ] as const)
      await pg.query(
        `INSERT INTO lab_identity_checks (order_id, hospital_id, patient_user_id, label_typed, outcome, method, actor_user_id, recorded_at)
         VALUES ($1, $2, $3, 'L00000001', $4, 'typed', $5, $6)`,
        [rec.r1.orderId, hosp, rec.r1.p, outcome, actor.nurse.userId, kla(at)],
      );
    // Critical alerts: 3 with a signed time in September (one in time at 10 min, one late at 30, one never
    // acknowledged), one with no signed time, one in October.
    // One alert per report (ca_one_per_report), all on the ward's results.
    for (const [r, sent, due, ack] of [
      [rec.r1, "2026-09-05 10:00", "2026-09-05 10:15", "2026-09-05 10:10"],
      [rec.r3, "2026-09-06 10:00", "2026-09-06 10:15", "2026-09-06 10:30"],
      [rec.r5, "2026-09-07 10:00", "2026-09-07 10:15", null],
      [rec.r6, "2026-09-08 10:00", null, null],
      [rec.r9, "2026-10-01 10:00", "2026-10-01 10:15", "2026-10-01 10:05"],
    ] as const)
      await pg.query(
        `INSERT INTO critical_alerts (hospital_id, patient_user_id, report_id, order_id, state, sub_state, sent_at, due_at, acknowledged_at, acknowledged_by, acknowledged_via, created_by)
         VALUES ($1, $2, $3, $4, $5, CASE WHEN $5 = 'open' THEN 'sent' END, $6, $7, $8, CASE WHEN $8::timestamptz IS NOT NULL THEN $9::uuid END, CASE WHEN $8::timestamptz IS NOT NULL THEN 'app' END, $9)`,
        [
          h,
          r!.p,
          r!.reportId,
          r!.orderId,
          ack ? "acknowledged" : "open",
          kla(sent),
          due && kla(due),
          ack && kla(ack),
          actor.tech.userId,
        ],
      );

    // Equipment: an analyser (section 2) and a fridge (section 1); a bedside meter is not lab equipment.
    const device = async (kind: string, model: string, sec: string | null) =>
      (
        await one<{ id: string }>(
          `INSERT INTO devices (hospital_id, kind, model, serial, section_id) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
          [h, kind, model, randomUUID().slice(0, 8), sec],
        )
      ).id;
    dev.analyser = await device("analyser", "Fixture analyser", section.s2);
    dev.fridge = await device("fridge", "Fixture fridge", section.s1);
    dev.meter = await device("glucometer", "Fixture meter", null);
    // QC runs in September: accepted, warning, rejected, rejected; one in August.
    const plan = (
      await one<{ id: string }>(
        `INSERT INTO lab_signed_configs (hospital_id, kind, key, version, payload, authored_by) VALUES ($1, 'qc_plan', $2, 1, '{}', $3) RETURNING id`,
        [h, `${dev.analyser}:obs.potassium`, actor.tech.userId],
      )
    ).id;
    for (const [decision, at] of [
      ["accepted", "2026-09-02 07:00"],
      ["warning", "2026-09-03 07:00"],
      ["rejected", "2026-09-04 07:00"],
      ["rejected", "2026-09-05 07:00"],
      ["rejected", "2026-08-30 07:00"],
    ] as const)
      await pg.query(
        `INSERT INTO lab_qc_runs (hospital_id, device_id, concept_id, plan_config_id, plan_version, "values", decision, first_step, run_at, recorded_by)
         VALUES ($1, $2, 'obs.potassium', $3, 1, '[]', $4, $5, $6, $7)`,
        [
          h,
          dev.analyser,
          plan,
          decision,
          decision === "rejected" ? "Fixture step" : null,
          kla(at),
          actor.tech.userId,
        ],
      );
    // Breakdowns: analyser 31 AUG 22:00 → 1 SEP 02:00 (2 h in September) and 10 SEP 08:00 → 12:00 (4 h);
    // fridge from 29 SEP 12:00, still down (36 h to the end of September). Hand count: 42 h.
    const repair = async (d: string) =>
      (
        await one<{ id: string }>(
          `INSERT INTO lab_equipment_logs (hospital_id, device_id, kind, note, done_at, actor) VALUES ($1, $2, 'repair', 'Fixture repair', now(), $3) RETURNING id`,
          [h, d, actor.tech!.userId],
        )
      ).id;
    for (const [since, back] of [
      ["2026-08-31 22:00", "2026-09-01 02:00"],
      ["2026-09-10 08:00", "2026-09-10 12:00"],
    ] as const)
      await pg.query(
        `INSERT INTO lab_breakdowns (hospital_id, device_id, since, cause, repair_log_id, back_at, back_by, downtime_minutes)
         VALUES ($1, $2, $3, 'Fixture cause', $4, $5, $6, 0)`,
        [h, dev.analyser, kla(since), await repair(dev.analyser), kla(back), actor.tech.userId],
      );
    await pg.query(
      `INSERT INTO lab_breakdowns (hospital_id, device_id, since, cause) VALUES ($1, $2, $3, 'Fixture cause')`,
      [h, dev.fridge, kla("2026-09-29 12:00")],
    );
  });

  afterAll(() => {
    process.env = env;
  });

  const now = new Date();
  let targets: Record<string, number>;
  let rows: ReportRow[];
  let lab: LabReport;

  it("S46: every tile matches the hand count of the fixture month, and no_data is never 0", async () => {
    targets = await lane.db.transaction((t) => statedTargets(t as never, h));
    expect(targets).toEqual({
      "test.fbc": 120,
      "test.malaria_rdt": 30,
      "test.urea_electrolytes": 60,
    });
    const t0 = performance.now();
    rows = await reader(actor.tech!.userId, (tx) => reportRows(tx, SEP));
    lab = reportFromRows(rows, { hospitalId: h, now, targets, ...SEP });
    const ms = performance.now() - t0;
    process.stderr.write(`[S46] lab reports page data for one month: ${ms.toFixed(1)} ms\n`);
    expect(ms).toBeLessThan(2000); // §11: p95 < 2 s TTFB

    const t = lab.tiles;
    expect(t.workload).toMatchObject({ kind: "value", value: 8 }); // r1–r7, r9; not August, not B
    expect(lab.bedside).toBe(1);
    expect(t.late_pct).toMatchObject({ value: 50, numerator: 3, denominator: 6 }); // r2, r4, r7 of 6 with a target
    expect(t.reject_pct).toMatchObject({ value: 40, numerator: 4, denominator: 10 }); // 6 received + 4 rejected
    expect(t.crit_ack_in_time).toMatchObject({ numerator: 1, denominator: 3, medianMinutes: 10 });
    expect(t.qc_reject_pct).toMatchObject({ value: 50, numerator: 2, denominator: 4 });
    expect(t.misid_caught).toMatchObject({ value: 2 }); // other_patient + unknown_label
    expect(t.corrected_pct).toMatchObject({ value: 12.5, numerator: 1, denominator: 8 });
    expect(t.downtime_h).toMatchObject({
      value: 42,
      by: { [dev.analyser!]: 6, [dev.fridge!]: 36 },
    });
    expect(lab.rejections).toEqual([
      { reason: "clotted", n: 3, wardId: ward.w2, wardN: 2 },
      { reason: "haemolysed", n: 1, wardId: ward.w1, wardN: 1 },
    ]);

    // Filters: the OPD clinic; section 2; urgent. QC runs and machines are not by ward or priority.
    const w2 = reportFromRows(rows, { hospitalId: h, now, targets, ...SEP }, { ward: ward.w2 });
    expect(w2.tiles.workload).toMatchObject({ value: 2 }); // r2, r4
    expect(w2.tiles.late_pct).toMatchObject({ value: 100, numerator: 2, denominator: 2 });
    expect(w2.tiles.crit_ack_in_time).toEqual({ kind: "no_data" }); // every alert is the ward's
    expect(w2.tiles.misid_caught).toEqual({ kind: "no_data" });
    expect(w2.tiles.corrected_pct).toMatchObject({ value: 0, numerator: 0, denominator: 2 }); // a true 0
    expect(w2.tiles.qc_reject_pct).toMatchObject({ numerator: 2, denominator: 4 });
    const s2 = reportFromRows(
      rows,
      { hospitalId: h, now, targets, ...SEP },
      { section: section.s2 },
    );
    expect(s2.tiles.workload).toMatchObject({ value: 3 }); // r3, r4, r5
    expect(s2.tiles.downtime_h).toMatchObject({ value: 6 }); // the analyser only
    const urgent = reportFromRows(
      rows,
      { hospitalId: h, now, targets, ...SEP },
      { priority: "urgent" },
    );
    expect(urgent.tiles.workload).toMatchObject({ value: 1 });

    // A month with nothing recorded: every tile "No data" except the machines, which were up (a true 0 h).
    const july = monthPeriod("2026-07");
    const empty = reportFromRows(await reader(actor.tech!.userId, (tx) => reportRows(tx, july)), {
      hospitalId: h,
      now,
      targets,
      ...july,
    });
    for (const id of [
      "workload",
      "late_pct",
      "reject_pct",
      "crit_ack_in_time",
      "qc_reject_pct",
      "misid_caught",
      "corrected_pct",
    ] as const)
      expect(empty.tiles[id], id).toEqual({ kind: "no_data" });
    expect(empty.tiles.downtime_h).toMatchObject({ kind: "value", value: 0 });
    expect(empty.tat).toEqual([]);
    // The CSV: every tile with its period and as-of time; "no_data" in words; numbers only.
    const names = { tile: String, section: String, ward: String, reason: String };
    expect(reportCsv(empty, names)).toContain("late_pct,late_pct,no_data,,,");
    const csv = reportCsv(lab, names);
    expect(csv.trim().split("\n")).toHaveLength(1 + 8 + 2 + 2); // header, tiles, sections, reasons
    expect(csv).toContain(
      `workload,workload,8,,8,${SEP.from.toISOString()},${SEP.to.toISOString()}`,
    );
    for (const r of Object.values(rec)) expect(csv).not.toContain(r.p);
  });

  it("S47: turnaround uses the form's times for downtime results, and p90 matches a hand calculation", () => {
    const r7 = rows.find((r) => r.kind === "released" && r.orderId === rec.r7!.orderId)!;
    expect(r7.at).toEqual(kla("2026-09-29 10:30")); // the paper's result time, not the 9 OCT entry
    expect(r7.receivedAt).toEqual(kla("2026-09-29 09:00")); // the paper's collection time
    // All 7 with a receipt: 30, 45, 60, 60, 90, 120, 180 → nearest rank p90 = 7th = 180, p50 = 4th = 60.
    const all = reportFromRows(rows, { hospitalId: h, now, targets, ...SEP });
    expect(all.tiles.workload).toMatchObject({ value: 8 });
    const bySection = Object.fromEntries(lab.tat.map((x) => [x.sectionId, x]));
    // Section 1: 30, 60, 90, 180 → 4th = 180; stated 30 and 120 (they differ, so no single mark).
    expect(bySection[section.s1]).toEqual({
      sectionId: section.s1,
      n: 4,
      p90: 180,
      targets: [30, 120],
    });
    // Section 2: 45, 60, 120 → 3rd = 120; stated 60 (HbA1c has none).
    expect(bySection[section.s2]).toEqual({ sectionId: section.s2, n: 3, p90: 120, targets: [60] });
  });

  it("S48: drill-down opens the records for a lab user; the admin sees the same tiles and no record, denied at RLS", async () => {
    // The late tile opens r2, r4 and r7 among the reports with a target, each with its patient.
    const late = drillRows(rows, "late_pct", targets);
    expect(late).toHaveLength(6);
    const hits = late.filter((r) => DRILL.late_pct.hit(r, targets));
    expect(hits.map((r) => r.orderId).sort()).toEqual(
      [rec.r2!.orderId, rec.r4!.orderId, rec.r7!.orderId].sort(),
    );
    expect(hits.every((r) => r.patientUserId)).toBe(true);

    // The admin: the same numbers through the aggregates function, no rows, no patient.
    const counts = await reader(admin, (tx) => reportFromCounts(tx, { now, targets, ...SEP }));
    expect(counts).not.toBeNull();
    expect(counts!.tiles).toEqual(lab.tiles);
    expect(counts!.bedside).toBe(lab.bedside);
    expect(counts!.rejections).toEqual(lab.rejections);
    const byId = (r: LabReport) =>
      [...r.tat].sort((a, b) => String(a.sectionId).localeCompare(String(b.sectionId)));
    expect(byId(counts!)).toEqual(byId(lab));
    expect(JSON.stringify(counts)).not.toContain(rec.r1!.p); // no patient id anywhere
    expect(await reader(admin, (tx) => reportRows(tx, SEP))).toEqual([]);

    // A direct query for patient rows as the admin is denied by RLS (no rows), and the source is not callable.
    for (const table of [
      "diagnostic_reports",
      "specimens",
      "specimen_events",
      "critical_alerts",
      "lab_identity_checks",
      "encounter_orders",
    ]) {
      const n = await reader(admin, (tx) =>
        tx.execute(sql.raw(`SELECT count(*)::int AS n FROM public.${table}`)),
      );
      const row = (Array.isArray(n) ? n : (n as { rows: { n: number }[] }).rows)[0] as {
        n: number;
      };
      expect(row.n, table).toBe(0);
    }
    const denied = await reader(admin, (tx) =>
      tx.execute(
        sql.raw(
          `SELECT * FROM private.lab_indicator_source('${h}', now() - interval '1 day', now())`,
        ),
      ),
    ).catch((e: Error & { cause?: Error }) => e.cause?.message ?? e.message);
    expect(denied).toMatch(/permission denied/);

    // A clinician gets neither rows nor numbers; the lab tech's counts equal the admin's.
    expect(await reader(actor.doctor!.userId, (tx) => reportRows(tx, SEP))).toEqual([]);
    expect(
      await reader(actor.doctor!.userId, (tx) => reportFromCounts(tx, { now, targets, ...SEP })),
    ).toBeNull();
    const techCounts = await reader(actor.tech!.userId, (tx) =>
      reportFromCounts(tx, { now, targets, ...SEP }),
    );
    expect(techCounts!.tiles).toEqual(lab.tiles);
  });

  it("S49: criticals acknowledged in the signed time match the Phase 1 alerts of the month", async () => {
    const hand = await one<{ due: number; in_time: number; median: number }>(
      `SELECT count(*) FILTER (WHERE due_at IS NOT NULL)::int AS due,
              count(*) FILTER (WHERE acknowledged_at <= due_at)::int AS in_time,
              percentile_disc(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM acknowledged_at - sent_at) / 60)
                FILTER (WHERE due_at IS NOT NULL AND acknowledged_at IS NOT NULL) AS median
         FROM critical_alerts WHERE hospital_id = $1 AND sent_at >= $2 AND sent_at < $3`,
      [h, SEP.from, SEP.to],
    );
    expect(hand).toMatchObject({ due: 3, in_time: 1 });
    expect(lab.tiles.crit_ack_in_time).toEqual({
      kind: "value",
      value: (hand.in_time / hand.due) * 100,
      numerator: hand.in_time,
      denominator: hand.due,
      medianMinutes: Number(hand.median),
    });
  });
});
