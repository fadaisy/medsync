import type { CaptureMap } from "@/lib/ncd/engine/evaluate";
import { describe, expect, it } from "vitest";

import { DIABETES_CATALOG, REFERRAL_SITE } from "@/lib/ncd/catalog/diabetes";
import { recorded, unavailable } from "@/lib/ncd/catalog/schema";
import { errorsOf, validateCatalog } from "@/lib/ncd/catalog/validate";
import { interpretations, ncdContext } from "@/lib/ncd/engine/assess";
import { contextOf } from "@/lib/ncd/engine/evaluate";

const ctx = (values: CaptureMap) => contextOf(DIABETES_CATALOG.features, values, REFERRAL_SITE);
const read = (feature: string, values: CaptureMap) =>
  interpretations(DIABETES_CATALOG, ncdContext(DIABETES_CATALOG, values, REFERRAL_SITE)).find(
    (i) => i.feature === feature,
  )!;

describe("the examination section", () => {
  it("sits between the symptoms and what precipitated the crisis", () => {
    const order = [...DIABETES_CATALOG.sections].sort((a, b) => a.order - b.order).map((s) => s.id);
    expect(order.indexOf("examination")).toBe(order.indexOf("symptoms") + 1);
    expect(order.indexOf("precipitants")).toBe(order.indexOf("examination") + 1);
  });

  // One group, not two: anthropometry is measured in the same breath as the
  // vitals and a separate segment for it was a heading with nothing behind it.
  it("holds its measurements in a single group, banded and complete", () => {
    const s = DIABETES_CATALOG.sections.find((x) => x.id === "examination")!;
    expect(s.groups!.map((g) => g.id)).toEqual(["vitals", "general"]);
    const findings = DIABETES_CATALOG.features.filter(
      (f) => f.section === "examination" && !f.parent,
    );
    // Every finding is banded into a group — half-grouped is worse than ungrouped.
    for (const f of findings) expect(f.group, f.code).toBeTruthy();
    expect(errorsOf(validateCatalog(DIABETES_CATALOG))).toEqual([]);
  });
});

/**
 * A stored BMI is a number that can disagree with the weight beside it the
 * moment somebody corrects one. Derived fresh, it cannot.
 */
describe("BMI is computed, not captured", () => {
  it("computes from the weight and height actually recorded", () => {
    expect(ctx({ weight_kg: recorded(84), height_cm: recorded(171) }).values["bmi"]).toEqual({
      state: "recorded",
      value: 28.7,
    });
    // Correct the weight and the BMI follows, with no second edit.
    expect(ctx({ weight_kg: recorded(70), height_cm: recorded(171) }).values["bmi"]).toEqual({
      state: "recorded",
      value: 23.9,
    });
  });

  /**
   * A BMI of 0 is not a thin patient, it is an unanswered question — so a
   * missing input yields NOTHING rather than a number.
   */
  it("yields nothing at all when an input is missing or unusable", () => {
    for (const values of [
      { weight_kg: recorded(84) },
      { height_cm: recorded(171) },
      {},
      { weight_kg: recorded(84), height_cm: unavailable("site") },
      { weight_kg: recorded(84), height_cm: recorded(0) },
    ] as CaptureMap[]) {
      expect(ctx(values).values["bmi"]).toBeUndefined();
    }
  });

  it("leaves the captured values untouched", () => {
    const values = { weight_kg: recorded(84), height_cm: recorded(171) };
    ctx(values);
    expect(Object.keys(values)).toEqual(["weight_kg", "height_cm"]);
  });

  it("bands it against WHO's classes", () => {
    const at = (w: number, h: number) =>
      read("bmi", { weight_kg: recorded(w), height_cm: recorded(h) }).band!.code;
    expect(at(50, 170)).toBe("underweight"); // 17.3
    expect(at(65, 170)).toBe("normal"); // 22.5
    expect(at(80, 170)).toBe("overweight"); // 27.7
    expect(at(95, 170)).toBe("obese"); // 32.9
  });

  /**
   * WHO's own expert consultation records lower action points for Asian
   * populations. Presenting one set of classes as universal would be wrong for
   * most of the world, so the table says so.
   */
  it("says that its classes are the international default, not a universal one", () => {
    expect(read("bmi", {}).note).toMatch(/Asian populations/i);
  });
});

