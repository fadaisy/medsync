import rules from "@clinical-rules/patient-thresholds.v0.json";

import { DIARY, DIARY_SLOTS, diaryClass } from "@/data/trends";

/** Each diary cell against the thresholds file, written out the long way. */
function expected(v: number | null, max: number) {
  if (v === null) return "none";
  if (v < rules.sugar.dangerLowBelow) return "low";
  if (v >= rules.sugar.dangerHighAtLeast) return "veryHigh";
  return v > max ? "high" : "in";
}

describe("sugar diary", () => {
  it("classifies every fixture cell against its slot's target", () => {
    DIARY.forEach((row) =>
      row.forEach((v, j) => {
        const slot = DIARY_SLOTS[j];
        expect(diaryClass(v, slot.ctx)).toBe(expected(v, rules.sugar.targetMaxByContext[slot.ctx]));
      }),
    );
  });

  it.each(DIARY_SLOTS.map((s) => [s.head, s.ctx] as const))("%s: edges of the target", (_, ctx) => {
    const max = rules.sugar.targetMaxByContext[ctx];
    expect(diaryClass(max, ctx)).toBe("in");
    expect(diaryClass(max + 0.1, ctx)).toBe("high");
    expect(diaryClass(rules.sugar.dangerLowBelow - 0.1, ctx)).toBe("low");
    expect(diaryClass(rules.sugar.dangerHighAtLeast, ctx)).toBe("veryHigh");
    expect(diaryClass(null, ctx)).toBe("none");
  });

  it("the fixture week shows each kind the legend names", () => {
    const seen = new Set(
      DIARY.flatMap((row) => row.map((v, j) => diaryClass(v, DIARY_SLOTS[j].ctx))),
    );
    expect([...seen].sort()).toEqual(["high", "in", "low", "none"]);
  });
});
