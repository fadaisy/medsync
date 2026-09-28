/**
 * Clerking examination v2 on the PGlite lane (PROMPT-CLERKING-EXAM-V2 §8, §9): "Save as a new set"
 * through recordObservations (air or oxygen with SpO₂, the glucose context, ACVPU), the desk loader
 * reading the set back into NEWS2, and what signing charts from the examination. EMR_PGLITE=1.
 */
import type { Lane } from "./_pglite";
import type { ExamDraft } from "@/lib/clerking/exam/payload";
import type { EmrActor } from "@/lib/emr/actor";
import type { NoteContent } from "@/lib/emr/notes";
import type { WriteCtx } from "@/lib/emr/write/context";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { emptyHistory } from "@/lib/clerking/answers";
import * as A from "@/lib/clerking/exam/answers";
import { EXAM_CATALOGUE as ecat } from "@/lib/clerking/exam/load";
import { emptyExam } from "@/lib/clerking/exam/payload";
import { saveLines } from "@/lib/clerking/exam/vitals";
import { loadDeskFor } from "@/lib/emr/read/desk";
import { withPatientWrite } from "@/lib/emr/write/context";
import * as facts from "@/lib/emr/write/facts";
import * as notes from "@/lib/emr/write/notes";
import { encrypt, generateKey } from "@/lib/encryption";
import {
  bootLane,
  department,
  encounter,
  hospital,
  intake,
  laneOn,
  patient,
  staff,
} from "./_pglite";

const key = () => `k-${crypto.randomUUID()}`;
const HMAC_KEY = Buffer.alloc(32, 9).toString("base64");
const savedKey = process.env.MEDSYNC_NOTE_HMAC_KEY;

function examDraft(acvpu: "A" | "C"): ExamDraft {
  let d = A.setChoice(ecat, emptyExam(ecat.version), "ex.general.oxygen", "room_air");
  d = A.setBlocks(d, {
    consciousness:
      acvpu === "A"
        ? { method: "gcs", E: 4, V: 5, M: 6 }
        : { method: "gcs", E: 4, V: 4, M: 6, acvpu: "C" },
  });
  return {
    ...d,
    vitalsDraft: {
      bp: "118/76",
      position: "lying",
      pulse: "58",
      rhythm: "regular",
      rr: "14",
      spo2: "96",
      temp: "35,8",
      site: "axillary",
      glucose: "6.1",
      glucoseContext: "two_hours_after_food",
    },
  };
}

