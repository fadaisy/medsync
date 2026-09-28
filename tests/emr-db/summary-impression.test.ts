/**
 * PROMPT-CLERKING-SUMMARY-IMPRESSION §3 and §9 on the PGlite lane. S-3 and S-4 were the defects
 * found in production (28 Sep 2026), written as `it.fails` at STOP 0 and now fixed; the rest are the
 * server side signed at GATE A: the swap and the demotion guard (D-SI-05, D-SI-21), a junior's Final
 * and its co-signature on migration 0084 (D-SI-09, D-SI-23), the order reason currency check (Q10),
 * the desk read's logical ids (D-SI-19) and the signing snapshot (D-SI-20). EMR_PGLITE=1.
 */
import type { Lane } from "./_pglite";
import type { SignedDiagnosis } from "@/lib/clerking/payload";
import type { EmrActor } from "@/lib/emr/actor";
import type { NoteContent } from "@/lib/emr/notes";
import type { WriteCtx } from "@/lib/emr/write/context";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { emptyHistory } from "@/lib/clerking/answers";
import { dxTermUuid } from "@/lib/clerking/impression/load";
import { canonicalNote, verifyNoteHmac } from "@/lib/emr/notes";
import { loadDeskFor } from "@/lib/emr/read/desk";
import { withPatientWrite } from "@/lib/emr/write/context";
import * as dx from "@/lib/emr/write/diagnoses";
import * as facts from "@/lib/emr/write/facts";
import * as notes from "@/lib/emr/write/notes";
import * as orders from "@/lib/emr/write/orders";
import { decrypt, encrypt, generateKey } from "@/lib/encryption";
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
const HMAC_KEY = Buffer.alloc(32, 5).toString("base64");
const savedKey = process.env.MEDSYNC_NOTE_HMAC_KEY;

