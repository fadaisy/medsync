import { describe, expect, it } from "vitest";

import { handoverTargets } from "@/app/nurse/resus/[episodeId]/_components/v2/close-out-sbar";
import { arrest, rosc } from "./fixtures";

const ARREST_THEN_ROSC = [arrest(20), rosc(10)];
const ADULT = handoverTargets(ARREST_THEN_ROSC, 40);
const hasAdultNumber = (t: string[]) =>
  t.some((x) => ADULT.includes(x) || /\d/.test(x.replace("D13", "")));

describe("Law 7 / D13 — the handover's post-ROSC targets are adult-only", () => {
  it("Law 7 / D13: a child with ROSC gets no adult target numbers in the handover", () => {
    const targets = handoverTargets(ARREST_THEN_ROSC, 4);
    expect(targets).toEqual(["adult targets not shown (child — D13)"]);
    expect(hasAdultNumber(targets)).toBe(false);
  });

  it("Law 7 / D13: age 15 is still a child", () => {
    expect(hasAdultNumber(handoverTargets(ARREST_THEN_ROSC, 15))).toBe(false);
  });

  it("PR-PIN-C: an adult with ROSC keeps the signed targets", () => {
    const targets = handoverTargets(ARREST_THEN_ROSC, 16);
    expect(targets.join(" ")).toContain("MAP ≥ 65 and SBP > 100");
    expect(handoverTargets(ARREST_THEN_ROSC, null)).toEqual(targets);
  });

  it("no ROSC → no targets, whatever the age", () => {
    expect(handoverTargets([arrest(5)], 40)).toEqual([]);
    expect(handoverTargets([arrest(5)], 4)).toEqual([]);
  });
});
