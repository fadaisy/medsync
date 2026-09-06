import type { CaptureMap } from "@/lib/ncd/engine/evaluate";
import { describe, expect, it } from "vitest";

import {
  buildBlocks,
  isVisible,
} from "@/app/doctor/encounters/[encounterId]/_components/ncd-capture";
import { DIABETES_CATALOG, REFERRAL_SITE } from "@/lib/ncd/catalog/diabetes";
import { recorded } from "@/lib/ncd/catalog/schema";
import { errorsOf, validateCatalog } from "@/lib/ncd/catalog/validate";
import { activeCaveats, ncdContext, pendingOrders } from "@/lib/ncd/engine/assess";
import { contextOf } from "@/lib/ncd/engine/evaluate";

/**
 * Every condition in the reliability section changes whether an HbA1c can be
 * trusted, and one of them can BLOCK a diagnosis. Each used to be a bare
 * boolean — "anaemia: yes" with no basis attached, which could equally mean a
 * full blood count, a glance at a conjunctiva, or something the patient was told
 * years ago. Those are not the same claim.
 */

const props = (finding: string, values: CaptureMap) => {
  const ctx = contextOf(DIABETES_CATALOG.features, values, REFERRAL_SITE);
  const block = buildBlocks(
    DIABETES_CATALOG.features.filter(
      (f) => f.section === "hba1c_validity" && !f.offProtocol && isVisible(f, ctx),
    ),
  ).find((b) => b.finding.code === finding);
  return block ? block.properties.map((p) => p.feature.code) : [];
};

const orders = (values: CaptureMap) =>
  pendingOrders(DIABETES_CATALOG, ncdContext(DIABETES_CATALOG, values, REFERRAL_SITE));

describe("the reliability section asks nothing until a condition is recorded", () => {
  it("opens at the ten conditions and no evidence fields", () => {
    const ctx = contextOf(DIABETES_CATALOG.features, {}, REFERRAL_SITE);
    const shown = DIABETES_CATALOG.features.filter(
      (f) => f.section === "hba1c_validity" && isVisible(f, ctx),
    );
    expect(shown.every((f) => !f.parent)).toBe(true);
    expect(shown.length).toBe(10);
  });
});

describe("anaemia — the count, or the reason there is not one", () => {
  const yes = { anaemia: recorded(true) };

  it("asks how it was established before asking anything else", () => {
    expect(props("anaemia", yes)).toEqual(["anaemia_basis"]);
  });

  /**
   * WHO 2024 Table 3 is reproduced in the severity labels so the clinician
   * classifies against the table rather than from memory.
   */
  it("asks for the count when there is one", () => {
    expect(props("anaemia", { ...yes, anaemia_basis: recorded("lab") })).toEqual([
      "anaemia_basis",
      "anaemia_hb",
      "anaemia_severity",
      "anaemia_mcv",
      "anaemia_mch",
      "anaemia_morphology",
    ]);
  });

  it("asks for the signs when the basis is the bedside", () => {
    expect(props("anaemia", { ...yes, anaemia_basis: recorded("clinical") })).toEqual([
      "anaemia_basis",
      "anaemia_clinical_signs",
    ]);
  });

  it("carries WHO's own cutoffs in the severity labels", () => {
    const sev = DIABETES_CATALOG.features.find((f) => f.code === "anaemia_severity")!;
    expect(sev.options!.map((o) => o.value)).toEqual(["mild", "moderate", "severe"]);
    expect(sev.options!.find((o) => o.value === "moderate")!.display).toContain("8.0–10.9");
    expect(sev.citation!.quote).toContain("nonpregnant women");
  });

  it("offers all four morphologies, keyed to the MCV and MCH that define them", () => {
    const m = DIABETES_CATALOG.features.find((f) => f.code === "anaemia_morphology")!;
    expect(m.options!.map((o) => o.value)).toEqual([
      "microcytic_hypochromic",
      "normocytic_normochromic",
      "normocytic_hypochromic",
      "macrocytic",
    ]);
    for (const code of ["anaemia_mcv", "anaemia_mch"]) {
      expect(
        DIABETES_CATALOG.features.some((f) => f.code === code),
        code,
      ).toBe(true);
    }
  });
});

