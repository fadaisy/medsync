import { describe, expect, it } from "vitest";

import { evaluateExamFlags, examRuleIsLive } from "@/lib/clerking/exam/flags";
import { ALL_SIGNED, ecat, scenario, solve, toCtx } from "./exam-fixtures";

/**
 * Every examination flag rule, both ways (PROMPT-CLERKING-EXAM-V2 §7 flags.ts, §14 "84 of 84";
 * 87 after GATE A SC1–SC2). The positive case is built by the solver from the rule's own `when`;
 * the negative case is the same scenario with its first atom left out (a near miss).
 */

const signoff = { ...ALL_SIGNED, withheld: [] as string[] };
const fired = (s: ReturnType<typeof scenario>) => evaluateExamFlags(toCtx(s), signoff).flags;

describe("examination flag rules", () => {
  it("an empty examination raises no flag", () => {
    expect(fired(scenario())).toEqual([]);
  });

  it.each(ecat.data.flag_rules.map((r) => [r.id, r] as const))(
    "%s fires, and not on a near miss",
    (_, rule) => {
      const pos = scenario();
      expect(solve(rule.when, pos)).toEqual([]);
      const hit = fired(pos).find((f) => f.ruleId === rule.id);
      expect(hit, `${rule.id} did not fire`).toBeDefined();
      expect(hit!.badge).not.toMatch(/[{}]|\s$|,\s*$|\(\s*\)/);
      expect(hit!.badge.length).toBeGreaterThan(2);
      expect(hit!.section).toBe("exam");
      expect(hit!.restricted).toBe(!!rule.restricted);

      // A near miss: some atom left out stops the rule (the first one that does).
      const misses = Array.from({ length: 8 }, (_, skip) => {
        const neg = scenario();
        solve(rule.when, neg, { skip });
        return fired(neg).some((f) => f.ruleId === rule.id);
      });
      expect(misses, `${rule.id}: no near miss stops it`).toContain(false);
    },
  );

  it("a rule whose reference is withheld does not fire (Law 7)", () => {
    const rule = ecat.data.flag_rules.find((r) => r.id === "FLAG-EX-GCS-AIRWAY")!;
    const s = scenario();
    solve(rule.when, s);
    const withheld = { ...signoff, withheld: ["REF-EX-GCS-AIRWAY"] };
    expect(examRuleIsLive(rule, withheld)).toBe(false);
    expect(evaluateExamFlags(toCtx(s), withheld).flags.map((f) => f.ruleId)).not.toContain(rule.id);
    expect(evaluateExamFlags(toCtx(s), { ...signoff, flagRules: [] }).flags).toEqual([]);
  });
});