describe.skipIf(!laneOn)("clerking examination v2 (PGlite lane)", () => {
  let lane: Lane;
  let h: string;
  let mo: EmrActor;
  let p: string;
  let enc: string;
  let dept: string;
  const as = <T>(a: EmrActor, fn: (ctx: WriteCtx) => Promise<T>) =>
    withPatientWrite(a, p, fn, { database: lane.db });

  beforeAll(async () => {
    process.env.MEDSYNC_PHI_KEY ??= generateKey();
    process.env.MEDSYNC_NOTE_HMAC_KEY = HMAC_KEY;
    lane = await bootLane();
    h = await hospital(lane.pg);
    dept = await department(lane.pg, h);
    const s = await staff(lane.pg, { hospitalId: h, departmentId: dept, cadre: "MEDICAL_OFFICER" });
    mo = {
      userId: s.userId,
      fullName: null,
      hospitalId: h,
      departmentId: dept,
      affiliationId: s.affiliationId,
      cadreCode: "MEDICAL_OFFICER",
      isClinical: true,
      surface: "doctor",
    };
    p = await patient(lane.pg);
    await lane.pg.query(
      `INSERT INTO public.patient_profiles (id, first_name_encrypted, surname_encrypted, sex, date_of_birth, id_type,
         phone_encrypted, district_id)
       VALUES ($1, $2, $3, 'female', '1968-03-01', 'none', $4, (SELECT id FROM public.districts LIMIT 1))`,
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

  it("Save as a new set writes one batch with air or oxygen, the glucose context and ACVPU", async () => {
    const set = saveLines(ecat, examDraft("A"), "set-1");
    expect(set.ok).toBe(true);
    if (!set.ok) return;
    await as(mo, (ctx) =>
      facts.recordObservations(ctx, {
        patientUserId: p,
        encounterId: enc,
        clientKey: "set-1",
        observations: set.lines,
      }),
    );
    const rows = await lane.pg.query<{
      concept_id: string;
      value_code: string | null;
      fasting_state: string | null;
      challenge: string | null;
      challenge_minutes: number | null;
      context: Record<string, unknown>;
    }>(
      `SELECT concept_id, value_code, fasting_state, challenge, challenge_minutes, context FROM public.clinical_observations
        WHERE patient_user_id = $1 AND encounter_id = $2 AND concept_id IS NOT NULL`,
      [p, enc],
    );
    const by = new Map(rows.rows.map((r) => [r.concept_id, r]));
    expect(by.get("obs.spo2")!.context).toMatchObject({
      oxygenSupport: "room_air",
      readingSetId: "set-1",
      acvpu: "A",
    });
    expect(by.get("obs.glucose")).toMatchObject({
      fasting_state: "non_fasting",
      challenge: "meal",
      challenge_minutes: 120,
    });
    expect(by.get("obs.avpu")).toMatchObject({ value_code: "alert" });
    expect(by.get("obs.bp_systolic")!.context).toMatchObject({
      position: "supine",
      arm: "right",
      cuffSize: "adult",
    });
    expect(by.get("obs.temperature")!.context).toMatchObject({ site: "axillary" });
    // A replay of the same set adds nothing (the reading-set id is the batch key).
    await as(mo, (ctx) =>
      facts.recordObservations(ctx, {
        patientUserId: p,
        encounterId: enc,
        clientKey: "set-1",
        observations: set.lines,
      }),
    );
    const again = await lane.pg.query(
      `SELECT 1 FROM public.clinical_observations WHERE encounter_id = $1 AND concept_id = 'obs.spo2'`,
      [enc],
    );
    expect(again.rows).toHaveLength(1);
  });

  it("the loader reads the set back: NEWS2 has air or oxygen and consciousness (E-3 resolved)", async () => {
    const on = (await loadDeskFor(mo, enc, { database: lane.db, clerkingV2: true }))!.payload;
    const k = on.clerking!;
    expect(k.vitals.oxygen).toBe("air");
    expect(k.vitals.consciousness).toBe("A");
    expect(k.exam.set).toMatchObject({
      arm: "right",
      position: "supine",
      glucoseContext: "two_hours_after_food",
      oxygen: "air",
      acvpu: "A",
    });
    expect(k.exam.latest).toMatchObject({ sbp: 118, glucose: 6.1 });
    expect(k.exam.catalogueUrl).toMatch(/^\/api\/clerking\/exam-catalogue\?v=[0-9a-f]{16}$/);
  });

  it("ACVPU C is written as obs.avpu new_confusion (CFC v1.3, 0083) and reads back as C", async () => {
    const set = saveLines(ecat, examDraft("C"), "set-2");
    if (!set.ok) throw new Error("not ok");
    expect(set.lines.find((l) => l.conceptId === "obs.avpu")!.value).toEqual({
      type: "coded",
      code: "new_confusion",
    });
    await as(mo, (ctx) =>
      facts.recordObservations(ctx, {
        patientUserId: p,
        encounterId: enc,
        clientKey: "set-2",
        observations: set.lines,
      }),
    );
    const on = (await loadDeskFor(mo, enc, { database: lane.db, clerkingV2: true }))!.payload;
    expect(on.clerking!.vitals.consciousness).toBe("C");
  });

  it("signing charts the mapped findings and keeps the rest in the note", async () => {
    let exam = A.setState(ecat, emptyExam(ecat.version), "ex.general.pallor", "positive");
    exam = A.setAttr(ecat, exam, "ex.general.pallor", "degree", "moderate");
    exam = A.setState(ecat, exam, "ex.general.jaundice", "negative");
    exam = A.setState(ecat, exam, "ex.respiratory.crackles", "positive"); // no concept yet
    exam = A.setAttr(ecat, exam, "ex.general.nutrition", "muac", 21);
    const content: NoteContent = {
      schema: 2,
      catalogueVersion: "1.0.0-draft",
      header: { historian: "patient" },
      history: {
        ...emptyHistory(),
        complaints: [{ key: "c", symptom: "sym.cough", props: {}, flags: {} }],
      } as unknown as NoteContent["history"],
      exam: exam as unknown as NoteContent["exam"],
      sections: {
        s13: { items: [{ kind: "diagnosis_deferred", reason: "Awaiting results" }] },
        s14: { items: [{ kind: "plan_statement", text: "Review" }] },
      },
      edited: {},
    };
    const d = await as(mo, (ctx) =>
      notes.saveNoteDraft(ctx, {
        patientUserId: p,
        encounterId: enc,
        templateId: "tpl.clerking.adult_v2",
        content,
        clientKey: key(),
      }),
    );
    const signed = await as(mo, (ctx) => notes.signNote(ctx, { patientUserId: p, noteId: d.id }));
    expect((signed.warnings ?? []).join(" ")).not.toMatch(/no catalogue concept/); // with 0082 and 0083, all chart
    expect(signed.warnings ?? []).not.toContain("No examination recorded.");
    const rows = await lane.pg.query<{
      concept_id: string;
      presence: string | null;
      value_num: string | null;
      context: Record<string, unknown>;
    }>(
      `SELECT concept_id, presence, value_num, context FROM public.clinical_observations
        WHERE patient_user_id = $1 AND concept_id IN ('sign.pallor','sign.jaundice','obs.muac','sign.chest_crackles','sx.cough')`,
      [p],
    );
    const by = new Map(rows.rows.map((r) => [r.concept_id, r]));
    expect(by.get("sign.pallor")).toMatchObject({ presence: "present" });
    expect(by.get("sign.pallor")!.context).toMatchObject({
      elicitedBy: "examination",
      catalogueItem: "ex.general.pallor",
      qualifiers: { degree: "moderate" },
    });
    expect(by.get("sign.jaundice")).toMatchObject({ presence: "absent" });
    expect(Number(by.get("obs.muac")!.value_num)).toBe(21);
    expect(by.get("sign.chest_crackles")).toMatchObject({ presence: "present" });
    expect(by.get("sx.cough")).toMatchObject({ presence: "present" }); // history, CFC v1.2
  });

  it("M5: a concept not yet seeded stays in the note and never fails the signature", async () => {
    const enc3 = await encounter(lane.pg, {
      hospitalId: h,
      patientUserId: p,
      clinicianUserId: mo.userId,
      departmentId: dept,
    });
    await lane.pg.exec(`DELETE FROM public.clinical_concepts WHERE id = 'sign.pleural_rub'`);
    const exam = A.setState(
      ecat,
      A.setState(ecat, emptyExam(ecat.version), "ex.respiratory.pleural_rub", "positive"),
      "ex.general.pallor",
      "negative",
    );
    const content: NoteContent = {
      schema: 2,
      catalogueVersion: "1.0.0-draft",
      header: { historian: "patient" },
      history: {
        ...emptyHistory(),
        complaints: [{ key: "c", symptom: "sym.cough", props: {}, flags: {} }],
      } as unknown as NoteContent["history"],
      exam: exam as unknown as NoteContent["exam"],
      sections: {
        s13: { items: [{ kind: "diagnosis_deferred", reason: "Awaiting results" }] },
        s14: { items: [{ kind: "plan_statement", text: "Review" }] },
      },
      edited: {},
    };
    const d = await as(mo, (ctx) =>
      notes.saveNoteDraft(ctx, {
        patientUserId: p,
        encounterId: enc3,
        templateId: "tpl.clerking.adult_v2",
        content,
        clientKey: key(),
      }),
    );
    const signed = await as(mo, (ctx) => notes.signNote(ctx, { patientUserId: p, noteId: d.id }));
    expect((signed.warnings ?? []).join(" ")).toMatch(
      /1 finding\(s\) have no catalogue concept: kept in the note/,
    );
    const rows = await lane.pg.query(
      `SELECT concept_id FROM public.clinical_observations WHERE encounter_id = $1 AND concept_id IS NOT NULL`,
      [enc3],
    );
    expect(rows.rows.map((r) => (r as { concept_id: string }).concept_id).sort()).toEqual([
      "sign.pallor",
      "sx.cough",
    ]);
    // Re-seed from 0083 (a re-run restores only what is missing).
    const { readFileSync } = await import("node:fs");
    await lane.pg.exec(readFileSync("supabase/migrations/0083_cfc_v1_3_examination.sql", "utf8"));
  });
});

describe.skipIf(!laneOn)("CFC addenda 0082 and 0083 (PGlite lane)", () => {
  it("apply cleanly after 0076: codes resolve to symptom_catalog, one code one concept, ACVPU C answerable", async () => {
    const lane = await bootLane();
    const q = async (sql: string) => (await lane.pg.query<Record<string, unknown>>(sql)).rows;
    expect(
      (
        await q(
          `SELECT count(*)::int n FROM public.clinical_concepts WHERE catalogue_version = '1.2.0'`,
        )
      )[0]!.n,
    ).toBe(86);
    expect(
      (
        await q(
          `SELECT count(*)::int n FROM public.clinical_concepts WHERE catalogue_version = '1.3.0'`,
        )
      )[0]!.n,
    ).toBe(165);
    expect(
      await q(`SELECT symptom_code FROM public.clinical_concepts WHERE id = 'sx.fever'`),
    ).toEqual([{ symptom_code: "fever" }]);
    expect(
      await q(
        `SELECT symptom_code FROM public.clinical_concepts WHERE id IN ('sx.tinnitus','sx.hearing_loss')`,
      ),
    ).toEqual([{ symptom_code: null }, { symptom_code: null }]);
    expect(
      (await q(`SELECT answers FROM public.clinical_concepts WHERE id = 'obs.avpu'`))[0]!.answers,
    ).toContain("new_confusion");
    // Re-running both is a no-op.
    const { readFileSync } = await import("node:fs");
    for (const f of ["0082_cfc_v1_2_clerking_findings.sql", "0083_cfc_v1_3_examination.sql"])
      await lane.pg.exec(readFileSync(`supabase/migrations/${f}`, "utf8"));
    expect(
      (
        await q(
          `SELECT count(*)::int n FROM public.clinical_concepts WHERE catalogue_version IN ('1.2.0','1.3.0')`,
        )
      )[0]!.n,
    ).toBe(251);
    const avpu = (await q(`SELECT answers FROM public.clinical_concepts WHERE id = 'obs.avpu'`))[0]!
      .answers as string[];
    expect(avpu.filter((a) => a === "new_confusion")).toHaveLength(1);
  }, 180_000);
});
