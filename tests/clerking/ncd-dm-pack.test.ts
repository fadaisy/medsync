import { existsSync, readFileSync } from "node:fs";
import type { Scenario } from "./exam-fixtures";
import type { ExamContext } from "@/lib/clerking/exam/context";
import type { Cond, DxProfile } from "@/lib/clerking/impression/catalogue";
import { describe, expect, it } from "vitest";

import dxSignoff from "@/data/clerking/dx-signoff.v1.json";
import { pastDetail } from "@/lib/clerking/answers";
import { conditionDetails } from "@/lib/clerking/compose";
import { visibleAttributes } from "@/lib/clerking/exam/answers";
import { ruleClassifier } from "@/lib/clerking/exam/classifiers";
import { examCommitLines } from "@/lib/clerking/exam/commit";
import { composeExam, examText } from "@/lib/clerking/exam/compose";
import { evalCond, evalTri } from "@/lib/clerking/exam/context";
import { evaluateExamFlags } from "@/lib/clerking/exam/flags";
import { suggestions as examSuggestions } from "@/lib/clerking/exam/suggest";
import {
  draftAfterSave,
  mergeVitals,
  parseVitalsDraft,
  saveLines,
} from "@/lib/clerking/exam/vitals";
import { EMPTY_IMPRESSION } from "@/lib/clerking/impression/board";
import { dxLive } from "@/lib/clerking/impression/catalogue";
import { atomTrue, suggestedFor } from "@/lib/clerking/impression/evidence";
import { refClass } from "@/lib/clerking/impression/facts";
import { suggestions } from "@/lib/clerking/impression/suggest";
import { problemCards } from "@/lib/clerking/plan/problems";
import { applyGateAEdits } from "../../scripts/clerking/exam-gate-a-edits";
import {
  ALL_SIGNED,
  ecat,
  ketones,
  negative,
  NOW,
  positive,
  scenario,
  solve,
  tick,
  toCtx,
} from "./exam-fixtures";
import { cat } from "./fixtures";
import { board, ctx, dx, IN, recorded, solveDx } from "./si-fixtures";

/**
 * MS-NCD-DM-PACK-001 Phase 5 (STOP 5): the engine changes GATE A accepted (EC-1, EC-2, EC-3,
 * EC-5, EC-6, EC-7, EC-8), the amendments merged, and the care list left unsigned. Every new or
 * changed flag, suggestion and differential rule is also run both ways by the catalogue-wide
 * tests (exam-flags, exam-suggest, si-rules); here: what those cannot see. Synthetic data only.
 */

const PACK = "docs/ncd/diabetes/pack-0.3.0-draft/clerking-v2";
const read = (p: string) => JSON.parse(readFileSync(p, "utf8"));
const signed = { ...ALL_SIGNED, withheld: [] as string[] };
const flagIds = (s: Scenario) => evaluateExamFlags(toCtx(s), signed).flags.map((f) => f.ruleId);
const results = (s: Scenario) => evaluateExamFlags(toCtx(s), signed).results;

const NEW_EXAM_FLAGS = [
  "FLAG-EX-KETONES-HIGH-DM",
  "FLAG-EX-KETONES-HIGH",
  "FLAG-EX-KETONES-RISK",
  "FLAG-EX-INSULIN-STOPPED",
  "FLAG-EX-SGLT2-UNWELL",
  "FLAG-EX-DR-SIGHT",
];
const NEW_SUGGESTIONS = [
  "SUG-PMH-DIABETES",
  "SUG-DM-UNWELL",
  "SUG-DM-INSULIN-SITES",
  "SUG-DM-NEURO",
  "SUG-GLU-KETONES",
  "SUG-SGLT2-KETONES",
];
const NEW_RULES = [
  "DDX-KETONES",
  "DDX-SGLT2-UNWELL",
  "DDX-RESULT-HBA1C",
  "DDX-RESULT-GLUCOSE-FASTING",
  "DDX-RESULT-GLUCOSE-IFG",
  "DDX-RESULT-EGFR",
  "DDX-RESULT-UACR",
  "DDX-RETINOPATHY",
  "DDX-GLUCOSE-IN-HOSPITAL",
  "DDX-STEROID-GLUCOSE",
  "DDX-PREGNANCY-GLUCOSE",
];
const AMENDED = [
  "dx.dm_type_unknown",
  "dx.dm_type2",
  "dx.dm_type1",
  "dx.dka",
  "dx.hhs",
  "dx.hypoglycaemia_dm",
  "dx.ckd",
];

/* ─── EC-8: by merge, nothing removed ─────────────────────────────── */

