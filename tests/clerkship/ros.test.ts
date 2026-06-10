import type { RosObservation } from "@/lib/clerkship/ros";
import { describe, expect, it } from "vitest";

import {
  renderRosNarrative,
  renderRosProse,
  renderRosSummary,
  rosCoverage,
  rosObservationRows,
  rosProgress,
} from "@/lib/clerkship/ros";

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

describe("renderRosNarrative", () => {
  it("reads as a flowing clinician sentence (reports … ; denies …)", () => {
    const s = renderRosNarrative(ros);
    expect(s).toBe(
      "On systems review, the patient reports chest pain (6/10); denies palpitations, orthopnoea and cough.",
    );
  });
  it("empty in → empty out", () => {
    expect(renderRosNarrative([])).toBe("");
  });
});

describe("rosProgress", () => {
  it("counts systems reviewed + positives", () => {
    expect(rosProgress(ros)).toMatchObject({ reviewed: 2, total: 12, positives: 1 });
  });
});

describe("rosCoverage + renderRosSummary — PC-suppression + honesty", () => {
  const systems = ["cardiovascular", "respiratory", "gastrointestinal", "neurological"];
  it("PC system → HPC-covered; reviewed → findings/all-negative; rest → not-reviewed (never negative)", () => {
    const cover = rosCoverage({ observations: ros, pcSystems: ["cardiovascular"], systems });
    expect(cover.cardiovascular).toBe("hpc"); // owned by the complaint
    expect(cover.respiratory).toBe("all_negative"); // cough denied
    expect(cover.gastrointestinal).toBe("not_reviewed"); // untouched ≠ negative
    expect(cover.neurological).toBe("not_reviewed");
  });
  it("findings when a reviewed system has a positive", () => {
    const cover = rosCoverage({
      observations: [
        { symptomCode: "x", symptomDisplay: "X", system: "gastrointestinal", status: "present" },
      ],
      pcSystems: [],
      systems,
    });
    expect(cover.gastrointestinal).toBe("findings");
  });
  it("summary is honest: HPC line, findings, and not-reviewed (focused)", () => {
    const s = renderRosSummary({
      observations: ros,
      pcSystems: ["cardiovascular"],
      scope: { mode: "focused", reviewedSystems: ["respiratory"] },
      systems,
    });
    expect(s).toContain("Cardiovascular: see History of Presenting Complaint.");
    expect(s).toContain("Respiratory: denies cough.");
    expect(s).toContain("Not reviewed: Gastrointestinal, Neurological (focused assessment).");
    // a not-reviewed system is never rendered as negative/normal
    expect(s).not.toMatch(/Gastrointestinal:.*denies/);
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
