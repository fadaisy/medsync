/**
 * Acceptance vignettes for the examination discrimination layer (ADR 0083).
 *
 * The artefact a Clinical Safety Officer reviews INSTEAD of reading the engine:
 * a synthetic patient in, an expected ordering out. If an expectation here is
 * clinically wrong, the CATALOG is wrong — and the argument can then be had in
 * clinical language rather than in TypeScript.
 *
 * These assert the ORDER and the ACTIONS, never a score. The score is an
 * ordering integer and asserting on it would pin an implementation detail that
 * the ADR explicitly reserves the right to change.
 */
import type { AgeBand } from "@/lib/ncd/catalog/schema";
import type { CaptureMap } from "@/lib/ncd/engine/evaluate";
import { describe, expect, it } from "vitest";

import { DIABETES_CATALOG, DISTRICT_SITE, REFERRAL_SITE } from "@/lib/ncd/catalog/diabetes";
import { recorded } from "@/lib/ncd/catalog/schema";
import { buildProfile } from "@/lib/ncd/profile";

const profile = (
  values: CaptureMap,
  opts: { ageBand?: AgeBand; district?: boolean; established?: boolean } = {},
) =>
  buildProfile({
    catalog: DIABETES_CATALOG,
    values,
    site: opts.district ? DISTRICT_SITE : REFERRAL_SITE,
    established: opts.established,
    ageBand: opts.ageBand,
  });

/** Position of a condition in the ranking, or -1. */
const rankOf = (p: ReturnType<typeof profile>, code: string) =>
  p.differential.conditions.findIndex((c) => c.code === code);

const top = (p: ReturnType<typeof profile>) => p.differential.conditions[0];
const find = (p: ReturnType<typeof profile>, code: string) =>
  p.differential.conditions.find((c) => c.code === code);

/* ── 1. the child in DKA at first presentation ───────────────────────────── */

/**
 * The spec's first vignette is a NINE-YEAR-OLD, and paediatric capture is
 * deliberately deferred (ADR 0083): only `adolescent`, `adult` and `older_adult`
 * are populated. Written and skipped rather than quietly dropped, so the gap is
 * visible in the test output and this file states what would close it — the
 * child/infant/neonate bands, ISPAD/BSPED paediatric thresholds, paediatric BP
 * percentiles and BMI-for-age.
 */
describe.skip("vignette 1 — child, 9 years, three days of polyuria, RR 34, Kussmaul, drowsy", () => {
  it("DEFERRED: paediatric capture is out of scope for this increment", () => {
    expect(true).toBe(true);
  });
});

/** The same presentation one life stage up, which IS in scope. */
describe("vignette 1b — adolescent, polyuria and weight loss, RR 34, Kussmaul, drowsy, glucose 27", () => {
  const p = profile(
    {
      dm_status: recorded("suspected"),
      capillary_glucose: recorded(27.0),
      respiratory_rate: recorded([{ value: 34, at: "2026-09-08T09:00:00Z" }]),
      pulse: recorded([{ value: 128, at: "2026-09-08T09:00:00Z" }]),
      deep_rapid_breathing: recorded(true),
      acetone_breath: recorded(true),
      dehydration: recorded(true),
      altered_mental_state: recorded(true),
      unexplained_weight_loss: recorded(true),
    },
    { ageBand: "adolescent" },
  );

  it("surfaces ketoacidosis as the leading consideration", () => {
    expect(top(p)!.code).toMatch(/dka/);
  });

  it("carries immediate urgency", () => {
    expect(top(p)!.urgency).toBe("immediate");
  });

  it("names the findings that drove it — traceable to codes, not prose", () => {
    const codes = top(p)!.supporting.map((e) => e.feature);
    expect(codes).toContain("deep_rapid_breathing");
    expect(codes).toContain("acetone_breath");
  });

  it("asks for the confirmatory tests rather than asserting the diagnosis", () => {
    const dka = p.differential.conditions.find((c) => c.code.includes("dka"))!;
    expect(dka.confirmWith.length).toBeGreaterThan(0);
  });

  it("names the mimics that must be excluded first", () => {
    const dka = p.differential.conditions.find((c) => c.code.includes("dka"))!;
    expect(dka.mimicsToExclude.length).toBeGreaterThan(0);
  });
});

/* ── 2. euglycaemic DKA ──────────────────────────────────────────────────── */

