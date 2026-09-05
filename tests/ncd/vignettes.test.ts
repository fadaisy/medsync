/**
 * Golden clinical vignettes.
 *
 * These are the artefact a Clinical Safety Officer reviews INSTEAD of reading
 * the engine: a synthetic patient in, an expected profile out. If a vignette's
 * expectation is clinically wrong, the catalog or the engine is wrong — and the
 * argument can be had in clinical language rather than in TypeScript.
 */
import type { CaptureMap } from "@/lib/ncd/engine/evaluate";
import { describe, expect, it } from "vitest";

import { DIABETES_CATALOG, DISTRICT_SITE, REFERRAL_SITE } from "@/lib/ncd/catalog/diabetes";
import { recorded } from "@/lib/ncd/catalog/schema";
import { buildProfile } from "@/lib/ncd/profile";

const profile = (values: CaptureMap, opts?: { district?: boolean; established?: boolean }) =>
  buildProfile({
    catalog: DIABETES_CATALOG,
    values,
    site: opts?.district ? DISTRICT_SITE : REFERRAL_SITE,
    established: opts?.established,
  });

/* ── acute: the interlock must fire before anything else matters ─────────── */

describe("vignette — 34-year-old, known type 1, vomiting and drowsy", () => {
  const p = profile({
    dm_status: recorded("known"),
    random_pg: recorded(24.0),
    bohb: recorded(5.2),
    venous_ph: recorded(7.1),
    bicarbonate: recorded(9),
    mental_status: recorded("drowsy"),
  });

  it("raises DKA as a red emergency, graded severe", () => {
    expect(p.acute).toHaveLength(1);
    const dka = p.acute[0]!;
    expect(dka.code).toBe("dka");
    expect(dka.severity).toBe("red");
    expect(dka.stage?.code).toBe("severe");
    expect(dka.action).toContain("escalate");
  });

  it("carries the evidence and the citation that fired it", () => {
    expect(p.acute[0]!.via.label).toContain("β-hydroxybutyrate ≥ 3.0");
    expect(p.acute[0]!.citation.standard).toBe("EASD");
  });
});

describe("vignette — 68-year-old, glucose 38, no ketones", () => {
  const p = profile({
    dm_status: recorded("known"),
    random_pg: recorded(38.0),
    effective_osmolality: recorded(315),
    bohb: recorded(1.2),
    bicarbonate: recorded(20),
  });

  it("raises HHS and NOT DKA — the ketone and acid-base profile separates them", () => {
    expect(p.acute.map((a) => a.code)).toEqual(["hhs"]);
  });

  it("names the formula that produced the osmolality", () => {
    expect(p.acute[0]!.via.label).toContain("effective osmolality");
  });
});

describe("vignette — collapsed at home, glucose 2.4, needed help", () => {
  const p = profile({
    dm_status: recorded("known"),
    capillary_glucose: recorded(2.4),
    needed_third_party_help: recorded(true),
  });

  it("raises hypoglycaemia as an emergency", () => {
    expect(p.acute.map((a) => a.code)).toContain("hypoglycaemia");
    expect(p.acute[0]!.severity).toBe("red");
  });
});

/* ── diagnosis ───────────────────────────────────────────────────────────── */

describe("vignette — thirsty, passing urine at night, losing weight; glucose 22.4", () => {
  const p = profile({
    dm_status: recorded("evaluating"),
    random_pg: recorded(22.4),
    polyuria: recorded(true),
    polydipsia: recorded(true),
    unexplained_weight_loss: recorded(true),
  });

  it("meets the criteria on a single sample, because symptoms are present", () => {
    expect(p.diagnosis.state).toBe("criteria_met");
    expect(p.diagnosis.criteria[0]!.label).toContain("single sample");
  });

  it("says which standard it applied", () => {
    expect(p.standardApplied?.body).toBe("ADA");
  });

  // An inferred type drives insulin decisions; the discriminating tests are undone.
  it("does not guess a diabetes type", () => {
    expect(p.classification.code).toBe("unclassified");
    expect(p.classification.reason).toContain("not inferred from phenotype");
  });
});

