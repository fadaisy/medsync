import type { ImpressionDraft, RecordedDx } from "@/lib/clerking/impression/board";
import { describe, expect, it } from "vitest";

import raw from "@/data/clerking/clerking-diagnosis-catalogue.v1.json";
import { asks } from "@/lib/clerking/impression/ask";
import {
  afterSwap,
  buildBoard,
  canMove,
  duplicateOf,
  EMPTY_IMPRESSION,
  invariants,
  move,
  signBlocks,
  withLikelihood,
} from "@/lib/clerking/impression/board";
import { dxLive, parseDxCatalogue } from "@/lib/clerking/impression/catalogue";
import { composeImpression } from "@/lib/clerking/impression/compose";
import {
  acceptColumn,
  atomTrue,
  cellState,
  columns,
  counts,
  matrix,
  nextState,
  unexplained,
  withMark,
} from "@/lib/clerking/impression/evidence";
import {
  CLINICAL_VIEWER,
  NO_CLASSES,
  recordedFindings,
  syntheticFinding,
} from "@/lib/clerking/impression/facts";
import { suggestions } from "@/lib/clerking/impression/suggest";
import { composeSummary } from "@/lib/clerking/summary/compose";
import {
  diff,
  inputsHash,
  markReviewed,
  reviewStatus,
  snapshotOf,
} from "@/lib/clerking/summary/review";
import { scenario } from "./exam-fixtures";
import {
  board,
  CEPH_ALLERGY,
  chestPain,
  ctx,
  dx,
  feverNeck,
  hypothermia,
  IN,
  jaundiceFever,
  LIVE,
  NOT_RECORDED,
  recorded,
  SICK_NEWS2,
} from "./si-fixtures";

const BY = { by: "u-1", at: "2026-09-28T11:40:00Z" };
const sugg = (x: ReturnType<typeof ctx>, diagnoses: RecordedDx[] = [], viewer = CLINICAL_VIEWER) =>
  suggestions({ x, dx, live: LIVE, viewer, board: board(diagnoses, EMPTY_IMPRESSION, viewer) });
const summaryOf = (
  x: ReturnType<typeof ctx>,
  o: Partial<Parameters<typeof composeSummary>[0]> = {},
) =>
  composeSummary({
    x,
    allergies: CEPH_ALLERGY,
    syndrome: "",
    include: {},
    named: new Set(),
    marked: new Set(),
    audience: "clinical",
    viewer: CLINICAL_VIEWER,
    ...o,
  });

/* ─── Catalogue ─────────────────────────────────────────────────── */

describe("the catalogue", () => {
  it("parses with the counts STOP 0 reported", () => {
    // + the diabetes pack (Phase 5): 8 profiles, 11 rules; type 1 and diabetes in pregnancy
    // must-not-miss.
    expect(dx.profiles.length).toBe(280);
    expect(dx.rules.length).toBe(111);
    expect(dx.profiles.filter((p) => p.must_not_miss).length).toBe(91);
    expect(dx.profiles.filter((p) => p.time_critical).length).toBe(86);
    expect(dx.profiles.filter((p) => p.restricted_class).length).toBe(28);
  });

  it("keeps unsigned content inert (SI10): a withheld profile, rule or reference does nothing", () => {
    const x = ctx(hypothermia());
    const withheld = dxLive({
      profiles: "all",
      rules: "all",
      referenceEntries: "all",
      namedScales: "all",
      withheld: ["dx.sepsis", "DDX-BRADYCARDIA", "REF-DX-HYPOTHERMIA-TEMP"],
    });
    const s = suggestions({ x, dx, live: withheld, viewer: CLINICAL_VIEWER, board: board([]) }).map(
      (g) => g.dxId,
    );
    expect(s).not.toContain("dx.sepsis");
    expect(s).not.toContain("dx.heart_block"); // only DDX-BRADYCARDIA suggests it
    // DDX-HYPOTHERMIA reads the withheld reference, so it does not fire either.
    expect(s).not.toContain("dx.myxoedema_coma");
    const b = buildBoard({
      diagnoses: [recorded("dx.sepsis", { slot: "leading" })],
      draft: EMPTY_IMPRESSION,
      dx,
      live: withheld,
      viewer: CLINICAL_VIEWER,
      deferred: null,
    });
    expect(b.leading!.profile).toBeNull();
    expect(b.leading!.awaitingSignoff).toBe(true);
  });

  it("takes new content with no code: one profile, one rule and one named scale", () => {
    const c = structuredClone(raw) as Record<string, unknown> & {
      profiles: Record<string, unknown>;
      ddx_rules: unknown[];
      named_scales: Record<string, unknown>;
    };
    c.named_scales.test_scale = {
      label: "Test scale",
      options: ["A", "B"],
      source: "DRAFT-MEDSYNC",
      status: "draft",
    };
    c.profiles["dx.test_new"] = {
      ...(c.profiles["dx.hypothyroidism"] as object),
      id: "dx.test_new",
      severity: { kind: "named_scale", id: "test_scale" },
    };
    c.ddx_rules.push({
      id: "DDX-TEST-NEW",
      when: { symptom: "sym.cold_intolerance", answer: "yes" },
      why: "Cold intolerance",
      suggest: ["dx.test_new"],
      must_not_miss_first: [],
      source: "DRAFT-MEDSYNC",
      status: "draft",
    });
    const cat2 = parseDxCatalogue(c);
    const x = ctx(hypothermia());
    const got = suggestions({ x, dx: cat2, live: LIVE, viewer: CLINICAL_VIEWER, board: board([]) });
    expect(got.find((g) => g.dxId === "dx.test_new")?.why).toEqual(["Cold intolerance"]);
    expect(cat2.scale("test_scale")?.options).toEqual(["A", "B"]);
  });
});

