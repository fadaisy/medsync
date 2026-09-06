import { describe, expect, it } from "vitest";

import { isVisible } from "@/app/doctor/encounters/[encounterId]/_components/ncd-capture";
import { DIABETES_CATALOG, REFERRAL_SITE } from "@/lib/ncd/catalog/diabetes";
import { effectiveGroup, recorded } from "@/lib/ncd/catalog/schema";
import { errorsOf, validateCatalog } from "@/lib/ncd/catalog/validate";
import { interpretations, ncdContext } from "@/lib/ncd/engine/assess";
import { contextOf, evaluatePredicate } from "@/lib/ncd/engine/evaluate";

const features = DIABETES_CATALOG.features;
const index = new Map(features.map((f) => [f.code, f]));
const at = (code: string) => features.find((f) => f.code === code);
const inGeneral = features.filter(
  (f) => f.section === "examination" && effectiveGroup(f, index) === "general",
);

describe("the general examination is built on ADA Table 4.1", () => {
  /**
   * Three of ADA's physical-examination rows land in this segment; the rest are
   * the vitals, or sections that are declared and not built. If one of these
   * disappears the segment has quietly stopped doing what the standard asks.
   */
  it("carries the rows the standard asks for by name", () => {
    for (const code of [
      "goitre",
      "acanthosis_nigricans",
      "lipodystrophy",
      "postural_hypotension",
    ]) {
      expect(at(code), code).toBeDefined();
      expect(at(code)!.section, code).toBe("examination");
    }
    expect(at("acanthosis_nigricans")!.citation!.quote).toContain("acanthosis nigricans");
    expect(at("goitre")!.citation!.quote).toContain("Thyroid palpation");
  });

  /** Injection sites are a question about an injection that actually happens. */
  it("asks about lipodystrophy only of someone on insulin", () => {
    const ctx = (values: Parameters<typeof ncdContext>[1]) =>
      contextOf(features, values, REFERRAL_SITE);
    expect(isVisible(at("lipodystrophy")!, ctx({}))).toBe(false);
    expect(
      isVisible(at("lipodystrophy")!, ctx({ glucose_lowering_therapy: recorded(["insulin"]) })),
    ).toBe(true);
  });

  it("cites the passage that says what the finding means", () => {
    expect(at("lipodystrophy")!.citation!.quote).toContain("erratic insulin absorption");
    expect(at("peripheral_dry_skin")!.citation!.quote).toContain("autonomic neuropathy");
    expect(at("oral_findings")!.citation!.quote).toContain("dental exam at least once per year");
  });

  /** A number in a label is still a clinical claim, and this one is unsourced. */
  it("flags the postural-drop numbers it could not source", () => {
    expect(at("postural_hypotension")!.citation!.needsCsoInput).toMatch(/NOT retrieved/);
  });

  it("keeps every field in the general segment, and the catalog valid", () => {
    expect(inGeneral.length).toBeGreaterThan(20);
    expect(errorsOf(validateCatalog(DIABETES_CATALOG))).toEqual([]);
  });
});

describe("what moved, moved whole", () => {
  /**
   * Dehydration and the ketotic fetor are physical signs and now live with the
   * other physical signs. The point of the move is that NOTHING about the
   * reasoning travelled with it: `suggests` and every predicate read a feature
   * CODE, never a section.
   */
  it("keeps dehydration pointing at the crises from its new home", () => {
    const d = at("dehydration")!;
    expect(d.section).toBe("examination");
    expect(effectiveGroup(d, index)).toBe("general");
    expect(d.suggests).toEqual(["dka", "hhs"]);
    expect(at("dehydration_signs")!.parent).toBe("dehydration");
  });

  /**
   * The fetor was a PROPERTY of Kussmaul breathing, so a patient without deep
   * sighing respiration had nowhere to record it — which is exactly the patient
   * in whom smelling it matters.
   */
  it("asks for the ketotic fetor without waiting for Kussmaul breathing", () => {
    const a = at("acetone_breath")!;
    expect(a.parent).toBeUndefined();
    expect(a.showWhen).toBeUndefined();
    expect(isVisible(a, contextOf(features, {}, REFERRAL_SITE))).toBe(true);
    // And Kussmaul is still its own danger sign, untouched.
    expect(at("deep_rapid_breathing")!.dangerSign?.severity).toBe("red");
  });
});

