import type { Citation, Criterion, Feature, SiteProfile } from "@/lib/ncd/catalog/schema";
import type { CaptureMap } from "@/lib/ncd/engine/evaluate";
import { describe, expect, it } from "vitest";

import { DIABETES_CATALOG, DISTRICT_SITE, REFERRAL_SITE } from "@/lib/ncd/catalog/diabetes";
import { isPerformable, preferredCriteria, recorded } from "@/lib/ncd/catalog/schema";
import { errorsOf, referencedFeatures, validateCatalog } from "@/lib/ncd/catalog/validate";
import { contextOf, evaluateCriterion } from "@/lib/ncd/engine/evaluate";

const cat = DIABETES_CATALOG;
const cite: Citation = {
  standard: "WHO",
  version: "1",
  title: "t",
  url: "https://example.org",
  csoSigned: true,
};

const ctx = (values: CaptureMap, site: SiteProfile) => contextOf(cat.features, values, site);

const allCriteria = (): Criterion[] => [
  ...cat.diagnosis.flatMap((s) => s.anyOf),
  ...(cat.classifications ?? []).flatMap((c) => [...c.supportedBy, ...(c.refutedBy ?? [])]),
  ...cat.complications.flatMap((c) => [
    ...c.establishedBy,
    ...(c.staging ?? []).flatMap((s) => s.stages.map((x) => x.when)),
  ]),
];

/* ── the atLeast combinator, added for IWGDF category 2 ──────────────────── */

describe("atLeast — n-of-m", () => {
  const FEATURES: Feature[] = [
    { code: "a", display: "A", kind: "sign", valueType: "boolean", section: "s" },
    { code: "b", display: "B", kind: "sign", valueType: "boolean", section: "s" },
    { code: "c", display: "C", kind: "sign", valueType: "boolean", section: "s" },
  ];
  const site: SiteProfile = { id: "s", display: "s", standardPreference: [], available: [] };
  const two: Criterion = {
    id: "two",
    label: "any two of three",
    atLeast: {
      n: 2,
      of: [
        { feature: "a", op: "present" },
        { feature: "b", op: "present" },
        { feature: "c", op: "present" },
      ],
    },
    citation: cite,
  };
  const run = (values: CaptureMap) =>
    evaluateCriterion(two, contextOf(FEATURES, values, site)).state;

  it("is met at exactly n and beyond", () => {
    expect(run({ a: recorded(true), b: recorded(true) })).toBe("met");
    expect(run({ a: recorded(true), b: recorded(true), c: recorded(true) })).toBe("met");
  });

  it("is not_met only when the unresolved predicates could not carry it to n", () => {
    // one positive, two recorded negatives -> can never reach 2
    expect(run({ a: recorded(true), b: recorded(false), c: recorded(false) })).toBe("not_met");
  });

  // The honesty rule the other combinators follow, applied here too.
  it("stays insufficient while an unanswered predicate could still carry it", () => {
    expect(run({ a: recorded(true), b: recorded(false) })).toBe("insufficient");
    expect(run({})).toBe("insufficient");
  });
});

/* ── the catalog itself ──────────────────────────────────────────────────── */

describe("diabetes catalog", () => {
  it("validates with no structural or provenance errors", () => {
    expect(errorsOf(validateCatalog(cat))).toEqual([]);
  });

  // Ships gated dark: every warning should be the unsigned one, nothing else.
  it("is entirely unsigned, and that is its only warning class", () => {
    const warns = validateCatalog(cat).filter((i) => i.severity === "warning");
    expect(warns.length).toBeGreaterThan(0);
    expect([...new Set(warns.map((w) => w.message))]).toEqual([
      "not CSO-signed — gated dark until ratified",
    ]);
  });

  /**
   * The general examination was declared empty and is now filled, so nothing
   * renders as "not built yet" any more. Asserted as ZERO rather than deleted:
   * a segment that quietly empties out is a section that stopped asking
   * something it used to ask.
   */
  it("has no declared-but-empty segments", () => {
    const empty = validateCatalog(cat).filter((i) => i.message.startsWith("segment has no"));
    expect(empty.map((i) => i.path)).toEqual([]);
  });

  it("cites every clinical assertion", () => {
    for (const c of allCriteria()) {
      expect(c.citation.standard, c.id).toBeTruthy();
      expect(c.citation.version, c.id).toBeTruthy();
      expect(Boolean(c.citation.url || c.citation.needsCsoInput), c.id).toBe(true);
    }
  });

  it("defines every feature its logic references", () => {
    const defined = new Set(cat.features.map((f) => f.code));
    for (const code of referencedFeatures(cat)) expect(defined.has(code), code).toBe(true);
  });

  it("gives every acute complication an emergency action, and no chronic one", () => {
    const acute = cat.complications.filter((c) => c.timing === "acute");
    expect(acute.map((c) => c.code).sort()).toEqual(["dka", "hhs", "hypoglycaemia"]);
    for (const c of acute) expect(c.emergency?.severity, c.code).toBe("red");
    for (const c of cat.complications.filter((x) => x.timing === "chronic")) {
      expect(c.emergency, c.code).toBeUndefined();
    }
  });
});

