/**
 * Clerking desk v2 on the PGlite lane: migration 0076 (medicine details, hospital clinical
 * settings with RLS and audit, 17 new vocabulary tokens), the v2 draft and what signing commits,
 * "Continue in the new format", and the desk loader's v2 block. EMR_PGLITE=1.
 */
import type { Lane } from "./_pglite";
import type { History } from "@/lib/clerking/answers";
import type { EmrActor } from "@/lib/emr/actor";
import type { NoteContent } from "@/lib/emr/notes";
import type { WriteCtx } from "@/lib/emr/write/context";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { emptyHistory } from "@/lib/clerking/answers";
import { writeOutbreakMode } from "@/lib/clerking/outbreak";
import { loadDeskFor } from "@/lib/emr/read/desk";
import { withPatientWrite } from "@/lib/emr/write/context";
import * as facts from "@/lib/emr/write/facts";
import * as notes from "@/lib/emr/write/notes";
import { decrypt, encrypt, generateKey } from "@/lib/encryption";
import {
  bootLane,
  department,
  encounter,
  hospital,
  intake,
  laneOn,
  patient,
  probe,
  staff,
} from "./_pglite";

const key = () => `k-${crypto.randomUUID()}`;
const HMAC_KEY = Buffer.alloc(32, 9).toString("base64");
const savedKey = process.env.MEDSYNC_NOTE_HMAC_KEY;

function history(): History {
  return {
    ...emptyHistory(),
    complaints: [
      {
        key: "pp",
        symptom: "sym.polyuria",
        duration: { value: 3, unit: "weeks" },
        props: { onset: "gradual", nocturia: 4, associated: ["sym.weight_loss"] },
        flags: { vomiting: "no" },
      },
      { key: "x", symptom: null, text: "Feels unwell", props: {}, flags: {} },
    ],
    ros: { "sym.fatigue": "no", "sym.abdominal_pain": "yes", "sym.low_mood": "yes" },
    rosDetail: { "sym.abdominal_pain": { props: { site: "epigastric", severity: 4 }, flags: {} } },
    social: { tobacco: "former", perDay: 10, years: 20 },
    family: {
      hypertension: { answer: "yes", relations: ["mother", "grandparent"] },
      mental_illness: { answer: "yes", relations: ["father"] },
      diabetes: { answer: "no" },
    },
  };
}

const V2 = (h: History): NoteContent => ({
  schema: 2,
  catalogueVersion: "1.0.0-draft",
  header: { historian: "patient" },
  history: h as unknown as NoteContent["history"],
  sections: {
    s13: { items: [{ kind: "diagnosis_deferred", reason: "Awaiting glucose" }] },
    s14: { items: [{ kind: "plan_statement", text: "Review with results" }] },
  },
  edited: {},
});

