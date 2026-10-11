/**
 * Lab Phase 1, Step 6: automatic flagging from signed critical limits on the PGlite lane (S30–S35,
 * CF-1). Every limit and time here is a FIXTURE, invented for the test. Runs with EMR_PGLITE=1.
 */
import { randomUUID } from "node:crypto";
import type { Lane, Pg } from "./_pglite";
import type { EmrActor } from "@/lib/emr/actor";
import type { WriteCtx } from "@/lib/emr/write/context";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { withPatientWrite } from "@/lib/emr/write/context";
import { placeOrders } from "@/lib/emr/write/orders";
import { enterResults } from "@/lib/emr/write/results";
import { collectSpecimen, receiveSpecimen } from "@/lib/emr/write/specimens";
import { encrypt, generateKey } from "@/lib/encryption";
import { releaseWithCriticalMark } from "@/lib/lab/criticals/store";
import {
  flaggingActiveFor,
  refuseUncheckedCritical,
  saveLimitsDraft,
  signLimitsVersion,
} from "@/lib/lab/limits";
import { saveMeasure } from "@/lib/lab/measures-setup";
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
const ADULT = 6575;
/** FIXTURE limits, invented: adults at or below 2.0 or at or above 25.0; nothing for children. */
const LIMITS = [
  {
    testId: GLUCOSE_FASTING,
    conceptId: "obs.glucose",
    ageFromDays: ADULT,
    ageToDays: null,
    low: "2.0",
    high: "25.0",
    referenceId: "FX-GLU-1",
    source: "fixture",
  },
];