describe("the amendments are merged, never replaced (EC-8, P0-17)", () => {
  it("examination: every GATE A item, flag, suggestion, classifier and reference stands", () => {
    const base = applyGateAEdits(read("docs/emr/clerking-v2/exam/clerking-exam-catalogue.v1.json"));
    const now = read("data/clerking/clerking-exam-catalogue.v1.json");
    for (const [id, item] of Object.entries(
      base.items as Record<string, { attributes?: unknown[] }>,
    )) {
      const n = now.items[id];
      if (id !== "ex.eyes_ent_neck.fundoscopy") expect(n, id).toEqual(item);
      else expect(n.attributes.slice(0, item.attributes!.length)).toEqual(item.attributes);
    }
    for (const k of ["flag_rules"] as const)
      for (const r of base[k]) expect(now[k]).toContainEqual(r);
    for (const r of base.suggestion_rules.rules)
      expect(now.suggestion_rules.rules).toContainEqual(r);
    for (const k of ["classifiers", "reference_entries", "medicine_groups", "scales", "sources"])
      for (const [id, v] of Object.entries(base[k] as Record<string, unknown>))
        expect(now[k][id], `${k} ${id}`).toEqual(v);
    for (const p of base.vital_signs.panels) expect(now.vital_signs.panels).toContainEqual(p);
    const g = (c: {
      vital_signs: { fields: { id: string; qualifiers: { context: string[] } }[] };
    }) => c.vital_signs.fields.find((f) => f.id === "vs.glucose")!.qualifiers.context;
    expect(g(now).slice(0, g(base).length)).toEqual(g(base));
  });

  it("diagnosis: every live atom, ask, test and relation stands, scalars untouched but the signed", () => {
    const base = read(
      "docs/emr/clerking-v2/summary-impression/clerking-diagnosis-catalogue.v1.json",
    );
    const pack = read(`${PACK}/09-diagnosis.amendment.json`).amendment;
    const LISTS = [
      "suggest_for",
      "suggest_against",
      "ask",
      "tests_to_decide",
      "related",
      "sources",
    ];
    for (const id of AMENDED) {
      const was = base.profiles[id];
      const p = dx.profile(id)! as unknown as Record<string, unknown[]>;
      for (const f of LISTS)
        for (const x of was[f]) {
          // P0-16: the obese-BMI 'against' atom left type 1 when it became must-not-miss.
          if (id === "dx.dm_type1" && f === "suggest_against") continue;
          expect(p[f], `${id} ${f}`).toContainEqual(x);
        }
      // Every addition is the pack's (by its text for evidence; tests renamed under P0-21).
      const from = pack.profiles.find((q: { id: string }) => q.id === id);
      const texts = [...from.suggest_for, ...from.suggest_against].map(
        (e: { text: string }) => e.text,
      );
      for (const f of ["suggest_for", "suggest_against"])
        for (const e of p[f] as { text: string }[])
          if (!was[f].some((x: { text: string }) => x.text === e.text))
            expect(texts, `${id} ${e.text}`).toContain(e.text);
      for (const k of ["kind", "onset", "problem_list", "severity", "note", "time_critical"])
        expect(p[k], `${id} ${k}`).toEqual(was[k]);
    }
    expect(base.profiles["dx.dm_type1"].must_not_miss).toBe(false);
    for (const r of base.ddx_rules) {
      const now = dx.rules.find((x) => x.id === r.id)!;
      expect({ ...now, suggest: now.suggest.slice(0, r.suggest.length) }).toEqual(r);
    }
    for (const [id, v] of Object.entries(base.reference_entries))
      expect(dx.data.reference_entries[id]).toEqual(v);
  });
});

/* ─── The signed decisions ────────────────────────────────────────── */

describe("GATE A rulings", () => {
  it("type 1 is must-not-miss with its reason, and no must-not-miss diabetes diagnosis has 'against' evidence (D-DM-35, P0-15, P0-16)", () => {
    const t1 = dx.profile("dx.dm_type1")!;
    expect(t1.must_not_miss).toBe(true);
    expect(t1.must_not_miss_reason).toBe("Untreated it becomes ketoacidosis.");
    for (const id of ["dx.dm_type1", "dx.dka", "dx.hhs", "dx.hypoglycaemia_dm"])
      expect(dx.profile(id)!.suggest_against, id).toEqual([]);
    // Not must-not-miss: ketones argue against uncomplicated type 2 (the pack's one 'against').
    expect(dx.profile("dx.dm_type2")!.suggest_against.map((e) => e.text)).toEqual([
      "cls:ketone_band",
    ]);
  });

  it("drops what the rulings drop (P0-15, P0-17, P0-19, P0-21, P0-23, P0-24)", () => {
    const all = readFileSync("data/clerking/clerking-diagnosis-catalogue.v1.json", "utf8");
    const exam = readFileSync("data/clerking/clerking-exam-catalogue.v1.json", "utf8");
    expect(dx.rules.find((r) => r.id === "DDX-GLUCOSE-HIGH")!.suggest).not.toContain(
      "dx.steroid_induced_hyperglycaemia",
    );
    expect(dx.rules.find((r) => r.id === "DDX-POLYURIA")!.source).toBe("ADA-SOC-2025");
    for (const gone of ["DDX-GLUCOSE-VERY-HIGH", "REF-DX-KETONE-NORMAL", "dx.cataract"])
      expect(all).not.toContain(`"${gone}"`);
    for (const gone of ["FLAG-EX-GLU-KETONE-TEST", "SUG-DM-POSTURAL"])
      expect(exam).not.toContain(`"${gone}"`);
    for (const packId of [
      "test.ketones_blood",
      "test.venous_gas",
      "test.glucose_capillary",
      "test.vitamin_b12",
      "sym.vomiting",
      "obs.ph_venous",
    ]) {
      expect(all).not.toContain(`"${packId}"`);
      expect(exam).not.toContain(`"${packId}"`);
    }
  });

  it("withholds what has no signed value or reason, and the check reports it dark", () => {
    expect(dxSignoff.withheld).toEqual(
      expect.arrayContaining([
        "REF-DX-RESULT-AGE-GLUCOSE",
        "REF-DX-ADULT-AGE",
        "dx.diabetes_in_pregnancy",
      ]),
    );
    expect(dx.refValue("REF-DX-RESULT-AGE-GLUCOSE")).toBeNull();
    const live = dxLive({ ...dxSignoff, profiles: "all", rules: "all" } as never);
    expect(live.profile("dx.diabetes_in_pregnancy")).toBe(false);
    expect(live.ref("REF-DX-RESULT-AGE-GLUCOSE")).toBe(false);
  });
});

