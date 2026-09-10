import { describe, expect, it } from "vitest";

import {
  GROUP_ICONS,
  isVisible,
} from "@/app/doctor/encounters/[encounterId]/_components/ncd-capture";
import { DIABETES_CATALOG, REFERRAL_SITE } from "@/lib/ncd/catalog/diabetes";
import { effectiveGroup, recorded } from "@/lib/ncd/catalog/schema";
import { errorsOf, validateCatalog } from "@/lib/ncd/catalog/validate";
import { interpretations, ncdContext } from "@/lib/ncd/engine/assess";
import { contextOf, evaluatePredicate } from "@/lib/ncd/engine/evaluate";

const features = DIABETES_CATALOG.features;
const index = new Map(features.map((f) => [f.code, f]));
const at = (code: string) => features.find((f) => f.code === code);
/**
 * The general examination is now a segment with REGIONS inside it, so "is this
 * field in the general examination" is a question about the group's parent, not
 * about the group. Resolved here the way the surface resolves it.
 */
const examSection = DIABETES_CATALOG.sections.find((s) => s.id === "examination")!;
const parentOf = new Map((examSection.groups ?? []).map((g) => [g.id, g.parent]));
const segmentOf = (code: string) => {
  const f = index.get(code);
  if (!f) return undefined;
  const g = effectiveGroup(f, index);
  return g === undefined ? undefined : (parentOf.get(g) ?? g);
};
const inGeneral = features.filter(
  (f) => f.section === "examination" && segmentOf(f.code) === "general",
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

  /**
   * The regions are the order the examination is performed in, and each one has
   * to hold something — a band over nothing is a heading the eye stops at for
   * no reason.
   */
  it("files every finding into a region, and leaves no region empty", () => {
    const regions = (examSection.groups ?? []).filter((g) => g.parent === "general");
    expect(regions.map((g) => g.id)).toEqual([
      "gx_survey",
      "gx_colour",
      "gx_hands",
      "gx_head_neck",
      "gx_skin",
      "gx_legs",
      "gx_injection",
    ]);
    for (const r of regions) {
      expect(features.filter((f) => f.group === r.id).length, r.id).toBeGreaterThan(0);
    }
    // Nothing sits directly on the segment: every finding belongs to a region.
    expect(features.filter((f) => f.group === "general")).toEqual([]);
  });

  /** Groups nest one level. A region inside a region is a section split wrong. */
  it("nests groups exactly one level deep", () => {
    for (const g of examSection.groups ?? []) {
      if (!g.parent) continue;
      expect(parentOf.get(g.parent), g.id).toBeUndefined();
    }
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
    expect(effectiveGroup(d, index)).toBe("gx_survey");
    expect(segmentOf("dehydration")).toBe("general");
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

  /**
   * Findings that share a WORD with one of the concepts and are a different
   * thing entirely. Named individually rather than loosening the match, because
   * the substring match is what gives this test its teeth: every future
   * collision has to be looked at by a person and justified here.
   *
   * `cerebral_oedema_late_signs` — cerebral oedema in DKA. Nothing to do with
   *   the peripheral oedema graded in the general examination, and papilloedema
   *   is one of its signs.
   * `ischaemic_foot_signs.elevation_pallor` — Buerger's test. Pallor of a foot
   *   on elevation is a vascular sign of the limb, not the conjunctival pallor
   *   of anaemia.
   */
  const DISTINCT = new Set(["cerebral_oedema_late_signs", "ischaemic_foot_signs"]);

  /** Nothing outside this segment may capture one of them, as a field… */
  it("defines each general-examination finding exactly once", () => {
    const general = new Set(inGeneral.map((f) => f.code));
    for (const concept of CONCEPTS) {
      const owners = features
        .filter((f) => f.code.includes(concept) && !general.has(f.code) && !DISTINCT.has(f.code))
        .map((f) => `${f.code} (${f.section})`);
      expect(owners, concept).toEqual([]);
    }
  });

  /** …nor smuggled back in as an option on some other field. */
  it("offers none of them as an option anywhere else", () => {
    const offenders: string[] = [];
    for (const f of features) {
      if (f.section === "examination" && segmentOf(f.code) === "general") continue;
      if (DISTINCT.has(f.code)) continue;
      for (const o of f.options ?? []) {
        for (const concept of CONCEPTS) {
          if (o.value.includes(concept)) offenders.push(`${f.code}.${o.value}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  /** The two fields that were actually carrying duplicates. */
  /**
   * BOTH conventional scales, side by side, because they measure different
   * things: how saturated the tissue is, and how much of the patient is wet.
   * A 4+ pit at the ankles and a 1+ pit reaching the sacrum are not the same
   * illness, and either scale alone would have to throw that away.
   */
  it("grades the oedema on both scales, and merges neither into the other", () => {
    expect(at("oedema_pitting")).toBeUndefined();

    const pit = at("oedema_grade")!;
    expect(pit.parent).toBe("peripheral_oedema");
    expect(pit.options!.map((o) => o.value)).toEqual([
      "non_pitting",
      "grade_1",
      "grade_2",
      "grade_3",
      "grade_4",
    ]);

    const extent = at("oedema_distribution")!;
    expect(extent.parent).toBe("peripheral_oedema");
    expect(extent.options!.map((o) => o.value)).toEqual([
      "feet_ankles",
      "mid_calf",
      "knee_or_above",
      "sacral",
      "generalised",
    ]);
    // Two scales, two citations — neither borrows the other's provenance.
    expect(extent.citation).not.toBe(pit.citation);
  });

  /**
   * Neither scale is a guideline position and the record has to say so. The
   * authoritative reference for peripheral oedema grades it not at all, and the
   * scales in circulation disagree at the margins.
   */
  it("says out loud that no guideline states either scale", () => {
    // The rebound times genuinely differ between texts, rather than one being
    // picked and presented as the scale.
    expect(at("oedema_grade")!.citation!.needsCsoInput).toMatch(/REBOUND TIMES are not/);
    expect(at("oedema_distribution")!.citation!.needsCsoInput).toMatch(
      /NO GUIDELINE STATING EITHER SCALE WAS RETRIEVED/,
    );
    for (const code of ["oedema_grade", "oedema_distribution"]) {
      expect(at(code)!.citation!.csoSigned, code).toBe(false);
    }
  });

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

/**
 * A band with no icon is a band that looks broken next to five that have one.
 * The catalog names icons as STRINGS so it stays a data file, which means
 * nothing type-checks the name — only this does.
 */
describe("every group names an icon the surface can resolve", () => {
  it("resolves each icon in the examination section", () => {
    for (const g of examSection.groups ?? []) {
      if (!g.icon) continue;
      expect(GROUP_ICONS[g.icon], `${g.id} → ${g.icon}`).toBeDefined();
    }
  });

  it("resolves every icon named anywhere in the catalog", () => {
    for (const s of DIABETES_CATALOG.sections) {
      for (const g of s.groups ?? []) {
        if (!g.icon) continue;
        expect(GROUP_ICONS[g.icon], `${s.id}.${g.id} → ${g.icon}`).toBeDefined();
      }
    }
  });
});
