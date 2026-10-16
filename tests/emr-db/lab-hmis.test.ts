/**
 * Lab Phase 3, Step 9: daily registers and HMIS 105 on the PGlite lane (S38–S44). Every test, kit name, row
 * choice, quantity, date and value here is a FIXTURE: the mapping mirrors a few rows of GATE A §8.2 to exercise
 * the counting rules, never the mapping the lead and the focal person will sign. Runs with EMR_PGLITE=1.
 * The fixture month is September 2026, Africa/Kampala; times are moved there with triggers off (replica role),
 * the lane's way to place records in a past month.
 */
import { randomUUID } from "node:crypto";
import type { Lane, Pg } from "./_pglite";
import type { EmrActor } from "@/lib/emr/actor";
import type { WriteCtx } from "@/lib/emr/write/context";
import type { MappingPayload } from "@/lib/lab/hmis-store";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { withPatientWrite } from "@/lib/emr/write/context";
import { placeOrders } from "@/lib/emr/write/orders";
import { amendResults, enterResults } from "@/lib/emr/write/results";
import { collectSpecimen, receiveSpecimen, rejectSpecimen } from "@/lib/emr/write/specimens";
import { encrypt, generateKey } from "@/lib/encryption";
import { labAccess } from "@/lib/lab/access";
import { hmisForm } from "@/lib/lab/hmis-form";
import {
  changedSinceSigning,
  checkHmis,
  exportHmis,
  generateHmis,
  prepareRevision,
  revisionsOf,
  saveManualCells,
  saveMapping,
  signHmis,
  signMapping,
} from "@/lib/lab/hmis-store";
import { cellKey } from "@/lib/lab/hmis105";
import { dailyRegister } from "@/lib/lab/register";
import {
  classAccessFor,
  loadRegisterDay,
  recordPrint,
  REGISTER_DEFAULTS,
  withIdentities,
} from "@/lib/lab/register-store";
import { bootLane, clinician, encounter, hospital, intake, laneOn, patient } from "./_pglite";

const UE = "08f6ba15-f76d-5ce9-b1f1-a473a54931cb";
const FBC = "bfd23c30-1989-5fdb-8030-c87016ab22c9";
const RDT = "461e61e7-1f95-589b-a8e4-87e9e007d16e";
const HIV = "a3fe46d5-07e1-5245-9045-841528822874";
const HBA1C = "f05a6f3e-5793-584a-a6d2-c357de241001";
const key = () => `k-${randomUUID()}`;
const kla = (s: string) => new Date(`${s.replace(" ", "T")}:00+03:00`);
const MONTH = "2026-09";
/** FIXTURE kit name as a signed algorithm would carry it. */
const KIT = "Fixture HIV kit A";

