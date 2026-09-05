import type { Citation, Criterion, Feature, SiteProfile } from "@/lib/ncd/catalog/schema";
import type { CaptureMap, CaptureValue } from "@/lib/ncd/engine/evaluate";
import { describe, expect, it } from "vitest";

import { notAssessed, recorded, unavailable } from "@/lib/ncd/catalog/schema";
import {
  contextOf,
  evaluateAny,
  evaluateCriterion,
  evaluatePredicate,
  rollUpAny,
} from "@/lib/ncd/engine/evaluate";

const cite: Citation = {
  standard: "WHO",
  version: "2019",
  title: "probe",
  url: "https://example.org",
  csoSigned: true,
};

const FEATURES: Feature[] = [
  {
    code: "fpg",
    display: "Fasting plasma glucose",
    kind: "investigation",
    valueType: "number",
    unit: "mmol/L",
    requires: "lab.glucose",
    section: "labs",
  },
  {
    code: "hba1c",
    display: "HbA1c",
    kind: "investigation",
    valueType: "number",
    unit: "%",
    requires: "lab.hba1c",
    section: "labs",
  },
  { code: "polyuria", display: "Polyuria", kind: "symptom", valueType: "boolean", section: "sx" },
  {
    code: "ketones",
    display: "Urine ketones",
    kind: "investigation",
    valueType: "single_select",
    options: [
      { value: "neg", display: "Negative" },
      { value: "pos", display: "Positive" },
    ],
    section: "labs",
  },
];

const FULL: SiteProfile = {
  id: "referral",
  display: "Referral hospital",
  standardPreference: ["ADA", "WHO"],
  available: ["lab.glucose", "lab.hba1c"],
};
/** A site with glucose but no HbA1c — the common resource-limited shape. */
const BASIC: SiteProfile = { ...FULL, id: "district", available: ["lab.glucose"] };

const ctx = (values: CaptureMap, site: SiteProfile = FULL) => contextOf(FEATURES, values, site);

const crit = (over: Partial<Criterion>): Criterion => ({
  id: "c",
  label: "c",
  citation: cite,
  ...over,
});

describe("evaluatePredicate — absence of evidence is never evidence", () => {
  it("returns insufficient, never not_met, when nothing was captured", () => {
    const r = evaluatePredicate({ feature: "fpg", op: ">=", value: 7 }, ctx({}));
    expect(r.state).toBe("insufficient");
  });

  // The core safety property: "nobody asked" must not read as "patient denies".
  it("does not let `absent` be satisfied by a missing capture", () => {
    expect(evaluatePredicate({ feature: "polyuria", op: "absent" }, ctx({})).state).toBe(
      "insufficient",
    );
    expect(
      evaluatePredicate({ feature: "polyuria", op: "absent" }, ctx({ polyuria: notAssessed() }))
        .state,
    ).toBe("insufficient");
    // only an actual recorded negative satisfies it
    expect(
      evaluatePredicate({ feature: "polyuria", op: "absent" }, ctx({ polyuria: recorded(false) }))
        .state,
    ).toBe("met");
  });

  it("distinguishes not-done-here from not-done-yet", () => {
    // site cannot run HbA1c at all
    const r = evaluatePredicate({ feature: "hba1c", op: ">=", value: 6.5 }, ctx({}, BASIC));
    expect(r.state).toBe("unavailable");
    expect(r.capability).toBe("lab.hba1c");
    // same site, a test it CAN run but has not
    expect(evaluatePredicate({ feature: "fpg", op: ">=", value: 7 }, ctx({}, BASIC)).state).toBe(
      "insufficient",
    );
  });

  it("honours an explicit unavailable capture over the site profile", () => {
    const r = evaluatePredicate(
      { feature: "fpg", op: ">=", value: 7 },
      ctx({ fpg: unavailable("lab.glucose") }),
    );
    expect(r.state).toBe("unavailable");
  });

  it("compares numbers and keeps the observed value as evidence", () => {
    const r = evaluatePredicate(
      { feature: "fpg", op: ">=", value: 7 },
      ctx({ fpg: recorded(7.1) }),
    );
    expect(r.state).toBe("met");
    expect(r.observed).toBe(7.1);
    expect(
      evaluatePredicate({ feature: "fpg", op: ">=", value: 7 }, ctx({ fpg: recorded(6.9) })).state,
    ).toBe("not_met");
    // boundary is inclusive for >=
    expect(
      evaluatePredicate({ feature: "fpg", op: ">=", value: 7 }, ctx({ fpg: recorded(7) })).state,
    ).toBe("met");
  });

  // A garbled capture is missing data, not a negative finding.
  it("treats a numeric comparison against a non-numeric capture as insufficient", () => {
    expect(
      evaluatePredicate({ feature: "fpg", op: ">=", value: 7 }, ctx({ fpg: recorded("high") }))
        .state,
    ).toBe("insufficient");
  });

  // Fail closed: a catalog typo must never read as a satisfied criterion.
  it("treats an unknown feature as insufficient", () => {
    expect(evaluatePredicate({ feature: "ghost", op: "present" }, ctx({})).state).toBe(
      "insufficient",
    );
  });

  it("handles select and multi-select membership", () => {
    expect(
      evaluatePredicate(
        { feature: "ketones", op: "==", value: "pos" },
        ctx({ ketones: recorded("pos") }),
      ).state,
    ).toBe("met");
    expect(
      evaluatePredicate(
        { feature: "ketones", op: "in", value: ["pos"] },
        ctx({ ketones: recorded(["neg"]) }),
      ).state,
    ).toBe("not_met");
  });
});