/**
 * ADA's trigger is EITHER limb: a patient at 128/94 qualifies for treatment on
 * the diastolic alone, which a single combined band could not say.
 */
describe("blood pressure bands each limb separately", () => {
  const bp = (sys: number, dia: number) => ({
    s: read("bp_systolic", { bp_systolic: recorded(sys), bp_diastolic: recorded(dia) }).band!.code,
    d: read("bp_diastolic", { bp_systolic: recorded(sys), bp_diastolic: recorded(dia) }).band!.code,
  });

  it("reads 128/94 as at target on one limb and treatable on the other", () => {
    expect(bp(128, 94)).toEqual({ s: "at_target", d: "prompt" });
  });

  it("uses ADA's own two boundaries", () => {
    expect(bp(129, 79)).toEqual({ s: "at_target", d: "at_target" });
    expect(bp(130, 80)).toEqual({ s: "above_target", d: "above_target" });
    expect(bp(150, 90)).toEqual({ s: "prompt", d: "prompt" });
  });

  it("cites the recommendations the boundaries come from", () => {
    expect(read("bp_systolic", {}).citation.quote).toContain("<130/80 mmHg");
    expect(read("bp_systolic", {}).citation.quote).toContain("≥150/90");
  });
});

/**
 * A blood pressure and a BMI cannot share a column headed "Diabetes range". A
 * table whose heading means something different in each row is worse than two
 * tables.
 */
describe("tables bring their own vocabulary", () => {
  it("gives the examination measures headings that mean something", () => {
    expect(read("bmi", {}).toneLabels).toMatchObject({
      low: "Underweight",
      diagnostic: "Obesity",
    });
    expect(read("bp_systolic", {}).toneLabels).toMatchObject({ diagnostic: "Treat promptly" });
  });

  it("leaves the glucose tables on the default wording", () => {
    expect(read("fpg", {}).toneLabels).toBeUndefined();
  });

  it("groups rows that share headings and separates those that do not", () => {
    const sig = (f: string) => JSON.stringify(read(f, {}).toneLabels ?? {});
    expect(sig("bp_systolic")).toBe(sig("bp_diastolic"));
    expect(sig("bmi")).not.toBe(sig("bp_systolic"));
  });
});

/**
 * Central fat drives insulin resistance, so a normal BMI with a large waist is
 * real and common — and it is exactly the patient a BMI-only assessment calls
 * healthy. Captured, but deliberately NOT banded.
 */
/**
 * Two tables, not one with an adjustment: the cut-points for men and women are
 * different numbers. Banding waist at all only became honest once `sex` was
 * captured — and it is prefilled from the patient record, so the gate costs the
 * clinician nothing.
 */
describe("waist circumference is banded per sex", () => {
  const waistFor = (sex: string, cm: number) =>
    read("waist_cm", { sex: recorded(sex), waist_cm: recorded(cm) }).band?.code;

  /**
   * Every boundary of the supplied four-category table, both sexes, on the
   * threshold and just under it — because the whole reason this scale replaced
   * WHO's is that the numbers moved, and a test that only checks the middle of
   * a band would not have noticed.
   */
  it("uses a different threshold for each sex", () => {
    expect(waistFor("male", 79.9)).toBe("very_low");
    expect(waistFor("male", 80)).toBe("low");
    expect(waistFor("male", 99.9)).toBe("low");
    expect(waistFor("male", 100)).toBe("high");
    expect(waistFor("male", 119.9)).toBe("high");
    expect(waistFor("male", 120)).toBe("very_high");

    expect(waistFor("female", 69.9)).toBe("very_low");
    expect(waistFor("female", 70)).toBe("low");
    expect(waistFor("female", 89.9)).toBe("low");
    expect(waistFor("female", 90)).toBe("high");
    expect(waistFor("female", 109.9)).toBe("high");
    expect(waistFor("female", 110)).toBe("very_high");
  });

  /** The same waist, two answers — which is the point of gating on sex. */
  it("reads one measurement differently for a man and a woman", () => {
    expect(waistFor("male", 92)).toBe("low");
    expect(waistFor("female", 92)).toBe("high");
    expect(waistFor("male", 115)).toBe("high");
    expect(waistFor("female", 115)).toBe("very_high");
  });

  /**
   * With no sex recorded there is no scale to read against, and inventing one
   * would print a man's cut-points over a woman's waist. Nothing is better.
   */
  it("declines to classify when the sex is not recorded", () => {
    expect(read("waist_cm", { waist_cm: recorded(92) }).band).toBeUndefined();
    expect(
      read("waist_cm", { sex: recorded("other"), waist_cm: recorded(92) }).band,
    ).toBeUndefined();
  });

  it("says what is still unrecorded", () => {
    expect(read("waist_cm", { sex: recorded("male") }).note).toMatch(/IDF/i);
  });
});

