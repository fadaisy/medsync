import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { History, SymptomEntry } from "@/lib/clerking/answers";
import type { FlagInput } from "@/lib/clerking/flags";
import { describe, expect, it } from "vitest";

import signoff from "@/data/clerking/catalogue-signoff.v1.json";
import raw from "@/data/clerking/clerking-history-catalogue.v1.json";
import {
  addComplaint,
  applyProp,
  emptyEntry,
  emptyHistory,
  nothingElse,
  packYears,
  removeComplaint,
  setAlcohol,
  setDuration,
  setFlag,
  setRos,
  setTobacco,
  toggleEntry,
  toggleIn,
  updateComplaint,
} from "@/lib/clerking/answers";
import { parseCatalogue, rosSystemsFor } from "@/lib/clerking/catalogue";
import { compose } from "@/lib/clerking/compose";
import { evaluateFlags, toBadges } from "@/lib/clerking/flags";
import { linkedAnswers, rosAnswer } from "@/lib/clerking/linkage";
import { HistorySchema } from "@/lib/clerking/payload";
import { doneCount, sectionStatuses } from "@/lib/clerking/status";
import {
  allergies,
  cat,
  chestPainVariant,
  header,
  medicines,
  news2,
  patient,
  patientThree3,
  SIGNED,
} from "./fixtures";

/**
 * lib/clerking engines (PROMPT-CLERKING-DESK-V2 §7), pure. Values are synthetic.
 */

const input = (h: History, over: Partial<FlagInput> = {}): FlagInput => ({
  history: h,
  linked: linkedAnswers(cat, h.complaints),
  patient: { ageYears: patient.ageYears, sex: patient.sex },
  settings: { outbreakMode: false },
  medicines,
  allergies,
  news2: news2(),
  signoff: SIGNED,
  ...over,
});
const badges = (h: History, over: Partial<FlagInput> = {}) =>
  toBadges(evaluateFlags(cat, input(h, over)), true).map((b) => `${b.level}:${b.label}`);

/* ─── Catalogue ─────────────────────────────────────────────────── */

