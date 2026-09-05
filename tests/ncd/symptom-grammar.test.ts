import type { Citation, Feature, NcdCatalog, SiteProfile } from "@/lib/ncd/catalog/schema";
import type { CaptureMap } from "@/lib/ncd/engine/evaluate";
import { describe, expect, it } from "vitest";

import { DIABETES_CATALOG, REFERRAL_SITE } from "@/lib/ncd/catalog/diabetes";
import { displayCondition, recorded } from "@/lib/ncd/catalog/schema";
import { errorsOf, validateCatalog } from "@/lib/ncd/catalog/validate";
import { dangerSigns, ncdContext } from "@/lib/ncd/engine/assess";
import { contextOf, evaluatePredicate } from "@/lib/ncd/engine/evaluate";
import { buildProfile } from "@/lib/ncd/profile";

const cite: Citation = {
  standard: "ADA",
  version: "2026",
  title: "t",
  url: "https://example.org",
  csoSigned: true,
};

const site: SiteProfile = { id: "s", display: "s", standardPreference: [], available: [] };

const base = (): NcdCatalog => ({
  id: "probe",
  display: "Probe",
  version: "0",
  capabilities: [],
  sections: [{ id: "sx", display: "Symptoms", order: 1 }],
  features: [
    { code: "polyuria", display: "Polyuria", kind: "symptom", valueType: "boolean", section: "sx" },
    {
      code: "nocturia",
      display: "Nocturia",
      kind: "symptom",
      valueType: "boolean",
      section: "sx",
      parent: "polyuria",
    },
  ],
  diagnosis: [],
  complications: [],
});

const errs = (c: NcdCatalog) => errorsOf(validateCatalog(c)).map((e) => e.message);

/* ── properties only exist once their finding does ───────────────────────── */

describe("parent — a property of a finding", () => {
  it("defaults its display condition to the parent being present", () => {
    const child = base().features[1]!;
    expect(displayCondition(child)).toEqual({ feature: "polyuria", op: "present" });
  });

  it("an explicit showWhen wins over the parent default", () => {
    const f: Feature = {
      code: "x",
      display: "X",
      kind: "symptom",
      valueType: "boolean",
      section: "sx",
      parent: "polyuria",
      showWhen: { feature: "polyuria", op: "absent" },
    };
    expect(displayCondition(f)).toEqual({ feature: "polyuria", op: "absent" });
  });

  it("a feature with neither is always shown", () => {
    expect(displayCondition(base().features[0]!)).toBeUndefined();
  });

  // The point of the whole mechanism: an unasked symptom raises no questions
  // about itself, and one recorded as ABSENT raises none either.
  it("shows the property only when the finding is recorded present", () => {
    const c = base();
    const cond = displayCondition(c.features[1]!)!;
    const shows = (values: CaptureMap) =>
      evaluatePredicate(cond, contextOf(c.features, values, site)).state === "met";
    expect(shows({})).toBe(false);
    expect(shows({ polyuria: recorded(false) })).toBe(false);
    expect(shows({ polyuria: recorded(true) })).toBe(true);
  });
});

describe("validateCatalog — property integrity", () => {
  it("accepts a well-formed parent relationship", () => {
    expect(errs(base())).toEqual([]);
  });

  it("rejects a property whose finding does not exist", () => {
    const c = base();
    c.features[1]!.parent = "ghost";
    expect(errs(c).some((m) => m.includes('unknown parent feature "ghost"'))).toBe(true);
  });

  it("rejects a feature that is its own parent, and a parent cycle", () => {
    const self = base();
    self.features[0]!.parent = "polyuria";
    expect(errs(self).some((m) => m.includes("its own parent"))).toBe(true);

    const cyc = base();
    cyc.features[0]!.parent = "nocturia";
    expect(errs(cyc).some((m) => m.includes("cycle"))).toBe(true);
  });

  it("warns when a property is filed in a different section from its finding", () => {
    const c = base();
    c.sections.push({ id: "other", display: "Other", order: 2 });
    c.features[1]!.section = "other";
    expect(errs(c)).toEqual([]);
    expect(validateCatalog(c).some((i) => i.message.includes("render apart from it"))).toBe(true);
  });

  it("rejects a showWhen pointing at a feature that does not exist", () => {
    const c = base();
    c.features[1]!.showWhen = { feature: "ghost", op: "present" };
    expect(errs(c).some((m) => m.includes('unknown feature "ghost"'))).toBe(true);
  });
});

/* ── danger signs ────────────────────────────────────────────────────────── */

