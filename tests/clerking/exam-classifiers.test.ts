import type { Scenario } from "./exam-fixtures";
import { describe, expect, it } from "vitest";

import * as C from "@/lib/clerking/exam/classifiers";
import { evaluateExamFlags } from "@/lib/clerking/exam/flags";
import {
  acvpuOf,
  acvpuSuggestion,
  gcsP,
  gcsText,
  gcsTotal,
  orientationState,
} from "@/lib/clerking/exam/scores";
import {
  ALL_SIGNED,
  complain,
  ecat,
  gcs,
  ketones,
  negative,
  positive,
  scenario,
  solve,
  toCtx,
} from "./exam-fixtures";

/**
 * Classifiers and scores (PROMPT-CLERKING-EXAM-V2 §7): every reference edge at value − ε, value
 * and value + ε; the GTFCC truth table; IMAM by age band with the oedema rule; IWGDF per foot;
 * SINBAD; GCS, NT, GCS-P and ACVPU; ROSIER's glucose pre-check.
 */

const signoff = { ...ALL_SIGNED, withheld: [] as string[] };
const flagIds = (s: Scenario) => evaluateExamFlags(toCtx(s), signoff).flags.map((f) => f.ruleId);
const withS = (f: (s: Scenario) => void, p: Partial<Scenario> = {}) => {
  const s = scenario(p);
  f(s);
  return s;
};

/** [label, build(value), read, [value − ε, value, value + ε] → expected]. */
type Edge = [string, (v: number) => Scenario, (s: Scenario) => unknown, [number, unknown][]];

const cls = (fn: (x: ReturnType<typeof toCtx>) => C.ClassifierResult) => (s: Scenario) =>
  fn(toCtx(s)).result;
const fires = (rule: string) => (s: Scenario) => flagIds(s).includes(rule);
const adultMuac =
  (age: number, pl = false) =>
  (v: number) =>
    withS(
      (s) =>
        positive(s, "ex.general.nutrition", {
          muac: v,
          ...(pl ? { pregnant_or_lactating: "yes" } : {}),
        }),
      {
        patient: { ageYears: age, sex: pl ? "female" : "male", pregnant: null },
      },
    );
const bmi = (b: number, age = 40) =>
  withS((s) => ((s.vitals.height = 100), (s.vitals.weight = b)), {
    patient: { ageYears: age, sex: "male", pregnant: null },
  });
const waist = (sex: "male" | "female") => (v: number) =>
  withS((s) => (s.vitals.waist = v), { patient: { ageYears: 40, sex, pregnant: null } });

const blood = (v: number) => withS((s) => ketones(s, { blood: v }));
const ketoneBand = cls((x) => C.ruleClassifier(x, "ketone_band"));

