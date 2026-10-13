/**
 * Pharmacy Phase 1, Step 9: the patient's medicine list from supplies, the refill date, the patient's taps
 * and messages, on the PGlite lane with every migration replayed (0134 included). S90–S96 of
 * docs/pharmacy/phase-1/PROMPT-PHARMACY-PHASE-1.md §9, ML-1 to ML-6, MS-1 to MS-5, RD-4, W7, HZ-PH1-30.
 * Writes go through `runPharmacyWrite` as the actions do, with `pharmacyPatientList` passed in as the action
 * passes it. SMS goes to a fake `SmsSender`, never to Africa's Talking. Every medicine, batch, quantity,
 * name, number and time is a fixture (Law 8). Runs with EMR_PGLITE=1.
 */
import { randomUUID } from "node:crypto";
import type { Lane, Pg } from "./_pglite";
import type { SmsSender } from "@/lib/notifications/sink";
import type { PharmacyActor, PharmacyCtx, PharmacyNeed } from "@/lib/pharmacy/write";
import type { z } from "zod";
import { beforeAll, describe, expect, it, vi } from "vitest";

import { REVIEW } from "@/content/pharmacy-review";
import { blindIndex, encrypt, generateKey } from "@/lib/encryption";
import { PHARMACY_MAP_V2, pharmacyDispensingAccess } from "@/lib/pharmacy/access";
import {
  bannedTermsScan,
  MESSAGE_COPY,
  PATIENT_COPY,
  renderMessage,
} from "@/lib/pharmacy/messages";
import { runPharmacyWrite } from "@/lib/pharmacy/write";
import { FORMULARY_DRUGS } from "@/lib/prescribing/reference/general-formulary";
import { bootLane, department, encounter, hospital, laneOn, patient, staff } from "./_pglite";

vi.mock("server-only", () => ({}));
const held = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("@/db", () => ({
  get db() {
    return held.db;
  },
}));

const review = await import("@/lib/pharmacy/review/store");
const reviewRead = await import("@/lib/pharmacy/review/read");
const store = await import("@/lib/pharmacy/supply/store");
const list = await import("@/lib/pharmacy/patient-list");
const notify = await import("@/lib/pharmacy/notify");

const DAY = 86_400_000;
const PHONE = "+256700000123";
const MESSAGE_NAME = "Fixture General Hospital";

/** The fake transport: records what would have gone, sends nothing. */
function fakeSender(): SmsSender & { sent: { toE164: string; body: string }[] } {
  const sent: { toE164: string; body: string }[] = [];
  return {
    sent,
    async send(m) {
      sent.push(m);
      return { ok: true };
    },
  };
}

