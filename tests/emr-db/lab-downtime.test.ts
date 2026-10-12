/**
 * Lab Phase 1, Step 7: downtime on the PGlite lane (S37–S44 at the data layer). Paper forms keep the
 * form's times (Law 9); numbers are reserved before printing and entered once; criticals on paper are
 * alerted or recorded as phoned; a drill touches no patient record. Times and limits are FIXTURES.
 * Runs with EMR_PGLITE=1.
 */
import { randomUUID } from "node:crypto";
import type { Lane, Pg } from "./_pglite";
import type { EmrActor } from "@/lib/emr/actor";
import type { WriteCtx } from "@/lib/emr/write/context";
import type { DowntimeFormInput } from "@/lib/lab/downtime-store";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { withPatientWrite } from "@/lib/emr/write/context";
import { placeOrders } from "@/lib/emr/write/orders";
import { encrypt, generateKey } from "@/lib/encryption";
import {
  enterDowntimeForm,
  recordDrill,
  recordPeriod,
  reserveFormNumbers,
} from "@/lib/lab/downtime-store";
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

const GLUCOSE_FASTING = "79a7098d-6585-5bff-ab14-3a4a09b3bf68";
const key = () => `k-${randomUUID()}`;
const ago = (min: number) => new Date(Date.now() - min * 60_000);