describe("vignette 2 — adult on an SGLT2 inhibitor, vomiting and tachypnoeic, glucose 9", () => {
  const p = profile(
    {
      dm_status: recorded("known"),
      glucose_lowering_therapy: recorded([{ option: "sglt2" }]),
      capillary_glucose: recorded(9.0),
      vomiting: recorded(true),
      deep_rapid_breathing: recorded(true),
      acetone_breath: recorded(true),
      bohb: recorded(4.1),
    },
    { ageBand: "adult" },
  );

  it("still surfaces ketoacidosis despite a near-normal glucose", () => {
    const hit = p.differential.conditions.find((c) => c.code.includes("dka"));
    expect(hit, "no ketoacidosis surfaced at glucose 9").toBeDefined();
  });

  it("says out loud that a normal glucose does not exclude DKA in this context", () => {
    // Wherever the surface says it — the rule's heading or its caveat. What
    // matters is that the clinician reading the panel is told, not which field
    // the sentence happens to live in.
    const said = p.differential.conditions
      .flatMap((c) => c.firedRules.map((r) => `${r.display} ${r.notes ?? ""}`))
      .join(" ")
      .toLowerCase();
    expect(said).toMatch(/euglyca|normal glucose|does not exclude/);
  });
});

/* ── 3. HHS in the older adult ───────────────────────────────────────────── */

describe("vignette 3 — 78 years, profoundly dehydrated, confused, glucose 41, no Kussmaul", () => {
  const p = profile(
    {
      dm_status: recorded("known"),
      random_pg: recorded(41.0),
      effective_osmolality: recorded(322),
      dehydration: recorded(true),
      disorientation: recorded(true),
      altered_mental_state: recorded(true),
      deep_rapid_breathing: recorded(false),
      acetone_breath: recorded(false),
      bohb: recorded(0.8),
    },
    { ageBand: "older_adult" },
  );

  it("ranks HHS above DKA", () => {
    const hhs = rankOf(p, "hhs");
    const dka = rankOf(p, "dka");
    expect(hhs, "HHS did not appear at all").toBeGreaterThanOrEqual(0);
    expect(hhs).toBeLessThan(dka === -1 ? Number.MAX_SAFE_INTEGER : dka);
  });

  it("uses the RECORDED ABSENCE of Kussmaul as evidence against severe ketoacidosis", () => {
    const severe = find(p, "severe_dka");
    expect(severe?.refuting.some((e) => e.feature === "deep_rapid_breathing" && e.viaAbsence)).toBe(
      true,
    );
  });

  it("qualifies that absence rather than over-reading it", () => {
    const ev = find(p, "severe_dka")!.refuting.find((e) => e.feature === "deep_rapid_breathing")!;
    expect(ev.rationale.toLowerCase()).toMatch(/never excludes|mild|early/);
  });
});

/* ── 4. the infected foot ────────────────────────────────────────────────── */

describe("vignette 4 — plantar ulcer, absent pulses, fever, tachycardia", () => {
  const p = profile(
    {
      dm_status: recorded("known"),
      active_foot_ulcer: recorded(true),
      ulcer_depth: recorded("muscle_or_tendon"),
      foot_infection_grade: recorded("severe"),
      pedal_pulses: recorded("absent"),
      pad: recorded("present"),
      temperature: recorded([{ value: 38.6, at: "2026-09-08T09:00:00Z" }]),
      pulse: recorded([{ value: 118, at: "2026-09-08T09:00:00Z" }]),
    },
    { ageBand: "adult" },
  );

  it("surfaces a foot infection", () => {
    const hit = p.differential.conditions.find((c) => c.code.startsWith("diabetic_foot"));
    expect(hit, "no foot condition surfaced").toBeDefined();
  });

  it("treats it as urgent or worse", () => {
    const hit = p.differential.conditions.find((c) => c.code.startsWith("diabetic_foot"))!;
    expect(["urgent", "immediate"]).toContain(hit.urgency);
  });

  it("carries the IWGDF/IDSA infection grade as a recorded, gradeable finding", () => {
    const graded = DIABETES_CATALOG.features.find((f) => f.code === "foot_infection_grade")!;
    expect(graded.options!.map((o) => o.value)).toContain("severe");
    expect(graded.citation?.standard).toBe("IWGDF");
  });
});

/* ── 5. hypoglycaemia outranks everything ────────────────────────────────── */