describe("danger signs", () => {
  const withDanger = (): NcdCatalog => {
    const c = base();
    c.features.push({
      code: "vomiting",
      display: "Vomiting",
      kind: "symptom",
      valueType: "boolean",
      section: "sx",
      dangerSign: { severity: "red", action: "Assess for ketoacidosis now.", citation: cite },
    });
    c.features.push({
      code: "blurred_vision",
      display: "Blurred vision",
      kind: "symptom",
      valueType: "boolean",
      section: "sx",
      dangerSign: { severity: "amber", action: "Arrange same-day eye review.", citation: cite },
    });
    return c;
  };
  const fired = (values: CaptureMap) => {
    const c = withDanger();
    return dangerSigns(c, ncdContext(c, values, site)).map((d) => d.feature);
  };

  it("fires on a recorded positive only", () => {
    expect(fired({ vomiting: recorded(true) })).toEqual(["vomiting"]);
    expect(fired({ vomiting: recorded(false) })).toEqual([]);
    expect(fired({})).toEqual([]);
  });

  it("puts the emergencies first", () => {
    expect(fired({ vomiting: recorded(true), blurred_vision: recorded(true) })).toEqual([
      "vomiting",
      "blurred_vision",
    ]);
  });

  it("carries the guideline's own action and its citation", () => {
    const c = withDanger();
    const d = dangerSigns(c, ncdContext(c, { vomiting: recorded(true) }, site))[0]!;
    expect(d.action).toBe("Assess for ketoacidosis now.");
    expect(d.citation.standard).toBe("ADA");
    expect(d.severity).toBe("red");
  });

  // A warning with nothing to do is noise, and noise is what gets a real warning
  // ignored later.
  it("rejects a danger sign with no action", () => {
    const c = withDanger();
    c.features[2]!.dangerSign!.action = "  ";
    expect(errs(c).some((m) => m.includes("warning with nothing to do"))).toBe(true);
  });

  it("requires provenance like every other clinical assertion", () => {
    const c = withDanger();
    // @ts-expect-error deliberately removing a required field
    delete c.features[2]!.dangerSign!.citation;
    expect(errs(c)).toContain("missing citation");
  });
});

/* ── a symptom points at a complication, without asserting it ────────────── */

describe("suggests — prompted gaps", () => {
  const withSuggest = (): NcdCatalog => {
    const c = base();
    c.features.push({
      code: "burning_feet",
      display: "Burning feet",
      kind: "symptom",
      valueType: "boolean",
      section: "sx",
      suggests: ["foot"],
    });
    c.features.push({
      code: "monofilament",
      display: "Monofilament test",
      kind: "sign",
      valueType: "boolean",
      section: "sx",
    });
    c.complications.push({
      code: "foot",
      display: "Diabetes-related foot disease",
      timing: "chronic",
      citation: cite,
      screenedBy: ["monofilament"],
      establishedBy: [
        {
          id: "e",
          label: "e",
          all: [{ feature: "monofilament", op: "present" }],
          citation: cite,
        },
      ],
    });
    return c;
  };

  const gapsFor = (values: CaptureMap) => {
    const c = withSuggest();
    const p = buildProfile({ catalog: c, values, site });
    return p.gaps;
  };

  it("attaches the reason when the symptom is present", () => {
    const g = gapsFor({ burning_feet: recorded(true) }).find((x) => x.feature === "monofilament")!;
    expect(g.promptedBy).toEqual(["Burning feet"]);
  });

  it("attaches nothing when the symptom is absent or unasked", () => {
    for (const values of [{}, { burning_feet: recorded(false) }]) {
      const g = gapsFor(values).find((x) => x.feature === "monofilament")!;
      expect(g.promptedBy).toBeUndefined();
    }
  });

  // The link is weak on purpose: a symptom raises the priority of screening,
  // it never establishes the complication.
  it("does not make the complication present", () => {
    const c = withSuggest();
    const p = buildProfile({ catalog: c, values: { burning_feet: recorded(true) }, site });
    expect(p.complications.find((x) => x.code === "foot")!.state).not.toBe("met");
  });

  it("puts prompted gaps ahead of unprompted ones", () => {
    const c = withSuggest();
    c.features.push({
      code: "other_screen",
      display: "Other screen",
      kind: "sign",
      valueType: "boolean",
      section: "sx",
    });
    c.complications[0]!.screenedBy = ["other_screen", "monofilament"];
    const p = buildProfile({ catalog: c, values: { burning_feet: recorded(true) }, site });
    expect(p.gaps[0]!.promptedBy?.length).toBeTruthy();
  });

  it("rejects a pointer at a complication that does not exist", () => {
    const c = withSuggest();
    c.features[2]!.suggests = ["ghost"];
    expect(errs(c).some((m) => m.includes('suggests unknown complication "ghost"'))).toBe(true);
  });
});