describe("catalogue", () => {
  it("parses: 96 symptoms, 65 families, 13 systems, 77 rules, 19 references", () => {
    expect(cat.symptoms).toHaveLength(96);
    expect(Object.keys(cat.data.property_families)).toHaveLength(65);
    expect(cat.data.review_of_systems.systems).toHaveLength(13);
    expect(cat.data.flag_rules).toHaveLength(77); // 75 + the diabetes pack's 2 (Phase 5)
    expect(Object.keys(cat.data.reference_entries)).toHaveLength(19);
  });
  it("every symptom renders a non-empty property editor (96 of 96)", () => {
    expect(cat.symptoms.filter((s) => cat.properties(s.id).length === 0)).toEqual([]);
  });
  it("applies overrides, extra families and hidden properties", () => {
    const back = cat.properties("sym.back_pain");
    expect(back.find((p) => p.id === "site")!.options.map((o) => o.id)).toContain("lower_back");
    expect(cat.properties("sym.headache").map((p) => p.id)).toContain("peak"); // headache_extra
    expect(cat.properties("sym.joint_pain").map((p) => p.id)).not.toContain("radiation");
    expect(cat.properties("sym.chest_pain").map((p) => p.id)).toContain("last_episode");
  });
  it("C2: a man sees no gynaecological system and no menstrual items; breast lumps move under Skin", () => {
    const male = rosSystemsFor(cat, "male");
    expect(male.map((s) => s.id)).not.toContain("gyn");
    const items = male.flatMap((s) => s.items.map((i) => i.id));
    expect(items).not.toContain("sym.periods_change");
    expect(items).not.toContain("sym.vaginal_bleeding");
    expect(male.find((s) => s.id === "skin")!.items.map((i) => i.id)).toContain("sym.breast_lump");
    expect(rosSystemsFor(cat, "female").map((s) => s.id)).toContain("gyn");
    expect(items).toContain("sym.scrotal");
    expect(rosSystemsFor(cat, "female").flatMap((s) => s.items.map((i) => i.id))).not.toContain(
      "sym.scrotal",
    );
  });
  it("adding a symptom to a fixture catalogue needs no code", () => {
    const copy = JSON.parse(JSON.stringify(raw));
    copy.symptoms.push({
      ...copy.symptoms.find((s: { id: string }) => s.id === "sym.cough"),
      id: "sym.test_new",
      label: "Test symptom",
      systems: ["rs"],
    });
    copy.review_of_systems.systems
      .find((s: { id: string }) => s.id === "rs")
      .items.push("sym.test_new");
    const c = parseCatalogue(copy);
    expect(c.properties("sym.test_new").length).toBeGreaterThan(0);
    expect(
      rosSystemsFor(c, "male")
        .find((s) => s.id === "rs")!
        .items.map((i) => i.id),
    ).toContain("sym.test_new");
  });
  it("the runtime catalogue is the handed-over one plus the signed amendments, pinned by hash", () => {
    const a = readFileSync("data/clerking/clerking-history-catalogue.v1.json");
    const handoff = JSON.parse(
      readFileSync("docs/emr/clerking-v2/clerking-history-catalogue.v1.json", "utf8"),
    );
    // Exam GATE A, TM2: scrotal findings are restricted in both catalogues.
    handoff.symptoms.find((s: { id: string }) => s.id === "sym.scrotal").sensitivity =
      "sexual_reproductive_health";
    // Summary and Impression GATE A, D-SI-24 (history v1.3 addendum): the shared course, after
    // onset, in every property family that lacked one.
    type Prop = { id: string };
    let added = 0;
    for (const f of Object.values(handoff.property_families) as { properties: Prop[] }[]) {
      if (f.properties.some((x) => x.id === "course")) continue;
      const at = f.properties.findIndex((x) => x.id === "onset") + 1;
      f.properties.splice(at, 0, {
        id: "course",
        label: "Course",
        kind: "one",
        options_ref: "course",
      } as Prop);
      added++;
    }
    expect(added).toBe(48);
    // MS-NCD-DM-PACK-001 Phase 5 (GATE A 2026-10-05): 04-history.amendment.json by merge.
    const pack = JSON.parse(
      readFileSync(
        "docs/ncd/diabetes/pack-0.3.0-draft/clerking-v2/04-history.amendment.json",
        "utf8",
      ),
    ).amendment;
    handoff.past_history.condition_details = pack["past_history.condition_details"];
    Object.assign(handoff.option_sets, pack["option_sets.add"]);
    for (const m of pack["medicines.quick_picks.add"] as string[])
      handoff.medicines.quick_picks.push({ id: m, label: m.charAt(0).toUpperCase() + m.slice(1) });
    for (const { needs: _needs, ...r } of pack["flag_rules.add"]) handoff.flag_rules.push(r);
    const src = JSON.parse(
      readFileSync("docs/ncd/diabetes/pack-0.3.0-draft/clerking-v2/00-engine-changes.json", "utf8"),
    ).sourcesToAdd["ADA-SOC-2026"];
    handoff.sources["ADA-SOC-2026"] = {
      title: src.title,
      verified: false,
      url: src.url,
      edition: src.edition,
      retrieved: src.retrieved,
    };
    // Owner decision "Core 12" (CSO, 2026-10-08): docs/ncd/diabetes/desk/core-12.amendment.json.
    const core = JSON.parse(
      readFileSync("docs/ncd/diabetes/desk/core-12.amendment.json", "utf8"),
    ).history;
    const ph = handoff.past_history;
    ph.conditions.push(...core["past_history.conditions.add"]);
    Object.assign(ph.condition_details, core["past_history.condition_details.add"]);
    const dm = ph.condition_details.diabetes;
    for (const [after, props] of Object.entries(
      core["past_history.condition_details.diabetes.insert_after"] as Record<string, Prop[]>,
    ))
      dm.properties.splice(dm.properties.findIndex((q: Prop) => q.id === after) + 1, 0, ...props);
    dm.composer = core["past_history.condition_details.diabetes.composer"];
    Object.assign(handoff.social_history, core["social_history.add"]);
    expect(JSON.parse(a.toString("utf8"))).toEqual(handoff);
    expect(signoff.amendments).toHaveLength(4);
    expect(createHash("sha256").update(a).digest("hex")).toBe(signoff.catalogueSha256);
  });
  it("rejects a malformed catalogue", () => {
    expect(() => parseCatalogue({ ...raw, symptoms: [{ id: "bad" }] })).toThrow();
  });
});

/* ─── Answers ───────────────────────────────────────────────────── */

