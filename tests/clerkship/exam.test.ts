import type { ExamObservation } from "@/lib/clerkship/exam/types";
import { describe, expect, it } from "vitest";

import { EXAM_FINDINGS } from "@/lib/clerkship/exam/catalog";
import {
  examReasoningTokens,
  normalGeneralExam,
  renderExamProse,
} from "@/lib/clerkship/exam/engine";

const obs: ExamObservation[] = [
  {
    code: "wellbeing",
    group: "inspection",
    display: "General wellbeing",
    state: "present",
    values: ["well"],
  },
  { code: "nails", group: "hands", display: "Nails", state: "present", values: ["clubbing"] },
  {
    code: "eyes",
    group: "face_eyes_mouth",
    display: "Eyes",
    state: "present",
    values: ["conjunctival pallor"],
  },
  { code: "jvp", group: "neck", display: "JVP", state: "present", values: ["not raised"] },
  { code: "legs", group: "peripheral", display: "Legs", state: "absent" },
  { code: "mouth", group: "face_eyes_mouth", display: "Mouth", state: "not_examined" },
];

describe("the exam catalog", () => {
  it("has spot-diagnosis patterns + must-not-miss signs", () => {
    expect(EXAM_FINDINGS.some((x) => x.pattern)).toBe(true);
    expect(EXAM_FINDINGS.some((x) => x.mustNotMiss)).toBe(true);
    // every finding belongs to a known group + has a kind
    for (const x of EXAM_FINDINGS) {
      expect(["select", "panel"]).toContain(x.kind);
      expect(x.group.length).toBeGreaterThan(0);
    }
  });
});

describe("renderExamProse — positives, normals, honest not-examined", () => {
  it("renders selects + present panels, and never implies not-examined = normal", () => {
    const s = renderExamProse(obs);
    expect(s).toContain("wellbeing well");
    expect(s).toContain("Nails: clubbing");
    expect(s).toContain("Eyes: conjunctival pallor");
    expect(s).toMatch(/Not examined:.*Mouth/);
    // 'legs' was examined-normal → must NOT be in not-examined
    expect(s).not.toMatch(/Not examined:.*Legs/);
  });
});

describe("examReasoningTokens — findings feed the differential", () => {
  it("present findings → positives; absent panels → negatives", () => {
    const t = examReasoningTokens(obs);
    expect(t.positives.join(" ")).toMatch(/clubbing/);
    expect(t.positives.join(" ")).toMatch(/conjunctival pallor/i);
    expect(t.negatives.join(" ")).toMatch(/legs/i);
    // not-examined contributes to neither
    expect(t.positives.join(" ")).not.toMatch(/mouth/i);
    expect(t.negatives.join(" ")).not.toMatch(/mouth/i);
  });
});

describe("normalGeneralExam fast path", () => {
  it("sets panels to absent (examined-normal), not not-examined", () => {
    const normal = normalGeneralExam();
    const panels = normal.filter((o) => o.state === "absent");
    expect(panels.length).toBeGreaterThan(5);
    expect(normal.some((o) => o.state === "not_examined")).toBe(false);
  });
});