describe("entry lists — a recorded dose is documentation, never logic", () => {
  const FEATS: Feature[] = [
    {
      code: "therapy",
      display: "Therapy",
      kind: "history",
      valueType: "multi_select",
      section: "s",
      optionDetail: { label: "Dose" },
      options: [
        { value: "metformin", display: "Metformin" },
        { value: "insulin", display: "Insulin" },
      ],
    },
  ];
  const site: SiteProfile = { id: "s", display: "s", standardPreference: [], available: [] };
  const run = (v: CaptureMap, p: Parameters<typeof evaluatePredicate>[0]) =>
    evaluatePredicate(p, contextOf(FEATS, v, site)).state;

  it("matches on the selected option exactly as a plain multi-select does", () => {
    const withDose: CaptureMap = {
      therapy: recorded([{ option: "metformin", detail: "1 g bd" }]),
    };
    const plain: CaptureMap = { therapy: recorded(["metformin"]) };
    for (const v of [withDose, plain]) {
      expect(run(v, { feature: "therapy", op: "==", value: "metformin" })).toBe("met");
      expect(run(v, { feature: "therapy", op: "==", value: "insulin" })).toBe("not_met");
      expect(run(v, { feature: "therapy", op: "in", value: ["insulin", "metformin"] })).toBe("met");
      expect(run(v, { feature: "therapy", op: "present" })).toBe("met");
    }
  });

  /**
   * The boundary that keeps dose capture safe. Recording what a patient takes is
   * documentation; letting a rule branch on the free text beside it would be the
   * engine reasoning about doses, which it must never do.
   */
  it("gives the same verdict whatever the dose text says", () => {
    const verdicts = ["1 g bd", "", "STOP", "0", "metformin"].map((detail) =>
      run(
        { therapy: recorded([{ option: "metformin", detail }]) },
        { feature: "therapy", op: "==", value: "metformin" },
      ),
    );
    expect(new Set(verdicts).size).toBe(1);
    expect(verdicts[0]).toBe("met");
  });

  /**
   * The assertion this test's own name always described. An empty selection used
   * to read as `present: not_met` AND `absent: met` — so unticking the last chip
   * asserted a clinical negative the clinician never made. `absent` is the half
   * that matters: that is the direction which manufactures evidence.
   */
  it("an empty selection is not a recorded negative", () => {
    for (const op of ["present", "absent"] as const) {
      expect(run({ therapy: recorded([]) }, { feature: "therapy", op }), op).toBe("insufficient");
      expect(run({ therapy: recorded("") }, { feature: "therapy", op }), op).toBe("insufficient");
      expect(run({}, { feature: "therapy", op }), op).toBe("insufficient");
    }
    // A real selection still reads normally in both directions.
    expect(run({ therapy: recorded(["metformin"]) }, { feature: "therapy", op: "present" })).toBe(
      "met",
    );
    expect(run({ therapy: recorded(["metformin"]) }, { feature: "therapy", op: "absent" })).toBe(
      "not_met",
    );
  });
});