describe("answers", () => {
  const props = cat.properties("sym.back_pain");
  const p = (id: string) => props.find((x) => x.id === id)!;
  it("one: choose, change, tap again clears", () => {
    let e = applyProp(emptyEntry(), p("site"), "lower_back");
    expect(e.props.site).toBe("lower_back");
    e = applyProp(e, p("site"), "neck");
    expect(e.props.site).toBe("neck");
    expect(applyProp(e, p("site"), "neck").props.site).toBeUndefined();
  });
  it("many: exclusive options clear the others and are cleared by them", () => {
    let e = applyProp(emptyEntry(), p("radiation"), "left_leg");
    e = applyProp(e, p("radiation"), "groin");
    expect(e.props.radiation).toEqual(["left_leg", "groin"]);
    e = applyProp(e, p("radiation"), "nowhere");
    expect(e.props.radiation).toEqual(["nowhere"]);
    e = applyProp(e, p("radiation"), "buttocks");
    expect(e.props.radiation).toEqual(["buttocks"]);
    expect(applyProp(e, p("radiation"), "buttocks").props.radiation).toBeUndefined();
  });
  it("scale 0–10 clamps and clears; count clamps at 0", () => {
    expect(applyProp(emptyEntry(), p("severity"), 14).props.severity).toBe(10);
    expect(
      applyProp({ props: { severity: 6 }, flags: {} }, p("severity"), 6).props.severity,
    ).toBeUndefined();
    const count = cat.properties("sym.polyuria").find((x) => x.id === "nocturia")!;
    expect(applyProp(emptyEntry(), count, -3).props.nocturia).toBe(0);
  });
  it("duration starts at 1 and never goes below it; a unit alone starts at 1", () => {
    expect(setDuration(emptyEntry(), { unit: "weeks" }).duration).toEqual({
      value: 1,
      unit: "weeks",
    });
    expect(
      setDuration({ ...emptyEntry(), duration: { value: 1, unit: "days" } }, { delta: -1 })
        .duration!.value,
    ).toBe(1);
  });
  it("red flag yes/no, tap again clears to not asked", () => {
    const e = setFlag(emptyEntry(), "fever", "yes");
    expect(e.flags.fever).toBe("yes");
    expect(setFlag(e, "fever", "yes").flags.fever).toBeUndefined();
  });
  it("Nothing else answers only unasked, non-linked items as no", () => {
    let h = setRos(emptyHistory(), "sym.cough", "yes");
    h = nothingElse(h, ["sym.cough", "sym.sputum", "sym.wheeze"], new Set(["sym.wheeze"]));
    expect(h.ros).toEqual({ "sym.cough": "yes", "sym.sputum": "no" });
  });
  it("a no drops the details the yes had", () => {
    let h = setRos(emptyHistory(), "sym.bone_pain", "yes");
    h = { ...h, rosDetail: { "sym.bone_pain": { props: { severity: 7 }, flags: {} } } };
    expect(setRos(h, "sym.bone_pain", "no").rosDetail).toEqual({});
  });
  it("pack-years are derived", () => {
    expect(packYears(10, 20)).toBe(10);
    expect(packYears(undefined, 20)).toBeNull();
  });
});

/* ─── Linkage ───────────────────────────────────────────────────── */

describe("linkage", () => {
  it("C3: the complaint, its associated symptoms and its red flags answer the review of systems", () => {
    const h = patientThree3();
    const l = linkedAnswers(cat, h.complaints);
    expect(l.get("sym.polyuria")?.answer).toBe("yes");
    expect(l.get("sym.nocturia")?.answer).toBe("yes"); // nocturia ≥ 1
    expect(l.get("sym.polydipsia")).toBeUndefined(); // thirst not answered
    expect(l.get("sym.weight_loss")?.answer).toBe("yes");
    expect(l.get("sym.blurred_vision")?.answer).toBe("yes");
    expect(l.get("sym.back_pain")?.answer).toBe("yes");
    expect(l.get("sym.fever")?.answer).toBe("no"); // back pain red flag "fever: no"
  });
  it("a yes from one complaint beats a no from another", () => {
    let h = patientThree3();
    h = addComplaint(h, "sym.fever", "fv");
    expect(linkedAnswers(cat, h.complaints).get("sym.fever")?.answer).toBe("yes");
  });
  it("removing the complaint brings back the clinician's own answer", () => {
    let h = setRos(emptyHistory(), "sym.cough", "no");
    h = addComplaint(h, "sym.cough", "c1");
    expect(rosAnswer(h, linkedAnswers(cat, h.complaints), "sym.cough")).toBe("yes");
    h = removeComplaint(h, "c1");
    expect(rosAnswer(h, linkedAnswers(cat, h.complaints), "sym.cough")).toBe("no");
  });
  it("uncatalogued complaints never drive links", () => {
    const h = addComplaint(emptyHistory(), null, "x", "Feeling funny");
    expect(linkedAnswers(cat, h.complaints).size).toBe(0);
  });
  it("property: linked answers and the review of systems never disagree", () => {
    let seed = 7;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
    const complaintable = cat.symptoms.filter((s) => s.offer_as_complaint);
    for (let run = 0; run < 300; run += 1) {
      let h = emptyHistory();
      for (const s of cat.symptoms)
        if (rnd() < 0.15) h = setRos(h, s.id, rnd() < 0.5 ? "yes" : "no");
      const n = Math.floor(rnd() * 3) + 1;
      for (let i = 0; i < n; i += 1) {
        const s = complaintable[Math.floor(rnd() * complaintable.length)]!;
        h = addComplaint(h, s.id, `k${i}`);
        const assoc = cat.properties(s.id).find((p) => p.id === "associated");
        h = updateComplaint(h, `k${i}`, (e) => {
          let x = e;
          if (assoc) for (const o of assoc.options) if (rnd() < 0.3) x = applyProp(x, assoc, o.id);
          for (const f of s.red_flags)
            if (rnd() < 0.3) x = setFlag(x, f.id, rnd() < 0.5 ? "yes" : "no");
          return x;
        });
      }
      const l = linkedAnswers(cat, h.complaints);
      for (const c of h.complaints) expect(rosAnswer(h, l, c.symptom!)).toBe("yes");
      for (const [sym, v] of l) expect(rosAnswer(h, l, sym)).toBe(v.answer);
    }
  });
});

/* ─── Flags: every rule, both ways, generated from its own `when` ── */

type Cond = Record<string, unknown>;
interface Draft {
  entry: SymptomEntry;
  age: number;
  outbreak: boolean;
}

