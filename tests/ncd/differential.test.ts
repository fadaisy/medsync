/**
 * The discrimination layer's SEMANTICS, pinned against a synthetic catalog.
 *
 * Deliberately not the diabetes catalog. What is under test here is the engine's
 * behaviour — that absence counts, that the order is deterministic, that a
 * sparse clerking cannot look confident — and testing that through real clinical
 * content would make every threshold change a failing engine test. The clinical
 * content has its own vignettes.
 */
import type { NcdCatalog, SiteProfile } from "@/lib/ncd/catalog/schema";
import type { CaptureMap } from "@/lib/ncd/engine/evaluate";
import { describe, expect, it } from "vitest";

import { recorded, unavailable } from "@/lib/ncd/catalog/schema";
import { rankDifferential } from "@/lib/ncd/engine/differential";
import { contextOf } from "@/lib/ncd/engine/evaluate";

const cite = {
  standard: "local" as const,
  version: "test",
  title: "test fixture",
  csoSigned: false,
  needsCsoInput: "fixture, not clinical content",
};

const SITE: SiteProfile = {
  id: "test",
  display: "Test site",
  standardPreference: ["ADA"],
  available: ["lab.thing"],
};

const POOR_SITE: SiteProfile = { ...SITE, id: "poor", available: [] };

const CATALOG: NcdCatalog = {
  id: "fixture",
  display: "Fixture",
  version: "0.0.0",
  capabilities: [{ code: "lab.thing", display: "The thing", tier: "basic_lab" }],
  sections: [{ id: "examination", display: "Examination", order: 1 }],
  features: [
    {
      code: "sign_a",
      display: "Sign A",
      kind: "sign",
      valueType: "boolean",
      section: "examination",
      discriminates: [
        {
          condition: "alpha",
          direction: "supports",
          strength: "strong",
          rationale: "A supports alpha.",
          citation: cite,
        },
        {
          condition: "beta",
          direction: "refutes",
          strength: "moderate",
          rationale: "A argues against beta.",
          citation: cite,
        },
      ],
      importantNegative: {
        absenceRefutes: ["alpha"],
        caveat: "Absent early; does not exclude mild disease.",
        citation: cite,
      },
    },
    {
      code: "sign_b",
      display: "Sign B",
      kind: "sign",
      valueType: "boolean",
      section: "examination",
      discriminates: [
        {
          condition: "beta",
          direction: "supports",
          strength: "weak",
          rationale: "B weakly supports beta.",
          citation: cite,
        },
      ],
    },
    {
      code: "sign_c",
      display: "Sign C",
      kind: "sign",
      valueType: "boolean",
      section: "examination",
      elicitation: "Look at the thing for 60 s.",
      discriminates: [
        {
          condition: "alpha",
          direction: "supports",
          strength: "strong",
          rationale: "C strongly supports alpha.",
          citation: cite,
        },
      ],
    },
    {
      code: "sign_d",
      display: "Sign D",
      kind: "sign",
      valueType: "boolean",
      section: "examination",
      requires: "lab.thing",
      discriminates: [
        {
          condition: "beta",
          direction: "supports",
          strength: "strong",
          rationale: "D supports beta but needs the lab.",
          citation: cite,
        },
      ],
    },
    {
      code: "teen_only",
      display: "Adolescent-only sign",
      kind: "sign",
      valueType: "boolean",
      section: "examination",
      ageBands: ["adolescent"],
      discriminates: [
        {
          condition: "gamma",
          direction: "supports",
          strength: "strong",
          rationale: "Only meaningful in adolescents.",
          citation: cite,
        },
      ],
    },
    {
      code: "number_x",
      display: "Number X",
      kind: "measurement",
      valueType: "number",
      unit: "mmol/L",
      section: "examination",
      refRange: { low: 4, high: 7 },
      ageRefRanges: [{ band: "older_adult", low: 5, high: 9, citation: cite }],
    },
  ],
  diagnosis: [],
  complications: [],
  conditions: [
    { code: "alpha", display: "Alpha", citation: cite },
    { code: "beta", display: "Beta", citation: cite },
    { code: "gamma", display: "Gamma", ageBands: ["adolescent"], citation: cite },
  ],
  rules: [
    {
      id: "alpha_combination",
      display: "Alpha combination",
      condition: "alpha",
      when: {
        id: "alpha_when",
        label: "X above 20 with sign A",
        all: [
          { feature: "number_x", op: ">=", value: 20, unit: "mmol/L" },
          { feature: "sign_a", op: "present" },
        ],
        citation: cite,
      },
      posterior: "high",
      urgency: "immediate",
      confirmWith: ["sign_c", "number_x"],
      mimicsToExclude: ["Something else entirely"],
      rulesOut: ["beta"],
      notes: "Alpha can occur with a normal X in some contexts.",
      citation: cite,
    },
  ],
};