describe("a single-select option carrying an optional note", () => {
  const FEATS: Feature[] = [
    {
      code: "regimen",
      display: "Insulin regimen",
      kind: "history",
      valueType: "single_select",
      section: "s",
      options: [
        { value: "basal_only", display: "Basal only" },
        { value: "other", display: "Other", detail: { label: "Regimen" } },
      ],
    },
  ];
  const site: SiteProfile = { id: "s", display: "s", standardPreference: [], available: [] };
  const run = (v: CaptureValue, value: string) =>
    evaluatePredicate(
      { feature: "regimen", op: "==", value },
      contextOf(FEATS, { regimen: recorded(v) }, site),
    ).state;

  it("matches on the option, whether or not a note was typed", () => {
    expect(run({ option: "other", detail: "split-mix, 3 doses" }, "other")).toBe("met");
    expect(run({ option: "other" }, "other")).toBe("met");
    expect(run("other", "other")).toBe("met"); // a plain select still works
    expect(run({ option: "other", detail: "anything" }, "basal_only")).toBe("not_met");
  });

  // The note is optional: leaving it blank must not weaken the selection.
  it("treats the selection alone as a complete answer", () => {
    expect(run({ option: "other", detail: "" }, "other")).toBe("met");
    const present = { feature: "regimen", op: "present" as const };
    expect(
      evaluatePredicate(present, contextOf(FEATS, { regimen: recorded({ option: "other" }) }, site))
        .state,
    ).toBe("met");
  });
});

describe("durations — the unit travels with the value", () => {
  const FEATS: Feature[] = [
    {
      code: "dur",
      display: "Time since diagnosis",
      kind: "history",
      valueType: "duration",
      unit: "years",
      section: "s",
    },
  ];
  const site: SiteProfile = { id: "s", display: "s", standardPreference: [], available: [] };
  const over10y = { feature: "dur", op: ">=" as const, value: 10, unit: "years" };
  const run = (v: CaptureValue) =>
    evaluatePredicate(over10y, contextOf(FEATS, { dur: recorded(v) }, site)).state;

  /**
   * The trap this closes. A bare number with the unit kept elsewhere would
   * compare 120 >= 10 and pass for the wrong reason, and 6 >= 10 and fail for
   * the wrong reason. Both sides normalise to days first.
   */
  it("compares across units rather than comparing raw numbers", () => {
    expect(run({ value: 11, unit: "years" })).toBe("met");
    expect(run({ value: 132, unit: "months" })).toBe("met"); // 11 years
    expect(run({ value: 120, unit: "months" })).toBe("met"); // exactly 10 years
    expect(run({ value: 6, unit: "months" })).toBe("not_met");
    expect(run({ value: 6, unit: "weeks" })).toBe("not_met");
    expect(run({ value: 4000, unit: "days" })).toBe("met"); // ~10.9 years
    expect(run({ value: 300, unit: "days" })).toBe("not_met");
  });

  it("treats a duration threshold with no unit as unusable, not as a comparison", () => {
    const noUnit = { feature: "dur", op: ">=" as const, value: 10 };
    expect(
      evaluatePredicate(
        noUnit,
        contextOf(FEATS, { dur: recorded({ value: 11, unit: "years" }) }, site),
      ).state,
    ).toBe("insufficient");
  });

  it("is present only when the recorded duration is greater than zero", () => {
    const present = { feature: "dur", op: "present" as const };
    const ctxOf = (v: CaptureValue) => contextOf(FEATS, { dur: recorded(v) }, site);
    expect(evaluatePredicate(present, ctxOf({ value: 2, unit: "weeks" })).state).toBe("met");
    expect(evaluatePredicate(present, ctxOf({ value: 0, unit: "years" })).state).toBe("not_met");
  });
});

describe("AND — a contradicted requirement is definitive", () => {
  const c = crit({
    all: [
      { feature: "fpg", op: ">=", value: 7 },
      { feature: "polyuria", op: "present" },
    ],
  });

  it("is not_met as soon as one requirement is contradicted, whatever else is missing", () => {
    const r = evaluateCriterion(c, ctx({ fpg: recorded(5.0) }));
    expect(r.state).toBe("not_met");
  });

  it("is met only when every requirement is met", () => {
    expect(evaluateCriterion(c, ctx({ fpg: recorded(8), polyuria: recorded(true) })).state).toBe(
      "met",
    );
    expect(evaluateCriterion(c, ctx({ fpg: recorded(8) })).state).toBe("insufficient");
  });

  // Reporting this as merely "insufficient" would put it on a gaps list the
  // clinician can never clear at this site.
  it("reports unavailable over insufficient — the criterion can never be satisfied here", () => {
    const both = crit({
      all: [
        { feature: "hba1c", op: ">=", value: 6.5 },
        { feature: "fpg", op: ">=", value: 7 },
      ],
    });
    const r = evaluateCriterion(both, ctx({}, BASIC));
    expect(r.state).toBe("unavailable");
    expect(r.blocked).toEqual([{ feature: "hba1c", capability: "lab.hba1c" }]);
    expect(r.missing).toEqual(["fpg"]);
  });
});