function propKind(symptom: string, id: string) {
  return cat.properties(symptom).find((p) => p.id === id)?.kind;
}
function setProp(d: Draft, symptom: string, id: string, v: string | number) {
  d.entry.props[id] = propKind(symptom, id) === "many" ? [String(v)] : v;
}
function refOf(ref: unknown) {
  return cat.refValue(String(ref));
}

/** Make `c` true for this symptom (returns false when it cannot be). */
function satisfy(c: Cond, sym: string, d: Draft): boolean {
  if ("all" in c) return (c.all as Cond[]).every((x) => satisfy(x, sym, d));
  if ("any" in c) return satisfy((c.any as Cond[])[0]!, sym, d);
  if ("not" in c) return falsify(c.not as Cond, sym, d);
  if ("always" in c) return true;
  if ("red_flag_yes_any" in c)
    return ((d.entry.flags[(c.red_flag_yes_any as string[])[0]!] = "yes"), true);
  if ("duration_gte_ref" in c || "duration_gt_ref" in c) {
    const ref = String(c.duration_gte_ref ?? c.duration_gt_ref);
    const n = refOf(ref) as number;
    d.entry.duration = {
      value: n + ("duration_gt_ref" in c ? 1 : 0),
      unit: cat.data.reference_entries[ref]!.unit as "weeks",
    };
    return true;
  }
  if ("age_gte_ref" in c) return ((d.age = refOf(c.age_gte_ref) as number), true);
  if ("setting" in c) return ((d.outbreak = c.equals === true), true);
  if ("associated_count_gte_ref" in c) {
    const n = refOf(c.associated_count_gte_ref) as number;
    const ids = (c.among_groups as unknown[][])
      .map((g) => g.find((x) => typeof x === "string"))
      .filter(Boolean) as string[];
    d.entry.props.associated = ids.slice(0, n);
    return true;
  }
  if ("count_gte_ref" in c)
    return ((d.entry.props[String(c.property)] = refOf(c.count_gte_ref) as number), true);
  if ("property" in c) {
    const id = String(c.property);
    if ("equals" in c) return (setProp(d, sym, id, String(c.equals)), true);
    if ("not_equals" in c) return (delete d.entry.props[id], true);
    if ("any_of" in c) return (setProp(d, sym, id, (c.any_of as string[])[0]!), true);
    if ("any_of_ref" in c)
      return (setProp(d, sym, id, (refOf(c.any_of_ref) as string[])[0]!), true);
    if ("gte" in c) return ((d.entry.props[id] = Number(c.gte)), true);
    if ("gte_ref" in c) return ((d.entry.props[id] = refOf(c.gte_ref) as number), true);
  }
  return false;
}
/** Make `c` false (returns false when it cannot be: `always`). */
function falsify(c: Cond, sym: string, d: Draft): boolean {
  if ("all" in c) return (c.all as Cond[]).some((x) => falsify(x, sym, d));
  if ("any" in c) return (c.any as Cond[]).every((x) => falsify(x, sym, d));
  if ("not" in c) return satisfy(c.not as Cond, sym, d);
  if ("always" in c) return false;
  if ("setting" in c) return ((d.outbreak = c.equals !== true), true);
  if ("age_gte_ref" in c) return ((d.age = (refOf(c.age_gte_ref) as number) - 1), true);
  if ("property" in c && "not_equals" in c)
    return (setProp(d, sym, String(c.property), String(c.not_equals)), true);
  return true; // everything else is false when unanswered
}

const RECORD = new Set(["medicines", "allergies", "vital_signs", "past_history"]);
const target = (r: (typeof cat.data.flag_rules)[number]) => {
  const t = Array.isArray(r.applies_to) ? r.applies_to[0]! : r.applies_to;
  if (t === "any" || t === "family:pain") return "sym.back_pain";
  return t;
};
function run(sym: string, d: Draft, outbreak = d.outbreak) {
  const s = cat.symptom(sym)!;
  const h: History = { ...emptyHistory(), complaints: [{ key: "k", symptom: sym, ...d.entry }] };
  return evaluateFlags(
    cat,
    input(h, {
      patient: { ageYears: d.age, sex: s.applies_to_sex ?? "female" },
      settings: { outbreakMode: outbreak },
      medicines: [],
      allergies: { status: "listed", items: [] },
      news2: null,
    }),
  ).map((f) => f.ruleId);
}

