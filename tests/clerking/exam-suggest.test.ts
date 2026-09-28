import { describe, expect, it } from "vitest";

import { placeOfTarget, suggestions, targetDone } from "@/lib/clerking/exam/suggest";
import { complain, ecat, negative, positive, scenario, solve, toCtx } from "./exam-fixtures";

/** Every suggestion rule, with its chips and done states (§5.12, D-EX-18). */

describe("suggestion rules", () => {
  it("nothing in the history suggests nothing", () => {
    expect(suggestions(toCtx(scenario()))).toEqual([]);
  });

  it.each(ecat.data.suggestion_rules.rules.map((r) => [r.id, r] as const))(
    "%s suggests its targets, with a reason",
    (_, rule) => {
      const s = scenario();
      expect(solve(rule.when, s)).toEqual([]);
      const before = JSON.stringify(s.exam);
      const chips = suggestions(toCtx(s));
      for (const t of rule.suggest) {
        const chip = chips.find((c) => c.target === t.target);
        expect(chip, `${rule.id} → ${t.target}`).toBeDefined();
        expect(chip!.ruleIds).toContain(rule.id);
        expect(chip!.reasons.join(" ")).not.toMatch(/[{}]/);
        expect(placeOfTarget(toCtx(s), t.target), `${t.target} opens somewhere`).not.toBeNull();
      }
      expect(JSON.stringify(s.exam)).toBe(before); // a suggestion never answers anything
    },
  );

  it("a chip is done when its target is recorded or marked not examined, and done chips sort last", () => {
    const s = scenario();
    complain(s, "sym.back_pain", { night_pain: "yes", weight_loss: "yes" });
    let chips = suggestions(toCtx(s));
    const saddle = chips.find((c) => c.target === "ex.nervous.saddle_sensation")!;
    expect(saddle.done).toBe(false);
    expect(saddle.urgent).toBe(true);
    expect(saddle.reasons[0]).toBe("Back pain with pain at night or at rest, weight loss");
    negative(s, "ex.nervous.saddle_sensation");
    chips = suggestions(toCtx(s));
    expect(chips.find((c) => c.target === "ex.nervous.saddle_sensation")!.done).toBe(true);
    expect(chips.at(-1)!.done).toBe(true);
    // A part target is done when any item of the part (or its block) is recorded.
    expect(targetDone(toCtx(s), "ex.spine_joints/feel")).toBe(false);
    positive(s, "ex.spine_joints.spinal_tenderness", { levels: ["l3"] });
    expect(targetDone(toCtx(s), "ex.spine_joints/feel")).toBe(true);
    // Not examined counts as done.
    s.exam = { ...s.exam, systems: { rectal_genital: { notExamined: { id: "declined" } } } };
    expect(targetDone(toCtx(s), "ex.rectal_genital.anal_tone")).toBe(true); // its system was marked
    expect(targetDone(toCtx(s), "ex.rectal_genital")).toBe(true);
  });
});
