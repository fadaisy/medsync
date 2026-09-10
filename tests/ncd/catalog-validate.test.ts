import type { Citation, NcdCatalog } from "@/lib/ncd/catalog/schema";
import { describe, expect, it } from "vitest";

import {
  isPerformable,
  isRecorded,
  notAssessed,
  preferredCriteria,
  recorded,
  unavailable,
} from "@/lib/ncd/catalog/schema";
import { errorsOf, referencedFeatures, validateCatalog } from "@/lib/ncd/catalog/validate";

const cite = (over: Partial<Citation> = {}): Citation => ({
  standard: "WHO",
  version: "2019",
  title: "Classification of diabetes mellitus",
  url: "https://example.org/who",
  csoSigned: true,
  ...over,
});

/** A minimal, structurally valid catalog. Every test mutates a copy of this. */
const base = (): NcdCatalog => ({
  id: "probe",
  display: "Probe",
  version: "0.0.1",
  capabilities: [{ code: "lab.glucose", display: "Plasma glucose", tier: "basic_lab" }],
  sections: [{ id: "labs", display: "Labs", order: 1 }],
  features: [
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
      code: "polyuria",
      display: "Polyuria",
      kind: "symptom",
      valueType: "boolean",
      section: "labs",
    },
  ],
  diagnosis: [
    {
      id: "who",
      standard: "WHO",
      version: "2019",
      citation: cite(),
      anyOf: [
        {
          id: "fpg_high",
          label: "Fasting plasma glucose ≥ 7.0 mmol/L",
          all: [{ feature: "fpg", op: ">=", value: 7.0, unit: "mmol/L" }],
          citation: cite(),
        },
      ],
    },
  ],
  complications: [
    {
      code: "chronic_thing",
      display: "A chronic complication",
      timing: "chronic",
      citation: cite(),
      screenedBy: ["fpg"],
      establishedBy: [
        {
          id: "est",
          label: "Established",
          all: [{ feature: "polyuria", op: "present" }],
          citation: cite(),
        },
      ],
    },
  ],
});

const errs = (c: NcdCatalog) => errorsOf(validateCatalog(c)).map((e) => e.message);
const mutate = (fn: (c: NcdCatalog) => void): NcdCatalog => {
  const c = base();
  fn(c);
  return c;
};

describe("Assessed<T> — the honesty primitive", () => {
  // The whole point: absence of a value is not representable as a value.
  it("distinguishes recorded, not-assessed and unavailable", () => {
    expect(isRecorded(recorded(5))).toBe(true);
    expect(isRecorded(notAssessed<number>())).toBe(false);
    expect(isRecorded(unavailable<number>("lab.glucose"))).toBe(false);
    expect(isRecorded(undefined)).toBe(false);
  });

  it("keeps the reason a value is missing", () => {
    const u = unavailable<number>("imaging.fundus");
    expect(u.state).toBe("unavailable");
    if (u.state === "unavailable") expect(u.capability).toBe("imaging.fundus");
    expect(notAssessed().state).toBe("not_assessed");
  });
});

describe("site capability", () => {
  const site = {
    id: "district",
    display: "District hospital",
    standardPreference: ["WHO" as const],
    available: ["lab.glucose"],
  };

  it("treats a feature with no `requires` as bedside — always performable", () => {
    const c = base();
    const polyuria = c.features.find((f) => f.code === "polyuria")!;
    expect(isPerformable(polyuria, { ...site, available: [] })).toBe(true);
  });

  it("gates a feature on its declared capability", () => {
    const c = base();
    const fpg = c.features.find((f) => f.code === "fpg")!;
    expect(isPerformable(fpg, site)).toBe(true);
    expect(isPerformable(fpg, { ...site, available: [] })).toBe(false);
  });
});

describe("standard precedence", () => {
  const sets = base().diagnosis;
  const withAda = [...sets, { ...sets[0]!, id: "ada", standard: "ADA" as const, version: "2026" }];

  it("honours the site's preference order", () => {
    expect(
      preferredCriteria(withAda, {
        id: "s",
        display: "s",
        standardPreference: ["ADA"],
        available: [],
      })?.standard,
    ).toBe("ADA");
    expect(
      preferredCriteria(withAda, {
        id: "s",
        display: "s",
        standardPreference: ["WHO"],
        available: [],
      })?.standard,
    ).toBe("WHO");
  });

  // A catalog must always yield a verdict; the engine reports which standard it used.
  it("falls back to the first set when no preference matches", () => {
    expect(
      preferredCriteria(withAda, {
        id: "s",
        display: "s",
        standardPreference: ["KDIGO"],
        available: [],
      })?.standard,
    ).toBe("WHO");
  });
});

