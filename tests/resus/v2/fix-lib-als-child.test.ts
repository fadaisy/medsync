import { describe, expect, it } from "vitest";

import { computeArrestState } from "@/lib/resus/als/engine";
import { terminationReview } from "@/lib/resus/als/termination";
import { ctxOf, min, proc, sec, started, surveyAction, vital } from "./als/fixtures";

/**
 * ALS-MOD-16 / Law 7: a child (< 16) gets clocks and logging only — the adult ETCO₂
 * PE-hint threshold (ALS-RC-09) and the 60–90 min post-thrombolysis clock (ALS-DRG-04)
 * never reach a child's console, modifiers or termination review. An adult keeps both.
 */

const events = [
  ...started(),
  proc(sec(20), "airway_ett", { ettTrace: "yes" }),
  vital(sec(30), { etco2: 1.2 }),
  surveyAction(min(1), "C", "c_thrombolysis"),
];
const CHILD = ctxOf({ ageYears: 10, weightKg: 30 }, { localAnaestheticToxicity: true });
const ADULT = ctxOf({}, { localAnaestheticToxicity: true });
const state = (ctx: typeof CHILD) => computeArrestState(events, min(5), ctx);
/** A "kPa" reading or a "N min" / "N–M min" duration (the adult numbers at issue). */
const ADULT_NUMBER = /\d\s*kPa|\d+(–\d+)?\s*min\b|> 1 h/;

describe("ALS-MOD-16: no adult ETCO₂ or thrombolysis number for a child", () => {
  it("ALS-MOD-16: a child's causes and modifiers carry no kPa or minute numbers", () => {
    const s = state(CHILD);
    expect(s.paediatric).toBe(true);
    const texts = [
      ...s.causes.flatMap((c) => c.evidence.map((e) => e.label)),
      ...s.modifiers.map((m) => m.label),
    ];
    for (const t of texts) expect(t).not.toMatch(ADULT_NUMBER);
    expect(s.modifiers.find((m) => m.id === "pe_lysis")?.label).toBe(
      "PE thrombolysis recorded — prolonged resuscitation (weight-based — PLS module not built)",
    );
  });

  it("ALS-RC-09: a child's Thrombosis tile has no ETCO₂ PE hint; an adult's has it", () => {
    const hint = (ctx: typeof CHILD) =>
      state(ctx)
        .causes.find((c) => c.key === "thrombosis")!
        .evidence.some((e) => /PE hint/.test(e.label));
    expect(hint(CHILD)).toBe(false);
    expect(hint(ADULT)).toBe(true);
  });

  it("ALS-DRG-04: the child's thrombolysis prompt keeps its clock but not the 60–90 min advice", () => {
    const text = (ctx: typeof CHILD) =>
      state(ctx).prompts.find((p) => p.ruleId === "ALS-DRG-04")!.text;
    expect(text(CHILD)).toMatch(/^PE thrombolysis 4 min ago — prolonged resuscitation/);
    expect(text(CHILD)).not.toContain("60–90");
    expect(text(ADULT)).toContain("60–90 min");
    expect(state(ADULT).modifiers.find((m) => m.id === "pe_lysis")?.label).toContain("60–90 min");
  });

  it("ALS-TOR-07: a child's reasons to continue name no 60–90 min or > 1 h", () => {
    const flags = (ctx: typeof CHILD) =>
      terminationReview(events, state(ctx), ctx, min(5)).continueFlags;
    const child = flags(CHILD);
    expect(child.map((f) => f.id)).toEqual(expect.arrayContaining(["pe_lysis", "toxins"]));
    for (const f of child)
      expect(f.text.replace(/^PE thrombolysis \d+ min ago/, "")).not.toMatch(ADULT_NUMBER);
    const adult = flags(ADULT)
      .map((f) => f.text)
      .join(" ");
    expect(adult).toContain("60–90 min");
    expect(adult).toContain("(> 1 h)");
  });
});
