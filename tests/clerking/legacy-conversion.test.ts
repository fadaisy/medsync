import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { History } from "@/lib/clerking/answers";
import type { PatientSex } from "@/lib/clerking/catalogue";
import type { NoteContent } from "@/lib/emr/note-rules";
import { describe, expect, it } from "vitest";

import signoff from "@/data/clerking/legacy-conversion-signoff.v1.json";
import tokenMap from "@/data/clerking/token-map.v1.json";
import { emptyHistory } from "@/lib/clerking/answers";
import { v2CommitLines } from "@/lib/clerking/commit";
import { compose } from "@/lib/clerking/compose";
import {
  conversionFlags,
  convertV1Draft,
  markReviewed,
  resolveChoice,
} from "@/lib/clerking/convert";
import { legacyTableProblems } from "@/lib/clerking/legacy";
import { linkedAnswers } from "@/lib/clerking/linkage";
import { CLERKING_CATALOGUE as cat, CLERKING_LEGACY as table } from "@/lib/clerking/load";
import { HistorySchema } from "@/lib/clerking/payload";
import { CONCEPTS } from "@/lib/facts/catalogue.generated";

/**
 * The signed legacy conversion (docs/emr/clerking-v2/legacy-conversion-proposal.md §7): the table
 * is complete and hash-pinned, and the converter does what each signature says.
 */

type Ros = [token: string, presence: "present" | "absent"];
function v1(
  complaints: [token: string | null, label: string, days?: number][],
  ros: Ros[] = [],
): NoteContent {
  return {
    header: { historian: "patient" },
    sections: {
      s01: {
        items: complaints.map(([token, label, days]) => ({
          kind: "complaint_token",
          ...(token ? { token } : {}),
          label,
          ...(days ? { durationDays: days } : {}),
        })),
      },
      s03: {
        items: ros.length
          ? [
              {
                kind: "ros_grid",
                items: ros.map(([token, presence]) => ({ token, label: token, presence })),
              },
            ]
          : [],
      },
    },
  } as unknown as NoteContent;
}

const convert = (c: NoteContent, sex: PatientSex = "female") =>
  convertV1Draft(cat, table, c, sex).history as unknown as History;
const rosOnly = (ros: Ros[], sex: PatientSex = "female") => convert(v1([], ros), sex);
const flagsOf = (h: History) =>
  conversionFlags(cat, table.flags, h).map((f) => `${f.ruleId}:${f.level}`);

function v1Codes(): string[] {
  const codes = new Set<string>();
  for (const f of ["0042_symptom_catalog", "0045_review_of_systems"]) {
    const sql = readFileSync(`supabase/migrations/${f}.sql`, "utf8");
    for (const block of sql.matchAll(
      /INSERT INTO public\.symptom_catalog\s*\([^)]*\)\s*VALUES(.*?)ON CONFLICT/gis,
    ))
      for (const row of block[1]!.matchAll(/\(\s*'([a-z_]+)'\s*,/g)) codes.add(row[1]!);
  }
  return [...codes];
}

describe("the table", () => {
  it("is the file the CSO signed", () => {
    const hash = createHash("sha256")
      .update(readFileSync("data/clerking/legacy-conversion.v1.json"))
      .digest("hex");
    expect(hash).toBe(signoff.tableSha256);
  });

  it("names only ids the catalogue has", () => {
    expect(legacyTableProblems(table, cat)).toEqual([]);
  });

  it("covers the 89 old codes, the 17 of 0076 and every finding concept a v1 complaint could hold", () => {
    const codes = v1Codes();
    expect(codes).toHaveLength(89);
    for (const c of codes) expect(table.codes[c], c).toBeDefined();
    const identity = Object.entries(tokenMap.map).filter(
      ([s, t]) => t === s.slice(4) && !codes.includes(t),
    );
    expect(identity).toHaveLength(17);
    for (const [s, t] of identity) expect(table.codes[t]?.yes).toEqual({ set: s });
    for (const [id, c] of Object.entries(CONCEPTS))
      if (c.kind === "finding" && !c.symptomCode) expect(table.concepts[id], id).toBeDefined();
  });

  it("never narrows a combined code silently (D1)", () => {
    for (const code of [
      "weakness",
      "weight_change",
      "lumps_swellings",
      "eye_symptoms",
      "speech_swallowing_disturbance",
      "hair_nail_change",
      "skin_hair_sweating_change",
      "syncope_presyncope",
      "memory_cognitive_change",
    ])
      expect(table.codes[code]!.outcome, code).toBe("needs_choice");
  });
});