const EDGES: Edge[] = [
  // The diabetes pack's ketone bands (EC-7), at or above each limit; first match wins.
  [
    "REF-EX-KETONE-DKA 3.0 (≥)",
    blood,
    ketoneBand,
    [
      [2.9, "moderate"],
      [3, "high"],
      [3.1, "high"],
    ],
  ],
  [
    "REF-EX-KETONE-RISK 1.6 (≥)",
    blood,
    ketoneBand,
    [
      [1.5, "raised"],
      [1.6, "moderate"],
      [1.7, "moderate"],
    ],
  ],
  [
    "REF-EX-KETONE-RAISED 0.6 (≥)",
    blood,
    ketoneBand,
    [
      [0.5, null],
      [0.6, "raised"],
      [0.7, "raised"],
    ],
  ],
  [
    "REF-EX-GCS-AIRWAY 8 (≤)",
    (v) => withS((s) => gcs(s, 2, 2, v - 4)),
    fires("FLAG-EX-GCS-AIRWAY"),
    [
      [7, true],
      [8, true],
      [9, false],
    ],
  ],
  [
    "REF-EX-GCS-FULL 15 (<)",
    (v) => withS((s) => gcs(s, 4, v - 10, 6)),
    fires("FLAG-EX-GCS-REDUCED"),
    [
      [14, true],
      [15, false],
    ],
  ],
  [
    "REF-EX-MUAC-BANDS adult SAM < 19",
    adultMuac(30),
    cls(C.muac),
    [
      [18.5, "sam"],
      [19, "mam"],
      [19.5, "mam"],
    ],
  ],
  [
    "REF-EX-MUAC-BANDS adult MAM < 22",
    adultMuac(30),
    cls(C.muac),
    [
      [21.5, "mam"],
      [22, "normal"],
      [22.5, "normal"],
    ],
  ],
  [
    "REF-EX-MUAC-BANDS 15–17 SAM < 18.5",
    adultMuac(16),
    cls(C.muac),
    [
      [18, "sam"],
      [18.5, "mam"],
      [19, "mam"],
    ],
  ],
  [
    "REF-EX-MUAC-BANDS 15–17 MAM < 21",
    adultMuac(16),
    cls(C.muac),
    [
      [20.5, "mam"],
      [21, "normal"],
    ],
  ],
  [
    "REF-EX-MUAC-BANDS 60+ SAM < 16",
    adultMuac(70),
    cls(C.muac),
    [
      [15.5, "sam"],
      [16, "mam"],
      [16.5, "mam"],
    ],
  ],
  [
    "REF-EX-MUAC-BANDS 60+ MAM ≤ 18.5",
    adultMuac(70),
    cls(C.muac),
    [
      [18.5, "mam"],
      [19, "normal"],
    ],
  ],
  [
    "REF-EX-MUAC-BANDS pregnant SAM < 19",
    adultMuac(25, true),
    cls(C.muac),
    [
      [18.5, "sam"],
      [19, "mam"],
    ],
  ],
  [
    "REF-EX-MUAC-BANDS pregnant MAM < 23",
    adultMuac(25, true),
    cls(C.muac),
    [
      [22.5, "mam"],
      [23, "normal"],
    ],
  ],
  [
    "REF-EX-BMI-BANDS 16",
    (v) => bmi(v),
    cls(C.bmiClass),
    [
      [15.9, "severe_thinness"],
      [16, "moderate_thinness"],
      [16.1, "moderate_thinness"],
    ],
  ],
  [
    "REF-EX-BMI-BANDS 17",
    (v) => bmi(v),
    cls(C.bmiClass),
    [
      [16.9, "moderate_thinness"],
      [17, "mild_thinness"],
    ],
  ],
  [
    "REF-EX-BMI-BANDS 18.5",
    (v) => bmi(v),
    cls(C.bmiClass),
    [
      [18.4, "mild_thinness"],
      [18.5, "normal"],
    ],
  ],
  [
    "REF-EX-BMI-BANDS 25",
    (v) => bmi(v),
    cls(C.bmiClass),
    [
      [24.9, "normal"],
      [25, "pre_obese"],
    ],
  ],
  [
    "REF-EX-BMI-BANDS 30",
    (v) => bmi(v),
    cls(C.bmiClass),
    [
      [29.9, "pre_obese"],
      [30, "obese_1"],
    ],
  ],
  [
    "REF-EX-BMI-BANDS 35",
    (v) => bmi(v),
    cls(C.bmiClass),
    [
      [34.9, "obese_1"],
      [35, "obese_2"],
    ],
  ],
  [
    "REF-EX-BMI-BANDS 40",
    (v) => bmi(v),
    cls(C.bmiClass),
    [
      [39.9, "obese_2"],
      [40, "obese_3"],
      [40.1, "obese_3"],
    ],
  ],
  [
    "REF-EX-BMI-ADULT-AGE 20",
    (v) => bmi(22, v),
    (s) => C.bmiClass(toCtx(s)).status,
    [
      [19, "not_applicable"],
      [20, "result"],
      [21, "result"],
    ],
  ],
  [
    "REF-EX-WAIST male 94",
    waist("male"),
    cls(C.waistRisk),
    [
      [93, "low"],
      [94, "increased"],
      [95, "increased"],
    ],
  ],
  [
    "REF-EX-WAIST male 102",
    waist("male"),
    cls(C.waistRisk),
    [
      [101, "increased"],
      [102, "substantial"],
    ],
  ],
  [
    "REF-EX-WAIST female 80",
    waist("female"),
    cls(C.waistRisk),
    [
      [79, "low"],
      [80, "increased"],
    ],
  ],
  [
    "REF-EX-WAIST female 88",
    waist("female"),
    cls(C.waistRisk),
    [
      [87, "increased"],
      [88, "substantial"],
    ],
  ],
  [
    "REF-EX-WHTR 0.5",
    (v) => withS((s) => ((s.vitals.height = 100), (s.vitals.waist = v * 100))),
    cls(C.whtrBand),
    [
      [0.49, "healthy"],
      [0.5, "increased"],
      [0.51, "increased"],
    ],
  ],
  [
    "REF-EX-WHTR 0.6",
    (v) => withS((s) => ((s.vitals.height = 100), (s.vitals.waist = v * 100))),
    cls(C.whtrBand),
    [
      [0.59, "increased"],
      [0.6, "high"],
    ],
  ],
  [
    "REF-EX-OH-SBP 20",
    (v) =>
      withS(
        (s) =>
          (s.exam = {
            ...s.exam,
            panels: {
              postural: { lying: { sbp: 130, dbp: 80 }, standing_1min: { sbp: 130 - v, dbp: 80 } },
            },
          }),
      ),
    cls(C.orthostatic),
    [
      [19, "absent"],
      [20, "present"],
      [21, "present"],
    ],
  ],
  [
    "REF-EX-OH-DBP 10",
    (v) =>
      withS(
        (s) =>
          (s.exam = {
            ...s.exam,
            panels: {
              postural: { lying: { sbp: 130, dbp: 80 }, standing_3min: { sbp: 130, dbp: 80 - v } },
            },
          }),
      ),
    cls(C.orthostatic),
    [
      [9, "absent"],
      [10, "present"],
    ],
  ],
  [
    "REF-EX-ARM-DIFF 15 (>)",
    (v) =>
      withS(
        (s) =>
          (s.exam = {
            ...s.exam,
            panels: { bothArms: { right: { sbp: 150 }, left: { sbp: 150 - v } } },
          }),
      ),
    cls(C.interArm),
    [
      [14, "within"],
      [15, "within"],
      [16, "repeat"],
    ],
  ],
  [
    "REF-EX-HYPO-L2 3.0 (<)",
    (v) => withS((s) => (s.vitals.glucose = v)),
    cls(C.hypoglycaemia),
    [
      [2.9, "level_2"],
      [3.0, "level_1"],
      [3.1, "level_1"],
    ],
  ],
  [
    "REF-EX-HYPO-L1 3.9 (<)",
    (v) => withS((s) => (s.vitals.glucose = v)),
    cls(C.hypoglycaemia),
    [
      [3.8, "level_1"],
      [3.9, null],
      [4.0, null],
    ],
  ],
  [
    "REF-EX-GLU-HIGH 11.1 (≥)",
    (v) => withS((s) => (s.vitals.glucose = v)),
    fires("FLAG-EX-GLU-HIGH"),
    [
      [11.0, false],
      [11.1, true],
      [11.2, true],
    ],
  ],
  [
    "REF-EX-PEF-BANDS life-threatening < 33",
    (v) => asthma(v),
    cls(C.asthma),
    [
      [32, "life_threatening"],
      [33, "acute_severe"],
      [34, "acute_severe"],
    ],
  ],
  [
    "REF-EX-PEF-BANDS severe ≤ 50",
    (v) => asthma(v),
    cls(C.asthma),
    [
      [50, "acute_severe"],
      [51, "moderate"],
    ],
  ],
  [
    "REF-EX-PEF-BANDS moderate ≤ 75",
    (v) => asthma(v),
    cls(C.asthma),
    [
      [75, "moderate"],
      [76, null],
    ],
  ],
  [
    "REF-EX-ASTHMA-RR 25 (≥)",
    (v) => asthma(80, { rr: v }),
    cls(C.asthma),
    [
      [24, null],
      [25, "acute_severe"],
      [26, "acute_severe"],
    ],
  ],
  [
    "REF-EX-ASTHMA-HR 110 (≥)",
    (v) => asthma(80, { pulse: v }),
    cls(C.asthma),
    [
      [109, null],
      [110, "acute_severe"],
    ],
  ],
  [
    "REF-EX-ASTHMA-SPO2 92 (<)",
    (v) => asthma(80, { spo2: v }),
    cls(C.asthma),
    [
      [91, "life_threatening"],
      [92, null],
      [93, null],
    ],
  ],
  [
    "REF-EX-CRB65 RR 30",
    (v) => crb({ rr: v }),
    score("crb65"),
    [
      [29, 0],
      [30, 1],
      [31, 1],
    ],
  ],
  [
    "REF-EX-CRB65 SBP 90 (<)",
    (v) => crb({ sbp: v }),
    score("crb65"),
    [
      [89, 1],
      [90, 0],
      [91, 0],
    ],
  ],
  [
    "REF-EX-CRB65 DBP 60 (≤)",
    (v) => crb({ dbp: v }),
    score("crb65"),
    [
      [59, 1],
      [60, 1],
      [61, 0],
    ],
  ],
  [
    "REF-EX-CRB65 age 65",
    (v) => crb({ age: v }),
    score("crb65"),
    [
      [64, 0],
      [65, 1],
      [66, 1],
    ],
  ],
  [
    "REF-EX-CRB65 AMTS 8 (≤)",
    (v) => crb({ amts: v }),
    score("crb65"),
    [
      [7, 1],
      [8, 1],
      [9, 0],
    ],
  ],
  [
    "REF-EX-AMTS-IMPAIRED 6 (≤)",
    (v) => withS((s) => amtsOf(s, v)),
    fires("FLAG-EX-AMTS"),
    [
      [5, true],
      [6, true],
      [7, false],
    ],
  ],
  [
    "REF-EX-VIP-RESITE 2 (≥)",
    (v) => withS((s) => positive(s, "ex.general.vascular_access", { vip_score_site: String(v) })),
    fires("FLAG-EX-PHLEBITIS"),
    [
      [1, false],
      [2, true],
      [3, true],
    ],
  ],
  [
    "REF-EX-POWER-WEAK 3 (≤)",
    (v) =>
      withS(
        (s) =>
          (s.exam = { ...s.exam, blocks: { power: { "Hip flexion": { R: String(v) as "3" } } } }),
      ),
    fires("FLAG-EX-WEAKNESS"),
    [
      [2, true],
      [3, true],
      [4, false],
    ],
  ],
  [
    "REF-EX-NRS-BANDS mild ≤ 3",
    (v) => withS((s) => positive(s, "ex.general.distress", { type: ["pain"], pain_nrs: v })),
    cls(C.painSeverity),
    [
      [2, "mild"],
      [3, "mild"],
      [4, "moderate"],
    ],
  ],
  [
    "REF-EX-NRS-BANDS moderate ≤ 6",
    (v) => withS((s) => positive(s, "ex.general.distress", { type: ["pain"], pain_nrs: v })),
    cls(C.painSeverity),
    [
      [6, "moderate"],
      [7, "severe"],
    ],
  ],
  [
    "REF-EX-ITT-LOPS 2 (≥)",
    (v) => withS((s) => positive(s, "ex.feet.ipswich_touch", { toes_not_felt: v })),
    (s) => C.footFacts(toCtx(s), "right").lops,
    [
      [1, false],
      [2, true],
      [3, true],
    ],
  ],
  [
    "REF-EX-SINBAD-AREA 1 (≥)",
    (v) => footUlcer(v),
    (s) => C.sinbad(toCtx(s), C.footInfection(toCtx(s))).inputs.find((i) => i.startsWith("area")),
    [
      [0.5, "area 0"],
      [1, "area 1"],
      [1.5, "area 1"],
    ],
  ],
  [
    "REF-EX-CRT 2 (>)",
    (v) => withS((s) => positive(s, "ex.cardiovascular.capillary_refill", { time: v })),
    fires("FLAG-EX-CRT"),
    [
      [1, false],
      [2, false],
      [3, true],
    ],
  ],
  [
    "REF-EX-BP-SEVERE systolic 180",
    (v) => withS((s) => ((s.vitals.sbp = v), (s.vitals.dbp = 90))),
    fires("FLAG-EX-BP-SEVERE"),
    [
      [179, false],
      [180, true],
      [181, true],
    ],
  ],
  [
    "REF-EX-BP-SEVERE diastolic 120",
    (v) => withS((s) => ((s.vitals.sbp = 150), (s.vitals.dbp = v))),
    fires("FLAG-EX-BP-SEVERE"),
    [
      [119, false],
      [120, true],
    ],
  ],
  [
    "REF-EX-SBP-LOW 90 (<)",
    (v) =>
      withS(
        (s) => (
          positive(s, "ex.skin.temperature", { found: ["cool_peripheries"] }),
          (s.vitals.sbp = v),
          (s.vitals.dbp = 50)
        ),
      ),
    (s) => flagIds(s).some((id) => ruleUses(id, "REF-EX-SBP-LOW")),
    [
      [89, true],
      [90, false],
      [91, false],
    ],
  ],
  [
    "REF-EX-FEVER-TEMP 38 (≥)",
    (v) =>
      withS(
        (s) => (positive(s, "ex.general.bleeding_signs", { seen: ["gums"] }), (s.vitals.temp = v)),
      ),
    fires("FLAG-EX-FEVER-BLEEDING"),
    [
      [37.9, false],
      [38, true],
      [38.1, true],
    ],
  ],
];