describe("flag rules: positive and negative, generated from each rule's own condition", () => {
  const symptomRules = cat.data.flag_rules.filter((r) => !RECORD.has(String(r.applies_to)));
  it.each(symptomRules.map((r) => [r.id, r] as const))("%s", (_id, r) => {
    const sym = target(r);
    const pos: Draft = { entry: emptyEntry(), age: 30, outbreak: false };
    if (r.id === "FLAG-RED-FLAG-ITEM") pos.entry.flags.night_pain = "yes";
    else expect(satisfy(r.when as Cond, sym, pos)).toBe(true);
    expect(run(sym, pos)).toContain(r.id);

    const neg: Draft = { entry: emptyEntry(), age: 30, outbreak: false };
    if (r.id === "FLAG-RED-FLAG-ITEM" || !falsify(r.when as Cond, sym, neg)) {
      // `always` and the red-flag item: the negative is the symptom not being present at all.
      expect(
        evaluateFlags(
          cat,
          input(emptyHistory(), {
            news2: null,
            medicines: [],
            allergies: { status: "listed", items: [] },
          }),
        ).map((f) => f.ruleId),
      ).not.toContain(r.id);
    } else expect(run(sym, neg)).not.toContain(r.id);
  });

  it("record rules: medicines, allergies, vital signs, both ways", () => {
    const h = emptyHistory();
    const ids = (over: Partial<FlagInput>) =>
      evaluateFlags(cat, input(h, over)).map((f) => f.ruleId);
    expect(ids({ medicines: [{ name: "Amlodipine", adherence: "stopped" }] })).toContain(
      "FLAG-MED-ADHERENCE",
    );
    expect(ids({ medicines: [{ name: "Amlodipine", adherence: "as_prescribed" }] })).not.toContain(
      "FLAG-MED-ADHERENCE",
    );
    const high = {
      status: "listed" as const,
      items: [{ name: "Penicillins", reactions: ["collapse_anaphylaxis"] }],
    };
    expect(ids({ allergies: high })).toContain("FLAG-ALLERGY-HIGH");
    expect(
      ids({
        allergies: { status: "listed", items: [{ name: "Penicillins", reactions: ["rash"] }] },
      }),
    ).not.toContain("FLAG-ALLERGY-HIGH");
    expect(ids({ allergies: { status: "not_recorded", items: [] } })).toContain(
      "FLAG-ALLERGY-UNRECORDED",
    );
    expect(ids({ allergies: { status: "no_known_drug_allergies", items: [] } })).not.toContain(
      "FLAG-ALLERGY-UNRECORDED",
    );
    expect(ids({})).toEqual(expect.arrayContaining(["FLAG-VITALS-3", "FLAG-VITALS-AGG"]));
    expect(ids({})).not.toContain("FLAG-VITALS-EMERGENCY"); // total 5 < 7
    expect(ids({ news2: null })).not.toContain("FLAG-VITALS-3");
  });

  it("past-history detail rules (EC-2): fire on the answer, silent unanswered or on another", () => {
    const withDetails = (details: Record<string, string>) => {
      const h = emptyHistory();
      h.past.conditions.diabetes = { answer: "yes", details };
      return evaluateFlags(cat, input(h, {})).map((f) => f.ruleId);
    };
    expect(withDetails({ lows_12_months: "needed_help" })).toContain("FLAG-DM-LOW-NEEDED-HELP");
    expect(withDetails({ lows_12_months: "self_treated" })).not.toContain(
      "FLAG-DM-LOW-NEEDED-HELP",
    );
    expect(withDetails({ admitted_for_sugar: "within_1_year" })).toContain(
      "FLAG-DM-ADMITTED-RECENT",
    );
    expect(withDetails({ admitted_for_sugar: "over_1_year" })).not.toContain(
      "FLAG-DM-ADMITTED-RECENT",
    );
    expect(withDetails({})).not.toContain("FLAG-DM-LOW-NEEDED-HELP");
    // A "no" to diabetes never fires a detail rule, whatever an old answer held.
    const h = emptyHistory();
    h.past.conditions.diabetes = { answer: "no", details: { lows_12_months: "needed_help" } };
    expect(evaluateFlags(cat, input(h, {})).map((f) => f.ruleId)).not.toContain(
      "FLAG-DM-LOW-NEEDED-HELP",
    );
  });

  it("covers all 77 rules", () => {
    // 8 record rules: medicines 1, allergies 2, vital signs 3, past history 2 (Phase 5)
    expect(symptomRules.length + 8).toBe(77);
  });
});