describe("therapy capture", () => {
  const therapy = cat.features.find((f) => f.code === "glucose_lowering_therapy")!;
  const lifestyle = cat.features.find((f) => f.code === "lifestyle_modification")!;

  it("offers a dose against drugs, and never against 'none' or 'not known'", () => {
    expect(therapy.optionDetail?.label).toBe("Dose");
    for (const v of ["none", "unknown"]) {
      expect(therapy.options!.find((o) => o.value === v)?.noDetail, v).toBe(true);
    }
    expect(therapy.options!.find((o) => o.value === "metformin")?.noDetail).toBeUndefined();
  });

  // The same input asking a different question.
  it("asks 'Other' for the drug, not for a dose", () => {
    const other = therapy.options!.find((o) => o.value === "other")!;
    expect(other.noDetail).toBeUndefined();
    expect(other.detail?.label).toBe("Drug");
    expect(therapy.optionDetail?.label).toBe("Dose");
  });

  // Lifestyle is an intervention in its own right, and it is not dosed.
  it("records lifestyle modification separately, with no dose field at all", () => {
    expect(lifestyle.valueType).toBe("multi_select");
    expect(lifestyle.optionDetail).toBeUndefined();
    expect(lifestyle.options!.map((o) => o.value)).toContain("nutrition");
  });

  it("covers oral agents, not only insulin", () => {
    const values = therapy.options!.map((o) => o.value);
    for (const oral of ["metformin", "sulfonylurea", "dpp4", "sglt2", "tzd", "agi"]) {
      expect(values, oral).toContain(oral);
    }
  });
});

/* ── the audit's four corrections must be visible in the data ────────────── */

describe("Phase 0 audit corrections are honoured", () => {
  // WHO 2011 states the cut-point as a percentage only; 48 mmol/mol is not in it.
  it("never attributes a mmol/mol HbA1c figure to WHO 2011", () => {
    const who = cat.diagnosis.find((s) => s.id === "who_2019")!;
    const hba1c = who.anyOf.find((c) => c.id === "who_hba1c")!;
    expect(hba1c.citation.version).toContain("2011");
    expect(hba1c.label).not.toContain("mmol/mol");
  });

  // ADA Table 12.1 is an adapted reprint of IWGDF, not independent corroboration.
  it("cites IWGDF alone for foot risk — never ADA as corroboration", () => {
    const foot = cat.complications.find((c) => c.code === "diabetic_foot")!;
    const staging = foot.staging!.find((s) => s.id === "iwgdf_risk")!;
    expect(staging.standard).toBe("IWGDF");
    for (const st of staging.stages) expect(st.when.citation.standard).toBe("IWGDF");
  });

  // The number 320 attaches to DIFFERENT quantities across standards, so the two
  // osmolalities must never collapse into one field.
  it("keeps effective and total osmolality as separate features", () => {
    const codes = cat.features.map((f) => f.code);
    expect(codes).toContain("effective_osmolality");
    expect(codes).toContain("total_osmolality");
    const hhs = cat.complications.find((c) => c.code === "hhs")!;
    const eff = hhs.establishedBy.find((c) => c.id === "hhs_effective")!;
    const tot = hhs.establishedBy.find((c) => c.id === "hhs_total")!;
    expect(eff.all!.find((p) => p.feature === "effective_osmolality")!.value).toBe(300);
    expect(tot.all!.find((p) => p.feature === "total_osmolality")!.value).toBe(320);
  });
});

