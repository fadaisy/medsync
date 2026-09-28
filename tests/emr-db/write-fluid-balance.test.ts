/**
 * Fluid balance write path (ADR 0189, migration 0089): recordFluidEntry and correctFluidEntry on
 * the real tables — the open-chart rule, urine not measured, corrections and entered in error as
 * new rows, the append-only trigger — and the read back through loadMonitoring under the clinical
 * reader. Runs only with EMR_PGLITE=1.
 */
import { randomUUID } from "node:crypto";
import type { Lane } from "./_pglite";
import type { EmrActor } from "@/lib/emr/actor";
import type { WriteCtx } from "@/lib/emr/write/context";
import { beforeAll, describe, expect, it } from "vitest";

import { asClinicalReader } from "@/lib/emr/db";
import { loadMonitoring } from "@/lib/emr/read/monitoring";
import { withPatientWrite } from "@/lib/emr/write/context";
import { correctFluidEntry, recordFluidEntry } from "@/lib/emr/write/fluid-balance";
import { generateKey } from "@/lib/encryption";
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

const key = () => `k-${randomUUID()}`;

describe.skipIf(!laneOn)("fluid balance entries (PGlite lane)", () => {
  let lane: Lane;
  let h: string;
  let dept: string;
  let doctor: EmrActor;
  let nurse: EmrActor;
  let lab: EmrActor;

  const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
    (await lane.pg.query<T>(sql, params)).rows;
  const actor = (
    s: { userId: string; affiliationId: string },
    cadreCode: string,
    o: Partial<EmrActor> = {},
  ): EmrActor => ({
    userId: s.userId,
    affiliationId: s.affiliationId,
    fullName: null,
    hospitalId: h,
    departmentId: dept,
    cadreCode,
    isClinical: true,
    surface: "nurse",
    ...o,
  });

  beforeAll(async () => {
    process.env.MEDSYNC_PHI_KEY ??= generateKey();
    lane = await bootLane();
    h = await hospital(lane.pg);
    dept = await department(lane.pg, h);
    doctor = actor(
      await clinician(lane.pg, { hospitalId: h, departmentId: dept }),
      "MEDICAL_OFFICER",
      {
        surface: "doctor",
      },
    );
    nurse = actor(
      await clinician(lane.pg, { hospitalId: h, departmentId: dept, cadre: "NURSE" }),
      "NURSE",
    );
    lab = actor(
      await clinician(lane.pg, { hospitalId: h, departmentId: dept, cadre: "LAB_TECH" }),
      "LAB_TECH",
      { surface: "lab" },
    );
  }, 180_000);

  /** A patient present today, in a visit with an open fluid balance chart and one IV fluid. */
  async function visit(
    o: { chart?: boolean } = {},
  ): Promise<{ p: string; enc: string; rx: string }> {
    const p = await patient(lane.pg);
    await intake(lane.pg, { hospitalId: h, patientUserId: p });
    const enc = await encounter(lane.pg, {
      hospitalId: h,
      patientUserId: p,
      clinicianUserId: doctor.userId,
      departmentId: dept,
      startedAt: new Date(Date.now() - 6 * 3600000).toISOString(),
    });
    const [rx] = await q<{ id: string }>(
      `INSERT INTO prescriptions (hospital_id, encounter_id, patient_user_id, prescriber_user_id, drug_id, drug_name,
         dose, route, is_emergency, kind, fluid_purpose, volume_ml, over_minutes, giving_set_drops_per_ml, start)
       VALUES ($1, $2, $3, $4, 'ringers_lactate', 'Ringer''s lactate', '1000 mL', 'iv', false, 'fluid',
               'maintenance', 1000, 480, 20, 'now') RETURNING id`,
      [h, enc, p, doctor.userId],
    );
    if (o.chart !== false) await openChart(p, enc, "fluid_balance");
    return { p, enc, rx: rx!.id };
  }
  async function openChart(p: string, enc: string, kind: string): Promise<string> {
    const [c] = await q<{ id: string }>(
      `INSERT INTO monitoring_charts (hospital_id, patient_user_id, encounter_id, kind, opened_by, frequency,
         opened_at, opened_by_user_id)
       VALUES ($1, $2, $3, $4, '{"rule":"fluid.iv","label":"Ringer''s lactate 1000 mL over 8 h","items":[]}',
               'hourly', now() - interval '5 hours', $5) RETURNING id`,
      [h, p, enc, kind, doctor.userId],
    );
    return c!.id;
  }
  const as = <T>(a: EmrActor, p: string, fn: (ctx: WriteCtx) => Promise<T>) =>
    withPatientWrite(a, p, fn, { database: lane.db });
  const fails = (pr: Promise<unknown>) =>
    pr.then(
      () => "ok",
      (e: { code?: string; message?: string }) => e.code ?? String(e),
    );
  const record = (
    a: EmrActor,
    v: { p: string; enc: string },
    o: Partial<Parameters<typeof recordFluidEntry>[1]> = {},
  ) =>
    as(a, v.p, (ctx) =>
      recordFluidEntry(ctx, {
        patientUserId: v.p,
        encounterId: v.enc,
        clientKey: key(),
        kind: "urine_out",
        volumeMl: 40,
        ...o,
      }),
    );
  const row = async (id: string) =>
    (await q(`SELECT * FROM fluid_balance_entries WHERE id = $1`, [id]))[0]!;

  it("records an entry for the open chart; IV in may name this visit's prescription", async () => {
    const v = await visit();
    const clientKey = key();
    const r = await record(nurse, v, {
      kind: "iv_in",
      volumeMl: 125,
      prescriptionId: v.rx,
      clientKey,
    });
    expect(await row(r.id)).toMatchObject({
      kind: "iv_in",
      volume_ml: "125",
      measured: true,
      prescription_id: v.rx,
      state: "recorded",
      recorded_by_user_id: nurse.userId,
      replaces_id: null,
    });
    // The same key replays: one row.
    const again = await record(nurse, v, {
      kind: "iv_in",
      volumeMl: 125,
      prescriptionId: v.rx,
      clientKey,
    });
    expect(again.id).toBe(r.id);
    expect(
      await q(`SELECT 1 FROM fluid_balance_entries WHERE encounter_id = $1`, [v.enc]),
    ).toHaveLength(1);

    const other = await visit();
    expect(
      await fails(record(nurse, v, { kind: "iv_in", volumeMl: 125, prescriptionId: other.rx })),
    ).toBe("not_found");
    expect(
      await fails(record(nurse, v, { kind: "oral_in", volumeMl: 100, prescriptionId: v.rx })),
    ).toBe("invalid");
    expect(
      await fails(record(nurse, v, { kind: "oral_in", volumeMl: 100, routeDetail: "vomit" })),
    ).toBe("invalid");
    expect(
      await fails(record(nurse, v, { effectiveAt: new Date(Date.now() + 3600000).toISOString() })),
    ).toBe("invalid");
    expect(await fails(record(lab, v))).toBe("forbidden");
  });

  it("urine not measured is a row with measured false and no volume, never 0", async () => {
    const v = await visit();
    const r = await record(nurse, v, { volumeMl: null, measured: false });
    expect(await row(r.id)).toMatchObject({ kind: "urine_out", measured: false, volume_ml: null });
    expect(
      await fails(record(nurse, v, { kind: "oral_in", volumeMl: null, measured: false })),
    ).toBe("invalid");
    expect(await fails(record(nurse, v, { volumeMl: 20, measured: false }))).toBe("invalid");
    expect(await fails(record(nurse, v, { volumeMl: null }))).toBe("invalid");
    // A measured 0 mL is a measurement, and is kept as one.
    const zero = await record(nurse, v, { volumeMl: 0 });
    expect(await row(zero.id)).toMatchObject({ measured: true, volume_ml: "0" });
  });

  it("a correction is a new row naming the one it replaces; the original is kept", async () => {
    const v = await visit();
    const first = await record(nurse, v, { volumeMl: 53 });
    const fix = await as(nurse, v.p, (ctx) =>
      correctFluidEntry(ctx, {
        patientUserId: v.p,
        entryId: first.id,
        clientKey: key(),
        volumeMl: 35,
      }),
    );
    expect(fix.id).not.toBe(first.id);
    expect(await row(fix.id)).toMatchObject({
      kind: "urine_out",
      volume_ml: "35",
      state: "recorded",
      replaces_id: first.id,
    });
    expect(await row(first.id)).toMatchObject({ volume_ml: "53", state: "recorded" });
    // Replaced once only; the correction itself can be corrected.
    expect(
      await fails(
        as(nurse, v.p, (ctx) =>
          correctFluidEntry(ctx, {
            patientUserId: v.p,
            entryId: first.id,
            clientKey: key(),
            volumeMl: 30,
          }),
        ),
      ),
    ).toBe("conflict");
    const again = await as(nurse, v.p, (ctx) =>
      correctFluidEntry(ctx, {
        patientUserId: v.p,
        entryId: fix.id,
        clientKey: key(),
        volumeMl: null,
        measured: false,
      }),
    );
    expect(await row(again.id)).toMatchObject({
      measured: false,
      volume_ml: null,
      replaces_id: fix.id,
    });
  });

  it("entered in error is a new row with no volume and a reason code", async () => {
    const v = await visit();
    const twice = await record(nurse, v, { kind: "iv_in", volumeMl: 125, prescriptionId: v.rx });
    const eie = await as(nurse, v.p, (ctx) =>
      correctFluidEntry(ctx, {
        patientUserId: v.p,
        entryId: twice.id,
        clientKey: key(),
        enteredInError: true,
        reasonCode: "duplicate",
      }),
    );
    expect(await row(eie.id)).toMatchObject({
      state: "entered_in_error",
      volume_ml: null,
      reason_code: "duplicate",
      replaces_id: twice.id,
      kind: "iv_in",
      prescription_id: null,
    });
    // A withdrawn entry cannot be corrected.
    expect(
      await fails(
        as(nurse, v.p, (ctx) =>
          correctFluidEntry(ctx, {
            patientUserId: v.p,
            entryId: eie.id,
            clientKey: key(),
            volumeMl: 1,
          }),
        ),
      ),
    ).toBe("not_found");
  });

  it("the append-only trigger refuses UPDATE and DELETE, even for the owner", async () => {
    const v = await visit();
    const r = await record(nurse, v);
    await expect(
      q(`UPDATE fluid_balance_entries SET volume_ml = 0 WHERE id = $1`, [r.id]),
    ).rejects.toThrow(/append-only/);
    await expect(q(`DELETE FROM fluid_balance_entries WHERE id = $1`, [r.id])).rejects.toThrow(
      /append-only/,
    );
    expect(await row(r.id)).toMatchObject({ volume_ml: "40" });
  });

  it("is refused with no open fluid balance chart, and once the chart is closed", async () => {
    const v = await visit({ chart: false });
    expect(await fails(record(nurse, v))).toBe("conflict");
    await openChart(v.p, v.enc, "observations");
    expect(await fails(record(nurse, v))).toBe("conflict");
    const chartId = await openChart(v.p, v.enc, "fluid_balance");
    const r = await record(nurse, v);
    await q(
      `UPDATE monitoring_charts SET closed_at = now(), closed_by_user_id = $2 WHERE id = $1`,
      [chartId, doctor.userId],
    );
    expect(await fails(record(nurse, v))).toBe("conflict");
    expect(
      await fails(
        as(nurse, v.p, (ctx) =>
          correctFluidEntry(ctx, {
            patientUserId: v.p,
            entryId: r.id,
            clientKey: key(),
            volumeMl: 1,
          }),
        ),
      ),
    ).toBe("conflict");
  });

  it("reads back through loadMonitoring under the clinical reader, MAR included", async () => {
    const v = await visit();
    await openChart(v.p, v.enc, "mar");
    const misread = await record(nurse, v, { volumeMl: 53 });
    await as(nurse, v.p, (ctx) =>
      correctFluidEntry(ctx, {
        patientUserId: v.p,
        entryId: misread.id,
        clientKey: key(),
        volumeMl: 35,
      }),
    );
    await record(nurse, v, { kind: "iv_in", volumeMl: 125, prescriptionId: v.rx });
    await record(nurse, v, { volumeMl: null, measured: false });
    await q(
      `INSERT INTO medication_administration_records (hospital_id, patient_user_id, encounter_id,
         administered_by_user_id, drug_name, dose, route, state, emr_prescription_id, administered_at)
       VALUES ($1, $2, $3, $4, 'Ringer''s lactate', '1000 mL', 'iv', 'administered', $5, now() - interval '1 hour')`,
      [h, v.p, v.enc, nurse.userId, v.rx],
    );
    const now = new Date();
    const payload = await asClinicalReader(
      { userId: nurse.userId, hospitalId: h },
      (tx) => loadMonitoring(tx, { hospitalId: h, patientUserId: v.p, encounterId: v.enc, now }),
      lane.db,
    );
    expect(payload!.charts.map((c) => c.kind)).toEqual(["fluid_balance", "mar"]);
    const fluid = payload!.charts[0]!;
    if (fluid.kind !== "fluid_balance") throw new Error("fluid_balance");
    expect(fluid.openedByLabel).toBe("Ringer's lactate 1000 mL over 8 h");
    expect(fluid.body.ivLines[0]).toMatchObject({ key: v.rx, mlPerHour: 125, dropsPerMinute: 42 });
    expect(fluid.body.entries.map((e) => [e.kind, e.volumeMl, e.measured]).sort()).toEqual(
      [
        ["iv_in", 125, true],
        ["urine_out", 35, true],
        ["urine_out", null, false],
      ].sort(),
    );
    const mar = payload!.charts[1]!;
    if (mar.kind !== "mar") throw new Error("mar");
    expect(mar.body.rows[0]!.cells.map((c) => c.word)).toEqual(["Running"]);

    // Another hospital's reader sees nothing of it.
    const elsewhere = await hospital(lane.pg, "Elsewhere");
    const none = await asClinicalReader(
      { userId: nurse.userId, hospitalId: elsewhere },
      (tx) =>
        loadMonitoring(tx, { hospitalId: elsewhere, patientUserId: v.p, encounterId: v.enc, now }),
      lane.db,
    );
    expect(none).toBeNull();
  });
});