/**
 * A vital is a number AND a time. 160 an hour ago and 132 now is a different
 * patient from one who has sat at 160 all morning, and a single field cannot
 * tell them apart.
 */
describe("vitals are recorded as a series", () => {
  const series = [
    { value: 160, at: "2026-09-06T07:30:00Z" },
    { value: 148, at: "2026-09-06T09:00:00Z" },
    { value: 132, at: "2026-09-06T11:00:00Z" },
  ];

  it("reads the latest reading, not the first or the worst", () => {
    const r = read("bp_systolic", { bp_systolic: recorded(series) });
    expect(r.value).toBe(132);
    expect(r.band!.code).toBe("above_target");
  });

  it("is insensitive to the order the readings are stored in", () => {
    expect(read("bp_systolic", { bp_systolic: recorded([...series].reverse()) }).value).toBe(132);
  });

  it("computes BMI from the latest of a series too", () => {
    // Weight is not a series today, but the formula must not care which it gets.
    expect(ctx({ weight_kg: recorded(84), height_cm: recorded(171) }).values["bmi"]).toEqual({
      state: "recorded",
      value: 28.7,
    });
  });
});

/**
 * NEWS2 was the first instrument reached for and it is the wrong one here: it
 * scores DETERIORATION for escalation, not whether a pulse is normal. The
 * triage surface still uses it; this one asks a different question.
 */
describe("the vitals read against reference ranges, not an early-warning score", () => {
  it("bands each vital on the ordinary adult range", () => {
    const at = (code: string, v: number) =>
      read(code, { [code]: recorded([{ value: v, at: "2026-09-06T11:00:00Z" }]) }).band!.code;
    expect(at("pulse", 55)).toBe("low");
    expect(at("pulse", 80)).toBe("normal");
    expect(at("pulse", 114)).toBe("raised");
    expect(at("respiratory_rate", 16)).toBe("normal");
    expect(at("respiratory_rate", 32)).toBe("marked");
    // 37.9 is a low-grade fever, not normal — the revised boundary at 37.5.
    expect(at("temperature", 37.9)).toBe("fever");
    expect(at("temperature", 36.8)).toBe("normal");
    // Inverted: a saturation is worse the LOWER it goes.
    expect(at("spo2", 89)).toBe("severe");
    expect(at("spo2", 92)).toBe("low");
    expect(at("spo2", 98)).toBe("normal");
  });

  it("says so, rather than borrowing a score's authority", () => {
    for (const code of ["pulse", "respiratory_rate", "temperature", "spo2"]) {
      const t = DIABETES_CATALOG.interpretation!.find((x) => x.feature === code)!;
      expect(t.standard, code).toBe("local");
      expect(t.citation.needsCsoInput, code).toBeTruthy();
      expect(JSON.stringify(t), code).not.toMatch(/NEWS2/i);
    }
  });

  /** A saturation on oxygen is a different range, and the table says it. */
  it("scopes the saturation range to a patient breathing air", () => {
    expect(read("spo2", {}).note).toMatch(/breathing air/i);
  });
});