/**
 * The inversion that makes this worth building. A gaps list says "haemoglobin is
 * missing", which the clinician already knew and cannot act on. This says which
 * test would settle it.
 */
describe("what can be ordered when the evidence is not there", () => {
  it("says nothing until a condition is recorded", () => {
    expect(orders({})).toEqual([]);
  });

  /**
   * THE CASE THIS EXISTS FOR, and the one an earlier version got backwards. The
   * haemoglobin is hidden precisely BECAUSE there is no full blood count — so
   * filtering the suggestion on whether the field is currently displayed
   * silenced it in exactly the situation it is for.
   */
  it("offers the count when anaemia was found on pallor alone", () => {
    const o = orders({ anaemia: recorded(true), anaemia_basis: recorded("clinical") });
    expect(o.map((x) => x.code)).toEqual(["cbc"]);
    expect(o[0]!.wouldFill.map((f) => f.code)).toEqual([
      "anaemia_hb",
      "anaemia_severity",
      "anaemia_mcv",
      "anaemia_mch",
      "anaemia_morphology",
    ]);
    expect(o[0]!.because).toBeTruthy();
  });

  it("stops offering it once the count has answered the question", () => {
    expect(
      orders({
        anaemia: recorded(true),
        anaemia_basis: recorded("lab"),
        anaemia_hb: recorded(96),
        anaemia_severity: recorded("moderate"),
        anaemia_mcv: recorded(72),
        anaemia_mch: recorded(24),
        anaemia_morphology: recorded("microcytic_hypochromic"),
      }),
    ).toEqual([]);
  });

  it("offers iron studies, a blood group and an hCG on the same rule", () => {
    expect(orders({ iron_deficiency: recorded(true) }).map((o) => o.code)).toEqual([
      "iron_studies",
    ]);
    expect(orders({ recent_transfusion: recorded(true) }).map((o) => o.code)).toEqual([
      "blood_group",
    ]);
    expect(orders({ pregnant: recorded(true) }).map((o) => o.code)).toEqual(["hcg"]);
  });

  it("never names a feature that does not exist", () => {
    const codes = new Set(DIABETES_CATALOG.features.map((f) => f.code));
    for (const o of DIABETES_CATALOG.orderables ?? []) {
      for (const code of o.fills) expect(codes.has(code), `${o.code} → ${code}`).toBe(true);
    }
  });
});

/**
 * Abacavir is the reason the regimen is asked for at all: A1C underestimated
 * glucose by around 29 mg/dL in HIV, and in multivariate analysis only MCV and
 * current NRTI use — abacavir in particular — survived.
 */
