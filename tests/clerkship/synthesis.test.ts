import type { ExamObservation } from "@/lib/clerkship/exam/types";
import { describe, expect, it } from "vitest";

import {
  abnormalVitals,
  assembleAbnormal,
  proposeProblems,
  renderProblemRepresentation,
  significantFindings,
} from "@/lib/clerkship/synthesis";

const obs = (
  code: string,
  display: string,
  state: ExamObservation["state"],
  values?: string[],
): ExamObservation => ({ code, group: "g", display, state, values });

describe("significantFindings (problem-list eligibility filter, strict)", () => {
  it("excludes descriptive selects even with a non-normal value", () => {
    const out = significantFindings([
      obs("wellbeing", "General wellbeing", "present", ["unwell + distressed"]),
      obs("habitus", "Body habitus / nutrition", "present", ["obese"]),
      obs("consciousness", "Consciousness", "present", ["drowsy"]),
      obs("position", "Position / comfort", "present", ["sitting up"]),
      obs("distress", "Distress", "present", ["mild"]),
    ]);
    expect(out).toEqual([]);
  });

  it("excludes a select sitting on a normal value, and not-examined / absent", () => {
    expect(
      significantFindings([
        obs("peripheral_pulses", "Peripheral pulses", "present", ["present"]),
        obs("jvp", "JVP", "present", ["not raised"]),
        obs("nails", "Nails", "absent", []),
        obs("eyes", "Eyes", "not_examined", []),
      ]),
    ).toEqual([]);
  });

  it("keeps a pathological select, collapsing its value into ONE line", () => {
    const out = significantFindings([
      obs("peripheral_pulses", "Peripheral pulses", "present", ["absent"]),
      obs("oedema", "Peripheral oedema", "present", ["to knee"]),
    ]);
    expect(out).toContain("Peripheral pulses — absent");
    expect(out).toContain("Peripheral oedema — to knee");
    expect(out).toHaveLength(2);
  });

  it("keeps a positive panel as ONE line carrying all its values (never per-chip)", () => {
    const out = significantFindings([
      obs("nails", "Nails", "present", ["clubbing", "leuconychia"]),
    ]);
    expect(out).toEqual(["Nails — clubbing, leuconychia"]);
  });
});

describe("abnormalVitals (vitals-up assembly rule)", () => {
  it("returns nothing when no vitals are recorded", () => {
    expect(abnormalVitals({}, "who_esc")).toEqual([]);
  });

  it("flags a NEWS2-abnormal vital and not a normal one", () => {
    const items = abnormalVitals({ rr: 28, hr: 80 }, "who_esc");
    expect(items.some((i) => i.label.includes("RR 28"))).toBe(true);
    expect(items.some((i) => i.label.includes("HR 80"))).toBe(false);
  });

  it("flags low SpO2 as critical", () => {
    const items = abnormalVitals({ spo2: 88 }, "who_esc");
    const spo2 = items.find((i) => i.label.includes("SpO₂ 88"));
    expect(spo2).toBeDefined();
    expect(spo2!.severity).toBe("critical");
  });

  it("flags hypertension by the selected BP standard (not NEWS2)", () => {
    // 152/94: WHO/ESC grade 1; NEWS2 scores 0 for this systolic.
    const whoEsc = abnormalVitals({ sbp: 152, dbp: 94 }, "who_esc");
    const bp = whoEsc.find((i) => i.label.includes("BP 152/94"));
    expect(bp).toBeDefined();
    expect(bp!.detail).toMatch(/Grade 1/i);
    // ACC/AHA reads the same numbers as stage 2.
    const accAha = abnormalVitals({ sbp: 152, dbp: 94 }, "acc_aha");
    expect(accAha.find((i) => i.label.includes("BP"))!.detail).toMatch(/Stage 2/i);
  });

  it("does not flag a normal BP", () => {
    expect(abnormalVitals({ sbp: 118, dbp: 76 }, "who_esc")).toEqual([]);
  });

  it("flags abnormal glucose and a reduced GCS (critical at ≤8)", () => {
    const g = abnormalVitals({ glucose: 14.2 }, "who_esc");
    expect(g.some((i) => i.label.includes("Glucose 14.2"))).toBe(true);
    const gcs = abnormalVitals({ gcsE: 2, gcsV: 2, gcsM: 4 }, "who_esc");
    const item = gcs.find((i) => i.label.includes("GCS 8"));
    expect(item).toBeDefined();
    expect(item!.severity).toBe("critical");
  });
});

