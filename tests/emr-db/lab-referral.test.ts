/**
 * Lab Phase 4, Steps 4–7 on the PGlite lane: partners, send-out, manifests, tracking, lost and cancel, and results
 * back on paper (S1–S3, S5–S11, S14–S18, S20–S26 at the store). Every partner, number, value and range here is
 * synthetic test data; the unit conversion is the signed registry's own (lib/units), never one invented here.
 * Runs with EMR_PGLITE=1.
 */
import { randomUUID } from "node:crypto";
import type { Lane, Pg } from "./_pglite";
import type { EmrActor } from "@/lib/emr/actor";
import type { WriteCtx } from "@/lib/emr/write/context";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { withPatientWrite } from "@/lib/emr/write/context";
import { placeOrders } from "@/lib/emr/write/orders";
import { collectSpecimen, receiveSpecimen } from "@/lib/emr/write/specimens";
import { encrypt, generateKey } from "@/lib/encryption";
import { saveConfigDraft, signConfig } from "@/lib/lab/catalogue-v2";
import { countMonth } from "@/lib/lab/hmis-store";
import { saveMeasure } from "@/lib/lab/measures-setup";
import {
  attachScan,
  checkTranscription,
  openChecks,
  releasePaperResult,
} from "@/lib/lab/referral-results-store";
import {
  addToManifest,
  createAliquot,
  markLost,
  printManifest,
  recordHandover,
  recordManifestReceipt,
  recordOutbreakReferral,
  recordReferralEvent,
  requestCancel,
  savePartner,
  sealManifest,
} from "@/lib/lab/referral-store";
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
const TEST = "test.glucose_fasting";
const key = () => `k-${randomUUID()}`;
const FLAGS = [
  "LAB_WORKSPACE",
  "LAB_UNITS_RANGES",
  "LAB_ONE_MENU",
  "LAB_HIGH_RISK",
  "LAB_REFERRAL",
];

