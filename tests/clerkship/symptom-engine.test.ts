import type { CapturedSymptom } from "@/lib/clerkship/symptom-engine";
import { describe, expect, it } from "vitest";

import { renderSymptomProse, symptomObservationRows } from "@/lib/clerkship/symptom-engine";

/**
 * Tap-first capture → BOTH readable prose AND queryable structured rows. Pure;
 * no fabrication (only what was tapped renders).
 */

const chestPain: CapturedSymptom = {
  symptomCode: "chest_pain",
  symptomDisplay: "Chest pain",
  properties: [
    {
      propertyCode: "character",
      propertyDisplay: "Character",
      valueType: "single_select",
      labels: ["Crushing"],
    },
    {
      propertyCode: "onset",
      propertyDisplay: "Onset",
      valueType: "single_select",
      labels: ["Sudden"],
    },
    {
      propertyCode: "duration",
      propertyDisplay: "Duration",
      valueType: "duration",
      durationValue: 2,
      durationUnit: "hours",
    },
    {
      propertyCode: "radiation",
      propertyDisplay: "Radiation",
      valueType: "multi_select",
      labels: ["Left arm", "Jaw"],
    },
    { propertyCode: "severity", propertyDisplay: "Severity", valueType: "scale", num: 8 },
    {
      propertyCode: "associated_symptoms",
      propertyDisplay: "Associated symptoms",
      valueType: "multi_select",
      labels: ["Sweating", "Nausea"],
    },
    {
      propertyCode: "exacerbating",
      propertyDisplay: "Exacerbating factors",
      valueType: "multi_select",
      labels: ["Exertion"],
    },
  ],
};

describe("renderSymptomProse", () => {
  it("composes a readable clinical sentence from the tapped properties", () => {
    const prose = renderSymptomProse([chestPain]);
    expect(prose).toContain("Crushing chest pain");
    expect(prose).toContain("sudden onset");
    expect(prose).toContain("2 hours");
    expect(prose).toContain("radiating to left arm, jaw");
    expect(prose).toContain("severity 8/10");
    expect(prose).toContain("associated with sweating, nausea");
    expect(prose).toContain("worse on exertion");
    expect(prose.endsWith(".")).toBe(true);
  });

  it("renders only what was tapped — empty in, empty out (no fabrication)", () => {
    expect(renderSymptomProse([])).toBe("");
    const bare: CapturedSymptom = {
      symptomCode: "cough",
      symptomDisplay: "Cough",
      properties: [],
    };
    expect(renderSymptomProse([bare])).toBe("Cough.");
  });

  it("renders booleans + the free-text note", () => {
    const cough: CapturedSymptom = {
      symptomCode: "cough",
      symptomDisplay: "Cough",
      properties: [
        {
          propertyCode: "productive",
          propertyDisplay: "Productive",
          valueType: "boolean",
          bool: true,
        },
        {
          propertyCode: "haemoptysis",
          propertyDisplay: "Blood in sputum",
          valueType: "boolean",
          bool: false,
        },
      ],
      note: "worse at night",
    };
    const prose = renderSymptomProse([cough]);
    expect(prose).toContain("productive");
    expect(prose).toContain("no blood in sputum");
    expect(prose).toContain("worse at night");
  });

  it("joins multiple symptoms into separate sentences", () => {
    const prose = renderSymptomProse([
      chestPain,
      { symptomCode: "fever", symptomDisplay: "Fever", properties: [] },
    ]);
    expect(prose).toContain("Chest pain".toLowerCase());
    expect(prose).toContain("Fever.");
  });
});

describe("symptomObservationRows — the queryable projection", () => {
  it("flattens to one row per property value + a presence row", () => {
    const rows = symptomObservationRows(chestPain);
    // presence row + a row per property
    expect(rows[0]).toMatchObject({ symptomCode: "chest_pain", propertyCode: null });
    expect(rows.find((r) => r.propertyCode === "severity")?.valueNum).toBe(8);
    expect(rows.find((r) => r.propertyCode === "radiation")?.valueText).toBe("Left arm, Jaw");
  });

  it("carries the ad-hoc flag", () => {
    const rows = symptomObservationRows({
      symptomCode: "adhoc:night_sweats",
      symptomDisplay: "Night sweats",
      adHoc: true,
      properties: [],
    });
    expect(rows[0]).toMatchObject({ adHoc: true, symptomDisplay: "Night sweats" });
  });
});