/* ─── P0-18: three-valued ─────────────────────────────────────────── */

const T = { always: true };
const F = { always: false };
const U = { result: "obs.hba1c", gte_ref: "REF-DX-HBA1C-DM" }; // no results loaded: unknown

describe("the evaluator is three-valued (P0-18)", () => {
  const x = ctx(scenario());
  it("Kleene truth tables for all, any and not", () => {
    const v = (c: Cond) => evalTri(c, x);
    expect(v(U)).toBeNull();
    expect(v({ not: U })).toBeNull();
    expect([v({ all: [T, U] }), v({ all: [F, U] }), v({ all: [T, T] })]).toEqual([
      null,
      false,
      true,
    ]);
    expect([v({ any: [F, U] }), v({ any: [T, U] }), v({ any: [F, F] })]).toEqual([
      null,
      true,
      false,
    ]);
  });

  it("unknown never fires, and neither does 'not unknown' (the fail-open hazard)", () => {
    expect(evalCond({ not: U }, x)).toBe(false);
    expect(evalCond({ not: { an_atom_nobody_knows: 1 } }, x)).toBe(false);
  });

  it("a fasting threshold never fires on a random glucose; no context is unknown (EC-3)", () => {
    const atom = { vital: "vs.glucose", context: "fasting", gte_ref: "REF-DX-GLU-FASTING-DM" };
    const s = scenario();
    s.vitals.glucose = 7.5;
    expect(evalTri(atom, ctx(s))).toBeNull();
    s.vitals.glucoseContext = "random";
    expect(evalTri(atom, ctx(s))).toBe(false);
    s.vitals.glucoseContext = "fasting";
    expect(evalTri(atom, ctx(s))).toBe(true);
    s.vitals.glucose = 6.9;
    expect(evalTri(atom, ctx(s))).toBe(false);
  });

  it("'not pregnant' is never assumed for a woman nobody asked (EC-5, P0-02)", () => {
    const notPregnant = { not: { pregnancy: "current" } };
    const woman = scenario({ patient: { ageYears: 30, sex: "female", pregnant: null } });
    expect(evalTri(notPregnant, ctx(woman))).toBeNull();
    expect(evalTri({ pregnancy: "unknown" }, ctx(woman))).toBe(true);
    const man = scenario({ patient: { ageYears: 30, sex: "male", pregnant: null } });
    expect(evalTri(notPregnant, ctx(man))).toBe(true);
    const unrecordedSex = scenario({ patient: { ageYears: 30, sex: null, pregnant: null } });
    expect(evalTri(notPregnant, ctx(unrecordedSex))).toBeNull();
  });

  it("an empty record fires no new flag, suggestion or differential rule", () => {
    for (const sex of ["male", "female", null] as const) {
      const s = scenario({ patient: { ageYears: 40, sex, pregnant: null } });
      expect(flagIds(s).filter((f) => NEW_EXAM_FLAGS.includes(f))).toEqual([]);
      expect(
        examSuggestions(toCtx(s)).flatMap((g) =>
          g.ruleIds.filter((r) => NEW_SUGGESTIONS.includes(r)),
        ),
      ).toEqual([]);
      for (const id of NEW_RULES)
        expect(atomTrue(dx.rules.find((r) => r.id === id)!.when, { x: ctx(s), ...IN }), id).toBe(
          false,
        );
    }
  });
});

/* ─── EC-1: results ───────────────────────────────────────────────── */

const fact = (o: Partial<NonNullable<ExamContext["facts"]>[number]>) => ({
  concept: "obs.glucose",
  value: 7.4,
  at: "2026-10-01T08:00:00.000Z",
  trust: 4 as const,
  ...o,
});
const withFacts = (facts: NonNullable<ExamContext["facts"]>, s = scenario()) => ({
  ...ctx(s),
  facts,
  now: NOW,
});