function ruleUses(id: string, ref: string) {
  return JSON.stringify(ecat.data.flag_rules.find((r) => r.id === id)?.when).includes(ref);
}

function asthma(pef: number, v: Partial<Scenario["vitals"]> = {}) {
  return withS((s) => {
    positive(s, "ex.respiratory.wheeze");
    s.exam = {
      ...s.exam,
      panels: { asthmaConfirmed: true, peakFlow: { best: pef * 5, reference: 500 } },
    };
    Object.assign(s.vitals, { spo2: 96, rr: 18, pulse: 90 }, v);
  });
}
function amtsOf(s: Scenario, score: number) {
  s.exam = {
    ...s.exam,
    blocks: {
      ...s.exam.blocks,
      amts: Object.fromEntries(
        Array.from({ length: 10 }, (_, i) => [String(i + 1), i < score ? "correct" : "incorrect"]),
      ),
    },
  };
}
function crb(o: { rr?: number; sbp?: number; dbp?: number; age?: number; amts?: number }) {
  return withS((s) => {
    complain(s, "sym.cough");
    positive(s, "ex.respiratory.crackles");
    s.vitals.rr = o.rr ?? 20;
    s.vitals.sbp = o.sbp ?? 120;
    s.vitals.dbp = o.dbp ?? 80;
    s.patient.ageYears = o.age ?? 40;
    if (o.amts !== undefined) amtsOf(s, o.amts);
    else gcs(s, 4, 5, 6);
  });
}
function score(id: string) {
  return (s: Scenario) => (id === "crb65" ? C.crb65Result(toCtx(s)).value : null);
}
function footUlcer(area: number) {
  return withS((s) =>
    positive(s, "ex.feet.ulcer", {
      area,
      side: "left",
      site: "forefoot",
      depth: "skin_or_subcutaneous_only",
    }),
  );
}