describe("converting a v1 draft", () => {
  it("converts a complaint with its duration and keeps the header and story", () => {
    const c = v1([["fever", "Fever", 3]]);
    (c.sections as Record<string, unknown>).s02 = { narrative: "Three days of fever." };
    const out = convertV1Draft(cat, table, c, "female");
    const h = out.history as unknown as History;
    expect(h.complaints).toMatchObject([
      { symptom: "sym.fever", duration: { value: 3, unit: "days" } },
    ]);
    expect(h.story).toBe("Three days of fever.");
    expect(out.header).toMatchObject({ historian: "patient" });
    expect(h.converted?.table).toBe("MS-EMR-CLERK-LEGACY-001 1.0.0");
    expect(h.converted?.lines).toMatchObject([{ token: "fever", result: "converted" }]);
  });

  it("reads the review of systems, which the old converter ignored (D2)", () => {
    const h = rosOnly([
      ["cough", "present"],
      ["wheeze", "absent"],
    ]);
    expect(h.ros).toEqual({ "sym.cough": "yes", "sym.wheeze": "no" });
  });

  it("keeps a token outside the table as words, never a finding", () => {
    const h = convert(
      v1([
        ["no_such_code", "Odd feeling"],
        [null, "Typed words"],
      ]),
    );
    expect(h.complaints.map((c) => [c.symptom, c.text])).toEqual([
      [null, "Odd feeling"],
      [null, "Typed words"],
    ]);
  });

  it("converts a CFC concept a v1 complaint held (D15)", () => {
    const h = convert(
      v1([
        ["sx.polyuria", "Polyuria"],
        ["sign.pallor", "Pallor"],
      ]),
    );
    expect(h.complaints.map((c) => c.symptom ?? c.text)).toEqual(["sym.polyuria", "Pallor"]);
  });

  it("weakness: a choice on yes, never fatigue on no (D8)", () => {
    const yes = rosOnly([["weakness", "present"]]);
    expect(yes.ros).toEqual({});
    expect(yes.converted?.pending).toMatchObject([
      {
        kind: "symptom",
        options: ["sym.fatigue", "sym.muscle_weakness", "sym.focal_weakness"],
      },
    ]);
    const no = rosOnly([["weakness", "absent"]]);
    expect(no.ros).toEqual({ "sym.muscle_weakness": "no", "sym.focal_weakness": "no" });
    const lumps = rosOnly([["lumps_swellings", "absent"]]);
    expect(lumps.ros["sym.skin_lesion"]).toBeUndefined();
  });

  it("presyncope: no denies fainting only; memory: no denies both (§3)", () => {
    expect(rosOnly([["syncope_presyncope", "absent"]]).ros).toEqual({ "sym.fainting": "no" });
    expect(rosOnly([["memory_cognitive_change", "absent"]]).ros).toEqual({
      "sym.memory_loss": "no",
      "sym.confusion": "no",
    });
  });

  it("menstrual cycle: yes asks which change, no is left out (D3)", () => {
    const h = rosOnly([
      ["menstrual_cycle", "present"],
      ["menstrual_flow", "absent"],
    ]);
    expect(h.ros).toEqual({});
    expect(h.converted?.pending).toMatchObject([
      { kind: "property", symptom: "sym.periods_change", property: "change" },
    ]);
    expect(h.converted?.lines.map((l) => l.result)).toEqual(["choose", "left_out"]);
  });

  it("pregnancy status is proposed for confirmation, never written (D4)", () => {
    const h = rosOnly([
      ["pregnancy_status", "absent"],
      ["lmp", "present"],
    ]);
    expect(h.converted?.pending).toMatchObject([
      { kind: "pregnancy", propose: "not_pregnant", restricted: true },
      { kind: "lnmp", restricted: true },
    ]);
    const done = resolveChoice(cat, h, h.converted!.pending[0]!.id, { kind: "recorded" });
    expect(done.converted?.pending).toHaveLength(1);
    expect(rosOnly([["pregnancy_status", "present"]], "male").converted?.lines[0]?.result).toBe(
      "wrong_sex",
    );
  });

  it("risk converts with review and an urgent flag until assessed (D5)", () => {
    const h = rosOnly([["risk", "present"]]);
    expect(h.ros["sym.self_harm_thoughts"]).toBe("yes");
    expect(h.converted?.lines[0]).toMatchObject({ review: true, flag: "CONV-RISK" });
    expect(flagsOf(h)).toEqual(["CONV-RISK:urgent"]);
    const assessed: History = {
      ...h,
      rosDetail: { "sym.self_harm_thoughts": { props: { timing: "past_year" }, flags: {} } },
    };
    expect(flagsOf(assessed)).toEqual([]);
    expect(table.flags["CONV-RISK"]).toMatchObject({
      level: "urgent",
      badge: "Risk from previous format: assess now",
    });
  });

  it("rectal bleeding: a choice with a caution flag until it is made (D10)", () => {
    const h = rosOnly([["rectal_bleeding", "present"]]);
    expect(flagsOf(h)).toEqual(["CONV-PR-BLEED:caution"]);
    const done = resolveChoice(cat, h, h.converted!.pending[0]!.id, {
      kind: "symptoms",
      symptoms: ["sym.black_stools"],
    });
    expect(done.ros).toEqual({ "sym.black_stools": "yes" });
    expect(flagsOf(done)).toEqual([]);
  });

  it("a narrow no leaves the broader symptom not asked (D6)", () => {
    const h = rosOnly([
      ["pleuritic_chest_pain", "absent"],
      ["dysmenorrhoea", "absent"],
      ["gait_disturbance", "absent"],
      ["itch_generalised", "absent"],
    ]);
    expect(h.ros).toEqual({});
    expect(h.converted?.lines.every((l) => l.result === "not_asked")).toBe(true);
  });

  it("presets combine; clashing single-choice presets become a choice (D7, merge rule)", () => {
    const pleur = rosOnly([
      ["chest_pain", "present"],
      ["pleuritic_chest_pain", "present"],
    ]);
    expect(pleur.ros["sym.chest_pain"]).toBe("yes");
    expect(pleur.rosDetail["sym.chest_pain"]?.props).toEqual({ aggravation: ["breathing_in"] });

    const pmb = rosOnly([["postmenopausal_bleeding", "present"]]);
    expect(pmb.rosDetail["sym.vaginal_bleeding"]?.props).toEqual({ type: "after_menopause" });

    const two = rosOnly([
      ["intermenstrual_bleeding", "present"],
      ["postcoital_bleeding", "present"],
    ]);
    expect(two.ros["sym.vaginal_bleeding"]).toBe("yes");
    expect(two.rosDetail["sym.vaginal_bleeding"]).toBeUndefined();
    const p = two.converted!.pending[0]!;
    expect(p).toMatchObject({
      kind: "property",
      property: "type",
      options: ["between_periods", "after_sex"],
    });
    const done = resolveChoice(cat, two, p.id, { kind: "options", options: ["after_sex"] });
    expect(done.rosDetail["sym.vaginal_bleeding"]?.props).toEqual({ type: "after_sex" });
  });

  it("yes against no on one symptom keeps yes and lists the contradiction", () => {
    const h = convert(v1([["oedema", "Leg swelling", 5]], [["ankle_leg_swelling", "absent"]]));
    expect(h.complaints).toMatchObject([{ symptom: "sym.leg_swelling" }]);
    expect(h.ros["sym.leg_swelling"]).toBeUndefined();
    expect(h.converted?.lines.map((l) => l.result)).toEqual(["converted", "contradiction"]);
  });

  it("merges two old codes into one complaint, with the longer duration", () => {
    const h = convert(
      v1([
        ["fatigue", "Fatigue", 3],
        ["fatigue_malaise", "Malaise", 10],
      ]),
    );
    expect(h.complaints).toHaveLength(1);
    expect(h.complaints[0]).toMatchObject({
      symptom: "sym.fatigue",
      duration: { value: 10, unit: "days" },
    });
  });

  it("drops an answer that does not apply to the patient's sex, and lists it (D14)", () => {
    const h = rosOnly([["postmenopausal_bleeding", "absent"]], "male");
    expect(h.ros).toEqual({});
    expect(h.converted?.lines[0]?.result).toBe("wrong_sex");
  });

  it("splits discharge by sex; unknown sex asks", () => {
    expect(rosOnly([["urethral_vaginal_discharge", "present"]], "male").ros).toEqual({
      "sym.urethral_discharge": "yes",
    });
    const unknown = rosOnly([["urethral_vaginal_discharge", "present"]], null);
    expect(unknown.converted?.pending[0]?.options).toEqual([
      "sym.urethral_discharge",
      "sym.vaginal_discharge",
    ]);
    expect(rosOnly([["urethral_vaginal_discharge", "absent"]], null).ros).toEqual({
      "sym.urethral_discharge": "no",
      "sym.vaginal_discharge": "no",
    });
  });

  it("polyuria/polydipsia: no denies both, yes prompts for thirst (row 72)", () => {
    expect(rosOnly([["polyuria_polydipsia", "absent"]]).ros).toEqual({
      "sym.polyuria": "no",
      "sym.polydipsia": "no",
    });
    expect(rosOnly([["polyuria_polydipsia", "present"]]).converted?.lines[0]?.ask).toEqual([
      "thirst",
    ]);
  });

  it("urgency: a choice with storage=urgency, or text; no is left out (row 43)", () => {
    const h = rosOnly([["urgency", "present"]]);
    const p = h.converted!.pending[0]!;
    expect(p).toMatchObject({ preset: { storage: ["urgency"] }, text: true });
    const done = resolveChoice(cat, h, p.id, { kind: "symptoms", symptoms: ["sym.frequency"] });
    expect(done.rosDetail["sym.frequency"]?.props).toEqual({ storage: ["urgency"] });
    const kept = resolveChoice(cat, h, p.id, { kind: "text" });
    expect(kept.converted?.text).toEqual([{ label: "urgency", answer: "yes" }]);
    expect(rosOnly([["urgency", "absent"]]).converted?.lines[0]?.result).toBe("left_out");
  });

  it("functional limitation: no offers fully active, set only when confirmed (D11)", () => {
    const h = rosOnly([["functional_limitation", "absent"]]);
    expect(h.social.activity).toBeUndefined();
    const p = h.converted!.pending[0]!;
    expect(p).toMatchObject({ kind: "activity", propose: "fully_active" });
    expect(resolveChoice(cat, h, p.id, { kind: "activity", value: "fully_active" }).social).toEqual(
      { activity: "fully_active" },
    );
  });

  it("generalised itch and pruritus merge onto one itch (row 8)", () => {
    const h = rosOnly([
      ["itch_generalised", "present"],
      ["pruritus", "present"],
    ]);
    expect(h.ros).toEqual({ "sym.itch": "yes" });
    expect(h.rosDetail["sym.itch"]?.props).toEqual({ where: "generalised" });
  });

  it("a complaint needing a choice keeps its words until the pick", () => {
    const h = convert(v1([["lumps_swellings", "Lumps", 30]]));
    expect(h.complaints).toMatchObject([{ symptom: null, text: "Lumps" }]);
    const done = resolveChoice(cat, h, h.converted!.pending[0]!.id, {
      kind: "symptoms",
      symptoms: ["sym.neck_swelling", "sym.lumps_lymph"],
    });
    expect(done.complaints.map((c) => [c.symptom, c.duration?.value])).toEqual([
      ["sym.neck_swelling", 30],
      ["sym.lumps_lymph", 30],
    ]);
    expect(done.converted?.pending).toEqual([]);
  });
});