describe("the result atom (EC-1)", () => {
  const kidney = {
    result: "derived.egfr",
    lt_ref: "REF-DX-EGFR-REDUCED",
    max_age_ref: "REF-DX-RESULT-AGE-KIDNEY",
    min_trust: 3,
  };

  it("reads the newest matching fact: a later random glucose does not hide an earlier fasting one", () => {
    const atom = {
      result: "obs.glucose",
      gte_ref: "REF-DX-GLU-FASTING-DM",
      qualifiers: { fastingState: "fasting" },
      min_trust: 3,
    };
    const x = withFacts([
      fact({ value: 7.4, fastingState: "fasting", at: "2026-10-01T08:00:00.000Z" }),
      fact({ value: 5.0, fastingState: "non_fasting", at: "2026-10-03T08:00:00.000Z" }),
    ]);
    expect(evalTri(atom, x)).toBe(true);
    expect(evalTri(atom, withFacts([fact({ value: 6.2, fastingState: "fasting" })]))).toBe(false);
  });

  it("is unknown, not false, without a fact, out of its window or below its trust", () => {
    expect(evalTri(kidney, withFacts([]))).toBeNull();
    expect(
      evalTri(
        kidney,
        withFacts([fact({ concept: "derived.egfr", value: 45, at: "2024-01-01T00:00:00.000Z" })]),
      ),
    ).toBeNull();
    expect(
      evalTri(kidney, withFacts([fact({ concept: "derived.egfr", value: 45, trust: 2 })])),
    ).toBeNull();
    expect(evalTri(kidney, withFacts([fact({ concept: "derived.egfr", value: 45 })]))).toBe(true);
    expect(evalTri(kidney, withFacts([fact({ concept: "derived.egfr", value: 75 })]))).toBe(false);
    expect(evalTri(kidney, ctx(scenario()))).toBeNull(); // results never loaded
  });

  it("an unsigned window keeps the laboratory glucose rules dark (D-DM-08)", () => {
    const rule = dx.rules.find((r) => r.id === "DDX-RESULT-GLUCOSE-FASTING")!;
    const x = withFacts([fact({ value: 9, fastingState: "fasting" })]);
    expect(evalTri(rule.when, x)).toBeNull();
  });

  it("decides a bound ('> 33.3') only as far as the bound goes", () => {
    const hhs = { result: "obs.glucose", gte_ref: "REF-DX-GLU-FASTING-DM" };
    expect(evalTri(hhs, withFacts([fact({ value: 33.3, comparator: ">" })]))).toBe(true);
    expect(evalTri(hhs, withFacts([fact({ value: 3, comparator: "<" })]))).toBe(false);
    expect(evalTri(hhs, withFacts([fact({ value: 30, comparator: "<" })]))).toBeNull();
  });

  it("HbA1c is unknown unless a certified laboratory measured it and no caveat holds", () => {
    const atom = { result: "obs.hba1c", gte_ref: "REF-DX-HBA1C-DM", min_trust: 3 };
    const lab = fact({
      concept: "obs.hba1c",
      value: 7.2,
      certification: "ngsp",
      pointOfCare: false,
    });
    const man = scenario({ patient: { ageYears: 50, sex: "male", pregnant: null } });
    expect(evalTri(atom, withFacts([lab], man))).toBe(true);
    expect(evalTri(atom, withFacts([{ ...lab, pointOfCare: true }], man))).toBeNull();
    expect(evalTri(atom, withFacts([{ ...lab, certification: "none" }], man))).toBeNull();
    const woman = scenario({ patient: { ageYears: 30, sex: "female", pregnant: null } });
    expect(evalTri(atom, withFacts([lab], woman))).toBeNull(); // pregnancy not ruled out
    woman.patient.pregnant = false;
    expect(evalTri(atom, withFacts([lab], woman))).toBe(true);
    const hiv = scenario({ patient: { ageYears: 50, sex: "male", pregnant: null } });
    hiv.history.past.conditions.hiv = { answer: "yes" };
    expect(evalTri(atom, withFacts([lab], hiv))).toBeNull();
    const transfused = scenario({ patient: { ageYears: 50, sex: "male", pregnant: null } });
    transfused.history.past.transfusions = [{ when: "last_3_months" }];
    expect(evalTri(atom, withFacts([lab], transfused))).toBeNull();
  });
});

/* ─── EC-6: HI and LO ─────────────────────────────────────────────── */