describe("reference edges (value − ε, value, value + ε)", () => {
  it.each(EDGES)("%s", (_, build, read, cases) => {
    for (const [v, want] of cases) expect(read(build(v)), `at ${v}`).toEqual(want);
  });

  it("covers every numeric reference entry a classifier or flag reads", () => {
    const tested = new Set(EDGES.map(([l]) => l.split(" ")[0]));
    const suggestionOnly = new Set([
      "REF-EX-OLDER-AGE",
      "REF-EX-PROSTATE-AGE",
      "REF-EX-SPO2-SCORE-SUGGEST",
      "REF-EX-GLU-KETONE-TEST", // SUG-GLU-KETONES (the pack's flag on it was dropped, P0-23)
      "REF-EX-DR-RECALL", // dr_review's intervals, read by no rule (provenance for the result)
    ]);
    const untested = Object.keys(ecat.data.reference_entries).filter(
      (r) => !tested.has(r) && !suggestionOnly.has(r) && r !== "REF-EX-GTFCC-COUNT",
    );
    expect(untested).toEqual([]); // GTFCC's count has its own truth table below
  });
});

describe("GTFCC (dehydration)", () => {
  const grade = (signs: string[], dv = true) =>
    C.dehydration(
      toCtx(
        withS(
          (s) => (
            dv && complain(s, "sym.diarrhoea"),
            positive(s, "ex.general.hydration", { signs_present: signs })
          ),
        ),
      ),
    );
  it.each([
    [["lethargic_or_unconscious"], "severe"], // a danger sign alone
    [["sunken_eyes", "drinks_poorly_or_not_able"], "severe"], // two severe signs
    [["restless_or_irritable", "rapid_pulse"], "some"], // two some signs
    [["drinks_poorly_or_not_able", "restless_or_irritable"], "some"], // mixed columns
    [["skin_pinch_goes_back_very_slowly", "rapid_pulse"], "some"],
    [["skin_pinch_goes_back_slowly", "skin_pinch_goes_back_very_slowly"], "below_threshold"], // one column
    [["drinks_eagerly_thirsty", "drinks_poorly_or_not_able"], "below_threshold"],
    [["sunken_eyes"], "below_threshold"],
    [[], "none"],
  ] as const)("%j → %s", (signs, want) => expect(grade([...signs]).result).toBe(want));

  it("is not graded without diarrhoea or vomiting, and says why", () => {
    const r = grade(["sunken_eyes", "drinks_poorly_or_not_able"], false);
    expect(r.status).toBe("not_graded");
    expect(r.reason).toMatch(/diarrhoea or vomiting/);
  });

  it("a danger sign names itself; the plan hint turns into a fluid caution with overload signs", () => {
    const s = withS(
      (q) => (
        complain(q, "sym.diarrhoea"),
        positive(q, "ex.general.hydration", { signs_present: ["lethargic_or_unconscious"] })
      ),
    );
    expect(C.dehydration(toCtx(s)).reason).toBe("danger sign: lethargic or unconscious");
    expect(C.dehydration(toCtx(s)).hint).toBe("GTFCC plan C");
    positive(s, "ex.cardiovascular.jvp");
    expect(C.dehydration(toCtx(s)).hint).toMatch(/Fluid overload/);
  });

  it("more signs never lower the grade (monotonic)", () => {
    const signs = ecat
      .attribute("ex.general.hydration", "signs_present")!
      .options!.map((o) => o.id);
    const rank = { none: 0, below_threshold: 1, some: 2, severe: 3 } as Record<string, number>;
    for (let n = 0; n < 300; n++) {
      const a = signs.filter(() => Math.random() < 0.3);
      const b = [...new Set([...a, ...signs.filter(() => Math.random() < 0.2)])];
      expect(rank[grade(b).result!]!).toBeGreaterThanOrEqual(rank[grade(a).result!]!);
    }
  });
});

