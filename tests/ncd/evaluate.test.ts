import type { Citation, Criterion, Feature, SiteProfile } from "@/lib/ncd/catalog/schema";
import type { CaptureMap } from "@/lib/ncd/engine/evaluate";
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
