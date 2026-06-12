import type { MskExam } from "@/lib/clerkship/exam/musculoskeletal";
import { describe, expect, it } from "vitest";

import {
  matchMskPatterns,
  mskReasoningTokens,
  normalMskExam,
  renderMskProse,
} from "@/lib/clerkship/exam/musculoskeletal";

describe("matchMskPatterns — arthropathy/red-flag patterns (decision-support)", () => {
  it("nothing recorded → no pattern (never auto-diagnoses)", () => {
    expect(matchMskPatterns({})).toEqual([]);
  });

  it("a normal GALS/MSK exam surfaces no pattern", () => {
    expect(matchMskPatterns(normalMskExam())).toEqual([]);
  });

  it("acute hot swollen joint → septic arthritis (emergency, ranked first)", () => {
    const out = matchMskPatterns({ hotSwollenJoint: true });
    expect(out[0]?.key).toBe("septic_arthritis");
    expect(out[0]?.emergency).toBe(true);
  });

  it("hot monoarticular 1st MTP → SEPTIC AND gout both surfaced (broadening)", () => {
    const c: MskExam = {
      hotSwollenJoint: true,
      distribution: "monoarticular",
      regions: [{ id: "1", region: "ankle_foot", side: "right", look: ["podagra (1st MTP)"] }],
    };
    const keys = matchMskPatterns(c).map((p) => p.key);
    expect(keys).toContain("septic_arthritis");
    expect(keys).toContain("gout");
  });

  it("symmetrical small joints + morning stiffness >30 min → inflammatory/RA", () => {
    const c: MskExam = {
      symmetry: "symmetrical",
      jointSize: "small_joints",
      morningStiffness: "over_30min",
    };
    expect(matchMskPatterns(c).map((p) => p.key)).toContain("inflammatory_ra");
  });

  it("bony swelling + worse with use + brief stiffness → osteoarthritis", () => {
    const c: MskExam = {
      worseWithUse: true,
      morningStiffness: "brief",
      regions: [{ id: "1", region: "hand_wrist", side: "right", look: ["Heberden's nodes (DIP)"] }],
    };
    expect(matchMskPatterns(c).map((p) => p.key)).toContain("osteoarthritis");
  });

  it("dactylitis broadens → psoriatic AND sickle-cell (Uganda)", () => {
    const c: MskExam = {
      regions: [{ id: "1", region: "hand_wrist", side: "right", look: ["dactylitis"] }],
    };
    const keys = matchMskPatterns(c).map((p) => p.key);
    expect(keys).toContain("psoriatic");
    expect(keys).toContain("sickle_cell");
  });

  it("migratory + preceding sore throat → rheumatic fever (must-not-miss)", () => {
    const out = matchMskPatterns({ migratory: true, precedingSoreThroat: true });
    expect(out.find((p) => p.key === "rheumatic_fever")?.mustNotMiss).toBe(true);
  });

  it("Schober's restricted → spondyloarthropathy", () => {
    const c: MskExam = {
      regions: [
        {
          id: "1",
          region: "spine",
          side: "bilateral",
          specialTests: { "Schober's restricted": "positive" },
        },
      ],
    };
    expect(matchMskPatterns(c).map((p) => p.key)).toContain("spondyloarthropathy");
  });

  it("cauda-equina back flags → cauda equina (emergency; reuses neuro options)", () => {
    const out = matchMskPatterns({ backRedFlags: ["saddle anaesthesia"] });
    expect(out.find((p) => p.key === "cauda_equina")?.emergency).toBe(true);
  });

  it("cord back flags → cord compression (Pott's in signature)", () => {
    const out = matchMskPatterns({ backRedFlags: ["sensory level"] });
    expect(out.find((p) => p.key === "cord_compression")?.signature).toMatch(/Pott/);
  });

  it("night pain + weight loss → back red flags (must-not-miss; mechanical is exclusion)", () => {
    const out = matchMskPatterns({ backRedFlags: ["night pain", "weight loss"] });
    expect(out.find((p) => p.key === "back_red_flags")?.mustNotMiss).toBe(true);
  });

  it("pain out of proportion → compartment syndrome (emergency)", () => {
    const c: MskExam = {
      regions: [
        { id: "1", region: "knee", side: "right", feel: ["pain out of proportion (compartment)"] },
      ],
    };
    expect(matchMskPatterns(c).find((p) => p.key === "compartment_syndrome")?.emergency).toBe(true);
  });
});

describe("renderMskProse + reasoning tokens", () => {
  it("renders GALS + regional card + pattern characteriser + suggestion", () => {
    const c: MskExam = {
      gals: { qPainStiffness: true, gait: "antalgic", arms: "abnormal" },
      symmetry: "symmetrical",
      jointSize: "small_joints",
      morningStiffness: "over_30min",
      regions: [
        {
          id: "1",
          region: "hand_wrist",
          side: "bilateral",
          look: ["MCP/PIP swelling", "ulnar deviation"],
          feel: ["warmth", "boggy synovial thickening"],
          rom: "restricted_painful",
        },
      ],
    };
    const s = renderMskProse(c);
    expect(s).toMatch(/GALS: gait antalgic, arms abnormal/);
    expect(s).toMatch(/Hand \/ wrist/);
    expect(s).toMatch(/morning stiffness >30 min/);
    expect(s).toMatch(/Inflammatory arthritis/i);
    expect(mskReasoningTokens(c).positives.join(" ")).toMatch(/morning stiffness over 30 min/);
  });

  it("empty exam → empty string", () => {
    expect(renderMskProse({})).toBe("");
  });

  it("normal GALS reads as the valuable negative it is", () => {
    expect(renderMskProse(normalMskExam())).toMatch(/GALS screen normal/);
  });
});