describe.skipIf(!laneOn)("the patient's medicine list and messages (Step 9, S90–S96)", () => {
  let lane: Lane;
  let pg: Pg;
  const f = {} as Record<string, string>;

  const one = async <T = { id: string }>(q: string, p?: unknown[]) =>
    (await pg.query<T>(q, p)).rows[0] as T;
  const n = async (q: string, p?: unknown[]) => (await one<{ n: number }>(q, p)).n;

  const actor = (userId: string, cadre: string): PharmacyActor => ({
    userId,
    hospitalId: f.h!,
    cadreCode: cadre,
    cadreName: cadre === "PHARMACIST" ? "Pharmacist" : "Pharmacy technician",
    pointId: f.pointA!,
    access: pharmacyDispensingAccess(cadre, PHARMACY_MAP_V2),
  });
  const pharmacist = () => actor(f.pharmacist!, "PHARMACIST");
  const tech = () => actor(f.tech!, "PHARMACY_TECH");
  const head = () => actor(f.head!, "PHARMACY_TECH");

  const run = <I, R extends { id: string }>(
    a: PharmacyActor,
    schema: z.ZodType<I>,
    need: PharmacyNeed,
    write: (ctx: PharmacyCtx, input: I) => Promise<R>,
    raw: Record<string, unknown>,
  ) =>
    runPharmacyWrite(schema, { clientKey: randomUUID(), ...raw }, a, need, write, {
      database: lane.db,
    });

  let lineNo = 0;
  const place = async (
    o: {
      drug?: string;
      duration?: string | null;
      controlled?: boolean;
      who?: string;
      placement?: string;
    } = {},
  ) => {
    lineNo += 1;
    return (
      await one(
        `INSERT INTO public.prescriptions
           (hospital_id, encounter_id, patient_user_id, prescriber_user_id, prescriber_cadre, drug_id, drug_name,
            dose, route, frequency, duration, is_emergency, state, placement_id, placement_line, created_at,
            updated_at, check_answers, controlled, regimen_id, edits)
         VALUES ($1, $2, $3, $4, 'MEDICAL_OFFICER', $5, $6, '[fixture dose]', 'oral', '[fixture frequency]', $7,
                 false, 'active', coalesce($9::uuid, gen_random_uuid()), $10, now(), now(), '[]'::jsonb, $8,
                 'fixture_regimen', '[]'::jsonb)
         RETURNING id`,
        [
          f.h,
          o.who === f.patient2 ? f.window2 : f.window,
          o.who ?? f.patient,
          f.doctor,
          o.drug ?? `fixture_pl_${lineNo}`,
          `Fixture medicine ${lineNo}`,
          o.duration ?? null,
          o.controlled ?? false,
          o.placement ?? null,
          lineNo,
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
    await pg.query(
      `INSERT INTO public.pharmacy_product_points (product_id, dispensing_point_id, hospital_id) VALUES ($1, $2, $3)`,
      [id, f.pointA, f.h],
    );
    return id;
  };
  let batchNo = 0;
  const batch = async (productId: string, qty: number) => {
    batchNo += 1;
    const id = (
      await one(
        `INSERT INTO public.pharmacy_batches (hospital_id, dispensing_point_id, product_id, batch_number, expiry,
           first_batch_number, first_expiry, created_by)
         VALUES ($1, $2, $3, $4, '2099-03-31', $4, '2099-03-31', $5) RETURNING id`,
        [f.h, f.pointA, productId, `FX-PL-${batchNo}`, f.pharmacist],
      )
    ).id;
    await pg.query(
      `INSERT INTO public.pharmacy_stock_movements (hospital_id, dispensing_point_id, batch_id, kind, quantity,
         effective_at, actor_user_id, source_kind)
       VALUES ($1, $2, $3, 'received', $4, now() - interval '50 days', $5, 'delivery')`,
      [f.h, f.pointA, id, qty, f.pharmacist],
    );
    return id;
  };
  /** A medicine set up at point A with one batch: its line, product and batch. */
  const medicine = async (o: Parameters<typeof place>[0] = {}, stock = 100) => {
    const drug = o.drug ?? `fixture_pl_med_${lineNo + 1}`;
    const line = await place({ ...o, drug });
    const p = await product(drug, `Fixture product ${lineNo}`);
    const b = stock > 0 ? await batch(p, stock) : null;
    return { line, product: p, batch: b };
  };
  const stage = (decisions: Record<string, unknown>[], a = pharmacist()) =>
    run(a, review.DecisionsInput, review.DISPENSE_NEED, review.saveLineDecisions, { decisions });
  const handover = async (
    lines: Record<string, unknown>[],
    o: { patientList?: boolean; who?: string } = {},
  ) => {
    const clientKey = randomUUID();
    await run(tech(), store.IdentifierInput, store.DISPENSE_LIVE, store.checkSecondIdentifier, {
      clientKey,
      lineId: lines[0]!.lineId,
      kind: "date_of_birth",
      typed: "01/07/1988",
    });
    return runPharmacyWrite(
      store.HandoverInput,
      {
        clientKey,
        lines,
        collector: { kind: "patient" },
        identity: { route: "two_identifiers", nameAttested: true },
        payment: { status: "paid" },
      },
      tech(),
      store.DISPENSE_LIVE,
      (ctx, input: z.infer<typeof store.HandoverInput>) =>
        store.recordHandover(ctx, input, null, { patientList: o.patientList ?? true }),
      { database: lane.db },
    );
  };
  const planLine = (
    lineId: string,
    productId: string,
    batchId: string,
    quantity: number,
    extra: Record<string, unknown> = {},
  ) => ({
    lineId,
    productId,
    rows: [{ batchId, quantity }],
    strengthConfirmed: true,
    ...extra,
  });
  /** Supplied in full, at point A, through review and hand-over. */
  const supplyFull = async (
    m: { line: string; product: string; batch: string | null },
    q = 20,
    days?: number,
  ) => {
    expect(
      (
        await stage([
          { lineId: m.line, kind: "full", quantity: q, ...(days ? { daysCovered: days } : {}) },
        ])
      ).ok,
    ).toBe(true);
    const r = await handover([
      planLine(m.line, m.product, m.batch!, q, days ? { daysCovered: days } : {}),
    ]);
    expect(r).toMatchObject({ ok: true });
    return r as Extract<typeof r, { ok: true }>;
  };
  const notSupplied = async (line: string, outcome: "owed" | "buying_outside") => {
    const r = await run(
      pharmacist(),
      review.NotSuppliedInput,
      review.DISPENSE_NEED,
      review.recordNotSupplied,
      {
        lineId: line,
        outcome,
        reasonCode: "out_point",
      },
    );
    expect(r).toMatchObject({ ok: true });
    return r.ok ? r.id : "";
  };
  const statusOf = async (lineId: string) =>
    (await reviewRead.getReviewOfLine(f.h!, lineId, f.pointA!, lane.db))!.lines.find(
      (l) => l.id === lineId,
    )!.status;
  const entries = (line: string) =>
    pg.query<{
      id: string;
      state: string;
      source_supply_id: string | null;
      name: string;
      instructions: string;
      notes: string;
      updated_at: Date;
    }>(
      `SELECT id, state, source_supply_id, name, instructions, notes, updated_at FROM public.self_medications
        WHERE patient_user_id = $1 AND source_prescription_id = $2`,
      [f.patient, line],
    );
  const live = async () => true;
  const patientList = (now?: Date) =>
    list.getPatientMedicineList(f.patient!, live, { database: lane.db, ...(now ? { now } : {}) });
  const setLiveSms = (on: boolean) =>
    pg.query(`UPDATE public.pharmacy_hospital_settings SET live_sms = $2 WHERE hospital_id = $1`, [
      f.h,
      on,
    ]);
  const template = (purpose: string, body: string, status = "approved") =>
    pg.query(
      `INSERT INTO public.ncd_sms_template (facility_id, workspace, purpose, language, body, status, first_approver,
         approved_by, approved_at)
       VALUES ($1, 'pharmacy', $2, 'en', $3, $4, $5, $6, now())`,
      [f.h, purpose, body, status, f.pharmacist, f.head],
    );
  const sendNotice = (eventId: string, sender: SmsSender | null, production = false) =>
    notify.notifyNotSupplied({ userId: f.pharmacist!, hospitalId: f.h! }, eventId, sender, {
      database: lane.db,
      production,
    });

  beforeAll(async () => {
    process.env.MEDSYNC_PHI_KEY ??= generateKey();
    lane = await bootLane();
    pg = lane.pg;
    held.db = lane.db;
    f.h = await hospital(pg, "Patient list");
    f.pharm = (
      await one(
        `INSERT INTO public.hospital_departments (hospital_id, name, slug, kind, catalogue_code)
         VALUES ($1, 'Pharmacy', $2, 'support', 'PHARMACY') RETURNING id`,
        [f.h, `ph-pl-${Date.now()}`],
      )
    ).id;
    f.pointA = (
      await one(
        `INSERT INTO public.hospital_departments (hospital_id, parent_id, name, slug, kind)
         VALUES ($1, $2, 'Fixture window point', $3, 'support') RETURNING id`,
        [f.h, f.pharm, `pt-pl-${Date.now()}`],
      )
    ).id;
    await pg.query(
      `INSERT INTO public.pharmacy_dispensing_points (department_id, hospital_id, serves, live_at, phone)
       VALUES ($1, $2, 'window', now() - interval '40 days', '+256 700 000000')`,
      [f.pointA, f.h],
    );
    const clinic = await department(pg, f.h, "Fixture diabetes clinic");
    f.pharmacist = (
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
    await pg.query(
      `INSERT INTO public.pharmacy_signed_sets (hospital_id, kind, version, content, sha256, status, authored_by,
         first_signer, second_signer, signed_at)
       VALUES ($1, 'lane_rule', 1, $2::jsonb, repeat('b', 64), 'signed', $3, $3, $4, now())`,
      [
        f.h,
        JSON.stringify({ reasons: [{ code: "preset_dose_changed", on: true }] }),
        f.pharmacist,
        f.doctor,
      ],
    );
    for (const k of ["patient", "patient2"] as const) {
      f[k] = await patient(pg);
      await pg.query(
        `INSERT INTO public.patient_profiles (id, first_name_encrypted, surname_encrypted, sex, date_of_birth, id_type,
           phone_encrypted, district_id)
         VALUES ($1, $2, $3, 'female', '1988-07-01', 'none', $4, (SELECT id FROM public.districts LIMIT 1))`,
        [
          f[k],
          encrypt("Fixture"),
          encrypt("Patient"),
          encrypt(k === "patient" ? PHONE : "+256700000999"),
        ],
      );
    }
    for (const [k, who] of [
      ["window", f.patient],
      ["window2", f.patient2],
    ] as const) {
      f[k] = await encounter(pg, {
        hospitalId: f.h,
        patientUserId: who!,
        clinicianUserId: f.doctor!,
        departmentId: clinic,
      });
      await pg.query(`UPDATE public.encounters SET disposition = 'home' WHERE id = $1`, [f[k]]);
    }
  }, 180_000);

  it("S90: after a hand-over the list shows each supplied medicine once, directions as written; a refill date only with days covered; the flag off writes nothing", async () => {
    const placement = randomUUID();
    const a = await medicine({ placement });
    const b = await medicine({ placement });
    expect(
      (
        await stage([
          { lineId: a.line, kind: "full", quantity: 20, daysCovered: 10 },
          { lineId: b.line, kind: "full", quantity: 14 },
        ])
      ).ok,
    ).toBe(true);
    const r = await handover([
      planLine(a.line, a.product, a.batch!, 20, { daysCovered: 10 }),
      planLine(b.line, b.product, b.batch!, 14),
    ]);
    expect(r).toMatchObject({ ok: true });
    for (const line of [a.line, b.line]) {
      const rows = (await entries(line)).rows;
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        state: "active",
        instructions: "[fixture dose] · oral · [fixture frequency]",
      });
      expect(rows[0]!.source_supply_id).not.toBeNull();
    }
    const view = await patientList();
    const g = view.groups.find((x) => x.medicines.some((m) => m.lineId === a.line))!;
    expect(g.head).toMatch(/^From .+ pharmacy, \d{1,2} \w{3} \d{4}\.$/);
    const ma = g.medicines.find((m) => m.lineId === a.line)!;
    const mb = g.medicines.find((m) => m.lineId === b.line)!;
    // Law 7: the directions exactly as stored; one entry per line; "{n} {units} given today" from supplies.
    expect(ma.directions).toBe("[fixture dose] · oral · [fixture frequency]");
    expect(ma.given).toBe("20 tablet given today");
    expect(ma.refill).toMatch(/^Next supply due around \d{1,2} \w{3} \d{4}$/);
    expect(mb.refill).toBeNull();
    // No pharmacist's line was written (W4: no strength change is possible), so none is marked.
    expect(ma.pharmacistLine).toBeNull();
    expect(view.coveredMedicationIds).toHaveLength(view.groups.flatMap((x) => x.medicines).length);

    // With the flag off, the hand-over writes no list entry.
    const c = await medicine();
    await supplyFullOff(c);
    expect((await entries(c.line)).rows).toHaveLength(0);
  });

  const supplyFullOff = async (m: { line: string; product: string; batch: string | null }) => {
    await stage([{ lineId: m.line, kind: "full", quantity: 5 }]);
    const r = await handover([planLine(m.line, m.product, m.batch!, 5)], { patientList: false });
    expect(r).toMatchObject({ ok: true });
  };

  it("S90 (W7): a later supply of the rest changes nothing in the patient's row; '{n} given' sums from supplies", async () => {
    const m = await medicine();
    await stage([
      {
        lineId: m.line,
        kind: "part",
        quantity: 10,
        notSupplied: 5,
        rest: "owed",
        reasonCode: "out_point",
      },
    ]);
    const rest = { outcome: "owed", quantityNotSupplied: 5, reasonCode: "out_point" };
    expect((await handover([planLine(m.line, m.product, m.batch!, 10, { rest })])).ok).toBe(true);
    const [before] = (await entries(m.line)).rows;
    expect(before).toBeDefined();
    // The owed rest is "not given", read from the line events, never written as a medicine.
    expect((await patientList()).notGiven.find((x) => x.lineId === m.line)).toMatchObject({
      outcome: "owed",
      lead: PATIENT_COPY.notGiven,
    });
    expect((await handover([planLine(m.line, m.product, m.batch!, 5)])).ok).toBe(true);
    const after = (await entries(m.line)).rows;
    expect(after).toHaveLength(1);
    expect(after[0]).toEqual(before);
    const med = (await patientList()).groups
      .flatMap((g) => g.medicines)
      .find((x) => x.lineId === m.line);
    expect(med?.given).toBe("15 tablet given today");
  });

  it("S90, ML-6, HZ-PH1-30: a reversal withdraws the entry; supplied again it is one entry; a correction withdraws it", async () => {
    const m = await medicine();
    const r = await supplyFull(m, 20, 7);
    const [entry] = (await entries(m.line)).rows;
    const back = await run(
      pharmacist(),
      store.ReverseInput,
      store.REVERSE_NEED,
      store.reverseSupply,
      {
        handoverId: r.id,
        lineId: m.line,
        reasonCode: "handed_back",
        packFit: true,
      },
    );
    expect(back.ok).toBe(true);
    expect((await entries(m.line)).rows[0]).toMatchObject({ id: entry!.id, state: "ended" });
    const view = await patientList();
    expect(view.groups.flatMap((g) => g.medicines).some((x) => x.lineId === m.line)).toBe(false);
    expect(view.coveredMedicationIds).toContain(entry!.id);

    // Supplied again: the same row, restored and repointed (the uniqueness never refuses it).
    const again = await supplyFull(m, 20);
    const rows = (await entries(m.line)).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: entry!.id, state: "active" });
    expect(rows[0]!.source_supply_id).not.toBe(entry!.source_supply_id);

    const fixed = await run(
      head(),
      store.CorrectInput,
      store.MANAGE_NEED,
      store.correctSupplyRecord,
      {
        handoverId: again.id,
        lineId: m.line,
        reasonCode: "wrong_entry",
      },
    );
    expect(fixed.ok).toBe(true);
    expect((await entries(m.line)).rows[0]).toMatchObject({ state: "ended" });
  });

  it("S91, ML-4: 'I have bought it' closes the line as reported by the patient; 'I could not get it' keeps it open, marked, and nudges the prescriber; the pharmacy changes it to owed", async () => {
    const bought = await medicine();
    await notSupplied(bought.line, "buying_outside");
    const notGiven = (await patientList()).notGiven.find((x) => x.lineId === bought.line)!;
    expect(notGiven).toMatchObject({
      outcome: "buying_outside",
      text: PATIENT_COPY.buyingOutside,
      canReport: true,
      couldNotGet: false,
    });
    // Only the patient's own line.
    await expect(
      list.reportFromPatient(
        f.patient2!,
        { clientKey: randomUUID(), lineId: bought.line, report: "bought" },
        { database: lane.db },
      ),
    ).rejects.toThrow(list.PATIENT_REPORT_COPY.notYours);
    const done = await list.reportFromPatient(
      f.patient!,
      { clientKey: randomUUID(), lineId: bought.line, report: "bought" },
      { database: lane.db },
    );
    expect(await statusOf(bought.line)).toMatchObject({ kind: "closed", outcome: "closed" });
    expect(
      await one(
        `SELECT kind, reason_code, actor_user_id FROM public.pharmacy_line_events WHERE id = $1`,
        [done.id],
      ),
    ).toMatchObject({ kind: "filled_elsewhere", reason_code: "patient", actor_user_id: f.patient });

    const couldNot = await medicine();
    await notSupplied(couldNot.line, "buying_outside");
    const said = await list.reportFromPatient(
      f.patient!,
      { clientKey: randomUUID(), lineId: couldNot.line, report: "could_not_get" },
      { database: lane.db },
    );
    expect(await statusOf(couldNot.line)).toMatchObject({
      kind: "open",
      outcome: "buying_outside",
    });
    const open = async () =>
      (await reviewRead.getOpenLines(f.h!, lane.db, f.pointA!)).rows.find(
        (x) => x.lineId === couldNot.line,
      );
    expect(await open()).toMatchObject({ patientCouldNotGet: true });
    expect((await patientList()).notGiven.find((x) => x.lineId === couldNot.line)).toMatchObject({
      couldNotGet: true,
    });
    const nudged = await one<{ topic: string; payload: { kind: string; ref: string } }>(
      `SELECT topic, payload FROM realtime.messages WHERE topic = 'user:' || $1 ORDER BY id DESC LIMIT 1`,
      [f.doctor],
    );
    expect(nudged.payload).toMatchObject({ kind: "patient_could_not_get", ref: said.id });
    // The pharmacy changes it to owed; the mark clears with the new outcome.
    const changed = await run(
      tech(),
      review.LineInput,
      review.DISPENSE_NEED,
      review.changeOpenOutcome,
      {
        lineId: couldNot.line,
      },
    );
    expect(changed.ok).toBe(true);
    expect(await open()).toMatchObject({ outcome: "owed", patientCouldNotGet: false });
    // A tap on a line that is no longer bought outside is refused in words.
    await expect(
      list.reportFromPatient(
        f.patient!,
        { clientKey: randomUUID(), lineId: couldNot.line, report: "bought" },
        { database: lane.db },
      ),
    ).rejects.toThrow(list.PATIENT_REPORT_COPY.notOpen);
  });

  it("S92: getRefillStatus answers not due, due and overdue from supply events alone", async () => {
    const m = await medicine({ drug: "fixture_pl_refill" });
    await supplyFull(m, 30, 10);
    const now = new Date();
    const status = async (days: number) =>
      (
        await list.getRefillStatus(f.patient!, {
          database: lane.db,
          now: new Date(now.getTime() + days * DAY),
        })
      ).find((s) => s.medicineId === "fixture_pl_refill");
    expect(await status(1)).toMatchObject({ status: "not_due" });
    expect(await status(10)).toMatchObject({ status: "due" });
    expect(await status(12)).toMatchObject({ status: "overdue" });
    // A course code supplied in full also gives a date; a line with neither gives none.
    const course = await medicine({ drug: "fixture_pl_course", duration: "5d" });
    await supplyFull(course, 15);
    const at5 = await list.getRefillStatus(f.patient!, {
      database: lane.db,
      now: new Date(now.getTime() + 5 * DAY),
    });
    expect(at5.find((x) => x.medicineId === "fixture_pl_course")).toMatchObject({ status: "due" });
    const none = await medicine({ drug: "fixture_pl_none" });
    await supplyFull(none, 15);
    expect(
      (await list.getRefillStatus(f.patient!, { database: lane.db })).some(
        (s) => s.medicineId === "fixture_pl_none",
      ),
    ).toBe(false);
  });

  it("S96: in production the list is refused while patient copy is draft or no message name is signed", async () => {
    // The patient copy is signed (13 Oct 2026); templates and the message name are not.
    const prod = await list.patientSurfaces(lane.db, f.h!, true);
    expect(prod.allowed).toBe(false);
    expect(prod.missing).toEqual(["templates", "message_name"]);
    await pg.query(
      `INSERT INTO public.pharmacy_signed_sets (hospital_id, kind, version, content, sha256, status, authored_by)
       VALUES ($1, 'message_name', 1, $2::jsonb, repeat('c', 64), 'draft', $3)`,
      [f.h, JSON.stringify({ name: MESSAGE_NAME }), f.pharmacist],
    );
    // A draft name acts outside production only (Law 8).
    expect(await list.messageNameOf(lane.db, f.h!, false)).toEqual({
      name: MESSAGE_NAME,
      signed: false,
    });
    expect(await list.messageNameOf(lane.db, f.h!, true)).toEqual({ name: null, signed: false });
    expect((await list.patientSurfaces(lane.db, f.h!, true)).missing).toContain("message_name");
    vi.stubEnv("PHARMACY_WORKSPACE", "1");
    vi.stubEnv("PHARMACY_PATIENT_LIST", "1");
    try {
      expect(await list.patientListLive(f.h!, lane.db, false)).toBe(true);
      expect(await list.patientListLive(f.h!, lane.db, true)).toBe(false);
    } finally {
      vi.unstubAllEnvs();
    }
    expect(await list.patientListLive(f.h!, lane.db, false)).toBe(false);
  });

  it("S94: live SMS off sends nothing and says so; on, with approved templates and consent, one message per event to the patient's own number", async () => {
    const owed = await medicine();
    const eventOff = await notSupplied(owed.line, "owed");
    const sender = fakeSender();
    // Off: the owed message is nothing at all (the pharmacy's "Who is told" says so).
    expect(await sendNotice(eventOff, sender)).toBeNull();
    expect(
      await n(
        `SELECT count(*)::int AS n FROM public.pharmacy_patient_notices WHERE line_event_id = $1`,
        [eventOff],
      ),
    ).toBe(0);
    // Off: "Tell the patient it is here" records not sent, in words.
    const tell = (lineId: string, s: SmsSender | null = sender, production = false) =>
      runPharmacyWrite(
        notify.InStockInput,
        { clientKey: randomUUID(), lineId },
        tech(),
        { permission: "pharmacy.dispense", point: "live" },
        (ctx, input) => notify.notifyOwedInStock(ctx, input, s, production),
        { database: lane.db },
      );
    const off = await tell(owed.line);
    expect(off.ok && off.data!.notice).toEqual({
      outcome: "not_sent",
      reason: "sms_off",
      words: REVIEW.message.why.sms_off,
    });
    expect(sender.sent).toHaveLength(0);

    await setLiveSms(true);
    // On, but no approved template: not sent, and why.
    const noTpl = await tell(owed.line);
    expect(noTpl.ok && noTpl.data!.notice.reason).toBe("no_template");
    await template("pharmacy_owed", MESSAGE_COPY.smsOwed);
    await template("pharmacy_buying_outside", MESSAGE_COPY.smsBuyingOutside);
    await template("pharmacy_in_stock", MESSAGE_COPY.inStock);
    // On, templates, but no SMS consent.
    const second = await medicine();
    const ev2 = await notSupplied(second.line, "owed");
    expect(await sendNotice(ev2, sender)).toMatchObject({
      outcome: "not_sent",
      reason: "no_consent",
    });
    await pg.query(
      `INSERT INTO public.consent_records (user_id, consent_type, version, consent_text_sha256)
       VALUES ($1, 'sms_communication', 'v-fixture', repeat('d', 64))`,
      [f.patient],
    );
    // Once per event: the event already has its notice.
    expect(await sendNotice(ev2, sender)).toMatchObject({
      outcome: "not_sent",
      reason: "no_consent",
    });
    const third = await medicine();
    const ev3 = await notSupplied(third.line, "owed");
    expect(await sendNotice(ev3, sender)).toMatchObject({
      outcome: "sent",
      words: REVIEW.message.sent,
    });
    expect(await sendNotice(ev3, sender)).toMatchObject({ outcome: "sent" });
    expect(sender.sent).toEqual([
      {
        toE164: PHONE,
        body: (
          renderMessage("owed", { messageName: MESSAGE_NAME, phone: "+256 700 000000" }) as {
            text: string;
          }
        ).text,
      },
    ]);
    // In stock today: only on a press, only while it is on the shelf here.
    const inStock = await tell(owed.line);
    expect(inStock.ok && inStock.data!.notice.outcome).toBe("sent");
    expect(sender.sent.at(-1)!.body).toBe(
      (renderMessage("in_stock", { messageName: MESSAGE_NAME, phone: null }) as { text: string })
        .text,
    );
    expect(
      (await reviewRead.getOpenLines(f.h!, lane.db, f.pointA!)).rows.find(
        (x) => x.lineId === owed.line,
      ),
    ).toMatchObject({ outcome: "owed", onShelfHere: true });
    const empty = await medicine({}, 0);
    await notSupplied(empty.line, "owed");
    const refused = await tell(empty.line);
    expect(refused).toMatchObject({ ok: false, error: REVIEW.message.notOnShelf });
    // An opt-out by phone is stronger than consent.
    await pg.query(`INSERT INTO public.sms_opt_outs (phone_hmac) VALUES ($1)`, [blindIndex(PHONE)]);
    const fourth = await medicine();
    const ev4 = await notSupplied(fourth.line, "buying_outside");
    expect(await sendNotice(ev4, sender)).toMatchObject({
      outcome: "not_sent",
      reason: "opted_out",
    });
    await pg.query(`DELETE FROM public.sms_opt_outs WHERE phone_hmac = $1`, [blindIndex(PHONE)]);
    // A transport that fails is a failed row and words, never a throw (MS-5).
    const failing: SmsSender = { send: async () => ({ ok: false, reason: "fixture" }) };
    const fifth = await medicine();
    const ev5 = await notSupplied(fifth.line, "owed");
    expect(await sendNotice(ev5, failing)).toMatchObject({
      outcome: "failed",
      reason: "send_failed",
    });
    // Production, with no signed message name: not sent.
    const sixth = await medicine();
    const ev6 = await notSupplied(sixth.line, "owed");
    expect(await sendNotice(ev6, sender, true)).toMatchObject({
      outcome: "not_sent",
      reason: "not_signed",
    });
  });

  it("S95: a restricted-class medicine produces the same message text as any other", async () => {
    const sender = fakeSender();
    const plain = await medicine();
    const restricted = await medicine({ controlled: true });
    for (const m of [plain, restricted]) {
      await run(pharmacist(), review.LineInput, review.REVIEW_NEED, review.acceptLine, {
        lineId: m.line,
      });
      const ev = await notSupplied(m.line, "owed");
      expect(await sendNotice(ev, sender)).toMatchObject({ outcome: "sent" });
    }
    expect(sender.sent).toHaveLength(2);
    expect(sender.sent[0]!.body).toBe(sender.sent[1]!.body);
    expect(bannedTermsScan(sender.sent[1]!.body)).toEqual([]);
  });

  it("S93: every pharmacy template passes the banned-term scan; one naming a medicine, a clinic or a point does not send", async () => {
    const stored = await pg.query<{ body: string }>(
      `SELECT body FROM public.ncd_sms_template WHERE facility_id = $1 AND workspace = 'pharmacy'`,
      [f.h],
    );
    expect(stored.rows.length).toBeGreaterThanOrEqual(3);
    for (const t of stored.rows) expect(bannedTermsScan(t.body), t.body).toEqual([]);
    const sender = fakeSender();
    for (const bad of [
      `Your ${FORMULARY_DRUGS[0]!.generic} is not available at {hospital message name}. Call {phone}.`,
      "Ask at the Fixture diabetes clinic, {hospital message name}, or call {phone}.",
      "Ask at Fixture window point, {hospital message name}, or call {phone}.",
    ]) {
      await pg.query(
        `UPDATE public.ncd_sms_template SET status = 'retired' WHERE facility_id = $1 AND purpose = 'pharmacy_owed'`,
        [f.h],
      );
      await pg.query(
        `INSERT INTO public.ncd_sms_template (facility_id, workspace, purpose, language, body, status, version,
           first_approver, approved_by, approved_at)
         VALUES ($1, 'pharmacy', 'pharmacy_owed', 'en', $2, 'approved', 9, $3, $4, now())`,
        [f.h, bad, f.pharmacist, f.head],
      );
      const m = await medicine();
      const ev = await notSupplied(m.line, "owed");
      expect(await sendNotice(ev, sender)).toMatchObject({
        outcome: "not_sent",
        reason: "banned_term",
      });
      await pg.query(
        `DELETE FROM public.ncd_sms_template WHERE facility_id = $1 AND purpose = 'pharmacy_owed' AND version = 9`,
        [f.h],
      );
    }
    expect(sender.sent).toHaveLength(0);
    // The store refuses a pharmacy purpose under the NCD workspace, and an NCD purpose under pharmacy.
    await expect(
      pg.query(
        `INSERT INTO public.ncd_sms_template (facility_id, workspace, purpose, language) VALUES ($1, 'ncd', 'pharmacy_owed', 'en')`,
        [f.h],
      ),
    ).rejects.toThrow();
    await expect(
      pg.query(
        `INSERT INTO public.ncd_sms_template (facility_id, workspace, purpose, language) VALUES ($1, 'pharmacy', 'missed_visit', 'en')`,
        [f.h],
      ),
    ).rejects.toThrow();
    // The two-approver CHECK stands for pharmacy templates too.
    await expect(
      pg.query(
        `INSERT INTO public.ncd_sms_template (facility_id, workspace, purpose, language, status, first_approver, approved_by)
         VALUES ($1, 'pharmacy', 'pharmacy_in_stock', 'en', 'approved', $2, $2)`,
        [f.h, f.pharmacist],
      ),
    ).rejects.toThrow();
  });
});
