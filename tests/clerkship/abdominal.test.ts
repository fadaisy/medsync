import type { AbdoExam } from "@/lib/clerkship/exam/abdominal";
import { describe, expect, it } from "vitest";

import {
  abdoReasoningTokens,
  matchAbdoPatterns,
  normalAbdoExam,
  renderAbdoProse,
} from "@/lib/clerkship/exam/abdominal";

describe("matchAbdoPatterns — constellation → pattern (decision-support)", () => {
  it("nothing recorded → no pattern (never auto-diagnoses)", () => {
    expect(matchAbdoPatterns({})).toEqual([]);
  });

  it("a normal exam surfaces no pattern", () => {
    expect(matchAbdoPatterns(normalAbdoExam())).toEqual([]);
  });

  it("board-like rigidity → peritonitis (emergency, ranked first)", () => {
    const out = matchAbdoPatterns({ rigidity: "board_like", bowelSounds: "absent" });
    expect(out[0]?.key).toBe("peritonitis");
    expect(out[0]?.emergency).toBe(true);
  });

  it("involuntary guarding + rebound → peritonitis even without rigidity", () => {
    const c: AbdoExam = { guarding: { rif: "involuntary" }, rebound: true };
    expect(matchAbdoPatterns(c).map((p) => p.key)).toContain("peritonitis");
  });

  it("expansile pulsatile aorta → AAA emergency", () => {
    const out = matchAbdoPatterns({ aortaExpansile: true });
    expect(out.find((p) => p.key === "ruptured_aaa")?.emergency).toBe(true);
  });

  it("loss of liver dullness → perforation", () => {
    expect(matchAbdoPatterns({ liverDullnessLost: true }).map((p) => p.key)).toContain(
      "perforation",
    );
  });

  it("distension + tinkling bowel sounds → obstruction", () => {
    const c: AbdoExam = {
      bowelSounds: "tinkling",
      findings: [
        {
          code: "contour",
          group: "abdo_inspection",
          display: "Contour",
          state: "present",
          values: ["distended"],
        },
      ],
    };
    expect(matchAbdoPatterns(c).map((p) => p.key)).toContain("obstruction");
  });

  it("shifting dullness → ascites; + splenomegaly → portal hypertension too (broadens)", () => {
    const c: AbdoExam = { shiftingDullness: true, spleen: { palpable: true, extent: "4 cm" } };
    const keys = matchAbdoPatterns(c).map((p) => p.key);
    expect(keys).toContain("ascites");
    expect(keys).toContain("portal_htn");
  });

  it("≥2 liver stigmata → chronic liver disease", () => {
    const c: AbdoExam = {
      findings: [
        {
          code: "liver_stigmata",
          group: "abdo_peripheral",
          display: "Hands — liver stigmata",
          state: "present",
          values: ["palmar erythema", "leuconychia"],
        },
      ],
    };
    expect(matchAbdoPatterns(c).map((p) => p.key)).toContain("cld");
  });

  it("craggy liver → malignant-pattern hepatomegaly (must-not-miss, Uganda HCC)", () => {
    const out = matchAbdoPatterns({ liver: { palpable: true, surface: "craggy" } });
    const hit = out.find((p) => p.key === "hepatomegaly_malig");
    expect(hit?.mustNotMiss).toBe(true);
    expect(hit?.signature).toMatch(/HCC/);
  });

  it("massive spleen → Uganda differential list", () => {
    const out = matchAbdoPatterns({ spleen: { palpable: true, extent: "massive (to RIF)" } });
    expect(out.find((p) => p.key === "splenomegaly_massive")?.signature).toMatch(/schistosomiasis/);
  });

  it("lower-abdominal tenderness → β-hCG / ectopic check (must-not-miss prompt)", () => {
    const out = matchAbdoPatterns({ tenderness: { rif: "tender" } });
    expect(out.find((p) => p.key === "ectopic_check")?.mustNotMiss).toBe(true);
  });

  it("melaena on PR → GI-bleed shock check", () => {
    const out = matchAbdoPatterns({ pr: { state: "examined", findings: ["melaena"] } });
    expect(out.map((p) => p.key)).toContain("gi_bleed");
  });
});

describe("renderAbdoProse — regions, organs, PR honesty", () => {
  it("renders regions + structured liver + pattern", () => {
    const s = renderAbdoProse({
      tenderness: { ruq: "tender" },
      liver: { palpable: true, span: "4 cm", edge: "smooth", tender: true },
      bowelSounds: "normal",
      pr: { state: "examined", findings: [] },
    });
    expect(s).toMatch(/Tender RUQ/);
    expect(s).toMatch(/Liver palpable \(4 cm below the costal margin, smooth edge, tender\)/);
    expect(s).toMatch(/PR: no abnormality/);
  });

  it("PR omission is stated honestly whenever the exam has content", () => {
    expect(renderAbdoProse({ bowelSounds: "normal" })).toMatch(/PR: not examined/);
  });

  it("declined PR is recorded as declined", () => {
    expect(renderAbdoProse({ bowelSounds: "normal", pr: { state: "declined" } })).toMatch(
      /PR: offered, declined/,
    );
  });

  it("empty exam → empty string", () => {
    expect(renderAbdoProse({})).toBe("");
  });
});

describe("normalAbdoExam fast path — honesty", () => {
  it("PR stays NOT-examined (the fast path never claims an unperformed PR)", () => {
    expect(normalAbdoExam().pr?.state).toBe("not_examined");
  });
});

describe("abdoReasoningTokens — feeds the differential", () => {
  it("constellation + organ findings become positives", () => {
    const t = abdoReasoningTokens({
      shiftingDullness: true,
      spleen: { palpable: true },
      rigidity: "board_like",
    });
    expect(t.positives.join(" ")).toMatch(/ascites/);
    expect(t.positives.join(" ")).toMatch(/splenomegaly/);
    expect(t.positives.join(" ")).toMatch(/peritonism/i);
  });
});