describe("validateCatalog — the baseline", () => {
  it("accepts a well-formed catalog with no errors", () => {
    expect(errs(base())).toEqual([]);
  });

  it("collects every feature referenced anywhere in the logic", () => {
    expect([...referencedFeatures(base())].sort()).toEqual(["fpg", "polyuria"]);
  });
});

describe("validateCatalog — provenance is mandatory", () => {
  it("rejects a criterion with no citation", () => {
    const c = mutate((x) => {
      // @ts-expect-error deliberately removing a required field
      delete x.diagnosis[0]!.anyOf[0]!.citation;
    });
    expect(errs(c)).toContain("missing citation");
  });

  it("rejects placeholder provenance", () => {
    for (const bad of ["TBD", "todo", "n/a", "???", "-"]) {
      const c = mutate((x) => {
        x.diagnosis[0]!.anyOf[0]!.citation = cite({ version: bad });
      });
      expect(
        errs(c).some((m) => m.includes("placeholder")),
        bad,
      ).toBe(true);
    }
  });

  // An unverifiable value may ship — but only if it says so out loud.
  it("rejects a citation with neither a url nor a declared gap", () => {
    const c = mutate((x) => {
      x.diagnosis[0]!.anyOf[0]!.citation = cite({ url: undefined });
    });
    expect(errs(c).some((m) => m.includes("must declare itself"))).toBe(true);
  });

  it("accepts an unverifiable value that declares needsCsoInput", () => {
    const c = mutate((x) => {
      x.diagnosis[0]!.anyOf[0]!.citation = cite({
        url: undefined,
        csoSigned: false,
        needsCsoInput: "WHO fact sheet carried no numeric threshold",
      });
    });
    expect(errs(c)).toEqual([]);
  });

  it("rejects a citation that claims to be signed while still flagged", () => {
    const c = mutate((x) => {
      x.diagnosis[0]!.anyOf[0]!.citation = cite({ csoSigned: true, needsCsoInput: "unresolved" });
    });
    expect(errs(c).some((m) => m.includes("csoSigned while still carrying"))).toBe(true);
  });

  it("warns — but does not fail — on an unsigned catalog, since it ships gated dark", () => {
    const c = mutate((x) => {
      x.diagnosis[0]!.anyOf[0]!.citation = cite({ csoSigned: false });
    });
    expect(errs(c)).toEqual([]);
    expect(validateCatalog(c).some((i) => i.severity === "warning")).toBe(true);
  });
});

describe("validateCatalog — referential integrity", () => {
  it("rejects a predicate pointing at a feature that does not exist", () => {
    const c = mutate((x) => {
      x.diagnosis[0]!.anyOf[0]!.all = [{ feature: "ghost", op: ">=", value: 1 }];
    });
    expect(errs(c).some((m) => m.includes('unknown feature "ghost"'))).toBe(true);
  });

  it("rejects a feature requiring an undeclared capability, or in an unknown section", () => {
    expect(
      errs(mutate((x) => (x.features[0]!.requires = "lab.nope"))).some((m) =>
        m.includes("undeclared capability"),
      ),
    ).toBe(true);
    expect(
      errs(mutate((x) => (x.features[0]!.section = "nowhere"))).some((m) =>
        m.includes("unknown section"),
      ),
    ).toBe(true);
  });

  it("rejects duplicate codes", () => {
    const c = mutate((x) => x.features.push({ ...x.features[0]! }));
    expect(errs(c).some((m) => m.includes("duplicate code"))).toBe(true);
  });

  it("rejects an option value that no feature option defines", () => {
    const c = mutate((x) => {
      x.features.push({
        code: "ketones",
        display: "Urine ketones",
        kind: "investigation",
        valueType: "single_select",
        options: [{ value: "neg", display: "Negative" }],
        section: "labs",
      });
      x.diagnosis[0]!.anyOf[0]!.all = [{ feature: "ketones", op: "==", value: "positive" }];
    });
    expect(errs(c).some((m) => m.includes('option "positive" is not defined'))).toBe(true);
  });
});

