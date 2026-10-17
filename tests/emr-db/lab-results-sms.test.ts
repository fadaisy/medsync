/**
 * Lab Phase 5, Step 8 on the PGlite lane: the results-ready SMS (S39–S43), with a fake transport that records what
 * it was asked to send. Times are fixed Kampala clock times on later days. The template and release table are
 * FIXTURES, signed as the product requires. Runs with EMR_PGLITE=1.
 */
import { randomUUID } from "node:crypto";
import type { Lane, Pg } from "./_pglite";
import type { EmrActor } from "@/lib/emr/actor";
import type { WriteCtx } from "@/lib/emr/write/context";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { withPatientWrite } from "@/lib/emr/write/context";
import { placeOrders } from "@/lib/emr/write/orders";
import { acknowledgeResults, enterResults, releaseResults } from "@/lib/emr/write/results";
import { collectSpecimen, receiveSpecimen } from "@/lib/emr/write/specimens";
import { blindIndex, encrypt, generateKey } from "@/lib/encryption";
import { saveConfigDraft, signConfig } from "@/lib/lab/catalogue-v2";
import { saveMeasure } from "@/lib/lab/measures-setup";
import { enqueueResultsReady, sendResultsReady } from "@/lib/notify/results-ready-store";
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

const FLAGS = ["LAB_WORKSPACE", "LAB_UNITS_RANGES", "PATIENT_RESULTS", "PATIENT_RESULTS_SMS"];
const key = () => `k-${randomUUID()}`;
const RULES = {
  groups: {
    routine: { inApp: "after_review", sms: true },
    critical: { inApp: "after_told", sms: false },
    referred: { inApp: "after_review", sms: true },
    bedside: { inApp: "after_review", sms: false },
    corrected: { inApp: "after_review", sms: false },
  },
  holdMaxDays: 30,
  agedWindowDays: 7,
  source: { doc: "Fixture release table", date: "2026-10-17" },
};