/**
 * THE RULE THIS SEGMENT EXISTS TO ENFORCE: a general-examination finding is
 * recorded in ONE place. Two places is a record that can disagree with itself,
 * and the disagreement surfaces at the worst possible moment — when somebody
 * reads the chart back.
 */
describe("one finding, one home", () => {
  const CONCEPTS = [
    "pallor",
    "jaundice",
    "dehydration",
    "acetone",
    "oedema",
    "acanthosis",
    "lipodystrophy",
    "lipohypertrophy",
    "goitre",
    "lymphadenopath",
    "cyanosis",
  ];

  /** Nothing outside this segment may capture one of them, as a field… */
  it("defines each general-examination finding exactly once", () => {
    const general = new Set(inGeneral.map((f) => f.code));
    for (const concept of CONCEPTS) {
      const owners = features
        .filter((f) => f.code.includes(concept) && !general.has(f.code))
        .map((f) => `${f.code} (${f.section})`);
      expect(owners, concept).toEqual([]);
    }
  });

  /** …nor smuggled back in as an option on some other field. */
  it("offers none of them as an option anywhere else", () => {
    const offenders: string[] = [];
    for (const f of features) {
      if (effectiveGroup(f, index) === "general" && f.section === "examination") continue;
      for (const o of f.options ?? []) {
        for (const concept of CONCEPTS) {
          if (o.value.includes(concept)) offenders.push(`${f.code}.${o.value}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  /** The two fields that were actually carrying duplicates. */
  it("has retired the anaemia sign list and trimmed the haemolysis one", () => {
    expect(at("anaemia_clinical_signs")).toBeUndefined();
    expect(at("haemolysis_clinical_signs")!.options!.map((o) => o.value)).toEqual([
      "dark_urine",
      "splenomegaly",
      "gallstones",
    ]);
  });

  /**
   * Conscious level stays with the crisis symptoms and is deliberately NOT
   * duplicated here — asserting it twice is how two answers end up in one
   * chart.
   */
  it("leaves conscious level where it already was", () => {
    expect(at("altered_mental_state")?.section).toBe("symptoms");
    expect(inGeneral.map((f) => f.code)).not.toContain("altered_mental_state");
  });

  /** The foot keeps its own examination; nothing here reaches into it. */
  it("records no foot lesion", () => {
    for (const f of inGeneral) {
      expect(f.display.toLowerCase(), f.code).not.toMatch(/\bfoot\b|\btoe/);
    }
    expect(at("skin_infection")!.display).toContain("not the feet");
  });
});

describe("the vitals segment is unchanged by all this", () => {
  it("still bands the measurements it always did", () => {
    const rows = interpretations(
      DIABETES_CATALOG,
      ncdContext(
        DIABETES_CATALOG,
        { pulse: recorded([{ value: 118, at: "2026-09-07T09:00:00Z" }]) },
        REFERRAL_SITE,
      ),
    );
    expect(rows.find((r) => r.feature === "pulse")!.band?.tone).toBe("intermediate");
  });

  /** The insulin gate reads a real feature, not a code that used to exist. */
  it("gates on a therapy field the catalog actually defines", () => {
    const gate = at("lipodystrophy")!.showWhen!;
    expect(index.has(gate.feature)).toBe(true);
    expect(
      evaluatePredicate(
        gate,
        contextOf(features, { glucose_lowering_therapy: recorded(["metformin"]) }, REFERRAL_SITE),
      ).state,
    ).toBe("not_met");
  });
});