describe("the antiretroviral caveat", () => {
  const caveats = (values: CaptureMap) =>
    activeCaveats(DIABETES_CATALOG, ncdContext(DIABETES_CATALOG, values, REFERRAL_SITE)).map(
      (c) => c.id,
    );

  /**
   * The regimen is recorded as a COMBINATION, which is how antiretrovirals are
   * prescribed and dispensed — so the caveat has to match every abacavir-
   * containing one rather than a single drug code.
   */
  it("fires on every abacavir-containing regimen and no other", () => {
    const on = { hiv_on_art: recorded(true) };
    for (const r of ["abc_3tc_dtg", "abc_3tc_efv", "abc_3tc_lpvr"]) {
      expect(caveats({ ...on, art_regimen: recorded(r) }), r).toContain("abacavir_lowers_hba1c");
    }
    for (const r of ["tdf_3tc_dtg", "taf_ftc_dtg", "azt_3tc_dtg", "tdf_3tc_efv"]) {
      expect(caveats({ ...on, art_regimen: recorded(r) }), r).not.toContain(
        "abacavir_lowers_hba1c",
      );
    }
  });

  /**
   * The limit, pinned so nobody assumes otherwise: "Other" is free text, and
   * free text is inert throughout this catalog. An abacavir regimen entered that
   * way raises nothing, which is why the combinations that actually circulate
   * are enumerated.
   */
  it("cannot see abacavir inside a free-text 'other' regimen", () => {
    expect(
      caveats({
        hiv_on_art: recorded(true),
        art_regimen: recorded({ option: "other", detail: "ABC + 3TC + DTG" }),
      }),
    ).not.toContain("abacavir_lowers_hba1c");
  });

  /**
   * It MASKS — the direction that matters, because a reassuring number is the
   * one nobody re-checks. And it does not block the diagnosis: this is a single
   * prospective study, not a guideline position, and gating a diagnosis on it is
   * the CSO's decision.
   */
  it("masks rather than manufactures, and does not block a diagnosis", () => {
    const c = DIABETES_CATALOG.validityCaveats!.find((x) => x.id === "abacavir_lowers_hba1c")!;
    expect(c.direction).toBe("masks");
    expect(c.blocksDiagnosis).toBe(false);
    expect(c.citation.needsCsoInput).toBeTruthy();
    expect(c.alternative).toBeTruthy();
  });
});