/* ─── Atoms added to the one evaluator ──────────────────────────── */

describe("the diagnosis atoms", () => {
  const t = (c: Record<string, unknown>, s = scenario()) => atomTrue(c, { x: ctx(s), ...IN });

  it("reads family history, medicines, social and NEWS2", () => {
    const s = scenario();
    expect(t({ family_condition: "diabetes", answer: "yes" }, s)).toBe(false);
    s.history.family.diabetes = { answer: "yes" };
    expect(t({ family_condition: "diabetes", answer: "yes" }, s)).toBe(true);
    s.medicines.push({ name: "Aspirin 75 mg" });
    expect(t({ medicine: "aspirin", answer: "taking" }, s)).toBe(true);
    expect(t({ medicine: "atenolol", answer: "taking" }, s)).toBe(false);
    // A list without the medicine is not "not taking": only "takes none" is.
    expect(t({ medicine: "atenolol", answer: "not_taking" }, s)).toBe(false);
    const none = scenario();
    none.history.past.medicinesNone = true;
    expect(t({ medicine: "atenolol", answer: "not_taking" }, none)).toBe(true);
    s.history.social.living = "alone";
    expect(t({ social: "living", any_of: ["alone", "homeless"] }, s)).toBe(true);
    expect(t({ social: "diet", any_of: ["vegetarian"] }, s)).toBe(false);
    expect(t({ news2_total: "gte_ref", ref: "REF-FLAG-NEWS2-URGENT" }, s)).toBe(false);
    s.news2Latest = SICK_NEWS2();
    expect(t({ news2_total: "gte_ref", ref: "REF-FLAG-NEWS2-URGENT" }, s)).toBe(true);
  });

  it("reads a red flag with no answer as yes, and a choice item's own option", () => {
    const s = scenario();
    s.history.complaints.push({
      key: "k",
      symptom: "sym.fever",
      props: {},
      flags: { confusion: "no" },
    });
    expect(t({ symptom: "sym.fever", red_flag: "confusion" }, s)).toBe(false);
    s.history.complaints[0]!.flags.confusion = "yes";
    expect(t({ symptom: "sym.fever", red_flag: "confusion" }, s)).toBe(true);
    s.exam = {
      ...s.exam,
      entries: { "ex.general.mobility": { state: "positive", choice: "bedbound" } },
    };
    expect(t({ item: "ex.general.mobility", any_of: ["bedbound"] }, s)).toBe(true);
    expect(t({ item: "ex.general.mobility", any_of: ["wheelchair"] }, s)).toBe(false);
  });

  it("reads one limb of a BP reference, and REF-DX values", () => {
    const s = scenario();
    Object.assign(s.vitals, { sbp: 150, dbp: 80 });
    expect(t({ vital: "vs.bp", gte_ref: "REF-DX-BP-HTN", part: "systolic" }, s)).toBe(true);
    expect(t({ vital: "vs.bp", gte_ref: "REF-DX-BP-HTN", part: "diastolic" }, s)).toBe(false);
    s.vitals.temp = 34.9;
    expect(t({ vital: "vs.temp", lt_ref: "REF-DX-HYPOTHERMIA-TEMP" }, s)).toBe(true);
    s.vitals.temp = 35;
    expect(t({ vital: "vs.temp", lt_ref: "REF-DX-HYPOTHERMIA-TEMP" }, s)).toBe(false);
  });

  it("reads age below a reference, and every recorded reflex absent", () => {
    const s = scenario({ patient: { ageYears: 30, sex: "male", pregnant: null } });
    expect(t({ patient: "age_lt", value_ref: "REF-EX-OLDER-AGE" }, s)).toBe(true);
    s.exam = {
      ...s.exam,
      blocks: { ...s.exam.blocks, reflexes: { Knee: { R: 0, L: 0 }, Ankle: { R: 0 } } },
    };
    expect(t({ grid: "reflex", all_cells: { equals: 0 } }, s)).toBe(true);
    s.exam = { ...s.exam, blocks: { ...s.exam.blocks, reflexes: { Knee: { R: 0, L: 2 } } } };
    expect(t({ grid: "reflex", all_cells: { equals: 0 } }, s)).toBe(false);
  });

  it("never fires a restricted fact for a viewer without its class (SI9)", () => {
    const s = scenario();
    s.history.past.conditions.hiv = { answer: "yes" };
    expect(
      atomTrue(
        { past_condition: "hiv", answer: "yes" },
        { x: ctx(s), live: LIVE, viewer: CLINICAL_VIEWER },
      ),
    ).toBe(true);
    expect(
      atomTrue(
        { past_condition: "hiv", answer: "yes" },
        { x: ctx(s), live: LIVE, viewer: NO_CLASSES },
      ),
    ).toBe(false);
  });
});