describe("assembleAbnormal (vitals-up order)", () => {
  const assembled = assembleAbnormal({
    vitals: { spo2: 88 },
    bpStandard: "who_esc",
    exam: [
      {
        system: "Respiratory",
        positives: ["stony dull percussion"],
        patterns: [{ label: "Pleural effusion", mustNotMiss: false }],
      },
    ],
    rosPositives: [{ symptomDisplay: "Night sweats", system: "constitutional" }],
    background: ["T2DM"],
  });

  it("orders vitals → examination → ros → background", () => {
    const sources = assembled.map((i) => i.source);
    const first = (s: string) => sources.indexOf(s as never);
    expect(first("vitals")).toBeLessThan(first("examination"));
    expect(first("examination")).toBeLessThan(first("ros"));
    expect(first("ros")).toBeLessThan(first("background"));
  });

  it("includes the exam cluster pattern with provenance", () => {
    const pattern = assembled.find((i) => i.label === "Pleural effusion");
    expect(pattern).toBeDefined();
    expect(pattern!.source).toBe("examination");
    expect(pattern!.detail).toMatch(/Respiratory/);
  });

  it("never fabricates — empty input assembles nothing", () => {
    expect(
      assembleAbnormal({
        vitals: {},
        bpStandard: "who_esc",
        exam: [],
        rosPositives: [],
        background: [],
      }),
    ).toEqual([]);
  });
});

describe("renderProblemRepresentation", () => {
  it("returns empty for no items", () => {
    expect(renderProblemRepresentation([])).toBe("");
  });

  it("narrates vitals-up as flowing prose", () => {
    const text = renderProblemRepresentation(
      assembleAbnormal({
        vitals: { spo2: 88 },
        bpStandard: "who_esc",
        exam: [{ system: "Respiratory", positives: ["stony dull percussion"], patterns: [] }],
        rosPositives: [{ symptomDisplay: "Night sweats", system: "constitutional" }],
        background: ["T2DM"],
      }),
    );
    expect(text).toContain("SpO₂ 88");
    expect(text).toContain("stony dull percussion");
    expect(text).toContain("night sweats");
    expect(text).toContain("T2DM");
    // vitals lead the representation
    expect(text.indexOf("SpO₂")).toBeLessThan(text.indexOf("stony dull"));
  });
});

describe("proposeProblems (vitals-first; doctor confirms)", () => {
  const items = assembleAbnormal({
    vitals: { spo2: 88 },
    bpStandard: "who_esc",
    exam: [
      {
        system: "Respiratory",
        positives: [],
        patterns: [{ label: "Pleural effusion", mustNotMiss: false }],
      },
    ],
    rosPositives: [],
    background: ["T2DM"],
  });

  it("orders vital problems first, then diagnoses, then findings, then background", () => {
    const proposed = proposeProblems(items, [{ text: "Community-acquired pneumonia" }]);
    const kinds = proposed.map((p) => p.kind);
    expect(kinds.indexOf("vital")).toBeLessThan(kinds.indexOf("diagnosis"));
    expect(kinds.indexOf("diagnosis")).toBeLessThan(kinds.indexOf("finding"));
    expect(kinds.indexOf("finding")).toBeLessThan(kinds.indexOf("background"));
  });

  it("each proposed item carries provenance", () => {
    const proposed = proposeProblems(items, []);
    expect(proposed.every((p) => p.provenance.length > 0)).toBe(true);
  });

  it("de-duplicates a finding already carried as a diagnosis", () => {
    const proposed = proposeProblems(items, [{ text: "Pleural effusion" }]);
    expect(proposed.filter((p) => p.item.toLowerCase() === "pleural effusion")).toHaveLength(1);
    expect(proposed.find((p) => p.item === "Pleural effusion")!.kind).toBe("diagnosis");
  });

  it("proposes nothing from nothing", () => {
    expect(proposeProblems([], [])).toEqual([]);
  });
});
