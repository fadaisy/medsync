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
  it("puts every interpreted test in one section", () => {
    const sections = new Set(
      (DIABETES_CATALOG.interpretation ?? []).map(
        (t) => DIABETES_CATALOG.features.find((f) => f.code === t.feature)!.section,
      ),
    );
    expect([...sections]).toEqual(["glycaemia"]);
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