/* ─── Board ─────────────────────────────────────────────────────── */

describe("the board", () => {
  const draftWith = (d: Partial<ImpressionDraft>) => ({ ...EMPTY_IMPRESSION, ...d });

  it("pins must-not-miss above the rest until marked unlikely with a reason (SI5)", () => {
    const flu = recorded("dx.influenza");
    const sepsis = recorded("dx.sepsis");
    let d = draftWith({ order: [flu.logicalId, sepsis.logicalId] });
    let b = board([flu, sepsis], d);
    expect(b.differential.map((r) => r.dx.dxId)).toEqual(["dx.sepsis", "dx.influenza"]);
    expect(b.differential[0]!.pinned).toBe(true);
    expect(canMove(b, flu.logicalId, -1)).toBe(false); // unpinned never above pinned
    expect(canMove(b, sepsis.logicalId, 1)).toBe(false);
    d = withLikelihood(d, sepsis.logicalId, "unlikely");
    b = board([flu, sepsis], d);
    // Unlikely alone does not release it: it stays on top and asks for its reason.
    expect(b.differential.map((r) => r.dx.dxId)).toEqual(["dx.sepsis", "dx.influenza"]);
    expect(b.differential[0]!.pinned).toBe(true);
    expect(b.differential[0]!.reasonMissing).toBe(true);
    expect(signBlocks(b)).toHaveLength(1);
    d = { ...d, reasons: { [sepsis.logicalId]: "too short" } };
    expect(board([flu, sepsis], d).differential[0]!.pinned).toBe(true);
    d = { ...d, reasons: { [sepsis.logicalId]: "no source, afebrile, lactate normal" } };
    b = board([flu, sepsis], d);
    expect(b.differential.map((r) => r.dx.dxId)).toEqual(["dx.influenza", "dx.sepsis"]);
    expect(b.differential[1]!.pinned).toBe(false);
    expect(b.differential[1]!.reasonMissing).toBe(false);
    expect(signBlocks(b)).toEqual([]);
  });

  it("clears a likelihood when the selected value is tapped again", () => {
    const d = withLikelihood(withLikelihood(EMPTY_IMPRESSION, "a", "likely"), "a", "likely");
    expect(d.likelihood.a).toBeUndefined();
  });

  it("moves within a group and swaps the leading diagnosis to the top of the differential", () => {
    const a = recorded("dx.influenza");
    const b2 = recorded("dx.typhoid");
    const d = draftWith({ order: [a.logicalId, b2.logicalId] });
    expect(move(board([a, b2], d), b2.logicalId, -1)).toEqual([b2.logicalId, a.logicalId]);
    const s = afterSwap(d, "old-lead", a.logicalId);
    expect(s.order[0]).toBe("old-lead");
    expect(s.likelihood["old-lead"]).toBe("likely");
    expect(s.order).not.toContain(a.logicalId);
  });

  it("finds duplicates by term and by normalised typed text (S-3)", () => {
    const dm = recorded("dx.dm_type_unknown", { slot: "leading" });
    const typed = recorded(null, { display: "Chronic cough ", typed: true });
    expect(duplicateOf([dm, typed], { termId: dm.termId! })).toBe(dm);
    expect(duplicateOf([dm, typed], { typed: "chronic  COUGH." })).toBe(typed);
    expect(duplicateOf([dm, typed], { typed: "acute cough" })).toBeNull();
    expect(invariants([dm, { ...dm, logicalId: "x" }])).toContain("duplicate diagnosis");
    expect(invariants([dm, recorded("dx.sepsis", { slot: "leading" })])).toContain("two primaries");
  });

  it("hides restricted diagnoses from a viewer without the class", () => {
    const b = board([recorded("dx.hiv"), recorded("dx.influenza")], EMPTY_IMPRESSION, NO_CLASSES);
    expect(b.differential.map((r) => r.dx.dxId)).toEqual(["dx.influenza"]);
    expect(b.hidden).toBe(1);
  });
});

