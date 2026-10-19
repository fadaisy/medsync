/**
 * Lab test menu v2 on the PGlite lane (Steps 2, 3, 5–9): 0171 and 0172 replayed for real; the addendum signed by
 * fixture people; template, offerings, TM-9 and ordering through the real cores; RLS probes for the new tables.
 * Partners, turnarounds and request texts are FIXTURES. Runs with EMR_PGLITE=1.
 */
import { randomUUID } from "node:crypto";
import type { Lane, Pg } from "./_pglite";
import type { EmrActor } from "@/lib/emr/actor";
import type { WriteCtx } from "@/lib/emr/write/context";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { withPatientWrite } from "@/lib/emr/write/context";
import { placeOrders } from "@/lib/emr/write/orders";
import { generateKey } from "@/lib/encryption";
import { componentsFor, saveConfigDraft, signConfig } from "@/lib/lab/catalogue-v2";
import { V17_NEW_TESTS } from "@/lib/lab/catalogue-v17.generated";
import { menuToday } from "@/lib/lab/one-menu-read";
import { loadCatalogueTests, loadMenuOfferings } from "@/lib/lab/test-menu-read";
import { addFromTemplate, saveOfferings } from "@/lib/lab/test-menu-write";
import { migrateOfferings } from "@/scripts/lab/migrate-offerings";
import {
  bootLane,
  clinician,
  department,
  encounter,
  hospital,
  intake,
  laneOn,
  patient,
  probe,
  readMigration,
} from "./_pglite";

const ALL_SECTIONS = [
  "haematology",
  "blood_transfusion",
  "clinical_chemistry",
  "immunology_serology",
  "microbiology",
  "parasitology",
  "molecular",
  "histopathology_cytology",
];
const item = (code: string, o: Record<string, unknown> = {}) => ({
  code,
  where: "in_house" as const,
  sectionOverride: null,
  hours: "24h" as const,
  hoursNote: null,
  statedTurnaroundMinutes: null,
  referredTo: null,
  ...o,
});

