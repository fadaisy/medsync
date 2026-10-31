/**
 * Pharmacy Phase 1, Step 8: downtime set-up and going live per dispensing point on the PGlite lane
 * (S67, S69, S72, S77, S79, S80, S82, S83; DT-2, DT-4, DT-11, RD-1 to RD-5, D-PH1-05). Downtime writes
 * go through the pharmacy write path; going-live writes run as a hospital admin in one transaction.
 * The hazard log's pharmacist co-signature is a FIXTURE here (it is a document; none is recorded yet),
 * as are every signed set, legal answer, product, count, phone and person. Runs with EMR_PGLITE=1.
 */
import type { Lane, Pg } from "./_pglite";
import type * as GoLiveCopy from "@/content/pharmacy-golive";
import type { Admin } from "@/lib/pharmacy/golive/store";
import type { PharmacyActor, PharmacyCtx, PharmacyNeed } from "@/lib/pharmacy/write";
import type { z } from "zod";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { asClinicalWriter } from "@/lib/emr/db";
import { reserveFormNumbers } from "@/lib/lab/downtime-store";
import { PHARMACY_MAP_V2, pharmacyDispensingAccess } from "@/lib/pharmacy/access";
import * as dt from "@/lib/pharmacy/downtime-store";
import {
  getPharmacyReadiness,
  goLiveFactsFor,
  PHARMACIST_REVIEWER_ROLE,
} from "@/lib/pharmacy/golive/read";
import * as gl from "@/lib/pharmacy/golive/store";
import { GO_LIVE_SETS } from "@/lib/pharmacy/readiness";
import { isLive, runPharmacyWrite, withPharmacyWrite } from "@/lib/pharmacy/write";
import { authUser, bootLane, hospital, laneOn, staff } from "./_pglite";

vi.mock("@/db", () => ({ db: undefined }));
vi.mock("@/content/pharmacy-golive", async (orig) => ({
  ...(await orig<typeof GoLiveCopy>()),
  // FIXTURE: the hazard log signed and co-signed, on the stricter co-signature path.
  HAZARD_LOG_SIGNATURE: {
    csoSignedBy: "fixture",
    pharmacistCoSignedBy: "fixture",
    on: "2026-10-01",
  },
  PHARMACIST_COSIGN: { required: true, decidedOn: "2026-10-13" },
}));
// S83: the pages read their scope first; with the flags off they answer not found before any data.
vi.mock("@/lib/pharmacy/actor", () => ({
  POINT_COOKIE: "ms-pharmacy-point",
  requirePharmacyActor: async () => ({
    hospitalId: "33333333-3333-4333-8333-333333333333",
    points: [],
    pointId: null,
  }),
}));
vi.mock("@/lib/hospital-admin/scope", () => ({
  requireHospitalAdminScope: async () => ({
    hospitalId: "33333333-3333-4333-8333-333333333333",
    userId: "u",
  }),
}));

const MED = "amoxicillin";