/* ─── Evidence ──────────────────────────────────────────────────── */

describe("evidence", () => {
  it("names a score with its value (fixture 3: GCS 14/15)", () => {
    expect(syntheticFinding("sc:gcs_total", ctx(feverNeck()))?.text).toBe("GCS 14/15");
    expect(syntheticFinding("sc:gcs_total", ctx(hypothermia()))?.text).toBe("GCS");
  });

  const x = ctx(hypothermia());
  const lead = recorded("dx.hypothermia_unexplained", { slot: "leading" });
  // The signed catalogue has no "against: glucose" atom on hypoglycaemia (the prompt's fixture
  // expected one; STOP 2 reports it); diabetes counts against hypoglycaemia without diabetes.
  const hypo = recorded("dx.hypoglycaemia_no_dm");
  const sepsis = recorded("dx.sepsis");
  const dm = recorded("dx.dm_type_unknown", { slot: "also" });

  it("suggests, never counts suggestions, and accepts a column in one step", () => {
    const b = board([lead, sepsis, hypo, dm]);
    const cols = columns({ x, board: b, draft: EMPTY_IMPRESSION, ...IN });
    const hc = cols.find((c) => c.row.dx.logicalId === hypo.logicalId)!;
    expect(cellState(hc, "pmh:diabetes")).toBe("suggested_against");
    const sc = cols.find((c) => c.row.dx.logicalId === sepsis.logicalId)!;
    expect(cellState(sc, "vs:vs.temp")).toBe("suggested_for");
    expect(counts(sc)).toEqual({ for: 0, against: 0 });
    const d = acceptColumn(EMPTY_IMPRESSION, sc, BY);
    const after = columns({ x, board: b, draft: d, ...IN }).find(
      (c) => c.row.dx.logicalId === sepsis.logicalId,
    )!;
    expect(counts(after).for).toBe(sc.suggested.size);
    expect(cellState(after, "vs:vs.temp")).toBe("for");
  });

  it("cycles a cell: blank or suggested → For → Against → blank", () => {
    expect(nextState("blank")).toBe("for");
    expect(nextState("suggested_against")).toBe("for");
    expect(nextState("for")).toBe("against");
    expect(nextState("against")).toBe("blank");
  });

  it("explains findings only with accepted For under the leading diagnosis or Also this visit", () => {
    const b = board([lead, sepsis, dm]);
    const base = unexplained({ x, board: b, draft: EMPTY_IMPRESSION, ...IN }).map((f) => f.ref);
    expect(base).toContain("vs:vs.temp");
    // A differential explains nothing.
    let d = withMark(EMPTY_IMPRESSION, sepsis.logicalId, "vs:vs.temp", "for", BY);
    expect(unexplained({ x, board: b, draft: d, ...IN }).map((f) => f.ref)).toContain("vs:vs.temp");
    d = withMark(d, lead.logicalId, "vs:vs.temp", "for", BY);
    expect(unexplained({ x, board: b, draft: d, ...IN }).map((f) => f.ref)).not.toContain(
      "vs:vs.temp",
    );
    // Background (diabetes, a past condition) is context, never "not yet explained".
    expect(base).not.toContain("pmh:diabetes");
  });

  it("builds matrix rows from recorded findings, positives first", () => {
    const m = matrix({ x, board: board([lead, sepsis, hypo]), draft: EMPTY_IMPRESSION, ...IN });
    const firstNegative = m.rows.findIndex((r) => !r.positive);
    expect(
      m.rows.slice(0, firstNegative === -1 ? undefined : firstNegative).every((r) => r.positive),
    ).toBe(true);
    expect(m.rows.map((r) => r.ref)).toContain("pmh:diabetes");
  });
});