const ctxOf = (
  values: CaptureMap,
  site = SITE,
  ageBand?: "adolescent" | "adult" | "older_adult",
) => ({
  ...contextOf(CATALOG.features, values, site),
  ageBand,
});

const rank = (values: CaptureMap, site = SITE, ageBand?: "adolescent" | "adult" | "older_adult") =>
  rankDifferential(CATALOG, ctxOf(values, site, ageBand));

describe("ranking is ordinal and fully traced", () => {
  it("orders by accumulated support and names the findings that did it", () => {
    const r = rank({ sign_a: recorded(true), sign_c: recorded(true), sign_b: recorded(true) });
    expect(r.conditions[0]!.code).toBe("alpha");
    expect(r.conditions[0]!.supporting.map((e) => e.feature)).toEqual(["sign_a", "sign_c"]);
  });

  it("carries refuting evidence too — the half a one-directional link cannot express", () => {
    const r = rank({ sign_a: recorded(true), sign_b: recorded(true) });
    const beta = r.conditions.find((c) => c.code === "beta")!;
    expect(beta.refuting.map((e) => e.feature)).toContain("sign_a");
    expect(beta.supporting.map((e) => e.feature)).toContain("sign_b");
  });

  it("never emits a condition without the evidence that raised it", () => {
    const r = rank({ sign_a: recorded(true), sign_c: recorded(true) });
    for (const c of r.conditions) {
      expect(c.supporting.length + c.refuting.length + c.firedRules.length).toBeGreaterThan(0);
    }
  });

  it("is deterministic — same values, same order, every time", () => {
    const values = { sign_a: recorded(true), sign_b: recorded(true), sign_c: recorded(true) };
    const once = rank(values).conditions.map((c) => `${c.code}:${c.score}`);
    for (let i = 0; i < 5; i++) {
      expect(rank(values).conditions.map((c) => `${c.code}:${c.score}`)).toEqual(once);
    }
  });

  it("a single strong finding outranks an accumulation of weak ones", () => {
    // The failure mode of every additive score: four incidental findings
    // out-shouting one decisive sign. The doubling ladder is what prevents it.
    const r = rank({ sign_c: recorded(true), sign_b: recorded(true) });
    const alpha = r.conditions.find((c) => c.code === "alpha")!;
    const beta = r.conditions.find((c) => c.code === "beta")!;
    expect(alpha.score).toBeGreaterThan(beta.score);
  });
});

describe("absence is evidence, and silence is not", () => {
  it("a RECORDED negative refutes, and says it came from an absence", () => {
    const r = rank({ sign_a: recorded(false) });
    const alpha = r.conditions.find((c) => c.code === "alpha")!;
    expect(alpha.refuting[0]!.viaAbsence).toBe(true);
    expect(alpha.score).toBeLessThan(0);
  });

  it("carries the caveat verbatim, so 'absent' cannot over-read", () => {
    const r = rank({ sign_a: recorded(false) });
    const alpha = r.conditions.find((c) => c.code === "alpha")!;
    expect(alpha.refuting[0]!.rationale).toContain("does not exclude mild disease");
  });

  it("an UNASSESSED finding refutes nothing at all", () => {
    expect(rank({}).conditions).toHaveLength(0);
  });

  it("an UNAVAILABLE finding refutes nothing either", () => {
    expect(rank({ sign_a: unavailable("lab.thing") }).conditions).toHaveLength(0);
  });
});

describe("rules are combinations, and they carry their own escape hatches", () => {
  it("fires only when the whole criterion is met", () => {
    const near = rank({ number_x: recorded(21) });
    expect(near.conditions.find((c) => c.code === "alpha")?.firedRules ?? []).toHaveLength(0);

    const r = rank({ number_x: recorded(21), sign_a: recorded(true) });
    const alpha = r.conditions.find((c) => c.code === "alpha")!;
    expect(alpha.firedRules.map((f) => f.id)).toEqual(["alpha_combination"]);
    expect(alpha.posterior).toBe("high");
    expect(alpha.urgency).toBe("immediate");
  });

  it("surfaces the confirmatory set and the mimics — never a bare verdict", () => {
    const r = rank({ number_x: recorded(21), sign_a: recorded(true) });
    const alpha = r.conditions.find((c) => c.code === "alpha")!;
    expect(alpha.confirmWith).toEqual(["sign_c", "number_x"]);
    expect(alpha.mimicsToExclude).toEqual(["Something else entirely"]);
    expect(alpha.firedRules[0]!.notes).toContain("normal X");
  });

  it("a fired rule argues against what it rules out", () => {
    const r = rank({ number_x: recorded(21), sign_a: recorded(true), sign_b: recorded(true) });
    const beta = r.conditions.find((c) => c.code === "beta")!;
    expect(beta.refuting.map((e) => e.feature)).toContain("alpha_combination");
    expect(r.conditions[0]!.code).toBe("alpha");
  });

  it("exposes the evidence trail of the criterion that fired it", () => {
    const r = rank({ number_x: recorded(21), sign_a: recorded(true) });
    const via = r.conditions.find((c) => c.code === "alpha")!.firedRules[0]!.via;
    expect(via.state).toBe("met");
    expect(via.predicates.map((p) => p.predicate.feature)).toEqual(["number_x", "sign_a"]);
  });
});