/* ── against the real catalog ────────────────────────────────────────────── */

describe("the diabetes catalog uses the grammar correctly", () => {
  it("still validates", () => {
    expect(errorsOf(validateCatalog(DIABETES_CATALOG))).toEqual([]);
  });

  it("leads with ADA's three classic symptoms, which diagnosis.ts reads", () => {
    const codes = DIABETES_CATALOG.features.map((f) => f.code);
    for (const c of ["polyuria", "polydipsia", "unexplained_weight_loss"]) {
      expect(codes, c).toContain(c);
    }
    // The trio is not decoration: it is the symptom requirement for the
    // single-sample random-glucose route.
    const who = DIABETES_CATALOG.diagnosis.find((d) => d.id === "who_2019")!;
    const single = who.anyOf.find((x) => x.id === "who_random_symptomatic")!;
    expect(single.any!.map((p) => p.feature).sort()).toEqual([
      "polydipsia",
      "polyuria",
      "unexplained_weight_loss",
    ]);
  });

  it("keeps the symptoms section short until symptoms are actually present", () => {
    const sx = DIABETES_CATALOG.features.filter((f) => f.section === "symptoms");
    const top = sx.filter((f) => !f.parent);
    // Two-thirds of the section is properties that only appear on demand.
    expect(top.length).toBeLessThan(sx.length / 1.5);
    for (const f of sx) {
      if (!f.parent) continue;
      expect(displayCondition(f), f.code).toEqual({ feature: f.parent, op: "present" });
    }
  });

  /**
   * The audit's correction, pinned. Vomiting alone is gastroenteritis; a tool
   * that calls it an emergency teaches people to dismiss the flag that matters.
   */
  it("does not cry wolf: vomiting alone raises nothing", () => {
    const fire = (values: CaptureMap) =>
      dangerSigns(DIABETES_CATALOG, ncdContext(DIABETES_CATALOG, values, REFERRAL_SITE)).map(
        (d) => d.feature,
      );

    expect(fire({ vomiting: recorded(true) })).toEqual([]);
    expect(fire({ abdominal_pain: recorded(true) })).toEqual([]);

    // …but with osmotic symptoms, or in known diabetes, it is an emergency.
    expect(fire({ vomiting: recorded(true), polyuria: recorded(true) })).toContain("vomiting");
    expect(fire({ vomiting: recorded(true), dm_status: recorded("known") })).toContain("vomiting");
  });

  // Kussmaul is not an everyday finding, so it is deliberately NOT gated.
  it("keeps the ungated reds for findings that are never routine", () => {
    const fire = (values: CaptureMap) =>
      dangerSigns(DIABETES_CATALOG, ncdContext(DIABETES_CATALOG, values, REFERRAL_SITE)).map(
        (d) => d.feature,
      );
    expect(fire({ deep_rapid_breathing: recorded(true) })).toEqual(["deep_rapid_breathing"]);
    expect(fire({ altered_mental_state: recorded(true) })).toEqual(["altered_mental_state"]);
  });

  it("raises the crisis features as red danger signs, and nothing routine", () => {
    const danger = DIABETES_CATALOG.features.filter((f) => f.dangerSign);
    const red = danger.filter((f) => f.dangerSign!.severity === "red").map((f) => f.code);
    expect(red.sort()).toEqual([
      "abdominal_pain",
      "altered_mental_state",
      "deep_rapid_breathing",
      "vomiting",
    ]);
    // Short enough that every item is taken seriously.
    expect(danger.length).toBeLessThanOrEqual(6);
    for (const f of danger) expect(f.dangerSign!.action.trim().length, f.code).toBeGreaterThan(20);
  });

  it("asks for an insulin regimen only once insulin is selected", () => {
    const f = DIABETES_CATALOG.features.find((x) => x.code === "insulin_regimen_pattern")!;
    const cond = displayCondition(f)!;
    const shows = (values: CaptureMap) =>
      evaluatePredicate(cond, contextOf(DIABETES_CATALOG.features, values, site)).state === "met";
    expect(shows({})).toBe(false);
    expect(shows({ glucose_lowering_therapy: recorded([{ option: "metformin" }]) })).toBe(false);
    expect(shows({ glucose_lowering_therapy: recorded([{ option: "insulin" }]) })).toBe(true);
    expect(
      shows({
        glucose_lowering_therapy: recorded([
          { option: "metformin", detail: "1 g bd" },
          { option: "insulin", detail: "20 u nocte" },
        ]),
      }),
    ).toBe(true);
  });
});
