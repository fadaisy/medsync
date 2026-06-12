import type { CvsExam } from "@/lib/clerkship/exam/cardiovascular";
import { describe, expect, it } from "vitest";

import {
  cvsReasoningTokens,
  matchCvsPatterns,
  normalCvsExam,
  renderCvsProse,
} from "@/lib/clerkship/exam/cardiovascular";

describe("matchCvsPatterns — sign-cluster → lesion (decision-support)", () => {
  it("nothing recorded → no lesion (never auto-diagnoses)", () => {
    expect(matchCvsPatterns({})).toEqual([]);
  });

  it("a normal exam surfaces no lesion", () => {
    expect(matchCvsPatterns(normalCvsExam())).toEqual([]);
  });

  it("ejection systolic at aortic + carotid radiation + slow-rising pulse → aortic stenosis", () => {
    const c: CvsExam = {
      murmurs: [
        { id: "1", timing: "ejection_systolic", location: "aortic", radiation: "carotids" },
      ],
      pulseCharacter: "slow_rising",
      s2: "soft",
    };
    expect(matchCvsPatterns(c).map((p) => p.key)).toContain("aortic_stenosis");
  });

  it("pansystolic at apex radiating to axilla → mitral regurgitation", () => {
    const c: CvsExam = {
      murmurs: [{ id: "1", timing: "pansystolic", location: "mitral", radiation: "axilla" }],
    };
    expect(matchCvsPatterns(c).map((p) => p.key)).toContain("mitral_regurgitation");
  });

  it("mid-diastolic apex + opening snap + tapping apex → mitral stenosis (rheumatic)", () => {
    const c: CvsExam = {
      murmurs: [{ id: "1", timing: "mid_diastolic", location: "mitral" }],
      addedSounds: ["opening snap"],
      apexCharacter: "tapping",
    };
    expect(matchCvsPatterns(c).map((p) => p.key)).toContain("mitral_stenosis");
  });

  it("early diastolic + collapsing pulse → aortic regurgitation", () => {
    const c: CvsExam = {
      murmurs: [{ id: "1", timing: "early_diastolic", location: "left_sternal_edge" }],
      pulseCharacter: "collapsing",
    };
    expect(matchCvsPatterns(c).map((p) => p.key)).toContain("aortic_regurgitation");
  });

  it("raised JVP + displaced apex + S3 → heart failure (must-not-miss)", () => {
    const c: CvsExam = { jvp: "raised", apexLocation: "displaced", addedSounds: ["S3"] };
    const out = matchCvsPatterns(c);
    expect(out.map((p) => p.key)).toContain("heart_failure");
    expect(out.find((p) => p.key === "heart_failure")?.mustNotMiss).toBe(true);
  });

  it("a murmur + endocarditis stigmata → infective endocarditis", () => {
    const c: CvsExam = {
      murmurs: [{ id: "1", timing: "pansystolic", location: "mitral" }],
      findings: [
        {
          code: "ie_signs",
          group: "cvs_peripheral",
          display: "Endocarditis stigmata",
          state: "present",
          values: ["splinter haemorrhages"],
        },
      ],
    };
    expect(matchCvsPatterns(c).map((p) => p.key)).toContain("infective_endocarditis");
  });

  it("raised JVP + muffled sounds + pulsus paradoxus → tamponade (emergency, ranked first)", () => {
    const c: CvsExam = { jvp: "raised", s1: "soft", s2: "soft", pulseCharacter: "paradoxus" };
    const out = matchCvsPatterns(c);
    expect(out.find((p) => p.key === "tamponade")?.emergency).toBe(true);
    expect(out[0]?.mustNotMiss).toBe(true);
  });

  it("AMBIGUOUS: a lone ejection-systolic murmur → broadens to ≥2 lesions", () => {
    const c: CvsExam = { murmurs: [{ id: "1", timing: "ejection_systolic", location: "aortic" }] };
    expect(matchCvsPatterns(c).length).toBeGreaterThanOrEqual(2);
  });
});

describe("renderCvsProse + reasoning tokens", () => {
  it("describes the murmur structurally + surfaces the lesion", () => {
    const c: CvsExam = {
      murmurs: [
        {
          id: "1",
          timing: "ejection_systolic",
          location: "aortic",
          radiation: "carotids",
          intensity: 3,
        },
      ],
      pulseCharacter: "slow_rising",
    };
    const s = renderCvsProse(c);
    expect(s).toMatch(/grade 3\/6/);
    expect(s).toMatch(/aortic stenosis/i);
    expect(cvsReasoningTokens(c).positives.join(" ")).toMatch(/aortic stenosis/i);
  });

  it("empty exam → empty string", () => {
    expect(renderCvsProse({})).toBe("");
  });
});

describe("finding qualifiers — magnitude/location detail", () => {
  it("raised JVP carries its height (cm above sternal angle)", () => {
    const s = renderCvsProse({ jvp: "raised", jvpHeight: "7 cm" });
    expect(s).toMatch(/JVP raised \(7 cm\)/);
  });

  it("raised JVP without a height still reads (qualifier optional)", () => {
    expect(renderCvsProse({ jvp: "raised" })).toMatch(/JVP raised\./);
  });

  it("displaced apex carries interspace + line", () => {
    const s = renderCvsProse({
      apexLocation: "displaced",
      apexInterspace: "6th ICS",
      apexLine: "anterior axillary",
      apexCharacter: "thrusting",
    });
    expect(s).toMatch(/Apex displaced \(6th ICS, anterior axillary line\) thrusting/);
  });

  it("displaced apex without qualifiers reads as before", () => {
    expect(renderCvsProse({ apexLocation: "displaced" })).toMatch(/Apex displaced\./);
  });
});