describe("confidence is a separate axis from rank", () => {
  it("sparse findings return LOW confidence and ask for more, however clear the order", () => {
    const r = rank({ sign_c: recorded(true) });
    expect(r.conditions[0]!.code).toBe("alpha"); // the order is unambiguous...
    expect(r.confidence).toBe("low"); // ...and still not enough to act on
    expect(r.confidenceReason).toMatch(/record more|provisional/i);
  });

  it("a fired combination plus a real examination reaches HIGH", () => {
    const r = rank({
      number_x: recorded(21),
      sign_a: recorded(true),
      sign_b: recorded(true),
      sign_c: recorded(true),
    });
    expect(r.confidence).toBe("high");
  });

  it("counts only what this site could actually have done", () => {
    // sign_d needs a lab the poor site does not have, so it must not enlarge the
    // denominator — a site that cannot run a test is not a clinician who failed to.
    expect(rank({}, POOR_SITE).answered.applicable).toBeLessThan(rank({}).answered.applicable);
  });
});

describe("what to check next", () => {
  it("names an unexamined finding, with how to elicit it", () => {
    const r = rank({ sign_a: recorded(true) });
    const next = r.checkNext.find((c) => c.feature === "sign_c")!;
    expect(next).toBeDefined();
    expect(next.elicitation).toBe("Look at the thing for 60 s.");
    expect(next.because).toContain("strongly supports alpha");
  });

  it("never suggests something already recorded", () => {
    const r = rank({ sign_a: recorded(true), sign_c: recorded(true) });
    expect(r.checkNext.map((c) => c.feature)).not.toContain("sign_c");
  });

  it("never suggests something this site cannot do", () => {
    const r = rank({ sign_a: recorded(true) }, POOR_SITE);
    expect(r.checkNext.map((c) => c.feature)).not.toContain("sign_d");
  });

  it("offers at most two — a bedside prompt, not a worklist", () => {
    expect(rank({}).checkNext.length).toBeLessThanOrEqual(2);
  });
});

describe("age scoping", () => {
  it("an unknown band leaves everything in scope rather than guessing", () => {
    const r = rank({ teen_only: recorded(true) });
    expect(r.conditions.map((c) => c.code)).toContain("gamma");
  });

  it("an out-of-band finding cannot raise its condition", () => {
    const r = rank({ teen_only: recorded(true) }, SITE, "older_adult");
    expect(r.conditions.map((c) => c.code)).not.toContain("gamma");
  });
});

describe("the layer is opt-in", () => {
  it("a catalog with no conditions returns an honest empty result, not an empty ranking", () => {
    const bare: NcdCatalog = { ...CATALOG, conditions: undefined, rules: undefined };
    const r = rankDifferential(bare, ctxOf({ sign_a: recorded(true) }));
    expect(r.conditions).toEqual([]);
    expect(r.confidence).toBe("low");
    expect(r.confidenceReason).toContain("does not define a differential layer");
  });
});

/**
 * The ranking must run on a low-end Android at a bedside with no signal
 * (ADR 0083). That is a property of the module's dependencies, not of its
 * output, so it is checked where it can actually be enforced: at the imports.
 */
describe("it runs on-device, with no model call and no I/O", () => {
  const SOURCES = [
    "lib/ncd/engine/differential.ts",
    "lib/ncd/engine/evaluate.ts",
    "lib/ncd/catalog/schema.ts",
    "lib/ncd/age.ts",
  ];

  const importsOf = (src: string) => [...src.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]!);

  it("imports nothing that reaches the network, a model, or the database", async () => {
    const { readFile } = await import("node:fs/promises");
    for (const path of SOURCES) {
      const src = await readFile(path, "utf8");
      for (const spec of importsOf(src)) {
        expect(spec, `${path} imports ${spec}, which would break bedside offline use`).not.toMatch(
          /server-only|@\/db|anthropic|openai|node:(http|https|net)|axios|\/api\//,
        );
      }
      expect(src, `${path} calls fetch()`).not.toMatch(/\bfetch\s*\(/);
    }
  });

  it("is a pure function of its inputs — the same catalog and values, always the same result", () => {
    const values = { sign_a: recorded(true), number_x: recorded(21) };
    expect(JSON.stringify(rank(values))).toEqual(JSON.stringify(rank(values)));
  });
});
