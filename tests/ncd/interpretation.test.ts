import type { NcdCatalog } from "@/lib/ncd/catalog/schema";
import { describe, expect, it } from "vitest";

import { DIABETES_CATALOG, DISTRICT_SITE, REFERRAL_SITE } from "@/lib/ncd/catalog/diabetes";
import { bandFor, recorded } from "@/lib/ncd/catalog/schema";
import { errorsOf, validateCatalog } from "@/lib/ncd/catalog/validate";
import { interpretations, ncdContext } from "@/lib/ncd/engine/assess";

const read = (values: Parameters<typeof ncdContext>[1], site = REFERRAL_SITE) =>
  interpretations(DIABETES_CATALOG, ncdContext(DIABETES_CATALOG, values, site));
const of = (feature: string, values: Parameters<typeof ncdContext>[1], site = REFERRAL_SITE) =>
  read(values, site).find((i) => i.feature === feature)!;

describe("the interpretation table follows the site's standard", () => {
  /**
   * THE CASE THE WHOLE PER-STANDARD DESIGN EXISTS FOR. A fasting glucose of
   * 5.8 mmol/L is prediabetes to ADA and entirely normal to WHO, because WHO
   * kept its cut-point at 6.1 having considered 5.6 and declined it. One table
   * would have to pick a side and present it as the answer.
   */
  it("reads 5.8 mmol/L as prediabetes under ADA and normal under WHO", () => {
    const values = { fpg: recorded(5.8) };
    expect(of("fpg", values, REFERRAL_SITE)).toMatchObject({
      standard: "ADA",
      band: { code: "intermediate" },
    });
    expect(of("fpg", values, DISTRICT_SITE)).toMatchObject({
      standard: "WHO",
      band: { code: "normal" },
    });
  });

  it("agrees on the diabetes threshold, which no standard disputes", () => {
    for (const site of [REFERRAL_SITE, DISTRICT_SITE]) {
      expect(of("fpg", { fpg: recorded(7.0) }, site).band, site.id).toMatchObject({
        code: "diagnostic",
      });
      expect(of("fpg", { fpg: recorded(6.9) }, site).band, site.id).not.toMatchObject({
        code: "diagnostic",
      });
    }
  });

  it("agrees on the OGTT bands, where the standards do not differ", () => {
    for (const site of [REFERRAL_SITE, DISTRICT_SITE]) {
      expect(of("ogtt_2h", { ogtt_2h: recorded(9.2) }, site).band!.code, site.id).toBe(
        "intermediate",
      );
    }
  });

  /**
   * WHO accepts HbA1c to diagnose but publishes no prediabetes range. The
   * absence is stated rather than filled in from ADA — borrowing one body's
   * band and printing it under another's name is the exact failure the
   * standard-precedence design exists to prevent.
   */
  it("states the gap where WHO publishes no intermediate band", () => {
    const who = DIABETES_CATALOG.interpretation!.find((t) => t.id === "hba1c_who")!;
    expect(who.bands.map((b) => b.tone)).toEqual(["normal", "diagnostic"]);
    expect(who.note).toBeTruthy();
    const ada = DIABETES_CATALOG.interpretation!.find((t) => t.id === "hba1c_ada")!;
    expect(ada.bands.some((b) => b.tone === "intermediate")).toBe(true);
  });

  it("distinguishes not measured from cannot be measured here", () => {
    expect(of("fpg", {}, REFERRAL_SITE).state).toBe("insufficient");
    expect(of("hba1c", {}, DISTRICT_SITE).state).toBe("unavailable");
    expect(of("fpg", {}, REFERRAL_SITE).band).toBeUndefined();
  });

  /**
   * A random glucose below the threshold excludes nothing, and the band says
   * so rather than reading as reassurance.
   */
  it("does not let a low random glucose read as normal", () => {
    const r = of("random_pg", { random_pg: recorded(8) });
    expect(r.band!.tone).toBe("normal");
    expect(r.band!.display).toMatch(/does not exclude/i);
  });
});

describe("bands tile the number line", () => {
  it("puts every value in exactly one band, with no gap at a boundary", () => {
    for (const t of DIABETES_CATALOG.interpretation ?? []) {
      for (const v of [0, 5.5, 5.6, 5.7, 6.0, 6.1, 6.4, 6.5, 6.9, 7.0, 7.8, 11.0, 11.1, 40]) {
        const hits = t.bands.filter(
          (b) => (b.from === undefined || v >= b.from) && (b.to === undefined || v < b.to),
        );
        expect(hits.length, `${t.id} @ ${v}`).toBe(1);
        expect(bandFor(t.bands, v), `${t.id} @ ${v}`).toBe(hits[0]);
      }
    }
  });

  it("treats a boundary as belonging to the band above it", () => {
    // 7.0 is the diabetes cut-point, so 7.0 is diabetes and 6.99 is not.
    expect(of("fpg", { fpg: recorded(7.0) }).band!.code).toBe("diagnostic");
    expect(of("fpg", { fpg: recorded(6.99) }).band!.code).toBe("intermediate");
  });
});