/* ─── Suggestions and asks (fixtures 1–4) ───────────────────────── */

describe("suggestions", () => {
  it("fixture 1: hypothermia and bradycardia rules first, sepsis first and pinned-worthy", () => {
    const s = sugg(ctx(hypothermia()));
    const ids = s.map((g) => g.dxId);
    expect(ids.slice(0, 8)).toEqual([
      "dx.sepsis",
      "dx.myxoedema_coma",
      "dx.hypoglycaemia_dm",
      "dx.hypoglycaemia_no_dm",
      "dx.hypothermia_accidental",
      "dx.adrenal_insufficiency",
      "dx.opioid_sedative_toxicity",
      "dx.wernicke",
    ]);
    expect(ids).toContain("dx.hypothyroidism");
    expect(s.find((g) => g.dxId === "dx.hypothermia_unexplained")?.forLeading).toBe(true);
    expect(s.find((g) => g.dxId === "dx.sepsis")?.why).toEqual(["Low temperature"]);
  });

  it("never suggests what is on the board, nor a symptom-level term once a leading diagnosis exists", () => {
    const x = ctx(hypothermia());
    const ids = sugg(x, [recorded("dx.sepsis", { slot: "leading" })]).map((g) => g.dxId);
    expect(ids).not.toContain("dx.sepsis");
    expect(ids).not.toContain("dx.hypothermia_unexplained");
  });

  it("fixture 2: the chest-pain must-not-miss diagnoses", () => {
    const s = sugg(ctx(chestPain()));
    for (const id of ["dx.acs", "dx.aortic_dissection", "dx.pulmonary_embolism", "dx.pneumothorax"])
      expect(s.find((g) => g.dxId === id)?.mustNotMiss).toBe(true);
  });

  it("fixture 3: restricted meningitis suggestions only with access", () => {
    const x = ctx(feverNeck());
    const all = sugg(x).map((g) => g.dxId);
    for (const id of [
      "dx.meningitis_bacterial",
      "dx.cryptococcal_meningitis",
      "dx.tb_meningitis",
      "dx.malaria_cerebral",
    ])
      expect(all).toContain(id);
    const none = sugg(x, [], NO_CLASSES).map((g) => g.dxId);
    expect(none).toContain("dx.meningitis_bacterial");
    expect(none).not.toContain("dx.cryptococcal_meningitis");
    expect(none).not.toContain("dx.tb_meningitis");
  });

  it("fixture 4: cholangitis, severe malaria and liver abscess", () => {
    const ids = sugg(ctx(jaundiceFever())).map((g) => g.dxId);
    for (const id of ["dx.cholangitis", "dx.malaria_severe", "dx.liver_abscess"])
      expect(ids).toContain(id);
  });

  it("respects sex and a recorded 'not pregnant'", () => {
    const s = feverNeck();
    s.patient.sex = "male";
    expect(sugg(ctx(s)).map((g) => g.dxId)).not.toContain("dx.pre_eclampsia");
    const w = feverNeck();
    w.patient.pregnant = false;
    expect(sugg(ctx(w)).map((g) => g.dxId)).not.toContain("dx.pre_eclampsia");
  });
});

