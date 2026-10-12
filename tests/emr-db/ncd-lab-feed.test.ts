/**
 * Lab Phase 2, Step 9: the NCD feed on the PGlite lane (S55, S56, S58–S60, S62; G7 proved red then green).
 * Mappings and values are FIXTURES (an invented look-back window, invented results). Runs with EMR_PGLITE=1.
 */
import { randomUUID } from "node:crypto";
import type { Lane, Pg } from "./_pglite";
import type { EmrActor } from "@/lib/emr/actor";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { withPatientWrite } from "@/lib/emr/write/context";
import { placeOrders } from "@/lib/emr/write/orders";
import { amendResults, enterResults, releaseResults } from "@/lib/emr/write/results";
import { collectSpecimen, receiveSpecimen } from "@/lib/emr/write/specimens";
import { encrypt, generateKey } from "@/lib/encryption";
import { saveConfigDraft, signConfig } from "@/lib/lab/catalogue-v2";
import { labFeedFor } from "@/lib/ncd/lab-feed-read";
import { bootLane, clinician, department, encounter, hospital, intake, laneOn, patient } from "./_pglite";

const HBA1C = "f05a6f3e-5793-584a-a6d2-c357de241001";
const key = () => `k-${randomUUID()}`;

describe.skipIf(!laneOn)("Lab Phase 2 NCD feed (Step 9)", () => {
  let lane: Lane;
  let pg: Pg;
  let h: string;
  const a: Record<string, EmrActor> = {};
  let p: string;
  let enc: string;
  let personId: string;
  const env = { ...process.env };
  const tx = <T>(fn: (t: Parameters<Parameters<Lane["db"]["transaction"]>[0]>[0]) => Promise<T>) => lane.db.transaction(fn);
  const as = <T>(x: EmrActor, fn: (ctx: Parameters<Parameters<typeof withPatientWrite>[2]>[0]) => Promise<T>) =>
    withPatientWrite(x, p, fn, { database: lane.db });
  const feed = () => labFeedFor(h, personId, new Date(), lane.db as never);

  async function releasedHba1c(value: string) {
    const o = await as(a.doctor!, (ctx) =>
      placeOrders(ctx, { patientUserId: p, encounterId: enc, orders: [{ clientKey: key(), testId: HBA1C, priority: "routine", reasonText: "Fixture" }] }),
    );
    const sp = await as(a.nurse!, (ctx) => collectSpecimen(ctx, { patientUserId: p, orderId: o.id, identifiersConfirmed: true, clientKey: key() }));
    await as(a.lab!, (ctx) => receiveSpecimen(ctx, { patientUserId: p, specimenId: sp.id, clientKey: key() }));
    const pre = await as(a.lab!, (ctx) =>
      enterResults(ctx, { patientUserId: p, orderId: o.id, status: "preliminary", values: [{ conceptId: "obs.hba1c", value, unit: "%" }], clientKey: key() }),
    );
    return as(a.lab!, (ctx) => releaseResults(ctx, { patientUserId: p, reportId: pre.id, clientKey: key() }));
  }

  beforeAll(async () => {
    process.env.MEDSYNC_PHI_KEY ??= generateKey();
    lane = await bootLane();
    pg = lane.pg;
    h = await hospital(pg, "NCD feed");
    const ward = await department(pg, h, "Diabetes clinic");
    const lab = await department(pg, h, "Laboratory");
    const make = async (d: string, cadreCode: string, surface: EmrActor["surface"]): Promise<EmrActor> => ({
      ...(await clinician(pg, { hospitalId: h, departmentId: d, cadre: cadreCode })),
      fullName: null,
      hospitalId: h,
      departmentId: d,
      cadreCode,
      isClinical: true,
      surface,
    });
    a.doctor = await make(ward, "MEDICAL_OFFICER", "doctor");
    a.nurse = await make(ward, "NURSE", "nurse");
    a.lab = await make(lab, "LAB_TECHNOLOGIST", "lab");
    a.cso = await make(ward, "CONSULTANT", "doctor");
    p = await patient(pg);
    await pg.query(
      `INSERT INTO public.patient_profiles (id, first_name_encrypted, surname_encrypted, sex, date_of_birth, id_type, phone_encrypted, district_id)
       VALUES ($1, $2, $3, 'female', '1970-01-01', 'none', $4, (SELECT id FROM public.districts LIMIT 1))`,
      [p, encrypt("Fixture"), encrypt("Patient"), encrypt("0700000000")],
    );
    await intake(pg, { hospitalId: h, patientUserId: p });
    enc = await encounter(pg, { hospitalId: h, patientUserId: p, clinicianUserId: a.doctor.userId, departmentId: ward });
    // The registry goes live for patient data only after its go-live is approved (0093 §8.3).
    await pg.query(`INSERT INTO ncd_staff_role (facility_id, user_id, ncd_role) VALUES ($1, $2, 'clinical_safety_officer')`, [
      h,
      a.cso.userId,
    ]);
    const gl = await pg.query<{ id: string }>(
      `INSERT INTO ncd_go_live_request (facility_id, requested_by) VALUES ($1, $2) RETURNING id`,
      [h, a.doctor.userId],
    );
    await pg.query(`UPDATE ncd_go_live_request SET status = 'approved', decided_by = $2, decided_at = now() WHERE id = $1`, [
      gl.rows[0]!.id,
      a.cso.userId,
    ]);
    personId = (
      await pg.query<{ id: string }>(
        `INSERT INTO ncd_person (facility_id, registry_number, given_name_ciphertext, family_name_ciphertext, sex, birth_year,
           privacy_notice_version, privacy_notice_ack_at, known_cvd, patient_user_id)
         VALUES ($1, 'FX-0001', 'ct', 'ct', 'female', 1970, 'fixture', now(), '{}', $2) RETURNING id`,
        [h, p],
      )
    ).rows[0]!.id;
  }, 300_000);
  afterAll(() => {
    process.env.NCD_LAB_FEED = env.NCD_LAB_FEED;
  });

  it("S62, NF-1: with no signed mapping the feed fills nothing", async () => {
    await releasedHba1c("7.9");
    const v = await feed();
    expect(v.linked).toBe(true);
    expect(v.fields).toEqual({}); // G7 (red before): the released HbA1c reaches no NCD field
  });

  it("S55 (G7 green), NF-2: once the mapping is signed, the released HbA1c fills the field with its source", async () => {
    const actor = { userId: a.doctor!.userId, hospitalId: h };
    const id = await tx((t) =>
      saveConfigDraft(t, actor, { kind: "ncd_mapping", key: "hba1c", payload: { concept: "obs.hba1c", unit: "%", methods: ["lab"], windowDays: 90 } }, new Date()),
    );
    await tx((t) => signConfig(t, { userId: a.nurse!.userId, hospitalId: h, as: "lead" }, { configId: id, exceptionNote: null }, new Date()));
    await tx((t) => signConfig(t, { userId: a.cso!.userId, hospitalId: h, as: "cso" }, { configId: id, exceptionNote: null }, new Date()));
    const v = await feed();
    expect(v.fields.hba1c).toMatchObject({ kind: "filled", result: { value: "7.9", unit: "%", method: "lab", amended: false } });
  });

  it("S56, NF-3: the lab amends it; the field shows the amended value, and the old version is not used", async () => {
    const rep = (await feed()).fields.hba1c;
    if (rep?.kind !== "filled") throw new Error("not filled");
    await as(a.lab!, (ctx) =>
      amendResults(ctx, {
        patientUserId: p,
        reportId: rep.result.reportId,
        status: "amended",
        values: [{ conceptId: "obs.hba1c", value: "8.4", unit: "%" }],
        reasonText: "Fixture: transcription corrected",
        clientKey: key(),
      }),
    );
    expect((await feed()).fields.hba1c).toMatchObject({ kind: "filled", result: { value: "8.4", amended: true } });
  });

  it("S60, NF-2: a result in another unit is listed as not usable, never dropped", async () => {
    await pg.query(`UPDATE lab_signed_configs SET status = 'superseded', superseded_at = now() WHERE key = 'hba1c' AND status = 'signed'`);
    const actor = { userId: a.doctor!.userId, hospitalId: h };
    const id = await tx((t) =>
      saveConfigDraft(t, actor, { kind: "ncd_mapping", key: "hba1c", payload: { concept: "obs.hba1c", unit: "mmol/mol", methods: ["lab"], windowDays: 90 } }, new Date()),
    );
    await tx((t) => signConfig(t, { userId: a.nurse!.userId, hospitalId: h, as: "lead" }, { configId: id, exceptionNote: null }, new Date()));
    await tx((t) => signConfig(t, { userId: a.cso!.userId, hospitalId: h, as: "cso" }, { configId: id, exceptionNote: null }, new Date()));
    const v = await feed();
    expect(v.fields.hba1c).toMatchObject({ kind: "none", reason: "unit_differs" });
    expect(v.fields.hba1c?.kind === "none" && v.fields.hba1c.unusable.length).toBeGreaterThan(0);
  });

  it("S59, NF-2: nothing inside the window reads as none in window", async () => {
    const actor = { userId: a.doctor!.userId, hospitalId: h };
    const id = await tx((t) =>
      saveConfigDraft(t, actor, { kind: "ncd_mapping", key: "uacr", payload: { concept: "obs.uacr", unit: "mg/mmol", methods: ["lab"], windowDays: 365 } }, new Date()),
    );
    await tx((t) => signConfig(t, { userId: a.nurse!.userId, hospitalId: h, as: "lead" }, { configId: id, exceptionNote: null }, new Date()));
    await tx((t) => signConfig(t, { userId: a.cso!.userId, hospitalId: h, as: "cso" }, { configId: id, exceptionNote: null }, new Date()));
    expect((await feed()).fields.uacr).toMatchObject({ kind: "none", reason: "none_in_window" });
  });

  it("an unlinked registry person is said so, and gets nothing", async () => {
    const other = (
      await pg.query<{ id: string }>(
        `INSERT INTO ncd_person (facility_id, registry_number, given_name_ciphertext, family_name_ciphertext, sex, birth_year,
           privacy_notice_version, privacy_notice_ack_at, known_cvd) VALUES ($1, 'FX-0002', 'ct', 'ct', 'male', 1960, 'fixture', now(), '{}')
         RETURNING id`,
        [h],
      )
    ).rows[0]!.id;
    const v = await labFeedFor(h, other, new Date(), lane.db as never);
    expect(v.linked).toBe(false);
    expect(Object.values(v.fields).every((f) => f?.kind === "none")).toBe(true);
  });
});