/**
 * The table and the diagnostic criteria are two renderings of the same numbers.
 * Without a check binding them, the first edit to either one makes the surface
 * disagree with the verdict printed beneath it.
 */
describe("the table cannot drift from the criteria", () => {
  const withBand = (from: number): NcdCatalog => ({
    ...DIABETES_CATALOG,
    interpretation: [
      {
        id: "probe",
        feature: "fpg",
        standard: "ADA",
        version: "v",
        citation: DIABETES_CATALOG.interpretation![0]!.citation,
        bands: [
          { code: "normal", display: "n", to: from, tone: "normal" },
          { code: "diagnostic", display: "d", from, tone: "diagnostic" },
        ],
      },
    ],
  });

  it("accepts a diagnostic boundary the criteria actually use", () => {
    expect(errorsOf(validateCatalog(withBand(7.0)))).toEqual([]);
  });

  it("rejects one they do not", () => {
    const errs = errorsOf(validateCatalog(withBand(6.8))).map((e) => e.message);
    expect(errs.some((m) => m.includes("not a threshold ADA uses"))).toBe(true);
  });

  it("rejects bands that leave a gap or overlap", () => {
    const gapped: NcdCatalog = {
      ...DIABETES_CATALOG,
      interpretation: [
        {
          ...DIABETES_CATALOG.interpretation![0]!,
          id: "gap",
          bands: [
            { code: "normal", display: "n", to: 5.6, tone: "normal" },
            { code: "intermediate", display: "i", from: 6.0, to: 7.0, tone: "intermediate" },
            { code: "diagnostic", display: "d", from: 7.0, tone: "diagnostic" },
          ],
        },
      ],
    };
    expect(
      errorsOf(validateCatalog(gapped)).some((e) => e.message.includes("gap or overlap")),
    ).toBe(true);
  });

  it("every shipped table is open at both ends", () => {
    for (const t of DIABETES_CATALOG.interpretation ?? []) {
      expect(t.bands[0]!.from, t.id).toBeUndefined();
      expect(t.bands[t.bands.length - 1]!.to, t.id).toBeUndefined();
    }
  });
});

/**
 * A band is where a number sits; a diagnosis weighs confirmation and validity.
 * A single unconfirmed fasting glucose in the diabetes range must show as
 * diabetes-range AND as not-yet-established, and a table that doubled as a
 * verdict could not say both.
 */
describe("a band is not a verdict", () => {
  it("shows a diagnostic band while the diagnosis is still unestablished", async () => {
    const { buildProfile } = await import("@/lib/ncd/profile");
    const p = buildProfile({
      catalog: DIABETES_CATALOG,
      values: { fpg: recorded(9.1) },
      site: REFERRAL_SITE,
    });
    expect(p.interpretation.find((i) => i.feature === "fpg")!.band!.code).toBe("diagnostic");
    expect(p.diagnosis.state).not.toBe("met");
  });
});

/**
 * The table renders under the section holding the tests it reads, and which
 * section that is comes from the catalog rather than from a hardcoded id in the
 * component — so hypertension gets its blood-pressure bands under whichever
 * section it files them in, with no UI change.
 */
describe("the table belongs to a section, derived from the catalog", () => {
  /**
   * Was a single section when glycaemia held the only tables; the examination
   * now bands a BMI and a blood pressure too. What still has to hold is that a
   * table lands in a section that EXISTS — a table whose feature belongs
   * nowhere would render nowhere, silently.
   */
  it("puts every interpreted test in a section the catalog declares", () => {
    const declared = new Set(DIABETES_CATALOG.sections.map((s) => s.id));
    const sections = new Set(
      (DIABETES_CATALOG.interpretation ?? []).map(
        (t) => DIABETES_CATALOG.features.find((f) => f.code === t.feature)!.section,
      ),
    );
    expect([...sections].sort()).toEqual(["examination", "glycaemia"]);
    for (const id of sections) expect(declared.has(id), id).toBe(true);
  });

  it("names a feature that exists, so a table can never render nowhere", () => {
    for (const t of DIABETES_CATALOG.interpretation ?? []) {
      expect(
        DIABETES_CATALOG.features.some((f) => f.code === t.feature),
        t.id,
      ).toBe(true);
    }
  });
});