describe("flags: sign-off (Law 7) and the D-CV-04 corrections", () => {
  it("a withheld rule, or a rule whose reference is withheld, never fires", () => {
    const h = patientThree3();
    const all = evaluateFlags(cat, input(h)).map((f) => f.ruleId);
    expect(all).toContain("FLAG-PAIN-SEVERE"); // bone pain 7/10
    const refWithheld = evaluateFlags(
      cat,
      input(h, { signoff: { ...SIGNED, withheld: ["REF-FLAG-PAIN-SEVERE"] } }),
    ).map((f) => f.ruleId);
    expect(refWithheld).not.toContain("FLAG-PAIN-SEVERE");
    const ruleWithheld = evaluateFlags(
      cat,
      input(h, { signoff: { ...SIGNED, withheld: ["FLAG-VITALS-3"] } }),
    ).map((f) => f.ruleId);
    expect(ruleWithheld).not.toContain("FLAG-VITALS-3");
    expect(
      evaluateFlags(
        cat,
        input(h, { signoff: { flagRules: [], referenceEntries: "all", withheld: [] } }),
      ),
    ).toEqual([]);
  });

  it("(a) chest pain with ACS features now is urgent regardless of the pain score", () => {
    const h = chestPainVariant();
    h.rosDetail["sym.chest_pain"]!.props.severity = 2;
    expect(badges(h)).toContain("urgent:Chest pain");
  });
  it("(a) 12–72 hours ago is caution, not urgent", () => {
    const h = chestPainVariant();
    h.rosDetail["sym.chest_pain"]!.props.last_episode = "12_to_72h";
    expect(badges(h)).toContain("caution:Chest pain");
    expect(badges(h)).not.toContain("urgent:Chest pain");
  });
  it("(b) any single cauda equina red flag is urgent", () => {
    const h = patientThree3();
    h.complaints[1]!.flags.saddle_numbness = "yes";
    expect(badges(h)).toContain("urgent:Cauda equina symptoms");
  });
  it("(c) fever plus an exposure fires without bleeding; animal contact only in outbreak mode", () => {
    let h = addComplaint(emptyHistory(), "sym.fever", "f");
    h = updateComplaint(h, "f", (e) => setFlag(e, "exp_burial", "yes"));
    expect(badges(h)).toContain("urgent:Fever and exposure");
    let a = addComplaint(emptyHistory(), "sym.fever", "f");
    a = updateComplaint(a, "f", (e) => setFlag(e, "exp_animals", "yes"));
    expect(badges(a)).not.toContain("urgent:Fever and exposure");
    expect(badges(a, { settings: { outbreakMode: true } })).toContain("urgent:Fever and exposure");
  });
  it("(e) NEWS2 5 is urgent, 7 is the emergency tier (one badge)", () => {
    const b = toBadges(evaluateFlags(cat, input(patientThree3())), true);
    expect(b.find((x) => x.label === "NEWS2 5")?.level).toBe("urgent");
  });
  it("(f) taking iron never switches off the melaena flag", () => {
    let h = setRos(emptyHistory(), "sym.black_stools", "yes");
    h = { ...h, alsoAsked: { "sym.black_stools:taking_iron_tablets": "yes" } };
    expect(badges(h)).toContain("urgent:Black stools");
  });
  it("(g) risk factors and exposures never make their own badge", () => {
    let h = addComplaint(emptyHistory(), "sym.back_pain", "b");
    h = updateComplaint(h, "b", (e) =>
      setFlag(setFlag(e, "cancer_history", "yes"), "steroids_osteoporosis", "yes"),
    );
    expect(
      badges(h, { news2: null, allergies: { status: "listed", items: [] }, medicines: [] }),
    ).toEqual([]);
  });
  it("restricted flags show only to clinicians with access", () => {
    let h = setRos(emptyHistory(), "sym.self_harm_thoughts", "yes");
    h = { ...h, rosDetail: { "sym.self_harm_thoughts": { props: { timing: "now" }, flags: {} } } };
    const f = evaluateFlags(cat, input(h));
    expect(toBadges(f, true).map((b) => b.label)).toContain("Thoughts of self-harm");
    expect(toBadges(f, false).map((b) => b.label)).not.toContain("Thoughts of self-harm");
  });
  it("badges merge by wording, most severe wins, and merging is idempotent", () => {
    const f = evaluateFlags(cat, input(patientThree3()));
    const once = toBadges(f, true);
    expect(toBadges([...f, ...f], true)).toEqual(once);
    const w = once.find((b) => b.label === "Weight loss")!;
    expect(w.reasons.length).toBeGreaterThan(1); // the back-pain red flag and the linked symptom
  });
});

describe("prototype parity, after the D-CV-04 corrections (for the CSO to confirm)", () => {
  it("Patient Three-3", () => {
    expect(badges(patientThree3())).toEqual([
      "urgent:Temperature 32.5 °C",
      "urgent:NEWS2 5",
      "caution:Pain at night or at rest",
      "caution:Weight loss",
      "caution:Change in bowel habit",
      "caution:Bone pain 7/10",
      "caution:Misses amlodipine",
    ]);
  });
  it("the chest-pain variant", () => {
    expect(badges(chestPainVariant())).toEqual([
      "urgent:Chest pain",
      "urgent:Temperature 32.5 °C",
      "urgent:NEWS2 5",
      "caution:Pain at night or at rest",
      "caution:Weight loss",
      "caution:Chest pain 10/10",
      "caution:Change in bowel habit",
      "caution:Bone pain 7/10",
      "caution:Misses amlodipine",
    ]);
  });
});

/* ─── Composer ──────────────────────────────────────────────────── */

const blocks = (h: History, audience: "clinical" | "patient" = "clinical") =>
  compose({
    cat,
    header,
    history: h,
    linked: linkedAnswers(cat, h.complaints),
    patient,
    medicines,
    allergies,
    sectionText: {},
    edited: {},
    audience,
  });

