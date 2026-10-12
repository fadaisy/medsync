/**
 * Lab Phase 2, Step 4: catalogue v2 on the PGlite lane (S1–S5, S8, S9, S12–S14, S18 at the data layer). The
 * research file is imported for real (it is data, and lands as drafts); every scheme, elevation and constant
 * used to flag here is a FIXTURE invented for the test, signed by fixture people. Runs with EMR_PGLITE=1.
 */
import { randomUUID } from "node:crypto";
import type { Lane, Pg } from "./_pglite";
import type { EmrActor } from "@/lib/emr/actor";
import type { WriteCtx } from "@/lib/emr/write/context";
import type { SchemePayload } from "@/lib/lab/signed-config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { withPatientWrite } from "@/lib/emr/write/context";
import { placeOrders } from "@/lib/emr/write/orders";
import { amendResults, enterResults, releaseResults } from "@/lib/emr/write/results";
import { collectSpecimen, receiveSpecimen } from "@/lib/emr/write/specimens";
import { encrypt, generateKey } from "@/lib/encryption";
import { componentsFor, saveConfigDraft, signConfig } from "@/lib/lab/catalogue-v2";
import { saveMeasure, signRangeVersion } from "@/lib/lab/measures-setup";
import {
  activateProfile,
  createProfile,
  resolveCheck,
  setVerified,
} from "@/lib/lab/profile-store";
import { EGFR_CONSTANTS, EGFR_REF } from "@/lib/lab/egfr";
import { importResearch, recordDraftCheck, rejectBand } from "@/lib/lab/research-store";
import { bootLane, clinician, department, encounter, hospital, intake, laneOn, patient } from "./_pglite";

const FBC = "bfd23c30-1989-5fdb-8030-c87016ab22c9";
const CREAT = "668a99dc-2017-572e-91e8-c3d6ed116ea6";
const key = () => `k-${randomUUID()}`;
const num = (unit: string, dp = 1) => ({
  resultType: "number" as const,
  unitUcum: unit,
  unitDisplay: unit,
  decimalPlaces: dp,
  loincCode: null,
  entryCheckLow: null,
  entryCheckHigh: null,
});
const b = (category: string, from: string | null, to: string | null) => ({
  category,
  from,
  fromInclusive: true,
  to,
  toInclusive: false,
});
/** FIXTURE scheme: invented cut-offs, adult women, not pregnant and one pregnant span. */
const HB: SchemePayload = {
  concept: "obs.haemoglobin",
  unit: "g/dL",
  label: "Fixture anaemia scheme",
  source: "fixture",
  categories: [
    { code: "none", label: "No fixture anaemia", abnormal: false },
    { code: "mild", label: "Mild fixture anaemia", abnormal: true },
    { code: "moderate", label: "Moderate fixture anaemia", abnormal: true },
    { code: "severe", label: "Severe fixture anaemia", abnormal: true },
  ],
  rows: [
    {
      sex: "female",
      ageFromDays: 5000,
      ageToDays: 20000,
      context: "not_pregnant",
      methods: ["lab"],
      bounds: [b("severe", null, "8.0"), b("moderate", "8.0", "11.0"), b("mild", "11.0", "12.0"), b("none", "12.0", null)],
      source: "fixture np",
    },
  ],
  elevation: { unit: "g/dL", table: [{ fromM: 1000, toM: 1999, amount: "1.0" }], source: "fixture" },
};