describe.skipIf(!laneOn)("Lab Phase 5 results-ready SMS (S39–S43)", () => {
  let lane: Lane;
  let pg: Pg;
  let h: string;
  let ward: string;
  const a: Record<string, EmrActor> = {};
  const env = { ...process.env };
  const ids: Record<string, string> = {};
  const people: Record<string, string> = {};
  const tx = <T>(fn: (t: Parameters<Parameters<Lane["db"]["transaction"]>[0]>[0]) => Promise<T>) =>
    lane.db.transaction(fn);
  const as = <T>(actor: EmrActor, p: string, fn: (ctx: WriteCtx) => Promise<T>) =>
    withPatientWrite(actor, p, fn, { database: lane.db });
  const one = async <T = Record<string, unknown>>(q: string, params: unknown[] = []) =>
    (await pg.query<T>(q, params)).rows[0] as T;
  const testId = async (code: string) =>
    (
      await one<{ id: string }>(
        `SELECT id FROM test_catalogue WHERE code = $1 AND hospital_id IS NULL`,
        [code],
      )
    ).id;
  const sign = async (kind: string, k: string, payload: unknown) => {
    const id = await tx((t) =>
      saveConfigDraft(
        t,
        { userId: a.lead2!.userId, hospitalId: h },
        { kind: kind as never, key: k, payload },
        new Date(),
      ),
    );
    await tx((t) =>
      signConfig(
        t,
        { userId: a.lead!.userId, hospitalId: h, as: "lead" },
        { configId: id, exceptionNote: null },
        new Date(),
      ),
    );
    await tx((t) =>
      signConfig(
        t,
        { userId: a.cso!.userId, hospitalId: h, as: "cso" },
        { configId: id, exceptionNote: null },
        new Date(),
      ),
    );
  };
  async function person(dob: string, first: string) {
    const p = await patient(pg);
    await pg.query(
      `INSERT INTO patient_profiles (id, first_name_encrypted, surname_encrypted, sex, date_of_birth, id_type, phone_encrypted, district_id)
       VALUES ($1, $2, $3, 'female', $4, 'none', $5, (SELECT id FROM districts LIMIT 1))`,
      [p, encrypt(first), encrypt("Fixture"), dob, encrypt("0700000001")],
    );
    await intake(pg, { hospitalId: h, patientUserId: p });
    return p;
  }
  const consent = (p: string) =>
    pg.query(
      `INSERT INTO consent_records (user_id, consent_type, version, consent_text_sha256) VALUES ($1, 'results_in_app', 'fx', $2)`,
      [p, "a".repeat(64)],
    );
  /** An order of `code` for `p`, received; with `values`, entered and released (final). */
  async function result(p: string, code: string, values?: Record<string, string>) {
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
          { clientKey: key(), testId: ids[code]!, priority: "routine", reasonText: "Check" },
        ],
      }),
    );
    if (!values) return { orderId: order.id, reportId: "" };
    const sp = await as(a.nurse!, p, (ctx) =>
      collectSpecimen(ctx, {
        patientUserId: p,
        orderId: order.id,
        identifiersConfirmed: true,
        collectedAt: new Date(),
        clientKey: key(),
      }),
    );
    await as(a.lab!, p, (ctx) =>
      receiveSpecimen(ctx, { patientUserId: p, specimenId: sp.id, clientKey: key() }),
    );
    const r = await as(a.lab!, p, (ctx) =>
      enterResults(ctx, {
        patientUserId: p,
        orderId: order.id,
        status: "preliminary",
        values: Object.entries(values).map(([conceptId, value]) => ({ conceptId, value })),
        clientKey: key(),
      }),
    );
    const released = await as(a.lab!, p, (ctx) =>
      releaseResults(ctx, { patientUserId: p, reportId: r.id, clientKey: key() }),
    );
    return { orderId: order.id, reportId: released.id };
  }
  const review = (p: string, reportId: string) =>
    as(a.doctor!, p, (ctx) =>
      acknowledgeResults(ctx, {
        patientUserId: p,
        items: [{ reportId, action: "seen" }],
        clientKey: key(),
      }),
    );
  const sent: { to: string; body: string }[] = [];
  let failNext = false;
  const sender = {
    send: async ({ toE164, body }: { toE164: string; body: string }) => {
      if (failNext) return { ok: false as const, reason: "provider_down" };
      sent.push({ to: toE164, body });
      return { ok: true as const, providerMessageId: `fx-${sent.length}` };
    },
  };
  /** A Kampala clock time `days` days from today (UTC+3). */
  const kampala = (days: number, hour: number) => {
    const d = new Date();
    return new Date(
      Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + days, hour - 3, 0, 0),
    );
  };
  const rows = (p: string) =>
    pg
      .query<{
        id: string;
        state: string;
        payload: { reports: string[]; attempts?: number };
        scheduled_at: Date;
        failure_reason: string | null;
      }>(
        `SELECT id, state, payload, scheduled_at, failure_reason FROM notification_dispatches
        WHERE kind = 'results_ready' AND related_id = $1 ORDER BY created_at`,
        [p],
      )
      .then((r) => r.rows);
  const visible = async (p: string, value: string) => {
    const r = await result(p, "test.creatinine", { "obs.creatinine": value });
    await review(p, r.reportId);
    return r.reportId;
  };
  const TEMPLATE =
    "{Hospital}: you have new results in MedSync. Open the app, or ask at your next visit. Reply STOP to stop these messages.";

  beforeAll(async () => {
    process.env.MEDSYNC_PHI_KEY ??= generateKey();
    for (const k of FLAGS) process.env[k] = "1";
    lane = await bootLane();
    pg = lane.pg;
    h = await hospital(pg, "Results");
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
            ],
          }
        : {}),
    });
    a.doctor = await make(ward, "MEDICAL_OFFICER", "doctor");
    a.nurse = await make(ward, "NURSE", "nurse");
    a.lab = await make(labDept, "LAB_TECHNOLOGIST", "lab");
    a.lead = await make(labDept, "LAB_TECHNOLOGIST", "lab");
    a.lead2 = await make(labDept, "LAB_TECHNOLOGIST", "lab");
    a.cso = await make(ward, "CONSULTANT", "doctor");
    await pg.query(
      `INSERT INTO department_heads (hospital_id, department_id, user_id, acting) VALUES ($1, $2, $3, false), ($1, $2, $4, true)`,
      [h, labDept, a.lead.userId, a.lead2.userId],
    );
    await pg.query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'superadmin')`, [
      a.cso.userId,
    ]);
    for (const c of ["test.creatinine", "test.hiv_viral_load", "test.pregnancy_urine", "test.esr"])
      ids[c] = await testId(c);
    await tx((t) =>
      saveMeasure(
        t,
        { userId: a.lead!.userId, hospitalId: h },
        {
          testId: ids["test.creatinine"]!,
          conceptId: "obs.creatinine",
          draft: {
            resultType: "number",
            unitUcum: "umol/L",
            unitDisplay: "µmol/L",
            decimalPlaces: 0,
            loincCode: null,
            entryCheckLow: null,
            entryCheckHigh: null,
          },
        },
        new Date(),
      ),
    );
    await tx((t) =>
      saveMeasure(
        t,
        { userId: a.lead!.userId, hospitalId: h },
        {
          testId: ids["test.hiv_viral_load"]!,
          conceptId: "obs.hiv_viral_load",
          draft: {
            resultType: "number",
            unitUcum: "{copies}/mL",
            unitDisplay: "copies/mL",
            decimalPlaces: 0,
            loincCode: null,
            entryCheckLow: null,
            entryCheckHigh: null,
          },
        },
        new Date(),
      ),
    );
    // A FIXTURE range (50 to 100), signed by a lead and a CSO.
    const v = await one<{ id: string }>(
      `INSERT INTO reference_range_versions (hospital_id, test_id, concept_id, unit_ucum, version, authored_by)
       VALUES ($1, $2, 'obs.creatinine', 'umol/L', 1, $3) RETURNING id`,
      [h, ids["test.creatinine"], a.lab.userId],
    );
    await pg.query(
      `INSERT INTO reference_range_bands (version_id, sex, low, high, source) VALUES ($1, 'any', 50, 100, 'fixture')`,
      [v.id],
    );
    await pg.query(
      `UPDATE reference_range_versions SET status = 'signed', lead_signed_by = $2, lead_signed_at = now(),
         cso_signed_by = $3, cso_signed_at = now(), in_force_from = now() - interval '1 day' WHERE id = $1`,
      [v.id, a.lead.userId, a.cso.userId],
    );
    await sign("patient_release", "hospital", RULES);
    await sign("sms_template", "en", { language: "en", text: TEMPLATE, senderId: "FXHOSP" });
    await sign("plain_words", "obs.creatinine:en", {
      concept: "obs.creatinine",
      language: "en",
      whatThisTestIs: "Fixture: what this test is.",
      shortLine: "Fixture short line.",
      action: {
        within: "Fixture within.",
        higher: "Fixture higher.",
        lower: "Fixture lower.",
        noRange: "Fixture none.",
      },
      harmAnchor: null,
      calculated: [],
      readability: { method: "Fixture", score: 1 },
      translation: null,
      bannedPhrases: [],
    });
    for (const k of ["a", "b", "c", "d"]) {
      people[k] = await person("1990-01-01", `Adult ${k}`);
      await consent(people[k]!);
      await pg.query(
        `INSERT INTO consent_records (user_id, consent_type, version, consent_text_sha256) VALUES ($1, 'results_sms', 'fx', $2)`,
        [people[k], "b".repeat(64)],
      );
      await pg.query(`UPDATE patient_profiles SET phone_encrypted = $2 WHERE id = $1`, [
        people[k],
        encrypt(`+25670000000${Object.keys(people).length}`),
      ]);
    }
  }, 300_000);
  afterAll(() => {
    for (const k of FLAGS) process.env[k] = env[k];
  });

  it("S39 three results visible in the window send one message, with the signed template only", async () => {
    const p = people.a!;
    const ids = [await visible(p, "80"), await visible(p, "82"), await visible(p, "84")];
    const at = kampala(1, 10);
    await enqueueResultsReady(at, lane.db);
    const r = await rows(p);
    expect(r).toHaveLength(1);
    expect(r[0]!.payload.reports.sort()).toEqual([...ids].sort());
    const before = sent.length;
    await sendResultsReady(at, sender, lane.db);
    expect(sent.length - before).toBe(1);
    const { name } = await one<{ name: string }>(`SELECT name FROM hospitals WHERE id = $1`, [h]);
    expect(sent.at(-1)!.body).toBe(TEMPLATE.replace("{Hospital}", name));
    // Nothing new: nothing more is queued or sent.
    await enqueueResultsReady(at, lane.db);
    await sendResultsReady(at, sender, lane.db);
    expect(sent.length - before).toBe(1);
    expect(await rows(p)).toHaveLength(1);
  });

  it("S40 a result visible at 21:00 is sent at 06:00", async () => {
    const p = people.b!;
    await visible(p, "90");
    const evening = kampala(1, 21);
    await enqueueResultsReady(evening, lane.db);
    const [row] = await rows(p);
    expect(row!.scheduled_at.toISOString()).toBe(kampala(2, 6).toISOString());
    const before = sent.length;
    await sendResultsReady(evening, sender, lane.db);
    expect(sent.length).toBe(before);
    await sendResultsReady(kampala(2, 6), sender, lane.db);
    expect(sent.length).toBe(before + 1);
  });

  it("S41 an HIV result between two routine ones changes nothing", async () => {
    const p = people.c!;
    const first = await visible(p, "70");
    const hiv = await result(p, "test.hiv_viral_load", { "obs.hiv_viral_load": "40" });
    await review(p, hiv.reportId);
    const second = await visible(p, "72");
    const at = kampala(3, 10);
    await enqueueResultsReady(at, lane.db);
    const r = await rows(p);
    expect(r).toHaveLength(1);
    expect(r[0]!.payload.reports.sort()).toEqual([first, second].sort());
    expect(JSON.stringify(r)).not.toContain(hiv.reportId);
    expect(r[0]!.scheduled_at.toISOString()).toBe(at.toISOString());
  });

  it("S43 a provider failure retries later and never blocks the release; no message body is stored", async () => {
    const p = people.d!;
    const id = await visible(p, "60");
    const at = kampala(4, 10);
    await enqueueResultsReady(at, lane.db);
    failNext = true;
    await sendResultsReady(at, sender, lane.db);
    failNext = false;
    let [row] = await rows(p);
    expect(row).toMatchObject({ state: "queued", failure_reason: "provider_down" });
    expect(row!.payload.attempts).toBe(1);
    expect(row!.scheduled_at.getTime()).toBe(at.getTime() + 5 * 60_000);
    // The release stands whatever the transport did.
    expect(
      (await one<{ status: string }>(`SELECT status FROM diagnostic_reports WHERE id = $1`, [id]))
        .status,
    ).toBe("final");
    await sendResultsReady(new Date(at.getTime() + 5 * 60_000), sender, lane.db);
    [row] = await rows(p);
    expect(row!.state).toBe("sent");
    const stored = await pg.query(
      `SELECT * FROM notification_dispatches WHERE kind = 'results_ready'`,
    );
    expect(JSON.stringify(stored.rows)).not.toContain("you have new results");
  });

  it("S42 STOP from the phone stops results-ready messages and is recorded", async () => {
    const p = people.d!;
    await visible(p, "62");
    const at = kampala(5, 10);
    await enqueueResultsReady(at, lane.db);
    // What the STOP webhook does (system-ussd-act): the phone on sms_opt_outs and the SMS consents revoked.
    const phone = "+256700000004";
    await pg.query(`INSERT INTO sms_opt_outs (phone_hmac) VALUES ($1)`, [blindIndex(phone)]);
    const before = sent.length;
    await sendResultsReady(at, sender, lane.db);
    expect(sent.length).toBe(before);
    const last = (await rows(p)).at(-1)!;
    expect(last).toMatchObject({ state: "cancelled", failure_reason: "sms_opted_out" });
  });
});