describe("a meter's HI and LO (EC-6)", () => {
  const draft = (glucose: string) =>
    parseVitalsDraft(ecat, { glucose, glucoseContext: "random" }).values;

  it("parse as readings, never numbers, and keep their context", () => {
    expect(draft("HI")).toMatchObject({
      glucose: null,
      glucoseReads: "HI",
      glucoseContext: "random",
    });
    expect(draft(" lo ")).toMatchObject({ glucose: null, glucoseReads: "LO" });
    expect(parseVitalsDraft(ecat, { glucose: "HI" }).errors).toEqual({});
  });

  it("HI satisfies every 'at or above' glucose atom; LO every 'below' one", () => {
    const s = scenario();
    s.vitals = mergeVitals(s.vitals, draft("HI"));
    expect(evalCond({ vital: "vs.glucose", gte_ref: "REF-EX-GLU-HIGH" }, toCtx(s))).toBe(true);
    expect(evalCond({ vital: "vs.glucose", lt_ref: "REF-EX-HYPO-L2" }, toCtx(s))).toBe(false);
    expect(flagIds(s)).toContain("FLAG-EX-GLU-HIGH");
    const lo = scenario();
    lo.vitals = mergeVitals(lo.vitals, draft("LO"));
    expect(results(lo).get("hypoglycaemia_level")?.result).toBe("level_2");
    expect(flagIds(lo)).toContain("FLAG-EX-HYPO-L2");
    expect(flagIds(lo)).not.toContain("FLAG-EX-GLU-HIGH");
  });

  it("a typed glucose brings its own context; HI is not charted, stays in the note and the draft", () => {
    const saved = { ...scenario().vitals, glucose: 6, glucoseContext: "fasting" };
    expect(mergeVitals(saved, draft("HI"))).toMatchObject({
      glucose: null,
      glucoseReads: "HI",
      glucoseContext: "random",
    });
    const s = scenario();
    s.exam = {
      ...s.exam,
      vitalsDraft: { glucose: "HI", glucoseContext: "random", pulse: "88" },
      entries: { "ex.general.oxygen": { state: "negative", choice: "room_air" } },
      blocks: { consciousness: { method: "acvpu", acvpu: "A" } },
    };
    const r = saveLines(ecat, s.exam, "set-1");
    expect(r.ok && r.lines.map((l) => l.conceptId)).not.toContain("obs.glucose");
    expect(draftAfterSave(s.exam.vitalsDraft)).toEqual({ glucose: "HI", glucoseContext: "random" });
    expect(draftAfterSave({ glucose: "6.2", glucoseContext: "random" })).toBeUndefined();
    s.vitals = mergeVitals(s.vitals, parseVitalsDraft(ecat, s.exam.vitalsDraft).values);
    const x = toCtx(s);
    const text = examText(
      composeExam({ x, results: results(s), saved: null, audience: "clinician" }),
    );
    expect(text).toContain("glucose HI (above the meter's range, random)");
  });

  it("a 2-hour value after 75 g glucose is charted as the OGTT challenge (EC-3)", () => {
    const s = scenario();
    s.exam = {
      ...s.exam,
      vitalsDraft: { glucose: "12.5", glucoseContext: "two_hours_after_glucose" },
      entries: { "ex.general.oxygen": { state: "negative", choice: "room_air" } },
      blocks: { consciousness: { method: "acvpu", acvpu: "A" } },
    };
    const r = saveLines(ecat, s.exam, "set-2");
    expect(r.ok && r.lines.find((l) => l.conceptId === "obs.glucose")).toMatchObject({
      challenge: "ogtt_75g",
      challengeMinutes: 120,
    });
  });
});

/* ─── EC-5: the pregnancy gate ────────────────────────────────────── */

describe("pregnancy diagnoses (EC-5)", () => {
  const gdm = dx.profile("dx.gestational_diabetes")! as DxProfile;
  const rule = dx.rules.find((r) => r.id === "DDX-PREGNANCY-GLUCOSE")!;

  it("are offered only in a recorded pregnancy; unknown never opens the gate", () => {
    const s = scenario({ patient: { ageYears: 28, sex: "female", pregnant: null } });
    s.vitals.glucose = 12;
    s.vitals.glucoseContext = "random";
    const ids = (x: ExamContext) =>
      suggestions({
        x,
        dx,
        live: IN.live,
        viewer: IN.viewer,
        board: board([], EMPTY_IMPRESSION),
      }).map((g) => g.dxId);
    expect(ids(ctx(s))).not.toContain("dx.gestational_diabetes");
    s.patient.pregnant = true;
    expect(ids(ctx(s))).toContain("dx.gestational_diabetes");
    expect(atomTrue(rule.when, { x: ctx(s), ...IN })).toBe(true);
  });

  it("read results from this pregnancy only", () => {
    const s = scenario({
      patient: {
        ageYears: 28,
        sex: "female",
        pregnant: true,
        pregnancySince: "2026-08-01T00:00:00.000Z",
      },
    });
    const before = fact({ value: 5.5, fastingState: "fasting", at: "2026-07-01T00:00:00.000Z" });
    const during = { ...before, at: "2026-09-01T00:00:00.000Z" };
    // The window is unsigned (D-DM-08), so the GDM atoms stay dark whatever the date; the
    // bounding is shown with the window supplied as a fixture value.
    const x0 = withFacts([before], s);
    const x: ExamContext = {
      ...x0,
      dxRefs: { refValue: (id) => (id === "REF-DX-RESULT-AGE-GLUCOSE" ? 400 : dx.refValue(id)) },
    };
    const open = {
      ...IN,
      live: dxLive({
        profiles: "all",
        rules: "all",
        referenceEntries: "all",
        namedScales: "all",
        withheld: [],
      }),
    };
    expect(suggestedFor(gdm, { x, ...open }).size).toBe(0);
    expect(suggestedFor(gdm, { x: { ...x, facts: [during] }, ...open }).size).toBe(1);
    expect(
      suggestedFor(gdm, {
        x: { ...x, facts: [during], patient: { ...x.patient, pregnant: null } },
        ...open,
      }).size,
    ).toBe(0);
  });
});

/* ─── EC-2: past-history details ──────────────────────────────────── */

