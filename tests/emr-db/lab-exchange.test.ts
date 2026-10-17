/**
 * Lab Phase 4, Step 8 on the PGlite lane: the exchange core against a partner simulator (test only). A simulated
 * reference lab pairs with a real P-384 key, takes 5-minute tokens with signed assertions, and sends FHIR results
 * and Task statuses: well-formed, malformed, duplicated, out of order and for the wrong patient (S29–S36; S37–S38
 * against the simulator, Step 9 being a gap report). Every partner, number and value is synthetic. Runs with
 * EMR_PGLITE=1.
 */
import { generateKeyPairSync, randomUUID, sign } from "node:crypto";
import type { Lane, Pg } from "./_pglite";
import type { EmrActor } from "@/lib/emr/actor";
import type { WriteCtx } from "@/lib/emr/write/context";
import type { Jwk } from "@/lib/exchange/jwt";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { referralSystems } from "@/lib/emr/fhir";
import { withPatientWrite } from "@/lib/emr/write/context";
import { placeOrders } from "@/lib/emr/write/orders";
import { collectSpecimen, receiveSpecimen } from "@/lib/emr/write/specimens";
import { encrypt, generateKey } from "@/lib/encryption";
import { pairingCode } from "@/lib/exchange/jwt";
import {
  authenticate,
  backToFile,
  createSender,
  drainOutbox,
  enableSender,
  fileElectronicResult,
  issueToken,
  openRaw,
  pairSender,
  processInbound,
  revokeSender,
  SCOPE,
  storeInbound,
  sweepUnprocessed,
} from "@/lib/exchange/store";
import { saveConfigDraft, signConfig } from "@/lib/lab/catalogue-v2";
import { saveMeasure } from "@/lib/lab/measures-setup";
import { addToManifest, recordHandover, savePartner, sealManifest } from "@/lib/lab/referral-store";
import { logger } from "@/lib/logger";
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
const AUD = "https://medsync.test/api/exchange/token";
const key = () => `k-${randomUUID()}`;
const FLAGS = [
  "LAB_WORKSPACE",
  "LAB_UNITS_RANGES",
  "LAB_ONE_MENU",
  "LAB_HIGH_RISK",
  "LAB_REFERRAL",
  "LAB_EXCHANGE",
];

/** The partner simulator's key pair and signer (ES384, IEEE P1363 signatures, as JOSE wants). */
function simulator() {
  const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "P-384" });
  const pub = publicKey.export({ format: "jwk" }) as Record<string, string>;
  const jwk: Jwk = {
    kid: `sim-${randomUUID().slice(0, 8)}`,
    kty: "EC",
    crv: "P-384",
    x: pub.x!,
    y: pub.y!,
    alg: "ES384",
  };
  const assertion = (
    senderId: string,
    o: { aud?: string; exp?: number; jti?: string; alg?: string } = {},
  ) => {
    const header = Buffer.from(
      JSON.stringify({ alg: o.alg ?? "ES384", kid: jwk.kid, typ: "JWT" }),
    ).toString("base64url");
    const now = Math.floor(Date.now() / 1000);
    const body = Buffer.from(
      JSON.stringify({
        iss: senderId,
        sub: senderId,
        aud: o.aud ?? AUD,
        exp: o.exp ?? now + 240,
        iat: now,
        jti: o.jti ?? randomUUID(),
      }),
    ).toString("base64url");
    const sig = sign("sha384", Buffer.from(`${header}.${body}`), {
      key: privateKey,
      dsaEncoding: "ieee-p1363",
    }).toString("base64url");
    return `${header}.${body}.${o.alg === "none" ? "" : sig}`;
  };
  return { jwk, assertion };
}