describe.skipIf(!laneOn)("clerking desk v2 (PGlite lane)", () => {
  let lane: Lane;
  let h: string;
  let h2: string;
  let mo: EmrActor;
  let other: EmrActor;
  let p: string;
  let enc: string;
  let dept: string;

  const actor = async (
    hospitalId: string,
    dept: string,
    cadre = "MEDICAL_OFFICER",
  ): Promise<EmrActor> => {
    const s = await staff(lane.pg, { hospitalId, departmentId: dept, cadre });
    return {
      userId: s.userId,
      fullName: null,
      hospitalId,
      departmentId: dept,
      affiliationId: s.affiliationId,
      cadreCode: cadre,
      isClinical: true,
      surface: "doctor",
    };
  };
  const as = <T>(a: EmrActor, fn: (ctx: WriteCtx) => Promise<T>, patientUserId = p) =>
    withPatientWrite(a, patientUserId, fn, { database: lane.db });

  beforeAll(async () => {
    process.env.MEDSYNC_PHI_KEY ??= generateKey();
    process.env.MEDSYNC_NOTE_HMAC_KEY = HMAC_KEY;
    lane = await bootLane();
    h = await hospital(lane.pg);
    h2 = await hospital(lane.pg, "Elsewhere");
    dept = await department(lane.pg, h);
    mo = await actor(h, dept);
    other = await actor(h2, await department(lane.pg, h2));
    p = await patient(lane.pg);
    await lane.pg.query(
      `INSERT INTO public.patient_profiles (id, first_name_encrypted, surname_encrypted, sex, date_of_birth, id_type,
         phone_encrypted, district_id)
       VALUES ($1, $2, $3, 'male', '1950-03-01', 'none', $4, (SELECT id FROM public.districts LIMIT 1))`,
      [p, encrypt("Test"), encrypt("Patient"), encrypt("0700000000")],
    );
    enc = await encounter(lane.pg, {
      hospitalId: h,
      patientUserId: p,
      clinicianUserId: mo.userId,
      departmentId: dept,
    });
    await intake(lane.pg, { hospitalId: h, patientUserId: p });
  }, 180_000);

  afterAll(() => {
    if (savedKey === undefined) delete process.env.MEDSYNC_NOTE_HMAC_KEY;
    else process.env.MEDSYNC_NOTE_HMAC_KEY = savedKey;
  });

  it("0076: 17 new shared tokens, off the v1 review-of-systems screen", async () => {
    const r = await lane.pg.query<{ n: number; screened: number }>(
      `SELECT count(*)::int AS n, count(*) FILTER (WHERE ros_screen)::int AS screened
         FROM public.symptom_catalog WHERE source LIKE 'MS-EMR-CLERK-CAT-001%'`,
    );
    expect(r.rows[0]).toEqual({ n: 17, screened: 0 });
  });

  it("0076: outbreak mode needs a reason, is audited, readable by the hospital's clinicians only, written by no client", async () => {
    await expect(
      writeOutbreakMode({ userId: mo.userId, hospitalId: h }, { on: true, reason: " " }, lane.db),
    ).rejects.toThrow();
    await writeOutbreakMode(
      { userId: mo.userId, hospitalId: h },
      { on: true, reason: "Bundibugyo outbreak declared" },
      lane.db,
    );
    const audit = await lane.pg.query(
      `SELECT count(*)::int AS n FROM public.audit_log WHERE table_name = 'hospital_clinical_settings'`,
    );
    expect((audit.rows[0] as { n: number }).n).toBeGreaterThan(0);
    const mine = await probe(
      lane.pg,
      { role: "authenticated", userId: mo.userId },
      `SELECT outbreak_mode FROM public.hospital_clinical_settings`,
    );
    expect(mine).toMatchObject({ ok: true, rows: [{ outbreak_mode: true }] });
    const theirs = await probe(
      lane.pg,
      { role: "authenticated", userId: other.userId },
      `SELECT outbreak_mode FROM public.hospital_clinical_settings`,
    );
    expect(theirs).toMatchObject({ ok: true, rows: [] });
    const write = await probe(
      lane.pg,
      { role: "authenticated", userId: mo.userId },
      `UPDATE public.hospital_clinical_settings SET outbreak_mode = false`,
    );
    expect(write.ok ? write.affected : 0).toBe(0);
    await writeOutbreakMode(
      { userId: mo.userId, hospitalId: h },
      { on: false, reason: "" },
      lane.db,
    );
  });

  it("medicines carry the patient's account; a change is the next version, dose encrypted", async () => {
    const r = await as(mo, (ctx) =>
      facts.recordMedicationStatements(ctx, {
        patientUserId: p,
        encounterId: enc,
        clientKey: key(),
        statements: [
          {
            drugText: "Amlodipine",
            medicationStatus: "active",
            medicationSource: "external_record",
            doseText: "5 mg",
            frequencyCode: "od",
            adherence: "sometimes_misses",
            informant: "medicine_card",
          },
        ],
      }),
    );
    const k = key();
    const u = await as(mo, (ctx) =>
      facts.updateMedicineDetails(ctx, {
        patientUserId: p,
        encounterId: enc,
        clientKey: k,
        statementId: r.id,
        adherence: "stopped",
      }),
    );
    expect(
      (
        await as(mo, (ctx) =>
          facts.updateMedicineDetails(ctx, {
            patientUserId: p,
            encounterId: enc,
            clientKey: k,
            statementId: r.id,
            adherence: "stopped",
          }),
        )
      ).id,
    ).toBe(u.id);
    const rows = await lane.pg.query<{
      version: number;
      adherence: string;
      frequency_code: string;
      informant: string;
      dose_text_ciphertext: string;
    }>(
      `SELECT version, adherence, frequency_code, informant, dose_text_ciphertext FROM public.medication_statements
        WHERE logical_id = $1 ORDER BY version`,
      [r.id],
    );
    expect(rows.rows.map((x) => [x.version, x.adherence, x.frequency_code, x.informant])).toEqual([
      [1, "sometimes_misses", "od", "medicine_card"],
      [2, "stopped", "od", "medicine_card"],
    ]);
    expect(decrypt(rows.rows[1]!.dose_text_ciphertext)).toBe("5 mg");
    await expect(
      lane.pg.query(
        `UPDATE public.medication_statements SET adherence = 'sometimes' WHERE id = $1`,
        [r.id],
      ),
    ).rejects.toThrow();
  });

  it("a restricted catalogue pick (antiretrovirals) is stored restricted; a typed one is not (Law 10)", async () => {
    const r = await as(mo, (ctx) =>
      facts.recordMedicationStatements(ctx, {
        patientUserId: p,
        encounterId: enc,
        clientKey: key(),
        statements: [
          {
            drugText: "Antiretrovirals",
            medicationStatus: "active",
            medicationSource: "patient_reported",
            informant: "patient",
            restricted: true,
          },
          {
            drugText: "Herbal medicine",
            medicationStatus: "active",
            medicationSource: "patient_reported",
          },
        ],
      }),
    );
    const rows = await lane.pg.query<{ id: string; sensitivity: string }>(
      `SELECT id, sensitivity FROM public.medication_statements WHERE id = ANY($1::uuid[])`,
      [r.ids],
    );
    const by = new Map(rows.rows.map((x) => [x.id, x.sensitivity]));
    expect(by.get(r.ids[0]!)).toBe("restricted");
    expect(by.get(r.ids[1]!)).toBe("standard");
    // A details change keeps it restricted (the next version never lowers sensitivity).
    const u = await as(mo, (ctx) =>
      facts.updateMedicineDetails(ctx, {
        patientUserId: p,
        encounterId: enc,
        clientKey: key(),
        statementId: r.ids[0]!,
        adherence: "as_prescribed",
      }),
    );
    const next = await lane.pg.query<{ sensitivity: string }>(
      `SELECT sensitivity FROM public.medication_statements WHERE id = $1`,
      [u.id],
    );
    expect(next.rows[0]!.sensitivity).toBe("restricted");
  });

  it("a v2 draft saves and signs; complaints and review answers commit as findings, tobacco as soc.tobacco", async () => {
    const d = await as(mo, (ctx) =>
      notes.saveNoteDraft(ctx, {
        patientUserId: p,
        encounterId: enc,
        templateId: "tpl.clerking.adult_v2",
        content: V2(history()),
        clientKey: key(),
      }),
    );
    const signed = await as(mo, (ctx) => notes.signNote(ctx, { patientUserId: p, noteId: d.id }));
    expect(signed.id).toBe(d.id);
    const obs = await lane.pg.query<{
      concept_id: string;
      presence: string | null;
      value_code: string | null;
      context: Record<string, unknown>;
      sensitivity: string;
    }>(
      `SELECT concept_id, presence, value_code, context, sensitivity FROM public.clinical_observations
        WHERE patient_user_id = $1 AND concept_id IS NOT NULL ORDER BY concept_id`,
      [p],
    );
    const by = new Map(obs.rows.map((r) => [r.concept_id, r]));
    expect(by.get("sx.polyuria")).toMatchObject({ presence: "present" });
    expect(by.get("sx.polyuria")!.context).toMatchObject({
      presentingComplaint: true,
      catalogueSymptom: "sym.polyuria",
      durationDays: 21,
      qualifiers: { onset: "gradual", nocturia: 4 },
      redFlags: { vomiting: "no" },
    });
    expect(by.get("sx.nocturia")).toMatchObject({ presence: "present" }); // linked from nocturia ≥ 1
    expect(by.get("sx.weight_loss_unintended")).toMatchObject({ presence: "present" }); // linked, associated
    expect(by.get("sx.fatigue")).toMatchObject({ presence: "absent" });
    expect(by.get("sx.abdominal_pain")!.context).toMatchObject({
      qualifiers: { site: "epigastric", severity: 4 },
    });
    expect(by.get("soc.tobacco")).toMatchObject({ value_code: "former" });
    // Family history: one condition per relative, never self; a restricted item stays restricted.
    const fam = await lane.pg.query<{ subject_relation: string; sensitivity: string }>(
      `SELECT subject_relation, sensitivity FROM public.conditions
        WHERE patient_user_id = $1 AND subject_relation <> 'self' ORDER BY subject_relation`,
      [p],
    );
    expect(fam.rows).toEqual([
      { subject_relation: "father", sensitivity: "restricted" },
      { subject_relation: "mother", sensitivity: "standard" },
      { subject_relation: "second_degree", sensitivity: "standard" },
    ]);
    const self = await lane.pg.query(
      `SELECT 1 FROM public.conditions WHERE patient_user_id = $1 AND subject_relation = 'self'`,
      [p],
    );
    expect(self.rows).toHaveLength(0);
  });

  it("the desk loader: v2 off gives the v1 form; on gives the v2 form and the record block", async () => {
    const enc2 = await encounter(lane.pg, {
      hospitalId: h,
      patientUserId: p,
      clinicianUserId: mo.userId,
      departmentId: dept,
    });
    const off = (await loadDeskFor(mo, enc2, { database: lane.db, clerkingV2: false }))!.payload;
    expect(off.template.id).toBe("tpl.clerking.adult_opd");
    expect(off.clerking).toBeUndefined();
    const on = (await loadDeskFor(mo, enc2, { database: lane.db, clerkingV2: true }))!.payload;
    expect(on.template.id).toBe("tpl.clerking.adult_v2");
    expect(on.fullForm).toBe("tpl.clerking.adult_v2");
    expect(on.clerking).toMatchObject({
      catalogueVersion: "1.0.0-draft",
      canSeeRestricted: true,
      outbreakMode: false,
    });
    expect(on.clerking!.medicines.map((m) => m.name)).toContain("Amlodipine");
    // A typed medicine is named in the chart too, not "Medicine not named".
    expect(on.context.medicines.map((m) => m.display)).toContain("Amlodipine");
    expect(on.clerking).toMatchObject({ sex: "male", ageYears: expect.any(Number) });
    // What signing charts, for the sign dialog's count: symptoms whose token has a CFC concept.
    expect(on.clerking!.chartable).toContain("sym.polyuria");
    expect(on.clerking!.chartable.length).toBeGreaterThan(5);
    expect(on.clerking!.catalogueUrl).toMatch(/^\/api\/clerking\/catalogue\?v=[0-9a-f]{16}$/);
  });

  it("Continue in the new format: the author's own unsigned v1 draft only, mapping what maps", async () => {
    const enc3 = await encounter(lane.pg, {
      hospitalId: h,
      patientUserId: p,
      clinicianUserId: mo.userId,
      departmentId: dept,
    });
    const v1: NoteContent = {
      header: { historian: "carer", language: "Luganda" },
      sections: {
        s01: {
          items: [
            { kind: "complaint_token", token: "sx.polyuria", durationDays: 14, label: "Polyuria" },
          ],
        },
        s02: { narrative: "Two weeks of passing a lot of urine." },
        s13: { items: [{ kind: "diagnosis_deferred", reason: "Awaiting glucose" }] },
      },
    };
    const d = await as(mo, (ctx) =>
      notes.saveNoteDraft(ctx, {
        patientUserId: p,
        encounterId: enc3,
        templateId: "tpl.clerking.adult_opd",
        content: v1,
        clientKey: key(),
      }),
    );
    // A v1 draft never silently becomes v2 through autosave.
    await expect(
      as(mo, (ctx) =>
        notes.saveNoteDraft(ctx, {
          patientUserId: p,
          encounterId: enc3,
          noteId: d.id,
          revision: d.revision,
          templateId: "tpl.clerking.adult_v2",
          content: V2(emptyHistory()),
          clientKey: key(),
        }),
      ),
    ).rejects.toMatchObject({ code: "invalid" });
    await expect(
      as(other, (ctx) =>
        notes.convertDraftToV2(ctx, { patientUserId: p, noteId: d.id, revision: d.revision }),
      ),
    ).rejects.toBeTruthy();
    const c = await as(mo, (ctx) =>
      notes.convertDraftToV2(ctx, { patientUserId: p, noteId: d.id, revision: d.revision }),
    );
    expect(c.revision).toBe(d.revision + 1);
    const row = (
      await lane.pg.query<{ template_id: string; content_ciphertext: string }>(
        `SELECT template_id, content_ciphertext FROM public.clinical_notes WHERE id = $1`,
        [d.id],
      )
    ).rows[0]!;
    expect(row.template_id).toBe("tpl.clerking.adult_v2");
    const content = JSON.parse(decrypt(row.content_ciphertext)) as NoteContent;
    expect(content).toMatchObject({
      schema: 2,
      header: { historian: "carer", language: "Luganda" },
      history: {
        complaints: [{ symptom: "sym.polyuria", duration: { value: 14, unit: "days" } }],
        story: "Two weeks of passing a lot of urine.",
      },
      sections: { s13: { items: [{ kind: "diagnosis_deferred" }] } },
    });
    await expect(
      as(mo, (ctx) =>
        notes.convertDraftToV2(ctx, { patientUserId: p, noteId: d.id, revision: c.revision }),
      ),
    ).rejects.toMatchObject({ code: "invalid" });
  });
});
