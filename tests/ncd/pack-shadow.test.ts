/** Shadow mode: the live capture translates only where meanings match, and the log holds no value. */
import { describe, expect, it } from "vitest";

import { recorded } from "@/lib/ncd/catalog/schema";
import { runDiabetesPack } from "@/lib/ncd/pack";
import { shadowInput, shadowSummary, translateCapture } from "@/lib/ncd/pack/shadow";

describe("translateCapture", () => {
  it("maps same and renamed codes, the medicine list and the sulfonylurea agent", () => {
    const v = translateCapture({
      polyuria: recorded(true),
      fpg: recorded(7.4),
      dm_status: recorded("known"),
      glucose_lowering_therapy: recorded(["metformin", "sulfonylurea"]),
      sulfonylurea_agent: recorded("gliclazide"),
      bp_systolic: recorded([
        { value: 150, at: "2026-10-05T08:00:00Z" },
        { value: 142, at: "2026-10-05T09:00:00Z" },
      ]),
    });
    expect(v).toEqual({
      polyuria: true,
      fasting_pg: 7.4,
      dm_status: "known",
      glucose_lowering_therapy: ["metformin", "gliclazide"],
      bp_systolic: 142,
    });
  });
  it("maps a broader live field only in the safe direction, and reads nothing from a not-assessed one", () => {
    const v = translateCapture({
      reduced_urine_output: recorded(true),
      treatment_omission: recorded(true),
      visual_symptoms: recorded(true),
      polyuria: { state: "not_assessed" },
    });
    // 'Much less urine' reads as anuria (a referral) and vision problems as blurred vision (a test);
    // a missed treatment is never 'insulin omitted' unless insulin is on the list (no false emergency).
    expect(v).toEqual({ anuria: true, blurred_vision: true });
    expect(
      translateCapture({
        treatment_omission: recorded(true),
        glucose_lowering_therapy: recorded(["insulin"]),
      }),
    ).toMatchObject({ insulin_omitted: true });
  });
  it("a 'none' diabetes status is 'not known', never 'known'", () => {
    expect(translateCapture({ dm_status: recorded("none") })).toEqual({ dm_status: "not_known" });
  });
});

describe("shadowInput", () => {
  it("derives 'could be pregnant' from sex and age by REF-PREG-AGE (12 to 50), unless the capture said", () => {
    const at = (ageYears: number | undefined, sex?: string) =>
      shadowInput(sex ? { sex: recorded(sex) } : {}, { ageYears }).values.pregnancy_possible;
    expect(at(30, "female")).toBe(true);
    expect(at(70, "female")).toBe(false);
    expect(at(11)).toBe(false);
    expect(at(undefined, "female")).toBeUndefined();
    expect(at(30, "male")).toBeUndefined();
  });
});

describe("shadow summary", () => {
  it("holds rule ids and counts, never a value", () => {
    const r = runDiabetesPack(
      shadowInput(
        {
          dm_status: recorded("known"),
          glucose_lowering_therapy: recorded(["insulin"]),
          capillary_glucose: recorded(2.4),
        },
        { ageYears: 40 },
      ),
    );
    const s = shadowSummary(r);
    expect(s.interrupt).toBe("DM-ACU-ROUTE-06");
    expect(JSON.stringify(s)).not.toContain("2.4");
  });
});