describe.skipIf(!laneOn)("Lab Phase 1 automatic flagging (S30–S35)", () => {
  let lane: Lane;
  let pg: Pg;
  let h: string;
  let ward: string;
  const a: Record<string, EmrActor> = {};
  const env = { ...process.env };
  const tx = <T>(fn: (t: Parameters<Parameters<Lane["db"]["transaction"]>[0]>[0]) => Promise<T>) =>
    lane.db.transaction(fn);
  const as = <T>(actor: EmrActor, p: string, fn: (ctx: WriteCtx) => Promise<T>) =>
    withPatientWrite(actor, p, fn, { database: lane.db });

  async function received(dob: string) {
    const p = await patient(pg);
    await pg.query(
      `INSERT INTO public.patient_profiles (id, first_name_encrypted, surname_encrypted, sex, date_of_birth, id_type, phone_encrypted, district_id)
       VALUES ($1, $2, $3, 'female', $4, 'none', $5, (SELECT id FROM public.districts LIMIT 1))`,
      [p, encrypt("Fixture"), encrypt("Patient"), dob, encrypt("0700000000")],
    );
    await intake(pg, { hospitalId: h, patientUserId: p });
    const enc = await encounter(pg, {
      hospitalId: h,
      patientUserId: p,
      clinicianUserId: a.doctor!.userId,
      departmentId: ward,
    });
    const order = await as(a.doctor!, p, (ctx) =>
      placeOrders(ctx, {
        patientUserId: p,
        encounterId: enc,
        orders: [
          { clientKey: key(), testId: GLUCOSE_FASTING, priority: "routine", reasonText: "Check" },
        ],
      }),
    );
    const sp = await as(a.nurse!, p, (ctx) =>
      collectSpecimen(ctx, {
        patientUserId: p,
        orderId: order.id,
        identifiersConfirmed: true,
        fastingState: "fasting",
        fastingHours: 9,
        clientKey: key(),
      }),
    );
    await as(a.lab!, p, (ctx) =>
      receiveSpecimen(ctx, { patientUserId: p, specimenId: sp.id, clientKey: key() }),
    );
    return { p, orderId: order.id };
  }
  /** A plain final release, then the action's guard in the same transaction (S31). */
  const plainRelease = (r: { p: string; orderId: string }, value: string) =>
    as(a.lab!, r.p, async (ctx) => {
      const out = await enterResults(ctx, {
        patientUserId: r.p,
        orderId: r.orderId,
        status: "final",
        values: [{ conceptId: "obs.glucose", value }],
        clientKey: key(),
      });
      await refuseUncheckedCritical(ctx.tx, {
        hospitalId: h,
        reportId: out.id,
        patientUserId: r.p,
        orderId: r.orderId,
        now: ctx.now,
      });
      return out;
    });
  const signLimits = async (limits = LIMITS) => {
    const v = await tx((t) =>
      saveLimitsDraft(t, { userId: a.lead!.userId, hospitalId: h }, { limits }, new Date()),
    );
    await tx((t) =>
      signLimitsVersion(
        t,
        { userId: a.lead2!.userId, hospitalId: h, as: "lead" },
        { versionId: v, exceptionNote: null },
        new Date(),
      ),
    );
    await tx((t) =>
      signLimitsVersion(
        t,
        { userId: a.cso!.userId, hospitalId: h, as: "cso" },
        { versionId: v, exceptionNote: null },
        new Date(),
      ),
    );
    return v;
  };

  beforeAll(async () => {
    process.env.MEDSYNC_PHI_KEY ??= generateKey();
    Object.assign(process.env, { LAB_WORKSPACE: "1", LAB_UNITS_RANGES: "1", LAB_CRITICALS: "1" });
    lane = await bootLane();
    pg = lane.pg;
    h = await hospital(pg, "Limits");
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
        ? {
            labPermissions: ["lab.receive", "lab.result.enter", "lab.result.release", "lab.manage"],
          }
        : {}),
    });
    a.doctor = await make(ward, "MEDICAL_OFFICER", "doctor");
    a.nurse = await make(ward, "NURSE", "nurse");
    a.lab = await make(lab, "LAB_TECHNOLOGIST", "lab");
    a.lead = await make(lab, "LAB_TECHNOLOGIST", "lab");
    a.lead2 = await make(lab, "LAB_TECHNOLOGIST", "lab");
    a.cso = await make(ward, "CONSULTANT", "doctor");
    await tx((t) =>
      saveMeasure(
        t,
        { userId: a.lead!.userId, hospitalId: h },
        {
          testId: GLUCOSE_FASTING,
          conceptId: "obs.glucose",
          draft: {
            resultType: "number",
            unitUcum: "mmol/L",
            unitDisplay: "mmol/L",
            decimalPlaces: 1,
            loincCode: null,
            entryCheckLow: null,
            entryCheckHigh: null,
          },
        },
        new Date(),
      ),
    );
  }, 300_000);
  afterAll(() => {
    for (const k of ["LAB_WORKSPACE", "LAB_UNITS_RANGES", "LAB_CRITICALS"]) process.env[k] = env[k];
  });

  it("CF-1/CF-2: flagging is off until limits and response times are both signed", async () => {
    expect(await flaggingActiveFor(h, lane.db)).toBe(false);
    await signLimits();
    expect(await flaggingActiveFor(h, lane.db)).toBe(false); // limits alone
    await pg.query(
      `INSERT INTO critical_response_versions (hospital_id, version, status, ack_within_min, source, authored_by, lead_signed_by, lead_signed_at, cso_signed_by, cso_signed_at)
       VALUES ($1, 1, 'signed', 30, 'fixture: invented', $2, $2, now(), $3, now())`,
      [h, a.lead!.userId, a.cso!.userId],
    );
    expect(await flaggingActiveFor(h, lane.db)).toBe(true);
  });

  it("S30/S31: a value at the limit is refused without a check; with one it releases and alerts with an auto mark", async () => {
    const r = await received("1968-01-01");
    await expect(plainRelease(r, "2.0")).rejects.toThrow(/needs a check before release/);
    // Nothing was released: the refusal rolled the release back.
    expect(
      Number(
        (
          await pg.query<{ n: number }>(
            `SELECT count(*) n FROM diagnostic_reports WHERE order_id = $1`,
            [r.orderId],
          )
        ).rows[0]!.n,
      ),
    ).toBe(0);
    await expect(
      as(a.lab!, r.p, (ctx) =>
        releaseWithCriticalMark(ctx, {
          patientUserId: r.p,
          orderId: r.orderId,
          values: [{ conceptId: "obs.glucose", value: "2.0" }],
          marks: [],
          note: null,
          clientKey: key(),
        }),
      ),
    ).rejects.toThrow(/needs a check before release/);
    const ok = await as(a.lab!, r.p, (ctx) =>
      releaseWithCriticalMark(ctx, {
        patientUserId: r.p,
        orderId: r.orderId,
        values: [{ conceptId: "obs.glucose", value: "2.0" }],
        marks: [
          {
            conceptId: "obs.glucose",
            check: { kind: "repeated", repeatValue: "1.9" },
            sampleChecked: true,
          },
        ],
        note: null,
        clientKey: key(),
      }),
    );
    expect(ok.alert.alertId).toBeTruthy();
    const [m] = (
      await pg.query<{ source: string; direction: string; limit_version: number }>(
        `SELECT source, direction, limit_version FROM critical_marks WHERE alert_id = $1`,
        [ok.alert.alertId],
      )
    ).rows;
    expect(m).toEqual({ source: "auto", direction: "low", limit_version: 1 });
  });

  it("S30: a value within the limits releases without a mark", async () => {
    const r = await received("1968-01-01");
    await expect(plainRelease(r, "5.0")).resolves.toMatchObject({ id: expect.any(String) });
  });

  it("S32: a limit in the wrong unit cannot be saved, and an old one never fires after the unit changes", async () => {
    await tx((t) =>
      saveMeasure(
        t,
        { userId: a.lead!.userId, hospitalId: h },
        {
          testId: GLUCOSE_FASTING,
          conceptId: "obs.glucose",
          draft: {
            resultType: "number",
            unitUcum: "mg/dL",
            unitDisplay: "mg/dL",
            decimalPlaces: 0,
            loincCode: null,
            entryCheckLow: null,
            entryCheckHigh: null,
          },
        },
        new Date(),
      ),
    );
    // The signed mmol/L limit no longer matches: a mg/dL value is never judged by it (FL-5).
    const r = await received("1968-01-01");
    await expect(plainRelease(r, "20")).resolves.toMatchObject({ id: expect.any(String) });
    // Put mmol/L back for the rest.
    await tx((t) =>
      saveMeasure(
        t,
        { userId: a.lead!.userId, hospitalId: h },
        {
          testId: GLUCOSE_FASTING,
          conceptId: "obs.glucose",
          draft: {
            resultType: "number",
            unitUcum: "mmol/L",
            unitDisplay: "mmol/L",
            decimalPlaces: 1,
            loincCode: null,
            entryCheckLow: null,
            entryCheckHigh: null,
          },
        },
        new Date(),
      ),
    );
  });

  it("S33: no limit covers a child; the value is not flagged and a hand mark still works", async () => {
    const r = await received(`${new Date().getFullYear() - 9}-01-01`);
    await expect(plainRelease(r, "1.0")).resolves.toMatchObject({ id: expect.any(String) });
    const r2 = await received(`${new Date().getFullYear() - 9}-01-01`);
    const ok = await as(a.lab!, r2.p, (ctx) =>
      releaseWithCriticalMark(ctx, {
        patientUserId: r2.p,
        orderId: r2.orderId,
        values: [{ conceptId: "obs.glucose", value: "1.0" }],
        marks: [
          {
            conceptId: "obs.glucose",
            check: { kind: "checked_not_repeated" },
            sampleChecked: true,
          },
        ],
        note: null,
        clientKey: key(),
      }),
    );
    const [m] = (
      await pg.query<{ source: string }>(`SELECT source FROM critical_marks WHERE alert_id = $1`, [
        ok.alert.alertId,
      ])
    ).rows;
    expect(m!.source).toBe("manual");
  });

  it("S34: editing signed limits opens an unsigned draft; the signed set stays in force", async () => {
    const draft = await tx((t) =>
      saveLimitsDraft(
        t,
        { userId: a.lead!.userId, hospitalId: h },
        { limits: [{ ...LIMITS[0]!, low: "3.0" }] },
        new Date(),
      ),
    );
    const [d] = (
      await pg.query<Record<string, unknown>>(
        `SELECT status, lead_signed_by, cso_signed_by FROM critical_limit_versions WHERE id = $1`,
        [draft],
      )
    ).rows;
    expect(d).toEqual({ status: "draft", lead_signed_by: null, cso_signed_by: null });
    // 2.5 is above the signed 2.0 and below the draft 3.0: still in range, the draft is not used.
    await expect(plainRelease(await received("1968-01-01"), "2.5")).resolves.toMatchObject({
      id: expect.any(String),
    });
  });

  it("S35: a mistyped value corrected below the limit before release raises no mark", async () => {
    const r = await received("1968-01-01");
    await as(a.lab!, r.p, (ctx) =>
      enterResults(ctx, {
        patientUserId: r.p,
        orderId: r.orderId,
        status: "preliminary",
        values: [{ conceptId: "obs.glucose", value: "26.0" }],
        clientKey: key(),
      }),
    );
    const ok = await plainRelease(r, "6.2");
    expect(
      Number(
        (
          await pg.query<{ n: number }>(
            `SELECT count(*) n FROM critical_alerts WHERE report_id = $1`,
            [ok.id],
          )
        ).rows[0]!.n,
      ),
    ).toBe(0);
  });
});