describe.skipIf(!laneOn)("Lab Phase 2 catalogue v2 (Step 4)", () => {
  let lane: Lane;
  let pg: Pg;
  let h: string;
  let ward: string;
  const a: Record<string, EmrActor> = {};
  const env = { ...process.env };
  const tx = <T>(fn: (t: Parameters<Parameters<Lane["db"]["transaction"]>[0]>[0]) => Promise<T>) =>
    lane.db.transaction(fn);
  const lead = () => ({ userId: a.lead!.userId, hospitalId: h });
  const sign = async (configId: string) => {
    await tx((t) => signConfig(t, { userId: a.lead2!.userId, hospitalId: h, as: "lead" }, { configId, exceptionNote: null }, new Date()));
    await tx((t) => signConfig(t, { userId: a.cso!.userId, hospitalId: h, as: "cso" }, { configId, exceptionNote: null }, new Date()));
  };
  const config = async (kind: Parameters<typeof saveConfigDraft>[2]["kind"], k: string, payload: unknown, global = false) =>
    sign(await tx((t) => saveConfigDraft(t, lead(), { kind, key: k, payload, global }, new Date())));
  const as = <T>(actor: EmrActor, p: string, fn: (ctx: WriteCtx) => Promise<T>) =>
    withPatientWrite(actor, p, fn, { database: lane.db });
  const snaps = async (reportId: string) =>
    (
      await pg.query<Record<string, unknown>>(
        `SELECT o.concept_id, s.* FROM lab_result_snapshots s JOIN clinical_observations o ON o.id = s.observation_id
          WHERE s.report_id = $1`,
        [reportId],
      )
    ).rows;

  async function received(testId: string, sex: string, dob: string) {
    const p = await patient(pg);
    await pg.query(
      `INSERT INTO public.patient_profiles (id, first_name_encrypted, surname_encrypted, sex, date_of_birth, id_type, phone_encrypted, district_id)
       VALUES ($1, $2, $3, $4, $5, 'none', $6, (SELECT id FROM public.districts LIMIT 1))`,
      [p, encrypt("Fixture"), encrypt("Patient"), sex, dob, encrypt("0700000000")],
    );
    await intake(pg, { hospitalId: h, patientUserId: p });
    const enc = await encounter(pg, { hospitalId: h, patientUserId: p, clinicianUserId: a.doctor!.userId, departmentId: ward });
    const order = await as(a.doctor!, p, (ctx) =>
      placeOrders(ctx, { patientUserId: p, encounterId: enc, orders: [{ clientKey: key(), testId, priority: "routine", reasonText: "Check" }] }),
    );
    const sp = await as(a.nurse!, p, (ctx) =>
      collectSpecimen(ctx, { patientUserId: p, orderId: order.id, identifiersConfirmed: true, clientKey: key() }),
    );
    await as(a.lab!, p, (ctx) => receiveSpecimen(ctx, { patientUserId: p, specimenId: sp.id, clientKey: key() }));
    return { p, orderId: order.id };
  }
  const enter = (r: { p: string; orderId: string }, values: { conceptId: string; value: string }[], status: "preliminary" | "final" = "final") =>
    as(a.lab!, r.p, (ctx) => enterResults(ctx, { patientUserId: r.p, orderId: r.orderId, status, values, clientKey: key() }));

  beforeAll(async () => {
    process.env.MEDSYNC_PHI_KEY ??= generateKey();
    process.env.LAB_WORKSPACE = "1";
    process.env.LAB_UNITS_RANGES = "1";
    process.env.LAB_CATALOGUE_V2 = "1";
    lane = await bootLane();
    pg = lane.pg;
    h = await hospital(pg, "Catalogue v2");
    ward = await department(pg, h, "Ward");
    const lab = await department(pg, h, "Laboratory");
    const make = async (d: string, cadreCode: string, surface: EmrActor["surface"]): Promise<EmrActor> => ({
      ...(await clinician(pg, { hospitalId: h, departmentId: d, cadre: cadreCode })),
      fullName: null,
      hospitalId: h,
      departmentId: d,
      cadreCode,
      isClinical: true,
      surface,
      ...(surface === "lab"
        ? { labPermissions: ["lab.receive", "lab.result.enter", "lab.result.release", "lab.manage"] }
        : {}),
    });
    a.doctor = await make(ward, "MEDICAL_OFFICER", "doctor");
    a.nurse = await make(ward, "NURSE", "nurse");
    a.lab = await make(lab, "LAB_TECHNOLOGIST", "lab");
    a.lead = await make(lab, "LAB_TECHNOLOGIST", "lab");
    a.lead2 = await make(lab, "LAB_TECHNOLOGIST", "lab");
    a.cso = await make(ward, "CONSULTANT", "doctor");
  }, 300_000);
  afterAll(() => {
    for (const k of ["LAB_WORKSPACE", "LAB_UNITS_RANGES", "LAB_CATALOGUE_V2"]) process.env[k] = env[k];
  });

  it("S18: before the addendum is signed, every test keeps Phase 1's components", async () => {
    const c = await tx((t) => componentsFor(t, h, { code: "test.fbc", components: ["obs.haemoglobin"] }, null));
    expect(c).toMatchObject({ active: false, components: ["obs.haemoglobin"] });
    const inactive = await pg.query(`SELECT count(*)::int AS n FROM test_catalogue WHERE code = 'test.rpr' AND active`);
    expect(inactive.rows[0]).toEqual({ n: 0 });
  });

  it("S4, CC-1: the addendum signed by two people opens the v2 lists and the new tests", async () => {
    await config("addendum", "cfc-1.6.0", { hash: "f".repeat(64) }, true);
    const c = await tx((t) => componentsFor(t, h, { code: "test.fbc", components: [] }, null));
    expect(c.active).toBe(true);
    expect(c.components).toHaveLength(31);
    const active = await pg.query(`SELECT count(*)::int AS n FROM test_catalogue WHERE code IN ('test.rpr','test.tpha','test.coag_screen','test.dual_hiv_syphilis_rdt') AND active`);
    expect(active.rows[0]).toEqual({ n: 4 });
  });

  it("S1, RI-3: import lands drafts only; nothing resolves; a second import is a no-op", async () => {
    const first = await tx((t) => importResearch(t, lead(), new Date()));
    expect(first.alreadyImported).toBe(false);
    const drafts = await pg.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM reference_range_versions WHERE hospital_id = $1 AND import_hash = $2 AND status = 'draft'`,
      [h, first.hash],
    );
    expect(drafts.rows[0]!.n).toBeGreaterThan(30);
    const signed = await pg.query(`SELECT count(*)::int AS n FROM reference_range_versions WHERE hospital_id = $1 AND status <> 'draft'`, [h]);
    expect(signed.rows[0]).toEqual({ n: 0 });
    const schemes = await pg.query(`SELECT count(*)::int AS n FROM lab_signed_configs WHERE hospital_id = $1 AND kind = 'scheme' AND status = 'draft'`, [h]);
    expect((schemes.rows[0] as { n: number }).n).toBeGreaterThan(10);
    const again = await tx((t) => importResearch(t, lead(), new Date()));
    expect(again.alreadyImported).toBe(true);
  });

  it("S2, RI-5: the Lugada CD4 draft cannot be signed until the check is recorded", async () => {
    const v = await pg.query<{ id: string }>(
      `SELECT v.id FROM reference_range_versions v JOIN test_catalogue t ON t.id = v.test_id
        WHERE v.hospital_id = $1 AND v.concept_id = 'obs.cd4' AND v.status = 'draft'`,
      [h],
    );
    const versionId = v.rows[0]!.id;
    await saveMeasureFor("test.cd4", "obs.cd4", "/uL", 0);
    const signLead = () =>
      tx((t) => signRangeVersion(t, { userId: a.lead2!.userId, hospitalId: h, as: "lead" }, { versionId, exceptionNote: null }, new Date()));
    await expect(signLead()).rejects.toThrow();
    const blocked = await pg.query<{ id: string }>(`SELECT id FROM reference_range_bands WHERE version_id = $1 AND verification IS NOT NULL`, [versionId]);
    expect(blocked.rows.length).toBe(8);
    for (const r of blocked.rows)
      await tx((t) => recordDraftCheck(t, lead(), { bandId: r.id, finding: "matches", where: "fixture: Table 3 read" }, new Date()));
    // The other sources still overlap (RI-6): the lead keeps one and rejects the others.
    const all = await pg.query<{ id: string; source: string }>(`SELECT id, source FROM reference_range_bands WHERE version_id = $1`, [versionId]);
    // Keep the Lugada set (the one with the blockers) and reject every other source.
    const keep = all.rows.find((x) => x.source.startsWith("Lugada"))!.source;
    for (const r of all.rows.filter((x) => x.source !== keep))
      await tx((t) => rejectBand(t, lead(), { bandId: r.id, reason: "fixture: another source kept" }));
    const left = await pg.query<Record<string, unknown>>(
      `SELECT sex, age_from_days, age_to_days FROM reference_range_bands WHERE version_id = $1 AND rejected_reason IS NULL`,
      [versionId],
    );
    expect(left.rows.length).toBeGreaterThan(0);
    await signLead(); // checks recorded, one source kept: the lead can now send it on
    const rej = await pg.query(`SELECT count(*)::int AS n FROM reference_range_bands WHERE version_id = $1 AND rejected_reason IS NOT NULL`, [versionId]);
    expect((rej.rows[0] as { n: number }).n).toBeGreaterThan(0); // S3: alternatives stay visible
  });

  async function saveMeasureFor(code: string, concept: string, unit: string, dp = 1, extra: Record<string, unknown> = {}) {
    const t0 = await pg.query<{ id: string }>(`SELECT id FROM test_catalogue WHERE code = $1 AND hospital_id IS NULL`, [code]);
    await tx((t) =>
      saveMeasure(t, lead(), { testId: t0.rows[0]!.id, conceptId: concept, draft: { ...num(unit, dp), ...extra } }, new Date()),
    );
  }

  it("S5, AP-4, AP-5: a DH-615 profile is usable only when checks and verification are done; receipt pins it", async () => {
    const id = await tx((t) => createProfile(t, lead(), { modelId: "dymind_dh615", bench: null }, new Date()));
    await expect(tx((t) => activateProfile(t, lead(), { profileId: id }, new Date()))).rejects.toThrow(/Not yet/);
    for (const code of ["HCT", "PDW"])
      await tx((t) => resolveCheck(t, lead(), { profileId: id, code, resolution: "fixture: from the manual" }));
    const profile = await pg.query<{ mappings: { concept: string; visibility: string }[] }>(`SELECT mappings FROM analyser_profiles WHERE id = $1`, [id]);
    for (const m of profile.rows[0]!.mappings.filter((x) => x.visibility !== "never"))
      await tx((t) => setVerified(t, lead(), { profileId: id, concept: m.concept, verified: true }));
    await tx((t) => activateProfile(t, lead(), { profileId: id }, new Date()));
    for (const [c, u] of [["obs.haemoglobin", "g/dL"], ["obs.p_lcr", "%"]] as const) await saveMeasureFor("test.fbc", c, u);
    const r = await received(FBC, "female", "1992-01-01");
    const pinned = await pg.query(
      `SELECT e.profile_id FROM specimen_events e JOIN specimens s ON s.id = e.specimen_id WHERE s.order_id = $1`,
      [r.orderId],
    );
    expect(pinned.rows[0]).toEqual({ profile_id: id });
    // S7, AP-6: P-LCR is stored, marked lab-only; a research-use value has no row and is refused.
    const rep = await enter(r, [
      { conceptId: "obs.haemoglobin", value: "13.5" },
      { conceptId: "obs.p_lcr", value: "30.0" },
    ]);
    const s = await snaps(rep.id);
    expect(s.find((x) => x.concept_id === "obs.p_lcr")?.lab_only).toBe(true);
    expect(s.find((x) => x.concept_id === "obs.haemoglobin")?.lab_only).toBe(false);
    expect(s.find((x) => x.concept_id === "obs.haemoglobin")?.profile_id).toBe(id);
  });

  it("S8, S11, S12, DS-9: the Hb scheme with elevation flags moderate; the category is snapshotted and kept", async () => {
    await config("scheme", "obs.haemoglobin", HB);
    await config("flag_basis", "obs.haemoglobin", { basis: "scheme" });
    const r1 = await received(FBC, "female", "1992-01-01");
    const noElev = await snaps((await enter(r1, [{ conceptId: "obs.haemoglobin", value: "11.5" }])).id);
    expect(noElev[0]!.interpretation).toMatchObject({ basis: "scheme", category: { code: "mild" }, notes: ["altitude_not_adjusted"] });
    await config("elevation", "hospital", { metres: 1200, source: "fixture survey" });
    const r2 = await received(FBC, "female", "1992-01-01");
    const s = await snaps((await enter(r2, [{ conceptId: "obs.haemoglobin", value: "10.4" }])).id);
    expect(s[0]!.interpretation).toMatchObject({
      basis: "scheme",
      category: { code: "moderate", abnormal: true, direction: "low" },
      adjustments: [{ kind: "elevation", metres: 1200, amount: "1.0" }],
    });
    expect(s[0]!.flag_computed).toBe("low");
    // A new scheme version later: the released snapshot is append-only and keeps its category.
    await config("scheme", "obs.haemoglobin", { ...HB, label: "Fixture anaemia scheme v2" });
    const again = await snaps(s[0]!.report_id as string);
    expect((again[0]!.interpretation as { scheme: { label: string } }).scheme.label).toBe("Fixture anaemia scheme");
  });

  it("S13, S14, EG-*: eGFR from an IDMS-traceable creatinine, not for an undeclared method; recalculated on amendment", async () => {
    const constants = Object.fromEntries(EGFR_CONSTANTS.map((c) => [c, "1"]));
    await config("ref", EGFR_REF, { constants: { ...constants, a: "100", b: "-1", umolPerMgdl: "100", adultAgeYears: "18" }, source: "fixture" }, true);
    await pg.query(`INSERT INTO lab_settings (hospital_id, report_egfr) VALUES ($1, true) ON CONFLICT (hospital_id) DO UPDATE SET report_egfr = true`, [h]);
    await saveMeasureFor("test.creatinine", "obs.creatinine", "umol/L", 0);
    await saveMeasureFor("test.creatinine", "obs.egfr", "mL/min/{1.73_m2}", 0);
    const undeclared = await received(CREAT, "male", "1980-01-01");
    const s0 = await snaps((await enter(undeclared, [{ conceptId: "obs.creatinine", value: "200" }])).id);
    expect(s0.map((x) => x.concept_id)).toEqual(["obs.creatinine"]);
    expect(s0[0]!.interpretation).toMatchObject({ egfr: "method_not_traceable" });
    await saveMeasureFor("test.creatinine", "obs.creatinine", "umol/L", 0, { methodCode: "enzymatic", idmsTraceable: true });
    const r = await received(CREAT, "male", "1980-01-01");
    const prelim = await enter(r, [{ conceptId: "obs.creatinine", value: "200" }], "preliminary");
    const rep = await as(a.lab!, r.p, (ctx) =>
      releaseResults(ctx, { patientUserId: r.p, reportId: prelim.id, clientKey: key() }),
    );
    const s = await snaps(rep.id);
    expect(s.find((x) => x.concept_id === "obs.egfr")?.value_text).toBe("50");
    expect(s.find((x) => x.concept_id === "obs.creatinine")?.method_code).toBe("enzymatic");
    const amended = await as(a.lab!, r.p, (ctx) =>
      amendResults(ctx, {
        patientUserId: r.p,
        reportId: rep.id,
        status: "amended",
        values: [{ conceptId: "obs.creatinine", value: "400" }],
        reasonText: "Fixture: transcription corrected",
        clientKey: key(),
      }),
    );
    expect((await snaps(amended.id)).find((x) => x.concept_id === "obs.egfr")?.value_text).toBe("25");
    const teen = await received(CREAT, "male", new Date(Date.now() - 17 * 365.25 * 86_400_000).toISOString().slice(0, 10));
    const st = await snaps((await enter(teen, [{ conceptId: "obs.creatinine", value: "200" }])).id);
    expect(st[0]!.interpretation).toMatchObject({ egfr: "under_adult_age" });
  });
});