describe("past-history details (EC-2)", () => {
  it("are three-valued: unanswered is unknown, a 'no' to the condition is false", () => {
    const h = scenario().history;
    const c = { past_detail: "diabetes", property: "type", equals: "type_1" };
    expect(pastDetail(h, c)).toBeNull();
    h.past.conditions.diabetes = { answer: "yes" };
    expect(pastDetail(h, c)).toBeNull();
    h.past.conditions.diabetes.details = { type: "type_1" };
    expect(pastDetail(h, c)).toBe(true);
    h.past.conditions.diabetes.details = { type: "type_2" };
    expect(pastDetail(h, c)).toBe(false);
    h.past.conditions.diabetes = { answer: "no" };
    expect(pastDetail(h, c)).toBe(false);
  });

  it("compose by the catalogue's template, leaving out what is unanswered", () => {
    expect(conditionDetails(cat, "diabetes", undefined)).toBeNull();
    expect(
      conditionDetails(cat, "diabetes", {
        type: "type_2",
        year_diagnosed: 2015,
        treatment: ["tablets", "insulin"],
        complications_told: ["eyes"],
        last_eye_check: "over_2_years",
        lows_12_months: "none",
      }),
    ).toBe(
      "Diabetes (type 2) diagnosed 2015, on tablets and insulin; known problems: eyes; last eye check more than 2 years ago; lows in the last year: none",
    );
    expect(conditionDetails(cat, "diabetes", { type: "type_1" })).toBe("Diabetes (type 1)");
    expect(conditionDetails(cat, "diabetes", { treatment: ["insulin"] })).toBe(
      "Diabetes on insulin",
    );
  });

  it("show 'on insulin since diagnosis' only with insulin among the treatments", () => {
    const d = cat.details("diabetes")!;
    const p = d.properties.find((q) => q.id === "insulin_from_start")!;
    expect(p.shown_when).toEqual({ property: "treatment", includes_any: ["insulin"] });
    expect(d.properties.find((q) => q.id === "last_eye_check")!.options.map((o) => o.id)).toEqual([
      "within_1_year",
      "1_to_2_years",
      "over_2_years",
      "never",
      "not_sure",
    ]);
  });

  it("keep a restricted condition's class on its details (SI9)", () => {
    const x = ctx(scenario());
    expect(refClass("pmh:hiv#anything", x)).toBe("hiv");
    expect(refClass("pmh:diabetes#type", x)).toBeNull();
  });
});

/* ─── EC-7: the classifiers, both ways ────────────────────────────── */

describe("ketone_band, acuity_band and dr_review (EC-7), each result both ways", () => {
  const cls = (s: Scenario, id: string) => ruleClassifier(toCtx(s), id).result;
  const withS = (f: (s: Scenario) => void) => {
    const s = scenario();
    f(s);
    return s;
  };

  it("ketone_band: high, moderate, raised from blood or urine; silent unrecorded or normal", () => {
    expect(
      cls(
        withS((s) => ketones(s, { urine: "2plus" })),
        "ketone_band",
      ),
    ).toBe("high");
    expect(
      cls(
        withS((s) => ketones(s, { blood: 3.0 })),
        "ketone_band",
      ),
    ).toBe("high");
    expect(
      cls(
        withS((s) => ketones(s, { blood: 2.0 })),
        "ketone_band",
      ),
    ).toBe("moderate");
    expect(
      cls(
        withS((s) => ketones(s, { urine: "trace" })),
        "ketone_band",
      ),
    ).toBe("raised");
    expect(
      cls(
        withS((s) => ketones(s, { urine: "neg", blood: 0.3 })),
        "ketone_band",
      ),
    ).toBeNull();
    expect(cls(scenario(), "ketone_band")).toBeNull();
  });

  it("acuity_band: worse than 6/12 in either eye; silent at 6/12", () => {
    expect(
      cls(
        withS((s) => tick(s, "ex.eyes_ent_neck.visual_acuity", "left", "cf")),
        "acuity_band",
      ),
    ).toBe("worse_than_6_12");
    expect(
      cls(
        withS((s) => tick(s, "ex.eyes_ent_neck.visual_acuity", "left", "6_12")),
        "acuity_band",
      ),
    ).toBeNull();
  });

  const F = "ex.eyes_ent_neck.fundoscopy";
  const screened = (s: Scenario, grade: string, macula?: string) => {
    negative(s, F);
    tick(s, F, "method", "dilated");
    tick(s, F, "view", "adequate");
    tick(s, F, "dr_grade", grade);
    if (macula) tick(s, F, "macula", macula);
  };
  // Through the classifier pass: dr_review reads acuity_band's result.
  const dr = (f: (s: Scenario) => void) => results(withS(f)).get("dr_review")?.result ?? null;

  it("dr_review: every result fires on its finding, most urgent first", () => {
    expect(dr((s) => screened(s, "pdr"))).toBe("refer_within_1_month");
    expect(dr((s) => screened(s, "none", "centre_involving"))).toBe("refer_within_1_month");
    expect(dr((s) => screened(s, "severe_npdr"))).toBe("refer_within_3_months");
    expect(dr((s) => screened(s, "none", "cannot_assess"))).toBe("refer_cannot_assess");
    expect(dr((s) => (positive(s, F), tick(s, F, "seen", "not_visualised")))).toBe(
      "refer_cannot_assess",
    );
    expect(
      dr((s) => (screened(s, "none"), tick(s, "ex.eyes_ent_neck.visual_acuity", "right", "6_60"))),
    ).toBe("refer_cannot_assess");
    expect(
      dr((s) => (screened(s, "mild_npdr"), (s.history.ros["sym.blurred_vision"] = "yes"))),
    ).toBe("refer_cannot_assess");
    expect(dr((s) => screened(s, "none", "non_centre"))).toBe("re_examine_3_months");
    expect(dr((s) => screened(s, "moderate_npdr"))).toBe("refer_routine");
    expect(
      dr((s) => (screened(s, "none"), tick(s, "ex.eyes_ent_neck.visual_acuity", "right", "6_6"))),
    ).toBe("re_examine_by_grade");
    expect(dr((s) => screened(s, "mild_npdr"))).toBe("incomplete"); // no acuity: never a reassuring interval
  });

  it("dr_review: silent unrecorded, and an undilated look grades nothing (not a screen)", () => {
    expect(dr(() => {})).toBeNull();
    const s = withS((q) => (negative(q, F), tick(q, F, "method", "undilated")));
    expect(results(s).get("dr_review")?.result ?? null).toBeNull();
    expect(visibleAttributes(ecat.item(F)!, s.exam.entries[F], null).map((a) => a.id)).toEqual([
      "method",
      "view",
    ]);
    const x = toCtx(s);
    const text = examText(
      composeExam({ x, results: results(s), saved: null, audience: "clinician" }),
    );
    expect(text).toContain("No retinopathy seen (undilated, not a screen).");
  });

  it("recording how the fundus was seen keeps a normal fundus normal", () => {
    const s = withS((q) => screened(q, "none"));
    expect(s.exam.entries[F]!.state).toBe("negative");
    expect(s.exam.entries[F]!.attrs).toEqual({
      method: "dilated",
      view: "adequate",
      dr_grade: "none",
    });
  });
});

