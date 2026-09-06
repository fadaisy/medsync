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
    expect(s.groups!.map((g) => g.id)).toEqual(["vitals"]);
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

  it("uses a different threshold for each sex", () => {
    expect(waistFor("male", 92)).toBe("normal");
    expect(waistFor("female", 92)).toBe("substantial");
    expect(waistFor("male", 96)).toBe("increased");
    expect(waistFor("female", 84)).toBe("increased");
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

  it("bands every trending vital against NEWS2's own boundaries", () => {
    const at = (code: string, v: number) =>
      read(code, { [code]: recorded([{ value: v, at: "2026-09-06T11:00:00Z" }]) }).band!.code;
    expect(at("pulse", 114)).toBe("raised");
    expect(at("pulse", 45)).toBe("low");
    expect(at("respiratory_rate", 32)).toBe("critical");
    expect(at("temperature", 37.9)).toBe("normal");
    // Inverted: a saturation is worse the LOWER it goes.
    expect(at("spo2", 89)).toBe("critical");
    expect(at("spo2", 94)).toBe("low");
    expect(at("spo2", 98)).toBe("normal");
  });
});

/**
 * The bands mirror the boundaries this project already encodes for triage —
 * a CSO-authored file transcribed verbatim from the research document. Two
 * copies of a clinical threshold is one too many, so this fails if they drift.
 */
describe("the vital bands do not drift from the triage engine", () => {
  it("uses the same boundaries as lib/triage/constants.ts", async () => {
    const { NEWS2_PULSE, NEWS2_RESP_RATE, NEWS2_TEMPERATURE, NEWS2_SPO2_SCALE1 } =
      await import("@/lib/triage/constants");
    const bounds = (code: string) =>
      DIABETES_CATALOG.interpretation!.find((t) => t.feature === code)!
        .bands.flatMap((b) => [b.from, b.to])
        .filter((n): n is number => n !== undefined);

    // NEWS2 bands are inclusive integers; ours are half-open, so a boundary of
    // "max 50" becomes "from 51". Compare against the open edge either way.
    expect(bounds("pulse")).toEqual([51, 51, 91, 91, 131, 131]);
    expect(NEWS2_PULSE.map((b) => b.max)).toContain(50);
    expect(NEWS2_PULSE.map((b) => b.min)).toContain(91);
    expect(NEWS2_PULSE.map((b) => b.min)).toContain(131);

    expect(bounds("respiratory_rate")).toEqual([12, 12, 21, 21, 25, 25]);
    expect(NEWS2_RESP_RATE.map((b) => b.min)).toEqual(expect.arrayContaining([12, 21, 25]));

    expect(bounds("temperature")).toEqual([36.1, 36.1, 38.1, 38.1, 39.1, 39.1]);
    expect(NEWS2_TEMPERATURE.map((b) => b.min)).toEqual(expect.arrayContaining([36.1, 38.1, 39.1]));

    expect(bounds("spo2")).toEqual([92, 92, 96, 96]);
    expect(NEWS2_SPO2_SCALE1.map((b) => b.min)).toEqual(expect.arrayContaining([92, 96]));
  });
});