describe("not asked yet", () => {
  it("fixture 2: both arms, calves and haemoptysis; answered targets disappear", () => {
    const s = chestPain();
    const b = board([
      recorded("dx.acs", { slot: "leading" }),
      recorded("dx.aortic_dissection"),
      recorded("dx.pulmonary_embolism"),
    ]);
    const labels = asks({ x: ctx(s), dx, board: b, viewer: CLINICAL_VIEWER });
    expect(labels.map((a) => a.label)).toEqual(
      expect.arrayContaining(["BP difference between arms", "Calves", "Coughing blood"]),
    );
    expect(labels.find((a) => a.label === "Calves")?.mode).toBe("navigate");
    expect(labels.find((a) => a.label === "Coughing blood")?.mode).toBe("yesno");
    s.history.ros["sym.coughing_blood"] = "no";
    expect(
      asks({ x: ctx(s), dx, board: b, viewer: CLINICAL_VIEWER }).map((a) => a.label),
    ).not.toContain("Coughing blood");
  });

  it("asks a red flag's symptom first when the symptom is unanswered", () => {
    const b = board([recorded("dx.acs", { slot: "leading" }), recorded("dx.pulmonary_embolism")]);
    const rows = asks({ x: ctx(chestPain()), dx, board: b, viewer: CLINICAL_VIEWER });
    const complaints = new Set(chestPain().history.complaints.map((c) => c.symptom));
    const first = rows.filter((q) => q.mode === "symptom_first");
    expect(first.length).toBeGreaterThan(0);
    for (const r of first)
      if (r.target.kind === "red_flag") expect(complaints.has(r.target.symptom)).toBe(false);
  });

  it("asks a symptom once when one diagnosis wants it and another wants its red flag", () => {
    // Myxoedema coma asks "fever"; sepsis asks fever's "confusion", which needs fever first.
    const s = hypothermia();
    const b = board([
      recorded("dx.hypothermia_unexplained", { slot: "leading" }),
      recorded("dx.sepsis"),
      recorded("dx.myxoedema_coma"),
    ]);
    const fever = asks({ x: ctx(s), dx, board: b, viewer: CLINICAL_VIEWER }).filter(
      (a) => a.label === "Fever",
    );
    expect(fever).toHaveLength(1);
    expect(fever[0]!.for).toEqual(expect.arrayContaining(["Sepsis", "Myxoedema coma"]));
    // A Yes turns it into the red flag's own question, for sepsis alone.
    s.history.ros["sym.fever"] = "yes";
    const after = asks({ x: ctx(s), dx, board: b, viewer: CLINICAL_VIEWER });
    expect(after.some((a) => a.label === "Fever")).toBe(false);
    expect(after.find((a) => /with fever/.test(a.label))?.for).toEqual(["Sepsis"]);
  });
});

/* ─── Composers ─────────────────────────────────────────────────── */

describe("the summary composer", () => {
  it("fixture 1, composed", () => {
    const v = summaryOf(ctx(hypothermia()), { syndrome: "hypothermia with bradycardia" });
    expect(v.text).toMatchSnapshot();
    expect(v.sentences[0]!.text).toBe(
      "A 76-year-old man with diabetes, with an acute 3-day illness: hypothermia with bradycardia.",
    );
    expect(v.oneLiner.course).toBe("Getting worse");
    expect(v.text).toContain("Allergies: cephalosporins, uncoded.");
  });

  it("puts pulse 54 in when a signed profile on the board marks it (D-SI-25)", () => {
    const x = ctx(hypothermia());
    expect(summaryOf(x).text).not.toContain("pulse 54");
    expect(summaryOf(x, { marked: new Set(["vs:vs.pulse"]) }).text).toContain("pulse 54");
  });

  it("always states allergies, never 'not asked' as no, and drops an empty syndrome clause", () => {
    const x = ctx(hypothermia());
    const v = summaryOf(x, { allergies: NOT_RECORDED });
    expect(v.text).toContain("Allergy status not recorded.");
    expect(v.sentences[0]!.text.endsWith("illness.")).toBe(true);
    expect(v.text).not.toMatch(/reports no/); // nothing was answered no
    const allergy = v.items.find((i) => i.locked)!;
    expect(allergy.included).toBe(true);
    expect(summaryOf(x, { include: { [allergy.ref]: false } }).text).toContain(
      "Allergies: cephalosporins, uncoded.",
    );
  });

  it("leaves restricted items out of patient-facing text (fixture 3)", () => {
    const x = ctx(feverNeck());
    const clinical = summaryOf(x, { include: { "med:antiretrovirals": true } }).text;
    expect(clinical).toContain("HIV");
    expect(clinical).toContain("antiretrovirals");
    const patient = summaryOf(x, {
      include: { "med:antiretrovirals": true },
      audience: "patient",
    }).text;
    expect(patient).not.toMatch(/HIV|antiretroviral/i);
  });

  it("fixtures 2 and 4, composed", () => {
    expect(summaryOf(ctx(chestPain()), { allergies: NOT_RECORDED }).text).toMatchSnapshot();
    expect(summaryOf(ctx(jaundiceFever()), { allergies: NOT_RECORDED }).text).toMatchSnapshot();
  });
});