describe("vignette — asymptomatic, fasting glucose 8.2, no repeat yet", () => {
  const ada = profile({ dm_status: recorded("evaluating"), fpg: recorded(8.2) });
  const who = profile(
    { dm_status: recorded("evaluating"), fpg: recorded(8.2) },
    { district: true },
  );

  /**
   * No standard diagnoses an asymptomatic person on ONE abnormal result. ADA
   * wants two (which may be different tests from one draw); WHO wants a repeat
   * on a subsequent day. Both must withhold the diagnosis here.
   */
  it("does NOT diagnose under ADA on a single abnormal result", () => {
    expect(ada.diagnosis.state).toBe("insufficient");
    expect(ada.diagnosis.pendingConfirmation).toHaveLength(1);
    expect(ada.diagnosis.pendingConfirmation[0]!.label).toContain("Fasting plasma glucose");
  });

  it("does NOT diagnose under WHO, and names the confirmatory sample it wants", () => {
    expect(who.diagnosis.state).toBe("insufficient");
    expect(who.diagnosis.missing).toContain("second_sample_confirms");
    const gap = who.gaps.find((g) => g.feature === "second_sample_confirms");
    expect(gap?.kind).toBe("not_assessed");
    expect(gap?.blocks).toBe("Diagnosis");
  });

  // ADA's same-draw allowance: two DIFFERENT tests, both abnormal, is confirmation.
  it("diagnoses under ADA once a second abnormal test is present", () => {
    const both = profile({
      dm_status: recorded("evaluating"),
      fpg: recorded(8.2),
      hba1c: recorded(7.3),
      haemoglobin_variant: recorded("none"),
    });
    expect(both.diagnosis.state).toBe("criteria_met");
  });
});

/* ── decision (a): HbA1c validity, doing real work ───────────────────────── */

describe("vignette — HbA1c 7.4% in a patient with iron deficiency", () => {
  const p = profile({
    dm_status: recorded("evaluating"),
    hba1c: recorded(7.4),
    iron_deficiency: recorded(true),
  });

  /**
   * The whole point of decision (a). Iron deficiency falsely RAISES HbA1c, so a
   * 7.4% here may be manufacturing a diagnosis that is not there. The criterion
   * is excluded rather than counted.
   */
  it("refuses to diagnose on the HbA1c", () => {
    expect(p.diagnosis.state).not.toBe("criteria_met");
    expect(p.diagnosis.suppressed.map((c) => c.id)).toContain("hba1c_iron_deficiency");
  });

  it("states the DIRECTION of the error, not just 'unreliable'", () => {
    const caveat = p.caveats.find((c) => c.id === "hba1c_iron_deficiency")!;
    expect(caveat.direction).toBe("manufactures");
    expect(caveat.alternative).toContain("plasma glucose");
  });
});

describe("vignette — HbA1c 6.8% in a patient with current malaria", () => {
  const p = profile({
    dm_status: recorded("evaluating"),
    hba1c: recorded(6.8),
    malaria_current: recorded(true),
  });

  // The opposite direction: shortened red-cell survival falsely LOWERS HbA1c,
  // so the risk here is MISSING diabetes, not inventing it.
  it("flags the result as masking rather than manufacturing", () => {
    const caveat = p.caveats.find((c) => c.id === "hba1c_shortened_rbc_survival")!;
    expect(caveat.direction).toBe("masks");
    expect(caveat.blocksDiagnosis).toBe(true);
  });
});

describe("vignette — HbA1c used where haemoglobin variant status is unknown", () => {
  // Two abnormal tests, so ADA's confirmation requirement is satisfied and the
  // vignette isolates the question it is actually about: the caveat.
  const p = profile({
    dm_status: recorded("evaluating"),
    hba1c: recorded(7.1),
    fpg: recorded(7.9),
    haemoglobin_variant: recorded("unknown"),
  });

  // Fail-safe, not fail-closed: it surfaces the assumption rather than deciding.
  it("raises the assumption but does not block the diagnosis", () => {
    const caveat = p.caveats.find((c) => c.id === "hba1c_variant_status_unknown")!;
    expect(caveat.blocksDiagnosis).toBe(false);
    expect(p.diagnosis.state).toBe("criteria_met");
  });
});

/* ── resource tiering ────────────────────────────────────────────────────── */