describe.skipIf(!laneOn)("Lab Phase 1 downtime (S37–S44)", () => {
  let lane: Lane;
  let pg: Pg;
  let h: string;
  let ward: string;
  const a: Record<string, EmrActor> = {};
  const env = { ...process.env };
  const tx = <T>(fn: (t: Parameters<Parameters<Lane["db"]["transaction"]>[0]>[0]) => Promise<T>) =>
    lane.db.transaction(fn);
  const asLab = <T>(p: string, fn: (ctx: WriteCtx) => Promise<T>) =>
    withPatientWrite(a.lab!, p, fn, { database: lane.db });
  const n = async (q: string, params?: unknown[]) =>
    Number((await pg.query<{ n: number }>(q, params)).rows[0]!.n);

  /** A patient on an open visit today, with or without a MedSync order for glucose. */
  async function visit(withOrder: boolean) {
    const p = await patient(pg);
    await pg.query(
      `INSERT INTO public.patient_profiles (id, first_name_encrypted, surname_encrypted, sex, date_of_birth, id_type, phone_encrypted, district_id)
       VALUES ($1, $2, $3, 'female', '1968-01-01', 'none', $4, (SELECT id FROM public.districts LIMIT 1))`,
      [p, encrypt("Fixture"), encrypt("Patient"), encrypt("0700000000")],
    );
    await intake(pg, { hospitalId: h, patientUserId: p });
    const enc = await encounter(pg, {
      hospitalId: h,
      patientUserId: p,
      clinicianUserId: a.doctor!.userId,
      departmentId: ward,
    });
    const orderId = withOrder
      ? (
          await withPatientWrite(
            a.doctor!,
            p,
            (ctx) =>
              placeOrders(ctx, {
                patientUserId: p,
                encounterId: enc,
                orders: [
                  {
                    clientKey: key(),
                    testId: GLUCOSE_FASTING,
                    priority: "routine",
                    reasonText: "Check",
                  },
                ],
              }),
            { database: lane.db },
          )
        ).id
      : null;
    return { p, enc, orderId };
  }
  const form = (
    v: Awaited<ReturnType<typeof visit>>,
    over: Partial<DowntimeFormInput> = {},
  ): DowntimeFormInput => ({
    patientUserId: v.p,
    formNumber: 0,
    collectedAt: ago(100),
    resultedAt: ago(70),
    releasedOnPaperBy: "Fixture technologist",
    outsidePeriodReason: null,
    orderId: v.orderId,
    newOrder: v.orderId
      ? null
      : {
          encounterId: v.enc,
          testId: GLUCOSE_FASTING,
          requestedByUserId: a.doctor!.userId,
          priority: "urgent",
        },
    values: [{ conceptId: "obs.glucose", value: "5.4", unit: "mmol/L" }],
    marks: [],
    call: null,
    clientKey: key(),
    ...over,
  });
  let numbers: number[] = [];
  const nextNumber = () => numbers.shift()!;

  beforeAll(async () => {
    process.env.MEDSYNC_PHI_KEY ??= generateKey();
    Object.assign(process.env, { LAB_WORKSPACE: "1", LAB_CRITICALS: "1", LAB_UNITS_RANGES: "" });
    lane = await bootLane();
    pg = lane.pg;
    h = await hospital(pg, "Downtime");
    ward = await department(pg, h, "Ward");
    const lab = await department(pg, h, "Laboratory");
    const make = async (
      d: string,
      cadreCode: string,
      surface: EmrActor["surface"],
    ): Promise<EmrActor> => ({
      ...(await clinician(pg, { hospitalId: h, departmentId: d, cadre: cadreCode })),
      fullName: null,
      hospitalId: h,
      departmentId: d,
      cadreCode,
      isClinical: true,
      surface,
      ...(surface === "lab"
        ? { labPermissions: ["lab.receive", "lab.result.enter", "lab.result.release"] }
        : {}),
    });
    a.doctor = await make(ward, "MEDICAL_OFFICER", "doctor");
    a.nurse = await make(ward, "NURSE", "nurse");
    a.lab = await make(lab, "LAB_TECHNOLOGIST", "lab");
    await tx((t) =>
      recordPeriod(
        t,
        a.lab!,
        { startsAt: ago(180), endsAt: ago(60), reason: "network", note: null },
        new Date(),
      ),
    );
  }, 300_000);
  afterAll(() => {
    for (const k of ["LAB_WORKSPACE", "LAB_CRITICALS", "LAB_UNITS_RANGES"]) process.env[k] = env[k];
  });

  it("S37: printing reserves a run of numbers, never the same twice", async () => {
    const first = await tx((t) => reserveFormNumbers(t, a.lab!, 10, new Date()));
    expect(first).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const [x, y] = await Promise.all([
      tx((t) => reserveFormNumbers(t, a.lab!, 3, new Date())),
      tx((t) => reserveFormNumbers(t, a.lab!, 3, new Date())),
    ]);
    expect(new Set([...x, ...y]).size).toBe(6);
    numbers = [...first, ...x, ...y];
  });

  it("S38: a form keeps its times, the entry time and its number; the result is final", async () => {
    const v = await visit(true);
    const num = nextNumber();
    const out = await asLab(v.p, (ctx) => enterDowntimeForm(ctx, form(v, { formNumber: num })));
    const [e] = (
      await pg.query<Record<string, unknown>>(
        `SELECT * FROM downtime_entries WHERE report_id = $1`,
        [out.reportId],
      )
    ).rows;
    expect(e).toMatchObject({ form_number: num, released_on_paper_by: "Fixture technologist" });
    expect(new Date(e!.resulted_at as string).getTime()).toBeLessThan(
      new Date(e!.entered_at as string).getTime(),
    );
    const [r] = (
      await pg.query<{ status: string; effective_at: string }>(
        `SELECT status, effective_at FROM diagnostic_reports WHERE id = $1`,
        [out.reportId],
      )
    ).rows;
    expect(r!.status).toBe("final");
    // The value is as at collection: the report's effective time is the form's collection time.
    expect(Math.abs(new Date(r!.effective_at).getTime() - ago(100).getTime())).toBeLessThan(5_000);
    expect(
      (
        await pg.query(
          `SELECT state, report_id FROM downtime_form_numbers WHERE hospital_id = $1 AND number = $2`,
          [h, num],
        )
      ).rows[0],
    ).toEqual({
      state: "entered",
      report_id: out.reportId,
    });
  });

  it("S38: with no MedSync order, the paper request is transcribed as the named clinician's", async () => {
    const v = await visit(false);
    const out = await asLab(v.p, (ctx) =>
      enterDowntimeForm(ctx, form(v, { formNumber: nextNumber() })),
    );
    const [o] = (
      await pg.query<Record<string, unknown>>(
        `SELECT authored_by_user_id, intent_source, requester_cadre FROM encounter_orders WHERE id = $1`,
        [out.orderId],
      )
    ).rows;
    expect(o).toEqual({
      authored_by_user_id: a.doctor!.userId,
      intent_source: "downtime_form",
      requester_cadre: "MEDICAL_OFFICER",
    });
  });

  it("S39: a form number is entered once", async () => {
    const v = await visit(true);
    const num = nextNumber();
    await asLab(v.p, (ctx) => enterDowntimeForm(ctx, form(v, { formNumber: num })));
    const w = await visit(true);
    await expect(
      asLab(w.p, (ctx) => enterDowntimeForm(ctx, form(w, { formNumber: num }))),
    ).rejects.toThrow(/already entered/);
    await expect(
      asLab(w.p, (ctx) => enterDowntimeForm(ctx, form(w, { formNumber: 9999 }))),
    ).rejects.toThrow(/never printed/);
  });

  it("S40: a future time is refused; a time outside the recorded downtime needs a reason", async () => {
    const v = await visit(true);
    await expect(
      asLab(v.p, (ctx) =>
        enterDowntimeForm(
          ctx,
          form(v, { formNumber: nextNumber(), resultedAt: new Date(Date.now() + 60_000) }),
        ),
      ),
    ).rejects.toThrow(/future/);
    await expect(
      asLab(v.p, (ctx) =>
        enterDowntimeForm(
          ctx,
          form(v, { formNumber: nextNumber(), collectedAt: ago(30), resultedAt: ago(20) }),
        ),
      ),
    ).rejects.toThrow(/outside any recorded downtime/);
    const ok = await asLab(v.p, (ctx) =>
      enterDowntimeForm(
        ctx,
        form(v, {
          formNumber: nextNumber(),
          collectedAt: ago(30),
          resultedAt: ago(20),
          outsidePeriodReason: "Analyser down, not the network",
        }),
      ),
    );
    expect(ok.reportId).toBeTruthy();
  });

  it("S41: a critical on the form phoned with read-back is created acknowledged by phone; without a call it opens live", async () => {
    const v = await visit(true);
    const marked = {
      marks: [
        {
          conceptId: "obs.glucose",
          check: { kind: "repeated" as const, repeatValue: "1.9" },
          sampleChecked: true,
        },
      ],
      values: [{ conceptId: "obs.glucose", value: "1.8", unit: "mmol/L" }],
    };
    const phoned = await asLab(v.p, (ctx) =>
      enterDowntimeForm(
        ctx,
        form(v, {
          formNumber: nextNumber(),
          ...marked,
          call: { toUserId: a.doctor!.userId, at: ago(65), readBack: true },
        }),
      ),
    );
    const [ack] = (
      await pg.query<Record<string, unknown>>(
        `SELECT state, acknowledged_via, acknowledged_by, acknowledged_at FROM critical_alerts WHERE id = $1`,
        [phoned.alertId],
      )
    ).rows;
    expect(ack).toMatchObject({
      state: "acknowledged",
      acknowledged_via: "phone",
      acknowledged_by: a.doctor!.userId,
    });
    expect(
      Math.abs(new Date(ack!.acknowledged_at as string).getTime() - ago(65).getTime()),
    ).toBeLessThan(5_000);
    const w = await visit(true);
    const live = await asLab(w.p, (ctx) =>
      enterDowntimeForm(ctx, form(w, { formNumber: nextNumber(), ...marked })),
    );
    expect(
      (await pg.query(`SELECT state FROM critical_alerts WHERE id = $1`, [live.alertId])).rows[0],
    ).toEqual({ state: "open" });
  });

  it("S42: the limits in force at the form's collection are the ones applied", async () => {
    process.env.LAB_UNITS_RANGES = "1";
    try {
      await pg.query(
        `INSERT INTO lab_component_measures (hospital_id, test_id, concept_id, version, result_type, unit_ucum, unit_display, decimal_places, authored_by)
         VALUES ($1, $2, 'obs.glucose', 1, 'number', 'mmol/L', 'mmol/L', 1, $3)`,
        [h, GLUCOSE_FASTING, a.lab!.userId],
      );
      // FIXTURE limits: v1 (critical at or below 2.0) in force at collection; v2 (at or below 1.0) from 80 minutes ago.
      for (const [version, low, from, until] of [
        [1, "2.0", ago(1000), ago(80)],
        [2, "1.0", ago(80), null],
      ] as const) {
        // Built as a draft (signed sets are frozen), then signed and put in force at the fixture time.
        const [{ id }] = (
          await pg.query<{ id: string }>(
            `INSERT INTO critical_limit_versions (hospital_id, version, authored_by) VALUES ($1, $2, $3) RETURNING id`,
            [h, version, a.lab!.userId],
          )
        ).rows as [{ id: string }];
        await pg.query(
          `INSERT INTO critical_limits (version_id, test_id, concept_id, unit_ucum, low, reference_id, source) VALUES ($1, $2, 'obs.glucose', 'mmol/L', $3, 'FX', 'fixture')`,
          [id, GLUCOSE_FASTING, low],
        );
        await pg.query(
          `UPDATE critical_limit_versions SET status = 'signed', lead_signed_by = $2, lead_signed_at = now(), cso_signed_by = $3,
             cso_signed_at = now(), in_force_from = $4 WHERE id = $1`,
          [id, a.lab!.userId, a.doctor!.userId, from],
        );
        if (until)
          await pg.query(
            `UPDATE critical_limit_versions SET status = 'superseded', superseded_at = $2 WHERE id = $1`,
            [id, until],
          );
      }
      const v = await visit(true);
      // Collected 100 minutes ago (v1 in force): 1.8 is critical by v1, not by v2. Unchecked, it is refused.
      await expect(
        asLab(v.p, (ctx) =>
          enterDowntimeForm(
            ctx,
            form(v, {
              formNumber: nextNumber(),
              values: [{ conceptId: "obs.glucose", value: "1.8" }],
            }),
          ),
        ),
      ).rejects.toThrow(/check before release/);
      const out = await asLab(v.p, (ctx) =>
        enterDowntimeForm(
          ctx,
          form(v, {
            formNumber: nextNumber(),
            values: [{ conceptId: "obs.glucose", value: "1.8" }],
            marks: [
              {
                conceptId: "obs.glucose",
                check: { kind: "checked_not_repeated" },
                sampleChecked: true,
              },
            ],
          }),
        ),
      );
      expect(
        (
          await pg.query(`SELECT source, limit_version FROM critical_marks WHERE alert_id = $1`, [
            out.alertId,
          ])
        ).rows[0],
      ).toEqual({ source: "auto", limit_version: 1 });
    } finally {
      process.env.LAB_UNITS_RANGES = "";
    }
  });

  it("S43: a patient with no visit here cannot be entered from this screen", async () => {
    const stranger = await patient(pg);
    const f = {
      ...form({ p: stranger, enc: randomUUID(), orderId: null }, { formNumber: nextNumber() }),
    };
    await expect(asLab(stranger, (ctx) => enterDowntimeForm(ctx, f))).rejects.toThrow(
      /legitimate clinical access|not found/,
    );
  });

  it("S44: a drill writes a drill record and nothing else", async () => {
    const tables = [
      "diagnostic_reports",
      "clinical_observations",
      "encounter_orders",
      "critical_alerts",
      "downtime_entries",
    ];
    const before = await Promise.all(tables.map((t) => n(`SELECT count(*) n FROM ${t}`)));
    await tx((t) =>
      recordDrill(
        t,
        a.lab!,
        {
          heldOn: "2026-10-10",
          participants: "Fixture lab team",
          whatWasDone: "Printed and entered two forms",
          problems: null,
        },
        new Date(),
      ),
    );
    expect(await Promise.all(tables.map((t) => n(`SELECT count(*) n FROM ${t}`)))).toEqual(before);
    expect(await n(`SELECT count(*) n FROM downtime_drills WHERE hospital_id = $1`, [h])).toBe(1);
  });
});