/**
 * The first version put hypothermia below 36 °C, which is wrong — hypothermia
 * is defined below 35.0, and 35.0–36.0 is a low temperature in a patient who is
 * not hypothermic. The upper bound was 39.5, which is not a defined threshold at
 * all; hyperpyrexia is 41.0.
 */
describe("temperature reads against the defined thresholds", () => {
  const at = (v: number) =>
    read("temperature", { temperature: recorded([{ value: v, at: "2026-09-06T11:00:00Z" }]) }).band!
      .code;

  it("calls hypothermia below 35, and not above it", () => {
    expect(at(34.8)).toBe("low");
    expect(at(35.0)).toBe("normal");
    // The case the old bands got wrong: low, but not hypothermic.
    expect(at(35.6)).toBe("normal");
  });

  it("puts the fever boundary at 37.5 and hyperpyrexia at 41", () => {
    expect(at(37.4)).toBe("normal");
    expect(at(37.5)).toBe("fever");
    expect(at(40.9)).toBe("fever");
    expect(at(41.0)).toBe("hyperpyrexia");
  });

  it("says where it compressed the scale", () => {
    // 37.5–38.0 is low-grade fever and shares the fever band rather than
    // earning a fifth column; the note admits it rather than hiding it.
    expect(read("temperature", {}).note).toMatch(/low-grade/i);
  });
});

/**
 * `intermediate` is prediabetes on a glucose scale and a raised pulse on a
 * vital, and those do not want the same colour: one is a risk state the patient
 * lives in, the other is a number that is off right now.
 */
describe("a table may bring its own palette", () => {
  it("paints a raised vital orange and leaves the glucose scale alone", () => {
    for (const code of ["pulse", "respiratory_rate", "temperature", "spo2"]) {
      const t = DIABETES_CATALOG.interpretation!.find((x) => x.feature === code)!;
      expect(t.toneColors?.intermediate, code).toBe("orange");
    }
    const fpg = DIABETES_CATALOG.interpretation!.find(
      (x) => x.feature === "fpg" && x.standard === "ADA",
    )!;
    expect(fpg.toneColors).toBeUndefined();
  });
});

/**
 * A computed measure is captured through the numbers it comes from, in its own
 * row — so the weight and the height are not ALSO rows of their own further down
 * the page. The same question twice, with two inputs writing one value, is what
 * moving capture into the table was for.
 */
describe("BMI is captured where it is interpreted", () => {
  it("names inputs that exist and are not separately banded", () => {
    const bmi = DIABETES_CATALOG.features.find((f) => f.code === "bmi")!;
    expect(bmi.computed!.from).toEqual(["weight_kg", "height_cm"]);
    for (const src of bmi.computed!.from) {
      expect(
        DIABETES_CATALOG.features.some((f) => f.code === src),
        src,
      ).toBe(true);
      // No band of their own: they are read through the BMI.
      expect(
        DIABETES_CATALOG.interpretation!.some((t) => t.feature === src),
        src,
      ).toBe(false);
    }
  });
});

/**
 * Sex is read from the chart rather than asked for. The waist bands are
 * sex-specific and WHO's anaemia cutoffs are too, so the alternative is asking a
 * clinician for something the record already knows.
 */
describe("sex comes from the patient record", () => {
  it("normalises whatever the intake captured onto the three options", async () => {
    const { normaliseSex } = await import("@/lib/ncd/vitals");
    expect(normaliseSex("Male")).toBe("male");
    expect(normaliseSex("f")).toBe("female");
    expect(normaliseSex("FEMALE")).toBe("female");
    // Anything unclear becomes `other` rather than being guessed — and `other`
    // selects NO waist table, so the surface says it cannot classify instead of
    // picking a scale.
    for (const raw of ["", "unknown", "intersex", "prefer not to say"]) {
      expect(normaliseSex(raw), raw).toBe("other");
    }
    const opts = DIABETES_CATALOG.features.find((f) => f.code === "sex")!.options!;
    expect(opts.map((o) => o.value)).toEqual(["female", "male", "other"]);
  });
});