describe.skipIf(!laneOn)("Lab Phase 4 referrals and results back (Steps 4–7)", () => {
  let lane: Lane;
  let pg: Pg;
  let h: string;
  let ward: string;
  let partner: string;
  let abroad: string;
  let outbreak: string;
  const a: Record<string, EmrActor> = {};
  const env = { ...process.env };
  const now = () => new Date();
  const tx = <T>(fn: (t: Parameters<Parameters<Lane["db"]["transaction"]>[0]>[0]) => Promise<T>) =>
    lane.db.transaction(fn);
  const as = <T>(actor: EmrActor, p: string, fn: (ctx: WriteCtx) => Promise<T>) =>
    withPatientWrite(actor, p, fn, { database: lane.db });
  const one = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
    (await pg.query<T>(sql, params)).rows[0] as T;
  const lab = () => ({ userId: a.lab!.userId, hospitalId: h, cadreCode: "LAB_TECHNOLOGIST" });

  /** A received fasting-glucose specimen for a new patient with a profile (synthetic name and date of birth). */
  async function received(receiver: EmrActor = a.lab!) {
    const p = await patient(pg);
    await pg.query(
      `INSERT INTO public.patient_profiles (id, first_name_encrypted, surname_encrypted, sex, date_of_birth, id_type, phone_encrypted, district_id)
       VALUES ($1, $2, $3, 'female', '2000-01-01', 'none', $4, (SELECT id FROM public.districts LIMIT 1))`,
      [p, encrypt("Test"), encrypt("Patient"), encrypt("0700000001")],
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
    await as(receiver, p, (ctx) =>
      receiveSpecimen(ctx, { patientUserId: p, specimenId: sp.id, clientKey: key() }),
    );
    const code = (
      await one<{ code: string }>(
        `SELECT patient_code AS code FROM patient_profiles WHERE id = $1`,
        [p],
      )
    ).code;
    return { p, enc, orderId: order.id, specimenId: sp.id, code };
  }
  const signed = async (
    kind: string,
    k: string,
    payload: unknown,
    signer: EmrActor,
    as2: "lead" | "dp_lead" | "ipc_lead",
    author = a.lead2!,
  ) => {
    const id = await tx((t) =>
      saveConfigDraft(
        t,
        { userId: author.userId, hospitalId: h },
        { kind: kind as never, key: k, payload },
        now(),
      ),
    );
    await tx((t) =>
      signConfig(
        t,
        { userId: signer.userId, hospitalId: h, as: as2 },
        { configId: id, exceptionNote: null },
        now(),
      ),
    );
    return id;
  };
  const send = (
    specimenId: string,
    o: {
      partnerId?: string;
      ids?: Record<string, string>;
      packing?: string[];
      consent?: string | null;
    } = {},
  ) =>
    tx((t) =>
      addToManifest(
        t,
        lab(),
        {
          partnerId: o.partnerId ?? partner,
          transport: "their courier",
          items: [
            {
              specimenId,
              externalIds: o.ids ?? { form: `TEST-RL-${randomUUID().slice(0, 6)}` },
              packing: o.packing ?? ["triple", "forms"],
              consentRef: o.consent ?? null,
            },
          ],
          clientKey: key(),
        },
        now(),
      ),
    );
  const referralOf = (specimenId: string) =>
    one<{
      id: string;
      state: string;
      number: string;
      sent_at: Date | null;
      cancel_requested: boolean;
    }>(
      `SELECT id, state, number, sent_at, cancel_requested FROM lab_referrals WHERE specimen_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [specimenId],
    );

  beforeAll(async () => {
    process.env.MEDSYNC_PHI_KEY ??= generateKey();
    for (const k of FLAGS) process.env[k] = "1";
    lane = await bootLane();
    pg = lane.pg;
    h = await hospital(pg, "Referrals");
    ward = await department(pg, h, "Ward");
    const labDept = await department(pg, h, "Laboratory");
    await pg.query(`UPDATE hospital_departments SET catalogue_code = 'LABORATORY' WHERE id = $1`, [
      labDept,
    ]);
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
            labPermissions: [
              "lab.view",
              "lab.receive",
              "lab.result.enter",
              "lab.result.release",
              "lab.manage",
              "lab.refer",
              "lab.refer.result",
            ],
          }
        : {}),
    });
    a.doctor = await make(ward, "MEDICAL_OFFICER", "doctor");
    a.nurse = await make(ward, "NURSE", "nurse");
    a.lab = await make(labDept, "LAB_TECHNOLOGIST", "lab");
    a.checker = await make(labDept, "LAB_TECHNOLOGIST", "lab");
    a.lead = await make(labDept, "LAB_TECHNOLOGIST", "lab");
    a.lead2 = await make(labDept, "LAB_TECHNOLOGIST", "lab");
    a.dp = await make(ward, "MEDICAL_OFFICER", "doctor");
    await pg.query(
      `INSERT INTO department_heads (hospital_id, department_id, user_id, acting) VALUES ($1, $2, $3, false), ($1, $2, $4, true)`,
      [h, labDept, a.lead.userId, a.lead2.userId],
    );
    await pg.query(
      `INSERT INTO hospital_designations (hospital_id, role, user_id, starts_on, set_by) VALUES ($1, 'data_protection_lead', $2, current_date - 1, $2)`,
      [h, a.dp.userId],
    );
    // The test is referred today (the hub), and has a measure in mmol/L (Phase 1's registry).
    await pg.query(
      `INSERT INTO diagnostic_offerings (hospital_id, kind, code, provision, stated_tat, referred_to, confirmed_at)
       VALUES ($1, 'lab', 'TEST-OFFER', 'referred', 'test', 'Test reference lab', now())`,
      [h],
    );
    await pg.query(
      `INSERT INTO lab_test_services (hospital_id, test_code, offering_code, set_by) VALUES ($1, $2, 'TEST-OFFER', $3)`,
      [h, TEST, a.lead.userId],
    );
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
        now(),
      ),
    );
    // Partners and their signed configuration (synthetic codes and items; no turnaround stated for one).
    const p = (name: string, kind: "private_lab" | "abroad" | "outbreak") =>
      tx((t) =>
        savePartner(
          t,
          { userId: a.lead!.userId, hospitalId: h },
          {
            name,
            kind,
            contacts: [],
            transport: [{ code: "courier", words: "Their courier" }],
            resultsReturn: [{ channel: "paper", words: "Paper with the courier" }],
            active: true,
          },
          now(),
        ),
      );
    partner = await p("Reference lab A (test)", "private_lab");
    abroad = await p("Lab abroad (test)", "abroad");
    outbreak = await p("Outbreak destination (test)", "outbreak");
    for (const pid of [partner, abroad]) {
      await signed(
        "partner_tests",
        pid,
        {
          tests: [
            {
              testCode: TEST,
              theirCode: "TEST-CODE",
              category: "serum",
              turnaround: { value: 2, unit: "days" },
              requiredIds: [{ key: "form", words: "Their form number", symbologies: ["code128"] }],
            },
          ],
          holidays: [],
          source: { doc: "Test price list", date: "2026-10-01" },
        },
        a.lead!,
        "lead",
      );
      await signed(
        "partner_packing",
        `${pid}:serum`,
        {
          category: "serum",
          items: [
            { key: "triple", words: "Triple packaging" },
            { key: "forms", words: "Forms outside the tubes" },
          ],
          source: { doc: "WHO 2025–2026", date: "2026-10-01" },
        },
        a.lead!,
        "lead",
      );
      await signed(
        "partner_legal",
        pid,
        {
          basis: "s7_2_d",
          agreement: { ref: "TEST-AGR", signedOn: "2026-01-01", reviewOn: "2027-12-31" },
          processorTerms: true,
          crossBorder: pid === abroad,
          perPatientConsent: pid === abroad,
          pdpo: { ref: "TEST-PDPO", renewOn: "2027-12-31" },
          breachContact: "Test DP officer",
        },
        a.dp!,
        "dp_lead",
        a.lead!,
      );
      await signed(
        "partner_fields",
        pid,
        {
          fields: ["hospital_number", "name", "birth_date", "lab_number"],
          clinicalQuestion: false,
        },
        a.dp!,
        "dp_lead",
        a.lead!,
      );
    }
  }, 300_000);
  afterAll(() => {
    for (const k of FLAGS) process.env[k] = env[k];
  });

  it("S2 A4 the legal record is signed by the data protection lead only, never by the lab lead", async () => {
    const id = await tx((t) =>
      saveConfigDraft(
        t,
        { userId: a.lead!.userId, hospitalId: h },
        {
          kind: "partner_fields",
          key: outbreak,
          payload: { fields: ["lab_number"], clinicalQuestion: false },
        },
        now(),
      ),
    );
    await expect(
      tx((t) =>
        signConfig(
          t,
          { userId: a.lead2!.userId, hospitalId: h, as: "lead" },
          { configId: id, exceptionNote: null },
          now(),
        ),
      ),
    ).rejects.toThrow(/data protection lead signs/);
    await expect(
      tx((t) =>
        signConfig(
          t,
          { userId: a.lead2!.userId, hospitalId: h, as: "dp_lead" },
          { configId: id, exceptionNote: null },
          now(),
        ),
      ),
    ).rejects.toThrow(/not designated/);
  });

  it("S5 RF-6 Add to manifest refuses until every identifier and packing item is done, then seals and prints", async () => {
    const r = await received();
    await expect(send(r.specimenId, { ids: {} })).rejects.toThrow(
      /Scan 1 more form numbers and tick 0 packing items first/,
    );
    await expect(send(r.specimenId, { packing: ["triple"] })).rejects.toThrow(
      /tick 1 packing items/,
    );
    const m = await send(r.specimenId);
    const ref = await referralOf(r.specimenId);
    expect(ref).toMatchObject({ state: "draft" });
    expect(ref.number).toMatch(/^RF-\d{4}-0001$/);
    await expect(tx((t) => printManifest(t, lab(), { manifestId: m }, now()))).rejects.toThrow(
      /Seal the manifest/,
    );
    await tx((t) => sealManifest(t, lab(), { manifestId: m, packages: 1 }, now()));
    expect((await referralOf(r.specimenId)).state).toBe("packed");
    // S6 MF-4: the first print is the original; a reprint is a copy.
    expect(await tx((t) => printManifest(t, lab(), { manifestId: m }, now()))).toEqual({
      copy: false,
    });
    expect(await tx((t) => printManifest(t, lab(), { manifestId: m }, now()))).toEqual({
      copy: true,
    });
    // MF-3: a sealed manifest takes nothing more.
    const r2 = await received();
    const m2 = await send(r2.specimenId);
    expect(m2).not.toBe(m);
    // S7: handover moves every referral on it to handed over, with the rider's name.
    await tx((t) =>
      recordHandover(t, lab(), { manifestId: m, handedTo: "Test rider", handedAt: now() }, now()),
    );
    const sent = await referralOf(r.specimenId);
    expect(sent.state).toBe("handed_over");
    expect(sent.sent_at).not.toBeNull();
  });

  it("S8 RF-2 one tube to two destinations needs an aliquot with its own lab number", async () => {
    const r = await received();
    await send(r.specimenId);
    await expect(
      send(r.specimenId, { partnerId: abroad, consent: "TEST-CONSENT" }),
    ).rejects.toThrow(/make an aliquot/);
    const child = await tx((t) => createAliquot(t, lab(), { specimenId: r.specimenId }, now()));
    const row = await one<{ label_no: string; parent_specimen_id: string }>(
      `SELECT label_no, parent_specimen_id FROM specimens WHERE id = $1`,
      [child],
    );
    expect(row.parent_specimen_id).toBe(r.specimenId);
    expect(row.label_no).toMatch(/^L\d{8}$/);
    await send(child, { partnerId: abroad, consent: "TEST-CONSENT" });
    expect(
      (
        await one<{ n: number }>(
          `SELECT count(*)::int AS n FROM lab_referrals WHERE specimen_id IN ($1, $2)`,
          [r.specimenId, child],
        )
      ).n,
    ).toBe(2);
  });

  it("S3 D-LAB4-22 a partner abroad is refused without the patient's consent on the referral", async () => {
    const r = await received();
    await expect(send(r.specimenId, { partnerId: abroad, consent: null })).rejects.toThrow(
      /consent or the safeguards/,
    );
  });

  it("S9 RF-7 a high-risk specimen never goes routine; its outbreak referral records who was told", async () => {
    const r = await received();
    await pg.query(
      `INSERT INTO lab_high_risk_events (encounter_id, hospital_id, patient_user_id, kind, source, reason, actor_user_id)
       VALUES ($1, $2, $3, 'flag', 'manual', 'Test reason', $4)`,
      [r.enc, h, r.p, a.lab!.userId],
    );
    await expect(send(r.specimenId)).rejects.toThrow(
      /high-risk specimen never goes on a routine manifest/,
    );
    const base = { specimenId: r.specimenId, handedAt: now(), note: null, clientKey: key() };
    await expect(
      tx((t) =>
        recordOutbreakReferral(
          t,
          lab(),
          { ...base, partnerId: outbreak, informed: { ipcLead: "", surveillanceFocal: "x" } },
          now(),
        ),
      ),
    ).rejects.toThrow(/Record who was informed/);
    await expect(
      tx((t) =>
        recordOutbreakReferral(
          t,
          lab(),
          {
            ...base,
            partnerId: partner,
            informed: { ipcLead: "IPC (test)", surveillanceFocal: "DSFP (test)" },
          },
          now(),
        ),
      ),
    ).rejects.toThrow(/outbreak destination/);
    const id = await tx((t) =>
      recordOutbreakReferral(
        t,
        lab(),
        {
          ...base,
          partnerId: outbreak,
          informed: { ipcLead: "IPC (test)", surveillanceFocal: "DSFP (test)" },
        },
        now(),
      ),
    );
    expect(await one(`SELECT routine, state FROM lab_referrals WHERE id = $1`, [id])).toEqual({
      routine: false,
      state: "handed_over",
    });
  });

  it("S11 MF-3 a manifest received with a broken tube is a discrepancy and opens a nonconformity", async () => {
    const r = await received();
    const m = await send(r.specimenId);
    await tx((t) => sealManifest(t, lab(), { manifestId: m, packages: 1 }, now()));
    await tx((t) =>
      recordHandover(t, lab(), { manifestId: m, handedTo: "Test rider", handedAt: now() }, now()),
    );
    const ref = await referralOf(r.specimenId);
    await tx((t) =>
      recordManifestReceipt(
        t,
        lab(),
        {
          manifestId: m,
          how: "phone",
          receivedBy: "Their reception (test)",
          receivedAt: now(),
          condition: ["broken"],
          count: 1,
          affected: [ref.id],
          note: null,
        },
        now(),
      ),
    );
    expect(
      (await one<{ state: string }>(`SELECT state FROM lab_manifests WHERE id = $1`, [m])).state,
    ).toBe("discrepancy");
    expect(
      (
        await one<{ n: number }>(
          `SELECT count(*)::int AS n FROM lab_nonconformities WHERE hospital_id = $1 AND source = 'manifest'`,
          [h],
        )
      ).n,
    ).toBe(1);
  });

  it("S14, S15, EX-7 updates record who said so; a status dated earlier than the last applied is kept, not applied", async () => {
    const r = await received();
    const m = await send(r.specimenId);
    await tx((t) => sealManifest(t, lab(), { manifestId: m, packages: 1 }, now()));
    await expect(
      tx((t) =>
        recordHandover(
          t,
          lab(),
          { manifestId: m, handedTo: "Test rider", handedAt: new Date(Date.now() - 86_400_000) },
          now(),
        ),
      ),
    ).rejects.toThrow(/before the manifest was sealed/);
    await tx((t) =>
      recordHandover(t, lab(), { manifestId: m, handedTo: "Test rider", handedAt: now() }, now()),
    );
    const ref = await referralOf(r.specimenId);
    const ev = (kind: "at_hub" | "in_progress" | "received_by_lab", minutesAhead: number) =>
      tx((t) =>
        recordReferralEvent(
          t,
          lab(),
          {
            referralId: ref.id,
            kind,
            eventAt: new Date(Date.now() + minutesAhead * 60_000),
            document: "rider_log",
            reasonCode: null,
            note: null,
          },
          now(),
        ),
      );
    expect(await ev("in_progress", 2)).toEqual({ applied: true });
    // Arrives after it, dated before it: kept and shown, never moves the referral back.
    expect(await ev("at_hub", 1)).toEqual({ applied: false });
    expect((await referralOf(r.specimenId)).state).toBe("in_progress");
    const rows = (
      await pg.query<{
        kind: string;
        applied: boolean;
        document: string | null;
        actor_user_id: string | null;
      }>(
        `SELECT kind, applied, document, actor_user_id FROM lab_referral_events WHERE referral_id = $1 ORDER BY seq`,
        [ref.id],
      )
    ).rows;
    expect(rows.at(-1)).toEqual({
      kind: "at_hub",
      applied: false,
      document: "rider_log",
      actor_user_id: a.lab!.userId,
    });
  });

  it("S16 RF-9 rejected by the reference lab needs a reason and is terminal", async () => {
    const r = await received();
    const m = await send(r.specimenId);
    await tx((t) => sealManifest(t, lab(), { manifestId: m, packages: 1 }, now()));
    await tx((t) =>
      recordHandover(t, lab(), { manifestId: m, handedTo: "Test rider", handedAt: now() }, now()),
    );
    const ref = await referralOf(r.specimenId);
    const reject = (reasonCode: string | null) =>
      tx((t) =>
        recordReferralEvent(
          t,
          lab(),
          {
            referralId: ref.id,
            kind: "rejected",
            eventAt: now(),
            document: "their_paper",
            reasonCode,
            note: null,
          },
          now(),
        ),
      );
    await expect(reject(null)).rejects.toThrow(/Say why/);
    await reject("haemolysed");
    expect((await referralOf(r.specimenId)).state).toBe("rejected");
  });

  it("S17, S18 RF-8 cancel after handover is a request; RF-10 lost needs a call note and opens a nonconformity", async () => {
    const r = await received();
    const m = await send(r.specimenId);
    await tx((t) => sealManifest(t, lab(), { manifestId: m, packages: 1 }, now()));
    await tx((t) =>
      recordHandover(t, lab(), { manifestId: m, handedTo: "Test rider", handedAt: now() }, now()),
    );
    const ref = await referralOf(r.specimenId);
    await tx((t) =>
      requestCancel(t, lab(), { referralId: ref.id, note: "Doctor asked by phone (test)" }, now()),
    );
    expect(await referralOf(r.specimenId)).toMatchObject({
      state: "handed_over",
      cancel_requested: true,
    });
    const lab2 = { ...lab(), canRefer: true };
    await expect(
      tx((t) => markLost(t, lab2, { referralId: ref.id, callNote: "" }, now())),
    ).rejects.toThrow(/Record the call/);
    await tx((t) =>
      markLost(
        t,
        lab2,
        { referralId: ref.id, callNote: "Called the hub coordinator (test): not seen" },
        now(),
      ),
    );
    expect((await referralOf(r.specimenId)).state).toBe("lost");
    expect(
      (
        await one<{ n: number }>(
          `SELECT count(*)::int AS n FROM lab_nonconformities WHERE hospital_id = $1 AND source = 'referral'`,
          [h],
        )
      ).n,
    ).toBe(1);
  });

  it("S28 HM-14, HM-16 10.4 comes from referral records from the month the lab lead declares", async () => {
    const r = await received();
    const m = await send(r.specimenId);
    await tx((t) => sealManifest(t, lab(), { manifestId: m, packages: 1 }, now()));
    await tx((t) =>
      recordHandover(t, lab(), { manifestId: m, handedTo: "Test rider", handedAt: now() }, now()),
    );
    const month = new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 7);
    const mapping = {
      rows: [{ code: "VS02", sources: [{ testCode: TEST }] }],
      visits: {},
      specimenColumns: {},
      rejection: {},
      reasons: {},
      hivTests: [],
      kits: {},
      kitItems: {},
      purposes: {},
      tracers: {},
      excluded: [],
    };
    // Before the declaration: 10.4 stays as typed by hand.
    const before = await tx((t) =>
      countMonth(t, h, month, mapping, { "VS02|No. of Specimen Referred": 99 }),
    );
    expect(before.cells["VS02|No. of Specimen Referred"]).toEqual({
      value: 99,
      sources: [],
      manual: true,
    });
    const ops = await tx((t) =>
      saveConfigDraft(
        t,
        { userId: a.lead!.userId, hospitalId: h },
        {
          kind: "referral_ops",
          key: "settings",
          payload: {
            presenceMinutes: 30,
            stopSendingDaysAfterReview: 30,
            hmis104RecordsFrom: month,
          },
        },
        now(),
      ),
    );
    await tx((t) =>
      signConfig(
        t,
        { userId: a.lead2!.userId, hospitalId: h, as: "lead" },
        { configId: ops, exceptionNote: null },
        now(),
      ),
    );
    const after = await tx((t) =>
      countMonth(t, h, month, mapping, { "VS02|No. of Specimen Referred": 99 }),
    );
    const referred = after.cells["VS02|No. of Specimen Referred"]!;
    expect(referred.manual).toBeUndefined();
    expect(referred.sources).toContain((await referralOf(r.specimenId)).id);
    expect(after.manualIgnored).toContain("VS02|No. of Specimen Referred");
    expect(after.cells["VS02|No. of Pending Results/Feedback"]!.value).toBeGreaterThanOrEqual(1);
  });

  describe("results back on paper (S20–S26)", () => {
    const sentOut = async () => {
      const r = await received();
      const form = `TEST-RL-${randomUUID().slice(0, 6)}`;
      const m = await send(r.specimenId, { ids: { form } });
      await tx((t) => sealManifest(t, lab(), { manifestId: m, packages: 1 }, now()));
      await tx((t) =>
        recordHandover(t, lab(), { manifestId: m, handedTo: "Test rider", handedAt: now() }, now()),
      );
      const ref = await referralOf(r.specimenId);
      return { ...r, form, referralId: ref.id };
    };
    const scan = (referralId: string) =>
      tx((t) =>
        attachScan(
          t,
          lab(),
          {
            referralId,
            path: `${h}/${referralId}/${randomUUID()}.pdf`,
            sha256: "a".repeat(64),
            bytes: 1000,
            mime: "application/pdf",
            theirReport: "TEST-RPT",
          },
          now(),
        ),
      );
    const release = (
      s: Awaited<ReturnType<typeof sentOut>>,
      o: Partial<Parameters<typeof releasePaperResult>[1]> = {},
    ) =>
      as(a.lab!, s.p, (ctx) =>
        releasePaperResult(ctx, {
          referralId: s.referralId,
          theirNumber: s.form,
          name: "PATIENT, Test",
          birthDate: "01/01/2000",
          theirReport: "TEST-RPT",
          reportedAt: "17 OCT 2026 10:00",
          authorisedBy: "Senior technologist (test)",
          components: [
            {
              conceptId: "obs.glucose",
              value: "90",
              unitAsPrinted: "mg/dL",
              rangeAsPrinted: "70 - 100",
            },
          ],
          checkedByUserId: null,
          scanConfirmed: false,
          calledWard: null,
          clientKey: key(),
          ...o,
        }),
      );

    it('S23, S25 alone on duty: no printed range gives no flag; released "Entered by one person" with a check task', async () => {
      const s = await sentOut();
      await scan(s.referralId);
      const r = await release(s, {
        components: [
          { conceptId: "obs.glucose", value: "5", unitAsPrinted: "mmol/L", rangeAsPrinted: null },
        ],
      });
      if ("waitingItemId" in r) throw new Error("unexpected mismatch");
      expect(r.oneEntrant).toBe(true);
      expect(r.notes).toContain("Entered by one person. A second check is due.");
      expect(r.notes).toContain("No range printed.");
      const snap = await one<{ flag_computed: string | null; unit_ucum: string }>(
        `SELECT flag_computed, unit_ucum FROM lab_result_snapshots WHERE report_id = $1`,
        [r.id],
      );
      expect(snap).toEqual({ flag_computed: null, unit_ucum: "mmol/L" });
      expect(
        await one(`SELECT trust, verified_by_user_id FROM diagnostic_reports WHERE id = $1`, [
          r.id,
        ]),
      ).toEqual({ trust: 3, verified_by_user_id: null });
      expect((await tx((t) => openChecks(t, h))).map((c) => c.reportId)).toContain(r.id);
      await expect(
        tx((t) =>
          checkTranscription(
            t,
            lab(),
            { reportId: r.id, scanConfirmed: true, differs: false, note: null },
            now(),
          ),
        ),
      ).rejects.toThrow(/Someone other/);
      await expect(
        tx((t) =>
          checkTranscription(
            t,
            { userId: a.checker!.userId, hospitalId: h },
            { reportId: r.id, scanConfirmed: false, differs: false, note: null },
            now(),
          ),
        ),
      ).rejects.toThrow(/Confirm the scan/);
      await tx((t) =>
        checkTranscription(
          t,
          { userId: a.checker!.userId, hospitalId: h },
          { reportId: r.id, scanConfirmed: true, differs: false, note: null },
          now(),
        ),
      );
      expect((await tx((t) => openChecks(t, h))).map((c) => c.reportId)).not.toContain(r.id);
    });

    it("S20 RB-1, RB-3, RB-4, RB-7 with a second person on duty: their check, our unit by the registry, their range", async () => {
      const s = await sentOut();
      await scan(s.referralId);
      await received(a.checker!); // the checker is now active in the lab
      await expect(release(s)).rejects.toThrow(/second person is on duty/);
      await expect(
        release(s, { checkedByUserId: a.checker!.userId, scanConfirmed: false }),
      ).rejects.toThrow(/second person is on duty/);
      const r = await release(s, { checkedByUserId: a.checker!.userId, scanConfirmed: true });
      if ("waitingItemId" in r) throw new Error("unexpected mismatch");
      expect(r.oneEntrant).toBe(false);
      const rep = await one<{
        order_id: string;
        performer: string;
        entry_mode: string;
        referral_id: string;
        status: string;
        trust: number;
        provenance: Record<string, unknown>;
      }>(
        `SELECT order_id, performer, entry_mode, referral_id, status, trust, provenance FROM diagnostic_reports WHERE id = $1`,
        [r.id],
      );
      expect(rep).toMatchObject({
        order_id: s.orderId,
        performer: "external",
        entry_mode: "transcribed",
        referral_id: s.referralId,
        status: "final",
        trust: 4,
      });
      expect(rep.provenance).toMatchObject({
        partner: "Reference lab A (test)",
        theirReport: "TEST-RPT",
        oneEntrant: false,
        checkedBy: a.checker!.userId,
      });
      const snap = await one<{
        range_source: string;
        range_state: string;
        unit_ucum: string;
        flag_computed: string;
        printed: Record<string, unknown>;
        range_low: string | null;
      }>(
        `SELECT range_source, range_state, unit_ucum, flag_computed, printed, range_low FROM lab_result_snapshots WHERE report_id = $1`,
        [r.id],
      );
      expect(snap).toMatchObject({
        range_source: "performing_lab",
        range_state: "performing_lab",
        unit_ucum: "mmol/L",
        flag_computed: "normal",
        range_low: null,
      });
      expect(snap.printed).toMatchObject({ value: "90", unit: "mg/dL", range: "70 - 100" });
      expect(
        (
          await one<{ n: number }>(
            `SELECT count(*)::int AS n FROM encounter_orders WHERE encounter_id = $1`,
            [s.enc],
          )
        ).n,
      ).toBe(1);
      expect((await referralOf(s.specimenId)).state).toBe("completed");
    });

    it("S21 RB-2 a different name on the paper refuses entry and opens a reconciliation item with no values", async () => {
      const s = await sentOut();
      await scan(s.referralId);
      const r = await release(s, { name: "Other Person" });
      expect(r).toHaveProperty("waitingItemId");
      const item = await one<{
        reason: string;
        state: string;
        comparison: { check: string; outcome: string }[];
      }>(`SELECT reason, state, comparison FROM lab_match_items WHERE candidate_referral_id = $1`, [
        s.referralId,
      ]);
      expect(item).toMatchObject({ reason: "demographics_disagree", state: "waiting" });
      expect(item.comparison).toContainEqual({ check: "name", outcome: "differs" });
      expect(JSON.stringify(item)).not.toMatch(/Other Person|Patient|2000/);
      // Nothing was filed on the order.
      expect(
        (
          await one<{ n: number }>(
            `SELECT count(*)::int AS n FROM diagnostic_reports WHERE referral_id = $1`,
            [s.referralId],
          )
        ).n,
      ).toBe(0);
    });

    it("S22 RB-3 a unit the registry does not know blocks release", async () => {
      const s = await sentOut();
      await scan(s.referralId);
      await expect(
        release(s, {
          components: [
            {
              conceptId: "obs.glucose",
              value: "5",
              unitAsPrinted: "odd-unit",
              rangeAsPrinted: null,
            },
          ],
          checkedByUserId: a.checker!.userId,
          scanConfirmed: true,
        }),
      ).rejects.toThrow(/not in this hospital's unit list/);
    });
  });
});