describe("the impression composer", () => {
  it("fixture 1: leading, numbered differential with reasons, also, not yet explained", () => {
    const x = ctx(hypothermia());
    const lead = recorded("dx.hypothermia_unexplained", { slot: "leading" });
    const sepsis = recorded("dx.sepsis");
    const myx = recorded("dx.myxoedema_coma");
    const hypo = recorded("dx.hypoglycaemia_dm");
    const dm = recorded("dx.dm_type_unknown", { slot: "also", onProblemList: true });
    let d: ImpressionDraft = {
      ...EMPTY_IMPRESSION,
      order: [sepsis.logicalId, myx.logicalId, hypo.logicalId],
      likelihood: {
        [sepsis.logicalId]: "likely",
        [myx.logicalId]: "possible",
        [hypo.logicalId]: "unlikely",
      },
      reasons: { [hypo.logicalId]: "glucose 5.8 mmol/L on arrival, no insulin taken" },
      meta: { [lead.logicalId]: { onset: "acute" } },
    };
    d = withMark(d, lead.logicalId, "vs:vs.temp", "for", BY);
    d = withMark(d, lead.logicalId, "ex:ex.skin.temperature", "for", BY);
    d = withMark(d, sepsis.logicalId, "vs:vs.temp", "for", BY);
    d = withMark(d, hypo.logicalId, "vs:vs.glucose", "against", BY);
    const b = board([lead, sepsis, myx, hypo, dm], d);
    const findings = new Map(recordedFindings(x).map((f) => [f.ref, f]));
    const text = composeImpression({
      board: b,
      draft: d,
      findings,
      unexplained: unexplained({ x, board: b, draft: d, ...IN }),
      audience: "clinical",
    });
    expect(text).toMatchSnapshot();
    expect(text).toContain(
      "Hypothermia, cause not yet known (primary; working; acute). For: temperature 32.5 °C",
    );
    expect(text).toContain("1. Sepsis (must not miss), likely [1 for, 0 against].");
    expect(text).toContain(
      "Considered and unlikely: hypoglycaemia in a person with diabetes (glucose 5.8 mmol/L on arrival, no insulin taken).",
    );
    expect(text).toContain("on problem list");
    expect(text).toMatch(/Not yet explained: .*tiredness/);
    // Suggestions are never written: the myxoedema column has suggestions but no marks.
    expect(text).toContain("2. Myxoedema coma (must not miss), possible.");
  });

  it("fixture 5: deferral, and an intern's Final awaiting co-signature", () => {
    const deferred = buildBoard({
      diagnoses: [],
      draft: EMPTY_IMPRESSION,
      dx,
      live: LIVE,
      viewer: CLINICAL_VIEWER,
      deferred: { reason: "awaiting the blood film" },
    });
    expect(
      composeImpression({
        board: deferred,
        draft: EMPTY_IMPRESSION,
        findings: new Map(),
        unexplained: [],
        audience: "clinical",
      }),
    ).toBe("Diagnosis deferred: awaiting the blood film.");
    const lead = recorded("dx.malaria_severe", { slot: "leading", cosignPending: true });
    const text = composeImpression({
      board: board([lead]),
      draft: { ...EMPTY_IMPRESSION, meta: { [lead.logicalId]: { onset: "acute" } } },
      findings: new Map(),
      unexplained: [],
      audience: "clinical",
    });
    expect(text).toBe("Malaria, severe (primary; final, awaiting senior co-signature; acute).");
  });
});

/* ─── Review ────────────────────────────────────────────────────── */