describe("composer", () => {
  it("Patient Three-3 (house style snapshot, D-CV-16)", () => {
    expect(
      blocks(patientThree3())
        .map((b) => `${b.head.toUpperCase()}\n${b.text}`)
        .join("\n\n"),
    ).toMatchSnapshot();
  });
  it("the chest-pain variant (snapshot)", () => {
    expect(blocks(chestPainVariant()).find((b) => b.key === "systems")!.text).toMatchSnapshot();
  });
  it("an edited block keeps the clinician's words", () => {
    const b = compose({
      ...{
        cat,
        header,
        history: patientThree3(),
        linked: new Map(),
        patient,
        medicines,
        allergies,
        sectionText: {},
        audience: "clinical" as const,
      },
      edited: { social: "Edited." },
    });
    expect(b.find((x) => x.key === "social")).toMatchObject({ text: "Edited.", edited: true });
  });
  it("restricted items stay out of the patient-facing text", () => {
    const h = patientThree3();
    h.past.conditions.hiv = { answer: "yes" };
    h.ros["sym.low_mood"] = "yes";
    const clinical = blocks(h)
      .map((b) => b.text)
      .join(" ");
    const pt = blocks(h, "patient")
      .map((b) => b.text)
      .join(" ");
    expect(clinical).toMatch(/HIV/);
    expect(pt).not.toMatch(/HIV|low mood/i);
  });
  it("property: every yes appears, and no not-asked item appears as a negative", () => {
    let seed = 11;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
    for (let run = 0; run < 150; run += 1) {
      let h = emptyHistory();
      const answered = new Map<string, "yes" | "no">();
      for (const sys of rosSystemsFor(cat, "male"))
        for (const s of sys.items)
          if (rnd() < 0.3) {
            const a = rnd() < 0.4 ? "yes" : "no";
            h = setRos(h, s.id, a);
            answered.set(s.id, a);
          }
      const text = blocks(h).find((b) => b.key === "systems")?.text ?? "";
      for (const sys of rosSystemsFor(cat, "male"))
        for (const s of sys.items) {
          const said = text.toLowerCase().includes(s.label.toLowerCase());
          if (answered.get(s.id) === "yes") expect(said, `${s.id} yes`).toBe(true);
          if (!answered.has(s.id) && said) {
            // a not-asked item may only be named when a sibling with the same words was answered
            expect(
              [...answered.keys()].some((k) =>
                cat.symptom(k)!.label.toLowerCase().includes(s.label.toLowerCase()),
              ),
            ).toBe(true);
          }
        }
    }
  });
});

/* ─── Past, family and social answers (Phase 6) ─────────────────── */