describe("what signing charts from the new findings (EC-7 token map)", () => {
  it("the view and injection-site lumps; the grade stays in the note (it needs a laterality)", () => {
    const s = scenario();
    negative(s, "ex.eyes_ent_neck.fundoscopy");
    tick(s, "ex.eyes_ent_neck.fundoscopy", "method", "dilated");
    tick(s, "ex.eyes_ent_neck.fundoscopy", "view", "adequate");
    tick(s, "ex.eyes_ent_neck.fundoscopy", "dr_grade", "none");
    positive(s, "ex.skin.injection_sites", { where: ["abdomen"] });
    const lines = examCommitLines(ecat, s.exam, toCtx(s)).lines;
    const by = (c: string) => lines.find((l) => l.conceptId === c)?.value;
    expect(by("exam.retinal_view")).toEqual({ type: "coded", code: "adequate" });
    expect(by("sign.lipohypertrophy")).toEqual({ type: "presence", presence: "present" });
    expect(by("exam.retinopathy_grade")).toBeUndefined();
    expect(by("exam.fundoscopy")).toEqual({ type: "coded", code: "normal" });
  });
});

describe("the flags merge with the live ones by wording", () => {
  it("high ketones: urgent with diabetes or a raised glucose, caution otherwise, one badge", () => {
    const s = scenario();
    ketones(s, { blood: 3.4 });
    let f = evaluateExamFlags(toCtx(s), signed).flags.filter(
      (x) => x.badge === "Ketones 3.4 mmol/L",
    );
    expect(f.map((x) => `${x.level}:${x.ruleId}`)).toEqual(["caution:FLAG-EX-KETONES-HIGH"]);
    s.history.past.conditions.diabetes = { answer: "yes" };
    f = evaluateExamFlags(toCtx(s), signed).flags.filter((x) => x.badge === "Ketones 3.4 mmol/L");
    expect(f.map((x) => x.level).sort()).toEqual(["caution", "urgent"]);
  });

  it("stopped insulin carries FLAG-MED-ADHERENCE's badge, so the two make one urgent badge", () => {
    const s = scenario();
    s.medicines.push({ name: "Insulin", adherence: "stopped" });
    expect(flagIds(s)).not.toContain("FLAG-EX-INSULIN-STOPPED"); // not dependent, not unwell
    s.history.past.conditions.diabetes = { answer: "yes", details: { type: "type_1" } };
    const f = evaluateExamFlags(toCtx(s), signed).flags.find(
      (x) => x.ruleId === "FLAG-EX-INSULIN-STOPPED",
    );
    expect(f).toMatchObject({ level: "urgent", badge: "Stopped insulin" });
  });

  it("a systemic steroid group never matches a cream, an inhaler or an eye drop", () => {
    const on = (name: string) =>
      evalCond(
        { medicine_group: "systemic_steroid" },
        { ...toCtx(scenario()), medicines: [{ name }] },
      );
    expect(on("Prednisolone 5 mg tablets")).toBe(true);
    expect(on("Hydrocortisone cream")).toBe(false);
    expect(on("Beclometasone inhaler")).toBe(false);
    expect(on("Dexamethasone eye drops")).toBe(false);
  });
});

/* ─── EC-4: the care list stays unsigned ──────────────────────────── */