describe("OR — the precedence deliberately inverts", () => {
  const c = crit({
    any: [
      { feature: "hba1c", op: ">=", value: 6.5 },
      { feature: "fpg", op: ">=", value: 7 },
    ],
  });

  it("is met on a single satisfied alternative", () => {
    expect(evaluateCriterion(c, ctx({ fpg: recorded(9) })).state).toBe("met");
  });

  /**
   * The asymmetry that matters clinically. Under AND, one unobtainable test
   * closes the question. Under OR it does not: diagnostic criteria are
   * alternatives, so if HbA1c is impossible here but fasting glucose is merely
   * undone, the diagnosis is still reachable — do the test you can do.
   */
  it("stays insufficient — not unavailable — when a doable alternative remains", () => {
    const r = evaluateCriterion(c, ctx({}, BASIC));
    expect(r.state).toBe("insufficient");
    expect(r.missing).toEqual(["fpg"]);
    expect(r.blocked).toEqual([{ feature: "hba1c", capability: "lab.hba1c" }]);
  });

  it("is unavailable only when every alternative is unobtainable here", () => {
    const noLabs: SiteProfile = { ...FULL, available: [] };
    expect(evaluateCriterion(c, ctx({}, noLabs)).state).toBe("unavailable");
  });

  it("is not_met only when every alternative was measured and none reached", () => {
    expect(evaluateCriterion(c, ctx({ fpg: recorded(5), hba1c: recorded(5.4) })).state).toBe(
      "not_met",
    );
  });
});

describe("mixed all + any", () => {
  it("conjoins the two branches", () => {
    const c = crit({
      all: [{ feature: "polyuria", op: "present" }],
      any: [{ feature: "fpg", op: ">=", value: 7 }],
    });
    expect(evaluateCriterion(c, ctx({ polyuria: recorded(true), fpg: recorded(11) })).state).toBe(
      "met",
    );
    expect(evaluateCriterion(c, ctx({ polyuria: recorded(false), fpg: recorded(11) })).state).toBe(
      "not_met",
    );
    expect(evaluateCriterion(c, ctx({ polyuria: recorded(true) })).state).toBe("insufficient");
  });

  it("asserts nothing from a criterion with no predicates", () => {
    expect(evaluateCriterion(crit({}), ctx({})).state).toBe("insufficient");
  });
});

describe("criterion metadata", () => {
  it("carries the citation and the confirmation requirement through", () => {
    const c = crit({
      requiresConfirmation: true,
      all: [{ feature: "fpg", op: ">=", value: 7 }],
    });
    const r = evaluateCriterion(c, ctx({ fpg: recorded(8) }));
    expect(r.requiresConfirmation).toBe(true);
    expect(r.citation).toBe(cite);
    expect(r.label).toBe("c");
  });

  it("deduplicates the missing and blocked lists", () => {
    const c = crit({
      all: [
        { feature: "fpg", op: ">=", value: 4 },
        { feature: "fpg", op: "<=", value: 20 },
      ],
    });
    expect(evaluateCriterion(c, ctx({})).missing).toEqual(["fpg"]);
  });
});

describe("evaluateAny + rollUpAny", () => {
  const met = crit({ id: "met", label: "met", all: [{ feature: "fpg", op: ">=", value: 7 }] });
  const missing = crit({
    id: "missing",
    label: "missing",
    all: [{ feature: "polyuria", op: "present" }],
  });
  const notMet = crit({
    id: "not",
    label: "not",
    all: [{ feature: "fpg", op: ">=", value: 99 }],
  });

  it("orders alternatives best-state first, stable within a state", () => {
    const rs = evaluateAny([notMet, missing, met], ctx({ fpg: recorded(8) }));
    expect(rs.map((r) => r.id)).toEqual(["met", "missing", "not"]);
  });

  it("rolls up with the OR precedence", () => {
    expect(rollUpAny(evaluateAny([notMet, met], ctx({ fpg: recorded(8) })))).toBe("met");
    expect(rollUpAny(evaluateAny([notMet, missing], ctx({ fpg: recorded(8) })))).toBe(
      "insufficient",
    );
    expect(rollUpAny(evaluateAny([notMet], ctx({ fpg: recorded(8) })))).toBe("not_met");
    expect(rollUpAny([])).toBe("insufficient");
  });
});
