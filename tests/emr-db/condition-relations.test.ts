/**
 * Migration 0096 (condition_relations) and the relations write and read paths on the PGlite lane.
 * Part 1 ports docs/emr/dx-relations/tools/ddl_test.sql case for case onto the real schema; part 2
 * drives lib/emr/write/relations.ts and the refine / replace writes (D-REL-05), the system
 * retirement of a removed end, episode_of, reordering, the desk payload and the D-REL-17 report.
 * EMR_PGLITE=1.
 */
import type { Lane } from "./_pglite";
import type { EmrActor } from "@/lib/emr/actor";
import type { WriteCtx } from "@/lib/emr/write/context";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { dxTermUuid } from "@/lib/clerking/impression/load";
import { loadDeskFor } from "@/lib/emr/read/desk";
import { withPatientWrite } from "@/lib/emr/write/context";
import * as dx from "@/lib/emr/write/diagnoses";
import * as facts from "@/lib/emr/write/facts";
import * as rel from "@/lib/emr/write/relations";
import { encrypt, generateKey } from "@/lib/encryption";
import { backfillRelationsReport } from "@/scripts/emr/backfill-relations";
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
const savedKey = process.env.MEDSYNC_PHI_KEY;

describe.skipIf(!laneOn)("0096 condition_relations (PGlite lane)", () => {
  let lane: Lane;
  let h: string;
  let dept: string;
  let mo: EmrActor;

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
  const rows = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
    (await lane.pg.query<T>(sql, params)).rows;
  const newVisit = async () => {
    const q = await patient(lane.pg);
    await lane.pg.query(
      `INSERT INTO public.patient_profiles (id, first_name_encrypted, surname_encrypted, sex, date_of_birth, id_type,
         phone_encrypted, district_id)
       VALUES ($1, $2, $3, 'female', '1960-01-01', 'none', $4, (SELECT id FROM public.districts LIMIT 1))`,
      [q, encrypt("Patient"), encrypt("Relations"), encrypt("0700000000")],
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
  const as = <T>(q: string, fn: (ctx: WriteCtx) => Promise<T>, a = mo) =>
    withPatientWrite(a, q, fn, { database: lane.db });
  const record = (v: { q: string; e: string }, input: Partial<facts.EncounterDiagnosisInput>) =>
    as(v.q, (ctx) =>
      facts.recordEncounterDiagnosis(ctx, {
        patientUserId: v.q,
        encounterId: v.e,
        clientKey: key(),
        ...input,
      }),
    ).then((r) => r.id);
  const link = (
    v: { q: string; e: string },
    c: string,
    r: string,
    more: Partial<rel.CreateRelationInput> = {},
  ) =>
    as(v.q, (ctx) =>
      rel.createRelation(ctx, {
        patientUserId: v.q,
        encounterId: v.e,
        conditionId: c,
        relatedConditionId: r,
        relationType: "due_to",
        label: "secondary",
        clientKey: key(),
        ...more,
      }),
    );
  const current = (logicalId: string) =>
    rows<{
      id: string;
      version: number;
      state: string;
      origin: string;
      reason_code: string | null;
      position: number;
      label: string | null;
      sensitivity: string;
      restricted_classes: string[];
    }>(`SELECT * FROM public.condition_relations_current WHERE logical_id = $1`, [logicalId]).then(
      (r) => r[0]!,
    );

  beforeAll(async () => {
    process.env.MEDSYNC_PHI_KEY ??= generateKey();
    lane = await bootLane();
    h = await hospital(lane.pg);
    dept = await department(lane.pg, h);
    mo = await actor("MEDICAL_OFFICER");
  }, 180_000);

  afterAll(() => {
    process.env.MEDSYNC_PHI_KEY = savedKey;
  });

  /* ─── 1. ddl_test.sql, on the real schema ────────────────────────── */
  describe("the guard, the constraints and RLS (ddl_test.sql)", () => {
    let v: { q: string; e: string };
    let other: string;
    const c: Record<number, string> = {};
    const cond = async (
      q: string,
      e: string,
      verification = "confirmed",
      sensitivity = "standard",
    ): Promise<string> => {
      const id = crypto.randomUUID();
      await lane.pg.query(
        `INSERT INTO public.conditions (id, logical_id, hospital_id, patient_user_id, encounter_id, effective_at,
           recorded_by_user_id, source, trust, category, text_ciphertext, clinical_status, verification, asserted_by,
           sensitivity, rank)
         VALUES ($1, $1, $2, $3, $4, now(), $5, 'clinician', 3, 'encounter_diagnosis', 'iv:tag:ct', 'active', $6,
           'clinician', $7, 'secondary')`,
        [id, h, q, e, mo.userId, verification, sensitivity],
      );
      return id;
    };
    const ins = async (
      a: string,
      b: string,
      type = "due_to",
      label: string | null = "secondary",
      classes: string[] = [],
    ): Promise<string> => {
      const id = crypto.randomUUID();
      try {
        await lane.pg.query(
          `INSERT INTO public.condition_relations (id, logical_id, hospital_id, patient_user_id, encounter_id,
             condition_id, related_condition_id, relation_type, label, origin, recorded_by_user_id, restricted_classes)
           VALUES ($1, $1, $2, $3, $4, $5, $6, $7, $8, 'clinician', $9, $10)`,
          [id, h, v.q, v.e, a, b, type, label, mo.userId, classes],
        );
        return "ok";
      } catch (e) {
        return `REFUSED: ${(e as Error).message}`;
      }
    };

    beforeAll(async () => {
      v = await newVisit();
      for (const n of [1, 2, 5, 6, 7]) c[n] = await cond(v.q, v.e);
      c[3] = await cond(v.q, v.e, "differential");
      c[4] = await cond(v.q, v.e, "confirmed", "restricted"); // HIV
      const o = await newVisit();
      other = await cond(o.q, o.e);
    });

    it("1 anaemia due_to malaria: ok", async () => {
      expect(await ins(c[1]!, c[2]!)).toBe("ok");
    });
    it("2 a self-link is refused", async () => {
      expect(await ins(c[1]!, c[1]!)).toMatch(/linked to itself/);
    });
    it("3 a link to a differential is refused (D-REL-08)", async () => {
      expect(await ins(c[1]!, c[3]!)).toMatch(/differential/);
    });
    it("4 due_to without a label is refused", async () => {
      expect(await ins(c[5]!, c[6]!, "due_to", null)).toMatch(/label_rule/);
    });
    it("5 a loop is refused", async () => {
      expect(await ins(c[2]!, c[1]!)).toMatch(/loop/);
    });
    it("6 anaemia due_to HIV: ok, restricted with the class", async () => {
      expect(await ins(c[1]!, c[4]!, "due_to", "secondary", ["hiv"])).toBe("ok");
      const [r] = await rows<{ sensitivity: string; restricted_classes: string[] }>(
        `SELECT sensitivity, restricted_classes FROM public.condition_relations
          WHERE condition_id = $1 AND related_condition_id = $2`,
        [c[1], c[4]],
      );
      expect(r).toEqual({ sensitivity: "restricted", restricted_classes: ["hiv"] });
    });
    it("7 a chain of four (6 → 7 → 1 → 2): ok", async () => {
      expect(await ins(c[7]!, c[1]!)).toBe("ok");
      expect(await ins(c[6]!, c[7]!)).toBe("ok");
    });
    it("8 a fifth level above is refused; 8b so is a middle link that lengthens a chain below", async () => {
      expect(await ins(c[5]!, c[6]!)).toMatch(/4 levels/);
      expect(await ins(c[2]!, c[5]!)).toMatch(/4 levels/);
    });
    it("9 a link to another patient's condition is refused", async () => {
      expect(await ins(c[1]!, other)).toMatch(/this patient's/);
    });
    it("10 associated_with is stored once, lower id first", async () => {
      const [lo, hi] = [c[5]!, c[6]!].sort() as [string, string];
      expect(await ins(hi, lo, "associated_with", null)).toMatch(/symmetric_once/);
      expect(await ins(lo, hi, "associated_with", null)).toBe("ok");
    });
    it("11–12 update and delete are refused (append-only)", async () => {
      await expect(
        lane.pg.query(
          `UPDATE public.condition_relations SET position = 2 WHERE patient_user_id = $1`,
          [v.q],
        ),
      ).rejects.toThrow(/append-only/);
      await expect(
        lane.pg.query(`DELETE FROM public.condition_relations WHERE patient_user_id = $1`, [v.q]),
      ).rejects.toThrow(/append-only/);
    });
    it("a viewer without the HIV class does not receive the HIV relation (RLS, D-REL-09)", async () => {
      const count = (classes: string | null) =>
        lane.pg.transaction(async (tx) => {
          await tx.query(
            `SELECT set_config('app.user_id', $1, true), set_config('app.hospital_id', $2, true),
                    set_config('app.restricted_classes', $3, true)`,
            [mo.userId, h, classes ?? ""],
          );
          await tx.exec("SET LOCAL ROLE medsync_clinical_reader");
          const r = await tx.query<{ n: number }>(
            `SELECT count(*)::int AS n FROM public.condition_relations WHERE patient_user_id = $1`,
            [v.q],
          );
          await tx.rollback();
          return r.rows[0]!.n;
        });
      expect(await count(null)).toBe(5); // a clinical reader holds every class (D-SI-18)
      expect(await count("hiv")).toBe(5);
      expect(await count("tb")).toBe(4);
      expect(await count("none")).toBe(4);
    });
  });

  /* ─── 2. The write and read paths ─────────────────────────────────── */
  describe("lib/emr/write/relations.ts", () => {
    it("links, replays, refuses a duplicate, a differential and a loop in words", async () => {
      const v = await newVisit();
      const anaemia = await record(v, {
        termId: dxTermUuid("dx.anaemia"),
        verification: "confirmed",
      });
      const malaria = await record(v, {
        termId: dxTermUuid("dx.malaria_severe"),
        verification: "confirmed",
      });
      const sepsis = await record(v, { text: "Sepsis", verification: "differential" });
      const k = key();
      const first = await link(v, anaemia, malaria, { clientKey: k });
      expect((await link(v, anaemia, malaria, { clientKey: k })).id).toBe(first.id);
      await expect(link(v, anaemia, malaria)).rejects.toThrow(/already linked/);
      await expect(link(v, anaemia, sepsis)).rejects.toMatchObject({
        code: "invalid",
        message: "a differential is not linked; promote it first.",
      });
      await expect(link(v, malaria, anaemia)).rejects.toThrow(/loop/);
      await expect(link(v, anaemia, malaria, { label: null })).rejects.toThrow(/wording/);
      expect(await current(first.id)).toMatchObject({
        version: 1,
        state: "active",
        origin: "clinician",
      });
    });

    it("HIV as a cause: the relation carries the hiv class from the catalogue", async () => {
      const v = await newVisit();
      const anaemia = await record(v, {
        termId: dxTermUuid("dx.anaemia"),
        verification: "confirmed",
      });
      const hiv = await record(v, { termId: dxTermUuid("dx.hiv"), verification: "confirmed" });
      const r = await link(v, anaemia, hiv);
      expect(await current(r.id)).toMatchObject({
        sensitivity: "restricted",
        restricted_classes: ["hiv"],
      });
    });

    it("associated_with is stored lower id first; move, relabel and retire are new versions", async () => {
      const v = await newVisit();
      const dm = await record(v, { termId: dxTermUuid("dx.dm_type2"), verification: "confirmed" });
      const htn = await record(v, {
        termId: dxTermUuid("dx.hypertension"),
        verification: "confirmed",
      });
      const dka = await record(v, { termId: dxTermUuid("dx.dka"), verification: "confirmed" });
      const [lo, hi] = [dm, htn].sort();
      const assoc = await link(v, hi!, lo!, { relationType: "associated_with", label: null });
      const [a] = await rows<{ condition_id: string }>(
        `SELECT condition_id FROM public.condition_relations WHERE id = $1`,
        [assoc.id],
      );
      expect(a!.condition_id).toBe(lo);

      const cause = await link(v, dka, dm, {
        label: "complication",
        catalogueRef: "MS-EMR-DX-ASSOC-001@1.0.0-draft:dx.dm_type2>dx.dka",
      });
      const moved = await as(v.q, (ctx) =>
        rel.moveRelation(ctx, { patientUserId: v.q, id: cause.id, position: 2, clientKey: key() }),
      );
      expect(await current(cause.id)).toMatchObject({
        id: moved.id,
        version: 2,
        position: 2,
        label: "complication",
      });
      await expect(
        as(v.q, (ctx) =>
          rel.moveRelation(ctx, {
            patientUserId: v.q,
            id: cause.id,
            position: 3,
            clientKey: key(),
          }),
        ),
      ).rejects.toThrow(/newer version/);
      const relabelled = await as(v.q, (ctx) =>
        rel.relabelRelation(ctx, {
          patientUserId: v.q,
          id: moved.id,
          label: "precipitated_by",
          clientKey: key(),
        }),
      );
      expect(await current(cause.id)).toMatchObject({
        id: relabelled.id,
        version: 3,
        position: 2,
        label: "precipitated_by",
      });
      await expect(
        as(v.q, (ctx) =>
          rel.relabelRelation(ctx, {
            patientUserId: v.q,
            id: assoc.id,
            label: "secondary",
            clientKey: key(),
          }),
        ),
      ).rejects.toThrow(/Only a cause link/);

      await expect(
        as(v.q, (ctx) =>
          rel.retireRelation(ctx, { patientUserId: v.q, id: assoc.id, clientKey: key() }),
        ),
      ).rejects.toThrow(/reason/);
      await as(v.q, (ctx) =>
        rel.retireRelation(ctx, {
          patientUserId: v.q,
          id: assoc.id,
          reasonCode: "not_related",
          clientKey: key(),
        }),
      );
      expect(await current(assoc.id)).toMatchObject({
        version: 2,
        state: "retired",
        reason_code: "not_related",
      });
      const retired = (await current(assoc.id)).id;
      await expect(
        as(v.q, (ctx) =>
          rel.moveRelation(ctx, { patientUserId: v.q, id: retired, position: 2, clientKey: key() }),
        ),
      ).rejects.toThrow(/removed/);
    });

    it("a cause entered in error, or ruled out, retires its relations (system_end_removed); the effect stays", async () => {
      const v = await newVisit();
      const anaemia = await record(v, {
        termId: dxTermUuid("dx.anaemia"),
        verification: "confirmed",
      });
      const malaria = await record(v, {
        termId: dxTermUuid("dx.malaria_severe"),
        verification: "confirmed",
      });
      const hookworm = await record(v, { text: "Hookworm infection", verification: "confirmed" });
      const r1 = await link(v, anaemia, malaria);
      const r2 = await link(v, anaemia, hookworm, { position: 2 });
      await as(v.q, (ctx) =>
        facts.markFactEnteredInError(ctx, {
          kind: "condition",
          patientUserId: v.q,
          id: malaria,
          reasonCode: "wrong_patient",
          clientKey: key(),
        }),
      );
      expect(await current(r1.id)).toMatchObject({
        state: "retired",
        origin: "system_end_removed",
        reason_code: "end_entered_in_error",
      });
      expect(await current(r2.id)).toMatchObject({ state: "active" });
      await as(v.q, (ctx) =>
        facts.updateProblemStatus(ctx, {
          patientUserId: v.q,
          id: hookworm,
          verification: "refuted",
          reasonCode: "stool_negative",
          clientKey: key(),
        }),
      );
      expect(await current(r2.id)).toMatchObject({ state: "retired", reason_code: "end_refuted" });
      const [effect] = await rows<{ status: string }>(
        `SELECT status FROM public.conditions_current WHERE logical_id = $1`,
        [anaemia],
      );
      expect(effect!.status).toBe("final");
    });

    it("active this visit: one visit diagnosis linked episode_of the problem-list item, no second problem", async () => {
      const v = await newVisit();
      const problem = await as(v.q, (ctx) =>
        facts.recordProblem(ctx, {
          patientUserId: v.q,
          termId: dxTermUuid("dx.hypertension"),
          clientKey: key(),
        }),
      );
      const k = key();
      const run = () =>
        as(v.q, (ctx) =>
          rel.activeThisVisit(ctx, {
            patientUserId: v.q,
            encounterId: v.e,
            problemId: problem.id,
            clientKey: k,
          }),
        );
      const out = await run();
      expect(await run()).toMatchObject({ id: out.id, conditionId: out.conditionId });
      expect(await current(out.id)).toMatchObject({ state: "active" });
      const [r] = await rows<{
        relation_type: string;
        condition_id: string;
        related_condition_id: string;
      }>(
        `SELECT relation_type, condition_id, related_condition_id FROM public.condition_relations WHERE id = $1`,
        [out.id],
      );
      expect(r).toEqual({
        relation_type: "episode_of",
        condition_id: out.conditionId,
        related_condition_id: problem.id,
      });
      const counts = await rows<{ category: string; n: number }>(
        `SELECT category, count(*)::int AS n FROM public.conditions_current WHERE patient_user_id = $1 GROUP BY category ORDER BY category`,
        [v.q],
      );
      expect(counts).toEqual([
        { category: "encounter_diagnosis", n: 1 },
        { category: "problem_list_item", n: 1 },
      ]);
    });

    it("refine: same logical id, the new term, refined_from kept; its relations follow", async () => {
      const v = await newVisit();
      const acs = await record(v, { termId: dxTermUuid("dx.acs"), verification: "provisional" });
      const dm = await record(v, { termId: dxTermUuid("dx.dm_type2"), verification: "confirmed" });
      const rf = await link(v, dm, acs, { relationType: "risk_factor_for", label: null });
      const decidedBy = [`clinical_observations:${crypto.randomUUID()}`];
      const out = await as(v.q, (ctx) =>
        dx.refineDiagnosis(ctx, {
          patientUserId: v.q,
          id: acs,
          termId: dxTermUuid("dx.nstemi"),
          decidedBy,
          clientKey: key(),
        }),
      );
      const [c] = await rows<{
        logical_id: string;
        version: number;
        term_id: string;
        refined_from: unknown;
        verification: string;
      }>(
        `SELECT logical_id, version, term_id, refined_from, verification FROM public.conditions WHERE id = $1`,
        [out.id],
      );
      expect(c).toEqual({
        logical_id: acs,
        version: 2,
        term_id: dxTermUuid("dx.nstemi"),
        refined_from: { versionId: acs, termId: dxTermUuid("dx.acs"), decidedBy },
        verification: "provisional",
      });
      expect(await current(rf.id)).toMatchObject({ version: 1, state: "active" });
      await expect(
        as(v.q, (ctx) =>
          dx.refineDiagnosis(ctx, {
            patientUserId: v.q,
            id: out.id,
            termId: dxTermUuid("dx.dm_type2"),
            clientKey: key(),
          }),
        ),
      ).rejects.toThrow(/Already on this visit/);
    });

    it("replace: the old one refuted with its reason, the new one recorded in its place, links retired", async () => {
      const v = await newVisit();
      const acs = await record(v, {
        termId: dxTermUuid("dx.acs"),
        verification: "provisional",
        rank: "primary",
      });
      const dm = await record(v, { termId: dxTermUuid("dx.dm_type2"), verification: "confirmed" });
      const rf = await link(v, dm, acs, { relationType: "risk_factor_for", label: null });
      const out = await as(v.q, (ctx) =>
        dx.replaceDiagnosis(ctx, {
          patientUserId: v.q,
          encounterId: v.e,
          id: acs,
          text: "Acute pericarditis",
          reasonText: "ECG widespread ST-elevation with PR depression; troponin not raised",
          clientKey: key(),
        }),
      );
      const byId = async (id: string) =>
        (
          await rows<{ logical_id: string; verification: string; rank: string; term_id: string }>(
            `SELECT logical_id, verification, rank, term_id FROM public.conditions WHERE id = $1`,
            [id],
          )
        )[0]!;
      expect(await byId(out.refutedId)).toMatchObject({ logical_id: acs, verification: "refuted" });
      expect(await byId(out.id)).toMatchObject({
        logical_id: out.id,
        verification: "provisional",
        rank: "primary",
        term_id: null,
      });
      expect(await current(rf.id)).toMatchObject({
        state: "retired",
        origin: "system_end_removed",
      });
    });

    it("the desk carries the relations and the background", async () => {
      const v = await newVisit();
      const problem = await as(v.q, (ctx) =>
        facts.recordProblem(ctx, {
          patientUserId: v.q,
          termId: dxTermUuid("dx.dm_type1"),
          clientKey: key(),
        }),
      );
      const dka = await record(v, { termId: dxTermUuid("dx.dka"), verification: "confirmed" });
      const r = await link(v, dka, problem.id, { label: "complication" });
      const desk = await loadDeskFor(mo, v.e, { database: lane.db });
      expect(desk!.payload.background).toEqual([
        expect.objectContaining({
          logicalId: problem.id,
          display: expect.any(String),
          restricted: false,
        }),
      ]);
      expect(desk!.payload.relations).toEqual([
        expect.objectContaining({
          id: r.id,
          conditionId: dka,
          relatedConditionId: problem.id,
          relationType: "due_to",
          label: "complication",
          restricted: false,
        }),
      ]);
    });

    it("Phase 3: 'Add a linked diagnosis' writes the diagnosis and its link together, or neither", async () => {
      const v = await newVisit();
      const dm = await record(v, { termId: dxTermUuid("dx.dm_type2"), verification: "confirmed" });
      const k = key();
      const add = () =>
        as(v.q, (ctx) =>
          rel.addLinkedDiagnosis(ctx, {
            patientUserId: v.q,
            encounterId: v.e,
            parentId: dm,
            termId: dxTermUuid("dx.diabetic_retinopathy"),
            relationType: "due_to",
            label: "complication",
            catalogueRef: "MS-EMR-DX-ASSOC-001@test:dx.diabetic_retinopathy<-dx.dm_type2",
            clientKey: k,
          }),
        );
      const r = await add();
      expect(await current(r.id)).toMatchObject({ state: "active", label: "complication" });
      const [c] = await rows<{ rank: string; verification: string }>(
        `SELECT rank, verification FROM public.conditions WHERE logical_id = $1`,
        [r.conditionId],
      );
      expect(c).toEqual({ rank: "secondary", verification: "provisional" });
      expect(await add()).toMatchObject({ id: r.id, conditionId: r.conditionId });
      // A refused link (onto a differential) leaves no orphan diagnosis.
      const sep = await record(v, { text: "Sepsis", verification: "differential" });
      const n = async () =>
        (
          await rows<{ n: number }>(
            `SELECT count(*)::int AS n FROM public.conditions WHERE patient_user_id = $1`,
            [v.q],
          )
        )[0]!.n;
      const before = await n();
      await expect(
        as(v.q, (ctx) =>
          rel.addLinkedDiagnosis(ctx, {
            patientUserId: v.q,
            encounterId: v.e,
            parentId: sep,
            termId: dxTermUuid("dx.aki"),
            relationType: "due_to",
            label: "secondary",
            clientKey: key(),
          }),
        ),
      ).rejects.toMatchObject({ code: "invalid" });
      expect(await n()).toBe(before);
    });

    it("Phase 3: demotion retires links only once confirmed; a swap keeps both working", async () => {
      const v = await newVisit();
      const mal = await record(v, {
        termId: dxTermUuid("dx.malaria_severe"),
        verification: "confirmed",
        rank: "primary",
      });
      const ana = await record(v, {
        termId: dxTermUuid("dx.anaemia"),
        verification: "provisional",
      });
      const pn = await record(v, {
        termId: dxTermUuid("dx.pneumonia"),
        verification: "provisional",
      });
      const r = await link(v, ana, mal);
      // Swap with a co-existing diagnosis: the old leading stays working (co-existing), the link stays.
      await as(v.q, (ctx) =>
        dx.setLeadingDiagnosis(ctx, {
          patientUserId: v.q,
          encounterId: v.e,
          id: pn,
          clientKey: key(),
        }),
      );
      const now = await rows<{ logical_id: string; rank: string; verification: string }>(
        `SELECT DISTINCT ON (logical_id) logical_id, rank, verification FROM public.conditions
         WHERE encounter_id = $1 ORDER BY logical_id, version DESC`,
        [v.e],
      );
      const by = new Map(now.map((c) => [c.logical_id, c]));
      expect(by.get(mal)).toMatchObject({ rank: "secondary", verification: "confirmed" });
      expect(by.get(pn)).toMatchObject({ rank: "primary" });
      expect(await current(r.id)).toMatchObject({ state: "active" });
      // To the differential: refused while linked, unless the clinician confirmed the retirement.
      const malNow = (
        await rows<{ id: string }>(
          `SELECT id FROM public.conditions WHERE logical_id = $1 ORDER BY version DESC LIMIT 1`,
          [mal],
        )
      )[0]!.id;
      await expect(
        as(v.q, (ctx) =>
          dx.moveToDifferential(ctx, { patientUserId: v.q, id: malNow, clientKey: key() }),
        ),
      ).rejects.toMatchObject({ code: "conflict", message: rel.LINKS_TO_RETIRE });
      expect(await current(r.id)).toMatchObject({ state: "active" });
      await as(v.q, (ctx) =>
        dx.moveToDifferential(ctx, {
          patientUserId: v.q,
          id: malNow,
          retireLinks: true,
          clientKey: key(),
        }),
      );
      expect(await current(r.id)).toMatchObject({
        state: "retired",
        origin: "clinician",
        reason_code: "moved_to_differential",
      });
    });

    it("Phase 3: Change keeps the label and sets the precipitants; the desk names a removed cause", async () => {
      const v = await newVisit();
      const dka = await record(v, { termId: dxTermUuid("dx.dka"), verification: "confirmed" });
      const pn = await record(v, { termId: dxTermUuid("dx.pneumonia"), verification: "confirmed" });
      const r = await link(v, dka, pn, { label: "precipitated_by" });
      await as(v.q, (ctx) =>
        rel.relabelRelation(ctx, {
          patientUserId: v.q,
          id: r.id,
          label: "precipitated_by",
          qualifiers: ["cause.insulin_omission"],
          clientKey: key(),
        }),
      );
      const [q] = await rows<{ qualifiers: string[] }>(
        `SELECT qualifiers FROM public.condition_relations_current WHERE logical_id = $1`,
        [r.id],
      );
      expect(q!.qualifiers).toEqual(["cause.insulin_omission"]);
      await as(v.q, (ctx) =>
        facts.markFactEnteredInError(ctx, {
          kind: "condition",
          patientUserId: v.q,
          id: pn,
          reasonCode: "wrong_patient",
          clientKey: key(),
        }),
      );
      const desk = await loadDeskFor(mo, v.e, { database: lane.db });
      expect(desk!.payload.causeRemoved).toEqual([
        expect.objectContaining({
          logicalId: r.id,
          conditionId: dka,
          causeDisplay: expect.stringMatching(/pneumonia/i),
          reason: "in_error",
        }),
      ]);
      expect(desk!.payload.relations).toEqual([]);
    });

    it("D-REL-17 report: an unsigned draft's links become proposals; nothing is written", async () => {
      const v = await newVisit();
      const dm = await record(v, { termId: dxTermUuid("dx.dm_type2"), verification: "confirmed" });
      await record(v, { termId: dxTermUuid("dx.dka"), verification: "confirmed" });
      await record(v, { termId: dxTermUuid("dx.hypertension"), verification: "confirmed" });
      const content = {
        sections: {},
        impression: { meta: { [dm]: { with: ["dx.dka", "dx.hypertension"] } } },
      };
      await lane.pg.query(
        `INSERT INTO public.clinical_notes (hospital_id, patient_user_id, encounter_id, note_type, template_id,
           template_version, author_user_id, author_cadre, content_ciphertext, effective_at)
         VALUES ($1, $2, $3, 'clerking', 'lane', '1', $4, 'MEDICAL_OFFICER', $5, now())`,
        [h, v.q, v.e, mo.userId, encrypt(JSON.stringify(content))],
      );
      const before = await rows(`SELECT count(*)::int AS n FROM public.condition_relations`);
      const r = await backfillRelationsReport(lane.db);
      expect(r.withLinks).toBeGreaterThanOrEqual(1);
      expect(r.due_to).toBeGreaterThanOrEqual(1);
      expect(r.associated_with).toBeGreaterThanOrEqual(1);
      expect(await rows(`SELECT count(*)::int AS n FROM public.condition_relations`)).toEqual(
        before,
      );
    });
  });
});