describe.skipIf(!laneOn)("Lab Phase 3 registers and HMIS 105 (Step 9)", () => {
  let lane: Lane;
  let pg: Pg;
  let h: string;
  let section: string;
  let kitItem: string;
  const actor: Record<string, EmrActor> = {};
  const env = { ...process.env };
  const tx = <T>(fn: (t: Parameters<Parameters<Lane["db"]["transaction"]>[0]>[0]) => Promise<T>) =>
    lane.db.transaction(fn);
  const one = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
    (await pg.query<T>(sql, params)).rows[0] as T;
  const as = <T>(a: EmrActor, p: string, fn: (ctx: WriteCtx) => Promise<T>) =>
    withPatientWrite(a, p, fn, { database: lane.db });
  const me = (a: EmrActor) => ({ userId: a.userId, hospitalId: h });
  const replica = async (fn: () => Promise<unknown>) => {
    await pg.query(`SET session_replication_role = replica`);
    try {
      await fn();
    } finally {
      await pg.query(`SET session_replication_role = origin`);
    }
  };
  const form = hmisForm();
  /** The committed form with its rows marked verified: OA-1 has not happened, so signing needs this copy. */
  const verified = { form: { ...form.form, verified: true }, hash: form.hash };

  async function newPatient() {
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
      departmentId: actor.doctor!.departmentId!,
    });
    return { p, enc };
  }

  /** Order, collect, receive; then optionally result. Returns ids. Times are moved by `at`. */
  async function test(
    testId: string,
    o: {
      values?: { conceptId: string; value?: string; code?: string }[];
      by?: EmrActor;
      at?: Date;
      purpose?: "hct";
      reject?: "clotted";
      receive?: boolean;
    } = {},
  ) {
    const { p, enc } = await newPatient();
    const order = await as(actor.doctor!, p, (ctx) =>
      placeOrders(ctx, {
        patientUserId: p,
        encounterId: enc,
        orders: [
          {
            clientKey: key(),
            testId,
            priority: "routine",
            reasonText: "Fixture check",
            ...(o.purpose ? { testPurpose: o.purpose } : {}),
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
    else if (!bedside && o.receive !== false)
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
    if (o.at)
      await replica(async () => {
        await pg.query(`UPDATE specimen_events SET recorded_at = $2 WHERE specimen_id = $1`, [
          sp.id,
          o.at,
        ]);
        await pg.query(`UPDATE encounter_orders SET effective_at = $2 WHERE id = $1`, [
          order.id,
          o.at,
        ]);
        if (reportId) {
          await pg.query(`UPDATE diagnostic_reports SET recorded_at = $2 WHERE id = $1`, [
            reportId,
            o.at,
          ]);
          await pg.query(`UPDATE clinical_observations SET recorded_at = $2 WHERE report_id = $1`, [
            reportId,
            o.at,
          ]);
        }
      });
    return { p, orderId: order.id, specimenId: sp.id, reportId };
  }

  /** A downtime form: the paper's result time, entered in MedSync later (DT-3's `downtime_entries`). */
  async function backEntered(reportId: string, p: string, formAt: Date, enteredAt: Date) {
    await replica(async () => {
      await pg.query(`UPDATE diagnostic_reports SET recorded_at = $2 WHERE id = $1`, [
        reportId,
        enteredAt,
      ]);
      await pg.query(
        `INSERT INTO downtime_entries (report_id, hospital_id, patient_user_id, form_number, collected_at, resulted_at, entered_at, released_on_paper_by, entered_by)
         VALUES ($1, $2, $3, $4, $5, $5, $6, 'Fixture technologist', $7)`,
        [reportId, h, p, Math.floor(Math.random() * 1e6), formAt, enteredAt, actor.tech!.userId],
      );
    });
  }

  const MAPPING = (): MappingPayload => ({
    formHash: form.hash,
    orgUnitCode: null,
    rows: [
      { code: "HE02", sources: [{ testCode: "test.fbc" }] },
      { code: "HE04", sources: [{ testCode: "test.esr" }] },
      { code: "HE06", sources: [{ testCode: "test.inr_pt" }] },
      {
        code: "RP03",
        sources: [{ testCode: "test.urea_electrolytes", conceptId: "obs.potassium" }],
      },
      { code: "RP04", sources: [{ testCode: "test.urea_electrolytes", conceptId: "obs.sodium" }] },
      { code: "CX07", sources: [{ testCode: "test.hba1c" }] },
      {
        code: "PS02",
        sources: [{ testCode: "test.malaria_rdt" }],
        positive: [
          { column: "Number Positive", conceptId: "obs.malaria_test", answers: ["positive"] },
        ],
      },
    ],
    visits: { opd: "LV01", inpatient: "LV02" },
    specimenColumns: {
      venous_whole_blood: "Blood",
      capillary_whole_blood: "Blood",
      venous_serum: "Blood",
      venous_plasma: "Blood",
    },
    rejection: { clotted: "RS14" },
    reasons: { equipment_down: "Equipment break down", none: "Others" },
    hivTests: ["test.hiv_rapid"],
    kits: { [KIT]: "Determine" },
    kitItems: { [kitItem]: "Determine" },
    purposes: { hct: "HCT" },
    tracers: { [kitItem]: "SS07" },
    excluded: [],
    visitsDefinition:
      "Fixture: patient × hospital-local day × OPD or IPD with a specimen received.",
  });

  beforeAll(async () => {
    process.env.MEDSYNC_PHI_KEY ??= generateKey();
    for (const k of ["LAB_WORKSPACE", "LAB_HMIS"]) process.env[k] = "1";
    lane = await bootLane();
    pg = lane.pg;
    h = await hospital(pg, "HMIS");
    const ward = (
      await one<{ id: string }>(
        `INSERT INTO hospital_departments (hospital_id, name, slug) VALUES ($1, 'Medical ward', $2) RETURNING id`,
        [h, `ward-${randomUUID().slice(0, 8)}`],
      )
    ).id;
    const lab = (
      await one<{ id: string }>(
        `INSERT INTO hospital_departments (hospital_id, name, slug, catalogue_code) VALUES ($1, 'Laboratory', $2, 'LABORATORY') RETURNING id`,
        [h, `lab-${randomUUID().slice(0, 8)}`],
      )
    ).id;
    section = (
      await one<{ id: string }>(
        `INSERT INTO hospital_departments (hospital_id, name, slug, parent_id) VALUES ($1, 'Fixture section', $2, $3) RETURNING id`,
        [h, `sec-${randomUUID().slice(0, 8)}`, lab],
      )
    ).id;
    const make = async (
      dept: string,
      cadre: string,
      surface: EmrActor["surface"],
      labPermissions?: string[],
    ): Promise<EmrActor> => ({
      ...(await clinician(pg, { hospitalId: h, departmentId: dept, cadre })),
      fullName: null,
      hospitalId: h,
      departmentId: dept,
      cadreCode: cadre,
      isClinical: true,
      surface,
      ...(labPermissions ? { labPermissions } : {}),
    });
    const staff = ["lab.view", "lab.receive", "lab.result.enter", "lab.result.release"];
    actor.doctor = await make(ward, "MEDICAL_OFFICER", "doctor");
    actor.nurse = await make(ward, "NURSE", "nurse");
    actor.tech = await make(lab, "LAB_TECHNOLOGIST", "lab", staff);
    actor.viewer = await make(lab, "LAB_TECHNOLOGIST", "lab", ["lab.view"]);
    actor.lead = await make(lab, "LAB_TECHNOLOGIST", "lab", [
      ...staff,
      ...labAccess({ cadreCode: null, headOf: { laboratory: true, sectionIds: [] } }).permissions,
    ]);
    actor.inCharge = await make(ward, "MEDICAL_OFFICER", "doctor");
    actor.focal = await make(ward, "MEDICAL_OFFICER", "doctor");
    await pg.query(
      `INSERT INTO department_heads (hospital_id, department_id, user_id) VALUES ($1, $2, $3)`,
      [h, lab, actor.lead.userId],
    );
    // The hub's in-house menu, every test in the fixture section; INR is not offered (HM-3 i: blank).
    for (const code of [
      "test.fbc",
      "test.esr",
      "test.urea_electrolytes",
      "test.malaria_rdt",
      "test.hiv_rapid",
      "test.hba1c",
      "test.urinalysis_dipstick",
    ]) {
      await pg.query(
        `INSERT INTO diagnostic_offerings (hospital_id, kind, code, provision, hours, stated_tat, confirmed_at, section_id)
         VALUES ($1, 'lab', $2, 'in_house', '24h', 'fixture 2 h', now(), $3)`,
        [h, `fx-${code}`, section],
      );
      await pg.query(
        `INSERT INTO lab_test_services (hospital_id, test_code, offering_code, set_by) VALUES ($1, $2, $3, $4)`,
        [h, code, `fx-${code}`, actor.lead.userId],
      );
    }
    kitItem = (
      await one<{ id: string }>(
        `INSERT INTO lab_stock_items (hospital_id, name, kind, unit_of_issue, pack_size, created_by, updated_by)
         VALUES ($1, 'Fixture HIV kit A', 'kit', 'test', 1, $2, $2) RETURNING id`,
        [h, actor.lead.userId],
      )
    ).id;
  });

  afterAll(() => {
    process.env = env;
  });

  it("S50 (ordering): with all eight Phase 3 flags off, an HIV rapid test is ordered as in Phase 2, with no purpose", async () => {
    const keys = [
      "LAB_STOCK",
      "LAB_EQUIPMENT",
      "LAB_QC",
      "LAB_QC_HOLD",
      "LAB_EQA",
      "LAB_POCT_QUALITY",
      "LAB_HMIS",
      "LAB_REPORTS",
    ];
    const saved = keys.map((k) => [k, process.env[k]] as const);
    for (const k of keys) process.env[k] = "";
    try {
      const { p, enc } = await newPatient();
      const order = await as(actor.doctor!, p, (ctx) =>
        placeOrders(ctx, {
          patientUserId: p,
          encounterId: enc,
          orders: [
            { clientKey: key(), testId: HIV, priority: "routine", reasonText: "Fixture check" },
          ],
        }),
      );
      expect(
        await one(`SELECT test_purpose FROM encounter_orders WHERE id = $1`, [order.id]),
      ).toEqual({ test_purpose: null });
    } finally {
      for (const [k, v] of saved) process.env[k] = v;
    }
  });

  it("D-LAB3-21: an HIV rapid test is not ordered without its purpose while labHmis is on", async () => {
    const { p, enc } = await newPatient();
    await expect(
      as(actor.doctor!, p, (ctx) =>
        placeOrders(ctx, {
          patientUserId: p,
          encounterId: enc,
          orders: [{ clientKey: key(), testId: HIV, priority: "routine", reasonText: "Fixture" }],
        }),
      ),
    ).rejects.toMatchObject({ code: "invalid" });
    const ok = await as(actor.doctor!, p, (ctx) =>
      placeOrders(ctx, {
        patientUserId: p,
        encounterId: enc,
        orders: [
          {
            clientKey: key(),
            testId: HIV,
            priority: "routine",
            reasonText: "Fixture",
            testPurpose: "hct",
          },
        ],
      }),
    );
    expect(
      await one(`SELECT test_purpose, sensitivity FROM encounter_orders WHERE id = $1`, [ok.id]),
    ).toEqual({ test_purpose: "hct", sensitivity: "restricted" });
  });

  let mappingId = "";
  it("S40 the mapping cannot be signed while an orderable in-house test is unmapped, unless mapped to Others", async () => {
    const note = "Fixture: one laboratory lead at this hospital.";
    mappingId = await tx((t) => saveMapping(t as never, me(actor.lead!), MAPPING(), new Date()));
    // The committed form is unverified (OA-1): nothing is signed.
    await expect(
      tx((t) =>
        signMapping(
          t as never,
          { ...me(actor.lead!), as: "lead" },
          { configId: mappingId, exceptionNote: note },
          new Date(),
        ),
      ),
    ).rejects.toThrow(/not yet verified against eHMIS/);
    // Verified rows, but the dipstick is on the menu and in no row.
    await expect(
      tx((t) =>
        signMapping(
          t as never,
          { ...me(actor.lead!), as: "lead" },
          { configId: mappingId, exceptionNote: note },
          new Date(),
          verified,
        ),
      ),
    ).rejects.toThrow(/test\.urinalysis_dipstick is on the menu and in no row/);
    // Explicitly into the Others row (CX07): the lead signs, then the focal person once designated.
    const others = MAPPING();
    others.rows = others.rows.map((r) =>
      r.code === "CX07"
        ? { ...r, sources: [...r.sources, { testCode: "test.urinalysis_dipstick" }] }
        : r,
    );
    mappingId = await tx((t) => saveMapping(t as never, me(actor.lead!), others, new Date()));
    await tx((t) =>
      signMapping(
        t as never,
        { ...me(actor.lead!), as: "lead" },
        { configId: mappingId, exceptionNote: note },
        new Date(),
        verified,
      ),
    );
    const sign = () =>
      tx((t) =>
        signMapping(
          t as never,
          { ...me(actor.focal!), as: "focal" },
          { configId: mappingId, exceptionNote: null },
          new Date(),
          verified,
        ),
      );
    await expect(sign()).rejects.toThrow(/Only the HMIS focal person/);
    for (const [role, a] of [
      ["focal", actor.focal!],
      ["in_charge", actor.inCharge!],
    ] as const)
      await pg.query(
        `INSERT INTO hmis_designations (hospital_id, role, user_id, starts_on, set_by) VALUES ($1, $2, $3, '2026-01-01', $3)`,
        [h, role, a.userId],
      );
    await sign();
    expect(
      await one(`SELECT status, cso_signed_by FROM lab_signed_configs WHERE id = $1`, [mappingId]),
    ).toEqual({ status: "signed", cso_signed_by: actor.focal!.userId });
  });

  const rec: Record<string, { p: string; orderId: string; reportId: string | null }> = {};
  let countMs = 0;
  let sample = "";
  it("S41 September is generated: every counting rule (a)–(i) on records in the database", async () => {
    // (a) the release time decides, hospital-local.
    rec.fbcIn = await test(FBC, { values: fbcValues(), at: kla("2026-09-30 23:30") });
    rec.fbcOut = await test(FBC, { values: fbcValues(), at: kla("2026-10-01 00:30") });
    // (b) per analyte; (g) an amendment in October counts once, as its current version.
    rec.ue = await test(UE, {
      values: [
        { conceptId: "obs.sodium", value: "140" },
        { conceptId: "obs.potassium", value: "4.1" },
      ],
      at: kla("2026-09-10 10:00"),
    });
    await as(actor.tech!, rec.ue.p, (ctx) =>
      amendResults(ctx, {
        patientUserId: rec.ue!.p,
        reportId: rec.ue!.reportId!,
        status: "corrected",
        values: [{ conceptId: "obs.potassium", value: "4.3" }],
        reasonText: "Fixture correction",
        clientKey: key(),
      }),
    );
    // (d) rejected: 10.7 only.
    rec.clotted = await test(FBC, { reject: "clotted", at: kla("2026-09-12 09:00") });
    // (f) an outside result never counts.
    rec.outside = await test(HBA1C, {
      values: [{ conceptId: "obs.hba1c", value: "6.1" }],
      at: kla("2026-09-12 10:00"),
    });
    await replica(() =>
      pg.query(`UPDATE diagnostic_reports SET performer = 'external' WHERE id = $1`, [
        rec.outside!.reportId,
      ]),
    );
    // (h) a bench and a bedside malaria RDT.
    rec.rdtBench = await test(RDT, {
      values: [{ conceptId: "obs.malaria_test", code: "positive" }],
      at: kla("2026-09-15 09:00"),
    });
    rec.rdtBedside = await test(RDT, {
      by: actor.nurse!,
      values: [{ conceptId: "obs.malaria_test", code: "negative" }],
      at: kla("2026-09-15 11:00"),
    });
    // (e) referred out while the hub said down (equipment), and one placed before the snapshot had a reason.
    for (const [snap, at] of [
      [{ state: "down_referred", reason: "equipment_down" }, "2026-09-16 09:00"],
      [{ state: "referred" }, "2026-09-17 09:00"],
    ] as const) {
      const r = await test(HBA1C, { receive: false, at: kla(at) });
      await replica(() =>
        pg.query(`UPDATE encounter_orders SET availability_snapshot = $2 WHERE id = $1`, [
          r.orderId,
          JSON.stringify({ ...snap, words: "fixture", turnaround: null, at: kla(at) }),
        ]),
      );
    }
    // 10.3: an HIV kit result on the signed algorithm's kit, its purpose; the kit's IQC; an EQA panel sample.
    rec.hiv = await test(HIV, {
      purpose: "hct",
      values: [{ conceptId: "obs.hiv_test", code: "non_reactive" }],
      at: kla("2026-09-18 09:00"),
    });
    await hivKitResult(rec.hiv.reportId!);
    await pg.query(
      `INSERT INTO lab_control_checks (hospital_id, subject, item_id, trigger, controls, outcome, hmis_iqc, operator, at)
       VALUES ($1, 'kit', $2, 'each_day_of_use', '[]', 'pass', true, $3, $4)`,
      [h, kitItem, actor.tech!.userId, kla("2026-09-18 08:00")],
    );
    const scheme = (
      await one<{ id: string }>(
        `INSERT INTO lab_eqa_schemes (hospital_id, name, provider, covers) VALUES ($1, 'Fixture HIV PT', 'Fixture provider', ARRAY['test.hiv_rapid','test.urea_electrolytes']) RETURNING id`,
        [h],
      )
    ).id;
    await pg.query(
      `INSERT INTO lab_eqa_rounds (hospital_id, scheme_id, label, received_on, due_on, submitted_on, samples)
       VALUES ($1, $2, 'FX-1', '2026-09-01', '2026-09-20', '2026-09-19', $3)`,
      [
        h,
        scheme,
        JSON.stringify([
          { sampleId: "S1", conceptId: "obs.hiv_test", kit: KIT },
          { sampleId: "S2", conceptId: "obs.potassium", kit: null },
        ]),
      ],
    );
    // Section 6: the kit as a tracer: 100 received in August, 10 issued in September.
    const lot = (
      await one<{ id: string }>(
        `INSERT INTO lab_stock_lots (hospital_id, item_id, lot, use_by, received_at, state) VALUES ($1, $2, 'FX-LOT', '2027-12-31', $3, 'received') RETURNING id`,
        [h, kitItem, kla("2026-08-20 09:00")],
      )
    ).id;
    await replica(async () => {
      for (const [kind, q, at] of [
        ["receipt", 100, "2026-08-20 09:00"],
        ["issue", -10, "2026-09-18 07:00"],
      ] as const)
        await pg.query(
          `INSERT INTO lab_stock_transactions (hospital_id, item_id, lot_id, kind, quantity, at, actor, to_kind)
           VALUES ($1, $2, $3, $4, $5, $6, $7, CASE WHEN $4 = 'issue' THEN 'bench' END)`,
          [h, kitItem, lot, kind, q, kla(at), actor.lead!.userId],
        );
    });

    const t0 = performance.now();
    const id = await tx((t) => generateHmis(t as never, me(actor.lead!), { month: MONTH }));
    countMs = performance.now() - t0;
    const r = await one<{ cells: Record<string, { value: number | null; bedside?: number }> }>(
      `SELECT cells, mapping_config_id FROM lab_hmis_reports WHERE id = $1`,
      [id],
    );
    const v = (row: string, col: string) => r.cells[cellKey(row, col)]?.value;
    expect(v("HE02", "Number Done")).toBe(1); // (a) fbcIn only; (d) the clotted one is not done
    expect(v("RP03", "Number Done")).toBe(1); // (b), (g): once, though corrected in October
    expect(v("RP04", "Number Done")).toBe(1);
    expect(v("CX07", "Number Done")).toBe(0); // (f): the outside HbA1c is not counted; on the menu → 0
    expect(v("HE04", "Number Done")).toBe(0); // (i) ESR on the menu, none done
    expect(v("HE06", "Number Done")).toBeNull(); // (i) INR not on the menu: blank
    expect(r.cells[cellKey("PS02", "Number Done")]).toMatchObject({ value: 2, bedside: 1 }); // (h)
    expect(v("PS02", "Number Positive")).toBe(1);
    expect(v("RS14", "Blood")).toBe(1); // (d)
    expect(v("test.hba1c", "Equipment break down")).toBe(1); // (e)
    expect(v("test.hba1c", "Others")).toBe(1); // (e) before the reason was recorded
    expect(v("Determine", "Total")).toBe(1);
    expect(v("Determine", "HCT")).toBe(1);
    expect(v("Determine", "IQC")).toBe(1); // (c) QC → 10.3 IQC, never 10.2
    expect(v("Determine", "EQA")).toBe(1); // (c) EQA → 10.3 EQA; the potassium sample adds nothing to RP03
    expect(v("LV01", "Blood")).toBeGreaterThanOrEqual(5);
    expect(v("SS07", "Quantity consumed")).toBe(10);
    expect(v("SS07", "Stock on hand")).toBe(90);
    expect(countMs).toBeLessThan(5000); // §11: count105 for one month, p95 < 5 s
  });

  it("S42 the lead checks, the In-Charge signs with a fresh second factor, and the snapshot freezes", async () => {
    // Hand-entered cells live in the draft: a computed cell is refused.
    await expect(
      tx((t) =>
        saveManualCells(t as never, me(actor.lead!), {
          month: MONTH,
          cells: { [cellKey("HE02", "Number Done")]: 9 },
        }),
      ),
    ).rejects.toThrow(/counted from the records/);
    await tx((t) =>
      saveManualCells(t as never, me(actor.lead!), {
        month: MONTH,
        cells: { [cellKey("VS02", "Average Turn Around Time (Days)")]: 3 },
      }),
    );
    const sign = (a: EmrActor, fresh: boolean) =>
      tx((t) =>
        signHmis(
          t as never,
          me(a),
          { month: MONTH, revision: 1, freshSecondFactor: fresh },
          new Date(),
        ),
      );
    await expect(sign(actor.inCharge!, true)).rejects.toThrow(/checks the report/);
    await tx((t) =>
      checkHmis(t as never, me(actor.lead!), { month: MONTH, revision: 1 }, new Date()),
    );
    await expect(sign(actor.lead!, true)).rejects.toThrow(/Only the Health Unit In-Charge/);
    await expect(sign(actor.inCharge!, false)).rejects.toThrow(/reauth/);
    await sign(actor.inCharge!, true);
    const r = await one<{ state: string; signed_by: string }>(
      `SELECT state, signed_by FROM lab_hmis_reports WHERE hospital_id = $1 AND revision = 1`,
      [h],
    );
    expect(r).toEqual({ state: "signed", signed_by: actor.inCharge!.userId });
    await expect(
      pg.query(`UPDATE lab_hmis_reports SET cells = '{}' WHERE hospital_id = $1`, [h]),
    ).rejects.toThrow(/frozen/);
    await expect(
      tx((t) => generateHmis(t as never, me(actor.lead!), { month: MONTH })),
    ).rejects.toThrow(/Prepare a revision/);
  });

  it("S43 two downtime RDTs for 29 SEP entered 9 OCT: Changed since signing, a revision, revision 1 readable", async () => {
    for (const code of ["positive", "negative"]) {
      const r = await test(RDT, { values: [{ conceptId: "obs.malaria_test", code }] });
      await backEntered(r.reportId!, r.p, kla("2026-09-29 10:00"), kla("2026-10-09 09:00"));
    }
    const diff = await tx((t) => changedSinceSigning(t as never, h, MONTH));
    expect(diff!.revision).toBe(1);
    expect(diff!.downtime).toBe(true);
    const byKey = Object.fromEntries(diff!.changes.map((c) => [c.key, c]));
    expect(byKey[cellKey("PS02", "Number Done")]).toMatchObject({ old: 2, new: 4 });
    expect(byKey[cellKey("PS02", "Number Done")]!.added).toHaveLength(2);
    expect(byKey[cellKey("PS02", "Number Positive")]).toMatchObject({ old: 1, new: 2 });
    expect(Object.keys(byKey)).toEqual(
      expect.arrayContaining([cellKey("PS02", "Number Done"), cellKey("PS02", "Number Positive")]),
    );

    await tx((t) => prepareRevision(t as never, me(actor.lead!), { month: MONTH }));
    await tx((t) =>
      checkHmis(t as never, me(actor.lead!), { month: MONTH, revision: 2 }, new Date()),
    );
    await tx((t) =>
      signHmis(
        t as never,
        me(actor.inCharge!),
        { month: MONTH, revision: 2, freshSecondFactor: true },
        new Date(),
      ),
    );
    const revs = await tx((t) => revisionsOf(t as never, h, MONTH));
    expect(revs.map((r) => [r.revision, r.state])).toEqual([
      [2, "signed"],
      [1, "signed"],
    ]);
    const cell = (r: (typeof revs)[number]) =>
      (r.cells as Record<string, { value: number }>)[cellKey("PS02", "Number Done")]!.value;
    expect([cell(revs[1]!), cell(revs[0]!)]).toEqual([2, 4]);
    // The hand-entered cell is carried into the revision.
    expect(
      (revs[0]!.manual as Record<string, number>)[
        cellKey("VS02", "Average Turn Around Time (Days)")
      ],
    ).toBe(3);
    expect((await tx((t) => changedSinceSigning(t as never, h, MONTH)))!.changes).toEqual([]);
  });

  it("S44 the CSV in data-element order: blank rows absent, zeros present, ids null (never invented) until supplied", async () => {
    // The committed form has no eHMIS ids (OA-2): the file says so, cell by cell.
    const real = await tx((t) =>
      exportHmis(t as never, me(actor.lead!), { month: MONTH, revision: 2 }, new Date()),
    );
    expect(real.csv).toContain("# eHMIS data-element ids: null for");
    expect(real.csv).toContain(`# null,null,4,202609,null,${cellKey("PS02", "Number Done")}`);
    expect(real.csv).toContain(`# null,null,0,202609,null,${cellKey("HE04", "Number Done")}`);
    expect(real.csv).not.toContain("HE06");
    expect(real.csv.trim().split("\n").at(-1)).toBe(
      "dataElement,categoryOption,value,period,orgUnit",
    );
    expect(
      await one(
        `SELECT state, exported_by FROM lab_hmis_reports WHERE hospital_id = $1 AND revision = 2`,
        [h],
      ),
    ).toEqual({ state: "exported", exported_by: actor.lead!.userId });
    // With ids supplied (a FIXTURE copy of the form), every non-blank cell is a row, zeros included.
    const withIds = {
      form: {
        ...form.form,
        rows: form.form.rows.map((r) => ({
          ...r,
          cells: r.cells.map((c) => ({
            ...c,
            dataElement: `DE-${r.code ?? r.label}-fx`,
            categoryOption: `CO-${c.column}-fx`,
          })),
        })),
      },
      hash: form.hash,
    };
    const ids = await tx((t) =>
      exportHmis(t as never, me(actor.lead!), { month: MONTH, revision: 2 }, new Date(), withIds),
    );
    const lines = ids.csv.split("\n").filter((l) => l && !l.startsWith("#"));
    expect(lines[0]).toBe("dataElement,categoryOption,value,period,orgUnit");
    expect(lines).toContain("DE-PS02-fx,CO-Number Done-fx,4,202609,null");
    expect(lines).toContain("DE-HE04-fx,CO-Number Done-fx,0,202609,null");
    expect(ids.csv).not.toContain("DE-HE06");
    expect(ids.missingIds).toEqual([]);
    sample = real.csv;
  });

  it("S38 the general register prints the configured columns with no restricted test; HIV only with access", async () => {
    const day = "2026-09-18"; // the HIV test's day
    const raw = await tx((t) => loadRegisterDay(t as never, h, { sectionId: section, day }));
    const lines = withIdentities(raw, new Map());
    const general = dailyRegister({
      hospitalId: h,
      sectionId: section,
      day,
      timeZone: "Africa/Kampala",
      register: { kind: "general" },
      classAccess: classAccessFor(actor.tech!.labPermissions!),
      config: REGISTER_DEFAULTS.general,
      lines,
    });
    if (!general.ok) throw new Error();
    expect(general.columns).toEqual(REGISTER_DEFAULTS.general.columns.map((c) => c.label));
    expect(general.rows).toEqual([]); // the only test that day is HIV: never on the general register
    const hiv = (classAccess: readonly string[]) =>
      dailyRegister({
        hospitalId: h,
        sectionId: section,
        day,
        timeZone: "Africa/Kampala",
        register: { kind: "class", restrictedClass: "hiv" },
        classAccess,
        config: REGISTER_DEFAULTS.hiv,
        lines,
      });
    expect(hiv(classAccessFor(actor.viewer!.labPermissions!))).toEqual({
      ok: false,
      error: "no_class_access",
    });
    const ok = hiv(classAccessFor(actor.tech!.labPermissions!));
    expect(ok.ok && ok.rows).toHaveLength(1);
    if (!ok.ok) throw new Error();
    const col = (label: string) => ok.columns.indexOf(label);
    expect(ok.rows[0]!.cells[col("Purpose")]).toBe("HIV testing services (HCT)");
    expect(ok.rows[0]!.cells[col("Kit 1 (result)")]).toBe(`${KIT}: non reactive`);
    // A rejected specimen prints with its reason; each print writes an event.
    const d12 = withIdentities(
      await tx((t) => loadRegisterDay(t as never, h, { sectionId: section, day: "2026-09-12" })),
      new Map(),
    );
    const g12 = dailyRegister({
      hospitalId: h,
      sectionId: section,
      day: "2026-09-12",
      timeZone: "Africa/Kampala",
      register: { kind: "general" },
      classAccess: [],
      config: REGISTER_DEFAULTS.general,
      lines: d12,
    });
    if (!g12.ok) throw new Error();
    const resultCol = g12.columns.indexOf("Result");
    expect(g12.rows.map((r) => r.cells[resultCol])).toContain("Rejected: clotted");
    await expect(
      tx((t) =>
        recordPrint(
          t as never,
          me(actor.viewer!),
          { register: "hiv", sectionId: section, day, rows: 1, classAccess: [] },
          new Date(),
        ),
      ),
    ).rejects.toThrow(/Only staff who release results/);
    await tx((t) =>
      recordPrint(
        t as never,
        me(actor.tech!),
        { register: "general", sectionId: section, day: "2026-09-12", rows: 40, classAccess: [] },
        new Date(),
      ),
    );
    expect(
      await one(
        `SELECT register, pages, config_id FROM lab_register_prints WHERE hospital_id = $1`,
        [h],
      ),
    ).toEqual({ register: "general", pages: 3, config_id: null });
  });

  it("S39 a downtime result back-entered later is on the form's date, marked 'entered {date}'", async () => {
    const raw = await tx((t) =>
      loadRegisterDay(t as never, h, { sectionId: section, day: "2026-09-29" }),
    );
    const out = dailyRegister({
      hospitalId: h,
      sectionId: section,
      day: "2026-09-29",
      timeZone: "Africa/Kampala",
      register: { kind: "general" },
      classAccess: [],
      config: REGISTER_DEFAULTS.general,
      lines: withIdentities(raw, new Map()),
    });
    if (!out.ok) throw new Error();
    expect(out.rows).toHaveLength(2);
    expect(out.rows.every((r) => r.notes.includes("entered 2026-10-09"))).toBe(true);
  });

  it("reports the timing and the CSV sample", () => {
    console.warn(
      `count105 (generateHmis, read + count) for the fixture month: ${countMs.toFixed(1)} ms`,
    );
    console.warn(sample);
  });

  // ─── fixture helpers ───
  function fbcValues() {
    return [
      { conceptId: "obs.haemoglobin", value: "12.0" },
      { conceptId: "obs.wbc", value: "6.0" },
      { conceptId: "obs.platelets", value: "250" },
    ];
  }

  /** The kit step and the algorithm outcome the v2 catalogue writes (AL-2), on a FIXTURE signed algorithm. */
  async function hivKitResult(reportId: string) {
    const algo = (
      await one<{ id: string }>(
        `INSERT INTO lab_signed_configs (hospital_id, kind, key, version, status, payload, authored_by, lead_signed_by, lead_signed_at, cso_signed_by, cso_signed_at, in_force_from)
         VALUES ($1, 'hiv_algorithm', 'serial', 1, 'signed', $2, $3, $3, now(), $4, now(), now()) RETURNING id`,
        [
          h,
          JSON.stringify({
            assays: [
              { step: 1, kit: KIT },
              { step: 2, kit: "Fixture HIV kit B" },
            ],
            rules: [{ t1: "non_reactive", t2: null, t3: null, outcome: "negative" }],
            retestDays: 28,
            circular: "Fixture circular",
          }),
          actor.lead!.userId,
          actor.focal!.userId,
        ],
      )
    ).id;
    await replica(async () => {
      for (const [concept, code, context] of [
        ["obs.hiv_rdt_t1", "non_reactive", {}],
        ["obs.hiv_algorithm_outcome", "negative", { algorithmId: algo, algorithmVersion: 1 }],
      ] as const)
        await pg.query(
          `INSERT INTO clinical_observations
             SELECT (json_populate_record(o, json_build_object('id', gen_random_uuid(), 'logical_id', gen_random_uuid(),
                     'concept_id', $2::text, 'value_code', $3::text, 'context', $4::jsonb))).*
               FROM clinical_observations o WHERE o.report_id = $1 AND o.concept_id = 'obs.hiv_test'`,
          [reportId, concept, code, JSON.stringify(context)],
        );
    });
  }
});