describe("vignette — district clinic with no HbA1c; fasting glucose 9.1 confirmed", () => {
  const p = profile(
    {
      dm_status: recorded("evaluating"),
      fpg: recorded(9.1),
      second_sample_confirms: recorded(true),
    },
    { district: true },
  );

  it("reaches the diagnosis on glucose, under WHO", () => {
    expect(p.diagnosis.state).toBe("criteria_met");
    expect(p.standardApplied?.body).toBe("WHO");
  });

  // "Cannot be done here" is a referral, not a gap to nag about.
  it("marks the unobtainable tests as unavailable rather than outstanding", () => {
    const hba1cGap = p.gaps.find((g) => g.feature === "hba1c");
    if (hba1cGap) expect(hba1cGap.kind).toBe("unavailable");
    expect(p.completeness.unavailable).toBeGreaterThan(0);
  });

  it("cannot classify without C-peptide or antibodies, and says so", () => {
    expect(p.classification.code).toBe("unclassified");
  });
});

/* ── the chronic review ──────────────────────────────────────────────────── */

describe("vignette — known diabetic, annual review, eGFR 52 and ACR 12", () => {
  const p = profile(
    {
      dm_status: recorded("known"),
      egfr: recorded(52),
      urine_acr: recorded(12),
      kidney_abnormality_3_months: recorded(true),
      lops: recorded("present"),
      pad: recorded("present"),
      foot_deformity: recorded(false),
      prior_foot_ulcer: recorded(false),
      prior_amputation: recorded(false),
      esrd: recorded(false),
      active_foot_ulcer: recorded(false),
    },
    { established: true },
  );

  const comp = (code: string) => p.complications.find((c) => c.code === code)!;

  it("treats the diagnosis as established without re-demanding the criteria", () => {
    expect(p.diagnosis.state).toBe("established");
    expect(p.diagnosis.criteria).toEqual([]);
  });

  it("establishes and stages diabetic kidney disease as G3a / A2", () => {
    const dkd = comp("diabetic_kidney_disease");
    expect(dkd.state).toBe("met");
    expect(dkd.stages.find((s) => s.system === "kdigo_gfr")?.stage?.code).toBe("G3a");
    expect(dkd.stages.find((s) => s.system === "kdigo_albuminuria")?.stage?.code).toBe("A2");
  });

  it("stages the foot at IWGDF category 2 — two findings, not three", () => {
    const foot = comp("diabetic_foot");
    expect(foot.stages[0]!.stage?.code).toBe("iwgdf_2");
    expect(foot.screeningIntervalMonths).toBe(3);
  });

  it("raises no emergency", () => {
    expect(p.acute).toEqual([]);
  });
});

/* ── the honesty invariants, as properties ───────────────────────────────── */

describe("an empty clerking asserts nothing", () => {
  const p = profile({});

  it("reports no emergency, no diagnosis and no classification", () => {
    expect(p.acute).toEqual([]);
    expect(p.diagnosis.state).toBe("insufficient");
    expect(p.classification.code).toBe("unclassified");
  });

  // The failure this whole design exists to prevent.
  it("never reports a complication as ABSENT when nobody looked", () => {
    for (const c of p.complications) {
      expect(c.state, c.code).not.toBe("not_met");
    }
  });

  it("never reports a stage when nobody looked", () => {
    for (const c of p.complications) {
      for (const s of c.stages) expect(s.stage, `${c.code}/${s.system}`).toBeUndefined();
    }
  });

  it("shows 0% completeness rather than an empty-but-confident profile", () => {
    expect(p.completeness.recorded).toBe(0);
    expect(p.completeness.percent).toBe(0);
    expect(p.completeness.outstanding).toBeGreaterThan(0);
  });

  it("stays gated dark while any citation is unratified", () => {
    expect(p.gatedDark).toBe(true);
  });
});

describe("completeness excludes what the site cannot do", () => {
  it("does not punish a district clinic for lacking a fundus camera", () => {
    const full = profile({}, { district: false });
    const district = profile({}, { district: true });
    expect(district.completeness.unavailable).toBeGreaterThan(full.completeness.unavailable);
    // the denominator shrinks; it is not counted as the clinician falling short
    expect(district.completeness.outstanding).toBeLessThan(full.completeness.outstanding);
  });
});