/* ── the two reference sites: same catalog, different honest answers ─────── */

describe("resource tiering", () => {
  it("picks the site's preferred standard", () => {
    expect(preferredCriteria(cat.diagnosis, REFERRAL_SITE)?.standard).toBe("ADA");
    expect(preferredCriteria(cat.diagnosis, DISTRICT_SITE)?.standard).toBe("WHO");
  });

  it("marks HbA1c unobtainable at the district tier but glucose obtainable", () => {
    const hba1c = cat.features.find((f) => f.code === "hba1c")!;
    const fpg = cat.features.find((f) => f.code === "fpg")!;
    expect(isPerformable(hba1c, DISTRICT_SITE)).toBe(false);
    expect(isPerformable(hba1c, REFERRAL_SITE)).toBe(true);
    expect(isPerformable(fpg, DISTRICT_SITE)).toBe(true);
  });

  /**
   * The payoff of the asymmetric OR precedence: at a site with no HbA1c the
   * diagnosis is still REACHABLE on glucose, so the criteria set must report
   * insufficient — "do the test you can do" — not unavailable.
   */
  it("keeps the diagnosis reachable at a site with no HbA1c", () => {
    const who = cat.diagnosis.find((s) => s.id === "who_2019")!;
    const hba1cCriterion = who.anyOf.find((c) => c.id === "who_hba1c")!;
    expect(evaluateCriterion(hba1cCriterion, ctx({}, DISTRICT_SITE)).state).toBe("unavailable");
    const fpgCriterion = who.anyOf.find((c) => c.id === "who_fpg")!;
    expect(evaluateCriterion(fpgCriterion, ctx({}, DISTRICT_SITE)).state).toBe("insufficient");
  });

  // The dipstick pathway is what lets a district site stage albuminuria at all.
  it("stages albuminuria from the reagent strip where quantitative ACR is unavailable", () => {
    const dkd = cat.complications.find((c) => c.code === "diabetic_kidney_disease")!;
    const quant = dkd.staging!.find((s) => s.id === "kdigo_albuminuria")!;
    const strip = dkd.staging!.find((s) => s.id === "kdigo_dipstick_fallback")!;
    const a2 = quant.stages.find((s) => s.code === "A2")!.when;
    const a3s = strip.stages.find((s) => s.code === "A3_strip")!.when;
    expect(evaluateCriterion(a2, ctx({}, DISTRICT_SITE)).state).toBe("unavailable");
    expect(
      evaluateCriterion(a3s, ctx({ urine_protein_strip: recorded("2plus") }, DISTRICT_SITE)).state,
    ).toBe("met");
  });
});

/* ── the clinical rules that most matter ─────────────────────────────────── */

describe("diagnosis rules", () => {
  const who = cat.diagnosis.find((s) => s.id === "who_2019")!;
  const symptomatic = who.anyOf.find((c) => c.id === "who_random_symptomatic")!;
  const fpg = who.anyOf.find((c) => c.id === "who_fpg")!;

  it("diagnoses on a single sample only with classic symptoms", () => {
    expect(
      evaluateCriterion(
        symptomatic,
        ctx({ random_pg: recorded(19.2), polyuria: recorded(true) }, REFERRAL_SITE),
      ).state,
    ).toBe("met");
    // same glucose, symptoms recorded ABSENT -> the single-sample route fails
    expect(
      evaluateCriterion(
        symptomatic,
        ctx(
          {
            random_pg: recorded(19.2),
            polyuria: recorded(false),
            polydipsia: recorded(false),
            unexplained_weight_loss: recorded(false),
          },
          REFERRAL_SITE,
        ),
      ).state,
    ).toBe("not_met");
  });

  // Decision (b): the stricter WHO rule is a PREDICATE, not just a flag.
  it("will not reach a WHO diagnosis on a raised FPG until the repeat is recorded", () => {
    const once = evaluateCriterion(fpg, ctx({ fpg: recorded(9.1) }, REFERRAL_SITE));
    expect(once.state).toBe("insufficient");
    expect(once.missing).toContain("second_sample_confirms");
    expect(
      evaluateCriterion(
        fpg,
        ctx({ fpg: recorded(9.1), second_sample_confirms: recorded(true) }, REFERRAL_SITE),
      ).state,
    ).toBe("met");
  });
});

