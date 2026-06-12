import type { NeuroExam } from "@/lib/clerkship/exam/neurological";
import { describe, expect, it } from "vitest";

import {
  matchNeuroPatterns,
  neuroReasoningTokens,
  normalNeuroExam,
  renderNeuroProse,
} from "@/lib/clerkship/exam/neurological";

describe("matchNeuroPatterns — sign-cluster → localisation (decision-support)", () => {
  it("nothing recorded → no localisation (never auto-diagnoses)", () => {
    expect(matchNeuroPatterns({})).toEqual([]);
  });

  it("a normal exam surfaces no localisation", () => {
    expect(matchNeuroPatterns(normalNeuroExam())).toEqual([]);
  });

  it("spastic tone + brisk reflexes + upgoing plantar → UMN", () => {
    const c: NeuroExam = {
      tone: { r_arm: "spastic" },
      reflexes: { r_arm: "brisk" },
      plantar: { right: "up" },
    };
    expect(matchNeuroPatterns(c).map((p) => p.key)).toContain("umn");
  });

  it("flaccid tone + absent reflexes + wasting + fasciculations → LMN", () => {
    const c: NeuroExam = {
      tone: { l_arm: "flaccid" },
      reflexes: { l_arm: "absent" },
      wasting: true,
      fasciculations: true,
    };
    expect(matchNeuroPatterns(c).map((p) => p.key)).toContain("lmn");
  });

  it("UMN + one-sided arm+leg weakness → acute stroke (must-not-miss)", () => {
    const c: NeuroExam = {
      tone: { r_arm: "spastic", r_leg: "spastic" },
      reflexes: { r_arm: "brisk" },
      plantar: { right: "up" },
      power: { r_arm: 3, r_leg: 3 },
    };
    const out = matchNeuroPatterns(c);
    expect(out.map((p) => p.key)).toContain("stroke");
    expect(out.find((p) => p.key === "stroke")?.mustNotMiss).toBe(true);
  });

  it("GCS ≤8 → airway emergency, ranked first", () => {
    const out = matchNeuroPatterns({ gcsE: 1, gcsV: 2, gcsM: 4 }); // 7
    expect(out[0]?.key).toBe("reduced_gcs");
    expect(out[0]?.emergency).toBe(true);
  });

  it("papilloedema + reduced GCS → raised ICP", () => {
    const c: NeuroExam = {
      gcsE: 3,
      gcsV: 4,
      gcsM: 5, // 12
      findings: [
        {
          code: "cn_fundi",
          group: "neuro_cn",
          display: "II — fundoscopy",
          state: "present",
          values: ["papilloedema"],
        },
      ],
    };
    expect(matchNeuroPatterns(c).map((p) => p.key)).toContain("raised_icp");
  });

  it("sensory level → cord compression (emergency)", () => {
    const out = matchNeuroPatterns({ sensoryPattern: "sensory_level" });
    expect(out.find((p) => p.key === "cord_compression")?.emergency).toBe(true);
  });

  it("cauda equina screen positive → cauda equina (emergency)", () => {
    const out = matchNeuroPatterns({ caudaEquina: ["saddle anaesthesia", "reduced anal tone"] });
    expect(out.find((p) => p.key === "cauda_equina")?.emergency).toBe(true);
  });

  it("meningism → meningitis/SAH prompt (must-not-miss)", () => {
    const out = matchNeuroPatterns({ meningism: ["neck stiffness", "Kernig's sign"] });
    expect(out.find((p) => p.key === "meningism")?.mustNotMiss).toBe(true);
  });

  it("glove-and-stocking + distal pattern → peripheral neuropathy (Uganda list)", () => {
    const out = matchNeuroPatterns({
      sensoryPattern: "glove_and_stocking",
      powerPattern: "distal",
    });
    expect(out.find((p) => p.key === "peripheral_neuropathy")?.signature).toMatch(/leprosy/);
  });

  it("cogwheel rigidity + parkinsonian gait → parkinsonism", () => {
    expect(
      matchNeuroPatterns({ tone: { r_arm: "rigid" }, gait: "parkinsonian" }).map((p) => p.key),
    ).toContain("parkinsonism");
  });

  it("DANISH cerebellar signs → cerebellar", () => {
    expect(
      matchNeuroPatterns({ cerebellarSigns: ["ataxia", "intention tremor"] }).map((p) => p.key),
    ).toContain("cerebellar");
  });
});

describe("renderNeuroProse + reasoning tokens", () => {
  it("renders GCS + structured grades + localisation as flowing narrative", () => {
    const c: NeuroExam = {
      gcsE: 4,
      gcsV: 5,
      gcsM: 6,
      tone: { r_arm: "spastic", r_leg: "spastic" },
      power: { r_arm: 3, r_leg: 3 },
      powerPattern: "pyramidal",
      reflexes: { r_arm: "brisk" },
      plantar: { right: "up" },
    };
    const s = renderNeuroProse(c);
    expect(s).toMatch(/^On neurological examination, /);
    expect(s).toContain("the GCS is 15/15");
    expect(s).toContain("3/5 in the R arm");
    expect(s).toContain("the right plantar is upgoing");
    expect(s).toMatch(/stroke|upper motor neurone/i);
    expect(neuroReasoningTokens(c).positives.join(" ")).toMatch(/focal weakness/);
  });

  it("empty exam → empty string", () => {
    expect(renderNeuroProse({})).toBe("");
  });
});
