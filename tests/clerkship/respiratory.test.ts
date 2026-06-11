import type { RespExam } from "@/lib/clerkship/exam/respiratory";
import { describe, expect, it } from "vitest";

import {
  matchRespPatterns,
  normalRespExam,
  renderRespProse,
  respReasoningTokens,
} from "@/lib/clerkship/exam/respiratory";

describe("matchRespPatterns — sign-cluster → pattern (decision-support)", () => {
  it("nothing recorded → no pattern (never auto-diagnoses)", () => {
    expect(matchRespPatterns({})).toEqual([]);
  });

  it("a normal exam surfaces no pattern", () => {
    expect(matchRespPatterns(normalRespExam())).toEqual([]);
  });

  it("stony dull + reduced sounds + reduced VR → pleural effusion", () => {
    const r: RespExam = {
      percussion: { lower_right: "stony_dull" },
      breathSounds: { lower_right: "reduced" },
      vocalResonance: { lower_right: "reduced" },
    };
    expect(matchRespPatterns(r).map((p) => p.key)).toContain("effusion");
  });

  it("dull + bronchial + increased VR → consolidation", () => {
    const r: RespExam = {
      percussion: { lower_left: "dull" },
      breathSounds: { lower_left: "bronchial" },
      vocalResonance: { lower_left: "increased" },
    };
    expect(matchRespPatterns(r).map((p) => p.key)).toContain("consolidation");
  });

  it("hyper-resonant + absent sounds + trachea deviated → tension pneumothorax (must-not-miss, ranked first)", () => {
    const r: RespExam = {
      percussion: { upper_right: "hyper_resonant" },
      breathSounds: { upper_right: "absent" },
      trachea: "deviated_left",
    };
    const out = matchRespPatterns(r);
    expect(out.map((p) => p.key)).toContain("tension_pneumothorax");
    expect(out[0]?.mustNotMiss).toBe(true);
  });

  it("stridor → upper-airway emergency, regardless of cluster", () => {
    const out = matchRespPatterns({ addedSounds: { upper_right: ["stridor"] } });
    expect(out.find((p) => p.key === "stridor")?.emergency).toBe(true);
  });

  it("fine crackles → fibrosis", () => {
    expect(
      matchRespPatterns({
        addedSounds: { lower_left: ["crackles_fine"], lower_right: ["crackles_fine"] },
      }).map((p) => p.key),
    ).toContain("fibrosis");
  });

  it("AMBIGUOUS: dull + reduced sounds, VR not tested → broadens to multiple patterns", () => {
    const r: RespExam = {
      percussion: { lower_right: "dull" },
      breathSounds: { lower_right: "reduced" },
      // VR deliberately not recorded
    };
    const keys = matchRespPatterns(r).map((p) => p.key);
    expect(keys).toEqual(expect.arrayContaining(["consolidation", "effusion", "collapse"]));
    expect(keys.length).toBeGreaterThanOrEqual(3);
  });
});

describe("renderRespProse — zonal + patterns; honest", () => {
  it("describes zonal abnormalities + surfaces the pattern", () => {
    const r: RespExam = {
      percussion: { lower_right: "stony_dull" },
      breathSounds: { lower_right: "reduced" },
      vocalResonance: { lower_right: "reduced" },
      trachea: "deviated_left",
    };
    const s = renderRespProse(r);
    expect(s).toMatch(/stony dull/);
    expect(s).toMatch(/effusion/i);
    expect(s).toMatch(/trachea/i);
  });

  it("empty exam → empty string", () => {
    expect(renderRespProse({})).toBe("");
  });
});

describe("respReasoningTokens — feeds the differential", () => {
  it("matched patterns + findings become positives", () => {
    const r: RespExam = {
      percussion: { lower_right: "stony_dull" },
      breathSounds: { lower_right: "reduced" },
      vocalResonance: { lower_right: "reduced" },
    };
    expect(respReasoningTokens(r).positives.join(" ")).toMatch(/effusion/i);
  });
});