describe.skipIf(!laneOn)("Lab Phase 4 exchange core and the partner simulator (Step 8)", () => {
  let lane: Lane;
  let pg: Pg;
  let h: string;
  let ward: string;
  let partner: string;
  let senderId: string;
  const sim = simulator();
  const a: Record<string, EmrActor> = {};
  const env = { ...process.env };
  const now = () => new Date();
  const tx = <T>(fn: (t: Parameters<Parameters<Lane["db"]["transaction"]>[0]>[0]) => Promise<T>) =>
    lane.db.transaction(fn);
  const as = <T>(actor: EmrActor, p: string, fn: (ctx: WriteCtx) => Promise<T>) =>
    withPatientWrite(actor, p, fn, { database: lane.db });
  const one = async <T = Record<string, unknown>>(q: string, params: unknown[] = []) =>
    (await pg.query<T>(q, params)).rows[0] as T;
  const n = async (q: string, params: unknown[] = []) => (await one<{ n: number }>(q, params)).n;
  const lab = () => ({ userId: a.lab!.userId, hospitalId: h, cadreCode: "LAB_TECHNOLOGIST" });
  const sys = () => referralSystems(h, partner);

  /** A referred specimen handed over to the simulated partner; returns its numbers. */
  async function referred() {
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
    await as(a.lab!, p, (ctx) =>
      receiveSpecimen(ctx, { patientUserId: p, specimenId: sp.id, clientKey: key() }),
    );
    const form = `TEST-RL-${randomUUID().slice(0, 6)}`;
    const m = await tx((t) =>
      addToManifest(
        t,
        lab(),
        {
          partnerId: partner,
          transport: "Their courier",
          items: [
            { specimenId: sp.id, externalIds: { form }, packing: ["triple"], consentRef: null },
          ],
          clientKey: key(),
        },
        now(),
      ),
    );
    await tx((t) => sealManifest(t, lab(), { manifestId: m, packages: 1 }, now()));
    await tx((t) =>
      recordHandover(t, lab(), { manifestId: m, handedTo: "Test courier", handedAt: now() }, now()),
    );
    const r = await one<{ id: string; number: string }>(
      `SELECT id, number FROM lab_referrals WHERE specimen_id = $1`,
      [sp.id],
    );
    return {
      p,
      enc,
      orderId: order.id,
      specimenId: sp.id,
      form,
      referralId: r.id,
      number: r.number,
    };
  }
  const resultBundle = (
    r: { number: string; form: string },
    o: { name?: string; birthDate?: string; value?: number } = {},
  ) =>
    JSON.stringify({
      resourceType: "Bundle",
      type: "collection",
      entry: [
        {
          resource: {
            resourceType: "Task",
            id: "t1",
            status: "completed",
            intent: "order",
            identifier: [{ system: sys().referral, value: r.number }],
          },
        },
        {
          resource: {
            resourceType: "Patient",
            id: "p1",
            name: [{ text: o.name ?? "Test Patient" }],
            birthDate: o.birthDate ?? "2000-01-01",
          },
        },
        {
          resource: {
            resourceType: "DiagnosticReport",
            id: "r1",
            status: "final",
            code: { text: "Test" },
            identifier: [{ system: "urn:test:report", value: "TEST-RPT" }],
            specimen: [{ identifier: { system: sys().partnerForm, value: r.form } }],
            issued: "2026-10-17T10:00:00+03:00",
            result: [{ reference: "Observation/o1" }],
          },
        },
        {
          resource: {
            resourceType: "Observation",
            id: "o1",
            status: "final",
            code: { coding: [{ system: sys().partnerTests, code: "TEST-CODE" }] },
            valueQuantity: {
              value: o.value ?? 5,
              unit: "mmol/L",
              system: "http://unitsofmeasure.org",
              code: "mmol/L",
            },
            referenceRange: [{ text: "3 - 6" }],
          },
        },
      ],
    });
  const statusMsg = (number: string, status: string, at: string) =>
    JSON.stringify({
      resourceType: "Task",
      id: "t1",
      status,
      intent: "order",
      identifier: [{ system: sys().referral, value: number }],
      lastModified: at,
    });
  const token = async () => {
    const r = await tx((t) =>
      issueToken(t, {
        senderId,
        assertion: sim.assertion(senderId),
        audience: AUD,
        scope: null,
        now: now(),
      }),
    );
    if ("error" in r) throw new Error(r.error);
    return r.token;
  };
  /** The inbound route's work, without HTTP: authenticate, store (committed), then process in its own transaction. */
  const deliver = async (raw: string, externalId: string | null = null, process = true) => {
    const t = await token();
    const stored = await tx(async (x) => {
      const who = await authenticate(x, {
        token: t,
        scope: SCOPE.inbound,
        senderId,
        hospitalId: h,
        now: now(),
      });
      if (!who) throw new Error("unauthorised");
      return storeInbound(x, {
        senderId,
        channel: "fhir",
        contentType: "application/fhir+json",
        raw,
        externalId,
        senderTime: null,
        senderTimeUtc: null,
      });
    });
    if (process && !stored.duplicate) await tx((x) => processInbound(x, stored.messageId, now()));
    return stored;
  };
  const lastEvent = async (messageId: string) =>
    (
      await one<{ state: string }>(
        `SELECT state FROM exchange_events WHERE message_id = $1 AND state NOT IN ('duplicate','raw_viewed') ORDER BY id DESC LIMIT 1`,
        [messageId],
      )
    ).state;
  const counts = () =>
    Promise.all([
      n(`SELECT count(*)::int AS n FROM patient_profiles`),
      n(`SELECT count(*)::int AS n FROM encounter_orders`),
      n(`SELECT count(*)::int AS n FROM specimens`),
    ]);

  beforeAll(async () => {
    process.env.MEDSYNC_PHI_KEY ??= generateKey();
    for (const k of FLAGS) process.env[k] = "1";
    lane = await bootLane();
    pg = lane.pg;
    h = await hospital(pg, "Exchange");
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
              "lab.match.resolve",
              "lab.exchange.manage",
            ],
          }
        : {}),
    });
    a.doctor = await make(ward, "MEDICAL_OFFICER", "doctor");
    a.nurse = await make(ward, "NURSE", "nurse");
    a.lab = await make(labDept, "LAB_TECHNOLOGIST", "lab");
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
    await pg.query(
      `INSERT INTO diagnostic_offerings (hospital_id, kind, code, provision, stated_tat, referred_to, confirmed_at) VALUES ($1, 'lab', 'TEST-OFFER', 'referred', 'test', 'Test reference lab', now())`,
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
    partner = await tx((t) =>
      savePartner(
        t,
        { userId: a.lead!.userId, hospitalId: h },
        {
          name: "Simulated reference lab (test)",
          kind: "private_lab",
          contacts: [],
          transport: [{ code: "courier", words: "Their courier" }],
          resultsReturn: [{ channel: "electronic", words: "Their system" }],
          active: true,
        },
        now(),
      ),
    );
    const signed = async (
      kind: string,
      k: string,
      payload: unknown,
      signer: EmrActor,
      slot: "lead" | "dp_lead",
      author: EmrActor,
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
          { userId: signer.userId, hospitalId: h, as: slot },
          { configId: id, exceptionNote: null },
          now(),
        ),
      );
    };
    await signed(
      "partner_tests",
      partner,
      {
        tests: [
          {
            testCode: TEST,
            theirCode: "TEST-CODE",
            category: "serum",
            requiredIds: [{ key: "form", words: "Their form", symbologies: [] }],
          },
        ],
        holidays: [],
        source: { doc: "Test list", date: "2026-10-01" },
      },
      a.lead!,
      "lead",
      a.lead2!,
    );
    await signed(
      "partner_packing",
      `${partner}:serum`,
      {
        category: "serum",
        items: [{ key: "triple", words: "Triple packaging" }],
        source: { doc: "WHO 2025–2026", date: "2026-10-01" },
      },
      a.lead!,
      "lead",
      a.lead2!,
    );
    await signed(
      "partner_legal",
      partner,
      {
        basis: "s7_2_d",
        agreement: { ref: "TEST-AGR", signedOn: "2026-01-01", reviewOn: "2027-12-31" },
        processorTerms: true,
        crossBorder: false,
        perPatientConsent: false,
        pdpo: { ref: "TEST-PDPO", renewOn: "2027-12-31" },
        breachContact: "Test DP officer",
      },
      a.dp!,
      "dp_lead",
      a.lead!,
    );
    await signed(
      "partner_fields",
      partner,
      { fields: ["hospital_number", "name", "birth_date", "lab_number"], clinicalQuestion: false },
      a.dp!,
      "dp_lead",
      a.lead!,
    );
    // Pair the simulator (AB-6, B3): a one-time code, its public key, the lead compares the fingerprint.
    const code = pairingCode();
    senderId = await tx((t) =>
      createSender(
        t,
        lab(),
        { kind: "partner", partnerId: partner, name: "Simulator (test)", code },
        now(),
      ),
    );
    const paired = await tx((t) =>
      pairSender(t, { senderId, code: code.code, jwk: sim.jwk, now: now() }),
    );
    if ("error" in paired) throw new Error(paired.error);
    await tx((t) => enableSender(t, lab(), { senderId, fingerprint: paired.fingerprint }, now()));
  }, 300_000);
  afterAll(() => {
    for (const k of FLAGS) process.env[k] = env[k];
  });

  it("D-LAB4-15 tokens: a signed assertion gets a ≤5-minute token; wrong audience, replay, no signature and a stranger's key do not", async () => {
    expect(await token()).toMatch(/^[A-Za-z0-9_-]{43}$/);
    // S-4: a valid token is refused for another hospital, another sender or a scope it was not given.
    const good = await token();
    const auth = (o: { hospitalId?: string; senderId?: string; scope?: string }) =>
      tx((x) =>
        authenticate(x, {
          token: good,
          scope: o.scope ?? SCOPE.inbound,
          senderId: o.senderId ?? senderId,
          hospitalId: o.hospitalId ?? h,
          now: now(),
        }),
      );
    expect(await auth({})).not.toBeNull();
    expect(await auth({ hospitalId: randomUUID() })).toBeNull();
    expect(await auth({ senderId: randomUUID() })).toBeNull();
    expect(await auth({ scope: "system/Everything.write" })).toBeNull();
    expect(
      await tx((x) =>
        authenticate(x, {
          token: good,
          scope: SCOPE.inbound,
          senderId,
          hospitalId: h,
          now: new Date(Date.now() + 301_000),
        }),
      ),
    ).toBeNull();
    const issue = (assertion: string) =>
      tx((t) => issueToken(t, { senderId, assertion, audience: AUD, scope: null, now: now() }));
    expect(await issue(sim.assertion(senderId, { aud: "https://elsewhere.test/token" }))).toEqual({
      error: "invalid_client",
    });
    const jti = randomUUID();
    expect(await issue(sim.assertion(senderId, { jti }))).toHaveProperty("token");
    expect(await issue(sim.assertion(senderId, { jti }))).toEqual({ error: "invalid_client" });
    expect(await issue(sim.assertion(senderId, { alg: "none" }))).toEqual({
      error: "invalid_client",
    });
    expect(
      await issue(sim.assertion(senderId, { exp: Math.floor(Date.now() / 1000) + 3600 })),
    ).toEqual({ error: "invalid_client" });
    const other = simulator();
    expect(await issue(other.assertion(senderId))).toEqual({ error: "invalid_client" });
    const ttl = await one<{ s: number }>(
      `SELECT max(extract(epoch FROM expires_at - issued_at))::int AS s FROM exchange_tokens`,
    );
    expect(ttl.s).toBeLessThanOrEqual(300);
  });

  it("AB-6 pairing locks after repeated wrong codes", async () => {
    const code = pairingCode();
    const s = await tx((t) =>
      createSender(
        t,
        lab(),
        { kind: "partner", partnerId: partner, name: "Lock test", code },
        now(),
      ),
    );
    for (let i = 0; i < 10; i++)
      expect(
        await tx((t) =>
          pairSender(t, { senderId: s, code: "WRONGCODE1", jwk: sim.jwk, now: now() }),
        ),
      ).toEqual({ error: "wrong_code" });
    expect(
      await tx((t) => pairSender(t, { senderId: s, code: code.code, jwk: sim.jwk, now: now() })),
    ).toEqual({ error: "locked" });
  });

  it("S37, S38, RB-10 a status moves the referral; a matching result waits as back-to-file; a lab user files it once", async () => {
    const r = await referred();
    const before = await counts();
    await deliver(statusMsg(r.number, "in-progress", new Date().toISOString()));
    expect(
      (
        await one<{ state: string }>(`SELECT state FROM lab_referrals WHERE id = $1`, [
          r.referralId,
        ])
      ).state,
    ).toBe("in_progress");
    const msg = await deliver(resultBundle(r));
    expect(await lastEvent(msg.messageId)).toBe("matched");
    expect((await tx((t) => backToFile(t, h))).map((b) => b.messageId)).toContain(msg.messageId);
    const filed = await as(a.lab!, r.p, (ctx) =>
      fileElectronicResult(ctx, { messageId: msg.messageId, clientKey: key() }),
    );
    const again = await as(a.lab!, r.p, (ctx) =>
      fileElectronicResult(ctx, { messageId: msg.messageId, clientKey: key() }),
    );
    expect(again.id).toBe(filed.id);
    const rep = await one<{
      order_id: string;
      performer: string;
      entry_mode: string;
      referral_id: string;
      provenance: { messageId: string };
    }>(
      `SELECT order_id, performer, entry_mode, referral_id, provenance FROM diagnostic_reports WHERE id = $1`,
      [filed.id],
    );
    expect(rep).toMatchObject({
      order_id: r.orderId,
      performer: "external",
      entry_mode: "interface",
      referral_id: r.referralId,
    });
    expect(rep.provenance.messageId).toBe(msg.messageId);
    expect(
      await n(`SELECT count(*)::int AS n FROM diagnostic_reports WHERE referral_id = $1`, [
        r.referralId,
      ]),
    ).toBe(1);
    expect(await counts()).toEqual(before);
  });

  it("S15 EX-7 a status dated earlier than the last applied is stored and shown, not applied", async () => {
    const r = await referred();
    await deliver(statusMsg(r.number, "in-progress", new Date(Date.now() + 60_000).toISOString()));
    await deliver(statusMsg(r.number, "received", new Date(Date.now() + 30_000).toISOString()));
    expect(
      (
        await one<{ state: string }>(`SELECT state FROM lab_referrals WHERE id = $1`, [
          r.referralId,
        ])
      ).state,
    ).toBe("in_progress");
    expect(
      (
        await pg.query(
          `SELECT kind, applied FROM lab_referral_events WHERE referral_id = $1 AND source = 'partner_message' ORDER BY seq`,
          [r.referralId],
        )
      ).rows,
    ).toEqual([
      { kind: "in_progress", applied: true },
      { kind: "received_by_lab", applied: false },
    ]);
  });

  it("S29 EX-2 a message stored and acknowledged survives a crash before processing and is processed once", async () => {
    const r = await referred();
    const stored = await deliver(resultBundle(r), null, false);
    expect(await lastEvent(stored.messageId)).toBe("received");
    expect(await tx((t) => sweepUnprocessed(t, now()))).toBeGreaterThanOrEqual(1);
    expect(await lastEvent(stored.messageId)).toBe("matched");
    expect(await tx((t) => sweepUnprocessed(t, now()))).toBe(0);
    expect(await tx((t) => processInbound(t, stored.messageId, now()))).toBe("matched");
    expect(
      await n(
        `SELECT count(*)::int AS n FROM exchange_events WHERE message_id = $1 AND state = 'matched'`,
        [stored.messageId],
      ),
    ).toBe(1);
  });

  it("S30 EX-3 the same message three times is stored once, processed once, and the duplicates are recorded", async () => {
    const r = await referred();
    const raw = resultBundle(r);
    const first = await deliver(raw, "ext-1");
    const second = await deliver(raw, "ext-1");
    const third = await deliver(raw, "ext-other");
    expect(first.duplicate).toBe(false);
    expect([second, third]).toEqual([
      { messageId: first.messageId, duplicate: true },
      { messageId: first.messageId, duplicate: true },
    ]);
    expect(
      await n(
        `SELECT count(*)::int AS n FROM exchange_events WHERE message_id = $1 AND state = 'duplicate'`,
        [first.messageId],
      ),
    ).toBe(2);
    expect(
      await n(
        `SELECT count(*)::int AS n FROM exchange_events WHERE message_id = $1 AND state = 'matched'`,
        [first.messageId],
      ),
    ).toBe(1);
  });

  it("S32, MA-5 a different name waits as demographics_disagree, with no value or name in the queue", async () => {
    const r = await referred();
    const msg = await deliver(resultBundle(r, { name: "Test Patient Other", value: 7 }));
    expect(await lastEvent(msg.messageId)).toBe("waiting_match");
    const item = await one<{ reason: string; comparison: unknown }>(
      `SELECT reason, comparison FROM lab_match_items WHERE message_id = $1`,
      [msg.messageId],
    );
    expect(item.reason).toBe("demographics_disagree");
    expect(JSON.stringify(item)).not.toMatch(/Test Patient|2000|"7"|mmol/);
  });

  it("S33 MA-4 a number on two open referrals waits as ambiguous; nothing is picked", async () => {
    const r1 = await referred();
    const r2 = await referred();
    await pg.query(`UPDATE lab_referrals SET external_ids = $2 WHERE id = $1`, [
      r2.referralId,
      JSON.stringify({ form: r1.form }),
    ]);
    const msg = await deliver(resultBundle(r1));
    expect(
      (
        await one<{ reason: string }>(`SELECT reason FROM lab_match_items WHERE message_id = $1`, [
          msg.messageId,
        ])
      ).reason,
    ).toBe("ambiguous");
  });

  it("EX-5 a malformed message is stored and marked unreadable, never dropped", async () => {
    const msg = await deliver("{ not json");
    expect(await lastEvent(msg.messageId)).toBe("unreadable");
    expect(
      await n(`SELECT count(*)::int AS n FROM exchange_messages WHERE id = $1`, [msg.messageId]),
    ).toBe(1);
  });

  it("S31 EX-4 the outbox retries with back-off while the partner is down, goes dead at the limit, and delivers when it returns", async () => {
    const make = async () => {
      const m = await one<{ id: string }>(
        `INSERT INTO exchange_messages (hospital_id, sender_id, direction, channel, content_type, payload_ciphertext, sha256, about)
         VALUES ($1, $2, 'out', 'fhir', 'application/fhir+json', $3, $4, 'Referral (test)') RETURNING id`,
        [h, senderId, encrypt("{}"), randomUUID().replace(/-/g, "").padEnd(64, "0")],
      );
      await pg.query(
        `INSERT INTO exchange_outbox (message_id, hospital_id, sender_id, state, next_at) VALUES ($1, $2, $3, 'pending', now() - interval '1 second')`,
        [m.id, h, senderId],
      );
      return m.id;
    };
    const down = async () => ({ ok: false as const, error: "partner down (test)" });
    const up = async () => ({ ok: true as const });
    const id = await make();
    expect(await tx((t) => drainOutbox(t, down, now(), () => 0.5))).toEqual({ sent: 0, failed: 1 });
    const o = await one<{ state: string; attempts: number; next_at: Date }>(
      `SELECT state, attempts, next_at FROM exchange_outbox WHERE message_id = $1`,
      [id],
    );
    expect(o).toMatchObject({ state: "retrying", attempts: 1 });
    expect(new Date(o.next_at).getTime()).toBeGreaterThan(Date.now());
    await pg.query(
      `UPDATE exchange_outbox SET attempts = 149, next_at = now() - interval '1 second' WHERE message_id = $1`,
      [id],
    );
    await tx((t) => drainOutbox(t, down, now()));
    expect(
      (
        await one<{ state: string }>(`SELECT state FROM exchange_outbox WHERE message_id = $1`, [
          id,
        ])
      ).state,
    ).toBe("dead");
    const id2 = await make();
    expect(await tx((t) => drainOutbox(t, up, now()))).toEqual({ sent: 1, failed: 0 });
    expect(
      (
        await one<{ state: string }>(`SELECT state FROM exchange_outbox WHERE message_id = $1`, [
          id2,
        ])
      ).state,
    ).toBe("delivered");
  });

  it("S35 EX-9 the raw view needs a reason and is recorded; application logs carry no patient detail", async () => {
    const r = await referred();
    const spy = [
      vi.spyOn(logger, "info"),
      vi.spyOn(logger, "warn"),
      vi.spyOn(logger, "error"),
      vi.spyOn(console, "log"),
      vi.spyOn(console, "warn"),
      vi.spyOn(console, "error"),
    ];
    const msg = await deliver(resultBundle(r, { name: "Test Patient Logscan" }));
    const raw = await tx((t) =>
      openRaw(
        t,
        { userId: a.lead!.userId, hospitalId: h },
        { messageId: msg.messageId, reason: "Checking the mapping (test)" },
        now(),
      ),
    );
    expect(raw).toContain("Test Patient Logscan");
    const logged = JSON.stringify(spy.flatMap((s) => s.mock.calls));
    for (const s of spy) s.mockRestore();
    expect(logged).not.toMatch(/Logscan|2000-01-01|Test Patient/);
    expect(
      await one(
        `SELECT state, detail, actor_user_id FROM exchange_events WHERE message_id = $1 AND state = 'raw_viewed'`,
        [msg.messageId],
      ),
    ).toEqual({
      state: "raw_viewed",
      detail: { reason: "Checking the mapping (test)" },
      actor_user_id: a.lead!.userId,
    });
  });

  it("S34, MA-4 no message creates a patient, an order or a specimen", async () => {
    const before = await counts();
    const r = await referred();
    const after = await counts();
    // referred() itself makes one patient, one order and one specimen; the messages below add none.
    await deliver(resultBundle(r, { name: "Test Patient Nobody", birthDate: "2000-02-02" }));
    await deliver(resultBundle({ number: "RF-0000-0000", form: "TEST-NONE" }));
    await deliver(statusMsg("RF-0000-0000", "completed", new Date().toISOString()));
    expect(await counts()).toEqual(after);
    expect(after.map((x, i) => x - before[i]!)).toEqual([1, 1, 1]);
  });

  it("§11 load: 500 inbound messages stored and acknowledged, then processed (in-process PGlite)", async () => {
    const r = await referred();
    const t = await token();
    const ack: number[] = [];
    const ids: string[] = [];
    const start = performance.now();
    for (let k = 0; k < 500; k++) {
      const raw = statusMsg(
        r.number,
        "in-progress",
        new Date(Date.UTC(2026, 9, 17, 6, 0, k)).toISOString(),
      );
      const t0 = performance.now();
      const stored = await tx(async (x) => {
        if (
          !(await authenticate(x, {
            token: t,
            scope: SCOPE.inbound,
            senderId,
            hospitalId: h,
            now: now(),
          }))
        )
          throw new Error("unauthorised");
        return storeInbound(x, {
          senderId,
          channel: "fhir",
          contentType: "application/fhir+json",
          raw,
          externalId: null,
          senderTime: null,
          senderTimeUtc: null,
        });
      });
      ack.push(performance.now() - t0);
      ids.push(stored.messageId);
    }
    const storedIn = performance.now() - start;
    const proc: number[] = [];
    for (const id of ids) {
      const t0 = performance.now();
      await tx((x) => processInbound(x, id, now()));
      proc.push(performance.now() - t0);
    }
    const p95 = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length * 0.95)]!;
    // Recorded for the final report; the budgets are §11's (production numbers need the real database).
    process.stderr.write(
      `load: 500 stored in ${Math.round(storedIn)} ms; ack p95 ${p95(ack).toFixed(1)} ms; process p95 ${p95(proc).toFixed(1)} ms\n`,
    );
    expect(storedIn).toBeLessThan(60_000);
    expect(p95(ack)).toBeLessThan(300);
    expect(p95(proc)).toBeLessThan(5_000);
    expect(
      await n(`SELECT count(*)::int AS n FROM exchange_messages WHERE id = ANY($1)`, [ids]),
    ).toBe(500);
  }, 300_000);

  it("S36, AB-6 revoking takes effect at once: the next request fails and stored messages stay", async () => {
    const t = await token();
    await tx((x) => revokeSender(x, lab(), { senderId }, now()));
    expect(
      await tx((x) =>
        authenticate(x, { token: t, scope: SCOPE.inbound, senderId, hospitalId: h, now: now() }),
      ),
    ).toBeNull();
    expect(
      await tx((x) =>
        issueToken(x, {
          senderId,
          assertion: sim.assertion(senderId),
          audience: AUD,
          scope: null,
          now: now(),
        }),
      ),
    ).toEqual({ error: "invalid_client" });
    expect(
      await n(`SELECT count(*)::int AS n FROM exchange_messages WHERE sender_id = $1`, [senderId]),
    ).toBeGreaterThan(0);
  });
});
