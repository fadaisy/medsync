/** Severity as a stage (D-REL-14): WHO 2024 anaemia, KDIGO CKD and AKI, CURB-65. Blank is never negative. */
import { describe, expect, it } from "vitest";

import { stageOf } from "@/lib/clerking/impression/stages";

const man = { ageYears: 40, sex: "male" as const, pregnant: false };
const woman = { ageYears: 30, sex: "female" as const, pregnant: false };

describe("stages", () => {
  it("anaemia by WHO 2024: band edges for men and non-pregnant women", () => {
    expect(stageOf("dx.anaemia", { ...man, hbGPerL: 62 })).toMatchObject({ code: "severe" });
    expect(stageOf("dx.anaemia", { ...man, hbGPerL: 80 })).toMatchObject({ code: "moderate" });
    expect(stageOf("dx.anaemia", { ...man, hbGPerL: 129 })).toMatchObject({ code: "mild" });
    expect(stageOf("dx.anaemia", { ...woman, hbGPerL: 119 })).toMatchObject({ code: "mild" });
    expect(stageOf("dx.anaemia", { ...woman, hbGPerL: 120 })).toMatchObject({ code: "none" });
  });

  it("anaemia in pregnancy by trimester; unknown pregnancy in a woman 12–50 gives no stage", () => {
    expect(
      stageOf("dx.anaemia", { ...woman, pregnant: true, gestationWeeks: 20, hbGPerL: 96 }),
    ).toMatchObject({ code: "mild" });
    expect(stageOf("dx.anaemia", { ...woman, pregnant: null, hbGPerL: 70 })).toEqual({
      scale: "Anaemia severity (WHO 2024)",
      insufficient: ["pregnancy status"],
    });
    expect(stageOf("dx.anaemia_unexplained", { ...man })).toMatchObject({
      insufficient: ["haemoglobin"],
    });
  });

  it("CKD by KDIGO, with or without albuminuria", () => {
    expect(stageOf("dx.ckd", { ...man, egfr: 38, acrMgPerMmol: 12 })).toMatchObject({
      code: "G3bA2",
    });
    expect(stageOf("dx.ckd", { ...man, egfr: 95 })).toMatchObject({ code: "G1" });
    expect(stageOf("dx.ckd", { ...man })).toMatchObject({ insufficient: ["eGFR"] });
  });

  it("AKI needs a baseline; no baseline means no stage", () => {
    expect(
      stageOf("dx.aki", { ...man, creatinineUmol: 240, baselineCreatinineUmol: 100 }),
    ).toMatchObject({
      code: "2",
    });
    expect(
      stageOf("dx.aki", { ...man, creatinineUmol: 400, baselineCreatinineUmol: 200 }),
    ).toMatchObject({
      code: "3",
    });
    expect(stageOf("dx.aki", { ...man, creatinineUmol: 240 })).toMatchObject({
      insufficient: ["baseline creatinine"],
    });
  });

  it("CURB-65, and CRB-65 when urea is missing; a missing item never scores 0", () => {
    const base = { ...man, ageYears: 70, confusion: true, rr: 32, sbp: 100, dbp: 70 };
    expect(stageOf("dx.pneumonia", { ...base, ureaMmol: 9 })).toMatchObject({
      code: "4",
      words: "CURB-65 4",
    });
    expect(stageOf("dx.pneumonia", base)).toMatchObject({
      code: "3",
      words: "CRB-65 3 (urea not recorded)",
    });
    expect(stageOf("dx.pneumonia", { ...base, confusion: null })).toMatchObject({
      insufficient: ["confusion"],
    });
  });

  it("the BP grade is the hypertension pack's", () => {
    expect(stageOf("dx.hypertension", { ...man, sbp: 170, dbp: 100 })).toBeNull();
  });
});
