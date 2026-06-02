import type { StepProgress } from "@/lib/resus/engine";
import type { AbcdeLetter } from "@/lib/resus/types";
import { describe, expect, it } from "vitest";

import {
  deriveProgress,
  openLifeThreats,
  proceedGuard,
  reassessPromptFor,
  recommendedNextStep,
  stepStatus,
} from "@/lib/resus/engine";

/**
 * The ABCDE engine (GATE C) — pure sequence/life-threat discipline.
 * Enforces: open-life-threats tracking, treat-before-proceeding, and the
 * recommended next step. No I/O — operates on StepProgress derived from
 * the timeline.
 */

function progress(over: Partial<Record<AbcdeLetter, Partial<StepProgress>>> = {}): StepProgress[] {
  return (["A", "B", "C", "D", "E"] as AbcdeLetter[]).map((step) => ({
    step,
    assessed: false,
    dangerFlagged: false,
    actionTaken: false,
    ...over[step],
  }));
}

describe("stepStatus", () => {
  it("pending when not assessed", () => {
    expect(
      stepStatus({ step: "A", assessed: false, dangerFlagged: false, actionTaken: false }),
    ).toBe("pending");
  });
  it("clear when assessed with no danger", () => {
    expect(
      stepStatus({ step: "A", assessed: true, dangerFlagged: false, actionTaken: false }),
    ).toBe("clear");
  });
  it("open when a danger sign is flagged and no action taken", () => {
    expect(stepStatus({ step: "A", assessed: true, dangerFlagged: true, actionTaken: false })).toBe(
      "open",
    );
  });
  it("addressed when a danger sign is flagged and an action was taken", () => {
    expect(stepStatus({ step: "A", assessed: true, dangerFlagged: true, actionTaken: true })).toBe(
      "addressed",
    );
  });
});

describe("openLifeThreats", () => {
  it("lists only the letters with an open (flagged, unaddressed) life-threat", () => {
    const p = progress({
      A: { assessed: true, dangerFlagged: true, actionTaken: false }, // open
      B: { assessed: true, dangerFlagged: true, actionTaken: true }, // addressed
      C: { assessed: true, dangerFlagged: false }, // clear
    });
    expect(openLifeThreats(p)).toEqual(["A"]);
  });
});

describe("recommendedNextStep — treat-before-proceeding", () => {
  it("recommends A first when nothing assessed", () => {
    expect(recommendedNextStep(progress())).toBe("A");
  });
  it("returns to the earliest OPEN life-threat rather than advancing", () => {
    // A has an open life-threat; B/C assessed-clear. You must treat A.
    const p = progress({
      A: { assessed: true, dangerFlagged: true, actionTaken: false },
      B: { assessed: true, dangerFlagged: false },
      C: { assessed: true, dangerFlagged: false },
    });
    expect(recommendedNextStep(p)).toBe("A");
  });
  it("advances to the first pending step when earlier steps are clear/addressed", () => {
    const p = progress({
      A: { assessed: true, dangerFlagged: true, actionTaken: true }, // addressed
      B: { assessed: true, dangerFlagged: false }, // clear
    });
    expect(recommendedNextStep(p)).toBe("C");
  });
  it("returns null when the whole primary survey is clear/addressed", () => {
    const p = progress({
      A: { assessed: true },
      B: { assessed: true },
      C: { assessed: true },
      D: { assessed: true },
      E: { assessed: true },
    });
    expect(recommendedNextStep(p)).toBeNull();
  });
});

describe("proceedGuard — cannot silently move past an open life-threat", () => {
  it("blocks proceeding past a letter with an open life-threat", () => {
    const p = progress({ A: { assessed: true, dangerFlagged: true, actionTaken: false } });
    const guard = proceedGuard(p, "A");
    expect(guard.ok).toBe(false);
    expect(guard.warning).toMatch(/A/);
  });
  it("allows proceeding once the life-threat is addressed", () => {
    const p = progress({ A: { assessed: true, dangerFlagged: true, actionTaken: true } });
    expect(proceedGuard(p, "A").ok).toBe(true);
  });
  it("allows proceeding past a clear letter", () => {
    const p = progress({ A: { assessed: true, dangerFlagged: false } });
    expect(proceedGuard(p, "A").ok).toBe(true);
  });
});

describe("deriveProgress — reduce timeline events to per-step progress", () => {
  it("marks a step assessed + dangerFlagged from an assessment event with danger", () => {
    const p = deriveProgress([{ kind: "assessment", step: "B", payload: { danger: true } }]);
    const b = p.find((x) => x.step === "B")!;
    expect(b.assessed).toBe(true);
    expect(b.dangerFlagged).toBe(true);
    expect(b.actionTaken).toBe(false);
  });

  it("marks actionTaken from any action-class event for the step", () => {
    const p = deriveProgress([
      { kind: "assessment", step: "B", payload: { danger: true } },
      { kind: "drug", step: "B", payload: {} },
    ]);
    const b = p.find((x) => x.step === "B")!;
    expect(stepStatus(b)).toBe("addressed");
  });

  it("treats a vital event as having assessed the step (no danger by default)", () => {
    const p = deriveProgress([{ kind: "vital", step: "C", payload: {} }]);
    const c = p.find((x) => x.step === "C")!;
    expect(c.assessed).toBe(true);
    expect(c.dangerFlagged).toBe(false);
  });

  it("ignores events with no step (pre / arrest / notes)", () => {
    const p = deriveProgress([{ kind: "decision", step: "pre", payload: {} }]);
    expect(p.every((x) => !x.assessed)).toBe(true);
  });
});

describe("reassessPromptFor", () => {
  it("returns the catalog reassess text for a step", () => {
    expect(reassessPromptFor("A")).toMatch(/secure/i);
    expect(reassessPromptFor("C")).toMatch(/perfusion|bolus|lactate/i);
  });
});