describe("past, family and social answers", () => {
  it("toggleEntry: same answer clears; a new answer drops the detail it carried", () => {
    const m = { hypertension: { answer: "yes" as const, since: "over_5_years" } };
    expect(toggleEntry(m, "hypertension", "yes")).toEqual({});
    expect(toggleEntry(m, "hypertension", "no")).toEqual({ hypertension: { answer: "no" } });
    expect(toggleEntry({}, "stroke", "no")).toEqual({ stroke: { answer: "no" } });
  });

  it("toggleIn: toggles, an exclusive id clears the rest and the rest clear it, empty is absent", () => {
    expect(toggleIn(undefined, "mother")).toEqual(["mother"]);
    expect(toggleIn(["mother"], "father")).toEqual(["mother", "father"]);
    expect(toggleIn(["mother"], "mother")).toBeUndefined();
    expect(toggleIn(["khat", "cannabis"], "none", ["none"])).toEqual(["none"]);
    expect(toggleIn(["none"], "khat", ["none"])).toEqual(["khat"]);
  });

  it("setTobacco: smoker's numbers only for a smoker, quit-when only for a former one", () => {
    const s = {
      tobacco: "former",
      perDay: 10,
      years: 20,
      otherForms: ["snuff"],
      quitWhen: "over_10_years",
    };
    expect(setTobacco(s, "current")).toEqual({
      tobacco: "current",
      perDay: 10,
      years: 20,
      otherForms: ["snuff"],
    });
    expect(setTobacco(s, "never")).toEqual({ tobacco: "never" });
    expect(setTobacco(s, "former")).toEqual({}); // tap again clears
    expect(packYears(10, 20)).toBe(10);
  });

  it("setAlcohol: drink types only while they drink; tap again clears", () => {
    const s = { alcohol: "daily", drinks: ["beer"] };
    expect(setAlcohol(s, "none")).toEqual({ alcohol: "none" });
    expect(setAlcohol(s, "weekends")).toEqual({ alcohol: "weekends", drinks: ["beer"] });
    expect(setAlcohol(s, "daily")).toEqual({});
  });

  it("the payload schema keeps medicinesNone and onProblemList (they would be stripped otherwise)", () => {
    const h = patientThree3();
    h.past.medicinesNone = true;
    h.past.conditions.hypertension!.onProblemList = true;
    const parsed = HistorySchema.parse(h);
    expect(parsed.past.medicinesNone).toBe(true);
    expect(parsed.past.conditions.hypertension!.onProblemList).toBe(true);
  });

  it("composer: 'takes none' only when no medicine is recorded; an empty operation row is not written", () => {
    const h = patientThree3();
    h.past.medicinesNone = true;
    h.past.operations = [{ text: "" }, { text: "Appendicectomy", year: 1990 }];
    const run = (meds: typeof medicines) =>
      compose({
        cat,
        header,
        history: h,
        linked: linkedAnswers(cat, h.complaints),
        patient,
        medicines: meds,
        allergies,
        sectionText: {},
        edited: {},
        audience: "clinical",
      }).find((b) => b.key === "pmh")!.text;
    expect(run([])).toContain("No regular medicines, including herbal.");
    expect(run(medicines)).not.toContain("No regular medicines");
    expect(run([])).toContain("Operations: Appendicectomy (1990).");
  });

  it("Core 12: the diabetes questions are written; women-only conditions only for women", () => {
    const h = patientThree3();
    h.past.conditions.gestational_diabetes_before = { answer: "no" };
    h.past.conditions.pancreatitis = { answer: "yes", details: { type: "chronic" } };
    h.past.conditions.hiv = { answer: "yes", details: { art_regimen: "tdf_3tc_dtg" } };
    h.past.conditions.diabetes = {
      answer: "yes",
      details: { last_hba1c: "within_1_year", last_lipids: "never", hypo_awareness: "5" },
    };
    h.social.exercise = "inactive";
    h.social.food = "not_enough";
    const text = (sex: "female" | "male", audience: "clinical" | "patient" = "clinical") =>
      compose({
        cat,
        header,
        history: h,
        linked: linkedAnswers(cat, h.complaints),
        patient: { ...patient, sex },
        medicines,
        allergies,
        sectionText: {},
        edited: {},
        audience,
      })
        .map((b) => b.text)
        .join(" ");
    const woman = text("female");
    expect(woman).toContain("chronic pancreatitis");
    expect(woman).toContain("HIV, ART regimen: TDF + 3TC + DTG (TLD)");
    expect(woman).toContain(
      "last HbA1c in the last year; last lipid profile never; awareness of lows: Gold score 5",
    );
    expect(woman).toMatch(/No [^.]*gestational diabetes in a previous pregnancy/);
    expect(woman).toContain("physically inactive; not always enough food at home");
    expect(text("male")).not.toMatch(/gestational/);
    expect(text("female", "patient")).not.toMatch(/gestational|HIV|ART/);
    expect(HistorySchema.parse(h).social).toMatchObject({
      exercise: "inactive",
      food: "not_enough",
    });
  });

  it("the patient audience drops restricted past, family and substance answers (Law 10)", () => {
    const h = patientThree3();
    h.past.conditions.tuberculosis = { answer: "yes" };
    h.family.tb_in_the_household = { answer: "yes", relations: ["sibling"] };
    h.social.substances = ["khat"];
    const pt = blocks(h, "patient")
      .map((b) => b.text)
      .join(" ");
    const cl = blocks(h)
      .map((b) => b.text)
      .join(" ");
    expect(cl).toMatch(/tuberculosis/i);
    expect(cl).toMatch(/TB in the household/);
    expect(cl).toMatch(/khat/i);
    expect(pt).not.toMatch(/tuberculosis|TB in the household|khat/i);
  });
});

/* ─── Status ────────────────────────────────────────────────────── */

describe("status", () => {
  const st = (h: History, missing: string[] = []) =>
    sectionStatuses({
      cat,
      history: h,
      linked: linkedAnswers(cat, h.complaints),
      sex: "male",
      allergyConfirmedThisVisit: false,
      exam: "partial",
      missing,
    });
  it("an empty history: complaint required, systems not started", () => {
    const s = st(emptyHistory(), ["req.impression", "req.plan"]);
    expect(s.complaint).toEqual({ text: "Required", tone: "required" });
    expect(s.systems.text).toBe("Not started");
    expect(s.pmh.text).toBe("Confirm allergies");
    expect(s.impression.tone).toBe("required");
  });
  it("Patient Three-3", () => {
    const s = st(patientThree3());
    expect(s.complaint.text).toBe("Done");
    expect(s.systems.text).toMatch(/^\d+ positive, \d+ to do$/);
    expect(s.social.text).toBe("Done");
    expect(doneCount(s)).toBeGreaterThanOrEqual(6);
  });
  it("monotonic: adding answers never lowers the done count", () => {
    let h = emptyHistory();
    let before = doneCount(st(h));
    const steps: ((x: History) => History)[] = [
      (x) => addComplaint(x, "sym.cough", "c"),
      (x) => ({ ...x, story: "Story." }),
      (x) => ({ ...x, family: { diabetes: { answer: "no" } } }),
      (x) => ({ ...x, social: { tobacco: "never", alcohol: "none" } }),
      (x) =>
        rosSystemsFor(cat, "male").reduce(
          (acc, s) =>
            nothingElse(
              acc,
              s.items.map((i) => i.id),
              new Set(),
            ),
          x,
        ),
    ];
    for (const f of steps) {
      h = f(h);
      const now = doneCount(st(h));
      expect(now).toBeGreaterThanOrEqual(before);
      before = now;
    }
  });
});