describe.skipIf(!laneOn)("Lab test menu v2", () => {
  let lane: Lane;
  let pg: Pg;
  let h: string;
  let h2: string;
  let ward: string;
  const a: Record<string, EmrActor> = {};
  let p: string;
  let enc: string;
  const env = { ...process.env };
  const n = async (sql: string, params?: unknown[]) =>
    (await pg.query<{ n: number }>(sql, params)).rows[0]!.n;
  const testId = async (code: string) =>
    (
      await pg.query<{ id: string }>(
        `SELECT id FROM test_catalogue WHERE code = $1 AND hospital_id IS NULL`,
        [code],
      )
    ).rows[0]!.id;
  const order = async (codes: string[]) => {
    // Ids first: a raw query inside the write transaction would wait on it (one PGlite session).
    const ids = await Promise.all(codes.map(testId));
    return withPatientWrite(
      a.doctor!,
      p,
      (ctx: WriteCtx) =>
        placeOrders(ctx, {
          patientUserId: p,
          encounterId: enc,
          orders: ids.map((testId) => ({
            clientKey: `k-${randomUUID()}`,
            testId,
            priority: "routine" as const,
            reasonText: "Fixture reason",
          })),
        }),
      { database: lane.db },
    );
  };
  const me = (hospitalId: string) => ({ userId: a.lead!.userId, hospitalId });

  beforeAll(async () => {
    process.env.MEDSYNC_PHI_KEY ??= generateKey();
    lane = await bootLane();
    pg = lane.pg;
    h = await hospital(pg, "Menu A");
    h2 = await hospital(pg, "Menu B");
    ward = await department(pg, h, "Ward");
    const lab = await department(pg, h, "Laboratory");
    const make = async (d: string, cadreCode: string, surface: EmrActor["surface"]) => ({
      ...(await clinician(pg, { hospitalId: h, departmentId: d, cadre: cadreCode })),
      fullName: null,
      hospitalId: h,
      departmentId: d,
      cadreCode,
      isClinical: true,
      surface,
    });
    a.doctor = await make(ward, "MEDICAL_OFFICER", "doctor");
    a.lead = await make(lab, "LAB_TECHNOLOGIST", "lab");
    a.lead2 = await make(lab, "LAB_TECHNOLOGIST", "lab");
    a.cso = await make(ward, "CONSULTANT", "doctor");
    p = await patient(pg);
    await intake(pg, { hospitalId: h, patientUserId: p });
    enc = await encounter(pg, {
      hospitalId: h,
      patientUserId: p,
      clinicianUserId: a.doctor.userId,
      departmentId: ward,
    });
  }, 300_000);
  afterAll(() => {
    process.env.LAB_WORKSPACE = env.LAB_WORKSPACE;
    process.env.LAB_ONE_MENU = env.LAB_ONE_MENU;
  });

  it("S1: 0172 lands 428 results and 251 inactive tests, every catalogue test has a section; a re-run adds nothing", async () => {
    const counts = async () => [
      await n(`SELECT count(*)::int AS n FROM clinical_concepts WHERE catalogue_version = '1.7.0'`),
      await n(
        `SELECT count(*)::int AS n FROM test_catalogue WHERE hospital_id IS NULL AND code = ANY($1) AND NOT active`,
        [[...V17_NEW_TESTS]],
      ),
      await n(
        `SELECT count(*)::int AS n FROM test_catalogue WHERE hospital_id IS NULL AND section IS NOT NULL`,
      ),
    ];
    expect(await counts()).toEqual([428, 251, 291]);
    await pg.query(`UPDATE test_catalogue SET aliases = '{Fixture}' WHERE code = 'test.fbc'`);
    await pg.exec(readMigration("0172_cfc_v1_7_lab_test_menu.sql"));
    expect(await counts()).toEqual([428, 251, 291]);
    expect(
      (await pg.query(`SELECT aliases FROM test_catalogue WHERE code = 'test.fbc'`)).rows[0],
    ).toEqual({ aliases: ["Fixture"] });
  });

  it("S4, TM-D12: unverified codes import as null with a note; tb_xpert_rif carries the ACTIVE code", async () => {
    const { codes } = (
      await pg.query<{ codes: Record<string, unknown>[] }>(
        `SELECT codes FROM clinical_concepts WHERE id = 'obs.uds_opiates'`,
      )
    ).rows[0]!;
    expect(codes).toEqual([
      expect.objectContaining({
        system: "LOINC",
        code: null,
        status: "unverified",
        note: expect.any(String),
      }),
    ]);
    const rif = await pg.query(`SELECT codes FROM clinical_concepts WHERE id = 'obs.tb_xpert_rif'`);
    expect(JSON.stringify(rif.rows[0])).toContain("89489-9");
    expect(JSON.stringify(rif.rows[0])).not.toContain("89372-7");
  });

  it("S2, Law 4: before signing, a new test is 'not yet signed', cannot be added and cannot be ordered", async () => {
    const tests = await loadCatalogueTests(h, true, lane.db);
    expect(tests.find((t) => t.code === "test.c3")?.signed).toBe(false);
    await expect(saveOfferings(me(h), [item("test.c3")], new Date(), lane.db)).rejects.toThrow(
      /Not yet signed/,
    );
    await expect(order(["test.c3"])).rejects.toThrow(/not on this hospital's menu/);
  });

  it("S3, CC-1: signed by the lead and the CSO, the new tests are addable; existing results untouched", async () => {
    const before = await n(`SELECT count(*)::int AS n FROM clinical_observations`);
    // v1.7, then v1.6 too, so the whole catalogue is signed for the template scenarios below.
    for (const key of ["cfc-1.7.0", "cfc-1.6.0"]) {
      const id = await lane.db.transaction((t) =>
        saveConfigDraft(
          t,
          me(h),
          { kind: "addendum", key, payload: { hash: "b".repeat(64) }, global: true },
          new Date(),
        ),
      );
      for (const [who, as] of [
        [a.lead2!, "lead"],
        [a.cso!, "cso"],
      ] as const)
        await lane.db.transaction((t) =>
          signConfig(
            t,
            { userId: who.userId, hospitalId: h, as },
            { configId: id, exceptionNote: null },
            new Date(),
          ),
        );
    }
    expect(
      await n(`SELECT count(*)::int AS n FROM test_catalogue WHERE code = ANY($1) AND active`, [
        [...V17_NEW_TESTS],
      ]),
    ).toBe(251);
    const trop = await lane.db.transaction((t) =>
      componentsFor(t, h, { code: "test.troponin", components: ["obs.troponin_i_hs"] }, null),
    );
    expect(trop.components).toEqual(["obs.troponin_i_hs", "obs.troponin_i"]);
    expect(await n(`SELECT count(*)::int AS n FROM clinical_observations`)).toBe(before);
  });

  it("S11, S12: the RRH template on an empty menu adds 215 tests, turnaround empty; again adds nothing", async () => {
    const first = await addFromTemplate(
      me(h),
      { level: "RRH", sections: ALL_SECTIONS, hours: "24h" },
      new Date(),
      lane.db,
    );
    expect(first).toEqual({ added: 215, kept: 0, outside: 0 });
    expect(
      await n(
        `SELECT count(*)::int AS n FROM diagnostic_offerings WHERE hospital_id = $1 AND kind = 'lab' AND stated_turnaround_minutes IS NULL AND stated_tat IS NULL`,
        [h],
      ),
    ).toBe(215);
    const again = await addFromTemplate(
      me(h),
      { level: "RRH", sections: ALL_SECTIONS, hours: "24h" },
      new Date(),
      lane.db,
    );
    expect(again).toEqual({ added: 0, kept: 215, outside: 0 });
  });

  it("S13: GH over an edited menu adds only the missing tests and keeps the edit", async () => {
    await saveOfferings(
      { userId: a.lead!.userId, hospitalId: h2 },
      [
        item("test.fbc", {
          where: "referred",
          hours: null,
          statedTurnaroundMinutes: 60,
          referredTo: "Fixture lab",
        }),
      ],
      new Date(),
      lane.db,
    );
    const c = await addFromTemplate(
      { userId: a.lead!.userId, hospitalId: h2 },
      { level: "GH", sections: ALL_SECTIONS, hours: "scheduled" },
      new Date(),
      lane.db,
    );
    expect(c).toEqual({ added: 178, kept: 1, outside: 0 });
    const fbc = (await loadMenuOfferings(h2, new Set(["test.fbc"]), lane.db))[0]!;
    expect(fbc).toMatchObject({
      where: "referred",
      statedTurnaroundMinutes: 60,
      referredTo: "Fixture lab",
    });
  });

  it("S6, Law 2: an override shows; choosing the catalogue's section again stores no override", async () => {
    await saveOfferings(
      me(h),
      [item("test.urinalysis_complete", { sectionOverride: "clinical_chemistry" })],
      new Date(),
      lane.db,
    );
    const get = async () =>
      (
        await pg.query(
          `SELECT section_override FROM diagnostic_offerings WHERE hospital_id = $1 AND code = 'test.urinalysis_complete'`,
          [h],
        )
      ).rows[0];
    expect(await get()).toEqual({ section_override: "clinical_chemistry" });
    await saveOfferings(
      me(h),
      [item("test.urinalysis_complete", { sectionOverride: "parasitology" })],
      new Date(),
      lane.db,
    );
    expect(await get()).toEqual({ section_override: null });
  });

  it("S7, TM-13: a bulk change to three referred tests writes three audit rows", async () => {
    const before = await n(
      `SELECT count(*)::int AS n FROM audit_log WHERE table_name = 'diagnostic_offerings'`,
    );
    await saveOfferings(
      me(h),
      ["test.c3", "test.c4", "test.anti_dsdna"].map((c) =>
        item(c, {
          where: "referred",
          hours: null,
          statedTurnaroundMinutes: 10080,
          referredTo: "Fixture partner",
        }),
      ),
      new Date(),
      lane.db,
    );
    expect(
      await n(`SELECT count(*)::int AS n FROM audit_log WHERE table_name = 'diagnostic_offerings'`),
    ).toBe(before + 3);
    expect(
      (
        await pg.query(
          `SELECT stated_tat FROM diagnostic_offerings WHERE hospital_id = $1 AND code = 'test.c3'`,
          [h],
        )
      ).rows[0],
    ).toEqual({ stated_tat: "7 days" });
  });

  it("TM-3, TM-12, Law 7: ordering reads the test's own row; not offered is not orderable, orders already placed stay", async () => {
    process.env.LAB_WORKSPACE = "1";
    process.env.LAB_ONE_MENU = "1";
    const placed = await order(["test.fbc"]);
    await saveOfferings(me(h), [item("test.fbc", { where: "not_offered" })], new Date(), lane.db);
    const today = await menuToday(lane.db, h);
    expect(today("test.fbc")).toMatchObject({ state: "not_offered", orderable: false });
    expect(today("test.esr")).toMatchObject({ state: "in_house", orderable: true });
    expect(today("test.bleeding_time")).toMatchObject({ state: "not_linked", orderable: false });
    await expect(order(["test.fbc"])).rejects.toThrow(/Not offered at Menu A/);
    expect(
      await n(`SELECT count(*)::int AS n FROM encounter_orders WHERE id = ANY($1)`, [
        placed.orderIds,
      ]),
    ).toBe(1);
    await saveOfferings(me(h), [item("test.fbc")], new Date(), lane.db);
    process.env.LAB_ONE_MENU = env.LAB_ONE_MENU;
  });

  it("S19: a profile's tests become one order line each, each with its own class", async () => {
    const r = await order(["test.fbc", "test.blood_group", "test.syphilis"]);
    expect(new Set(r.orderIds).size).toBe(3);
    const rows = await pg.query<{ code: string; sensitivity: string }>(
      `SELECT t.code, o.sensitivity FROM encounter_orders o JOIN test_catalogue t ON t.id = o.test_id WHERE o.id = ANY($1) ORDER BY t.code`,
      [r.orderIds],
    );
    expect(rows.rows).toEqual([
      { code: "test.blood_group", sensitivity: "standard" },
      { code: "test.fbc", sensitivity: "standard" },
      { code: "test.syphilis", sensitivity: "restricted" },
    ]);
  });

  it("S17, S18, TM-9: per-LOINC rows become their tests once; orders keep their snapshot", async () => {
    const h3 = await hospital(pg, "Menu C");
    for (const code of ["1742-6", "1920-8", "DEMO-X"])
      await pg.query(
        `INSERT INTO diagnostic_offerings (hospital_id, kind, code, provision, hours, confirmed_at) VALUES ($1, 'lab', $2, 'in_house', '24h', now())`,
        [h3, code],
      );
    const snap = await pg.query(
      `SELECT id, availability_snapshot, loinc_code FROM encounter_orders ORDER BY id`,
    );
    const dry = await migrateOfferings(lane.db, false, undefined);
    const mine = dry.find((r) => r.hospitalId === h3)!;
    expect(mine.plan.unmapped).toEqual(["DEMO-X"]);
    expect(mine.plan.rows.map((r) => r.code)).toContain("test.lft");
    expect(
      await n(
        `SELECT count(*)::int AS n FROM diagnostic_offerings WHERE hospital_id = $1 AND code LIKE 'test.%'`,
        [h3],
      ),
    ).toBe(0);
    await migrateOfferings(lane.db, true, a.lead!.userId);
    const made = await n(
      `SELECT count(*)::int AS n FROM diagnostic_offerings WHERE hospital_id = $1 AND code LIKE 'test.%'`,
      [h3],
    );
    expect(made).toBe(mine.plan.rows.length);
    const again = (await migrateOfferings(lane.db, false, undefined)).find(
      (r) => r.hospitalId === h3,
    )!;
    expect(again.plan.rows).toEqual([]);
    expect(
      (
        await pg.query(
          `SELECT id, availability_snapshot, loinc_code FROM encounter_orders ORDER BY id`,
        )
      ).rows,
    ).toEqual(snap.rows);
  });

  it("S23, S25, TM-11: a decline needs a reason; added needs a catalogue test", async () => {
    const ins = (state: string, extra = "") =>
      pg.query(
        `INSERT INTO lab_catalogue_requests (hospital_id, requested_by, name, purpose, specimen, route, state ${extra ? ", reason" : ""})
         VALUES ($1, $2, 'Fixture test', 'Fixture purpose', 'Serum', 'referred', $3 ${extra ? ", $4" : ""})`,
        extra ? [h, a.lead!.userId, state, extra] : [h, a.lead!.userId, state],
      );
    await expect(ins("declined")).rejects.toThrow(/lcr_decided/);
    await expect(ins("added")).rejects.toThrow(/lcr_decided/);
    await expect(ins("declined", "Fixture reason")).resolves.toBeTruthy();
  });

  it("RLS: profiles and requests are read by their hospital only; no client role writes", async () => {
    for (const hid of [h, h2]) {
      await pg.query(
        `INSERT INTO lab_order_profiles (hospital_id, name, test_codes, created_by, updated_by) VALUES ($1, $2, '{test.fbc}', $3, $3)`,
        [hid, `Fixture ${hid.slice(0, 4)}`, a.lead!.userId],
      );
      await pg.query(
        `INSERT INTO lab_catalogue_requests (hospital_id, requested_by, name, purpose, specimen, route) VALUES ($1, $2, 'Fixture', 'Fixture purpose', 'Serum', 'in_house')`,
        [hid, a.lead!.userId],
      );
    }
    const staffA = { userId: a.doctor!.userId, role: "authenticated" as const };
    const readerA = {
      userId: a.doctor!.userId,
      role: "medsync_clinical_reader" as const,
      hospitalId: h,
    };
    for (const t of ["lab_order_profiles", "lab_catalogue_requests"]) {
      for (const actor of [staffA, readerA]) {
        const r = await probe(pg, actor, `SELECT DISTINCT hospital_id FROM ${t}`);
        expect(r.ok && r.rows.map((x) => x.hospital_id)).toEqual([h]);
      }
      const anon = await probe(pg, { userId: null, role: "anon" }, `SELECT 1 FROM ${t}`);
      expect(anon.ok ? anon.rows : []).toEqual([]);
      for (const sql of [`DELETE FROM ${t}`, `UPDATE ${t} SET hospital_id = hospital_id`])
        expect((await probe(pg, staffA, sql)).ok).toBe(false);
    }
    expect(
      (
        await probe(
          pg,
          staffA,
          `INSERT INTO lab_order_profiles (hospital_id, name, test_codes, created_by, updated_by) VALUES ($1, 'X', '{test.fbc}', $2, $2)`,
          [h, a.doctor!.userId],
        )
      ).ok,
    ).toBe(false);
  });
});