describe.skipIf(!laneOn)("Summary and Impression: the server (PGlite lane)", () => {
  let lane: Lane;
  let h: string;
  let dept: string;
  let mo: EmrActor;
  let consultant: EmrActor;
  let officer: EmrActor;
  let intern: EmrActor;
  let p: string;
  let enc: string;
  let diabetes: string;

  const actor = async (cadre: string): Promise<EmrActor> => {
    const s = await staff(lane.pg, { hospitalId: h, departmentId: dept, cadre });
    return {
      userId: s.userId,
      fullName: null,
      hospitalId: h,
      departmentId: dept,
      affiliationId: s.affiliationId,
      cadreCode: cadre,
      isClinical: true,
      surface: "doctor",
    };
  };
  const as = <T>(a: EmrActor, fn: (ctx: WriteCtx) => Promise<T>, patientUserId = p) =>
    withPatientWrite(a, patientUserId, fn, { database: lane.db });
  const rows = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
    (await lane.pg.query<T>(sql, params)).rows;

  /** A new patient on a new visit, present today (every clinician here has a basis). */
  const newVisit = async () => {
    const q = await patient(lane.pg);
    await lane.pg.query(
      `INSERT INTO public.patient_profiles (id, first_name_encrypted, surname_encrypted, sex, date_of_birth, id_type,
         phone_encrypted, district_id)
       VALUES ($1, $2, $3, 'male', '1950-03-01', 'none', $4, (SELECT id FROM public.districts LIMIT 1))`,
      [q, encrypt("Patient"), encrypt("Visit"), encrypt("0700000000")],
    );
    const e = await encounter(lane.pg, {
      hospitalId: h,
      patientUserId: q,
      clinicianUserId: mo.userId,
      departmentId: dept,
    });
    await intake(lane.pg, { hospitalId: h, patientUserId: q });
    return { q, e };
  };
  const record = (
    a: EmrActor,
    v: { q: string; e: string },
    input: Partial<facts.EncounterDiagnosisInput>,
  ) =>
    as(
      a,
      (ctx) =>
        facts.recordEncounterDiagnosis(ctx, {
          patientUserId: v.q,
          encounterId: v.e,
          clientKey: key(),
          ...input,
        }),
      v.q,
    );
  /** The visit's current encounter diagnoses (current version per logical id). */
  const current = (e: string) =>
    rows<{
      id: string;
      logical_id: string;
      rank: string;
      verification: string;
      status: string;
      client_key: string | null;
    }>(
      `SELECT id, logical_id, rank, verification, status, client_key FROM public.conditions c
        WHERE encounter_id = $1 AND category = 'encounter_diagnosis'
          AND NOT EXISTS (SELECT 1 FROM public.conditions s WHERE s.supersedes_id = c.id)
        ORDER BY recorded_at`,
      [e],
    );

  beforeAll(async () => {
    process.env.MEDSYNC_PHI_KEY ??= generateKey();
    process.env.MEDSYNC_NOTE_HMAC_KEY = HMAC_KEY;
    lane = await bootLane();
    h = await hospital(lane.pg);
    dept = await department(lane.pg, h);
    mo = await actor("MEDICAL_OFFICER");
    consultant = await actor("CONSULTANT");
    officer = await actor("CLINICAL_OFFICER");
    intern = await actor("INTERN_DOCTOR");
    ({ q: p, e: enc } = await newVisit());
    diabetes = (
      await rows<{ id: string }>(
        `SELECT id FROM public.diagnosis_terms WHERE display ILIKE 'Diabetes, type not yet determined%' LIMIT 1`,
      )
    )[0]!.id;
  }, 180_000);

  afterAll(() => {
    if (savedKey === undefined) delete process.env.MEDSYNC_NOTE_HMAC_KEY;
    else process.env.MEDSYNC_NOTE_HMAC_KEY = savedKey;
  });

  /* ─── S-3 ──────────────────────────────────────────────────────── */

  it("S-3: the same diagnosis twice on one visit is rejected as 'Already on this visit'", async () => {
    const v = { q: p, e: enc };
    await record(mo, v, { termId: diabetes, verification: "provisional", rank: "primary" });
    await expect(
      record(mo, v, { termId: diabetes, verification: "provisional", rank: "secondary" }),
    ).rejects.toMatchObject({ code: "conflict", message: facts.ALREADY_ON_VISIT });
    expect(facts.ALREADY_ON_VISIT).toBe("Already on this visit");
  });

  it("S-3: typed words compare normalised; a voided diagnosis no longer blocks; the problem list is not doubled", async () => {
    const v = await newVisit();
    const first = await record(mo, v, { text: "Essential hypertension" });
    await expect(record(mo, v, { text: "  essential   HYPERTENSION!! " })).rejects.toMatchObject({
      code: "conflict",
      message: "Already on this visit",
    });
    // Typed words never collide with a term, and a term never with typed words.
    await record(mo, v, { termId: diabetes });
    await record(mo, v, { text: "Diabetes, type not yet determined" });
    await as(
      mo,
      (ctx) =>
        facts.markFactEnteredInError(ctx, {
          patientUserId: v.q,
          kind: "condition",
          id: first.id,
          clientKey: key(),
          reasonCode: "duplicate",
        }),
      v.q,
    );
    await record(mo, v, { text: "Essential hypertension" });

    // The problem-list copy: the patient's problem list already holds the term.
    const w = await newVisit();
    await as(
      mo,
      (ctx) => facts.recordProblem(ctx, { patientUserId: w.q, clientKey: key(), termId: diabetes }),
      w.q,
    );
    await record(mo, w, { termId: diabetes, addToProblemList: true });
    const problems = await rows<{ n: number }>(
      `SELECT count(*)::int AS n FROM public.conditions WHERE patient_user_id = $1 AND category = 'problem_list_item'`,
      [w.q],
    );
    expect(problems[0]!.n).toBe(1);
  });

  /* ─── S-4, D-SI-09, D-SI-23 ────────────────────────────────────── */

  it("S-4: an intern's Final is visibly pending, with a confirm_diagnosis co-signature request", async () => {
    const r = await as(intern, (ctx) =>
      facts.recordEncounterDiagnosis(ctx, {
        patientUserId: p,
        encounterId: enc,
        clientKey: key(),
        text: "Hypothermia, cause not yet known",
        verification: "confirmed",
        rank: "secondary",
      }),
    );
    expect(r.warnings).toEqual([facts.FINAL_AWAITING_COSIGN]);
    expect(facts.FINAL_AWAITING_COSIGN).toBe("Final · awaiting senior co-signature");
    const req = await rows<{ n: number }>(
      `SELECT count(*)::int AS n FROM public.clinical_cosign_requests
        WHERE patient_user_id = $1 AND action_kind = 'confirm_diagnosis' AND state = 'pending_review'
          AND note_id IS NULL AND action_payload->>'conditionLogicalId' = $2`,
      [p, r.id],
    );
    expect(req[0]!.n).toBe(1);
    const row = await rows(`SELECT verification FROM public.conditions WHERE id = $1`, [r.id]);
    expect(row[0]!.verification).toBe("provisional");
    expect(r.cosignRequestId).toBeDefined();
  });

  it("D-SI-09: requestDiagnosisCosign on a diagnosis on the visit, once; approve writes Final (0084 round trip)", async () => {
    const v = await newVisit();
    const d = await record(intern, v, {
      text: "Community-acquired pneumonia",
      verification: "differential",
    });
    const asked = await as(
      intern,
      (ctx) => dx.requestDiagnosisCosign(ctx, { patientUserId: v.q, id: d.id, clientKey: key() }),
      v.q,
    );
    expect(asked.warnings).toEqual(["Final · awaiting senior co-signature"]);
    expect(asked.conditionId).not.toBe(d.id);
    const [req] = await rows<{
      id: string;
      action_kind: string;
      note_id: string | null;
      action_payload: Record<string, unknown>;
      state: string;
    }>(`SELECT * FROM public.clinical_cosign_requests WHERE id = $1`, [asked.id]);
    expect(req).toMatchObject({
      action_kind: "confirm_diagnosis",
      note_id: null,
      state: "pending_review",
    });
    // PHI-free: the logical id and the visit, nothing else.
    expect(req!.action_payload).toEqual({ conditionLogicalId: d.id, encounterId: v.e });
    // Asked again: the open request is returned, not doubled.
    const again = await as(
      intern,
      (ctx) =>
        dx.requestDiagnosisCosign(ctx, {
          patientUserId: v.q,
          id: asked.conditionId,
          clientKey: key(),
        }),
      v.q,
    );
    expect(again.id).toBe(asked.id);
    // A senior asks nothing: they confirm directly.
    await expect(
      as(
        mo,
        (ctx) =>
          dx.requestDiagnosisCosign(ctx, {
            patientUserId: v.q,
            id: asked.conditionId,
            clientKey: key(),
          }),
        v.q,
      ),
    ).rejects.toMatchObject({ code: "invalid" });

    // D-SI-23: the inbox's seniority AND a final-diagnosis authority; never the requester.
    const decide = (a: EmrActor, decision: "approve" | "return", k = key(), reviewNote?: string) =>
      as(
        a,
        (ctx) =>
          dx.decideDiagnosisCosign(ctx, {
            patientUserId: v.q,
            requestId: asked.id,
            decision,
            clientKey: k,
            ...(reviewNote ? { reviewNote } : {}),
          }),
        v.q,
      );
    await expect(decide(officer, "approve")).rejects.toMatchObject({ code: "forbidden" });
    await expect(decide(intern, "approve")).rejects.toMatchObject({ code: "forbidden" });
    const k = key();
    const approved = await decide(consultant, "approve", k);
    const now = await current(v.e);
    expect(now).toHaveLength(1);
    expect(now[0]).toMatchObject({ id: approved.id, logical_id: d.id, verification: "confirmed" });
    const [closed] = await rows(
      `SELECT state, reviewed_by_user_id FROM public.clinical_cosign_requests WHERE id = $1`,
      [asked.id],
    );
    expect(closed).toMatchObject({ state: "approved", reviewed_by_user_id: consultant.userId });
    // A retried approval replays; another decision on a closed request conflicts.
    expect((await decide(consultant, "approve", k)).id).toBe(approved.id);
    await expect(decide(mo, "return", key(), "Not enough evidence")).rejects.toMatchObject({
      code: "conflict",
    });
  });

  it("D-SI-09: return closes the request with its note and the diagnosis stays Working; EIE cancels a request", async () => {
    const v = await newVisit();
    const d = await record(intern, v, { text: "Gastritis", verification: "confirmed" });
    const decide = (reviewNote?: string) =>
      as(
        mo,
        (ctx) =>
          dx.decideDiagnosisCosign(ctx, {
            patientUserId: v.q,
            requestId: d.cosignRequestId!,
            decision: "return",
            clientKey: key(),
            ...(reviewNote ? { reviewNote } : {}),
          }),
        v.q,
      );
    await expect(decide()).rejects.toMatchObject({ code: "invalid" });
    await decide("Epigastric tenderness only: keep it working until the scope.");
    const [req] = await rows(
      `SELECT state, review_note FROM public.clinical_cosign_requests WHERE id = $1`,
      [d.cosignRequestId],
    );
    expect(req).toMatchObject({ state: "returned", review_note: expect.stringMatching(/scope/) });
    expect((await current(v.e))[0]).toMatchObject({ verification: "provisional" });

    // A diagnosis entered in error leaves the inbox with it.
    const e2 = await record(intern, v, { text: "Peptic ulcer", verification: "confirmed" });
    await as(
      intern,
      (ctx) =>
        facts.markFactEnteredInError(ctx, {
          patientUserId: v.q,
          kind: "condition",
          id: e2.id,
          clientKey: key(),
          reasonCode: "added_by_mistake",
        }),
      v.q,
    );
    const [cancelled] = await rows(
      `SELECT state FROM public.clinical_cosign_requests WHERE id = $1`,
      [e2.cosignRequestId],
    );
    expect(cancelled).toMatchObject({ state: "cancelled" });
  });

  /* ─── D-SI-05, D-SI-21 ─────────────────────────────────────────── */

  it("D-SI-05: setLeadingDiagnosis swaps in one transaction: two versions, two audit rows, one primary", async () => {
    const v = await newVisit();
    const a = await record(mo, v, { text: "Malaria, uncomplicated", rank: "primary" });
    const b = await record(mo, v, { text: "Typhoid fever", verification: "differential" });
    const k = key();
    const swap = () =>
      as(
        mo,
        (ctx) =>
          dx.setLeadingDiagnosis(ctx, {
            patientUserId: v.q,
            encounterId: v.e,
            id: b.id,
            clientKey: k,
          }),
        v.q,
      );
    const r = await swap();
    expect(r.demotedId).not.toBeNull();
    const now = await current(v.e);
    expect(now.filter((c) => c.rank === "primary")).toHaveLength(1);
    const byLogical = new Map(now.map((c) => [c.logical_id, c]));
    expect(byLogical.get(a.id)).toMatchObject({
      id: r.demotedId,
      rank: "secondary",
      verification: "differential",
      client_key: k,
    });
    expect(byLogical.get(b.id)).toMatchObject({
      id: r.id,
      rank: "primary",
      verification: "provisional",
      client_key: `${k}:promote`,
    });
    const audit = await rows<{ n: number }>(
      `SELECT count(*)::int AS n FROM public.audit_log WHERE table_name = 'conditions' AND record_id = ANY($1)`,
      [[r.id, r.demotedId]],
    );
    expect(audit[0]!.n).toBe(2);
    // Replayed on its key: the same pair, nothing new.
    expect(await swap()).toEqual(r);
    expect(await current(v.e)).toEqual(now);

    // Move to differential leaves the visit with no leading diagnosis.
    await as(
      mo,
      (ctx) => dx.moveToDifferential(ctx, { patientUserId: v.q, id: r.id, clientKey: key() }),
      v.q,
    );
    const after = await current(v.e);
    expect(after.filter((c) => c.rank === "primary")).toHaveLength(0);
    expect(after.every((c) => c.verification === "differential")).toBe(true);
  });

  it("D-SI-21: a junior cannot demote or move a Final; a senior can", async () => {
    const v = await newVisit();
    const a = await record(mo, v, {
      text: "Heart failure",
      rank: "primary",
      verification: "confirmed",
    });
    const b = await record(intern, v, {
      text: "Chronic kidney disease",
      verification: "differential",
    });
    const refused = { code: "forbidden", message: facts.DEMOTE_FINAL };
    await expect(
      as(
        intern,
        (ctx) =>
          dx.setLeadingDiagnosis(ctx, {
            patientUserId: v.q,
            encounterId: v.e,
            id: b.id,
            clientKey: key(),
          }),
        v.q,
      ),
    ).rejects.toMatchObject(refused);
    await expect(
      as(
        intern,
        (ctx) => dx.moveToDifferential(ctx, { patientUserId: v.q, id: a.id, clientKey: key() }),
        v.q,
      ),
    ).rejects.toMatchObject(refused);
    for (const change of [{ verification: "provisional" as const }, { rank: "secondary" as const }])
      await expect(
        as(
          intern,
          (ctx) =>
            facts.updateProblemStatus(ctx, {
              patientUserId: v.q,
              id: a.id,
              clientKey: key(),
              ...change,
            }),
          v.q,
        ),
      ).rejects.toMatchObject(refused);
    expect((await current(v.e)).map((c) => [c.rank, c.verification])).toEqual([
      ["primary", "confirmed"],
      ["secondary", "differential"],
    ]);
    // A senior swaps: the Final is demoted to the differential, the chosen one leads as Working.
    await as(
      mo,
      (ctx) =>
        dx.setLeadingDiagnosis(ctx, {
          patientUserId: v.q,
          encounterId: v.e,
          id: b.id,
          clientKey: key(),
        }),
      v.q,
    );
    expect((await current(v.e)).map((c) => [c.logical_id, c.rank, c.verification])).toEqual([
      [a.id, "secondary", "differential"],
      [b.id, "primary", "provisional"],
    ]);
  });

  /* ─── Q10 ──────────────────────────────────────────────────────── */

  it("Q10: placeOrders refuses a superseded or entered-in-error reason; a differential is a reason", async () => {
    const v = await newVisit();
    const [ecg] = await rows<{ id: string }>(
      `SELECT id FROM public.test_catalogue WHERE code = 'test.ecg' AND hospital_id IS NULL`,
    );
    const order = (reasonConditionIds: string[]) =>
      as(
        mo,
        (ctx) =>
          orders.placeOrders(ctx, {
            patientUserId: v.q,
            encounterId: v.e,
            orders: [
              { clientKey: key(), testId: ecg!.id, priority: "routine", reasonConditionIds },
            ],
          }),
        v.q,
      );
    const d = await record(mo, v, {
      text: "Acute coronary syndrome",
      verification: "differential",
    });
    await order([d.id]);
    const d2 = await as(
      mo,
      (ctx) =>
        facts.updateProblemStatus(ctx, {
          patientUserId: v.q,
          id: d.id,
          clientKey: key(),
          verification: "provisional",
        }),
      v.q,
    );
    const stale = {
      code: "conflict",
      message: expect.stringMatching(/reload and choose it again/),
    };
    await expect(order([d.id])).rejects.toMatchObject(stale);
    await order([d2.id]);
    const d3 = await as(
      mo,
      (ctx) =>
        facts.markFactEnteredInError(ctx, {
          patientUserId: v.q,
          kind: "condition",
          id: d2.id,
          clientKey: key(),
          reasonCode: "wrong_patient",
        }),
      v.q,
    );
    await expect(order([d3.id])).rejects.toMatchObject(stale);
    await expect(order([d2.id])).rejects.toMatchObject(stale);
  });

  /* ─── D-SI-19 ──────────────────────────────────────────────────── */

  it("D-SI-19: the desk read gives logical ids, verified codes only, sensitivity, problem list and pending co-signature", async () => {
    const v = await newVisit();
    const coded = await record(mo, v, {
      termId: diabetes,
      rank: "primary",
      addToProblemList: true,
    });
    const uncoded = await record(mo, v, {
      termId: dxTermUuid("dx.hypothermia_unexplained"), // 0085: as typed, not coded
      verification: "differential",
    });
    const restricted = await record(mo, v, {
      termId: dxTermUuid("dx.tb_extrapulmonary"),
      verification: "differential",
    });
    const pending = await record(intern, v, { text: "Anaemia", verification: "confirmed" });
    const changed = await as(
      mo,
      (ctx) =>
        facts.updateProblemStatus(ctx, {
          patientUserId: v.q,
          id: uncoded.id,
          clientKey: key(),
          verification: "provisional",
        }),
      v.q,
    );
    const desk = (await loadDeskFor(mo, v.e, { database: lane.db }))!.payload;
    const by = new Map(desk.diagnoses.map((d) => [d.logicalId, d]));
    expect(desk.diagnoses).toHaveLength(4);
    expect(desk.diagnoses[0]!.logicalId).toBe(coded.id); // the primary first
    expect(by.get(coded.id)).toMatchObject({
      id: coded.id,
      termId: diabetes,
      display: "Diabetes, type not yet determined",
      code: expect.stringMatching(/^5A1/),
      rank: "primary",
      restricted: false,
      onProblemList: true,
      cosignPending: false,
    });
    expect(by.get(uncoded.id)).toMatchObject({
      id: changed.id, // the current version; the logical id is the first
      display: "Hypothermia, cause not yet known",
      code: null,
      verification: "provisional",
      onProblemList: false,
    });
    expect(by.get(restricted.id)).toMatchObject({ restricted: true, code: null });
    expect(by.get(pending.id)).toMatchObject({
      termId: null,
      display: "Anaemia",
      code: null,
      verification: "provisional",
      cosignPending: true,
    });
  });

  /* ─── D-SI-20 ──────────────────────────────────────────────────── */

  it("D-SI-20: signing writes impression.snapshot before the HMAC; a later diagnosis does not change it", async () => {
    const v = await newVisit();
    const lead = await record(mo, v, { termId: diabetes, rank: "primary" });
    const diff = await record(intern, v, { text: "Thyrotoxicosis", verification: "confirmed" });
    const impression = {
      order: [diff.id],
      likelihood: { [diff.id]: "possible" },
      reasons: {},
      evidence: {},
      meta: {},
      catalogueVersion: "1.0.1-draft",
    };
    const content: NoteContent = {
      schema: 2,
      catalogueVersion: "1.0.0-draft",
      header: { historian: "patient" },
      history: {
        ...emptyHistory(),
        complaints: [{ key: "c", symptom: "sym.cough", props: {}, flags: {} }],
      } as unknown as NoteContent["history"],
      sections: {
        s13: {
          items: [
            {
              kind: "encounter_diagnosis",
              conditionId: lead.id,
              logicalId: lead.id,
              display: "Diabetes",
            },
          ],
        },
        s14: { items: [{ kind: "plan_statement", text: "Review" }] },
      },
      impression,
      edited: {},
    };
    const draft = await as(
      mo,
      (ctx) =>
        notes.saveNoteDraft(ctx, {
          patientUserId: v.q,
          encounterId: v.e,
          templateId: "tpl.clerking.adult_v2",
          content,
          clientKey: key(),
        }),
      v.q,
    );
    await as(mo, (ctx) => notes.signNote(ctx, { patientUserId: v.q, noteId: draft.id }), v.q);
    const read = async () => {
      const note = (await lane.db.query.clinicalNotes.findFirst({
        where: (n, { eq }) => eq(n.id, draft.id),
      }))!;
      return { note, content: JSON.parse(decrypt(note.contentCiphertext)) as NoteContent };
    };
    const signed = await read();
    expect(signed.note.state).toBe("signed");
    const snapshot = (signed.content.impression as { snapshot: SignedDiagnosis[] }).snapshot;
    expect(snapshot).toEqual([
      {
        logicalId: lead.id,
        versionId: lead.id,
        display: "Diabetes, type not yet determined",
        code: expect.stringMatching(/^5A1/),
        rank: "primary",
        verification: "provisional",
        restricted: false,
        cosignPending: false,
      },
      {
        logicalId: diff.id,
        versionId: diff.id,
        display: "Thyrotoxicosis",
        code: null,
        rank: "secondary",
        verification: "provisional",
        restricted: false,
        cosignPending: true,
      },
    ]);
    // The rest of the draft is signed as it was, and the HMAC covers the snapshot.
    expect(signed.content.impression).toMatchObject(impression);
    expect(
      verifyNoteHmac(
        canonicalNote({ ...signed.note, signedAt: signed.note.signedAt!, content: signed.content }),
        signed.note.contentHmac!,
        HMAC_KEY,
      ),
    ).toBe(true);

    // The record moves on; the signed note does not.
    await record(mo, v, { text: "Hypokalaemia", verification: "differential" });
    const later = await read();
    expect(later.content).toEqual(signed.content);
    expect(later.note.contentHmac).toBe(signed.note.contentHmac);
  });
});