describe("the summary review", () => {
  const x = ctx(hypothermia());
  const draft = { mode: "composed" as const, syndrome: "hypothermia" };
  const snap = (o: Partial<Parameters<typeof composeSummary>[0]> = {}, d = draft) =>
    snapshotOf(summaryOf(x, { syndrome: d.syndrome, ...o }), d);

  it("stays reviewed with no change and flips to changed on any input change", () => {
    const reviewed = markReviewed(draft, snap(), BY);
    expect(reviewStatus(reviewed, snap())).toBe("reviewed");
    const temp = summaryOf(x).items.find((i) => i.ref === "vs:vs.temp")!;
    expect(reviewStatus(reviewed, snap({ include: { [temp.ref]: false } }))).toBe("changed");
    expect(
      reviewStatus(reviewed, snap({}, { ...draft, syndrome: "hypothermia, bradycardia" })),
    ).toBe("changed");
    expect(reviewStatus({ mode: "composed" }, snap())).toBe("not_reviewed");
  });

  it("lists exactly what changed: added, left out, edited", () => {
    const then = snap();
    const now = snap(
      { include: { "vs:vs.temp": false, "vs:vs.pulse": true } },
      { ...draft, syndrome: "cold" },
    );
    expect(diff(then, now)).toEqual([
      { kind: "edited", text: "Syndrome: cold" },
      { kind: "added", text: "Pulse 54" },
      { kind: "left_out", text: "Temperature 32.5 °C" },
    ]);
    expect(inputsHash(then)).toBe(inputsHash(snap()));
  });
});

/* ─── Properties (seeded, no dependency) ────────────────────────── */

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

describe("properties", () => {
  const pool = [
    "dx.sepsis",
    "dx.influenza",
    "dx.typhoid",
    "dx.myxoedema_coma",
    "dx.pneumonia",
    "dx.acs",
    "dx.gord",
    "dx.uti",
  ];

  it("pinned rows always precede unpinned rows, whatever the moves and likelihoods", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const r = rng(seed);
      const dxs = pool.filter(() => r() < 0.7).map((id) => recorded(id));
      let d: ImpressionDraft = { ...EMPTY_IMPRESSION, order: dxs.map((x) => x.logicalId) };
      for (let step = 0; step < 20 && dxs.length; step++) {
        const pick = dxs[Math.floor(r() * dxs.length)]!;
        if (r() < 0.3)
          d = withLikelihood(
            d,
            pick.logicalId,
            (["likely", "possible", "unlikely"] as const)[Math.floor(r() * 3)]!,
          );
        const next = move(board(dxs, d), pick.logicalId, r() < 0.5 ? -1 : 1);
        if (next) d = { ...d, order: next };
        const rows = board(dxs, d).differential;
        const firstUnpinned = rows.findIndex((x) => !x.pinned);
        if (firstUnpinned >= 0) expect(rows.slice(firstUnpinned).some((x) => x.pinned)).toBe(false);
      }
    }
  });

  it("the board never shows two leading diagnoses, and accepted marks are a subset of cells", () => {
    const x = ctx(hypothermia());
    for (let seed = 1; seed <= 60; seed++) {
      const r = rng(seed);
      const dxs = pool.map((id, n) =>
        recorded(id, {
          slot: n === 0 || r() < 0.2 ? "leading" : r() < 0.5 ? "differential" : "also",
        }),
      );
      const b = board(dxs);
      expect([b.leading].filter(Boolean).length).toBeLessThanOrEqual(1);
      const rows = matrix({ x, board: b, draft: EMPTY_IMPRESSION, ...IN }, true).rows.map(
        (f) => f.ref,
      );
      let d = EMPTY_IMPRESSION;
      for (const c of columns({ x, board: b, draft: d, ...IN }))
        if (r() < 0.5) d = acceptColumn(d, c, BY);
      for (const col of Object.values(d.evidence))
        for (const ref of Object.keys(col)) expect(rows).toContain(ref);
    }
  });

  it("the composed summary never contains an item that is not included", () => {
    const x = ctx(hypothermia());
    const items = summaryOf(x).items.filter((i) => !i.locked && i.kind !== "past");
    for (let seed = 1; seed <= 100; seed++) {
      const r = rng(seed);
      const include = Object.fromEntries(items.map((i) => [i.ref, r() < 0.5]));
      const v = summaryOf(x, { include });
      for (const i of v.items.filter(
        (y) => !y.included && y.kind === "vital" && y.ref !== "vs:news2",
      ))
        expect(v.text).not.toContain(i.text.toLowerCase());
    }
  });
});