describe.skipIf(!laneOn)("Pharmacy downtime and going live (Step 8)", () => {
  let lane: Lane;
  let pg: Pg;
  const f = {} as Record<string, string>;
  const env = { ...process.env };

  const actor = (
    userId: string,
    cadre: string,
    pointId: string,
    hospitalId = f.h!,
  ): PharmacyActor => ({
    userId,
    hospitalId,
    cadreCode: cadre,
    cadreName: cadre,
    pointId,
    access: pharmacyDispensingAccess(cadre, PHARMACY_MAP_V2),
  });
  const tech = (point = f.op!) => actor(f.tech!, "PHARMACY_TECH", point);
  const head = (point = f.op!) => actor(f.head!, "PHARMACIST", point);

  function write<I, R extends { id: string }>(
    schema: z.ZodType<I>,
    fn: (ctx: PharmacyCtx, input: I) => Promise<R>,
    raw: unknown,
    who: PharmacyActor,
    need: PharmacyNeed,
  ) {
    return runPharmacyWrite(schema, raw, who, need, fn, { database: lane.db });
  }
  const asAdmin = <T>(
    a: Admin,
    fn: (tx: Parameters<Parameters<typeof asClinicalWriter>[1]>[0]) => Promise<T>,
  ) => asClinicalWriter(a, fn, lane.db);
  const admin = (k: string, h = f.h!): Admin => ({ userId: f[k]!, hospitalId: h });
  const fails = (p: Promise<unknown>) =>
    p.then(
      () => "no error",
      (e: Error) => e.message,
    );
  const count = async (table: string) =>
    (await pg.query<{ n: number }>(`SELECT count(*)::int AS n FROM public.${table}`)).rows[0]!.n;
  const pointRow = async (id: string) =>
    (
      await pg.query<{ live_at: Date | null; switched_off_at: Date | null }>(
        `SELECT live_at, switched_off_at FROM public.pharmacy_dispensing_points WHERE department_id = $1`,
        [id],
      )
    ).rows[0]!;
  const readiness = (pointId: string) =>
    lane.db.transaction((tx) => getPharmacyReadiness(tx, f.h!, pointId, new Date()));

  beforeAll(async () => {
    lane = await bootLane();
    pg = lane.pg;
    for (const h of ["h", "h2"]) {
      f[h] = await hospital(pg, `Going live ${h}`);
      f[`${h}pharmacy`] = (
        await pg.query<{ id: string }>(
          `INSERT INTO public.hospital_departments (hospital_id, name, slug, kind, catalogue_code)
           VALUES ($1, 'Pharmacy', $2, 'support', 'PHARMACY') RETURNING id`,
          [f[h], `ph-${h}-${Date.now()}`],
        )
      ).rows[0]!.id;
    }
    for (const [k, name] of [
      ["op", "Fixture point A"],
      ["ip", "Fixture point B"],
    ] as const) {
      f[k] = (
        await pg.query<{ id: string }>(
          `INSERT INTO public.hospital_departments (hospital_id, parent_id, name, slug, kind)
           VALUES ($1, $2, $3, $4, 'support') RETURNING id`,
          [f.h, f.hpharmacy, name, `${k}-${Date.now()}`],
        )
      ).rows[0]!.id;
      await pg.query(
        `INSERT INTO public.pharmacy_dispensing_points (department_id, hospital_id, serves) VALUES ($1, $2, 'window')`,
        [f[k], f.h],
      );
    }
    f.tech = (
      await staff(pg, { hospitalId: f.h!, departmentId: f.op!, cadre: "PHARMACY_TECH" })
    ).userId;
    f.head = (
      await staff(pg, { hospitalId: f.h!, departmentId: f.hpharmacy!, cadre: "PHARMACIST" })
    ).userId;
    // The in-charge: head of Pharmacy (manage at every point; RD-1 condition 6 for both points).
    await pg.query(
      `INSERT INTO public.department_heads (hospital_id, department_id, user_id, starts_at)
       VALUES ($1, $2, $3, now() - interval '1 day')`,
      [f.h, f.hpharmacy, f.head],
    );
    for (const k of ["a", "b", "a2", "b2"]) f[k] = await authUser(pg, `admin-${k}`);
  }, 120_000);

  afterAll(() => {
    process.env = env;
  });

  // ─── Downtime ────────────────────────────────────────────────────────

  it("S67: 10 numbers reserved, DS-labelled, unique per hospital; the lab's next run does not reuse them", async () => {
    const r = await write(
      dt.ReserveInput,
      dt.reserveSheetNumbers,
      { count: 10 },
      tech(),
      dt.SHEETS_NEED,
    );
    expect(r.ok).toBe(true);
    const numbers = r.ok ? r.data!.numbers : [];
    expect(numbers).toHaveLength(10);
    expect(numbers.every((n, i) => i === 0 || n === numbers[i - 1]! + 1)).toBe(true);
    const rows = await pg.query<{
      number: number;
      workspace: string;
      state: string;
      dispensing_point_id: string;
    }>(
      `SELECT number, workspace, state, dispensing_point_id FROM public.downtime_form_numbers
        WHERE hospital_id = $1 ORDER BY number`,
      [f.h],
    );
    expect(rows.rows.map((x) => x.number)).toEqual(numbers);
    expect(
      rows.rows.every(
        (x) => x.workspace === "pharmacy" && x.state === "unused" && x.dispensing_point_id === f.op,
      ),
    ).toBe(true);
    const { pharmacySheetLabel } = await import("@/lib/pharmacy/downtime");
    expect(pharmacySheetLabel(numbers[0]!)).toMatch(/^DS-\d{5}$/);

    const lab = await lane.db.transaction((tx) =>
      reserveFormNumbers(tx, { userId: f.tech!, hospitalId: f.h! }, 3, new Date()),
    );
    expect(lab[0]).toBe(numbers.at(-1)! + 1);
    expect(lab.some((n) => numbers.includes(n))).toBe(false);
    f.sheet1 = String(numbers[0]);
    f.sheet2 = String(numbers[1]);
    f.sheet3 = String(numbers[2]);
  });

  it("S72: a technician cannot record a downtime; the in-charge can, and the sheets used become to enter", async () => {
    const period = {
      startsAt: new Date(Date.now() - 3 * 3600_000).toISOString(),
      endsAt: new Date(Date.now() - 3600_000).toISOString(),
      reason: "power",
      note: null,
      sheets: [Number(f.sheet1), Number(f.sheet2)],
    };
    const byTech = await write(
      dt.PeriodInput,
      dt.recordDowntime,
      period,
      tech(),
      dt.MANAGE_SHEETS_NEED,
    );
    expect(byTech.ok).toBe(false);
    expect(!byTech.ok && byTech.error).toMatch(/do not have permission/);

    const future = await write(
      dt.PeriodInput,
      dt.recordDowntime,
      { ...period, endsAt: new Date(Date.now() + 3600_000).toISOString() },
      head(),
      dt.MANAGE_SHEETS_NEED,
    );
    expect(!future.ok && future.error).toMatch(/future/);

    const ok = await write(
      dt.PeriodInput,
      dt.recordDowntime,
      period,
      head(),
      dt.MANAGE_SHEETS_NEED,
    );
    expect(ok.ok).toBe(true);
    const states = await pg.query<{
      number: number;
      state: string;
      downtime_period_id: string | null;
    }>(
      `SELECT number, state, downtime_period_id FROM public.downtime_form_numbers
        WHERE hospital_id = $1 AND workspace = 'pharmacy' ORDER BY number LIMIT 3`,
      [f.h],
    );
    expect(states.rows.map((s) => s.state)).toEqual(["to_enter", "to_enter", "unused"]);
    expect(states.rows[0]!.downtime_period_id).toBe(ok.ok ? ok.id : "");
    expect(await dt.countSheetsToEnter(f.h!, lane.db)).toBe(2);

    // A sheet already named cannot be named again.
    const again = await write(
      dt.PeriodInput,
      dt.recordDowntime,
      period,
      head(),
      dt.MANAGE_SHEETS_NEED,
    );
    expect(!again.ok && again.error).toMatch(/is to enter/);
  });

  it("voiding a sheet number is the in-charge's, with a reason; a voided number moves no further", async () => {
    const raw = { number: Number(f.sheet3), reason: "Spoilt in the printer" };
    const byTech = await write(
      dt.VoidInput,
      dt.voidSheetNumber,
      raw,
      tech(),
      dt.MANAGE_SHEETS_NEED,
    );
    expect(byTech.ok).toBe(false);
    expect(
      (await write(dt.VoidInput, dt.voidSheetNumber, raw, head(), dt.MANAGE_SHEETS_NEED)).ok,
    ).toBe(true);
    const twice = await write(dt.VoidInput, dt.voidSheetNumber, raw, head(), dt.MANAGE_SHEETS_NEED);
    expect(!twice.ok && twice.error).toMatch(/voided/);
  });

  it("S69: a sheet to enter moves to complete; a complete sheet cannot go back; an unused one cannot complete", async () => {
    const done = await write(
      dt.CompleteInput,
      dt.completeSheet,
      { number: Number(f.sheet1) },
      tech(),
      dt.SHEETS_NEED,
    );
    expect(done.ok).toBe(true);
    const row = await pg.query<{ state: string; completed_by: string }>(
      `SELECT state, completed_by FROM public.downtime_form_numbers WHERE hospital_id = $1 AND number = $2`,
      [f.h, Number(f.sheet1)],
    );
    expect(row.rows[0]).toMatchObject({ state: "complete", completed_by: f.tech });
    const again = await write(
      dt.CompleteInput,
      dt.completeSheet,
      { number: Number(f.sheet1) },
      tech(),
      dt.SHEETS_NEED,
    );
    expect(again.ok).toBe(false);
    await expect(
      pg.query(
        `UPDATE public.downtime_form_numbers SET state = 'to_enter', completed_at = NULL, completed_by = NULL
          WHERE hospital_id = $1 AND number = $2`,
        [f.h, Number(f.sheet1)],
      ),
    ).rejects.toThrow(/cannot move from complete/);
    const unused = (
      await pg.query<{ number: number }>(
        `SELECT number FROM public.downtime_form_numbers WHERE hospital_id = $1 AND workspace = 'pharmacy' AND state = 'unused' LIMIT 1`,
        [f.h],
      )
    ).rows[0]!.number;
    const early = await write(
      dt.CompleteInput,
      dt.completeSheet,
      { number: unused },
      tech(),
      dt.SHEETS_NEED,
    );
    expect(!early.ok && early.error).toMatch(/not used/);
    expect(await dt.countSheetsToEnter(f.h!, lane.db)).toBe(1); // unused sheets do not count as waiting
  });

  // ─── Going live ──────────────────────────────────────────────────────

  it("S79: with no drill recorded the point cannot be switched on, and the page names the unmet condition", async () => {
    const r = (await readiness(f.op!))!;
    const drill = r.readiness.conditions.find((c) => c.id === 4)!;
    expect(drill).toMatchObject({ title: "A downtime drill is recorded", met: false });
    expect(drill.evidence).toContain("No drill recorded at this point");
    expect(
      await fails(asAdmin(admin("a"), (tx) => gl.requestGoLive(tx, admin("a"), f.op!, new Date()))),
    ).toMatch(/Every condition must be met/);
  });

  it("S77: a drill writes a drill record and nothing else: no patient record, no stock", async () => {
    const tables = [
      "pharmacy_handovers",
      "pharmacy_supplies",
      "pharmacy_stock_movements",
      "pharmacy_line_events",
      "prescriptions",
    ];
    const before = await Promise.all(tables.map(count));
    const drills = await count("downtime_drills");
    for (const point of [f.op!, f.ip!]) {
      const r = await write(
        dt.DrillInput,
        dt.recordDrill,
        {
          heldOn: new Date().toISOString().slice(0, 10),
          participants: "Two pharmacy staff",
          whatWasDone: "Printed sheets and filled three rows by hand",
          problems: null,
        },
        tech(point),
        dt.SHEETS_NEED,
      );
      expect(r.ok).toBe(true);
    }
    expect(await Promise.all(tables.map(count))).toEqual(before);
    expect(await count("downtime_drills")).toBe(drills + 2);
    const row = await pg.query<{ workspace: string; dispensing_point_id: string }>(
      `SELECT workspace, dispensing_point_id FROM public.downtime_drills WHERE hospital_id = $1 ORDER BY created_at`,
      [f.h],
    );
    expect(row.rows[0]).toEqual({ workspace: "pharmacy", dispensing_point_id: f.op });
  });

  /** Everything but the second admin: signed sets co-signed by the pharmacist reviewer, Q1–Q6, a counted product, briefings, a phone. */
  async function meetConditions(pointId: string) {
    const sets = (
      await pg.query<{ kind: string }>(
        `SELECT kind FROM public.pharmacy_signed_sets WHERE hospital_id = $1 AND status = 'signed'`,
        [f.h],
      )
    ).rows.map((r) => r.kind);
    for (const kind of GO_LIVE_SETS.filter((k) => !sets.includes(k)))
      await pg.query(
        `INSERT INTO public.pharmacy_signed_sets
           (hospital_id, kind, version, content, sha256, status, authored_by, first_signer, first_signer_role,
            second_signer, second_signer_role, signed_at)
         VALUES ($1, $2, 1, $3, $4, 'signed', $5, $5, 'CSO', $6, $7, now())`,
        [
          f.h,
          kind,
          JSON.stringify(
            kind === "controlled_classes" ? { [MED]: "not_controlled" } : { items: [] },
          ),
          "a".repeat(64),
          f.a,
          f.head,
          PHARMACIST_REVIEWER_ROLE,
        ],
      );
    const product = (
      await pg.query<{ id: string }>(
        `INSERT INTO public.pharmacy_products (hospital_id, medicine_id, name, issue_unit, created_by)
         VALUES ($1, $2, 'Fixture capsule', 'capsule', $3) RETURNING id`,
        [f.h, MED, f.head],
      )
    ).rows[0]!.id;
    await pg.query(
      `INSERT INTO public.pharmacy_product_points (product_id, dispensing_point_id, hospital_id, started_at)
       VALUES ($1, $2, $3, now() - interval '1 hour')`,
      [product, pointId, f.h],
    );
    await pg.query(
      `INSERT INTO public.pharmacy_counts (hospital_id, dispensing_point_id, scope, counted_by) VALUES ($1, $2, 'full', $3)`,
      [f.h, pointId, f.head],
    );
    // Read outside the transaction: the lane has one connection.
    const legal = await pg.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM public.pharmacy_legal_answers WHERE hospital_id = $1`,
      [f.h],
    );
    await asAdmin(admin("a"), async (tx) => {
      if (legal.rows[0]!.n === 0)
        for (const question of [1, 2, 3, 4, 5, 6])
          await gl.recordLegalAnswer(
            tx,
            admin("a"),
            {
              question,
              answer: "Fixture interim answer",
              sourceRef: `LA-00${question}`,
              givenBy: "Fixture counsel",
              givenOn: "2026-10-01",
              interim: true,
            },
            new Date(),
          );
      for (const audience of ["pharmacy", "prescribers"] as const)
        await gl.recordBriefing(
          tx,
          admin("a"),
          { pointId, audience, heldOn: "2026-10-02", notes: null },
          new Date(),
        );
      await gl.updatePointSettings(tx, admin("a"), {
        pointId,
        phone: "+256 700 000000",
        labelMode: "printed",
        countFreshnessDays: null,
      });
    });
  }

  it("S80: all six met: admin A requests, A cannot approve, B approves; live_at is set and audited", async () => {
    await meetConditions(f.op!);
    const r = (await readiness(f.op!))!;
    expect(r.readiness.conditions.filter((c) => !c.met)).toEqual([]);
    expect(r.readiness.pilotNote).toBeNull(); // the first point needs no pilot note

    const requestId = await asAdmin(admin("a"), (tx) =>
      gl.requestGoLive(tx, admin("a"), f.op!, new Date()),
    );
    expect(
      await fails(asAdmin(admin("a"), (tx) => gl.requestGoLive(tx, admin("a"), f.op!, new Date()))),
    ).toMatch(/already waiting/);
    expect(
      await fails(
        asAdmin(admin("a"), (tx) => gl.approveGoLive(tx, admin("a"), requestId, new Date())),
      ),
    ).toMatch(/second hospital admin/);
    expect((await pointRow(f.op!)).live_at).toBeNull();
    await asAdmin(admin("b"), (tx) => gl.approveGoLive(tx, admin("b"), requestId, new Date()));
    expect((await pointRow(f.op!)).live_at).not.toBeNull();

    const audit = await pg.query<{ action: string; actor_id: string }>(
      `SELECT action, actor_id FROM public.audit_log WHERE table_name = 'pharmacy_golive' AND record_id = $1 ORDER BY id`,
      [requestId],
    );
    expect(audit.rows).toEqual([
      { action: "insert", actor_id: f.a },
      { action: "update", actor_id: f.b },
    ]);
    // The database holds the same line: no request approved by its requester.
    await expect(
      pg.query(
        `INSERT INTO public.pharmacy_golive (hospital_id, dispensing_point_id, action, conditions, requested_by, approved_by, approved_at)
         VALUES ($1, $2, 'switch_on', '{}'::jsonb, $3, $3, now())`,
        [f.h, f.ip, f.a],
      ),
    ).rejects.toThrow(/pg_second_person/);
  });

  it("S80 (RD-5): a second point is refused until a pilot note by someone other than the requester is on record", async () => {
    await meetConditions(f.ip!);
    const before = (await readiness(f.ip!))!;
    expect(before.readiness.conditions.every((c) => c.met)).toBe(true);
    expect(before.readiness.pilotNote).toMatchObject({ met: false });
    expect(
      await fails(asAdmin(admin("a"), (tx) => gl.requestGoLive(tx, admin("a"), f.ip!, new Date()))),
    ).toMatch(/Every condition/);
    // A note on a point that has never been live is refused: there was no pilot.
    expect(
      await fails(
        asAdmin(admin("a"), (tx) =>
          gl.recordPilotNote(
            tx,
            admin("a"),
            { pointId: f.ip!, note: "Nothing to say about a pilot that did not run." },
            new Date(),
          ),
        ),
      ),
    ).toMatch(/no pilot/);
    await asAdmin(admin("a"), (tx) =>
      gl.recordPilotNote(
        tx,
        admin("a"),
        { pointId: f.op!, note: "Two weeks at point A; queue times steady." },
        new Date(),
      ),
    );
    expect(
      await fails(asAdmin(admin("a"), (tx) => gl.requestGoLive(tx, admin("a"), f.ip!, new Date()))),
    ).toMatch(/someone other than you/);
    await asAdmin(admin("b"), (tx) =>
      gl.recordPilotNote(
        tx,
        admin("b"),
        { pointId: f.op!, note: "Agreed: counts held, one drill run, no misses." },
        new Date(),
      ),
    );
    const requestId = await asAdmin(admin("a"), (tx) =>
      gl.requestGoLive(tx, admin("a"), f.ip!, new Date()),
    );
    await asAdmin(admin("b"), (tx) => gl.approveGoLive(tx, admin("b"), requestId, new Date()));
    expect((await pointRow(f.ip!)).live_at).not.toBeNull();
  });

  it("S80 (D-PH1-05): supply without a pharmacist is refused without a second approver and without legal Q1", async () => {
    const [a2, b2] = [admin("a2", f.h2!), admin("b2", f.h2!)];
    await asAdmin(a2, (tx) => gl.setSupplyWithoutPharmacist(tx, a2, "request", new Date()));
    expect(
      await fails(
        asAdmin(a2, (tx) => gl.setSupplyWithoutPharmacist(tx, a2, "approve", new Date())),
      ),
    ).toMatch(/second hospital admin/);
    const noQ1: unknown = await asAdmin(b2, (tx) =>
      gl.setSupplyWithoutPharmacist(tx, b2, "approve", new Date()),
    ).catch((e: unknown) => e);
    expect(gl.settingsRefusal(noQ1)).toMatch(/legal question 1/);
    await expect(
      pg.query(
        `UPDATE public.pharmacy_hospital_settings SET supply_without_pharmacist = true,
           supply_without_pharmacist_approved_by = supply_without_pharmacist_requested_by WHERE hospital_id = $1`,
        [f.h2],
      ),
    ).rejects.toThrow();
    await asAdmin(a2, (tx) =>
      gl.recordLegalAnswer(
        tx,
        a2,
        {
          question: 1,
          answer: "Fixture interim answer",
          sourceRef: "LA-101",
          givenBy: "Fixture counsel",
          givenOn: "2026-10-01",
          interim: true,
        },
        new Date(),
      ),
    );
    await asAdmin(b2, (tx) => gl.setSupplyWithoutPharmacist(tx, b2, "approve", new Date()));
    const s = await pg.query<{ supply_without_pharmacist: boolean }>(
      `SELECT supply_without_pharmacist FROM public.pharmacy_hospital_settings WHERE hospital_id = $1`,
      [f.h2],
    );
    expect(s.rows[0]!.supply_without_pharmacist).toBe(true);
  });

  it("RD-4: live SMS is refused in production while what a patient reads is unsigned", async () => {
    const input = {
      individualInpatientSupply: false,
      paymentStatusRequired: false,
      expiryLookaheadDays: null,
      liveSms: true,
    };
    expect(
      await fails(
        asAdmin(admin("a"), (tx) =>
          gl.updateHospitalSettings(tx, admin("a"), input, new Date(), true),
        ),
      ),
    ).toMatch(/Live SMS stays off/);
  });

  it("HZ-PH1-48: individual inpatient supply cannot be switched on yet", async () => {
    const input = {
      individualInpatientSupply: true,
      paymentStatusRequired: false,
      expiryLookaheadDays: null,
      liveSms: false,
    };
    expect(
      await fails(
        asAdmin(admin("a"), (tx) =>
          gl.updateHospitalSettings(tx, admin("a"), input, new Date(), false),
        ),
      ),
    ).toMatch(/Individual inpatient supply stays off/);
  });

  it("HZ-PH1-57: a signed set's fingerprint is computed from its content, whatever the writer gives", async () => {
    const r = await pg.transaction(async (tx) => {
      const author = (
        await tx.query<{ id: string }>(
          `INSERT INTO auth.users (email) VALUES ('hash-author@lane.test') RETURNING id`,
        )
      ).rows[0]!.id;
      const row = (
        await tx.query<{ sha256: string; expect: string }>(
          `INSERT INTO public.pharmacy_signed_sets (hospital_id, kind, version, content, sha256, authored_by)
           VALUES ($1, 'query_codes', 99, '{"items":[{"code":"x"}]}', repeat('0', 64), $2)
           RETURNING sha256, encode(sha256(convert_to(content::text, 'UTF8')), 'hex') AS expect`,
          [f.h2, author],
        )
      ).rows[0]!;
      await tx.rollback();
      return row;
    });
    expect(r.sha256).toBe(r.expect);
    expect(r.sha256).not.toBe("0".repeat(64));
  });

  it("S82: switch off needs a reason and a second approver; the point returns to not live, its open lines still workable", async () => {
    expect(gl.SwitchOffInput.safeParse({ pointId: f.op, reason: "Too short" }).success).toBe(false);
    const raw = {
      pointId: f.op!,
      reason: "The point's only pharmacist is on leave for two weeks.",
    };
    const requestId = await asAdmin(admin("a"), (tx) =>
      gl.requestSwitchOff(tx, admin("a"), raw, new Date()),
    );
    expect(
      await fails(
        asAdmin(admin("a"), (tx) => gl.approveSwitchOff(tx, admin("a"), requestId, new Date())),
      ),
    ).toMatch(/second hospital admin/);
    await asAdmin(admin("b"), (tx) => gl.approveSwitchOff(tx, admin("b"), requestId, new Date()));
    const p = await pointRow(f.op!);
    expect(p.switched_off_at).not.toBeNull();
    expect(p.live_at).not.toBeNull();
    const at = (need: PharmacyNeed["point"]) =>
      withPharmacyWrite(
        head(),
        { permission: "pharmacy.dispense", point: need },
        async (ctx) => isLive(ctx.point!),
        {
          database: lane.db,
        },
      ).catch((e: Error) => e.message);
    expect(await at("live")).toMatch(/not live for dispensing/);
    expect(await at("live_or_was_live")).toBe(false); // RD-3: its open lines can still be confirmed and closed
    expect(await at("downtime")).toBe(false);
    // The other point stays live and handles the lines left in the queue.
    expect((await pointRow(f.ip!)).switched_off_at).toBeNull();
  });

  it("a waiting request can be withdrawn and stays on record", async () => {
    const raw = { pointId: f.ip!, reason: "Fixture: asked and then thought better of it." };
    const requestId = await asAdmin(admin("a"), (tx) =>
      gl.requestSwitchOff(tx, admin("a"), raw, new Date()),
    );
    await asAdmin(admin("b"), (tx) => gl.withdrawRequest(tx, admin("b"), requestId, new Date()));
    expect(
      await fails(
        asAdmin(admin("b"), (tx) => gl.approveSwitchOff(tx, admin("b"), requestId, new Date())),
      ),
    ).toMatch(/no longer waiting/);
    expect((await pointRow(f.ip!)).switched_off_at).toBeNull();
  });

  it("S83: with the flags off there is no downtime page and no going-live page", async () => {
    for (const k of ["PHARMACY_WORKSPACE", "PHARMACY_DISPENSING", "PHARMACY_DOWNTIME"])
      process.env[k] = "";
    const notFound = { digest: expect.stringContaining("404") };
    // The downtime pages now live in Records › Sheets, behind the pharmacy layout's own gate.
    const settings = (await import("@/app/hospital-admin/departments/pharmacy/page")).default;
    await expect(settings()).rejects.toMatchObject(notFound);
    const goLive = (await import("@/app/hospital-admin/departments/pharmacy/[pointId]/page"))
      .default;
    await expect(goLive({ params: Promise.resolve({ pointId: f.op! }) })).rejects.toMatchObject(
      notFound,
    );
  });

  it("RD-1 condition 3: a count line on one of the product's batches at the point is its opening count, any scope", async () => {
    const one = async (q: string, p: unknown[]) =>
      (await pg.query<{ id: string }>(q, p)).rows[0]!.id;
    const product = (name: string, medicine: string) =>
      one(
        `INSERT INTO public.pharmacy_products (hospital_id, medicine_id, name, issue_unit, created_by)
         VALUES ($1, $2, $3, 'tablet', $4) RETURNING id`,
        [f.h, medicine, name, f.head],
      );
    const lined = await product("Fixture tablet counted by line", "fixture_lined");
    const bare = await product("Fixture tablet never counted", "fixture_bare");
    // Both came to the point now; the harness's count was dated a day earlier than that.
    for (const id of [lined, bare])
      await pg.query(
        `INSERT INTO public.pharmacy_product_points (product_id, dispensing_point_id, hospital_id) VALUES ($1, $2, $3)`,
        [id, f.ip, f.h],
      );
    const batch = await one(
      `INSERT INTO public.pharmacy_batches (hospital_id, dispensing_point_id, product_id, batch_number, expiry, first_batch_number, first_expiry, created_by)
       VALUES ($1, $2, $3, 'FX-L1', '2027-03-31', 'FX-L1', '2027-03-31', $4) RETURNING id`,
      [f.h, f.ip, lined, f.head],
    );
    const counted = await one(
      `INSERT INTO public.pharmacy_counts (hospital_id, dispensing_point_id, scope, medicine_id, counted_by, counted_at)
       VALUES ($1, $2, 'medicine', 'fixture_lined', $3, now() - interval '1 day') RETURNING id`,
      [f.h, f.ip, f.head],
    );
    await pg.query(
      `INSERT INTO public.pharmacy_count_lines (count_id, batch_id, counted_quantity, recorded_balance) VALUES ($1, $2, 30, 30)`,
      [counted, batch],
    );
    const { facts } = await lane.db.transaction((tx) =>
      goLiveFactsFor(tx, f.h!, f.ip!, new Date()),
    );
    const has = (name: string) =>
      facts.activeProducts.find((p) => p.name === name)?.hasOpeningCount;
    expect(has("Fixture tablet counted by line")).toBe(true);
    expect(has("Fixture tablet never counted")).toBe(false);
  });
});