describe("the note and signing", () => {
  const blocksOf = (h: History, sex: PatientSex = "female") =>
    compose({
      cat,
      header: {},
      history: h,
      linked: linkedAnswers(cat, h.complaints),
      patient: { name: "Test Patient", ageYears: 40, sex },
      medicines: [],
      allergies: { status: "not_recorded", confirmedThisVisit: false, items: [] },
      sectionText: {},
      edited: {},
      audience: "clinical",
    });
  const systems = (h: History) => blocksOf(h).find((b) => b.key === "systems")!.text;

  it("writes a converted answer on a symptom the Systems step does not list (D9)", () => {
    const h = rosOnly([["dyspnoea_respiratory", "present"]]);
    expect(h.ros).toEqual({ "sym.breathlessness": "yes" });
    expect(systems(h)).toContain("Also: breathlessness.");
    const { lines } = v2CommitLines(cat, tokenMap.map, (t) => t, h, "female");
    expect(lines).toContainEqual(
      expect.objectContaining({
        conceptId: "dyspnoea",
        value: { type: "presence", presence: "present" },
      }),
    );
  });

  it("carries text and the open choices in the Systems review, not as findings", () => {
    const h = rosOnly([
      ["pallor_anaemia_symptoms", "present"],
      ["weakness", "present"],
    ]);
    expect(systems(h)).toContain("From the previous format: pallor_anaemia_symptoms.");
    expect(systems(h)).toContain("From the previous format, not yet specified: weakness.");
    expect(v2CommitLines(cat, tokenMap.map, (t) => t, h, "female").lines).toEqual([]);
  });

  it("an open proposal on a v1 'no' is not written as unspecified", () => {
    const h = rosOnly([["functional_limitation", "absent"]]);
    expect(systems(h)).not.toContain("previous format");
  });

  it("leaves a normal v2 draft's note unchanged", () => {
    const h = emptyHistory();
    h.ros["sym.cough"] = "no";
    expect(systems(h)).not.toContain("previous format");
    expect(systems(h)).not.toContain("Also:");
  });

  it("passes the payload boundary, and marks the review done", () => {
    const h = convert(
      v1(
        [["lumps_swellings", "Lumps"]],
        [
          ["risk", "present"],
          ["pregnancy_status", "present"],
          ["pallor_anaemia_symptoms", "present"],
          ["intermenstrual_bleeding", "present"],
          ["postcoital_bleeding", "present"],
        ],
      ),
    );
    expect(HistorySchema.safeParse(h).success).toBe(true);
    expect(markReviewed(h).converted?.reviewed).toBe(true);
  });
});
