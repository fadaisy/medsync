/**
 * Pharmacy Phase 1, Step 8: entering downtime sheets after the system is back, paper prescriptions and
 * the Daily Dispensing Log, on the PGlite lane with every migration replayed (S68 to S76, S78, S81;
 * DT-2 to DT-10, DL-1 to DL-3, Law 10, Law 13). Writes go through `runPharmacyWrite` as the actions
 * do. S72's "a technician cannot record a downtime" is pharmacy-golive.test.ts (8a). Every medicine,
 * batch, quantity, name and time here is a fixture (Law 8). Runs with EMR_PGLITE=1.
 */
import { randomUUID } from "node:crypto";
import type { Lane, Pg } from "./_pglite";
import type { PharmacyActor, PharmacyCtx, PharmacyNeed } from "@/lib/pharmacy/write";
import type { z } from "zod";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { encrypt, generateKey } from "@/lib/encryption";
import { PHARMACY_MAP_V2, pharmacyDispensingAccess } from "@/lib/pharmacy/access";
import { DOWNTIME_COPY, DOWNTIME_DRAFT_COPY, pharmacySheetLabel } from "@/lib/pharmacy/downtime";
import { LOG_COPY } from "@/lib/pharmacy/print/dispensing-log";
import { localDate, stockState } from "@/lib/pharmacy/stock/ledger";
import { isLive, runPharmacyWrite } from "@/lib/pharmacy/write";
import { DEFAULT_TIME_ZONE, startOfLocalDay } from "@/supabase/functions/_shared/slots";
import { bootLane, department, encounter, hospital, laneOn, patient, staff } from "./_pglite";

vi.mock("server-only", () => ({}));
const held = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("@/db", () => ({
  get db() {
    return held.db;
  },
}));

const dt = await import("@/lib/pharmacy/downtime-store");
const entry = await import("@/lib/pharmacy/downtime-entry");
const logRead = await import("@/lib/pharmacy/print/log-read");
const review = await import("@/lib/pharmacy/review/store");
const reviewRead = await import("@/lib/pharmacy/review/read");
const supply = await import("@/lib/pharmacy/supply/store");
const supplyRead = await import("@/lib/pharmacy/supply/read");
const stockRead = await import("@/lib/pharmacy/stock/read");
const controlledRead = await import("@/lib/pharmacy/controlled-read");
const controlledStore = await import("@/lib/pharmacy/controlled-store");

const HOUR = 3_600_000;