describe("the suggested-care list (EC-4) is data, unsigned, and shows nothing", () => {
  const care = read("data/clerking/plan-care.v1.json");
  it("is a draft with no sign-off file", () => {
    expect(care.status).toBe("draft");
    expect(care.items).toHaveLength(44);
    expect(existsSync("data/clerking/plan-care-signoff.v1.json")).toBe(false);
    for (const t of [
      "test.glucose_capillary",
      "test.ketones_blood",
      "test.venous_gas",
      "test.vitamin_b12",
    ])
      expect(JSON.stringify(care)).not.toContain(`"${t}"`);
  });

  it("the Plan's problem cards carry no care items, for every diabetes diagnosis", () => {
    const rows = [...AMENDED, "dx.diabetic_retinopathy"].map((id, n) =>
      recorded(id, { slot: n === 0 ? "leading" : "differential" }),
    );
    const cards = problemCards(board(rows), { names: {}, uuids: {} });
    expect(cards.length).toBe(rows.length);
    for (const c of cards) expect(Object.keys(c)).not.toContain("care");
    expect(readFileSync("components/clerking/plan/problem-card.tsx", "utf8")).toContain(
      "No signed care items for this problem yet.",
    );
  });
});

/* ─── No dose; restricted classes; flag off ───────────────────────── */

const DOSE =
  /\b\d+(?:\.\d+)?\s*(?:mg|mcg|µg|units?|iu|ml)\b(?!\s*\/)|\b(?:once|twice|three times) (?:a )?daily\b|\b(?:bd|tds|qds|od)\b/i;

describe("no dose anywhere (prompt §7)", () => {
  it("in any string the pack merged into the catalogues or the care list", () => {
    const strings: string[] = [];
    const walk = (v: unknown) => {
      if (typeof v === "string") strings.push(v);
      else if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === "object") Object.values(v).forEach(walk);
    };
    for (const f of [
      "04-history.amendment.json",
      "07-exam.amendment.json",
      "09-diagnosis.amendment.json",
      "10-plan-care.v1.json",
    ])
      walk(read(`${PACK}/${f}`));
    walk(read("data/clerking/plan-care.v1.json"));
    expect(strings.filter((s) => DOSE.test(s))).toEqual([]);
  });
});

describe("restricted classes stay restricted", () => {
  it("no new profile, flag or suggestion reads a restricted fact", () => {
    for (const id of [
      "dx.intermediate_hyperglycaemia",
      "dx.hyperglycaemia_unconfirmed",
      "dx.steroid_induced_hyperglycaemia",
      "dx.gestational_diabetes",
      "dx.diabetes_in_pregnancy",
      "dx.diabetic_retinopathy",
      "dx.diabetic_kidney_disease",
      "dx.diabetic_neuropathy",
    ])
      expect(dx.profile(id)!.restricted_class, id).toBeNull();
    for (const r of ecat.data.flag_rules.filter((x) => NEW_EXAM_FLAGS.includes(x.id)))
      expect(r.restricted ?? false, r.id).toBe(false);
  });

  it("an HbA1c withheld for HIV says nothing about HIV: it is simply not evidence", () => {
    const s = scenario({ patient: { ageYears: 50, sex: "male", pregnant: null } });
    s.history.past.conditions.hiv = { answer: "yes" };
    const lab = fact({ concept: "obs.hba1c", value: 8, certification: "ngsp" });
    const x = withFacts([lab], s);
    const p = dx.profile("dx.dm_type_unknown")!;
    expect([...suggestedFor(p, { x, ...IN }).keys()]).not.toContain("res:obs.hba1c");
  });
});

describe("CLERKING_V2 off: nothing changes", () => {
  it("results are loaded only for the v2 desk, and only the v2 desk reads the engines", () => {
    const load = readFileSync("lib/clerking/desk-load.ts", "utf8");
    expect(load).toContain("loadFactSnapshot(");
    const desk = readFileSync("lib/emr/read/desk.ts", "utf8");
    expect(desk).toMatch(/template\.id === CLERKING_V2_TEMPLATE_ID\s*\?\s*await clerkingData\(/);
    for (const f of ["lib/emr/read/desk.ts", "components/emr/desk/model.ts"])
      expect(readFileSync(f, "utf8")).not.toContain("loadFactSnapshot");
  });

  it("the v2 engine's examination commit is reached only from a v2 note", () => {
    const notes = readFileSync("lib/emr/write/notes.ts", "utf8");
    expect(notes).toMatch(/content\.schema === 2 && content\.exam/);
  });

  it("every new rule is in the catalogue-wide both-ways runs", () => {
    for (const id of NEW_EXAM_FLAGS) expect(ecat.data.flag_rules.map((r) => r.id)).toContain(id);
    for (const id of NEW_SUGGESTIONS)
      expect(ecat.data.suggestion_rules.rules.map((r) => r.id)).toContain(id);
    for (const id of NEW_RULES) expect(dx.rules.map((r) => r.id)).toContain(id);
    // The solver builds each one (the generic tests then check fire and near miss).
    for (const r of ecat.data.flag_rules.filter((x) => NEW_EXAM_FLAGS.includes(x.id)))
      expect(solve(r.when, scenario()), r.id).toEqual([]);
    for (const r of dx.rules.filter((x) => NEW_RULES.includes(x.id)))
      expect(solveDx(r.when, scenario()), r.id).toEqual([]);
  });
});