describe("vignette 5 — sweating, tremor, confusion, glucose 2.6", () => {
  const p = profile(
    {
      dm_status: recorded("known"),
      capillary_glucose: recorded(2.6),
      hypo_autonomic_warning: recorded(true),
      hypo_neuroglycopenic_features: recorded(true),
      disorientation: recorded(true),
      altered_mental_state: recorded(true),
    },
    { ageBand: "adult" },
  );

  it("puts hypoglycaemia first, ahead of everything else", () => {
    expect(top(p)!.code).toMatch(/hypoglycaemia/);
  });

  it("at immediate urgency", () => {
    expect(top(p)!.urgency).toBe("immediate");
  });

  it("and the always-on acute interlock fires independently of the ranking", () => {
    expect(p.acute.map((a) => a.code)).toContain("hypoglycaemia");
  });
});

/* ── 6. type 2 in an adolescent ──────────────────────────────────────────── */

describe("vignette 6 — adolescent, obese, acanthosis nigricans, no ketosis", () => {
  const p = profile(
    {
      dm_status: recorded("suspected"),
      acanthosis_nigricans: recorded(true),
      weight_kg: recorded(96),
      height_cm: recorded(170),
      ketosis_at_presentation: recorded("no"),
      documented_weight_loss: recorded(false),
    },
    { ageBand: "adolescent" },
  );

  it("ranks type 2 above type 1", () => {
    const t2 = rankOf(p, "type_2_diabetes");
    const t1 = rankOf(p, "type_1_diabetes");
    expect(t2).toBeGreaterThanOrEqual(0);
    expect(t2).toBeLessThan(t1 === -1 ? Number.MAX_SAFE_INTEGER : t1);
  });

  it("names the finding that discriminated them", () => {
    expect(find(p, "type_2_diabetes")!.supporting.map((e) => e.feature)).toContain(
      "acanthosis_nigricans",
    );
  });

  it("does not claim the diagnosis — classification stays unresolved without the tests", () => {
    expect(p.classification.code).toBe("unclassified");
  });
});

/* ── 7. the negative control ─────────────────────────────────────────────── */

describe("vignette 7 — sparse findings must NOT produce a confident answer", () => {
  const p = profile(
    { dm_status: recorded("known"), pallor: recorded(false) },
    { ageBand: "adult" },
  );

  it("reports low confidence", () => {
    expect(p.differential.confidence).toBe("low");
  });

  it("asks for more data rather than asserting anything", () => {
    expect(p.differential.confidenceReason).toMatch(/record more|provisional|too little/i);
  });

  it("offers what to examine next", () => {
    expect(p.differential.checkNext.length).toBeGreaterThan(0);
  });

  it("shows completeness as prominently as any finding", () => {
    expect(p.differential.answered.applicable).toBeGreaterThan(p.differential.answered.recorded);
  });
});

/* ── the invariants that hold across every vignette ──────────────────────── */

describe("invariants", () => {
  it("never ranks a condition the catalog cannot name", () => {
    const known = new Set((DIABETES_CATALOG.conditions ?? []).map((c) => c.code));
    const p = profile({ dm_status: recorded("known"), dehydration: recorded(true) });
    for (const c of p.differential.conditions) expect(known.has(c.code), c.code).toBe(true);
  });

  it("never emits a ranked condition without the evidence that raised it", () => {
    const p = profile({ dm_status: recorded("known"), dehydration: recorded(true) });
    for (const c of p.differential.conditions) {
      expect(c.supporting.length + c.refuting.length + c.firedRules.length, c.code).toBeGreaterThan(
        0,
      );
    }
  });

  /**
   * The discriminating examination is ENTIRELY bedside — hands, eyes, a
   * monofilament — so a district clinic can perform every finding that moves
   * the ranking. That is the design win and it is asserted here so a later
   * change that quietly gates a discriminating finding behind a lab fails.
   */
  it("puts the whole discriminating examination within reach of a district clinic", () => {
    const referral = profile({ dm_status: recorded("known") });
    const district = profile({ dm_status: recorded("known") }, { district: true });
    expect(district.differential.answered.applicable).toBe(
      referral.differential.answered.applicable,
    );
  });

  /**
   * What the district genuinely cannot do — the labs — shrinks the DENOMINATOR
   * rather than growing a gap list the clinician can never clear. That is the
   * distinction between `not_assessed` and `unavailable`, measured.
   */
  it("marks what a district site cannot do as unobtainable, not as an unclosed gap", () => {
    const referral = profile({ dm_status: recorded("known") });
    const district = profile({ dm_status: recorded("known") }, { district: true });
    expect(district.completeness.unavailable).toBeGreaterThan(referral.completeness.unavailable);
    expect(district.completeness.outstanding).toBeLessThan(referral.completeness.outstanding);
  });
});