describe.skipIf(!laneOn)("pharmacy downtime entry and the dispensing log (Step 8, S68–S81)", () => {
  let lane: Lane;
  let pg: Pg;
  const f = {} as Record<string, string>;
  const sheets: number[] = [];
  /** The time written on the sheet: inside the recorded downtime (now − 3 h to now − 1 h). */
  const sheetTime = new Date(Date.now() - 2 * HOUR);

  const one = async <T = { id: string }>(q: string, p?: unknown[]) =>
    (await pg.query<T>(q, p)).rows[0] as T;
  const n = async (q: string, p?: unknown[]) => (await one<{ n: number }>(q, p)).n;

  const actor = (userId: string, cadre: string, pointId = f.pointA!): PharmacyActor => ({
    userId,
    hospitalId: f.h!,
    cadreCode: cadre,
    cadreName: cadre === "PHARMACIST" ? "Pharmacist" : "Pharmacy technician",
    pointId,
    access: pharmacyDispensingAccess(cadre, PHARMACY_MAP_V2),
  });
  const pharmacist = () => actor(f.pharmacist!, "PHARMACIST");
  const tech = () => actor(f.tech!, "PHARMACY_TECH");
  const head = () => actor(f.head!, "PHARMACY_TECH");

  const write = <I, R extends { id: string }>(
    schema: z.ZodType<I>,
    fn: (ctx: PharmacyCtx, input: I) => Promise<R>,
    raw: Record<string, unknown>,
    who: PharmacyActor,
    need: PharmacyNeed,
  ) =>
    runPharmacyWrite(schema, { clientKey: randomUUID(), ...raw }, who, need, fn, {
      database: lane.db,
    });

  let lineNo = 0;
  const place = async (
    o: { controlled?: boolean; edits?: unknown[]; drug?: string; patient?: string } = {},
  ) => {
    lineNo += 1;
    return (
      await one(
        `INSERT INTO public.prescriptions
           (hospital_id, encounter_id, patient_user_id, prescriber_user_id, prescriber_cadre, drug_id, drug_name,
            dose, route, frequency, is_emergency, state, placement_id, placement_line, created_at, updated_at,
            check_answers, controlled, regimen_id, edits)
         VALUES ($1, $2, $3, $4, 'MEDICAL_OFFICER', $5, $6, '[fixture dose]', 'oral', '[fixture frequency]', false,
                 'active', gen_random_uuid(), 1, now() - interval '1 day', now() - interval '1 day', '[]'::jsonb,
                 $7, 'fixture_regimen', $8::jsonb)
         RETURNING id`,
        [
          f.h,
          f.window,
          o.patient ?? f.patient,
          f.doctor,
          o.drug ?? "fixture_dt_a",
          `Fixture medicine ${lineNo}`,
          o.controlled ?? false,
          JSON.stringify(o.edits ?? []),
        ],
      )
    ).id;
  };
  const product = async (medicine: string, name: string) => {
    const id = (
      await one(
        `INSERT INTO public.pharmacy_products (hospital_id, medicine_id, name, issue_unit, created_by)
         VALUES ($1, $2, $3, 'tablet', $4) RETURNING id`,
        [f.h, medicine, name, f.pharmacist],
      )
    ).id;
    for (const p of [f.pointA, f.pointB])
      await pg.query(
        `INSERT INTO public.pharmacy_product_points (product_id, dispensing_point_id, hospital_id) VALUES ($1, $2, $3)`,
        [id, p, f.h],
      );
    return id;
  };
  let batchNo = 0;
  const batch = async (productId: string, qty: number, expiry = "2099-03-31") => {
    batchNo += 1;
    const no = `FX-DT-${batchNo}`;
    const id = (
      await one(
        `INSERT INTO public.pharmacy_batches (hospital_id, dispensing_point_id, product_id, batch_number, expiry,
           first_batch_number, first_expiry, created_by)
         VALUES ($1, $2, $3, $4, $5, $4, $5, $6) RETURNING id`,
        [f.h, f.pointA, productId, no, expiry, f.pharmacist],
      )
    ).id;
    await pg.query(
      `INSERT INTO public.pharmacy_stock_movements (hospital_id, dispensing_point_id, batch_id, kind, quantity,
         effective_at, actor_user_id, source_kind)
       VALUES ($1, $2, $3, 'received', $4, now() - interval '50 days', $5, 'delivery')`,
      [f.h, f.pointA, id, qty, f.pharmacist],
    );
    return { id, no };
  };
  const bal = (batchId: string) =>
    n(
      `SELECT coalesce(sum(quantity), 0)::int AS n FROM public.pharmacy_stock_movements WHERE batch_id = $1`,
      [batchId],
    );

  let rowNo = 0;
  /** One supply row of the first sheet, about a MedSync line, unless told otherwise. */
  const row = (o: Record<string, unknown> = {}, who = tech()) =>
    write(
      entry.RowInput,
      entry.enterDowntimeRow,
      {
        sheet: sheets[0],
        section: "supply",
        row: (rowNo += 1),
        patientUserId: f.patient,
        suppliedAt: sheetTime.toISOString(),
        prescription: { kind: "medsync", lineId: f.line },
        supply: {
          productId: f.product,
          batchId: f.batch,
          quantity: 10,
          suppliedByCadre: "PHARMACY_TECH",
          identity: "checked",
          pharmacistInitials: null,
          controlled: null,
        },
        notSupplied: null,
        ...o,
      },
      who,
      entry.ENTRY_NEED,
    );
  const supplyOf = (handoverId: string) =>
    one<{ id: string; prescription_id: string | null; paper_prescription_line_id: string | null }>(
      `SELECT id, prescription_id, paper_prescription_line_id FROM public.pharmacy_supplies WHERE handover_id = $1`,
      [handoverId],
    );
  const flags = async (handoverId: string) =>
    (
      await pg.query<{ reasons: string[] }>(
        `SELECT l.reasons FROM public.pharmacy_look_backs l JOIN public.pharmacy_supplies s ON s.id = l.supply_id
          WHERE s.handover_id = $1 AND l.kind = 'flagged'`,
        [handoverId],
      )
    ).rows.flatMap((r) => r.reasons);
  const statusOf = async (lineId: string) =>
    (await reviewRead.getReviewOfLine(f.h!, lineId, f.pointA!, lane.db))!.lines.find(
      (l) => l.id === lineId,
    )!.status;

  beforeAll(async () => {
    process.env.MEDSYNC_PHI_KEY ??= generateKey();
    lane = await bootLane();
    pg = lane.pg;
    held.db = lane.db;
    f.h = await hospital(pg, "Downtime entry");
    f.pharm = (
      await one(
        `INSERT INTO public.hospital_departments (hospital_id, name, slug, kind, catalogue_code)
         VALUES ($1, 'Pharmacy', $2, 'support', 'PHARMACY') RETURNING id`,
        [f.h, `ph-${Date.now()}`],
      )
    ).id;
    // S81: point A is live, point B is set up but not live.
    for (const [p, live] of [
      ["A", true],
      ["B", false],
    ] as const) {
      f[`point${p}`] = (
        await one(
          `INSERT INTO public.hospital_departments (hospital_id, parent_id, name, slug, kind)
           VALUES ($1, $2, $3, $4, 'support') RETURNING id`,
          [f.h, f.pharm, `Fixture point ${p}`, `pt-${p}-${Date.now()}`],
        )
      ).id;
      await pg.query(
        `INSERT INTO public.pharmacy_dispensing_points (department_id, hospital_id, serves, live_at)
         VALUES ($1, $2, 'window', ${live ? "now() - interval '40 days'" : "NULL"})`,
        [f[`point${p}`], f.h],
      );
    }
    const clinic = await department(pg, f.h, "Clinic");
    f.pharmacist = (
      await staff(pg, { hospitalId: f.h, departmentId: f.pharm, cadre: "PHARMACIST" })
    ).userId;
    f.pharmacist2 = (
      await staff(pg, { hospitalId: f.h, departmentId: f.pharm, cadre: "PHARMACIST" })
    ).userId;
    f.tech = (
      await staff(pg, { hospitalId: f.h, departmentId: f.pointA!, cadre: "PHARMACY_TECH" })
    ).userId;
    f.head = (
      await staff(pg, { hospitalId: f.h, departmentId: f.pointA!, cadre: "PHARMACY_TECH" })
    ).userId;
    await pg.query(
      `INSERT INTO public.department_heads (hospital_id, department_id, user_id, starts_at)
       VALUES ($1, $2, $3, now() - interval '1 day')`,
      [f.h, f.pointA, f.head],
    );
    f.doctor = (
      await staff(pg, { hospitalId: f.h, departmentId: clinic, cadre: "MEDICAL_OFFICER" })
    ).userId;
    await pg.query(
      `INSERT INTO public.clinical_cosign_policies (hospital_id, cadre_code, action_kind, requirement)
       VALUES ($1, 'MEDICAL_OFFICER', 'prescription_routine', 'allowed') ON CONFLICT DO NOTHING`,
      [f.h],
    );
    await pg.query(
      `INSERT INTO public.pharmacy_hospital_settings (hospital_id, updated_by) VALUES ($1, $2)`,
      [f.h, f.pharmacist],
    );
    // A signed lane rule: a changed pre-set dose is pharmacist-first.
    await pg.query(
      `INSERT INTO public.pharmacy_signed_sets (hospital_id, kind, version, content, sha256, status, authored_by,
         first_signer, second_signer, signed_at)
       VALUES ($1, 'lane_rule', 1, $2::jsonb, repeat('d', 64), 'signed', $3, $3, $4, now())`,
      [
        f.h,
        JSON.stringify({ reasons: [{ code: "preset_dose_changed", on: true }] }),
        f.pharmacist,
        f.doctor,
      ],
    );
    f.patient = await patient(pg);
    await pg.query(
      `INSERT INTO public.patient_profiles (id, first_name_encrypted, surname_encrypted, sex, date_of_birth, id_type,
         phone_encrypted, district_id)
       VALUES ($1, $2, $3, 'female', '1990-01-01', 'none', $4, (SELECT id FROM public.districts LIMIT 1))`,
      [f.patient, encrypt("Fixture"), encrypt("Patient"), encrypt("0700000000")],
    );
    f.code = (
      await one<{ code: string }>(
        `SELECT patient_code AS code FROM public.patient_profiles WHERE id = $1`,
        [f.patient],
      )
    ).code;
    // S73: someone with an account and no registration.
    f.unregistered = await patient(pg);
    f.window = await encounter(pg, {
      hospitalId: f.h,
      patientUserId: f.patient!,
      clinicianUserId: f.doctor!,
      departmentId: clinic,
    });
    await pg.query(`UPDATE public.encounters SET disposition = 'home' WHERE id = $1`, [f.window]);

    f.product = await product("fixture_dt_a", "Fixture tablet A 100s");
    f.batch = (await batch(f.product, 100)).id;
    f.line = await place();

    // S68: the in-charge records a downtime and the sheets used (8a's writes).
    const reserved = await write(
      dt.ReserveInput,
      dt.reserveSheetNumbers,
      { count: 4 },
      tech(),
      dt.SHEETS_NEED,
    );
    if (!reserved.ok) throw new Error(reserved.error);
    sheets.push(...reserved.data!.numbers);
    const period = await write(
      dt.PeriodInput,
      dt.recordDowntime,
      {
        startsAt: new Date(Date.now() - 3 * HOUR).toISOString(),
        endsAt: new Date(Date.now() - HOUR).toISOString(),
        reason: "power",
        note: null,
        sheets: sheets.slice(0, 3),
      },
      head(),
      dt.MANAGE_SHEETS_NEED,
    );
    if (!period.ok) throw new Error(period.error);
  }, 180_000);

  it("S68: a row entered keeps the sheet's time, is marked entered after downtime with its sheet and row; stock moved at that time", async () => {
    const before = await bal(f.batch!);
    const r = await row();
    expect(r).toMatchObject({ ok: true });
    if (!r.ok) return;
    f.s68 = r.id;
    expect(r.data).toMatchObject({ suppliedAt: sheetTime.toISOString() });
    const ho = await one<{
      supplied_at: Date;
      entered_at: Date;
      entered_after_downtime: boolean;
      sheet_number: number;
      sheet_row: number;
      identity_route: string;
      sheet_identity: string;
      actor_cadre: string;
    }>(`SELECT * FROM public.pharmacy_handovers WHERE id = $1`, [r.id]);
    expect(new Date(ho.supplied_at).toISOString()).toBe(sheetTime.toISOString());
    expect(new Date(ho.entered_at).getTime()).toBeGreaterThan(sheetTime.getTime());
    expect(ho).toMatchObject({
      entered_after_downtime: true,
      sheet_number: sheets[0],
      sheet_row: 1,
      identity_route: "downtime_sheet",
      sheet_identity: "checked",
      actor_cadre: "Pharmacy technician",
    });
    const mv = await one<{ effective_at: Date; downtime: boolean; quantity: number }>(
      `SELECT m.effective_at, m.downtime, m.quantity FROM public.pharmacy_stock_movements m
         JOIN public.pharmacy_supplies s ON s.id = m.source_id WHERE s.handover_id = $1`,
      [r.id],
    );
    expect(new Date(mv.effective_at).toISOString()).toBe(sheetTime.toISOString());
    expect(mv).toMatchObject({ downtime: true, quantity: -10 });
    expect(await bal(f.batch!)).toBe(before - 10);
    expect(await statusOf(f.line!)).toMatchObject({ kind: "closed", outcome: "supplied" });
    expect(await flags(r.id)).toEqual([]);

    // The tag, wherever the supply appears (Supplied today on the sheet's day, and the log).
    const tags = await entry.downtimeTagsFor(f.h!, [r.id], lane.db);
    expect(tags[r.id]).toMatch(
      new RegExp(
        `^Entered after downtime · Supplied \\d\\d:\\d\\d · entered \\d\\d:\\d\\d · sheet ${pharmacySheetLabel(sheets[0]!)}$`,
      ),
    );
    const day = await supplyRead.getSupplied(f.h!, f.pointA!, localDate(sheetTime), lane.db);
    expect(day.rows.find((x) => x.handoverId === r.id)).toMatchObject({
      enteredAfterDowntime: true,
      at: sheetTime.toISOString(),
    });
  });

  it("S69: a row is entered once; Sheet complete closes the sheet; unused sheets do not count as waiting", async () => {
    const again = await row({ row: 1 });
    expect(again.ok).toBe(false);
    expect(!again.ok && again.error).toBe(
      `Row 1 of ${pharmacySheetLabel(sheets[0]!)} is already entered.`,
    );
    // The same client key returns the row already entered.
    const key = (
      await one<{ k: string }>(
        `SELECT client_key AS k FROM public.pharmacy_handovers WHERE id = $1`,
        [f.s68],
      )
    ).k;
    const repeat = await runPharmacyWrite(
      entry.RowInput,
      {
        clientKey: key,
        sheet: sheets[0],
        section: "supply",
        row: 1,
        patientUserId: f.patient,
        suppliedAt: sheetTime.toISOString(),
        prescription: { kind: "medsync", lineId: f.line },
        supply: {
          productId: f.product,
          batchId: f.batch,
          quantity: 10,
          suppliedByCadre: "PHARMACY_TECH",
          identity: "checked",
          pharmacistInitials: null,
          controlled: null,
        },
        notSupplied: null,
      },
      tech(),
      entry.ENTRY_NEED,
      entry.enterDowntimeRow,
      { database: lane.db },
    );
    expect(repeat).toMatchObject({ ok: true, id: f.s68 });

    // Sheets 1–3 are to enter, sheet 4 is unused: three waiting.
    expect(await dt.countSheetsToEnter(f.h!, lane.db)).toBe(3);
    const done = await write(
      entry.CompleteSheetInput,
      dt.completeSheet,
      { number: sheets[2] },
      tech(),
      dt.SHEETS_NEED,
    );
    expect(done.ok).toBe(true);
    expect(await dt.countSheetsToEnter(f.h!, lane.db)).toBe(2);
    const onComplete = await row({ sheet: sheets[2] });
    expect(!onComplete.ok && onComplete.error).toBe(DOWNTIME_DRAFT_COPY.sheet_not_to_enter);
    const onUnused = await row({ sheet: sheets[3] });
    expect(!onUnused.ok && onUnused.error).toBe(DOWNTIME_DRAFT_COPY.sheet_not_to_enter);
  });

  it("S70: a supply against a paper prescription is its own record; no prescription row is created", async () => {
    const rx = await n(`SELECT count(*)::int AS n FROM public.prescriptions`);
    const r = await row({
      prescription: {
        kind: "paper",
        prescriberName: "Dr Fixture Writer",
        prescriberCadre: "Medical officer",
        writtenOn: localDate(sheetTime),
        lines: [
          {
            medicineAsWritten: "Fixture tab A",
            directionsAsWritten: "[as on the paper]",
            quantityAsWritten: "10",
          },
          {
            medicineAsWritten: "Fixture syrup B",
            directionsAsWritten: "[as on the paper, 2]",
            quantityAsWritten: null,
          },
        ],
        lineNo: 1,
      },
    });
    expect(r).toMatchObject({ ok: true });
    if (!r.ok) return;
    expect(await n(`SELECT count(*)::int AS n FROM public.prescriptions`)).toBe(rx);
    const s = await supplyOf(r.id);
    expect(s.prescription_id).toBeNull();
    const line = await one<{
      medicine_as_written: string;
      directions_as_written: string;
      transcribed_by: string;
    }>(
      `SELECT l.medicine_as_written, l.directions_as_written, p.transcribed_by
         FROM public.paper_prescription_lines l JOIN public.paper_prescriptions p ON p.id = l.paper_prescription_id
        WHERE l.id = $1`,
      [s.paper_prescription_line_id],
    );
    // Law 7: kept exactly as typed.
    expect(line).toMatchObject({
      medicine_as_written: "Fixture tab A",
      directions_as_written: "[as on the paper]",
      transcribed_by: f.tech,
    });
    expect(
      await n(
        `SELECT count(*)::int AS n FROM public.paper_prescription_lines l
           JOIN public.paper_prescriptions p ON p.id = l.paper_prescription_id WHERE p.sheet_number = $1`,
        [sheets[0]],
      ),
    ).toBe(2);
  });

  it("S71: back-entry takes a batch below zero; it is recorded and the medicine shows Count needed", async () => {
    const p = await product("fixture_dt_low", "Fixture tablet L 10s");
    const b = await batch(p, 5);
    const line = await place({ drug: "fixture_dt_low" });
    const r = await row({
      prescription: { kind: "medsync", lineId: line },
      supply: {
        productId: p,
        batchId: b.id,
        quantity: 8,
        suppliedByCadre: "PHARMACY_TECH",
        identity: "checked",
        pharmacistInitials: null,
        controlled: null,
      },
    });
    expect(r).toMatchObject({ ok: true });
    expect(await bal(b.id)).toBe(-3);
    const state = stockState({
      batches: [
        {
          id: b.id,
          pointId: f.pointA!,
          productId: p,
          medicineId: "fixture_dt_low",
          batchNumber: b.no,
          expiry: "2099-03-31",
          expiryMonthOnly: false,
        },
      ],
      balances: new Map([[b.id, await bal(b.id)]]),
      medicineId: "fixture_dt_low",
      pointId: f.pointA!,
      localDate: localDate(new Date()),
      reorderLevel: null,
      lookaheadDays: null,
      outSince: null,
    });
    expect(state.state).toBe("count_needed");
  });

  it("S72: a time in the future is refused; a time outside every downtime is refused until the in-charge records it", async () => {
    const future = await row({ suppliedAt: new Date(Date.now() + HOUR).toISOString() });
    expect(!future.ok && future.error).toBe(DOWNTIME_DRAFT_COPY.future);
    const early = new Date(Date.now() - 6 * HOUR);
    const outside = await row({ suppliedAt: early.toISOString(), row: 40 });
    expect(!outside.ok && outside.error).toBe(DOWNTIME_COPY.noPeriod);
    const period = await write(
      dt.PeriodInput,
      dt.recordDowntime,
      {
        startsAt: new Date(early.getTime() - HOUR).toISOString(),
        endsAt: new Date(early.getTime() + HOUR).toISOString(),
        reason: "network",
        note: null,
        sheets: [],
      },
      head(),
      dt.MANAGE_SHEETS_NEED,
    );
    expect(period.ok).toBe(true);
    const inside = await row({ suppliedAt: early.toISOString(), row: 40 });
    expect(inside).toMatchObject({ ok: true });
    const zero = await row({
      supply: {
        productId: f.product,
        batchId: f.batch,
        quantity: 2.5,
        suppliedByCadre: "PHARMACY_TECH",
        identity: "checked",
        pharmacistInitials: null,
        controlled: null,
      },
    });
    expect(!zero.ok && zero.error).toBe(DOWNTIME_DRAFT_COPY.quantity);
  });

  it("S73: a patient who is not registered cannot be created from this screen", async () => {
    const profiles = await n(`SELECT count(*)::int AS n FROM public.patient_profiles`);
    const r = await row({ patientUserId: f.unregistered });
    expect(!r.ok && r.error).toBe(DOWNTIME_COPY.notRegistered);
    expect(await entry.patientForEntry(f.h!, "NOT-A-NUMBER", lane.db)).toBeNull();
    const found = await entry.patientForEntry(f.h!, f.code!, lane.db);
    expect(found?.patientUserId).toBe(f.patient);
    expect(found?.lines.some((l) => l.id === f.line)).toBe(true);
    expect(await n(`SELECT count(*)::int AS n FROM public.patient_profiles`)).toBe(profiles);
  });

  it("S74: rows a live supply would refuse are recorded and flagged with each reason; a pharmacist looks back on each", async () => {
    const noTick = await row({
      prescription: { kind: "medsync", lineId: await place() },
      supply: {
        productId: f.product,
        batchId: f.batch,
        quantity: 10,
        suppliedByCadre: "PHARMACY_TECH",
        identity: "not_checked",
        pharmacistInitials: null,
        controlled: null,
      },
    });
    const pf = await place({ edits: [{ field: "dose", from: "a", to: "b" }] });
    expect((await statusOf(pf))?.kind).toBe("stage");
    const noInitials = await row({ prescription: { kind: "medsync", lineId: pf } });
    const old = await batch(f.product!, 50, "2020-01-31");
    const expired = await row({
      prescription: { kind: "medsync", lineId: await place() },
      supply: {
        productId: f.product,
        batchId: old.id,
        quantity: 10,
        suppliedByCadre: "PHARMACY_TECH",
        identity: "checked",
        pharmacistInitials: null,
        controlled: null,
      },
    });
    // f.line was supplied at S68: a second row for it may be a double supply.
    const twice = await row();
    // A standard line still awaiting review is recorded, with nothing to look back on.
    const awaiting = await row({ prescription: { kind: "medsync", lineId: await place() } });
    for (const r of [noTick, noInitials, expired, twice, awaiting])
      expect(r).toMatchObject({ ok: true });
    if (!noTick.ok || !noInitials.ok || !expired.ok || !twice.ok || !awaiting.ok) return;
    expect(await flags(noTick.id)).toEqual(["identity_not_checked"]);
    expect(await flags(noInitials.id)).toEqual(["no_pharmacist_initials"]);
    expect(await flags(expired.id)).toEqual(["batch_expired"]);
    expect(await flags(twice.id)).toEqual(["possible_double_supply"]);
    expect(await flags(awaiting.id)).toEqual([]);

    const flagged = [noTick, noInitials, expired, twice].map((r) => r.id);
    const list = await supplyRead.getLookBack(f.h!, lane.db);
    const supplyIds = await Promise.all(flagged.map(async (h) => (await supplyOf(h)).id));
    for (const id of supplyIds) expect(list.some((l) => l.supplyId === id)).toBe(true);
    for (const supplyId of supplyIds)
      expect(
        await write(
          review.LookBackInput,
          review.recordLookBack,
          { supplyId, note: "Fixture: looked at the sheet." },
          pharmacist(),
          review.LOOK_BACK_NEED,
        ),
      ).toMatchObject({ ok: true });
    const after = await supplyRead.getLookBack(f.h!, lane.db);
    for (const id of supplyIds) expect(after.some((l) => l.supplyId === id)).toBe(false);
  });

  it("S75: a back-entered controlled supply is listed until confirmed against the register, with a witness", async () => {
    const cdProduct = await product("fixture_dt_cd", "Fixture injection D");
    const cdBatch = await batch(cdProduct, 20);
    const line = await place({ controlled: true, drug: "fixture_dt_cd" });
    const base = {
      prescription: { kind: "medsync", lineId: line },
      supply: {
        productId: cdProduct,
        batchId: cdBatch.id,
        quantity: 2,
        suppliedByCadre: "PHARMACIST",
        identity: "checked",
        pharmacistInitials: "FX",
        controlled: null as null | { witnessNameAsWritten: string; registerAttested: boolean },
      },
    };
    const bare = await row(base);
    expect(!bare.ok && bare.error).toBe(entry.ENTRY_COPY.controlled);
    const r = await row({
      ...base,
      supply: {
        ...base.supply,
        controlled: { witnessNameAsWritten: "Fixture Witness", registerAttested: true },
      },
    });
    expect(r).toMatchObject({ ok: true });
    // Listed on the Controlled drugs page (Step 7's read) until confirmed.
    const listed = async () =>
      (await controlledRead.getControlledRegister(f.h!, f.pointA!, null, null, lane.db))
        .backEntered;
    const waiting = await listed();
    expect(waiting).toHaveLength(1);
    expect(waiting[0]).toMatchObject({ witnessAsWritten: "Fixture Witness" });

    // A technician holds no pharmacy.controlled.
    const att = await one(
      `INSERT INTO public.pharmacy_attestations (hospital_id, actor_user_id, attester_user_id, purpose, action, outcome)
       VALUES ($1, $2, $3, 'witness', 'confirm_back_entry', 'passed') RETURNING id`,
      [f.h, f.pharmacist, f.pharmacist2],
    );
    const byTech = await write(
      controlledStore.ConfirmBackEntryInput,
      controlledStore.confirmBackEnteredControlledSupply,
      { entryId: waiting[0]!.id, witnessAttestationId: att.id },
      tech(),
      controlledStore.CONTROLLED_NEED,
    );
    expect(byTech.ok).toBe(false);
    const ok = await write(
      controlledStore.ConfirmBackEntryInput,
      controlledStore.confirmBackEnteredControlledSupply,
      { entryId: waiting[0]!.id, witnessAttestationId: att.id },
      pharmacist(),
      controlledStore.CONTROLLED_NEED,
    );
    expect(ok).toMatchObject({ ok: true });
    expect(await listed()).toHaveLength(0);
  });

  it("S76: a not-supplied row is that line's outcome, at the sheet's time; once only", async () => {
    const line = await place();
    const ns = {
      section: "not_supplied",
      row: 3,
      prescription: { kind: "medsync", lineId: line },
      supply: null,
      notSupplied: { outcome: "owed", reasonCode: "out_point" },
    };
    const r = await row(ns);
    expect(r).toMatchObject({ ok: true });
    if (!r.ok) return;
    const ev = await one<{ kind: string; effective_at: Date; reason_code: string }>(
      `SELECT kind, effective_at, reason_code FROM public.pharmacy_line_events WHERE id = $1`,
      [r.id],
    );
    expect(ev).toMatchObject({ kind: "owed", reason_code: "out_point" });
    expect(new Date(ev.effective_at).toISOString()).toBe(sheetTime.toISOString());
    expect(await statusOf(line)).toMatchObject({ kind: "open", outcome: "owed" });
    const again = await row(ns);
    expect(!again.ok && again.error).toBe(
      `Row 3 of ${pharmacySheetLabel(sheets[0]!)} is already entered.`,
    );
    const sheet = await entry.loadSheetEntry(f.h!, f.pointA!, sheets[0]!, lane.db);
    expect(sheet?.rows.some((x) => x.section === "not_supplied" && x.row === 3)).toBe(true);
  });

  it("0134: a not-supplied row about a paper prescription is entered once (DT-2)", async () => {
    const ns = {
      section: "not_supplied",
      row: 7,
      prescription: {
        kind: "paper",
        prescriberName: "Dr Fixture Writer",
        prescriberCadre: "Medical officer",
        writtenOn: localDate(sheetTime),
        lines: [
          {
            medicineAsWritten: "Fixture tab C",
            directionsAsWritten: "[as on the paper, 3]",
            quantityAsWritten: null,
          },
        ],
        lineNo: 1,
      },
      supply: null,
      notSupplied: { outcome: "owed", reasonCode: "out_point" },
    };
    expect(await row(ns)).toMatchObject({ ok: true });
    const again = await row(ns);
    expect(!again.ok && again.error).toBe(
      `Row 7 of ${pharmacySheetLabel(sheets[0]!)} is already entered.`,
    );
    expect(
      await n(
        `SELECT count(*)::int AS n FROM public.paper_prescriptions WHERE hospital_id = $1 AND sheet_number = $2
            AND sheet_row = 7`,
        [f.h, sheets[0]],
      ),
    ).toBe(1);
  });

  it("S78: the log prints the day's supplies, one row per batch, back-entered on their day and reversed struck through", async () => {
    // A live-supplied line reversed the same day, entered back first so it lands on the sheet's day.
    const line = await place();
    const r = await row({ prescription: { kind: "medsync", lineId: line } });
    expect(r).toMatchObject({ ok: true });
    if (!r.ok) return;
    const reversed = await write(
      supply.ReverseInput,
      supply.reverseSupply,
      { handoverId: r.id, lineId: line, reasonCode: "handed_back", packFit: true },
      pharmacist(),
      supply.REVERSE_NEED,
    );
    expect(reversed).toMatchObject({ ok: true });

    const day = localDate(sheetTime);
    const names = async (ids: string[]) =>
      new Map(ids.map((id) => [id, { name: "Fixture Patient", mrn: "FX-0001" }]));
    const start = startOfLocalDay(new Date(`${day}T12:00:00+03:00`), DEFAULT_TIME_ZONE);
    const events = await n(
      `SELECT count(*)::int AS n FROM public.pharmacy_supplies
        WHERE dispensing_point_id = $1 AND supplied_at >= $2 AND supplied_at < $3`,
      [f.pointA, start.toISOString(), new Date(start.getTime() + 24 * HOUR).toISOString()],
    );
    const before = await logRead.getDispensingLog(f.h!, f.pointA!, day, names, lane.db);
    expect(before.notice).toBe(LOG_COPY.notConfirmed);
    expect(before.rows).toHaveLength(events);
    expect(before.supplyEvents).toBe(events);
    const s68 = (await supplyOf(f.s68!)).id;
    expect(before.rows.find((x) => x.supplyId === s68)?.notes[0]).toMatch(
      /^Entered after downtime/,
    );
    const rev = (await supplyOf(r.id)).id;
    expect(before.rows.find((x) => x.supplyId === rev)).toMatchObject({ struck: true });

    // Only the pharmacy in charge confirms the map.
    const columns = [
      { heading: "Batch No.", fact: "batch" },
      { heading: "Qty", fact: "quantity" },
      { heading: "Remarks", fact: null },
      { heading: "Date/Time", fact: "time" },
    ];
    const byTech = await write(
      logRead.ConfirmColumnsInput,
      logRead.confirmLogColumns,
      { columns },
      tech(),
      logRead.MANAGE_LOG_NEED,
    );
    expect(byTech.ok).toBe(false);
    const ok = await write(
      logRead.ConfirmColumnsInput,
      logRead.confirmLogColumns,
      { columns },
      head(),
      logRead.MANAGE_LOG_NEED,
    );
    expect(ok).toMatchObject({ ok: true });
    const after = await logRead.getDispensingLog(f.h!, f.pointA!, day, names, lane.db);
    expect(after.notice).toBeNull();
    expect(after.headings).toEqual(["Batch No.", "Qty", "Remarks", "Date/Time"]);
    expect(after.rows).toHaveLength(events);
    expect(after.rows.find((x) => x.supplyId === s68)?.cells.slice(0, 3)).toEqual([
      expect.stringMatching(/^FX-DT-/),
      "10 tablet",
      "",
    ]);
  });

  it("S81: one live point and one not: the second keeps the Phase 0 read-only view, with its Stock page", async () => {
    const points = await pg.query<{
      id: string;
      live_at: Date | null;
      switched_off_at: Date | null;
    }>(
      `SELECT department_id AS id, live_at, switched_off_at FROM public.pharmacy_dispensing_points
        WHERE hospital_id = $1`,
      [f.h],
    );
    const live = (id: string) => {
      const p = points.rows.find((x) => x.id === id)!;
      return isLive({ liveAt: p.live_at, switchedOffAt: p.switched_off_at } as Parameters<
        typeof isLive
      >[0]);
    };
    expect(live(f.pointA!)).toBe(true);
    expect(live(f.pointB!)).toBe(false);
    const line = await place();
    expect((await reviewRead.getReviewOfLine(f.h!, line, f.pointA!, lane.db))?.pointLive).toBe(
      true,
    );
    expect((await reviewRead.getReviewOfLine(f.h!, line, f.pointB!, lane.db))?.pointLive).toBe(
      false,
    );
    // A live write at point B is refused: it is not recording supplies.
    const atB = await write(
      review.DecisionsInput,
      review.saveLineDecisions,
      { decisions: [{ lineId: line, kind: "full", quantity: 1 }] },
      actor(f.tech!, "PHARMACY_TECH", f.pointB),
      review.DISPENSE_NEED,
    );
    expect(!atB.ok && atB.error).toMatch(/is not live for dispensing/);
    // Its Stock page still reads.
    const stock = await stockRead.getStockPage(
      { userId: f.pharmacist!, hospitalId: f.h! },
      { id: f.pointB! },
      new Date(),
      lane.db,
    );
    expect(Array.isArray(stock.rows)).toBe(true);
  });
});
