import type { RosObservation } from "@/lib/clerkship/ros";
import { describe, expect, it } from "vitest";

import { renderRosProse, rosObservationRows, rosProgress } from "@/lib/clerkship/ros";

/**
 * The ROS sweep → readable documentation + queryable rows incl. pertinent
 * NEGATIVES. Pure; not-asked is never represented (absence of a row).
 */
const ros: RosObservation[] = [
  {
    symptomCode: "chest_pain",
    symptomDisplay: "Chest pain",
    system: "cardiovascular",
    status: "present",
    properties: [
      { propertyCode: "severity", propertyDisplay: "Severity", valueType: "scale", num: 6 },
    ],
  },
  {
    symptomCode: "palpitations",
    symptomDisplay: "Palpitations",
    system: "cardiovascular",
    status: "denies",
  },
  {
    symptomCode: "orthopnoea",
    symptomDisplay: "Orthopnoea",
    system: "cardiovascular",
    status: "denies",
  },
  { symptomCode: "cough", symptomDisplay: "Cough", system: "respiratory", status: "denies" },
];

describe("renderRosProse", () => {
  it("groups by system — positives reported, negatives as pertinent denials", () => {
    const prose = renderRosProse(ros);
    expect(prose).toContain("Cardiovascular: reports chest pain (6/10)");
    expect(prose).toContain("denies palpitations, orthopnoea");
    expect(prose).toContain("Respiratory: denies cough.");
  });
  it("empty in → empty out", () => {
    expect(renderRosProse([])).toBe("");
  });
});

describe("rosProgress", () => {
  it("counts systems reviewed + positives", () => {
    expect(rosProgress(ros)).toMatchObject({ reviewed: 2, total: 12, positives: 1 });
  });
});

describe("rosObservationRows", () => {
  it("emits a status row per symptom (incl. denies) + property rows for positives", () => {
    const rows = rosObservationRows(ros);
    const deniesRow = rows.find((r) => r.symptomCode === "palpitations" && r.propertyCode === null);
    expect(deniesRow?.status).toBe("denies");
    const sevRow = rows.find(
      (r) => r.symptomCode === "chest_pain" && r.propertyCode === "severity",
    );
    expect(sevRow).toMatchObject({ status: "present", valueNum: 6 });
    // denies symptoms never emit property rows
    expect(rows.filter((r) => r.symptomCode === "cough")).toHaveLength(1);
  });
});