describe("validateCatalog — the unit trap", () => {
  // mmol/L vs mg/dL is an 18x error that reads as a plausible number either way.
  it("rejects a threshold whose unit disagrees with its feature", () => {
    const c = mutate((x) => {
      x.diagnosis[0]!.anyOf[0]!.all = [{ feature: "fpg", op: ">=", value: 126, unit: "mg/dL" }];
    });
    expect(errs(c).some((m) => m.includes("does not match feature unit"))).toBe(true);
  });

  it("rejects a numeric operator given a non-numeric value", () => {
    const c = mutate((x) => {
      x.diagnosis[0]!.anyOf[0]!.all = [{ feature: "fpg", op: ">=", value: "seven" }];
    });
    expect(errs(c).some((m) => m.includes("needs a numeric value"))).toBe(true);
  });
});

describe("validateCatalog — acute complications cannot be quiet", () => {
  // The failure this prevents: a DKA rendering as an ordinary checklist row.
  it("rejects an acute complication with no emergency action", () => {
    const c = mutate((x) => {
      x.complications[0]!.timing = "acute";
    });
    expect(errs(c).some((m) => m.includes("no emergency action"))).toBe(true);
  });

  it("accepts an acute complication that carries one", () => {
    const c = mutate((x) => {
      x.complications[0]!.timing = "acute";
      x.complications[0]!.emergency = {
        severity: "red",
        action: "Initiate emergency management and escalate.",
        citation: cite(),
      };
    });
    expect(errs(c)).toEqual([]);
  });
});

describe("validateCatalog — staging and screening", () => {
  it("rejects a screening interval naming a stage that does not exist", () => {
    const c = mutate((x) => {
      x.complications[0]!.screeningIntervals = [{ months: 12, forStage: "nope", citation: cite() }];
    });
    expect(errs(c).some((m) => m.includes('unknown stage "nope"'))).toBe(true);
  });

  it("rejects a non-positive screening interval and duplicate stage codes", () => {
    expect(
      errs(
        mutate((x) => {
          x.complications[0]!.screeningIntervals = [{ months: 0, citation: cite() }];
        }),
      ).some((m) => m.includes("must be positive")),
    ).toBe(true);

    const staged = mutate((x) => {
      const when = {
        id: "w",
        label: "w",
        all: [{ feature: "fpg", op: ">=" as const, value: 1, unit: "mmol/L" }],
        citation: cite(),
      };
      x.complications[0]!.staging = [
        {
          id: "s",
          display: "S",
          standard: "KDIGO",
          version: "2024",
          citation: cite(),
          stages: [
            { code: "G1", display: "G1", severity: "mild", when },
            { code: "G1", display: "dupe", severity: "mild", when },
          ],
        },
      ];
    });
    expect(errs(staged).some((m) => m.includes('duplicate stage code "G1"'))).toBe(true);
  });

  it("warns when a complication can never reach the gaps list", () => {
    const c = mutate((x) => {
      x.complications[0]!.screenedBy = [];
    });
    expect(errs(c)).toEqual([]);
    expect(
      validateCatalog(c).some((i) => i.message.includes("never appear in the gaps list")),
    ).toBe(true);
  });
});

describe("validateCatalog — borrowed risk models", () => {
  // Several widely-used CVD models are not validated in sub-Saharan African
  // populations; presenting one silently reads as a local number.
  it("warns when a risk model declares neither its validation population nor a caveat", () => {
    const c = mutate((x) => {
      x.riskModels = [
        {
          id: "cvd",
          display: "CVD risk",
          standard: "WHO",
          version: "2019",
          requires: ["fpg"],
          citation: cite(),
          bands: [
            {
              code: "high",
              display: "High",
              severity: "high",
              when: {
                id: "b",
                label: "b",
                all: [{ feature: "fpg", op: ">=", value: 7, unit: "mmol/L" }],
                citation: cite(),
              },
            },
          ],
        },
      ];
    });
    expect(errs(c)).toEqual([]);
    expect(validateCatalog(c).some((i) => i.message.includes("applicabilityNote"))).toBe(true);
  });
});