describe("IMAM (MUAC)", () => {
  it("under 15 is not applicable", () => {
    expect(C.muac(toCtx(adultMuac(12)(12))).status).toBe("not_applicable");
  });
  it("bilateral pitting oedema is SAM only when recorded as nutritional", () => {
    const s = adultMuac(30)(24);
    positive(s, "ex.general.oedema", { type: "pitting", side: "both_legs" });
    expect(C.muac(toCtx(s)).result).toBe("normal");
    expect(C.muac(toCtx(s)).note).toMatch(/exclude heart, kidney, liver and pregnancy/);
    s.exam.entries["ex.general.nutrition"]!.attrs!.oedema_cause = "nutritional";
    s.exam.entries["ex.general.nutrition"]!.attrs!.signs = ["bilateral_pitting_oedema_of_the_feet"];
    expect(C.muac(toCtx(s)).result).toBe("sam");
  });
  it("a lower MUAC never raises the class (monotonic)", () => {
    const rank = { normal: 0, mam: 1, sam: 2 } as Record<string, number>;
    for (const age of [16, 30, 70]) {
      let prev = -1;
      for (let v = 30; v >= 10; v -= 0.5) {
        const r = rank[C.muac(toCtx(adultMuac(age)(v))).result!]!;
        expect(r).toBeGreaterThanOrEqual(prev);
        prev = r;
      }
    }
  });
});