/**
 * The table now CAPTURES the tests it reads, so a feature appearing twice would
 * put the same question on screen twice — once in the table and once in the card
 * beneath it — with two inputs writing the same value.
 */
describe("one row per test", () => {
  it("returns exactly one row for each interpreted feature, under either site", () => {
    for (const site of [REFERRAL_SITE, DISTRICT_SITE]) {
      const codes = read({}, site).map((i) => i.feature);
      expect(new Set(codes).size, site.id).toBe(codes.length);
    }
  });

  it("leaves the section's uninterpreted tests to the card below", () => {
    const interpreted = new Set(read({}).map((i) => i.feature));
    const rest = DIABETES_CATALOG.features.filter(
      (f) => f.section === "glycaemia" && !interpreted.has(f.code),
    );
    // Capillary glucose joined the table once it gained a hypoglycaemia band —
    // finding a low is the thing a bedside glucose is actually for. Only the
    // second-sample confirmation has no scale to be read on.
    expect(rest.map((f) => f.code)).toEqual(["second_sample_confirms"]);
  });
});

/**
 * Hypoglycaemia is the emergency on this scale — it kills faster than
 * hyperglycaemia and the treatment is the opposite — so it is the one band the
 * surface is allowed to animate for.
 */
describe("the hypoglycaemia band", () => {
  it("reads a low glucose as hypoglycaemia on every venous and bedside test", () => {
    for (const code of ["fpg", "random_pg", "capillary_glucose"]) {
      expect(of(code, { [code]: recorded(2.8) }).band, code).toMatchObject({ tone: "low" });
      expect(of(code, { [code]: recorded(3.9) }).band!.tone, code).not.toBe("low");
    }
  });

  it("uses ADA's in-range floor of 3.9 as the boundary", () => {
    expect(of("fpg", { fpg: recorded(3.89) }).band!.tone).toBe("low");
    expect(of("fpg", { fpg: recorded(3.9) }).band!.tone).toBe("normal");
  });

  /**
   * A capillary sample cannot diagnose diabetes — the standards define their
   * thresholds on venous plasma. Its table therefore has NO diagnostic band, and
   * a high bedside reading says so rather than implying a diagnosis.
   */
  it("gives the bedside test a hypo band and no diagnostic band", () => {
    const cap = DIABETES_CATALOG.interpretation!.find((t) => t.feature === "capillary_glucose")!;
    expect(cap.bands.map((b) => b.tone)).toEqual(["low", "normal"]);
    expect(of("capillary_glucose", { capillary_glucose: recorded(19) }).band!.display).toMatch(
      /not diagnostic/i,
    );
    expect(cap.note).toMatch(/cannot diagnose/i);
  });

  it("leaves HbA1c and the OGTT without a low band, which neither standard defines", () => {
    for (const code of ["hba1c", "ogtt_2h"]) {
      const t = DIABETES_CATALOG.interpretation!.find((x) => x.feature === code)!;
      expect(
        t.bands.some((b) => b.tone === "low"),
        code,
      ).toBe(false);
    }
  });
});

/**
 * A respiratory rate of 10 was announced as "Hypoglycaemia — treat now. Below
 * 3.0 mmol/L is ADA level 2". So were a pulse of 40 and a temperature of 34.5.
 *
 * The surface was keying its alarm off the TONE `low` — which had meant
 * hypoglycaemia when glucose was the only banded measure, and came to mean
 * "below normal on any scale" the moment the vitals were banded. The words were
 * hardcoded in the component too, so it asserted a glucose threshold over a
 * respiratory rate.
 *
 * An alert is now declared on the BAND, with its own words.
 */