describe("the rest of the evidence", () => {
  /**
   * Three of a dozen combinations move the number and the rest do not. That is
   * a fact worth reading in a table rather than hunting for in an option label.
   */
  it("tabulates what every regimen does to the HbA1c, with no gaps", () => {
    const r = DIABETES_CATALOG.features.find((f) => f.code === "art_regimen")!;
    expect(r.valueType).toBe("single_select");
    expect(r.optionEffectsLabel).toBe("Effect on HbA1c");
    // Every option accounted for — a missing row would read as "no effect".
    expect(r.optionEffects!.map((e) => e.option).sort()).toEqual(
      r.options!.map((o) => o.value).sort(),
    );
    const masks = r.optionEffects!.filter((e) => e.direction === "masks").map((e) => e.option);
    expect(masks).toEqual([
      "abc_3tc_dtg",
      "abc_3tc_efv",
      "abc_3tc_lpvr",
      "azt_3tc_dtg",
      "azt_3tc_efv",
      "azt_3tc_lpvr",
    ]);
    expect(r.optionEffects!.some((e) => e.direction === "none")).toBe(true);
  });

  it("rejects an effects table with a hole in it", () => {
    const r = DIABETES_CATALOG.features.find((f) => f.code === "art_regimen")!;
    const holed = {
      ...DIABETES_CATALOG,
      features: DIABETES_CATALOG.features.map((f) =>
        f.code === "art_regimen" ? { ...f, optionEffects: r.optionEffects!.slice(1) } : f,
      ),
    };
    expect(
      errorsOf(validateCatalog(holed)).some((e) => e.message.includes("no entry in optionEffects")),
    ).toBe(true);
  });

  /**
   * Haemolysis shortens the window an HbA1c averages over, so the number reads
   * low for reasons that have nothing to do with glucose. What was a bare tick
   * now carries what actually points to it.
   */
  it("asks what points to the haemolysis, by basis", () => {
    const yes = { haemolysis: recorded(true) };
    expect(props("haemolysis", { ...yes, haemolysis_basis: recorded("lab") })).toEqual([
      "haemolysis_basis",
      "haemolysis_markers",
      "haemolysis_cause",
    ]);
    expect(props("haemolysis", { ...yes, haemolysis_basis: recorded("clinical") })).toEqual([
      "haemolysis_basis",
      "haemolysis_clinical_signs",
      "haemolysis_cause",
    ]);
    const m = DIABETES_CATALOG.features.find((f) => f.code === "haemolysis_markers")!;
    // The four that travel together, plus what says WHICH haemolysis.
    expect(m.options!.map((o) => o.value)).toEqual(
      expect.arrayContaining([
        "raised_unconjugated_bilirubin",
        "raised_ldh",
        "low_haptoglobin",
        "reticulocytosis",
        "positive_dat",
      ]),
    );
    expect(orders({ ...yes, haemolysis_basis: recorded("clinical") }).map((o) => o.code)).toEqual([
      "haemolysis_screen",
    ]);
  });

  /** Reported and spoken in g/dL at the bedside; WHO writes its table in g/L. */
  it("records haemoglobin in g/dL, with WHO's cutoffs converted to match", () => {
    const hb = DIABETES_CATALOG.features.find((f) => f.code === "anaemia_hb")!;
    expect(hb.unit).toBe("g/dL");
    expect(hb.altUnit).toEqual({ unit: "g/L", factor: 10 });
    expect(hb.refRange).toEqual({ low: 12, high: 16 });
    const sev = DIABETES_CATALOG.features.find((f) => f.code === "anaemia_severity")!;
    expect(sev.options!.find((o) => o.value === "severe")!.display).toContain("8.0");
    expect(sev.options!.every((o) => !o.display.includes("g/L"))).toBe(true);
  });

  it("asks what the erythropoietin is for, and for how long", () => {
    expect(props("erythropoietin", { erythropoietin: recorded(true) })).toEqual([
      "epo_duration",
      "epo_indication",
    ]);
    const ind = DIABETES_CATALOG.features.find((f) => f.code === "epo_indication")!;
    // The indication is often a second caveat in disguise: CKD anaemia and
    // zidovudine-induced anaemia both point back at other rows in this section.
    expect(ind.options!.map((o) => o.value)).toEqual(
      expect.arrayContaining(["ckd_anaemia", "dialysis", "zidovudine"]),
    );
  });

  it("takes a last menstrual period as a date, and derives from it", () => {
    const lnmp = DIABETES_CATALOG.features.find((f) => f.code === "lnmp")!;
    expect(lnmp.valueType).toBe("date");
    expect(lnmp.derives).toBe("gestation_from_lnmp");
    expect(props("pregnant", { pregnant: recorded(true) })).toEqual([
      "lnmp",
      "pregnancy_confirmed_by",
    ]);
  });

  it("offers a blood group for a transfusion, because a history without one is unusable", () => {
    const g = DIABETES_CATALOG.features.find((f) => f.code === "transfusion_blood_group")!;
    expect(g.options!.map((o) => o.value)).toEqual([
      "o_pos",
      "o_neg",
      "a_pos",
      "a_neg",
      "b_pos",
      "b_neg",
      "ab_pos",
      "ab_neg",
      "unknown",
    ]);
  });

  /**
   * KDIGO states an emergent principle rather than a list; the AEIOU options are
   * the conventional teaching expansion of it, and are marked as ours.
   */
  it("lists the dialysis indications and says whose list it is", () => {
    const d = DIABETES_CATALOG.features.find((f) => f.code === "dialysis_indication")!;
    expect(d.options!.map((o) => o.value)).toEqual(
      expect.arrayContaining(["acidosis", "electrolytes", "intoxication", "overload", "uraemia"]),
    );
    expect(d.citation!.needsCsoInput).toMatch(/not KDIGO's own enumeration/i);
  });

  it("keeps the malaria question distinct from the crisis-precipitant one", () => {
    // Same disease, different window: one asks what set off this crisis, the
    // other whether malaria in recent months makes the HbA1c unreadable.
    const a = DIABETES_CATALOG.features.find((f) => f.code === "malaria_confirmation")!;
    const b = DIABETES_CATALOG.features.find((f) => f.code === "malaria_current_test")!;
    expect(a.section).toBe("precipitants");
    expect(b.section).toBe("hba1c_validity");
  });
});

describe("the catalog still validates", () => {
  it("has no errors", () => {
    expect(errorsOf(validateCatalog(DIABETES_CATALOG))).toEqual([]);
  });
});