describe("Feet: IWGDF risk, infection grade, SINBAD", () => {
  it("fixture 3: risk 3 with active ulcer, infection grade 3, SINBAD 3", () => {
    const s = diabeticFoot();
    const x = toCtx(s);
    const risk = C.iwgdfRisk(x);
    expect(risk.result).toBe("3");
    expect(risk.perFoot).toEqual({ left: 3, right: 0 });
    expect(risk.note).toMatch(/^Active ulcer/);
    const dfi = C.footInfection(x);
    expect(dfi.result).toBe("3");
    const sb = C.sinbad(x, dfi);
    expect(sb.value).toBe(3);
    expect(sb.reason).toBe(
      "site 0, ischaemia 0, neuropathy 1, bacterial infection 1, area 1, depth 0",
    );
  });
  it("incomplete until both feet have sensation and pulses", () => {
    const s = withS((q) => positive(q, "ex.feet.monofilament", { sites_not_felt_left: 1 }));
    expect(C.iwgdfRisk(toCtx(s)).status).toBe("incomplete");
  });
  it("osteomyelitis adds (O) at grade 3 or 4; probing to bone only suggests it", () => {
    const s = diabeticFoot();
    s.exam.entries["ex.feet.ulcer"]!.attrs!.depth = "probes_to_bone_or_joint";
    expect(C.footInfection(toCtx(s)).hint).toBe("(O) suggested: probes to bone");
    s.exam.entries["ex.feet.ulcer"]!.attrs!.osteomyelitis = "suspected";
    expect(C.footInfection(toCtx(s)).text).toMatch(/^Infection grade 3 \(O\)/);
  });
  it("one palpable pedal pulse scores 0 for SINBAD ischaemia; both absent score 1", () => {
    const s = diabeticFoot();
    s.exam.blocks.pulses!["Posterior tibial"] = { R: "present", L: "absent" };
    const x = toCtx(s);
    expect(C.sinbad(x, C.footInfection(x)).reason).toMatch(/ischaemia 1/);
  });
});