describe("only a band that declares an alert raises one", () => {
  const ser = (v: number) => recorded([{ value: v, at: "2026-09-06T11:00:00Z" }]);
  const alerts = (values: Parameters<typeof ncdContext>[1]) =>
    read(values)
      .filter((r) => r.band?.alert)
      .map((r) => r.feature);

  it("stays silent on a low vital, which is below normal but not a hypo", () => {
    expect(alerts({ respiratory_rate: ser(10) })).toEqual([]);
    expect(alerts({ pulse: ser(40) })).toEqual([]);
    expect(alerts({ temperature: ser(34.5) })).toEqual([]);
    expect(alerts({ spo2: ser(88) })).toEqual([]);
  });

  it("still raises one on a low glucose, wherever it was measured", () => {
    expect(alerts({ capillary_glucose: recorded(2.8) })).toEqual(["capillary_glucose"]);
    expect(alerts({ fpg: recorded(3.1) })).toEqual(["fpg"]);
    expect(alerts({ random_pg: recorded(3.0) })).toEqual(["random_pg"]);
  });

  it("says nothing on a glucose that is high, or normal", () => {
    expect(alerts({ fpg: recorded(7.4) })).toEqual([]);
    expect(alerts({ fpg: recorded(5.0) })).toEqual([]);
  });

  /** The words are the catalog's, so no component asserts a threshold. */
  it("carries its own title and action, and only on the glucose bands", () => {
    const flagged = DIABETES_CATALOG.interpretation!.flatMap((t) =>
      t.bands.filter((b) => b.alert).map((b) => ({ feature: t.feature, band: b })),
    );
    expect([...new Set(flagged.map((f) => f.feature))].sort()).toEqual([
      "capillary_glucose",
      "fpg",
      "random_pg",
    ]);
    for (const f of flagged) {
      expect(f.band.alert!.title).toBe("Hypoglycaemia");
      expect(f.band.alert!.action).toMatch(/ADA level 2/);
    }
  });

  it("rejects an alert with nothing to do", () => {
    const broken = {
      ...DIABETES_CATALOG,
      interpretation: [
        {
          ...DIABETES_CATALOG.interpretation![0]!,
          id: "probe",
          bands: DIABETES_CATALOG.interpretation![0]!.bands.map((b, i) =>
            i === 0 ? { ...b, alert: { title: "x", action: "  " } } : b,
          ),
        },
      ],
    };
    expect(
      errorsOf(validateCatalog(broken)).some((e) => e.message.includes("no title or action")),
    ).toBe(true);
  });
});

/**
 * Colour is the fastest thing on the row, so it has to say the same thing the
 * word beside it says. Two rules hold across every table:
 *
 *  - a "raised but not an emergency" band is ORANGE, never red — an above-target
 *    blood pressure is a treatment trigger, and red is reserved here for things
 *    that need somebody now;
 *  - a tone override is declared on the table, not inferred by the surface, so a
 *    component cannot decide a pulse and a prediabetes deserve the same colour.
 */
describe("the raised bands are orange, and say so in the catalog", () => {
  const table = (id: string) => DIABETES_CATALOG.interpretation!.find((t) => t.id === id)!;

  it("colours both limbs of an above-target blood pressure orange", () => {
    for (const id of ["bp_systolic_ada", "bp_diastolic_ada"]) {
      expect(table(id).toneColors, id).toMatchObject({ intermediate: "orange" });
      expect(table(id).toneLabels, id).toMatchObject({ intermediate: "Above target" });
    }
  });

  it("keeps the treat-promptly band distinct from above target", () => {
    expect(of("bp_systolic", { bp_systolic: recorded(138) }).band).toMatchObject({
      code: "above_target",
      tone: "intermediate",
    });
    expect(of("bp_systolic", { bp_systolic: recorded(152) }).band).toMatchObject({
      code: "prompt",
      tone: "diagnostic",
    });
    expect(of("bp_diastolic", { bp_diastolic: recorded(84) }).band).toMatchObject({
      tone: "intermediate",
    });
  });

  /** No raised vital may be red. Red is the emergency colour and stays scarce. */
  it("never paints a raised vital red", () => {
    for (const t of DIABETES_CATALOG.interpretation!) {
      if (t.toneColors?.intermediate) {
        expect(t.toneColors.intermediate, t.id).not.toBe("red");
      }
    }
  });
});

/**
 * A BMI is DERIVED, never captured. The row that shows it reads the evaluation
 * context, because the capture map has no `bmi` in it and never will — reading
 * the capture map is why the calculated figure showed a dash next to a height
 * and a weight that were both filled in.
 */
describe("a computed measure reaches the row that displays it", () => {
  it("carries a value and a band once both inputs are in", () => {
    const values = { weight_kg: recorded(84), height_cm: recorded(171) };
    expect(of("bmi", values)).toMatchObject({ value: 28.7, state: "met" });
    expect(of("bmi", values).band).toBeDefined();
    // The source of truth is untouched — the whole point of deriving it.
    expect(Object.keys(values).sort()).toEqual(["height_cm", "weight_kg"]);
  });

  it("carries no value while either input is missing", () => {
    expect(of("bmi", { weight_kg: recorded(84) }).value).toBeUndefined();
    expect(of("bmi", { height_cm: recorded(171) }).value).toBeUndefined();
    expect(of("bmi", {}).value).toBeUndefined();
  });
});