describe("acute interlock rules", () => {
  const dka = cat.complications.find((c) => c.code === "dka")!;

  it("establishes DKA on ketosis plus acidosis", () => {
    const c = dka.establishedBy.find((x) => x.id === "dka_bohb")!;
    expect(
      evaluateCriterion(c, ctx({ bohb: recorded(4.2), venous_ph: recorded(7.21) }, REFERRAL_SITE))
        .state,
    ).toBe("met");
  });

  // The 2024 consensus LOWERED this from >13.9; anyone using the old number
  // under-calls DKA. Ketosis + acidosis is what establishes it, not the glucose.
  it("does not require a glucose above the old 13.9 threshold", () => {
    const c = dka.establishedBy.find((x) => x.id === "dka_bohb")!;
    const r = evaluateCriterion(
      c,
      ctx(
        { bohb: recorded(3.5), bicarbonate: recorded(12), random_pg: recorded(12.0) },
        REFERRAL_SITE,
      ),
    );
    expect(r.state).toBe("met");
  });

  it("falls back to urine ketones where blood ketones are unavailable", () => {
    const c = dka.establishedBy.find((x) => x.id === "dka_urine_ketones")!;
    expect(
      evaluateCriterion(
        c,
        ctx({ urine_ketones: recorded("2plus"), bicarbonate: recorded(11) }, DISTRICT_SITE),
      ).state,
    ).toBe("met");
  });
});

describe("classification degrades rather than guesses", () => {
  // The ratified position: an inferred type drives real insulin decisions.
  it("cannot support any type at a site without C-peptide or antibodies", () => {
    for (const cl of cat.classifications ?? []) {
      for (const c of cl.supportedBy) {
        const state = evaluateCriterion(c, ctx({}, DISTRICT_SITE)).state;
        expect(["unavailable", "insufficient"], `${cl.code}/${c.id}`).toContain(state);
        expect(state, `${cl.code}/${c.id}`).not.toBe("met");
      }
    }
  });

  it("supports type 1 once autoantibodies come back positive", () => {
    const t1 = cat.classifications!.find((c) => c.code === "type_1")!;
    const c = t1.supportedBy.find((x) => x.id === "t1_autoantibodies")!;
    expect(
      evaluateCriterion(c, ctx({ islet_autoantibodies: recorded("positive") }, REFERRAL_SITE))
        .state,
    ).toBe("met");
  });
});

describe("IWGDF foot staging", () => {
  const foot = cat.complications.find((c) => c.code === "diabetic_foot")!;
  const staging = foot.staging!.find((s) => s.id === "iwgdf_risk")!;
  const stage = (code: string) => staging.stages.find((s) => s.code === code)!.when;

  it("category 2 needs any TWO of LOPS, PAD and deformity", () => {
    const two = stage("iwgdf_2");
    expect(
      evaluateCriterion(
        two,
        ctx({ lops: recorded("present"), pad: recorded("present") }, REFERRAL_SITE),
      ).state,
    ).toBe("met");
    expect(
      evaluateCriterion(
        two,
        ctx({ lops: recorded("present"), foot_deformity: recorded(true) }, REFERRAL_SITE),
      ).state,
    ).toBe("met");
    // one alone is not category 2
    expect(
      evaluateCriterion(
        two,
        ctx(
          { lops: recorded("present"), pad: recorded("absent"), foot_deformity: recorded(false) },
          REFERRAL_SITE,
        ),
      ).state,
    ).toBe("not_met");
  });

  it("category 3 needs LOPS or PAD plus a prior ulcer, amputation or ESRD", () => {
    const three = stage("iwgdf_3");
    expect(
      evaluateCriterion(
        three,
        ctx({ lops: recorded("present"), prior_amputation: recorded(true) }, REFERRAL_SITE),
      ).state,
    ).toBe("met");
  });

  it("has every screening interval point at a stage that exists", () => {
    const codes = new Set(staging.stages.map((s) => s.code));
    for (const si of foot.screeningIntervals ?? []) {
      if (si.forStage) expect(codes.has(si.forStage), si.forStage).toBe(true);
    }
  });
});