export function diabeticFoot(): Scenario {
  return withS((s) => {
    s.patient.ageYears = 58;
    positive(s, "ex.feet.ulcer", {
      site: "forefoot",
      side: "left",
      area: 2.5,
      depth: "skin_or_subcutaneous_only",
      infection_signs: ["local_warmth", "redness_2_cm_or_more"],
    });
    positive(s, "ex.feet.monofilament", { sites_not_felt_left: 2, sites_not_felt_right: 0 });
    positive(s, "ex.feet.foot_risk_history", { history: ["previous_foot_ulcer"] });
    s.exam = {
      ...s.exam,
      blocks: {
        ...s.exam.blocks,
        pulses: {
          "Dorsalis pedis": { R: "present", L: "absent" },
          "Posterior tibial": { R: "present", L: "present" },
        },
      },
    };
  });
}

describe("scores", () => {
  it("NT is never scored and leaves GCS untotalled", () => {
    const s = scenario();
    gcs(s, 3, 4, 6, { nt: { V: "Intubated or tracheostomy" } });
    expect(gcsTotal(s.exam.blocks.consciousness)).toBeNull();
    expect(gcsText(s.exam.blocks.consciousness)).toBe("GCS not totalled (E3 VNT M6)");
  });
  it("GCS-P shows only with an unreactive pupil", () => {
    const s = scenario();
    gcs(s, 3, 4, 6);
    expect(gcsP(s.exam)).toBeNull();
    positive(s, "ex.nervous.pupils", { right_reaction: "brisk", left_reaction: "brisk" });
    expect(gcsP(s.exam)).toEqual({ value: 13, show: false });
    positive(s, "ex.nervous.pupils", { left_reaction: "unreactive" });
    expect(gcsP(s.exam)).toEqual({ value: 12, show: true });
  });
  it("ACVPU is A only at GCS 15; below it is never inferred, only suggested", () => {
    for (const [E, V, M, sug] of [
      [4, 4, 6, "C"],
      [3, 4, 6, "V"],
      [2, 1, 5, "P"],
      [1, 1, 1, "U"],
    ] as const) {
      const s = scenario();
      gcs(s, E, V, M);
      expect(acvpuOf(s.exam.blocks.consciousness)).toBeNull();
      expect(acvpuSuggestion(s.exam.blocks.consciousness)).toBe(sug);
    }
    const s = scenario();
    gcs(s, 4, 5, 6);
    expect(acvpuOf(s.exam.blocks.consciousness)).toBe("A");
  });
  it("orientation: derived at V5, asked at V4, not assessable at V3 or below", () => {
    const at = (V: number) => orientationState({ method: "gcs", E: 4, V, M: 6 }).kind;
    expect([at(5), at(4), at(3)]).toEqual(["derived", "ask", "not_assessable"]);
  });
  it("ROSIER waits for glucose and for this episode's syncope and seizure; +1 signs count only when confirmed new", () => {
    const s = scenario();
    solve({ classifier: "rosier", any_of: ["likely"] }, s);
    s.vitals.glucose = null;
    expect(C.rosier(toCtx(s)).status).toBe("incomplete");
    s.vitals.glucose = 6.2;
    expect(C.rosier(toCtx(s)).value).toBe(1);
    s.exam = { ...s.exam, panels: { rosier: { syncope: "no", seizure: "no", newSigns: [] } } };
    expect(C.rosier(toCtx(s)).value).toBe(0); // an old deficit does not score (SC3)
  });
  it("a classifier whose reference is withheld shows Awaiting sign-off", () => {
    const s = adultMuac(30)(17.5);
    const r = C.classifyAll(toCtx(s), { ...signoff, withheld: ["REF-EX-MUAC-BANDS"] }).get(
      "muac_uganda_imam",
    )!;
    expect(r.status).toBe("awaiting_signoff");
    expect(r.text).toBe("Awaiting sign-off");
  });
});

export { negative };
